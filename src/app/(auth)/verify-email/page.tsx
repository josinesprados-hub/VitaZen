'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Mail, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser, refreshUser } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'already'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      if (!firebaseUser) {
        // Not logged in — redirect to login
        router.replace('/login');
        return;
      }

      try {
        // Force refresh the ID token to get latest emailVerified status
        await firebaseUser.getIdToken(true);
        // Reload the Firebase user to get fresh emailVerified
        const { reload } = await import('firebase/auth');
        const { auth } = await import('@/lib/firebase');
        await reload(auth.currentUser!);

        // Check if the email is now verified in Firebase
        if (auth.currentUser?.emailVerified) {
          // Sync to our database
          const idToken = await auth.currentUser.getIdToken();
          const res = await fetch('/api/auth/verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.verified) {
              setStatus('success');
              await refreshUser();
            } else {
              setStatus('error');
              setErrorMessage('No se pudo confirmar la verificación. Inténtalo de nuevo.');
            }
          } else {
            setStatus('error');
            setErrorMessage('Error al sincronizar la verificación.');
          }
        } else {
          // Firebase says not verified — maybe the user hasn't clicked the link yet
          // or the link expired
          setStatus('error');
          setErrorMessage('El email aún no está verificado. El enlace puede haber expirado.');
        }
      } catch (error) {
        console.error('[VERIFY PAGE] Error:', error);
        setStatus('error');
        setErrorMessage('Error al verificar el email.');
      }
    };

    verifyEmail();
  }, [firebaseUser, router, refreshUser]);

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="mb-10">
          <img src="/images/vitazen-logo.png" alt="VitaZen" className="w-14 h-14 mx-auto mb-4 opacity-90" />
          <p className="text-[#c8a55a] text-xs tracking-[8px] font-light">VITAZEN</p>
        </div>

        {status === 'loading' && (
          <div className="flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-[#c8a55a]/10 flex items-center justify-center">
              <Loader2 size={28} className="text-[#c8a55a] animate-spin" />
            </div>
            <div>
              <p className="text-white text-lg font-light">Verificando tu email</p>
              <p className="text-[#666] text-sm mt-2">Un momento...</p>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-[#c8a55a]/10 flex items-center justify-center">
              <CheckCircle size={28} className="text-[#c8a55a]" />
            </div>
            <div>
              <p className="text-white text-xl font-light">Email verificado</p>
              <p className="text-[#888] text-sm mt-2 leading-relaxed">
                Tu acceso está confirmado. Todo listo.
              </p>
            </div>
            <button
              onClick={() => router.replace('/dashboard')}
              className="mt-4 bg-[#c8a55a] text-black font-semibold px-8 py-3 rounded-xl hover:bg-[#d4b468] transition-colors text-sm tracking-wide"
            >
              Continuar
            </button>
          </div>
        )}

        {status === 'already' && (
          <div className="flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-[#c8a55a]/10 flex items-center justify-center">
              <CheckCircle size={28} className="text-[#c8a55a]" />
            </div>
            <div>
              <p className="text-white text-xl font-light">Ya estaba verificado</p>
              <p className="text-[#888] text-sm mt-2">Tu email ya estaba confirmado.</p>
            </div>
            <button
              onClick={() => router.replace('/dashboard')}
              className="mt-4 bg-[#c8a55a] text-black font-semibold px-8 py-3 rounded-xl hover:bg-[#d4b468] transition-colors text-sm tracking-wide"
            >
              Continuar
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
              <AlertCircle size={28} className="text-red-400" />
            </div>
            <div>
              <p className="text-white text-xl font-light">No se pudo verificar</p>
              <p className="text-[#888] text-sm mt-2 leading-relaxed">{errorMessage}</p>
            </div>
            <div className="flex flex-col gap-3 mt-4 w-full">
              <button
                onClick={async () => {
                  if (!firebaseUser) return;
                  try {
                    const idToken = await firebaseUser.getIdToken();
                    await fetch('/api/auth/send-verification', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`,
                      },
                    });
                    setStatus('loading');
                    setErrorMessage('');
                  } catch {
                    setErrorMessage('Error al reenviar el email.');
                  }
                }}
                className="bg-[#c8a55a] text-black font-semibold px-8 py-3 rounded-xl hover:bg-[#d4b468] transition-colors text-sm tracking-wide"
              >
                Reenviar email de verificación
              </button>
              <button
                onClick={() => router.replace('/dashboard')}
                className="text-[#666] text-sm hover:text-[#999] transition-colors"
              >
                Ir al dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
