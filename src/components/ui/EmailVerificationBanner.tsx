'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { sendEmailVerification } from 'firebase/auth';
import { Mail, CheckCircle, Loader2, X, Send } from 'lucide-react';

/**
 * EmailVerificationBanner
 *
 * A soft, non-blocking banner shown in the dashboard layout when the user's
 * email is not yet verified. It can be dismissed per session (state only —
 * no localStorage persistence to keep it visible as a gentle reminder).
 *
 * Uses apiFetch for automatic token refresh on 401.
 * Falls back to Firebase client SDK if Admin SDK is unavailable.
 */
export function EmailVerificationBanner() {
  const { user, firebaseUser, refreshUser } = useAuth();
  const { apiFetch } = useApi();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  // Don't show if:
  // - user is verified
  // - user is not loaded
  // - banner was dismissed this session
  if (!user || !firebaseUser) return null;
  if (user.emailVerified) return null;
  if (dismissed) return null;

  const handleSendVerification = async () => {
    if (sending || sent) return;

    setSending(true);
    setError('');

    try {
      const res = await apiFetch('/api/auth/send-verification', {
        method: 'POST',
      });

      const data = await res.json();

      if (data.alreadyVerified) {
        // Firebase says verified — refresh user data
        await refreshUser();
        return;
      }

      if (data.useClientFallback) {
        // Firebase Admin couldn't generate a link — use Firebase client SDK directly
        try {
          await sendEmailVerification(firebaseUser, {
            url: `${window.location.origin}/verify-email?uid=${firebaseUser.uid}`,
          });
          setSent(true);
          timersRef.current.push(setTimeout(() => setSent(false), 60000));
        } catch (fbError: any) {
          console.error('[BANNER] Client-side sendEmailVerification failed:', fbError);
          if (fbError?.code === 'auth/too-many-requests') {
            setError('Demasiados intentos. Espera unos minutos.');
          } else {
            setError('No se pudo enviar. Inténtalo más tarde.');
          }
        }
        return;
      }

      if (!res.ok) {
        // Handle rate limit with friendly message
        if (res.status === 429) {
          setError(data.error || 'Espera un momento antes de reenviar.');
          // Auto-clear rate limit error after 60s
          timersRef.current.push(setTimeout(() => setError(''), 60000));
        } else {
          setError(data.error || 'Error al enviar');
        }
        return;
      }

      setSent(true);
      // Reset sent state after 60 seconds so they can resend
      timersRef.current.push(setTimeout(() => setSent(false), 60000));
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-2 sm:mx-0 mb-3 bg-[#0a0a0a] border border-champagne/15 rounded-xl px-4 py-3 flex items-center gap-3 group">
      <div className="w-8 h-8 rounded-lg bg-champagne/10 flex items-center justify-center flex-shrink-0">
        <Mail size={15} className="text-champagne" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#ccc] font-medium">
          Verifica tu email
        </p>
        <p className="text-xs text-[#666] mt-0.5">
          {sent
            ? 'Enviado. Revisa tu bandeja de entrada y spam.'
            : 'Confirma tu acceso para proteger tu cuenta.'
          }
        </p>
        {error && (
          <p className="text-xs text-red-400 mt-0.5">{error}</p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {sent ? (
          <span className="flex items-center gap-1.5 text-xs text-champagne">
            <CheckCircle size={13} />
            <span className="hidden sm:inline">Enviado</span>
          </span>
        ) : (
          <button
            onClick={handleSendVerification}
            disabled={sending}
            className="flex items-center gap-1.5 text-xs text-champagne hover:text-white transition-colors disabled:opacity-50"
          >
            {sending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Send size={13} />
            )}
            <span className="hidden sm:inline">{sending ? 'Enviando...' : 'Verificar'}</span>
          </button>
        )}
      </div>

      <button
        onClick={() => setDismissed(true)}
        className="text-[#444] hover:text-[#888] transition-colors ml-1 flex-shrink-0"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
