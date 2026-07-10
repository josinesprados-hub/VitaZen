// ═══════════════════════════════════════════
// FIREBASE ADMIN WRAPPER — VitaZen Notifications
// Re-exports the Firebase Admin app for use in
// the notification service (avoids circular deps)
// ═══════════════════════════════════════════

import { getApps, initializeApp, cert } from 'firebase-admin/app';

export function getFirebaseAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error(
      'FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY are required for push notifications.'
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
