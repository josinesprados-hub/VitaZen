import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Logros',
};

export default function LogrosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
