import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Inicio',
};

export default function DashboardSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
