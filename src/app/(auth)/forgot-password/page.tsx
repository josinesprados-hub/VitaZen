'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'No se pudo enviar el email de recuperación.');
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center px-4">
      <div className="w-full max-w-md auth-page-enter">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/images/v-gold-logo.png" alt="VitaZen" className="w-16 h-16 mx-auto mb-4 rounded-[20%]" />
          <h1 className="text-[#c8a55a] text-3xl font-bold tracking-widest">VITAZEN</h1>
        </div>

        {/* Form Card */}
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-8">
          <h2 className="text-xl font-semibold text-white mb-2">Recuperar tu contraseña</h2>
          <p className="text-[#999] text-sm mb-6">
            Introduce tu email y te enviaremos un enlace para restablecerla.
          </p>

          {error && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 mb-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-900/20 border border-green-800 rounded-lg p-3 mb-4">
              <p className="text-green-400 text-sm">
                Si el email existe en nuestro sistema, recibirás un enlace de recuperación.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-[#999] mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={success}
                className="w-full bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white placeholder-[#666] focus:border-[#c8a55a] transition-colors disabled:opacity-50"
                placeholder="tu@email.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading || success}
              className="w-full bg-[#c8a55a] text-[#000000] font-semibold py-3 rounded-lg hover:bg-[#d4b468] transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/login" className="text-[#c8a55a] hover:underline text-sm">
              Volver al inicio de sesión
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
