'use client';

import { useEffect } from 'react';

/**
 * ViewportManager — resets stuck viewport zoom after keyboard dismiss.
 *
 * ROOT CAUSE: In Safari PWA standalone mode with viewport-fit=cover, auto-zoom
 * on input focus can leave the viewport scale > 1 after the keyboard dismisses.
 * Safari does NOT reliably reset the scale in this scenario.
 *
 * HOW IT WORKS:
 * 1. Listens for visualViewport resize events (W3C standard API).
 * 2. Tracks whether the on-screen keyboard is visible by comparing
 *    visualViewport.height to window.innerHeight. When the keyboard is
 *    visible, visualViewport.height shrinks by the keyboard height.
 * 3. When the keyboard transitions from visible → NOT visible AND the
 *    viewport scale is still > 1, Safari's zoom is stuck.
 * 4. To reset, we temporarily append maximum-scale=1 to the viewport meta
 *    tag. This signals Safari to reset its internal zoom state. After a
 *    double-rAF (ensuring Safari processed the change), we restore the
 *    original viewport content.
 *
 * CROSS-PLATFORM:
 * - iOS Safari / PWA: Fixes stuck zoom after keyboard dismiss.
 * - Android Chrome / WebView: visualViewport.scale is always 1 (Chrome
 *   resizes the layout viewport instead of zooming). The condition
 *   `scale > 1` is never true, so no code runs. Zero impact.
 * - Desktop browsers: visualViewport.scale is always 1. No impact.
 *
 * REFERENCES:
 * - W3C Visual Viewport API: https://wicg.github.io/visual-viewport/
 * - WebKit bug: https://bugs.webkit.org/show_bug.cgi?id=195646
 * - Apple guidance on input zoom: font-size >= 16px prevents trigger.
 */
export function ViewportManager() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    // Ratio below which the keyboard is considered visible.
    // When the iOS keyboard is shown, visualViewport.height drops to ~50-70%
    // of window.innerHeight. When dismissed, it returns to ~100%.
    // 0.9 provides a comfortable margin above any floating/minimized keyboard.
    const KEYBOARD_RATIO = 0.9;

    let wasKeyboardVisible = false;

    const onResize = () => {
      const keyboardVisible = vv.height < window.innerHeight * KEYBOARD_RATIO;

      // Only act when the keyboard was visible and is now dismissed,
      // but Safari's zoom scale is still stuck above 1.
      if (wasKeyboardVisible && !keyboardVisible && vv.scale > 1) {
        const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
        if (meta) {
          const original = meta.getAttribute('content');
          if (original) {
            // Temporarily constrain maximum-scale to force Safari to reset zoom
            meta.setAttribute('content', `${original}, maximum-scale=1`);
            // Double-rAF ensures Safari has processed the meta change
            // before we restore the original viewport configuration.
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                meta.setAttribute('content', original);
              });
            });
          }
        }
      }

      wasKeyboardVisible = keyboardVisible;
    };

    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  return null;
}