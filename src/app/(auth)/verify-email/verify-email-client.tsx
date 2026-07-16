'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { sendEmailVerification } from 'firebase/auth';
import { getAuthInstance } from '@/lib/firebase';
import { Mail, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function VerifyEmailClient() {
  const router = useRouter();
  const { firebaseUser, refreshUser } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'already' | 'resent'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const hasAttempted = useRef(false);

  useEffect(() => {
    // Wait for firebaseUser to be available — it may be null initially
    // while onAuthStateChanged is resolving
    if (!firebaseUser || hasAttempted.current) return;
    hasAttempted.current = true;

    const verifyEmail = async () => {
      try {
        // Force refresh the ID token to get latest emailVerified status
        await firebaseUser.getIdToken(true);
        // Reload the Firebase user to get fresh emailVerified
        await firebaseUser.reload();

        // Re-read the user after reload (auth.currentUser is the same object, but refreshed)
        if (getAuthInstance().currentUser?.emailVerified) {
          // Sync to our database
          const idToken = await getAuthInstance().currentUser!.getIdToken();
          const res = await fetch('/api/auth/verify-email', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${idToken}` },
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
            setErrorMessage('No se ha podido completar la verificación.');
          }
        } else {
          // Firebase says not verified — user may not have clicked the link yet
          setStatus('error');
          setErrorMessage('Tu email aún no está verificado. Haz clic en el enlace que enviamos a tu correo.');
        }
      } catch (error) {
        console.error('[VERIFY PAGE] Error:', error);
        setStatus('error');
        setErrorMessage('Error al verificar el email. Puedes reenviar el enlace.');
      }
    };

    verifyEmail();
  }, [firebaseUser, refreshUser]);

  // If firebaseUser is null for too long, redirect to login
  // (but give onAuthStateChanged time to resolve)
  useEffect(() => {
    if (firebaseUser) return; // already resolved

    const timeout = setTimeout(() => {
      // Only redirect if still no user after 5 seconds
      if (!firebaseUser) {
        router.replace('/login');
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [firebaseUser, router]);

  const handleResend = async () => {
    if (!firebaseUser || resendLoading) return;

    setResendLoading(true);
    setErrorMessage('');

    try {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
      });

      const data = await res.json();

      if (data.alreadyVerified) {
        setStatus('already');
        await refreshUser();
        return;
      }

      if (data.useClientFallback) {
        // Firebase Admin couldn't generate a link — use Firebase client SDK directly
        try {
          await sendEmailVerification(firebaseUser, {
            url: `${window.location.origin}/verify-email?uid=${firebaseUser.uid}`,
          });
          setStatus('resent');
        } catch (fbError: any) {
          console.error('[VERIFY] Client-side sendEmailVerification failed:', fbError);
          if (fbError?.code === 'auth/too-many-requests') {
            setErrorMessage('Demasiados intentos. Espera unos minutos.');
          } else {
            setErrorMessage('No se pudo enviar el email. Inténtalo más tarde.');
          }
        }
        return;
      }

      if (!res.ok) {
        setErrorMessage(data.error || 'Error al enviar el email.');
        return;
      }

      setStatus('resent');
    } catch {
      setErrorMessage('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center auth-page-enter">
        {/* Logo */}
        <div className="mb-10">
          <img src="/images/v-gold-logo.png" alt="VitaZen" className="w-14 h-14 mx-auto mb-4 opacity-90 rounded-[20%]" />
          <p className="text-champagne text-xs tracking-[8px] font-light">VITAZEN</p>
        </div>

        {status === 'loading' && (
          <div className="flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-champagne/10 flex items-center justify-center">
              <Loader2 size={28} className="text-champagne animate-spin" />
            </div>
            <div>
              <p className="text-white text-lg font-light">Verificando tu email</p>
              <p className="text-[#666] text-sm mt-2">Un momento...</p>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-champagne/10 flex items-center justify-center">
              <CheckCircle size={28} className="text-champagne" />
            </div>
            <div>
              <p className="text-white text-xl font-light">Email verificado</p>
              <p className="text-[#888] text-sm mt-2 leading-relaxed">
                Tu acceso está confirmado. Todo listo.
              </p>
            </div>
            <button
              onClick={() => router.replace('/dashboard')}
              className="mt-4 bg-champagne text-black font-semibold px-8 py-3 rounded-xl hover:bg-champagne-hover transition-all duration-200 active:scale-[0.97] text-sm tracking-wide"
            >
              Continuar
            </button>
          </div>
        )}

        {status === 'already' && (
          <div className="flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-champagne/10 flex items-center justify-center">
              <CheckCircle size={28} className="text-champagne" />
            </div>
            <div>
              <p className="text-white text-xl font-light">Ya estaba verificado</p>
              <p className="text-[#888] text-sm mt-2">Tu email ya estaba confirmado.</p>
            </div>
            <button
              onClick={() => router.replace('/dashboard')}
              className="mt-4 bg-champagne text-black font-semibold px-8 py-3 rounded-xl hover:bg-champagne-hover transition-all duration-200 active:scale-[0.97] text-sm tracking-wide"
            >
              Continuar
            </button>
          </div>
        )}

        {status === 'resent' && (
          <div className="flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-champagne/10 flex items-center justify-center">
              <Mail size={28} className="text-champagne" />
            </div>
            <div>
              <p className="text-white text-xl font-light">Email reenviado</p>
              <p className="text-[#888] text-sm mt-2 leading-relaxed">
                Revisa tu bandeja de entrada y haz clic en el enlace de verificación.
              </p>
              <p className="text-[#555] text-xs mt-3">Si no lo encuentras, revisa la carpeta de spam.</p>
            </div>
            <button
              onClick={async () => {
                // Check verification status again
                if (!firebaseUser) return;
                try {
                  await firebaseUser.reload();
                  if (getAuthInstance().currentUser?.emailVerified) {
                    const idToken = await getAuthInstance().currentUser!.getIdToken();
                    await fetch('/api/auth/verify-email', {
                      method: 'POST',
                      headers: { 'Authorization': `Bearer ${idToken}` },
                    });
                    setStatus('success');
                    await refreshUser();
                  } else {
                    setErrorMessage('Aún no verificado. Revisa tu email.');
                    setStatus('error');
                  }
                } catch {
                  setErrorMessage('Error al verificar. Inténtalo de nuevo.');
                  setStatus('error');
                }
              }}
              className="mt-2 text-champagne text-sm hover:underline"
            >
              Ya verifiqué mi email
            </button>
            <button
              onClick={() => router.replace('/dashboard')}
              className="text-[#666] text-sm hover:text-[#999] transition-colors"
            >
              Ir al dashboard
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
                onClick={handleResend}
                disabled={resendLoading}
                className="bg-champagne text-black font-semibold px-8 py-3 rounded-xl hover:bg-champagne-hover transition-all duration-200 active:scale-[0.97] text-sm tracking-wide disabled:opacity-50"
              >
                {resendLoading ? 'Enviando...' : 'Reenviar email de verificación'}
              </button>
              <button
                onClick={async () => {
                  // Let user manually check if they've verified in another tab
                  if (!firebaseUser) return;
                  try {
                    await firebaseUser.reload();
                    if (getAuthInstance().currentUser?.emailVerified) {
                      const idToken = await getAuthInstance().currentUser!.getIdToken();
                      await fetch('/api/auth/verify-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ idToken }),
                      });
                      setStatus('success');
                      await refreshUser();
                    } else {
                      setErrorMessage('Aún no verificado. Revisa tu email.');
                    }
                  } catch {
                    setErrorMessage('Error al verificar. Inténtalo de nuevo.');
                  }
                }}
                className="text-champagne text-sm hover:underline"
              >
                Ya verifiqué mi email
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
