'use client';

import { useState, useEffect, useRef } from 'react';
import { useNotifications } from '@/hooks/use-notifications';
import { Button } from '@/components/ui/button';
import {
  Bell,
  BellOff,
  Moon,
  Loader2,
  Check,
} from 'lucide-react';

/**
 * Push notification preferences for the Ajustes page.
 *
 * Two visible states:
 *   1. Not enabled  → activation card with "Activar notificaciones"
 *   2. Active        → confirmation + "Desactivar notificaciones"
 *
 * Plus two non-interactive states:
 *   - Loading        → spinner
 *   - Not supported  → explanatory message
 *   - Denied         → instructions to unblock
 *
 * All state reflects the real browser permission and server state.
 * No placebo buttons, no simulated states.
 */
export function NotificationPreferences() {
  const {
    preferences,
    permissionState,
    pushSupported,
    loading,
    enablePush,
    disablePush,
  } = useNotifications();

  const [enablingPush, setEnablingPush] = useState(false);
  const [disablingPush, setDisablingPush] = useState(false);

  const handleEnablePush = async () => {
    setEnablingPush(true);
    await enablePush();
    setEnablingPush(false);
  };

  const handleDisablePush = async () => {
    setDisablingPush(true);
    await disablePush();
    setDisablingPush(false);
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
          NOTIFICACIONES PUSH
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
          NOTIFICACIONES PUSH
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
          NOTIFICACIONES PUSH
        </h3>
        <div className="space-y-4">
          <p className="text-sm text-[#999]">
            No pierdas el ritmo de tu evolución.
          </p>
          <p className="text-sm text-[#999]">
            Recibe recordatorios cuando puedan ayudarte a mantener tus hábitos y seguir avanzando en tu evolución personal.
          </p>
          <div className="text-xs text-[#666] space-y-1.5">
            <p className="flex items-center gap-2">
              <Check size={12} className="text-champagne" />
              Recordatorios diarios
            </p>
            <p className="flex items-center gap-2">
              <Moon size={12} className="text-champagne" />
              Horario de silencio automático (22:00–08:00)
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

  // ─── Notifications active ───
  return (
    <div className="card-primary p-6 sm:p-8">
      <h3 className="text-sm font-semibold text-champagne uppercase tracking-widest flex items-center gap-2 mb-4">
        <Bell size={14} />
        NOTIFICACIONES PUSH
      </h3>
      <div className="space-y-4">
        <p className="text-sm text-white font-medium">
          Notificaciones activadas
        </p>
        <p className="text-xs text-[#999]">
          Recibirás recordatorios para mantener tus hábitos y seguir avanzando.
        </p>
        <Button
          onClick={handleDisablePush}
          disabled={disablingPush}
          className="border border-[#444] text-[#888] hover:text-white hover:border-[#666] font-medium text-sm bg-transparent"
        >
          {disablingPush ? (
            <>
              <Loader2 size={14} className="animate-spin mr-2" />
              Desactivando...
            </>
          ) : (
            <>
              <BellOff size={14} className="mr-2" />
              Desactivar notificaciones
            </>
          )}
        </Button>
      </div>
    </div>
  );
}