import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Disciplina',
};

export default function DisciplinaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
