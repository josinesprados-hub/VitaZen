import { Suspense } from 'react';
import ResetPasswordClient from './ResetPasswordClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#000000] flex items-center justify-center px-4">
        <div className="text-[#999]">Cargando...</div>
      </div>
    }>
      <ResetPasswordClient />
    </Suspense>
  );
}
