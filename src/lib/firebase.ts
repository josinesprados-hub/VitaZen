import { initializeApp, getApps } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

let _auth: Auth | undefined;

/**
 * Lazy-initialized Firebase Auth instance.
 * getAuth(app) runs only on first call, not at module import time.
 * This prevents startup crashes in Android TWA/WebView where
 * IndexedDB persistence initialization can block or fail before
 * React hydrates.
 */
export function getAuthInstance(): Auth {
  if (!_auth) {
    _auth = getAuth(app);
  }
  return _auth;
}

export default app;
