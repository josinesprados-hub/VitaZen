import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Memoria',
};

export default function TimelineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
