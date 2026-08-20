'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNotifications } from '@/hooks/use-notifications';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Bell,
  BellOff,
  Moon,
  Sunrise,
  Heart,
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
    loadError,
    enablePush,
    disablePush,
    updatePreferences,
    refreshPreferences,
  } = useNotifications();

  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [enablingPush, setEnablingPush] = useState(false);
  const [showTimezoneSelect, setShowTimezoneSelect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // H-05: refs for timezone keyboard navigation
  const timezoneButtonRef = useRef<HTMLButtonElement>(null);
  const timezoneListRef = useRef<HTMLDivElement>(null);
  const timezoneOptionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  // Auto-dismiss errors after 4s
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(timer);
  }, [error]);

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

  // ERR-3: show error feedback when update fails
  const handleToggle = async (key: string, value: boolean) => {
    setSavingKey(key);
    setError(null);
    const ok = await updatePreferences({ [key]: value });
    if (ok) {
      showSaved(key);
    } else {
      setError('No se ha podido actualizar la configuración.');
    }
    setSavingKey(null);
  };

  // ERR-3/ERR-9: show error feedback when field change fails
  const handleFieldChange = async (key: string, value: string | number) => {
    setSavingKey(key);
    setError(null);
    const ok = await updatePreferences({ [key]: value });
    if (ok) {
      showSaved(key);
    } else {
      setError('No se ha podido guardar el cambio.');
    }
    setSavingKey(null);
  };

  const handleEnablePush = async () => {
    setEnablingPush(true);
    setError(null);
    await enablePush();
    setEnablingPush(false);
  };

  const handleDisablePush = async () => {
    setError(null);
    await disablePush();
  };

  const handleTimezoneChange = async (tz: string) => {
    setShowTimezoneSelect(false);
    setSavingKey('timezone');
    setError(null);
    const ok = await updatePreferences({ timezone: tz });
    if (ok) {
      showSaved('timezone');
      timezoneButtonRef.current?.focus();
    } else {
      setError('No se ha podido cambiar la zona horaria.');
    }
    setSavingKey(null);
    // H-05: return focus to trigger after selection
    timezoneButtonRef.current?.focus();
  };

  // ERR-4: retry loading preferences
  const handleRetryLoad = async () => {
    setError(null);
    await refreshPreferences();
  };

  // H-05: focus first option when list opens
  useEffect(() => {
    if (showTimezoneSelect && timezoneOptionRefs.current[0]) {
      requestAnimationFrame(() => {
        const currentIndex = TIMEZONES.indexOf(preferences?.timezone ?? 'Europe/Madrid');
        const focusIndex = currentIndex >= 0 ? currentIndex : 0;
        timezoneOptionRefs.current[focusIndex]?.focus();
      });
    }
  }, [showTimezoneSelect, preferences?.timezone]);

  // H-05: keyboard navigation for timezone selector
  const handleTimezoneKeyDown = useCallback((e: React.KeyboardEvent) => {
    const currentIndex = TIMEZONES.indexOf(preferences?.timezone ?? 'Europe/Madrid');
    let nextIndex = currentIndex;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        nextIndex = currentIndex < TIMEZONES.length - 1 ? currentIndex + 1 : 0;
        timezoneOptionRefs.current[nextIndex]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        nextIndex = currentIndex > 0 ? currentIndex - 1 : TIMEZONES.length - 1;
        timezoneOptionRefs.current[nextIndex]?.focus();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        handleTimezoneChange(TIMEZONES[currentIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        setShowTimezoneSelect(false);
        timezoneButtonRef.current?.focus();
        break;
      case 'Tab':
        setShowTimezoneSelect(false);
        break;
    }
  }, [preferences?.timezone, handleTimezoneChange]);

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

  // ─── ERR-4: Load error — preferences couldn't be fetched ───
  // This must come BEFORE the "not yet enabled" branch, because
  // loadError means preferences=null for an unknown reason (not
  // because the user hasn't enabled push).
  if (loadError && !preferences) {
    return (
      <div className="card-primary p-6 sm:p-8">
        <h3 className="text-sm font-semibold text-champagne uppercase tracking-widest flex items-center gap-2 mb-4">
          <Bell size={14} />
          Notificaciones push
        </h3>
        <div className="space-y-4">
          <p className="text-sm text-[#999]">
            No se han podido cargar tus preferencias.
          </p>
          <p className="text-xs text-[#888]">
            Comprueba tu conexión e inténtalo de nuevo.
          </p>
          <Button
            onClick={handleRetryLoad}
            className="bg-champagne hover:bg-champagne-deep text-black font-medium text-sm"
          >
            Reintentar
          </Button>
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
          <div className="text-xs text-[#888] space-y-1.5">
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
      {/* H-07: region con aria-labelledby */}
      <div role="region" aria-labelledby="notif-push-heading" className="card-primary p-6 sm:p-8">
        <h3 id="notif-push-heading" className="text-sm font-semibold text-champagne uppercase tracking-widest flex items-center gap-2 mb-5">
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
                Máximo {preferences.maxDailyNotifications} recordatorios al día
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {savingKey === 'pushEnabled' && (
              <Loader2 size={14} className="animate-spin text-champagne" />
            )}
            {/* H-01: aria-label en switch de notificaciones activas */}
            <Switch
              aria-label="Notificaciones activas"
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
      {/* NOTE: 'checkin' (cron at 07:00 UTC via checkin.ts) and 'reflection' (cron at 18:00 UTC via reflection.ts)
          have active triggers that call sendNotification(). 'weekly_recap' and 'comeback' have
          templates, types, caps, and cooldowns defined, but no cron trigger yet — toggles are
          hidden from the UI until triggers are implemented. */}
      {/* H-07: region con aria-labelledby */}
      <div role="region" aria-labelledby="notif-reminders-heading" className="card-primary p-6 sm:p-8 space-y-5">
        <h3 id="notif-reminders-heading" className="text-sm font-semibold text-champagne uppercase tracking-widest flex items-center gap-2">
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
      {/* H-07: region con aria-labelledby */}
      <div role="region" aria-labelledby="notif-quiet-heading" className="card-primary p-6 sm:p-8 space-y-5">
        <h3 id="notif-quiet-heading" className="text-sm font-semibold text-champagne uppercase tracking-widest flex items-center gap-2">
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
              {/* H-02: aria-label en input de hora */}
              <input
                type="time"
                aria-label="Hora de inicio de silencio"
                value={preferences.quietHoursStart}
                onChange={(e) => handleFieldChange('quietHoursStart', e.target.value)}
                className="bg-[#111] border border-[#333] rounded-md px-3 py-1.5 text-base sm:text-sm text-white focus:border-champagne focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-[#999] w-16">Hasta</label>
              {/* H-02: aria-label en input de hora */}
              <input
                type="time"
                aria-label="Hora de fin de silencio"
                value={preferences.quietHoursEnd}
                onChange={(e) => handleFieldChange('quietHoursEnd', e.target.value)}
                className="bg-[#111] border border-[#333] rounded-md px-3 py-1.5 text-base sm:text-sm text-white focus:border-champagne focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Timezone */}
        <div className="ml-0">
          <div className="flex items-center gap-3">
            <label className="text-xs text-[#999]">Zona horaria</label>
            {/* H-03: aria-haspopup, aria-expanded, aria-label en botón selector */}
            <button
              ref={timezoneButtonRef}
              aria-haspopup="listbox"
              aria-expanded={showTimezoneSelect}
              aria-label={`Zona horaria: ${preferences.timezone.replace('_', ' ')}`}
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

          {/* H-03 + H-05: listbox con keyboard navigation */}
          {showTimezoneSelect && (
            <div
              ref={timezoneListRef}
              role="listbox"
              aria-label="Seleccionar zona horaria"
              onKeyDown={handleTimezoneKeyDown}
              className="mt-2 bg-[#111] border border-[#333] rounded-lg max-h-40 overflow-y-auto"
            >
              {TIMEZONES.map((tz, index) => (
                <button
                  key={tz}
                  ref={(el) => { timezoneOptionRefs.current[index] = el; }}
                  role="option"
                  aria-selected={preferences.timezone === tz}
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
                onClick={() => handleFieldChange('maxDailyNotifications', n)}
                /* H-06: aria-pressed y aria-label en botones de límite */
                aria-pressed={preferences.maxDailyNotifications >= n}
                aria-label={`Límite diario: ${n} notificación${n > 1 ? 'es' : ''}`}
                className={`w-7 h-7 rounded-full text-xs font-medium transition-all ${
                  preferences.maxDailyNotifications >= n
                    ? 'bg-champagne text-black'
                    : 'bg-[#1a1a1a] text-[#888] hover:bg-[#222]'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ERR-3/ERR-9: Error feedback for failed updates */}
      {error && (
        <div role="alert" className="card-accent p-4 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => setError(null)}
            aria-label="Cerrar"
            className="ml-auto text-[#999] hover:text-white text-xs"
          >
            Cerrar
          </button>
        </div>
      )}
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
        {/* H-01: aria-label derivado del título */}
        <Switch aria-label={title} checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}
