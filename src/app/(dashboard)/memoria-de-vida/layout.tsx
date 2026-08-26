import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tu evolución',
};

export default function MemoriaDeVidaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
