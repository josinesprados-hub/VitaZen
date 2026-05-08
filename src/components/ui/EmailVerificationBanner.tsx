'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Mail, CheckCircle, Loader2, X, Send } from 'lucide-react';

/**
 * EmailVerificationBanner
 *
 * A soft, non-blocking banner shown in the dashboard layout when the user's
 * email is not yet verified. It can be dismissed per session (state only —
 * no localStorage persistence to keep it visible as a gentle reminder).
 */
export function EmailVerificationBanner() {
  const { user, firebaseUser, refreshUser } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);

  // Don't show if:
  // - user is verified
  // - user is not loaded
  // - Google-authenticated users are auto-verified by Firebase
  // - banner was dismissed this session
  if (!user || !firebaseUser) return null;
  if (user.emailVerified) return null;
  if (dismissed) return null;

  const handleSendVerification = async () => {
    if (sending || sent) return;

    setSending(true);
    setError('');

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
        // Firebase says verified — refresh user data
        await refreshUser();
        return;
      }

      if (!res.ok) {
        setError(data.error || 'Error al enviar');
        return;
      }

      setSent(true);
      // Reset sent state after 60 seconds so they can resend
      setTimeout(() => setSent(false), 60000);
    } catch {
      setError('Error de conexión');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-2 sm:mx-0 mb-3 bg-[#0a0a0a] border border-[#c8a55a]/15 rounded-xl px-4 py-3 flex items-center gap-3 group">
      <div className="w-8 h-8 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center flex-shrink-0">
        <Mail size={15} className="text-[#c8a55a]" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#ccc] font-medium">
          Verifica tu email
        </p>
        <p className="text-xs text-[#666] mt-0.5">
          {sent
            ? 'Enviado. Revisa tu bandeja de entrada.'
            : 'Confirma tu acceso para proteger tu cuenta.'
          }
        </p>
        {error && (
          <p className="text-xs text-red-400 mt-0.5">{error}</p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {sent ? (
          <span className="flex items-center gap-1.5 text-xs text-[#c8a55a]">
            <CheckCircle size={13} />
            <span className="hidden sm:inline">Enviado</span>
          </span>
        ) : (
          <button
            onClick={handleSendVerification}
            disabled={sending}
            className="flex items-center gap-1.5 text-xs text-[#c8a55a] hover:text-white transition-colors disabled:opacity-50"
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
