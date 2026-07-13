'use client';

import MentorChat from '@/components/mentor/MentorChat';

export default function MentorPage() {
  return (
    <div className="relative min-h-dvh sm:h-dvh -m-3 sm:-m-4 lg:-m-6 flex flex-col">
      <MentorChat backHref="/dashboard" headerIcon="sparkles" />
    </div>
  );
}
