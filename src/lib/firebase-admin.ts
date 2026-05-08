import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

function getFirebaseAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error(
      'FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY are required. ' +
      'Get them from Firebase Console > Project Settings > Service Accounts > Generate New Private Key.'
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

// Lazy initialization via Proxy — defers Firebase Admin setup until first actual use.
// This prevents build failures when env vars are unavailable during static prerendering.
// All existing `adminAuth.verifyIdToken()` etc. calls work unchanged.
let _adminAuth: ReturnType<typeof getAdminAuth> | null = null;

function getLazyAuth() {
  if (!_adminAuth) {
    _adminAuth = getAdminAuth(getFirebaseAdminApp());
  }
  return _adminAuth;
}

export const adminAuth = new Proxy({} as ReturnType<typeof getAdminAuth>, {
  get(_target, prop) {
    const auth = getLazyAuth();
    const value = (auth as any)[prop];
    if (typeof value === 'function') {
      return value.bind(auth);
    }
    return value;
  },
});
