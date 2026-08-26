import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cierre mensual',
};

export default function CierreMensualLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
