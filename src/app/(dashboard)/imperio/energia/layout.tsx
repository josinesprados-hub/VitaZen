import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Energía',
};

export default function EnergiaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
