'use client';

import { useEffect, useState, useCallback } from 'react';

// ═══════════════════════════════════════════
// MicroReward — Elegant success moment
// ═══════════════════════════════════════════
//
// Premium micro-reward that shows briefly after
// completing an action. Subtle, calm, satisfying.
//
// Usage:
//   <MicroReward
//     trigger={justCompletedId !== null}
//     message="Hábito completado"
//   />
//
// Visual: soft gold glow + brief message, fades out

interface MicroRewardProps {
  trigger: boolean;
  message?: string;
  onComplete?: () => void;
}

export function MicroReward({ trigger, message, onComplete }: MicroRewardProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (trigger) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [trigger, onComplete]);

  if (!visible) return null;

  return (
    <div className="micro-reward-enter fixed bottom-20 sm:bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="bg-[#c8a55a]/10 border border-[#c8a55a]/25 rounded-xl px-4 py-2.5 backdrop-blur-sm micro-reward-glow">
        <p className="text-xs text-[#c8a55a] font-medium text-center whitespace-nowrap">
          {message || 'Completado'}
        </p>
      </div>
    </div>
  );
}

// ─── Hook: useSuccessFlash ────────────────────────
// Triggers a success flash on a ref element

export function useSuccessFlash() {
  const [flashKey, setFlashKey] = useState(0);

  const triggerFlash = useCallback(() => {
    setFlashKey(prev => prev + 1);
  }, []);

  return { flashKey, triggerFlash, flashClassName: flashKey > 0 ? 'success-flash' : '' };
}
