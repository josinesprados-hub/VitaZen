'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { Check, Crown, Loader2, Link2, Eye, Sparkles } from 'lucide-react';

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
      } else {
        alert('No se ha podido abrir el portal de gestión. Inténtalo de nuevo.');
      }
    } catch (error) {
      console.error('Portal error:', error);
      alert('No se ha podido conectar con el servicio de pagos. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Header — identity first, numbers later */}
      <div className="text-center mb-14">
        <p className="text-[#c8a55a] text-xs uppercase tracking-[0.2em] font-medium mb-4">VitaZen Élite</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4">
          La versión donde la app empieza a conectar partes de tu vida
        </h1>
        <p className="text-[#888] text-base max-w-lg mx-auto leading-relaxed">
          Free te ayuda a registrar. Élite te ayuda a entender las conexiones que hay entre lo que registras.
        </p>
      </div>

      {/* Two plans — calm, no aggressive comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* FREE Plan */}
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-7 sm:p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-[#1a1a1a] flex items-center justify-center">
              <Eye size={20} className="text-[#666]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Free</h2>
              <p className="text-[#666] text-xs">Consciencia básica</p>
            </div>
          </div>

          <div className="mb-6">
            <span className="text-3xl font-bold text-white">0€</span>
            <span className="text-[#666] text-sm">/mes</span>
          </div>

          <div className="space-y-3 mb-8">
            <p className="text-[#555] text-xs uppercase tracking-wider font-medium">Registro y observación simple</p>
            {[
              'Registro manual de hábitos y estados',
              'Mentor IA con mensajes diarios limitados',
              'Acceso a los 5 imperios',
              'Consejos básicos de cada imperio',
              'Check-in y seguimiento emocional',
              'Memoria de tu vida',
            ].map((feature) => (
              <div key={feature} className="flex items-start gap-3">
                <Check size={14} className="text-[#444] shrink-0 mt-0.5" />
                <p className="text-sm text-[#888]">{feature}</p>
              </div>
            ))}
          </div>

          <button
            disabled
            className="w-full py-3 rounded-xl border border-[#1a1a1a] text-[#555] font-medium text-sm cursor-not-allowed"
          >
            Plan actual
          </button>
        </div>

        {/* ÉLITE Plan */}
        <div className="bg-[#0a0a0a] border border-[#c8a55a]/20 rounded-2xl p-7 sm:p-8 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="bg-[#c8a55a] text-black text-[10px] font-bold px-4 py-1 rounded-full tracking-wider">
              PROFUNDIDAD
            </span>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-[#c8a55a]/10 flex items-center justify-center">
              <Crown size={20} className="text-[#c8a55a]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Élite</h2>
              <p className="text-[#c8a55a]/80 text-xs">Comprensión más profunda</p>
            </div>
          </div>

          <div className="mb-6">
            <span className="text-3xl font-bold text-[#c8a55a]">5€</span>
            <span className="text-[#999] text-sm">/mes</span>
          </div>

          <div className="space-y-3 mb-6">
            <p className="text-[#c8a55a]/50 text-xs uppercase tracking-wider font-medium">Todo lo de Free, y además</p>
            {[
              'Conexiones entre tus imperios',
              'Patrones de vida: observaciones personales',
              'Mentor IA sin límite diario',
              'Memoria contextual avanzada',
              'Historial completo de conversaciones',
              'Consejos exclusivos de cada imperio',
              'Recomendaciones del mentor completas',
              'Insights semanales en profundidad',
            ].map((feature) => (
              <div key={feature} className="flex items-start gap-3">
                <Check size={14} className="text-[#c8a55a] shrink-0 mt-0.5" />
                <p className="text-sm text-white/90">{feature}</p>
              </div>
            ))}
          </div>

          {user?.plan === 'PREMIUM' ? (
            <button
              onClick={handleManage}
              disabled={loading}
              className="w-full bg-[#c8a55a] text-black font-semibold py-3 rounded-xl hover:bg-[#d4b468] transition-colors disabled:opacity-50 text-sm"
            >
              {loading ? <Loader2 size={16} className="animate-spin inline" /> : 'Gestionar suscripción Élite'}
            </button>
          ) : (
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full bg-[#c8a55a] text-black font-semibold py-3 rounded-xl hover:bg-[#d4b468] transition-colors disabled:opacity-50 text-sm"
            >
              {loading ? <Loader2 size={16} className="animate-spin inline" /> : 'Entrar en Élite'}
            </button>
          )}
        </div>
      </div>

      {/* Human examples — what Élite actually feels like */}
      <div className="mt-12 mb-8">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <Link2 size={14} className="text-[#c8a55a]/50" />
          <p className="text-[#c8a55a]/50 text-xs uppercase tracking-widest font-medium">Así se siente Élite</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              text: 'Tus semanas con menos descanso coinciden con más gasto impulsivo.',
              empires: 'Energía · Finanzas',
            },
            {
              text: 'Cuando tus hábitos mentales se estabilizan, tu energía financiera cambia.',
              empires: 'Mente · Finanzas',
            },
            {
              text: 'Los periodos de más disciplina también son los de mejor descanso.',
              empires: 'Disciplina · Energía',
            },
          ].map((example, i) => (
            <div
              key={i}
              className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/15 transition-colors"
            >
              <p className="text-[#c8a55a]/70 text-sm italic leading-relaxed mb-3">
                &ldquo;{example.text}&rdquo;
              </p>
              <p className="text-[10px] text-[#333] tracking-wide">{example.empires}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Philosophy statement — calm, not salesy */}
      <div className="text-center mt-6 mb-2">
        <div className="max-w-md mx-auto">
          <Sparkles size={16} className="text-[#c8a55a]/30 mx-auto mb-3" />
          <p className="text-[#666] text-sm leading-relaxed">
            Free te ayuda. Élite empieza a entenderte.
          </p>
          <p className="text-[#444] text-xs mt-3">
            Cancela cuando quieras. Sin compromisos.
          </p>
        </div>
      </div>
    </div>
  );
}
