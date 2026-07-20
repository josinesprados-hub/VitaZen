'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { useApi } from '@/hooks/useApi';
import { Check, Loader2, Circle, Eye } from 'lucide-react';

// ═══════════════════════════════════════════
// Pricing Page — Élite identity, contemplative tone
// ═══════════════════════════════════════════
//
// Élite is the brand. Conexión is the emotional language.
// The user should feel:
// "There's something more connected here."
// NOT: "I need to pay to unlock features."

export default function PricingPage() {
  const { user } = useAuth();
  const { displayUser } = useScreenshotMode();
  const { apiFetch } = useApi();
  const router = useRouter();
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
          // Portal also failed — go to settings
          router.push('/ajustes');
        } else {
          // F8.4-13 FIX: Replace alert() with router.push — consistent with elite/page.tsx
          router.push('/pricing?error=checkout');
        }
      }
    } catch (error) {
      console.error('Checkout error:', error);
      router.push('/pricing?error=connection');
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
        // F8.4-13 FIX: Replace alert() with router.push
        router.push('/ajustes?error=portal');
      }
    } catch (error) {
      console.error('Portal error:', error);
      router.push('/ajustes?error=connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 sm:py-12 px-4 sm:px-6">
      {/* Header — depth, not commerce */}
      <div className="text-center mb-12 sm:mb-16">
        <div className="flex items-center justify-center gap-2 mb-5">
          <Circle size={4} fill="currentColor" className="text-champagne/40" />
          <p className="text-champagne/50 text-[10px] uppercase tracking-[0.25em] font-medium">Élite</p>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4 leading-tight">
          Mirar la vida más despacio
        </h1>
        <p className="text-[#777] text-base max-w-md mx-auto leading-relaxed">
          No necesitas más herramientas. Necesitas más conexión.
        </p>
      </div>

      {/* Two spaces — not "plans" */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
        {/* Free — free experience */}
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-7 sm:p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-[#1a1a1a] flex items-center justify-center">
              <Eye size={18} className="text-[#555]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Free</h2>
              <p className="text-[#555] text-xs">0€/mes</p>
            </div>
          </div>

          <div className="mb-6">
            <span className="text-3xl font-bold text-white">0€</span>
            <span className="text-[#555] text-sm">/mes</span>
          </div>

          <div className="space-y-3 mb-8">
            <p className="text-[#444] text-[10px] uppercase tracking-wider font-medium">El comienzo</p>
            {[
              'Registro manual de hábitos y estados',
              'Mentor IA con ritmo diario',
              'Acceso a los 5 imperios',
              'Notas de cada imperio',
              'Check-in y seguimiento emocional',
              'Memoria de tu vida',
            ].map((feature) => (
              <div key={feature} className="flex items-start gap-3">
                <Check size={14} className="text-[#333] shrink-0 mt-0.5" />
                <p className="text-sm text-[#888]">{feature}</p>
              </div>
            ))}
          </div>

          <button
            disabled
            className="w-full py-3 rounded-xl border border-[#1a1a1a] text-[#444] font-medium text-sm cursor-not-allowed"
          >
            Tu espacio actual
          </button>
        </div>

        {/* Élite — deeper experience */}
        <div className="bg-[#0a0a0a] border border-champagne/12 rounded-2xl p-7 sm:p-8 relative">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-champagne/8 flex items-center justify-center">
              <Circle size={6} fill="currentColor" className="text-champagne/50" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Élite</h2>
              <p className="text-champagne/50 text-xs">5€/mes</p>
            </div>
          </div>

          <div className="mb-6">
            <span className="text-3xl font-bold text-champagne/80">5€</span>
            <span className="text-[#777] text-sm">/mes</span>
          </div>

          <div className="space-y-3 mb-6">
            <p className="text-champagne/30 text-[10px] uppercase tracking-wider font-medium">Todo lo anterior, con más profundidad</p>
            {[
              'Conexiones entre tus imperios',
              'Patrones de vida: lo que se repite',
              'Mentor IA sin límite diario',
              'Memoria que acumula contexto',
              'Historial completo de conversaciones',
              'Notas con más detalle de cada imperio',
              'Recomendaciones del mentor con más contexto',
              'Observaciones semanales con más detalle',
            ].map((feature) => (
              <div key={feature} className="flex items-start gap-3">
                <Check size={14} className="text-champagne/50 shrink-0 mt-0.5" />
                <p className="text-sm text-white/80">{feature}</p>
              </div>
            ))}
          </div>

          {displayUser?.plan === 'PREMIUM' ? (
            <button
              onClick={handleManage}
              disabled={loading}
              className="w-full bg-champagne/8 border border-champagne/15 text-champagne/70 font-medium py-3 rounded-xl hover:bg-champagne/12 transition-colors disabled:opacity-50 text-sm"
            >
              {loading ? <Loader2 size={16} className="animate-spin inline" /> : 'Gestionar suscripción'}
            </button>
          ) : (
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full bg-champagne/10 border border-champagne/20 text-champagne font-medium py-3 rounded-xl hover:bg-champagne/15 transition-colors disabled:opacity-50 text-sm"
            >
              {loading ? <Loader2 size={16} className="animate-spin inline" /> : 'Explorar Élite'}
            </button>
          )}
        </div>
      </div>

      {/* Silent philosophy — not sales copy */}
      <div className="text-center mt-12 sm:mt-16 mb-2">
        <div className="max-w-md mx-auto">
          <p className="text-[#333] text-xs">
            Sin compromiso. Cancela cuando quieras.
          </p>
        </div>
      </div>
    </div>
  );
}
