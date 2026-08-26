import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mente',
};

export default function MenteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
