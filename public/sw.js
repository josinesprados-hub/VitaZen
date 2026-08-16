// ═══════════════════════════════════════════════════════════════════
// VITAZEN PRODUCTION SERVICE WORKER — Unified SW
// Handles: PWA caching (precache + runtime) + Firebase Cloud Messaging
//
// Architecture:
//   - Single SW at scope '/' replaces the previous firebase-messaging-sw.js
//   - Precaches app shell on install (icons, manifest, fonts, core images)
//   - Runtime caching: Cache-First for static, Network-First for pages/API
//   - Firebase messaging for push notifications (foreground + background)
//   - Offline fallback page for navigation requests when offline
// ═══════════════════════════════════════════════════════════════════

/* eslint-disable no-undef */

// ── Configuration ──────────────────────────────────────────────

const CACHE_VERSION = 'vz-cache-v1';

const PRECACHE_ASSETS = [
  // App manifest & metadata
  '/manifest.json',
  '/favicon.ico',
  '/robots.txt',

  // Core brand images (stable, change infrequently)
  '/images/icon-192x192.png',
  '/images/icon-512x512.png',
  '/images/icon-1024x1024.png',
  '/images/maskable-icon-192x192.png',
  '/images/maskable-icon-512x512.png',
  '/images/apple-touch-icon.png',
  '/images/favicon-16x16.png',
  '/images/favicon-32x32.png',
  '/images/v-gold-logo.png',
  '/images/og-share-preview.png',

  // Offline fallback
  '/offline.html',
];

// Cache names by strategy
const CACHES = {
  precache: `vz-precache-${CACHE_VERSION}`,
  static: 'vz-static-v1',
  pages: 'vz-pages-v1',
  api: 'vz-api-v1',
  fonts: 'vz-fonts-v1',
};

// Maximum entries per runtime cache (LRU eviction)
const MAX_CACHE_ENTRIES = {
  static: 200,
  pages: 50,
  api: 100,
  fonts: 30,
};

// TTL for different cache types (seconds)
const CACHE_TTL = {
  static: 30 * 24 * 60 * 60,   // 30 days
  pages: 7 * 24 * 60 * 60,     // 7 days
  api: 5 * 60,                  // 5 minutes
  fonts: 365 * 24 * 60 * 60,   // 1 year
};

// ── Utility Functions ──────────────────────────────────────────

/**
 * Determines the caching strategy based on the request URL and type.
 */
function getStrategy(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // API calls: Network First (always try fresh data, fallback to cache)
  if (path.startsWith('/api/')) {
    return { name: CACHES.api, strategy: 'network-first', maxEntries: MAX_CACHE_ENTRIES.api };
  }

  // Firebase config endpoint: Network only (dynamic, can't cache)
  if (path.startsWith('/api/notifications/sw-config')) {
    return { strategy: 'network-only' };
  }

  // Fonts (Google Fonts, self-hosted): Cache First (very stable)
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com') ||
      path.endsWith('.woff2') || path.endsWith('.woff') ||
      path.endsWith('.ttf') || path.endsWith('.otf')) {
    return { name: CACHES.fonts, strategy: 'cache-first', maxEntries: MAX_CACHE_ENTRIES.fonts };
  }

  // Static assets (images, CSS, JS bundles): Cache First
  if (path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|avif|mp4|webm)$/)) {
    return { name: CACHES.static, strategy: 'cache-first', maxEntries: MAX_CACHE_ENTRIES.static };
  }

  // Navigation requests (HTML pages): Network First with cache fallback
  if (request.mode === 'navigate') {
    return { name: CACHES.pages, strategy: 'network-first', maxEntries: MAX_CACHE_ENTRIES.pages };
  }

  // Default: Stale While Revalidate (good for mixed content)
  return { name: CACHES.static, strategy: 'stale-while-revalidate', maxEntries: MAX_CACHE_ENTRIES.static };
}

/**
 * Evicts old entries from a cache to stay within the max limit.
 */
async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
      // Delete oldest entries (first in = first out)
      const deleteCount = keys.length - maxEntries;
      for (let i = 0; i < deleteCount; i++) {
        await cache.delete(keys[i]);
      }
    }
  } catch (e) {
    console.warn('[VitaZen SW] trimCache error:', e);
  }
}

/**
 * Checks if a cached response is still fresh based on the Date header.
 */
function isFresh(response, maxAgeSeconds) {
  if (!response || !response.headers) return false;
  const dateStr = response.headers.get('date');
  if (!dateStr) return true; // No date header, assume fresh
  const cachedTime = new Date(dateStr).getTime();
  const now = Date.now();
  return (now - cachedTime) < (maxAgeSeconds * 1000);
}

// ── Firebase Cloud Messaging ───────────────────────────────────
// Inject Firebase config from server (env vars unavailable in public/)
importScripts('/api/notifications/sw-config');
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

// Background message handler — calm, minimal notification design
messaging.onBackgroundMessage((payload) => {
  const { notification, data } = payload;

  const title = notification?.title || 'VitaZen';
  const body = notification?.body || '';
  const type = data?.type || 'general';
  const url = data?.url || '/dashboard';

  const notificationOptions = {
    body,
    icon: '/images/icon-192x192.png',
    badge: '/images/favicon-32x32.png',
    tag: `vitazen-${type}`,
    renotify: false,
    silent: true,
    data: { url },
  };

  self.registration.showNotification(title, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

// ── Service Worker Lifecycle ───────────────────────────────────

/**
 * INSTALL: Pre-cache critical app shell assets.
 * These are stable files that rarely change between deployments.
 */
self.addEventListener('install', (event) => {
  console.log('[VitaZen SW] Installing, precaching app shell...');

  event.waitUntil(
    caches.open(CACHES.precache)
      .then((cache) => {
        // Use addAll for atomic precaching — fails entirely if any URL fails
        // Filter out /offline.html from initial precache (may not exist yet)
        const assets = PRECACHE_ASSETS.filter(u => u !== '/offline.html');
        return cache.addAll(assets);
      })
      .then(() => {
        console.log('[VitaZen SW] App shell precached successfully');
        // Activate immediately without waiting for old SW to finish
        return self.skipWaiting();
      })
      .catch((err) => {
        console.warn('[VitaZen SW] Precache failed (non-critical, will retry):', err.message);
        // Don't block install on precache failure — runtime caching still works
        return self.skipWaiting();
      })
  );
});

/**
 * ACTIVATE: Clean up old caches from previous versions.
 * Claims all open clients so the new SW controls pages immediately.
 */
self.addEventListener('activate', (event) => {
  console.log('[VitaZen SW] Activating, cleaning old caches...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        const currentCaches = new Set(Object.values(CACHES));
        const deletePromises = cacheNames
          .filter((name) => !currentCaches.has(name))
          .map((name) => {
            console.log('[VitaZen SW] Deleting old cache:', name);
            return caches.delete(name);
          });
        return Promise.all(deletePromises);
      })
      .then(() => {
        // Take control of all open tabs immediately
        return self.clients.claim();
      })
      .then(() => {
        console.log('[VitaZen SW] Activation complete');
      })
  );
});

/**
 * FETCH: Route requests through appropriate caching strategies.
 *
 * Strategies:
 *   - Cache First: Static assets, fonts. Fast, offline-capable.
 *   - Network First: Pages, API calls. Fresh data, cache as fallback.
 *   - Stale While Revalidate: Default. Serve from cache, update in background.
 *   - Network Only: Dynamic endpoints that can't be cached.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests except for Google Fonts and gstatic
  const isCrossOrigin = url.origin !== self.location.origin;
  const allowedOrigins = [
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
  ];
  if (isCrossOrigin && !allowedOrigins.includes(url.origin)) return;

  const config = getStrategy(request);

  switch (config.strategy) {
    case 'network-only':
      // Let the browser handle it normally (no caching)
      return;

    case 'cache-first':
      event.respondWith(cacheFirst(request, config));
      return;

    case 'network-first':
      event.respondWith(networkFirst(request, config));
      return;

    case 'stale-while-revalidate':
      event.respondWith(staleWhileRevalidate(request, config));
      return;

    default:
      return;
  }
});

// ── Caching Strategy Implementations ───────────────────────────

/**
 * CACHE FIRST: Check cache first, fall back to network.
 * Best for: static assets, fonts, images that rarely change.
 * Cached responses are served instantly, then updated in background.
 */
async function cacheFirst(request, config) {
  try {
    const cache = await caches.open(config.name);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      // Serve from cache, update in background
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            cache.put(request, networkResponse.clone());
            trimCache(config.name, config.maxEntries);
          }
          return networkResponse;
        })
        .catch(() => null); // Silently fail background update

      // Return cached immediately, don't wait for network
      return cachedResponse;
    }

    // Not in cache — fetch from network
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
      trimCache(config.name, config.maxEntries);
    }
    return networkResponse;
  } catch (err) {
    // Network failed and no cache — return a basic error for non-navigation
    if (request.mode === 'navigate') {
      return getCachedOfflinePage();
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

/**
 * NETWORK FIRST: Try network first, fall back to cache.
 * Best for: HTML pages, API responses that need fresh data.
 */
async function networkFirst(request, config) {
  try {
    // Try network with a timeout
    const networkPromise = fetchWithTimeout(request, 5000);
    const networkResponse = await networkPromise;

    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(config.name);
      cache.put(request, networkResponse.clone());
      trimCache(config.name, config.maxEntries);
      return networkResponse;
    }

    // Network returned non-OK status — try cache
    return getCacheFallback(request, config);
  } catch (err) {
    // Network failed — try cache
    const cached = await getCacheFallback(request, config);
    if (cached) return cached;

    // No cache either — offline page for navigation, error for others
    if (request.mode === 'navigate') {
      return getCachedOfflinePage();
    }
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * STALE WHILE REVALIDATE: Serve from cache immediately,
 * then update cache from network in the background.
 * Best for: resources where freshness matters but availability is critical.
 */
async function staleWhileRevalidate(request, config) {
  const cache = await caches.open(config.name);
  const cachedResponse = await cache.match(request);

  // Always fetch in background to update cache
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.ok) {
        cache.put(request, networkResponse.clone());
        trimCache(config.name, config.maxEntries);
      }
      return networkResponse;
    })
    .catch(() => null);

  // Return cached if available, otherwise wait for network
  return cachedResponse || fetchPromise;
}
// ── Helper Functions ────────────────────────────────────────────

/**
 * Fetch with a timeout to prevent hanging on slow networks.
 */
function fetchWithTimeout(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Network timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    fetch(request)
      .then((response) => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
  });
}

/**
 * Try to get a cached response, checking TTL for API responses.
 */
async function getCacheFallback(request, config) {
  const cache = await caches.open(config.name);
  const cachedResponse = await cache.match(request);

  if (!cachedResponse) return null;

  // For API cache, check if the response is still fresh
  if (config.name === CACHES.api) {
    if (!isFresh(cachedResponse, CACHE_TTL.api)) {
      // Expired — don't use it
      return null;
    }
  }

  return cachedResponse;
}

/**
 * Serve the offline fallback page for navigation requests.
 */
async function getCachedOfflinePage() {
  const cache = await caches.open(CACHES.precache);
  const offlinePage = await cache.match('/offline.html');

  if (offlinePage) return offlinePage;

  // If offline.html isn't cached, generate a minimal fallback
  return new Response(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>VitaZen — Sin conexión</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #000; color: #fff; font-family: -apple-system, sans-serif;
               display: flex; align-items: center; justify-content: center;
               min-height: 100vh; text-align: center; padding: 24px; }
        .container { max-width: 320px; }
        .logo { font-size: 48px; margin-bottom: 24px; color: #c8a55a; }
        h1 { font-size: 20px; margin-bottom: 8px; }
        p { color: #999; font-size: 14px; line-height: 1.5; margin-bottom: 24px; }
        button { background: #c8a55a; color: #000; border: none; padding: 12px 24px;
                border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
        button:active { opacity: 0.8; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">V</div>
        <h1>Sin conexión</h1>
        <p>No hay conexión a Internet disponible. Revisa tu conexión e inténtalo de nuevo.</p>
        <button onclick="window.location.reload()">Reintentar</button>
      </div>
    </body>
    </html>
  `, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

console.log('[VitaZen SW] Service worker loaded —', CACHE_VERSION);
