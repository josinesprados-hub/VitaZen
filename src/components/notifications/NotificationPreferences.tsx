'use client';

import { useState, useEffect, useRef } from 'react';
import { useNotifications } from '@/hooks/use-notifications';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Bell,
  BellOff,
  Moon,
  Sunrise,
  Heart,
  BarChart3,
  RotateCcw,
  Brain,
  Loader2,
  Check,
  Shield,
  ChevronDown,
} from 'lucide-react';

/** Common timezone list for the selector */
const TIMEZONES = [
  'Europe/Madrid',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/Bogota',
  'America/Lima',
  'America/Buenos_Aires',
  'America/Santiago',
  'America/Sao_Paulo',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
];

export function NotificationPreferences() {
  const {
    preferences,
    permissionState,
    pushSupported,
    loading,
    enablePush,
    disablePush,
    updatePreferences,
  } = useNotifications();

  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [enablingPush, setEnablingPush] = useState(false);
  const [showTimezoneSelect, setShowTimezoneSelect] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  const showSaved = (key: string) => {
    setSavedKeys(prev => new Set(prev).add(key));
    timersRef.current.push(setTimeout(() => {
      setSavedKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 2000));
  };

  const handleToggle = async (key: string, value: boolean) => {
    setSavingKey(key);
    const ok = await updatePreferences({ [key]: value });
    if (ok) showSaved(key);
    setSavingKey(null);
  };

  const handleEnablePush = async () => {
    setEnablingPush(true);
    await enablePush();
    setEnablingPush(false);
  };

  const handleDisablePush = async () => {
    await disablePush();
  };

  const handleTimezoneChange = async (tz: string) => {
    setShowTimezoneSelect(false);
    setSavingKey('timezone');
    const ok = await updatePreferences({ timezone: tz });
    if (ok) showSaved('timezone');
    setSavingKey(null);
  };

  // ─── Loading ───
  if (loading) {
    return (
      <div className="card-primary p-6 sm:p-8">
        <div className="flex items-center gap-2 text-[#999]">
          <Loader2 size={16} className="animate-spin" />
          <p className="text-sm">Cargando preferencias...</p>
        </div>
      </div>
    );
  }

  // ─── Push not supported ───
  if (!pushSupported) {
    return (
      <div className="card-primary p-6 sm:p-8">
        <h3 className="text-sm font-semibold text-champagne uppercase tracking-widest flex items-center gap-2 mb-4">
          <BellOff size={14} />
          Notificaciones push
        </h3>
        <p className="text-sm text-[#999]">
          Tu navegador no soporta notificaciones push. Prueba con Chrome, Firefox o Edge en su versión más reciente.
        </p>
      </div>
    );
  }

  // ─── Permission denied ───
  if (permissionState === 'denied') {
    return (
      <div className="card-primary p-6 sm:p-8">
        <h3 className="text-sm font-semibold text-champagne uppercase tracking-widest flex items-center gap-2 mb-4">
          <BellOff size={14} />
          Notificaciones push
        </h3>
        <div className="space-y-3">
          <p className="text-sm text-[#999]">
            Las notificaciones están bloqueadas en tu navegador. Para activarlas:
          </p>
          <ol className="text-xs text-[#888] space-y-1.5 list-decimal list-inside">
            <li>Haz clic en el icono del candado en la barra de direcciones</li>
            <li>Cambia &quot;Notificaciones&quot; a &quot;Permitir&quot;</li>
            <li>Recarga la página</li>
          </ol>
        </div>
      </div>
    );
  }

  // ─── Push not yet enabled ───
  if (!preferences?.pushEnabled || permissionState === 'default') {
    return (
      <div className="card-primary p-6 sm:p-8">
        <h3 className="text-sm font-semibold text-champagne uppercase tracking-widest flex items-center gap-2 mb-4">
          <Bell size={14} />
          Notificaciones push
        </h3>
        <div className="space-y-4">
          <p className="text-sm text-[#999]">
            Recibe recordatorios suaves y útiles. Nada de spam, sin culpa, sin presión.
          </p>
          <div className="text-xs text-[#666] space-y-1.5">
            <p className="flex items-center gap-2">
              <Check size={12} className="text-champagne" />
              Máximo 2 notificaciones al día
            </p>
            <p className="flex items-center gap-2">
              <Moon size={12} className="text-champagne" />
              Horas de silencio automáticas (22:00 - 08:00)
            </p>
            <p className="flex items-center gap-2">
              <Shield size={12} className="text-champagne" />
              Puedes desactivarlas cuando quieras
            </p>
          </div>
          <Button
            onClick={handleEnablePush}
            disabled={enablingPush}
            className="bg-champagne hover:bg-champagne-deep text-black font-medium text-sm"
          >
            {enablingPush ? (
              <>
                <Loader2 size={14} className="animate-spin mr-2" />
                Activando...
              </>
            ) : (
              <>
                <Bell size={14} className="mr-2" />
                Activar notificaciones
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ─── Full preferences panel ───
  return (
    <div className="space-y-4">
      {/* Push master toggle */}
      <div className="card-primary p-6 sm:p-8">
        <h3 className="text-sm font-semibold text-champagne uppercase tracking-widest flex items-center gap-2 mb-5">
          <Bell size={14} />
          Notificaciones push
        </h3>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="icon-sm mt-0.5">
              <Bell size={14} className="text-champagne" />
            </div>
            <div>
              <p className="text-sm text-white font-medium">Notificaciones activas</p>
              <p className="text-xs text-[#999] mt-0.5">
                {preferences.maxDailyNotifications} recordatorios máx. al día
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {savingKey === 'pushEnabled' && (
              <Loader2 size={14} className="animate-spin text-champagne" />
            )}
            <Switch
              checked={preferences.pushEnabled}
              onCheckedChange={(v) => {
                if (v) {
                  enablePush();
                } else {
                  handleDisablePush();
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Reminder types */}
      <div className="card-primary p-6 sm:p-8 space-y-5">
        <h3 className="text-sm font-semibold text-champagne uppercase tracking-widest flex items-center gap-2">
          <Heart size={14} />
          Tipos de recordatorios
        </h3>

        {/* Check-in reminders */}
        <ToggleRow
          icon={<Sunrise size={14} className="text-champagne" />}
          title="Check-in diario"
          description="Un recordatorio suave para tu check-in matutino"
          checked={preferences.checkinReminders}
          saving={savingKey === 'checkinReminders'}
          saved={savedKeys.has('checkinReminders')}
          onChange={(v) => handleToggle('checkinReminders', v)}
        />

        {/* Weekly recap */}
        <ToggleRow
          icon={<BarChart3 size={14} className="text-champagne" />}
          title="Resumen semanal"
          description="Un resumen tranquilo de tu progreso cada semana"
          checked={preferences.weeklyRecap}
          saving={savingKey === 'weeklyRecap'}
          saved={savedKeys.has('weeklyRecap')}
          onChange={(v) => handleToggle('weeklyRecap', v)}
        />

        {/* Comeback reminders */}
        <ToggleRow
          icon={<RotateCcw size={14} className="text-champagne" />}
          title="Te echamos de menos"
          description="Un mensaje suave si llevas tiempo sin entrar"
          checked={preferences.comebackReminders}
          saving={savingKey === 'comebackReminders'}
          saved={savedKeys.has('comebackReminders')}
          onChange={(v) => handleToggle('comebackReminders', v)}
        />

        {/* Reflection reminders */}
        <ToggleRow
          icon={<Brain size={14} className="text-champagne" />}
          title="Reflexión diaria"
          description="Un momento para ti antes de acabar el día"
          checked={preferences.reflectionReminders}
          saving={savingKey === 'reflectionReminders'}
          saved={savedKeys.has('reflectionReminders')}
          onChange={(v) => handleToggle('reflectionReminders', v)}
        />
      </div>

      {/* Quiet hours & frequency */}
      <div className="card-primary p-6 sm:p-8 space-y-5">
        <h3 className="text-sm font-semibold text-champagne uppercase tracking-widest flex items-center gap-2">
          <Moon size={14} />
          Horas de silencio
        </h3>

        {/* Quiet hours toggle */}
        <ToggleRow
          icon={<Moon size={14} className="text-champagne" />}
          title="Activar horas de silencio"
          description={`Sin notificaciones de ${preferences.quietHoursStart} a ${preferences.quietHoursEnd}`}
          checked={preferences.quietHoursEnabled}
          saving={savingKey === 'quietHoursEnabled'}
          saved={savedKeys.has('quietHoursEnabled')}
          onChange={(v) => handleToggle('quietHoursEnabled', v)}
        />

        {/* Quiet hours time range */}
        {preferences.quietHoursEnabled && (
          <div className="ml-7 space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-xs text-[#999] w-16">Desde</label>
              <input
                type="time"
                value={preferences.quietHoursStart}
                onChange={(e) => handleToggle('quietHoursStart', e.target.value)}
                className="bg-[#111] border border-[#333] rounded-md px-3 py-1.5 text-sm text-white focus:border-champagne focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-[#999] w-16">Hasta</label>
              <input
                type="time"
                value={preferences.quietHoursEnd}
                onChange={(e) => handleToggle('quietHoursEnd', e.target.value)}
                className="bg-[#111] border border-[#333] rounded-md px-3 py-1.5 text-sm text-white focus:border-champagne focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Timezone */}
        <div className="ml-0">
          <div className="flex items-center gap-3">
            <label className="text-xs text-[#999]">Zona horaria</label>
            <button
              onClick={() => setShowTimezoneSelect(!showTimezoneSelect)}
              className="flex items-center gap-1.5 text-xs text-white hover:text-champagne transition-colors"
            >
              {preferences.timezone.replace('_', ' ')}
              <ChevronDown size={12} />
            </button>
            {savingKey === 'timezone' && (
              <Loader2 size={12} className="animate-spin text-champagne" />
            )}
          </div>

          {showTimezoneSelect && (
            <div className="mt-2 bg-[#111] border border-[#333] rounded-lg max-h-40 overflow-y-auto">
              {TIMEZONES.map((tz) => (
                <button
                  key={tz}
                  onClick={() => handleTimezoneChange(tz)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-[#1a1a1a] transition-colors ${
                    preferences.timezone === tz ? 'text-champagne' : 'text-[#999]'
                  }`}
                >
                  {tz.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Daily frequency cap */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="icon-sm mt-0.5">
              <Shield size={14} className="text-champagne" />
            </div>
            <div>
              <p className="text-sm text-white font-medium">Límite diario</p>
              <p className="text-xs text-[#999] mt-0.5">
                Máximo de notificaciones por día
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {[1, 2].map((n) => (
              <button
                key={n}
                onClick={() => handleToggle('maxDailyNotifications', n)}
                className={`w-7 h-7 rounded-full text-xs font-medium transition-all ${
                  preferences.maxDailyNotifications >= n
                    ? 'bg-champagne text-black'
                    : 'bg-[#1a1a1a] text-[#666] hover:bg-[#222]'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Toggle row sub-component ───
function ToggleRow({
  icon,
  title,
  description,
  checked,
  saving,
  saved,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  saving: boolean;
  saved: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-start gap-3 flex-1">
        <div className="icon-sm mt-0.5">{icon}</div>
        <div>
          <p className="text-sm text-white font-medium">{title}</p>
          <p className="text-xs text-[#999] mt-0.5">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {saving && <Loader2 size={14} className="animate-spin text-champagne" />}
        {saved && <Check size={14} className="text-champagne" />}
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}
