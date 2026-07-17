'use client';

import { useEffect, useRef } from 'react';

/**
 * ViewportManager — prevents and resets stuck viewport zoom on iOS Safari / PWA.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FORENSIC FINDING — ROOT CAUSE (FASE 8)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * PREVIOUS FIXES (all insufficient):
 *   HOTFIX PWA 1: Dynamic meta viewport manipulation on focus/blur.
 *     → Failed: Safari restores "zoom memory" when maximum-scale is removed.
 *   HOTFIX iOS ZOOM 2: Dynamic baseline keyboard detection + scrollTo reset.
 *     → Failed: The meta viewport still lacked permanent maximum-scale=1.
 *   HOTFIX QA iPhone 3 (ViewportManager v3): Added maximum-scale=1 via
 *     JS mutation of the meta tag at runtime.
 *     → Failed: Next.js static viewport export overwrites the meta tag on
 *       navigation, re-rendering it WITHOUT maximum-scale. The JS mutation
 *       was being undone on every route change.
 *
 * DEFINITIVE ROOT CAUSE:
 *   The Next.js `viewport` export in layout.tsx only had:
 *     width=device-width, initial-scale=1, viewport-fit=cover
 *   Without `maximum-scale=1, user-scalable=no` in the STATIC export,
 *   Next.js renders a meta tag that ALLOWS zooming. No amount of runtime
 *   JS mutation can reliably persist because Next.js manages the <head>
 *   and may re-render the meta tag on navigation or hydration.
 *
 * DEFINITIVE FIX (FASE 8):
 *   1. Added `maximumScale: 1` and `userScalable: false` to the static
 *      viewport export in layout.tsx. This is the PRIMARY fix — it ensures
 *      the meta tag ALWAYS contains the no-zoom directive, regardless of
 *      hydration, navigation, or re-rendering.
 *   2. This component retains EMERGENCY fallback mechanisms (scrollTo reset)
 *      for edge cases where scale > 1 is detected despite the viewport lock.
 *   3. All form inputs already use font-size: 16px via globals.css.
 *   4. Accessibility pinch-to-zoom still works via Safari's built-in
 *      zoom feature (separate from viewport zoom).
 *
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

    // ─── BELT-AND-SUSPENDERS: Verify meta viewport has maximum-scale ──
    // The static export should handle this, but if anything overrides it,
    // we catch it here. This is a safety net, not the primary fix.
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (meta) {
      const current = meta.getAttribute('content') || '';
      if (!current.includes('maximum-scale=1')) {
        meta.setAttribute('content', `${current}, maximum-scale=1, user-scalable=no`);
        log('VIEWPORT_RELOCKED', { before: current, after: meta.getAttribute('content') });
      }
    }

    // ─── Dynamic baseline for keyboard detection ────────────────
    let baselineRatio: number | null = null;
    const KEYBOARD_DROP_THRESHOLD = 0.08;
    let wasKeyboardVisible = false;

    // ─── Emergency zoom reset (scrollTo-based) ──────────────────
    // FALLBACK for edge cases where scale > 1 despite the viewport lock.
    // Does NOT touch the meta tag (which would re-trigger zoom memory).
    const forceResetZoom = () => {
      if (resettingRef.current) return;
      resettingRef.current = true;

      log('FORCE_RESET_START', {
        scale: vv.scale,
        scrollY: window.scrollY,
        activeEl: document.activeElement?.tagName,
      });

      window.scrollTo(0, 0);

      setTimeout(() => {
        const finalScale = vv.scale;
        log('FORCE_RESET_COMPLETE', {
          scale: finalScale,
          success: finalScale <= 1.01,
        });
        resettingRef.current = false;

        // If still stuck, blur active element and scroll again
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
        kbVis: keyboardVisible,
        wasKb: wasKeyboardVisible,
        active: active ?? 'none',
        scrollY: window.scrollY,
      });

      // Keyboard dismissed, but zoom stuck > 1
      if (wasKeyboardVisible && !keyboardVisible && scale > 1) {
        log('KEYBOARD_DISMISSED_ZOOM_STUCK', { scale: scale.toFixed(4) });
        forceResetZoom();
      }

      wasKeyboardVisible = keyboardVisible;
    };

    // ─── Secondary: focusout (blur) based reset ─────────────────
    let blurTimer: ReturnType<typeof setTimeout> | null = null;

    const onFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return;

      log('focusout', { tag, scale: vv.scale, activeNow: document.activeElement?.tagName });

      if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }

      // 600ms: iOS keyboard dismiss animation can take up to ~400ms
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