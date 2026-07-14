'use client';

import MentorChat from '@/components/mentor/MentorChat';

export default function MentorPage() {
  return (
    <div className="absolute inset-0 z-40 sm:relative sm:inset-auto sm:z-auto sm:h-dvh sm:-m-4 lg:-m-6 sm:flex sm:flex-col">
      <MentorChat backHref="/dashboard" headerIcon="sparkles" />
    </div>
  );
}
