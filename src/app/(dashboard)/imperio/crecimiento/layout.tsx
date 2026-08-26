import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crecimiento',
};

export default function CrecimientoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
