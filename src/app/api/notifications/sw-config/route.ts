// ═══════════════════════════════════════════
// SERVICE WORKER FIREBASE CONFIG — VitaZen
// Serves Firebase config as JavaScript so the
// service worker can importScripts() it.
//
// BUG FIX: The service worker (public/firebase-messaging-sw.js)
// uses self.__VITAZEN_FIREBASE_* variables that were NEVER set,
// causing Firebase to initialize with empty strings and making
// all background push notifications silently fail.
//
// This route injects the NEXT_PUBLIC_FIREBASE_* env vars into
// the service worker context at runtime.
// ═══════════════════════════════════════════

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  };

  const js = `
// Auto-generated Firebase config for service worker
self.__VITAZEN_FIREBASE_API_KEY = ${JSON.stringify(config.apiKey)};
self.__VITAZEN_FIREBASE_AUTH_DOMAIN = ${JSON.stringify(config.authDomain)};
self.__VITAZEN_FIREBASE_PROJECT_ID = ${JSON.stringify(config.projectId)};
self.__VITAZEN_FIREBASE_STORAGE_BUCKET = ${JSON.stringify(config.storageBucket)};
self.__VITAZEN_FIREBASE_MESSAGING_SENDER_ID = ${JSON.stringify(config.messagingSenderId)};
self.__VITAZEN_FIREBASE_APP_ID = ${JSON.stringify(config.appId)};
`;

  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
