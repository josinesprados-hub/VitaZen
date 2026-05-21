'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { Circle, CreditCard, Loader2, ChevronRight, Eye } from 'lucide-react';

/** Format date to locale string */
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function SubscriptionManager() {
  const { user, refreshUser } = useAuth();
  const { apiFetch } = useApi();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const isPremium = user?.plan === 'PREMIUM';
  const subscription = user?.subscription;

  const handleManageSubscription = async () => {
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
      router.push('/pricing');
    } catch {
      router.push('/pricing');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = () => {
    router.push('/elite');
  };

  // ─── PREMIUM user view ───
  if (isPremium) {
    return (
      <div className="space-y-4">
        {/* Depth status card */}
        <div className="flex items-center gap-3">
          <div className="icon-sm">
            <Circle size={5} fill="currentColor" className="text-[#c8a55a]/50" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm text-white font-medium">Élite</p>
              <span className="text-[9px] font-medium text-[#c8a55a]/40 bg-[#c8a55a]/5 border border-[#c8a55a]/10 px-2 py-0.5 rounded-full">Activo</span>
            </div>
            {subscription?.cancelAtPeriodEnd ? (
              <p className="text-xs text-[#e8a040] mt-0.5">
                Cancelado — activo hasta el {formatDate(subscription.currentPeriodEnd)}
              </p>
            ) : subscription?.currentPeriodEnd ? (
              <p className="text-xs text-[#999] mt-0.5">
                Pr&oacute;xima renovaci&oacute;n: {formatDate(subscription.currentPeriodEnd)}
              </p>
            ) : (
              <p className="text-xs text-[#999] mt-0.5">
                Acceso a capas más profundas
              </p>
            )}
          </div>
        </div>

        {/* Manage subscription button */}
        <button
          onClick={handleManageSubscription}
          disabled={loading}
          className="flex items-center justify-between w-full py-3 group touch-press"
        >
          <div className="flex items-center gap-3">
            <div className="icon-sm">
              <CreditCard size={14} className="text-[#c8a55a]/50" />
            </div>
            <div className="text-left">
              <p className="text-sm text-white font-medium">Gestionar suscripci&oacute;n</p>
              <p className="text-xs text-[#999]">Cancelar, cambiar m&eacute;todo de pago</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {loading ? (
              <Loader2 size={16} className="animate-spin text-[#c8a55a]" />
            ) : (
              <ChevronRight size={16} className="text-[#555] group-hover:text-[#c8a55a] transition-colors" />
            )}
          </div>
        </button>
      </div>
    );
  }

  // ─── FREE user view ───
  return (
    <div className="space-y-4">
      {/* Free status */}
      <div className="flex items-center gap-3">
        <div className="icon-sm">
          <Eye size={14} className="text-[#555]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm text-white font-medium">Free</p>
            <span className="text-[9px] font-medium text-[#555] px-2 py-0.5">0€/mes</span>
          </div>
          <p className="text-xs text-[#999] mt-0.5">
            Registro, observaci&oacute;n y los 5 imperios
          </p>
        </div>
      </div>

      {/* Depth invitation — not upgrade CTA */}
      <button
        onClick={handleUpgrade}
        className="flex items-center gap-3 w-full py-3 text-[#c8a55a]/60 hover:text-[#c8a55a] transition-colors touch-press"
      >
        <div className="icon-sm">
          <Circle size={5} fill="currentColor" className="text-[#c8a55a]/40" />
        </div>
        <div className="text-left flex-1">
          <p className="text-sm font-medium">Más perspectiva con Élite</p>
          <p className="text-xs text-[#777]">Conexiones entre partes de tu vida</p>
        </div>
        <ChevronRight size={16} className="text-[#444] group-hover:text-[#c8a55a] transition-colors" />
      </button>
    </div>
  );
}
