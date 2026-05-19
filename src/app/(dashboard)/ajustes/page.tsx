'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Switch } from '@/components/ui/switch';
import { NotificationPreferences } from '@/components/notifications/NotificationPreferences';
import { SubscriptionManager } from '@/components/settings/SubscriptionManager';
import {
  Mail,
  Bell,
  Eye,
  LogOut,
  Info,
  Shield,
  ChevronRight,
  UserCircle,
  Loader2,
  Check,
} from 'lucide-react';

const APP_VERSION = '0.2.0';

export default function AjustesPage() {
  const { user, firebaseUser, signOut, refreshUser } = useAuth();
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
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
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
        <h1 className="text-xl sm:text-2xl font-bold text-white">Ajustes</h1>
        <p className="text-sm text-[#999] mt-1">Configura tu experiencia en VitaZen</p>
      </div>

      {/* Email Notifications Section */}
      <div className="card-primary p-6 sm:p-8 space-y-5">
        <h3 className="text-sm font-semibold text-[#c8a55a] uppercase tracking-widest flex items-center gap-2">
          <Mail size={14} />
          Notificaciones por email
        </h3>

        {/* Weekly Email Summary */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="icon-sm mt-0.5">
              <Mail size={14} className="text-[#c8a55a]" />
            </div>
            <div>
              <p className="text-sm text-white font-medium">Resumen semanal</p>
              <p className="text-xs text-[#999] mt-0.5">
                Recibe un resumen de tu progreso cada semana por email
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {savingKey === 'weeklyEmailSummary' && (
              <Loader2 size={14} className="animate-spin text-[#c8a55a]" />
            )}
            {savedKeys.has('weeklyEmailSummary') && (
              <Check size={14} className="text-[#c8a55a]" />
            )}
            <Switch
              checked={settings.weeklyEmailSummary}
              onCheckedChange={(v) => handleToggle('weeklyEmailSummary', v)}
            />
          </div>
        </div>

        {/* Daily Reminders (email) */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="icon-sm mt-0.5">
              <Bell size={14} className="text-[#c8a55a]" />
            </div>
            <div>
              <p className="text-sm text-white font-medium">Recordatorios diarios</p>
              <p className="text-xs text-[#999] mt-0.5">
                Recordatorios para completar tus habitos y check-in diario
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {savingKey === 'dailyReminders' && (
              <Loader2 size={14} className="animate-spin text-[#c8a55a]" />
            )}
            {savedKeys.has('dailyReminders') && (
              <Check size={14} className="text-[#c8a55a]" />
            )}
            <Switch
              checked={settings.dailyReminders}
              onCheckedChange={(v) => handleToggle('dailyReminders', v)}
            />
          </div>
        </div>
      </div>

      {/* Push Notifications Section */}
      <NotificationPreferences />

      {/* Privacy Section */}
      <div className="card-primary p-6 sm:p-8 space-y-5">
        <h3 className="text-sm font-semibold text-[#c8a55a] uppercase tracking-widest flex items-center gap-2">
          <Shield size={14} />
          Privacidad
        </h3>

        {/* Stats Visibility */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="icon-sm mt-0.5">
              <Eye size={14} className="text-[#c8a55a]" />
            </div>
            <div>
              <p className="text-sm text-white font-medium">Mostrar estadisticas</p>
              <p className="text-xs text-[#999] mt-0.5">
                Permite que tus estadisticas y progreso sean visibles en comparaciones
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {savingKey === 'privacyStatsVisible' && (
              <Loader2 size={14} className="animate-spin text-[#c8a55a]" />
            )}
            {savedKeys.has('privacyStatsVisible') && (
              <Check size={14} className="text-[#c8a55a]" />
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
        <h3 className="text-sm font-semibold text-[#c8a55a] uppercase tracking-widest">Cuenta</h3>

        {/* Profile link */}
        <button
          onClick={() => router.push('/perfil')}
          className="flex items-center justify-between w-full py-3 group touch-press"
        >
          <div className="flex items-center gap-3">
            <div className="icon-sm">
              <UserCircle size={14} className="text-[#c8a55a]" />
            </div>
            <div className="text-left">
              <p className="text-sm text-white font-medium">Editar perfil</p>
              <p className="text-xs text-[#999]">Nombre, foto, ubicacion y bio</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-[#555] group-hover:text-[#c8a55a] transition-colors" />
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
            <p className="text-sm font-medium">Cerrar sesion</p>
            <p className="text-xs text-[#666]">Salir de tu cuenta</p>
          </div>
        </button>
      </div>

      {/* App Info Section */}
      <div className="card-primary p-6 sm:p-8 space-y-4">
        <h3 className="text-sm font-semibold text-[#c8a55a] uppercase tracking-widest flex items-center gap-2">
          <Info size={14} />
          Informacion
        </h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#999]">Version de la app</p>
            <p className="text-sm text-white font-mono">{APP_VERSION}</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#999]">Plan</p>
            <div className="flex items-center gap-2">
              {user?.plan === 'PREMIUM' ? (
                <span className="badge-premium">ÉLITE</span>
              ) : (
                <span className="badge-free">FREE</span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#999]">Email verificado</p>
            {user?.emailVerified ? (
              <span className="flex items-center gap-1.5 text-sm text-[#c8a55a]">
                <Check size={14} />
                Verificado
              </span>
            ) : (
              <button
                onClick={handleSendVerification}
                disabled={verifySending || verifySent}
                className="flex items-center gap-1.5 text-sm text-[#888] hover:text-[#c8a55a] transition-colors disabled:opacity-50"
              >
                {verifySending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Enviando...
                  </>
                ) : verifySent ? (
                  <>
                    <Check size={14} className="text-[#c8a55a]" />
                    <span className="text-[#c8a55a]">Enviado</span>
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
              <a href="/privacy" className="text-xs text-[#c8a55a] hover:text-[#d4b468] transition-colors underline underline-offset-2">
                Privacidad
              </a>
              <a href="/terms" className="text-xs text-[#c8a55a] hover:text-[#d4b468] transition-colors underline underline-offset-2">
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
