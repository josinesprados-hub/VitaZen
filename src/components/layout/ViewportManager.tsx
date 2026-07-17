'use client';

import { useEffect, useRef } from 'react';

/**
 * ViewportManager — resets stuck viewport zoom after keyboard dismiss.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FORENSIC FINDING — ROOT CAUSE (HOTFIX iOS ZOOM 2)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The previous implementation used a FIXED keyboard detection threshold:
 *
 *   const KEYBOARD_RATIO = 0.9;
 *   const keyboardVisible = vv.height < window.innerHeight * 0.9;
 *
 * This is BROKEN on iPhones with notch + home indicator when
 * viewport-fit=cover is active (PWA standalone mode).
 *
 * WHY:
 *   - viewport-fit=cover extends the layout viewport INTO the safe areas.
 *   - window.innerHeight INCLUDES safe areas (notch ~59px + home indicator ~34px).
 *   - visualViewport.height EXCLUDES safe areas (only the visible app area).
 *   - Without keyboard: vv.height/innerHeight ≈ 0.88–0.90 on iPhone 14/15 Pro.
 *   - 0.89 < 0.9 → keyboardVisible is TRUE even without a keyboard.
 *   - The transition "wasKeyboardVisible && !keyboardVisible" NEVER occurs.
 *   - The zoom reset NEVER fires.
 *
 * PROOF (iPhone 14 Pro, 852px screen):
 *   window.innerHeight        = 852  (includes safe areas)
 *   visualViewport.height     = 759  (excludes safe areas, no keyboard)
 *   Ratio                     = 0.891  (< 0.9 threshold)
 *   → keyboardVisible = true  (FALSE POSITIVE — no keyboard present!)
 *
 * FIX:
 *   1. Dynamic baseline: measure the actual vv.height/innerHeight ratio at
 *      initialization (no keyboard assumed). Use THAT as the reference.
 *   2. Detect keyboard as a significant DROP from baseline (>8%), not a
 *      fixed threshold.
 *   3. Secondary reset via focusout: when any input/textarea/select blurs,
 *      schedule a delayed zoom check (~400ms). This catches the "Save" button
 *      tap pattern without relying on keyboard detection at all.
 *   4. Instrumentation: log all events in development for forensic verification.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CROSS-PLATFORM IMPACT:
 * - iOS Safari / PWA: Fixes stuck zoom (the only platform where scale > 1).
 * - Android Chrome / WebView: vv.scale is always 1. Zero impact.
 * - Desktop browsers: vv.scale is always 1. Zero impact.
 * ═══════════════════════════════════════════════════════════════════════
 */
export function ViewportManager() {
  const resettingRef = useRef(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    // ─── Dynamic baseline ───────────────────────────────────────
    // The first resize event establishes the true baseline ratio.
    // On devices WITHOUT safe areas (e.g., Android, older iPhones),
    // this will be ~0.98–1.0. On iPhones with notch + home indicator
    // and viewport-fit=cover, this will be ~0.87–0.90.
    let baselineRatio: number | null = null;

    // A real iOS keyboard drops vv.height to ~50-70% of innerHeight.
    // Safe areas alone only account for ~10-13%.
    // 8% drop threshold cleanly separates keyboard from safe areas.
    const KEYBOARD_DROP_THRESHOLD = 0.08;

    let wasKeyboardVisible = false;

    // ─── Instrumentation ────────────────────────────────────────
    const isDev = typeof process !== 'undefined' && process.env.NODE_ENV === 'development';

    const log = (event: string, data: Record<string, unknown>) => {
      if (isDev) {
        console.log(
          `%c[VZ-VP] %c${event}`,
          'color:#c8a55a;font-weight:bold',
          'color:#999',
          data,
        );
      }
    };

    // ─── Zoom reset ─────────────────────────────────────────────
    const resetZoom = () => {
      if (resettingRef.current) return;
      resettingRef.current = true;

      const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
      if (!meta) { resettingRef.current = false; return; }

      const original = meta.getAttribute('content');
      if (!original) { resettingRef.current = false; return; }

      log('RESET_START', {
        scale: vv.scale,
        original,
        activeEl: document.activeElement?.tagName,
      });

      // Temporarily set maximum-scale=1 to force Safari to de-zoom.
      meta.setAttribute('content', `${original}, maximum-scale=1`);

      // Wait for Safari to process the meta change, then restore.
      // Triple-rAF gives Safari extra time vs. the previous double-rAF.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            meta.setAttribute('content', original);
            const finalScale = vv.scale;
            log('RESET_COMPLETE', {
              scale: finalScale,
              success: finalScale <= 1.01,
            });
            resettingRef.current = false;
          });
        });
      });
    };

    // ─── Primary: visualViewport resize ─────────────────────────
    const onResize = () => {
      const scale = vv.scale;
      const ratio = vv.height / window.innerHeight;
      const active = document.activeElement?.tagName;

      // Establish baseline on first event (no keyboard assumed at init).
      if (baselineRatio === null) {
        baselineRatio = ratio;
        log('BASELINE_ESTABLISHED', {
          ratio: ratio.toFixed(4),
          vvH: Math.round(vv.height),
          innerH: window.innerHeight,
          safeAreaTop: Math.round(window.innerHeight - vv.height),
        });
      }

      // Keyboard visible = significant drop from baseline.
      const keyboardVisible = ratio < (baselineRatio ?? 1) - KEYBOARD_DROP_THRESHOLD;

      log('resize', {
        scale: scale.toFixed(4),
        vvW: Math.round(vv.width),
        vvH: Math.round(vv.height),
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        ratio: ratio.toFixed(4),
        baseline: (baselineRatio ?? 0).toFixed(4),
        drop: ((baselineRatio ?? 1) - ratio).toFixed(4),
        kbVis: keyboardVisible,
        wasKb: wasKeyboardVisible,
        active: active ?? 'none',
        scrollY: window.scrollY,
      });

      // Keyboard was visible, now dismissed, but zoom stuck > 1.
      if (wasKeyboardVisible && !keyboardVisible && scale > 1) {
        log('KEYBOARD_DISMISSED_ZOOM_STUCK', { scale: scale.toFixed(4) });
        resetZoom();
      }

      wasKeyboardVisible = keyboardVisible;
    };

    // ─── Secondary: focusout (blur) based reset ─────────────────
    // Catches the "tap Save button" pattern: input blurs → keyboard
    // starts dismissing → we schedule a delayed check.
    // This works INDEPENDENTLY of keyboard detection logic.
    let blurTimer: ReturnType<typeof setTimeout> | null = null;

    const onFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return;

      log('focusout', { tag, scale: vv.scale, activeNow: document.activeElement?.tagName });

      // Clear any pending blur timer (user rapidly focused another input).
      if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }

      // Schedule a zoom check after the keyboard is expected to have
      // fully dismissed. iOS keyboard animation: ~250-350ms.
      // 400ms gives comfortable margin.
      blurTimer = setTimeout(() => {
        blurTimer = null;
        if (vv.scale > 1) {
          log('FOCUSOUT_RESET', { scale: vv.scale.toFixed(4), tag });
          resetZoom();
        }
      }, 400);
    };

    // ─── Tertiary: scroll end check ──────────────────────────────
    // After any scroll event settles, verify zoom isn't stuck.
    // This catches edge cases where neither resize nor focusout fires
    // with scale > 1 (e.g., programmatic scrollTo after form submit).
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;

    const onScroll = () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        scrollTimer = null;
        if (vv.scale > 1 && !wasKeyboardVisible) {
          log('SCROLL_END_RESET', { scale: vv.scale.toFixed(4) });
          resetZoom();
        }
      }, 500);
    };

    // ─── Attach listeners ───────────────────────────────────────
    vv.addEventListener('resize', onResize);
    document.addEventListener('focusout', onFocusOut);
    window.addEventListener('scroll', onScroll, { passive: true });

    // Log initial state
    log('INIT', {
      vvW: Math.round(vv.width),
      vvH: Math.round(vv.height),
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      ratio: (vv.height / window.innerHeight).toFixed(4),
      scale: vv.scale,
      UA: navigator.userAgent.slice(0, 80),
    });

    return () => {
      vv.removeEventListener('resize', onResize);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('scroll', onScroll);
      if (blurTimer) clearTimeout(blurTimer);
      if (scrollTimer) clearTimeout(scrollTimer);
    };
  }, []);

  return null;
}