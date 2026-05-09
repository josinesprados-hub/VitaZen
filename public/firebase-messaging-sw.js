// ═══════════════════════════════════════════
// FIREBASE MESSAGING SERVICE WORKER — VitaZen
// Handles push notifications when the app is in the background.
//
// Design: minimal, non-intrusive, calm.
// Notifications appear once, no badge accumulation,
// no sound spam, no vibration patterns.
// ═══════════════════════════════════════════

/* eslint-disable no-undef */

importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: self.__VITAZEN_FIREBASE_API_KEY || '',
  authDomain: self.__VITAZEN_FIREBASE_AUTH_DOMAIN || '',
  projectId: self.__VITAZEN_FIREBASE_PROJECT_ID || '',
  storageBucket: self.__VITAZEN_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: self.__VITAZEN_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: self.__VITAZEN_FIREBASE_APP_ID || '',
});

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage((payload) => {
  const { notification, data } = payload;

  // Calm notification config:
  // - No renotify (won't keep buzzing)
  // - Silent by default (no sound — user controls device settings)
  // - Tag by type prevents stacking (only latest per type shows)
  const title = notification?.title || 'VitaZen';
  const body = notification?.body || '';
  const type = data?.type || 'general';
  const url = data?.url || '/dashboard';

  const notificationOptions = {
    body,
    icon: '/images/vitazen-logo.png',
    badge: '/images/icon-192x192.png',
    tag: `vitazen-${type}`, // Dedup: same tag replaces previous
    renotify: false,
    silent: true, // No sound — respect user's device settings
    data: { url },
  };

  self.registration.showNotification(title, notificationOptions);
});

// Handle notification click — navigate to the deep link
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    }),
  );
});
