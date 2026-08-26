import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mentor',
};

export default function MentorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
