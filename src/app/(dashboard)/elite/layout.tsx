import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Élite',
};

export default function EliteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
