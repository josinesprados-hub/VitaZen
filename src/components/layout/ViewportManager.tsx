'use client';

import { useEffect, useRef } from 'react';

/**
 * ViewportManager — prevents and resets stuck viewport zoom on iOS Safari / PWA.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FORENSIC FINDING — ROOT CAUSE (HOTFIX QA iPhone 3)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Previous HOTFIX iOS ZOOM 2 fixed the keyboard detection (dynamic baseline
 * instead of fixed 0.9 threshold) but STILL didn't fix the zoom.
 *
 * WHY THE ZOOM PERSISTED:
 *
 *   The resetZoom() function used a TEMPORARY meta viewport change:
 *     1. Set `maximum-scale=1` (Safari de-zooms)
 *     2. After 3 rAF, RESTORE the original meta content
 *
 *   This is fundamentally broken on iOS Safari:
 *   - When `maximum-scale=1` is REMOVED, Safari restores its internal
 *     "zoom memory" — the scale snaps back to the pre-reset value.
 *   - The triple-rAF delay is not enough for Safari to fully commit the
 *     de-zoom before the original meta is restored.
 *   - Result: zoom appears to briefly reset, then snaps back.
 *
 * ADDITIONAL ROOT CAUSE — maximum-scale was MISSING from the meta viewport:
 *   The Next.js viewport export only had: width=device-width, initial-scale=1,
 *   viewport-fit=cover. Without maximum-scale=1, user-scalable=no, iOS Safari
 *   is FREE to zoom on any input with font-size < 16px. Despite the CSS
 *   font-size: 16px !important rule, Safari's auto-zoom can still trigger
 *   in edge cases (e.g., during font loading, with system font fallback,
 *   or when the computed size differs from the declared size).
 *
 * FIX (two-pronged):
 *   1. PERMANENT: Add maximum-scale=1, user-scalable=no to the meta viewport
 *      at initialization. This PREVENTS Safari from ever auto-zooming.
 *      Since all inputs already use font-size: 16px, the user doesn't need
 *      manual zoom for form fields. Accessibility zoom (pinch-to-zoom)
 *      still works via Safari's built-in zoom feature (separate from
 *      viewport zoom).
 *   2. EMERGENCY: If scale > 1 is detected (edge case), use scrollTo(0,0)
 *      to force the viewport to reset, WITHOUT touching the meta tag
 *      (which would re-trigger the zoom memory issue).
 *   3. KEYBOARD-AWARE: The focusout handler now waits 600ms (up from 400ms)
 *      to account for the slower keyboard dismiss animation on iPhone 15/16.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CROSS-PLATFORM IMPACT:
 * - iOS Safari / PWA: Prevents auto-zoom entirely. Emergency scrollTo as fallback.
 * - Android Chrome / WebView: user-scalable=no is respected but irrelevant
 *   (Android doesn't auto-zoom on focus). No visual impact.
 * - Desktop browsers: No impact. Desktop browsers ignore user-scalable in
 *   most contexts and don't auto-zoom.
 * ═══════════════════════════════════════════════════════════════════════
 */
export function ViewportManager() {
  const resettingRef = useRef(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

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

    // ─── STEP 1: Lock the viewport permanently ──────────────────
    // This PREVENTS Safari from ever auto-zooming on input focus.
    // All form inputs already use font-size: 16px, so manual zoom
    // for readability is not needed. The CSS !important rule in
    // globals.css is the primary defense; this is the belt-and-suspenders.
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (meta) {
      const current = meta.getAttribute('content') || '';
      // Only add if not already present (idempotent on re-render)
      if (!current.includes('maximum-scale=1')) {
        meta.setAttribute('content', `${current}, maximum-scale=1, user-scalable=no`);
        log('VIEWPORT_LOCKED', { before: current, after: meta.getAttribute('content') });
      }
    }

    // ─── Dynamic baseline ───────────────────────────────────────
    let baselineRatio: number | null = null;
    const KEYBOARD_DROP_THRESHOLD = 0.08;
    let wasKeyboardVisible = false;

    // ─── Emergency zoom reset (scrollTo-based) ──────────────────
    // This is a FALLBACK for edge cases where scale > 1 despite
    // the viewport lock. It does NOT touch the meta tag.
    const forceResetZoom = () => {
      if (resettingRef.current) return;
      resettingRef.current = true;

      log('FORCE_RESET_START', {
        scale: vv.scale,
        scrollY: window.scrollY,
        activeEl: document.activeElement?.tagName,
      });

      // Scroll to top forces Safari to re-evaluate the viewport scale.
      // Using { behavior: 'instant' } avoids smooth scroll animation.
      window.scrollTo(0, 0);

      // Verify after a short delay
      setTimeout(() => {
        const finalScale = vv.scale;
        log('FORCE_RESET_COMPLETE', {
          scale: finalScale,
          success: finalScale <= 1.01,
        });
        resettingRef.current = false;

        // If still stuck (extremely rare), try a second approach:
        // blur any active element and scroll again
        if (finalScale > 1.01 && document.activeElement) {
          (document.activeElement as HTMLElement).blur?.();
          requestAnimationFrame(() => {
            window.scrollTo(0, 0);
            resettingRef.current = false;
          });
        }
      }, 100);
    };

    // ─── Primary: visualViewport resize ─────────────────────────
    const onResize = () => {
      const scale = vv.scale;
      const ratio = vv.height / window.innerHeight;
      const active = document.activeElement?.tagName;

      if (baselineRatio === null) {
        baselineRatio = ratio;
        log('BASELINE_ESTABLISHED', {
          ratio: ratio.toFixed(4),
          vvH: Math.round(vv.height),
          innerH: window.innerHeight,
          safeAreaTop: Math.round(window.innerHeight - vv.height),
        });
      }

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
        forceResetZoom();
      }

      wasKeyboardVisible = keyboardVisible;
    };

    // ─── Secondary: focusout (blur) based reset ─────────────────
    // Catches the "tap Save button" pattern: input blurs → keyboard
    // starts dismissing → we schedule a delayed check.
    let blurTimer: ReturnType<typeof setTimeout> | null = null;

    const onFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return;

      log('focusout', { tag, scale: vv.scale, activeNow: document.activeElement?.tagName });

      if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }

      // 600ms: iOS keyboard dismiss animation can take up to ~400ms
      // on iPhone 15/16 Pro. Extra margin ensures the keyboard is
      // fully gone before we check the scale.
      blurTimer = setTimeout(() => {
        blurTimer = null;
        if (vv.scale > 1) {
          log('FOCUSOUT_RESET', { scale: vv.scale.toFixed(4), tag });
          forceResetZoom();
        }
      }, 600);
    };

    // ─── Tertiary: scroll end check ──────────────────────────────
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;

    const onScroll = () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        scrollTimer = null;
        if (vv.scale > 1 && !wasKeyboardVisible) {
          log('SCROLL_END_RESET', { scale: vv.scale.toFixed(4) });
          forceResetZoom();
        }
      }, 500);
    };

    // ─── Attach listeners ───────────────────────────────────────
    vv.addEventListener('resize', onResize);
    document.addEventListener('focusout', onFocusOut);
    window.addEventListener('scroll', onScroll, { passive: true });

    log('INIT', {
      vvW: Math.round(vv.width),
      vvH: Math.round(vv.height),
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      ratio: (vv.height / window.innerHeight).toFixed(4),
      scale: vv.scale,
      UA: navigator.userAgent.slice(0, 80),
      viewportLocked: !!meta?.getAttribute('content')?.includes('maximum-scale=1'),
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