// ═══════════════════════════════════════════
// USE NOTIFICATIONS HOOK — VitaZen
// React hook for notification state & preferences
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
  /** ERR-4: true when initial preferences load failed */
  loadError: boolean;
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
  // ERR-4: track whether the initial preferences load failed
  const [loadError, setLoadError] = useState(false);
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

  // ERR-4: loadPreferences now sets loadError on failure
  // and clears it on success, so the component can differentiate
  // "still loading" from "load failed".
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
        setLoadError(false);
      } else {
        // Non-OK response — if we had no preferences before, this is an error
        setLoadError(prev => prev); // preserve existing error state
      }
    } catch (error) {
      console.error('[useNotifications] Error loading preferences:', error);
      // Only set error if preferences haven't loaded yet
      setPreferences(prev => {
        if (prev === null) setLoadError(true);
        return prev;
      });
    }
  }, [firebaseUser]);

  // Initialize: check support, load preferences
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
        if (!cancelled) {
          setLoading(false);
          setLoadError(true);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      initRef.current = false;
    };
  }, [firebaseUser, loadPreferences]);

  // Real-time permission change detection.
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

  // Listen for foreground messages
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

  // Enable push
  // ERR-8: The optimistic update no longer creates a full default preferences
  // object with hardcoded values. When prev is null (init failed / loadError),
  // we only set pushEnabled:true minimally so the render condition passes.
  // The subsequent loadPreferences() call corrects to real server values.
  const enablePush = useCallback(async (): Promise<boolean> => {
    const token = await requestPushToken();

    // After requestPushToken, always sync the real browser permission state.
    // Even if token registration failed, the user may have granted permission.
    const actualPermission = getPermissionState();
    setPermissionState(actualPermission);
    permissionStateRef.current = actualPermission;

    if (token) {
      // Optimistic state update: the register-token endpoint guarantees
      // pushEnabled=true after successful registration. Update immediately
      // so the UI transitions without waiting for the loadPreferences round-trip.
      setPreferences(prev => {
        if (prev) return { ...prev, pushEnabled: true };
        // ERR-8 / H-14: Preferences not loaded yet — set only pushEnabled
        // and reuse current timezone. Avoids fabricating defaults for fields
        // the user never chose. loadPreferences() will correct immediately.
        return {
          pushEnabled: true,
          checkinReminders: false,
          weeklyRecap: false,
          comebackReminders: false,
          reflectionReminders: false,
          quietHoursEnabled: false,
          quietHoursStart: '22:00',
          quietHoursEnd: '08:00',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          maxDailyNotifications: 2,
          permissionState: 'granted' as const,
        };
      });

      await trackPermissionChange(actualPermission);

      // Set the user's real timezone so quiet hours (22:00-08:00)
      // align with their local time, not the server default.
      if (firebaseUser) {
        try {
          const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (userTimezone) {
            const idToken = await firebaseUser.getIdToken();
            await fetch('/api/notifications/preferences', {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`,
              },
              body: JSON.stringify({ timezone: userTimezone }),
            });
          }
        } catch {
          // Non-critical: quiet hours will use the server default timezone
        }
      }

      // Sync full state from server (confirms optimistic update)
      await loadPreferences();
      return true;
    } else {
      // Token registration failed (or not supported). If the user DID grant
      // permission but we couldn't get/register a token, we must still tell
      // the server so that pushEnabled reflects reality. Otherwise the UI
      // shows "Activar" forever while the OS permission is already granted.
      await trackPermissionChange(actualPermission);

      // If permission was granted but token failed, try a server-side
      // preferences sync so the UI has the latest server state.
      if (actualPermission === 'granted') {
        if (firebaseUser) {
          try {
            const idToken = await firebaseUser.getIdToken();
            await fetch('/api/notifications/preferences', {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`,
              },
              body: JSON.stringify({ pushEnabled: true }),
            });
          } catch {
            // Best-effort: loadPreferences below will re-sync
          }
        }
        await loadPreferences();
      }

      return false;
    }
  }, [loadPreferences, firebaseUser]);

  // Disable push
  // ERR-7: If the server PATCH fails, the optimistic update (pushEnabled: false)
  // would leave the UI out of sync with the server (UI shows disabled but
  // server still has enabled). Fix: always call loadPreferences() in the
  // catch to re-sync, even on failure.
  const disablePush = useCallback(async () => {
    await deactivatePushToken();

    const state = 'default' as const;
    setPermissionState(state);
    permissionStateRef.current = state;

    // Optimistic update: immediately reflect the disabled state in the UI
    // so the user sees the transition without waiting for the server round-trip.
    setPreferences(prev => {
      if (!prev) return prev;
      return { ...prev, pushEnabled: false };
    });

    // Update preferences on server (also deactivates all tokens server-side)
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
      } catch (error) {
        console.error('[useNotifications] Error disabling push:', error);
      } finally {
        // ERR-7: Always re-sync from server, whether the PATCH succeeded or failed.
        // If it failed, loadPreferences restores the real server state,
        // undoing the optimistic update so the UI is consistent.
        await loadPreferences();
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
    loadError,
    enablePush,
    disablePush,
    updatePreferences,
    refreshPreferences: loadPreferences,
    foregroundNotification,
  };
}
