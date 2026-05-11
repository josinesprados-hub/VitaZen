'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { Crown, CreditCard, Loader2, ChevronRight, Sparkles } from 'lucide-react';

/** Detect platform for subscription management redirect */
function getPlatform(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web';

  const ua = navigator.userAgent;

  // iOS detection (Safari on iPhone/iPad, not just "like Mac")
  if (/iPhone|iPad|iPod/.test(ua) && !window.MSStream) {
    // Check if running as native PWA or in Safari
    const isStandalone = (window.navigator as any).standalone === true;
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
    if (isStandalone || isSafari) return 'ios';
  }

  // Android detection
  if (/Android/.test(ua)) {
    return 'android';
  }

  return 'web';
}

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
    const platform = getPlatform();

    // iOS: open native subscription management
    if (platform === 'ios') {
      window.open('https://apps.apple.com/account/subscriptions', '_blank');
      return;
    }

    // Android: open Google Play subscription management
    if (platform === 'android') {
      window.open('https://play.google.com/store/account/subscriptions', '_blank');
      return;
    }

    // Web: open Stripe Customer Portal
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
      // Fallback to pricing page if portal fails
      router.push('/pricing');
    } catch {
      router.push('/pricing');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = () => {
    router.push('/pricing');
  };

  // ─── PREMIUM user view ───
  if (isPremium) {
    return (
      <div className="space-y-4">
        {/* Premium status card */}
        <div className="flex items-center gap-3">
          <div className="icon-sm">
            <Crown size={14} className="text-[#c8a55a]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm text-white font-medium">Plan Premium</p>
              <span className="badge-premium">ACTIVO</span>
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
                Acceso completo a todas las funciones
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
              <CreditCard size={14} className="text-[#c8a55a]" />
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
          <Sparkles size={14} className="text-[#666]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm text-white font-medium">Plan Free</p>
            <span className="badge-free">FREE</span>
          </div>
          <p className="text-xs text-[#999] mt-0.5">
            Mensajes IA limitados y funciones b&aacute;sicas
          </p>
        </div>
      </div>

      {/* Upgrade CTA */}
      <button
        onClick={handleUpgrade}
        className="flex items-center gap-3 w-full py-3 text-[#c8a55a] hover:text-[#d4b468] transition-colors touch-press"
      >
        <div className="icon-sm">
          <Crown size={14} className="text-[#c8a55a]" />
        </div>
        <div className="text-left flex-1">
          <p className="text-sm font-medium">Mejorar a Premium</p>
          <p className="text-xs text-[#999]">IA ilimitada, contenido exclusivo y m&aacute;s</p>
        </div>
        <ChevronRight size={16} className="text-[#555] group-hover:text-[#c8a55a] transition-colors" />
      </button>
    </div>
  );
}
