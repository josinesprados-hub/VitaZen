'use client';

import { Check } from 'lucide-react';

// ─────────────────────────────────────────
// HabitCompleteButton — N-8 accessibility
// ─────────────────────────────────────────
// Extracted from the disciplina page so the completion control has a
// single, testable contract:
//  - always a native <button> (keyboard activatable by semantics)
//  - always has an accessible name that includes the habit name
//  - state is exposed via aria-pressed (toggle pattern), never color-only
//  - the Check icon is decorative (aria-hidden) so the name is not duplicated

interface HabitCompleteButtonProps {
  habitName: string;
  completed: boolean;
  /** Brief window after completion, used only for the pop animation */
  justCompleted?: boolean;
  onComplete: () => void;
}

export function HabitCompleteButton({
  habitName,
  completed,
  justCompleted = false,
  onComplete,
}: HabitCompleteButtonProps) {
  return (
    <button
      onClick={onComplete}
      aria-pressed={completed}
      aria-label={`Completar hábito: ${habitName}`}
      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all touch-press ${
        justCompleted ? 'check-pop' : ''
      } ${
        completed
          ? 'bg-champagne border-champagne scale-100'
          : 'border-[#333] hover:border-champagne hover:bg-champagne/10'
      }`}
    >
      <Check
        size={16}
        aria-hidden="true"
        className={completed ? 'text-black' : 'text-champagne'}
      />
    </button>
  );
}
