import { adminAuth } from './firebase-admin';
import { db } from './db';

export async function verifyFirebaseToken(idToken: string) {
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying Firebase token:', error);
    return null;
  }
}

export async function getAuthUser(idToken: string) {
  const decodedToken = await verifyFirebaseToken(idToken);
  if (!decodedToken) return null;

  // Search by firebaseUid first
  let user = await db.user.findUnique({
    where: { firebaseUid: decodedToken.uid },
    include: {
      aiUsage: true,
      subscriptions: {
        where: { status: { in: ['active', 'trialing'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  // If not found by firebaseUid, search by email (same logic as /api/auth/sync)
  if (!user && decodedToken.email) {
    user = await db.user.findUnique({
      where: { email: decodedToken.email },
      include: {
        aiUsage: true,
        subscriptions: {
          where: { status: { in: ['active', 'trialing'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (user) {
      console.log('[Auth] getAuthUser: found user by email (not firebaseUid). user.id:', user.id);
      // Sync firebaseUid to match the current auth method.
      // This happens when a user registered with one provider (e.g. email/password)
      // and later authenticates with another (e.g. Google) that has a different UID.
      // Safe because we've already verified the ID token.
      if (user.firebaseUid !== decodedToken.uid) {
        console.warn('[Auth] getAuthUser: updating firebaseUid from', user.firebaseUid, 'to', decodedToken.uid);
        await db.user.update({
          where: { id: user.id },
          data: { firebaseUid: decodedToken.uid },
        });
        user.firebaseUid = decodedToken.uid;
      }
    }
  }

  return user;
}

// ═══════════════════════════════════════════
// Lightweight auth lookup — only id, plan, firebaseUid
// ═══════════════════════════════════════════
// Use this in API routes that only need to identify the user
// and check their plan — skip the aiUsage + subscriptions joins.
// This saves 2 unnecessary joins per request on most routes.

export async function getAuthUserBasic(idToken: string): Promise<{ id: string; plan: string; firebaseUid: string; email: string } | null> {
  const decodedToken = await verifyFirebaseToken(idToken);
  if (!decodedToken) return null;

  // NOTE: Do NOT use `select` or `include: {}` here.
  // The PrismaPg driver adapter in Prisma 7 handles both differently
  // from a bare findUnique — returning null in edge cases where the
  // bare query succeeds. A plain findUnique({ where }) is the only
  // query pattern proven to work reliably with the driver adapter.
  // The small overhead of fetching all scalar fields is negligible
  // compared to the aiUsage + subscriptions joins we skip.

  let user = await db.user.findUnique({
    where: { firebaseUid: decodedToken.uid },
  });

  // Same email fallback as getAuthUser
  if (!user && decodedToken.email) {
    user = await db.user.findUnique({
      where: { email: decodedToken.email },
    });
    if (user && user.firebaseUid !== decodedToken.uid) {
      await db.user.update({
        where: { id: user.id },
        data: { firebaseUid: decodedToken.uid },
      });
    }
  }

  if (!user) return null;

  // Return only the fields the caller needs
  return {
    id: user.id,
    plan: user.plan,
    firebaseUid: user.firebaseUid,
    email: user.email,
  };
}

export async function syncUserToDatabase(firebaseUid: string, email: string, name?: string) {
  const existingUser = await db.user.findUnique({
    where: { firebaseUid },
  });

  if (existingUser) return existingUser;

  const user = await db.user.create({
    data: {
      firebaseUid,
      email,
      name: name || email.split('@')[0],
    },
  });

  // Initialize empire progress for all 5 empires
  await db.empireProgress.createMany({
    data: [
      { userId: user.id, empire: 'disciplina' },
      { userId: user.id, empire: 'mente' },
      { userId: user.id, empire: 'energia' },
      { userId: user.id, empire: 'riqueza' },
      { userId: user.id, empire: 'crecimiento' },
    ],
  });

  return user;
}
