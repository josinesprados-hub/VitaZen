'use client';

import { useEffect, useRef } from 'react';

/**
 * useDialogA11y — Reusable dialog accessibility hook.
 *
 * Encapsulates the proven pattern from CheckInModal:
 * - Escape key closes the dialog
 * - Tab / Shift+Tab focus trap inside the dialog
 * - Saves and restores focus to the previously focused element
 * - Moves focus to the first focusable element on open
 *
 * Usage:
 *   const dialogRef = useRef<HTMLDivElement>(null);
 *   useDialogA11y(dialogRef, isOpen, onClose);
 */
export function useDialogA11y(
  dialogRef: React.RefObject<HTMLDivElement | null>,
  isOpen: boolean,
  onClose: () => void,
) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save the element that had focus before the dialog opened
    previouslyFocused.current = document.activeElement as HTMLElement;

    // Move focus to the first focusable element inside the dialog
    const focusTimer = setTimeout(() => {
      if (!dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length > 0) focusable[0].focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Focus trap: Tab and Shift+Tab cycle within the dialog
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to the element that opened the dialog
      previouslyFocused.current?.focus();
    };
  }, [isOpen, onClose, dialogRef]);
}
