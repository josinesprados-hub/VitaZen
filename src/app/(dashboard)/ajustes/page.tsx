'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { Switch } from '@/components/ui/switch';
import { NotificationPreferences } from '@/components/notifications/NotificationPreferences';
import { SubscriptionManager } from '@/components/settings/SubscriptionManager';
import {
  Mail,
  Eye,
  LogOut,
  Info,
  Shield,
  ChevronRight,
  UserCircle,
  Loader2,
  Check,
} from 'lucide-react';

const APP_VERSION = '1.0.0';

export default function AjustesPage() {
  const { user, firebaseUser, signOut, refreshUser } = useAuth();
  const { apiFetch } = useApi();
  const { displayUser } = useScreenshotMode();
  const router = useRouter();

  const [settings, setSettings] = useState({
    weeklyEmailSummary: true,
    dailyReminders: false,
    privacyStatsVisible: false,
  });

  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [verifySending, setVerifySending] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  // Sync settings from user data
  useEffect(() => {
    if (user) {
      setSettings({
        weeklyEmailSummary: user.weeklyEmailSummary ?? true,
        dailyReminders: user.dailyReminders ?? false,
        privacyStatsVisible: user.privacyStatsVisible ?? false,
      });
    }
  }, [user]);

  // Auto-dismiss errors after 3s
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleToggle = async (key: string, value: boolean) => {
    if (!firebaseUser) return;

    // Optimistic update
    setSettings(prev => ({ ...prev, [key]: value }));
    setSavingKey(key);
    setError(null);

    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ [key]: value }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al guardar');
      }

      // Refresh user data in auth context
      await refreshUser();

      // Show saved indicator
      setSavedKeys(prev => new Set(prev).add(key));
      timersRef.current.push(setTimeout(() => {
        setSavedKeys(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, 2000));
    } catch (err: any) {
      // Revert on error
      setSettings(prev => ({ ...prev, [key]: !value }));
      setError(err.message || 'Error al guardar los ajustes');
    } finally {
      setSavingKey(null);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const handleSendVerification = async () => {
    if (!firebaseUser || verifySending || verifySent) return;
    setVerifySending(true);
    try {
      const res = await apiFetch('/api/auth/send-verification', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.alreadyVerified) {
        await refreshUser();
        return;
      }
      if (res.ok) {
        setVerifySent(true);
        timersRef.current.push(setTimeout(() => setVerifySent(false), 60000));
      } else {
        setError(data.error || 'Error al enviar');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setVerifySending(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 page-transition">
      {/* Header */}
      <div>
        <h1 className="title-page">Ajustes</h1>
        <p className="subtitle-silent mt-1">Tu espacio personal</p>
      </div>

      {/* Email Notifications Section */}
      {/* NOTE: 'Resumen semanal' → weekly-recap-sender.ts (cron). */}
      <div className="card-primary p-6 sm:p-8 space-y-5">
        <h3 className="text-sm font-semibold text-champagne uppercase tracking-widest flex items-center gap-2">
          <Mail size={14} />
          Notificaciones por email
        </h3>

        {/* Weekly Email Summary */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="icon-sm mt-0.5">
              <Mail size={14} className="text-champagne" />
            </div>
            <div>
              <p className="text-sm text-white font-medium">Resumen semanal</p>
              <p className="text-xs text-[#999] mt-0.5">
                Un resumen de tu semana, por email
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {savingKey === 'weeklyEmailSummary' && (
              <Loader2 size={14} className="animate-spin text-champagne" />
            )}
            {savedKeys.has('weeklyEmailSummary') && (
              <Check size={14} className="text-champagne" />
            )}
            <Switch
              checked={settings.weeklyEmailSummary}
              onCheckedChange={(v) => handleToggle('weeklyEmailSummary', v)}
            />
          </div>
        </div>
      </div>

      {/* Push Notifications Section */}
      <NotificationPreferences />

      {/* Privacy Section */}
      {/* REAL: privacyStatsVisible now controls whether personal metrics (scores, streaks,
          counts, balances) are visually masked in the UI. When false (= private), sensitive
          numbers are gently blurred via <PrivacyMask>. Emotional content stays visible. */}
      <div className="card-primary p-6 sm:p-8 space-y-5">
        <h3 className="text-sm font-semibold text-champagne uppercase tracking-widest flex items-center gap-2">
          <Shield size={14} />
          Privacidad
        </h3>

        {/* Stats Visibility */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="icon-sm mt-0.5">
              <Eye size={14} className="text-champagne" />
            </div>
            <div>
              <p className="text-sm text-white font-medium">Mostrar estadísticas</p>
              <p className="text-xs text-[#999] mt-0.5">
                Muestra métricas, puntuaciones y rachas
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {savingKey === 'privacyStatsVisible' && (
              <Loader2 size={14} className="animate-spin text-champagne" />
            )}
            {savedKeys.has('privacyStatsVisible') && (
              <Check size={14} className="text-champagne" />
            )}
            <Switch
              checked={settings.privacyStatsVisible}
              onCheckedChange={(v) => handleToggle('privacyStatsVisible', v)}
            />
          </div>
        </div>
      </div>

      {/* Account Section */}
      <div className="card-primary p-6 sm:p-8 space-y-4">
        <h3 className="text-sm font-semibold text-champagne uppercase tracking-widest">Cuenta</h3>

        {/* Profile link */}
        <button
          onClick={() => router.push('/perfil')}
          className="flex items-center justify-between w-full py-3 group touch-press"
        >
          <div className="flex items-center gap-3">
            <div className="icon-sm">
              <UserCircle size={14} className="text-champagne" />
            </div>
            <div className="text-left">
              <p className="text-sm text-white font-medium">Editar perfil</p>
              <p className="text-xs text-[#999]">Nombre, foto, ubicación y bio</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-[#555] group-hover:text-champagne transition-colors" />
        </button>

        {/* Divider */}
        <div className="border-t border-[#1a1a1a]" />

        {/* Subscription management */}
        <SubscriptionManager />

        {/* Divider */}
        <div className="border-t border-[#1a1a1a]" />

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full py-3 text-red-400/80 hover:text-red-400 transition-colors touch-press"
        >
          <div className="icon-sm">
            <LogOut size={14} className="text-red-400/60" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium">Cerrar sesión</p>
            <p className="text-xs text-[#666]">Salir de tu cuenta</p>
          </div>
        </button>
      </div>

      {/* App Info Section */}
      <div className="card-primary p-6 sm:p-8 space-y-4">
        <h3 className="text-sm font-semibold text-champagne uppercase tracking-widest flex items-center gap-2">
          <Info size={14} />
          Información
        </h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#999]">Versión de la app</p>
            <p className="text-sm text-white font-mono">{APP_VERSION}</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#999]">Plan</p>
            <div className="flex items-center gap-2">
              {displayUser?.plan === 'PREMIUM' ? (
                <span className="text-[9px] font-medium text-champagne/50">Élite</span>
              ) : (
                <span className="text-[9px] font-medium text-[#555]">Free</span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#999]">Email verificado</p>
            {displayUser?.emailVerified ? (
              <span className="flex items-center gap-1.5 text-sm text-champagne">
                <Check size={14} />
                Verificado
              </span>
            ) : (
              <button
                onClick={handleSendVerification}
                disabled={verifySending || verifySent}
                className="flex items-center gap-1.5 text-sm text-[#888] hover:text-champagne transition-colors disabled:opacity-50"
              >
                {verifySending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Enviando...
                  </>
                ) : verifySent ? (
                  <>
                    <Check size={14} className="text-champagne" />
                    <span className="text-champagne">Enviado</span>
                  </>
                ) : (
                  'Verificar ahora'
                )}
              </button>
            )}
          </div>
        </div>

        {/* Legal links */}
        <div className="border-t border-[#1a1a1a] pt-3 mt-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#999]">Legal</p>
            <div className="flex items-center gap-3">
              <a href="/privacy" className="text-xs text-champagne hover:text-champagne-hover transition-colors underline underline-offset-2">
                Privacidad
              </a>
              <a href="/terms" className="text-xs text-champagne hover:text-champagne-hover transition-colors underline underline-offset-2">
                Términos
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="card-accent p-4 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-[#999] hover:text-white text-xs"
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
