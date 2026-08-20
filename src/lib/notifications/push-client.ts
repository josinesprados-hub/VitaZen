// ═══════════════════════════════════════════
// PUSH CLIENT — VitaZen
// Browser-side FCM token management & permission handling
//
// Design principles:
// - NEVER auto-prompt for permissions
// - Only request after explicit user action (toggle)
// - Handle token rotation gracefully
// - Clean up on permission denial
// ═══════════════════════════════════════════

import { getApp } from 'firebase/app';
import {
  getMessaging,
  getToken,
  deleteToken,
  isSupported,
  onMessage,
} from 'firebase/messaging';
import type { PushPermissionState } from './types';
import { trackPushTokenRegistrationFailure, trackPushNotSupported, trackPushPermissionDenied, trackPushVapidKeyMissing, trackSWRegistrationFailure } from '@/lib/observability/notification-tracking';

let messagingInstance: ReturnType<typeof getMessaging> | null = null;
let currentToken: string | null = null;

/**
 * Check if push notifications are supported in this browser.
 * Returns false for SSR, non-HTTPS, or unsupported browsers.
 */
export async function isPushSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    const supported = await isSupported();
    if (!supported) return false;

    // Check for service worker support
    if (!('serviceWorker' in navigator)) return false;

    // Check for PushManager
    if (!('PushManager' in window)) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current browser notification permission state.
 */
export function getPermissionState(): PushPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'not_supported';
  }

  switch (Notification.permission) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    default:
      return 'default';
  }
}

/**
 * Initialize Firebase Messaging and get a push token.
 *
 * IMPORTANT: This should ONLY be called when the user explicitly
 * enables push notifications via the toggle in settings.
 * It will trigger the browser permission prompt if not yet granted.
 *
 * Returns the token or null if denied/not supported.
 */
export async function requestPushToken(): Promise<string | null> {
  try {
    const supported = await isPushSupported();
    if (!supported) {
      console.warn('[PushClient] Push not supported in this browser');
      trackPushNotSupported();
      return null;
    }

    const app = getApp();
    messagingInstance = getMessaging(app);

    // Request permission — this shows the browser prompt
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[PushClient] Permission not granted:', permission);
      trackPushPermissionDenied();
      return null;
    }

    // Get FCM registration token
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.error('[PushClient] NEXT_PUBLIC_FIREBASE_VAPID_KEY not set');
      trackPushVapidKeyMissing();
      return null;
    }

    const token = await getToken(messagingInstance, {
      vapidKey,
      serviceWorkerRegistration: await getOrCreateSWRegistration(),
    });

    if (token) {
      currentToken = token;
      await registerTokenWithServer(token);
    }

    return token;
  } catch (error) {
    console.error('[PushClient] Error requesting push token:', error);
    trackPushTokenRegistrationFailure(error);
    return null;
  }
}

/**
 * Deactivate the current push token.
 * Called when the user disables push notifications.
 */
export async function deactivatePushToken(): Promise<void> {
  try {
    // Deactivate ALL server-side tokens for this user, not just the one
    // in the module-level currentToken variable. This covers cases where
    // currentToken is null (HMR, error recovery) or tokens were registered
    // in other tabs/sessions.
    const { getAuth } = await import('firebase/auth');
    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (currentUser) {
      const idToken = await currentUser.getIdToken();
      await fetch('/api/notifications/deactivate-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
      });
    }

    if (messagingInstance) {
      try {
        await deleteToken(messagingInstance);
      } catch {
        // Token may already be invalid
      }
    }

    currentToken = null;
  } catch (error) {
    console.error('[PushClient] Error deactivating push token:', error);
  }
}

/**
 * Listen for foreground messages (when the app is open).
 * Shows a gentle notification or updates UI state.
 */
export function onForegroundMessage(
  callback: (payload: { notification?: { title?: string; body?: string }; data?: Record<string, string> }) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  try {
    if (!messagingInstance) {
      const app = getApp();
      messagingInstance = getMessaging(app);
    }

    return onMessage(messagingInstance, (payload) => {
      callback({
        notification: payload.notification as { title?: string; body?: string } | undefined,
        data: payload.data as Record<string, string> | undefined,
      });
    });
  } catch {
    // Firebase messaging not available — return no-op unsubscribe
    return () => {};
  }
}

/**
 * Get or create a service worker registration.
 * Registers the unified sw.js (handles both PWA caching and FCM push).
 * Falls back to firebase-messaging-sw.js for any existing registrations.
 */
async function getOrCreateSWRegistration(): Promise<ServiceWorkerRegistration> {
  try {
    // Prefer the unified production SW (sw.js)
    const unifiedReg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (unifiedReg) return unifiedReg;

    // Check for legacy firebase-messaging-sw.js registration
    const legacyReg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    if (legacyReg) return legacyReg;

    // Register the unified production service worker
    return navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
  } catch (error) {
    trackSWRegistrationFailure(error);
    throw error;
  }
}

/**
 * Register the FCM token with our backend.
 */
async function registerTokenWithServer(token: string): Promise<void> {
  try {
    // Get the current user's ID token from Firebase Auth
    const { getAuth } = await import('firebase/auth');
    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      console.warn('[PushClient] No authenticated user — cannot register token');
      return;
    }

    const idToken = await currentUser.getIdToken();

    const res = await fetch('/api/notifications/register-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        token,
        platform: 'web',
        userAgent: navigator.userAgent.substring(0, 200), // Truncate for storage
      }),
    });

    if (!res.ok) {
      console.error('[PushClient] Failed to register token:', res.status);
    }
  } catch (error) {
    console.error('[PushClient] Error registering token:', error);
  }
}

/**
 * Track permission state changes on the server.
 * Called when the user changes browser notification settings.
 */
export async function trackPermissionChange(state: PushPermissionState): Promise<void> {
  try {
    const { getAuth } = await import('firebase/auth');
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const idToken = await currentUser.getIdToken();

    await fetch('/api/notifications/permission', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ permissionState: state }),
    });
  } catch (error) {
    console.error('[PushClient] Error tracking permission:', error);
  }
}
