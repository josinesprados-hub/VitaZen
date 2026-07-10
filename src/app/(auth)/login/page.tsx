'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, getProviderMismatchMessage, checkEmailProvider } from '@/context/AuthContext';

const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
);

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [providerHint, setProviderHint] = useState<'google' | 'password' | null>(null);
  const [emailHint, setEmailHint] = useState<{ message: string; provider: 'google' | 'password' | 'unknown' | null } | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signInWithGoogle, user, firebaseUser, loading: authLoading } = useAuth();
  const router = useRouter();

  // Redirect already-authenticated users away from login.
  // Always send to /onboarding — it is the single gate that decides
  // whether to show questions or redirect to dashboard.
  useEffect(() => {
    if (!authLoading && (user || firebaseUser)) {
      router.replace('/onboarding');
    }
  }, [authLoading, user, firebaseUser, router]);

  // Proactive email provider check on blur.
  // Detects if the email belongs to a Google-only or password-only account
  // BEFORE the user submits, showing a subtle inline hint.
  const handleEmailBlur = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setEmailHint(null);
      return;
    }

    // Don't re-check if the hint is already showing for this email
    if (emailHint && emailHint.provider) return;

    setCheckingEmail(true);
    try {
      const result = await checkEmailProvider(trimmed);
      if (result.exists && result.provider && result.message) {
        setEmailHint({ message: result.message, provider: result.provider });
      } else {
        setEmailHint(null);
      }
    } catch {
      // Silently fail — never block the form
    } finally {
      setCheckingEmail(false);
    }
  }, [email, emailHint]);

  // Clear email hint when email changes
  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (emailHint) setEmailHint(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setProviderHint(null);
    setLoading(true);

    try {
      await signIn(email, password);
      router.replace('/onboarding');
    } catch (err: any) {
      // If invalid credentials, check if this email belongs to a Google-only account
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        try {
          const result = await getProviderMismatchMessage(email);
          if (result.provider) {
            setError(result.message);
            setProviderHint(result.provider);
            setLoading(false);
            return;
          }
        } catch {
          // Fall through to generic error
        }
        setError('Credenciales incorrectas. Verifica tu email y contraseña.');
      } else {
        setError('No se ha podido iniciar sesión. Inténtalo de nuevo.');
      }
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setProviderHint(null);
    setLoading(true);

    try {
      await signInWithGoogle();
      router.replace('/onboarding');
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setLoading(false);
        return;
      }
      if (err.code === 'auth/account-exists-with-different-credential') {
        const errEmail = err.customData?.email as string | undefined;
        if (errEmail) {
          const result = await getProviderMismatchMessage(errEmail);
          setError(result.message);
          setProviderHint(result.provider);
        } else {
          setError('Esta cuenta ya fue creada con correo y contraseña. Continúa usando ese método para acceder.');
          setProviderHint('password');
        }
        setLoading(false);
        return;
      }
      setError('No se ha podido iniciar sesión con Google. Inténtalo de nuevo.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#000000] flex items-center justify-center px-4">
      <div className="w-full max-w-md auth-page-enter">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/images/v-gold-logo.png" alt="VitaZen" className="w-16 h-16 mx-auto mb-4 rounded-[20%]" />
          <h1 className="text-champagne text-3xl font-bold tracking-widest">VITAZEN</h1>
          <p className="text-champagne/80 mt-3 text-base tracking-wide font-light italic">Muévete, desconecta y vive sin límites.</p>
        </div>

        {/* Form Card */}
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-8">
          <h2 className="text-xl font-semibold text-white mb-6">Acceder a tu cuenta</h2>

          {/* Provider mismatch error — after failed auth attempt */}
          {error && (
            <div className="bg-champagne/5 border border-champagne/20 rounded-lg p-4 mb-4">
              <p className="text-champagne text-sm leading-relaxed">{error}</p>
              {providerHint === 'google' && (
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="mt-3 w-full flex items-center justify-center gap-2 bg-champagne text-[#000000] font-semibold py-2.5 rounded-lg hover:bg-champagne-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  <GoogleIcon />
                  Continuar con Google
                </button>
              )}
              {providerHint === 'password' && (
                <button
                  type="button"
                  onClick={() => { setError(''); setProviderHint(null); }}
                  className="mt-3 w-full bg-champagne text-[#000000] font-semibold py-2.5 rounded-lg hover:bg-champagne-hover transition-colors text-sm"
                >
                  Usar correo y contraseña
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-[#999] mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                onBlur={handleEmailBlur}
                required
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white placeholder-[#666] focus:border-champagne transition-colors"
                placeholder="tu@email.com"
              />
              {/* Proactive inline hint — appears on email blur if provider mismatch detected */}
              {emailHint && emailHint.provider && (
                <div className="mt-2 flex items-start gap-2">
                  <svg className="w-4 h-4 text-champagne/60 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
                  </svg>
                  <p className="text-champagne/70 text-xs leading-relaxed">{emailHint.message}</p>
                  {emailHint.provider === 'google' && (
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      className="text-champagne text-xs underline underline-offset-2 hover:text-champagne/90 shrink-0"
                    >
                      Usar Google
                    </button>
                  )}
                </div>
              )}
              {checkingEmail && (
                <div className="mt-2 flex items-center gap-1.5">
                  <div className="w-3 h-3 border border-champagne/30 border-t-champagne/70 rounded-full animate-spin" />
                  <span className="text-[#666] text-xs">Verificando...</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm text-[#999] mb-2">Contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 pr-12 text-white placeholder-[#666] focus:border-champagne transition-colors"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-champagne hover:text-white transition-colors"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-champagne text-[#000000] font-semibold py-3 rounded-lg hover:bg-champagne-hover transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Accediendo...
                </span>
              ) : 'Iniciar sesión'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center my-6">
            <div className="flex-1 h-px bg-[#1a1a1a]"></div>
            <span className="px-4 text-[#666] text-sm">o</span>
            <div className="flex-1 h-px bg-[#1a1a1a]"></div>
          </div>

          {/* Google Login */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-transparent border border-champagne text-champagne font-semibold py-3 rounded-lg hover:bg-champagne/10 transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continuar con Google
          </button>

          <div className="mt-4 text-center">
            <Link href="/forgot-password" className="text-[#999] text-sm hover:text-champagne transition-colors">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          <div className="mt-4 text-center">
            <p className="text-[#999] text-sm">
              ¿Aún no tienes cuenta?{' '}
              <Link href="/register" className="text-champagne hover:underline">
                Crea tu cuenta
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
