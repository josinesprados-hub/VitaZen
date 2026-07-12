// ═══════════════════════════════════════════
// USE NOTIFICATIONS HOOK — VitaZen
// React hook for notification state & preferences
//
// Key behaviours:
// - Reads real browser permission state on mount
// - Detects permission revocation in real-time via PermissionStatus API
//   (with visibilitychange fallback for Safari)
// - Never shows "active" when permission is denied
// - All state reflects the real system state, never simulated
// ═══════════════════════════════════════════

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

  const initRef = useRef(false);

  // Ref to read current permission state inside event listener closures
  // without adding permissionState to the listener effect's dependencies
  // (which would cause the listener to re-bind on every state change).
  const permissionStateRef = useRef<PushPermissionState>('default');

  useEffect(() => {
    permissionStateRef.current = permissionState;
  }, [permissionState]);

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

  // ─── Initialize: check support, load preferences ───
  useEffect(() => {
    if (!firebaseUser) {
      setLoading(false);
      return;
    }

    // Only initialize once per auth session
    if (initRef.current) return;
    initRef.current = true;

    let cancelled = false;

    const init = async () => {
      try {
        const supported = await isPushSupported();
        if (cancelled) return;
        setPushSupported(supported);

        const permState = getPermissionState();
        setPermissionState(permState);
        permissionStateRef.current = permState;

        await loadPreferences();
        if (!cancelled) setLoading(false);
      } catch (error) {
        console.error('[useNotifications] Init error:', error);
        if (!cancelled) setLoading(false);
      }
    };

    init();

    return () => {
      cancelled = true;
      initRef.current = false;
    };
  }, [firebaseUser, loadPreferences]);

  // ─── Real-time permission change detection ───
  // Detects when the user revokes/grants notification permission from
  // browser settings (e.g., Chrome site settings, iOS Safari settings).
  //
  // Primary: PermissionStatus 'change' event (Chrome, Firefox, Edge)
  // Fallback: visibilitychange event (Safari doesn't support permissions
  //   query for 'notifications' — we re-check when the tab becomes visible)
  useEffect(() => {
    if (!pushSupported || !firebaseUser) return;

    const handlePermissionChanged = () => {
      const newState = getPermissionState();

      // Only act if the permission actually changed
      if (newState === permissionStateRef.current) return;

      setPermissionState(newState);

      if (newState === 'denied') {
        // Permission was revoked — notify server so it deactivates all
        // tokens and sets pushEnabled=false, then refresh preferences
        // so the UI transitions to the "denied" state.
        trackPermissionChange('denied').then(() => loadPreferences());
      } else {
        // Permission was re-granted or reset — sync preferences
        loadPreferences();
      }
    };

    let permissionStatus: PermissionStatus | null = null;
    let removeVisibilityListener: (() => void) | null = null;

    const setup = async () => {
      try {
        // Primary: PermissionStatus change event (Chrome, Firefox, Edge)
        permissionStatus = await navigator.permissions.query({
          name: 'notifications' as PermissionName,
        });
        permissionStatus.addEventListener('change', handlePermissionChanged);
      } catch {
        // Fallback: re-check on visibility change.
        // Safari doesn't support navigator.permissions.query for 'notifications',
        // so we check Notification.permission when the user returns to the tab.
        const onVisibility = () => {
          if (document.visibilityState === 'visible') {
            handlePermissionChanged();
          }
        };
        document.addEventListener('visibilitychange', onVisibility);
        removeVisibilityListener = () => document.removeEventListener('visibilitychange', onVisibility);
      }
    };

    setup();

    return () => {
      if (permissionStatus) {
        permissionStatus.removeEventListener('change', handlePermissionChanged);
      }
      if (removeVisibilityListener) {
        removeVisibilityListener();
      }
    };
  }, [pushSupported, firebaseUser, loadPreferences]);

  // ─── Listen for foreground messages ───
  useEffect(() => {
    if (!pushSupported) return;

    let autoClearTimer: ReturnType<typeof setTimeout>;

    const unsubscribe = onForegroundMessage((payload) => {
      setForegroundNotification(payload.notification || null);

      // Auto-clear after 5 seconds
      clearTimeout(autoClearTimer);
      autoClearTimer = setTimeout(() => setForegroundNotification(null), 5000);
    });

    return () => {
      unsubscribe();
      clearTimeout(autoClearTimer);
    };
  }, [pushSupported]);

  // ─── Enable push ───
  const enablePush = useCallback(async (): Promise<boolean> => {
    const token = await requestPushToken();

    if (token) {
      const state = 'granted' as const;
      setPermissionState(state);
      permissionStateRef.current = state;
      await trackPermissionChange(state);
      await loadPreferences();
      return true;
    } else {
      const newState = getPermissionState();
      setPermissionState(newState);
      permissionStateRef.current = newState;
      await trackPermissionChange(newState);
      return false;
    }
  }, [loadPreferences]);

  // ─── Disable push ───
  const disablePush = useCallback(async () => {
    await deactivatePushToken();

    const state = 'default' as const;
    setPermissionState(state);
    permissionStateRef.current = state;

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

  // ─── Update preferences ───
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