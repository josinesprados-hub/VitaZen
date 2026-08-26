import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Finanzas',
};

export default function FinanzasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
