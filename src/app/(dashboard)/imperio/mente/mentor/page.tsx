'use client';

import MentorChat from '@/components/mentor/MentorChat';

export default function MenteMentorPage() {
  return (
    <div className="relative min-h-dvh sm:h-dvh -m-3 sm:-m-4 lg:-m-6 sm:flex sm:flex-col">
      <MentorChat backHref="/imperio/mente" headerIcon="brain" />
    </div>
  );
}
