// ═══════════════════════════════════════════
// USE NOTIFICATIONS HOOK — VitaZen
// React hook for notification state & preferences
// ═══════════════════════════════════════════

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  isPushSupported,
  getPermissionState,
  requestPushToken,
  deactivatePushToken,
  onForegroundMessage,
  trackPermissionChange,
} from '@/lib/notifications/push-client';
import type {
  NotificationPreferencesResponse,
  PushPermissionState,
  UpdateNotificationPreferencesPayload,
} from '@/lib/notifications/types';

interface UseNotificationsReturn {
  /** Current notification preferences */
  preferences: NotificationPreferencesResponse | null;
  /** Browser push permission state */
  permissionState: PushPermissionState;
  /** Whether push is supported in this browser */
  pushSupported: boolean;
  /** Loading state */
  loading: boolean;
  /** Enable push notifications (triggers browser permission prompt) */
  enablePush: () => Promise<boolean>;
  /** Disable push notifications */
  disablePush: () => Promise<void>;
  /** Update specific preferences */
  updatePreferences: (updates: UpdateNotificationPreferencesPayload) => Promise<boolean>;
  /** Refresh preferences from server */
  refreshPreferences: () => Promise<void>;
  /** Latest foreground notification */
  foregroundNotification: { title?: string; body?: string; data?: Record<string, string> } | null;
}

export function useNotifications(): UseNotificationsReturn {
  const { firebaseUser } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferencesResponse | null>(null);
  const [permissionState, setPermissionState] = useState<PushPermissionState>('default');
  const [pushSupported, setPushSupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [foregroundNotification, setForegroundNotification] = useState<{
    title?: string;
    body?: string;
    data?: Record<string, string>;
  } | null>(null);

  // Initialize: check support, load preferences
  useEffect(() => {
    if (!firebaseUser) {
      setLoading(false);
      return;
    }

    const init = async () => {
      const supported = await isPushSupported();
      setPushSupported(supported);
      setPermissionState(getPermissionState());
      await loadPreferences();
      setLoading(false);
    };

    init();
  }, [firebaseUser]);

  // Listen for foreground messages
  useEffect(() => {
    if (!pushSupported) return;

    const unsubscribe = onForegroundMessage((payload) => {
      setForegroundNotification(payload.notification || null);

      // Auto-clear after 5 seconds
      setTimeout(() => setForegroundNotification(null), 5000);
    });

    return () => unsubscribe();
  }, [pushSupported]);

  const loadPreferences = useCallback(async () => {
    if (!firebaseUser) return;

    try {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch('/api/notifications/preferences', {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (res.ok) {
        const data = await res.json();
        setPreferences(data.preferences);
      }
    } catch (error) {
      console.error('[useNotifications] Error loading preferences:', error);
    }
  }, [firebaseUser]);

  const enablePush = useCallback(async (): Promise<boolean> => {
    const token = await requestPushToken();

    if (token) {
      setPermissionState('granted');
      await trackPermissionChange('granted');
      await loadPreferences();
      return true;
    } else {
      const newState = getPermissionState();
      setPermissionState(newState);
      await trackPermissionChange(newState);
      return false;
    }
  }, [loadPreferences]);

  const disablePush = useCallback(async () => {
    await deactivatePushToken();
    setPermissionState('default');

    // Update preferences on server
    if (firebaseUser) {
      try {
        const idToken = await firebaseUser.getIdToken();
        await fetch('/api/notifications/preferences', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ pushEnabled: false }),
        });
        await loadPreferences();
      } catch (error) {
        console.error('[useNotifications] Error disabling push:', error);
      }
    }
  }, [firebaseUser, loadPreferences]);

  const updatePreferences = useCallback(
    async (updates: UpdateNotificationPreferencesPayload): Promise<boolean> => {
      if (!firebaseUser) return false;

      try {
        const idToken = await firebaseUser.getIdToken();
        const res = await fetch('/api/notifications/preferences', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(updates),
        });

        if (res.ok) {
          const data = await res.json();
          setPreferences(data.preferences);
          return true;
        }
        return false;
      } catch (error) {
        console.error('[useNotifications] Error updating preferences:', error);
        return false;
      }
    },
    [firebaseUser],
  );

  return {
    preferences,
    permissionState,
    pushSupported,
    loading,
    enablePush,
    disablePush,
    updatePreferences,
    refreshPreferences: loadPreferences,
    foregroundNotification,
  };
}
