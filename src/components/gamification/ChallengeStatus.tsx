'use client';

// ─────────────────────────────────────────
// ChallengeStatus — N-8 accessibility
// ─────────────────────────────────────────
// Renders the daily-challenge completion state with an accessible
// announcement:
//  - visible badge (unchanged visuals) for sighted users
//  - exactly ONE sr-only role="status" live region so screen readers
//    announce the completion when the state changes (the badge itself
//    deliberately carries NO live role, avoiding duplicate announcements)

interface ChallengeStatusProps {
  completed: boolean;
  title?: string;
}

export function ChallengeStatus({ completed, title }: ChallengeStatusProps) {
  if (!completed) return null;

  return (
    <>
      <span className="text-xs px-2.5 py-1 rounded-full bg-champagne/15 text-champagne font-medium check-pop">
        Completado
      </span>
      <span role="status" className="sr-only">
        Desafío diario completado{title ? `: ${title}` : ''}
      </span>
    </>
  );
}
