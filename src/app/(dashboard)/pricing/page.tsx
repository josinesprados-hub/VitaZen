'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { Check, Zap, Crown, Loader2 } from 'lucide-react';

export default function PricingPage() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/stripe/checkout', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        }
      } else {
        const data = await res.json();
        alert(data.error || 'No se ha podido procesar la suscripción. Inténtalo de nuevo.');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('No se ha podido conectar con el servicio de pagos. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleManage = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/stripe/portal', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        }
      }
    } catch (error) {
      console.error('Portal error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-white mb-3">Elige tu plan</h1>
        <p className="text-[#999] text-lg">Desbloquea todo el potencial de tu transformación personal</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* FREE Plan */}
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-[#1a1a1a] flex items-center justify-center">
              <Zap size={20} className="text-[#999]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Free</h2>
              <p className="text-[#999] text-sm">Para comenzar tu camino de crecimiento</p>
            </div>
          </div>

          <div className="mb-6">
            <span className="text-4xl font-bold text-white">0€</span>
            <span className="text-[#999]">/mes</span>
          </div>

          <ul className="space-y-3 mb-8">
            {[
              '10 mensajes IA diarios',
              'Mentor IA básico',
              'Acceso a los 5 imperios',
              'Consejos básicos',
              'Desafíos diarios',
              'Seguimiento de hábitos',
            ].map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-sm text-[#999]">
                <Check size={16} className="text-[#666] shrink-0" />
                {feature}
              </li>
            ))}
          </ul>

          <button
            disabled
            className="w-full py-3 rounded-lg border border-[#1a1a1a] text-[#666] font-semibold text-sm cursor-not-allowed"
          >
            Plan actual
          </button>
        </div>

        {/* PREMIUM Plan */}
        <div className="bg-[#0a0a0a] border border-[#c8a55a]/30 rounded-xl p-8 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="bg-[#c8a55a] text-black text-xs font-bold px-4 py-1 rounded-full">
              RECOMENDADO
            </span>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
              <Crown size={20} className="text-[#c8a55a]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Premium</h2>
              <p className="text-[#c8a55a] text-sm">Para una transformación real y duradera</p>
            </div>
          </div>

          <div className="mb-6">
            <span className="text-4xl font-bold text-[#c8a55a]">5€</span>
            <span className="text-[#999]">/mes</span>
          </div>

          <ul className="space-y-3 mb-8">
            {[
              'Mensajes IA ilimitados',
              'Mentor IA avanzado y profundo',
              'Acceso a los 5 imperios',
              'Consejos premium exclusivos',
              'Desafíos diarios',
              'Seguimiento completo',
              'Análisis y recomendaciones',
              'Contenido premium en cada imperio',
            ].map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-sm text-white">
                <Check size={16} className="text-[#c8a55a] shrink-0" />
                {feature}
              </li>
            ))}
          </ul>

          {user?.plan === 'PREMIUM' ? (
            <button
              onClick={handleManage}
              disabled={loading}
              className="w-full bg-[#c8a55a] text-black font-semibold py-3 rounded-lg hover:bg-[#d4b468] transition-colors disabled:opacity-50 text-sm"
            >
              {loading ? <Loader2 size={16} className="animate-spin inline" /> : 'Gestionar suscripción'}
            </button>
          ) : (
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full bg-[#c8a55a] text-black font-semibold py-3 rounded-lg hover:bg-[#d4b468] transition-colors disabled:opacity-50 text-sm"
            >
              {loading ? <Loader2 size={16} className="animate-spin inline" /> : 'Mejorar a Premium'}
            </button>
          )}
        </div>
      </div>

      <div className="text-center mt-8">
        <p className="text-[#666] text-sm">
          Cancela cuando quieras. Sin compromisos. Pago seguro con Stripe.
        </p>
      </div>
    </div>
  );
}
