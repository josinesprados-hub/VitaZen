'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { useApi } from '@/hooks/useApi';
import { useRouter } from 'next/navigation';
import {
  Circle,
  Eye,
  ArrowRight,
  Clock,
  Link2,
  Brain,
  Heart,
  Loader2,
  Sparkles,
} from 'lucide-react';

// ═══════════════════════════════════════════
// Página Élite
// ═══════════════════════════════════════════
//
// No es una página de pricing.
// No es un funnel de ventas.
// Es un espacio para entender qué cambia
// cuando te conectas más con el tiempo.
//
// El usuario debe:
// 1. Entender qué es Élite
// 2. Sentir el valor emocional
// 3. Solo entonces, decidir
//
// Tono: editorial, calmado, premium, humano.
// No: SaaS, urgencia, FOMO, comparativas técnicas.
// ═══════════════════════════════════════════

export default function ElitePage() {
  const { user } = useAuth();
  const { displayUser } = useScreenshotMode();
  const { apiFetch } = useApi();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const isPremium = displayUser?.plan === 'PREMIUM';

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/stripe/checkout', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.error === 'already_subscribed') {
          // User already has Élite — redirect to manage subscription
          const portalRes = await apiFetch('/api/stripe/portal', { method: 'POST' });
          if (portalRes.ok) {
            const portalData = await portalRes.json();
            if (portalData.url) {
              window.location.href = portalData.url;
              return;
            }
          }
          router.push('/ajustes');
        } else {
          // Generic failure — fallback to pricing
          router.push('/pricing');
        }
      }
    } catch {
      router.push('/pricing');
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
          return;
        }
      }
      router.push('/ajustes');
    } catch {
      router.push('/ajustes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 sm:py-12 px-4 sm:px-6">
      {/* ─── Header ─── */}
      <div className="text-center mb-14 sm:mb-20">
        {/* Élite brand mark — gold dot, quiet presence */}
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <Circle size={4} fill="currentColor" className="text-champagne/50" />
          <p className="text-champagne/60 text-[10px] uppercase tracking-[0.3em] font-semibold">
            VitaZen Élite
          </p>
        </div>

        <h1 className="text-2xl sm:text-4xl font-bold text-white mb-5 leading-tight">
          Un espacio más conectado<br className="hidden sm:block" /> con el tiempo
        </h1>

        <p className="text-[#777] text-base sm:text-lg max-w-lg mx-auto leading-relaxed">
          Más conexiones. Más tiempo. Más claridad.
        </p>
      </div>

      {/* ─── What changes with Élite ─── */}
      <div className="mb-14 sm:mb-20">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Circle size={3} className="text-champagne/25" fill="currentColor" />
          <p className="text-[#555] text-[10px] uppercase tracking-[0.2em] font-medium">
            Qué cambia con Élite
          </p>
        </div>

        <div className="space-y-5">
          {/* Depth 1: Time */}
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-6 sm:p-7">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-champagne/6 flex items-center justify-center shrink-0 mt-0.5">
                <Clock size={18} className="text-champagne/40" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-base mb-1.5">
                  Más tiempo, más memoria
                </h3>
                <p className="text-[#888] text-sm leading-relaxed">
                  VitaZen guarda tus conversaciones, tus reflexiones, tus patrones.
                  Con Élite, la memoria se acumula: cada semana conecta con la anterior,
                  cada mes muestra algo que no podías ver con días sueltos.
                </p>
              </div>
            </div>
          </div>

          {/* Depth 2: Connections */}
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-6 sm:p-7">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-champagne/6 flex items-center justify-center shrink-0 mt-0.5">
                <Link2 size={18} className="text-champagne/40" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-base mb-1.5">
                  Conexiones entre tus imperios
                </h3>
                <p className="text-[#888] text-sm leading-relaxed">
                  Tu mente afecta tu energía. Tu disciplina cambia tu relación con el dinero.
                  Tus hábitos de descanso influyen en tus decisiones financieras.
                  Élite te muestra estas conexiones entre imperios — relaciones que solo aparecen
                  cuando miras todo junto, no por separado.
                </p>
              </div>
            </div>
          </div>

          {/* Depth 3: Sensitivity */}
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-6 sm:p-7">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-champagne/6 flex items-center justify-center shrink-0 mt-0.5">
                <Brain size={18} className="text-champagne/40" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-base mb-1.5">
                  Mentor con más memoria
                </h3>
                <p className="text-[#888] text-sm leading-relaxed">
                  Sin límite diario. Más contexto en cada respuesta.
                  Con Élite, el mentor acumula lo que has vivido y reflexionado.
                  Cada conversación entiende más que la anterior.
                </p>
              </div>
            </div>
          </div>

          {/* Depth 4: Rhythm */}
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-6 sm:p-7">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-champagne/6 flex items-center justify-center shrink-0 mt-0.5">
                <Heart size={18} className="text-champagne/40" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-base mb-1.5">
                  Más contexto cada semana
                </h3>
                <p className="text-[#888] text-sm leading-relaxed">
                  Observaciones semanales con más detalle. Evolución acumulativa.
                  Cierres mensuales que conectan intenciones con acciones.
                  Con Élite, VitaZen entiende el ritmo de lo que estás viviendo.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── What depth feels like — real examples ─── */}
      <div className="mb-14 sm:mb-20">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Sparkles size={12} className="text-champagne/25" />
          <p className="text-[#555] text-[10px] uppercase tracking-[0.2em] font-medium">
            Ejemplos
          </p>
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
              className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5"
            >
              <p className="text-champagne/60 text-sm italic leading-relaxed mb-3">
                &ldquo;{example.text}&rdquo;
              </p>
              <p className="text-[10px] text-[#2a2a2a] tracking-wide">{example.empires}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Free vs Élite — human, not SaaS ─── */}
      <div className="mb-14 sm:mb-20">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Eye size={12} className="text-champagne/25" />
          <p className="text-[#555] text-[10px] uppercase tracking-[0.2em] font-medium">
            Dos planes
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Free — Free */}
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-[#1a1a1a] flex items-center justify-center">
                <Eye size={16} className="text-[#555]" />
              </div>
              <div>
                <h3 className="text-white font-semibold">Free</h3>
                <p className="text-[#444] text-[10px]">0€/mes</p>
              </div>
            </div>

            <p className="text-[#777] text-sm leading-relaxed mb-5">
              Todo lo esencial ya está aquí.
              Hábitos, estados, notas, el mentor, los 5 imperios.
              Lo necesario para empezar a entenderse.
            </p>

            <div className="border-t border-[#1a1a1a] pt-4">
              <p className="text-[#333] text-[10px] uppercase tracking-wider font-medium mb-3">Lo que ya tienes</p>
              <ul className="space-y-2">
                {[
                  'Registro manual de hábitos y estados',
                  'Mentor IA con ritmo diario',
                  'Acceso a los 5 imperios',
                  'Notas básicas de cada imperio',
                  'Check-in y seguimiento emocional',
                  'Memoria de tu vida',
                ].map((item) => (
                  <li key={item} className="text-[#666] text-xs flex items-start gap-2">
                    <span className="text-[#333] mt-0.5">·</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Élite — Premium */}
          <div className="bg-[#0a0a0a] border border-champagne/10 rounded-2xl p-7 relative">
            {/* Subtle gold presence */}
            <div className="absolute top-4 right-4">
              <Circle size={3} className="text-champagne/30" fill="currentColor" />
            </div>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-champagne/6 flex items-center justify-center">
                <Circle size={5} fill="currentColor" className="text-champagne/50" />
              </div>
              <div>
                <h3 className="text-white font-semibold">Élite</h3>
                <p className="text-champagne/40 text-[10px]">5€/mes</p>
              </div>
            </div>

            <p className="text-[#999] text-sm leading-relaxed mb-5">
              Élite conecta más cosas con el tiempo.
              Más contexto, más memoria, más conexiones entre lo que vives.
            </p>

            <div className="border-t border-champagne/8 pt-4">
              <p className="text-champagne/25 text-[10px] uppercase tracking-wider font-medium mb-3">
                Lo que cambia con Élite
              </p>
              <ul className="space-y-2">
                {[
                  'Conexiones entre tus imperios',
                  'Patrones de vida: lo que se repite',
                  'Mentor sin límite diario, con más contexto',
                  'Memoria que acumula y conecta',
                  'Historial completo de conversaciones',
                  'Notas con más detalle de cada imperio',
                  'Observaciones semanales con más detalle',
                  'Cierres mensuales con evolución',
                ].map((item) => (
                  <li key={item} className="text-[#aaa] text-xs flex items-start gap-2">
                    <span className="text-champagne/40 mt-0.5">·</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Quiet philosophy ─── */}
      <div className="text-center mb-10 sm:mb-14">
        <div className="max-w-md mx-auto">
          <p className="text-[#555] text-sm leading-relaxed">
            Todo lo esencial ya está en Free. Élite conecta más cosas con el tiempo.
          </p>
          <p className="text-[#333] text-xs mt-3">
            Sin compromiso. Cancela cuando quieras.
          </p>
        </div>
      </div>

      {/* ─── CTA — only after understanding ─── */}
      {isPremium ? (
        <div className="text-center pb-6">
          <p className="text-champagne/40 text-xs mb-4">Ya formas parte de Élite</p>
          <button
            onClick={handleManage}
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-3 text-sm text-[#999] hover:text-champagne border border-[#1a1a1a] hover:border-champagne/15 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Circle size={4} fill="currentColor" className="text-champagne/30" />
            )}
            Gestionar suscripción
          </button>
        </div>
      ) : (
        <div className="text-center pb-6">
          <div className="max-w-sm mx-auto">
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full bg-champagne/8 border border-champagne/15 text-champagne font-medium py-3.5 rounded-xl hover:bg-champagne/12 transition-colors disabled:opacity-50 text-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <>
                  Explorar Élite
                  <ArrowRight size={14} className="opacity-50" />
                </>
              )}
            </button>
            <p className="text-[#333] text-[10px] mt-3">5€/mes · Cancela cuando quieras</p>
          </div>
        </div>
      )}
    </div>
  );
}
