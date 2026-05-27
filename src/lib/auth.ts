import { adminAuth } from './firebase-admin';
import { db } from './db';

export async function verifyFirebaseToken(idToken: string) {
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    console.log(JSON.stringify({ vz_debug: true, fn: 'verifyFirebaseToken', step: 'success', uid: decodedToken.uid, email: decodedToken.email }));
    return decodedToken;
  } catch (error) {
    console.error(JSON.stringify({ vz_debug: true, fn: 'verifyFirebaseToken', step: 'failed', error: error instanceof Error ? error.message : String(error), code: (error as any)?.code }));
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
  if (!decodedToken) {
    console.log(JSON.stringify({ vz_debug: true, fn: 'getAuthUserBasic', step: 'noDecodedToken' }));
    return null;
  }

  // NOTE: Do NOT use `select` or `include: {}` here.
  // The PrismaPg driver adapter in Prisma 7 handles both differently
  // from a bare findUnique — returning null in edge cases where the
  // bare query succeeds. A plain findUnique({ where }) is the only
  // query pattern proven to work reliably with the driver adapter.
  // The small overhead of fetching all scalar fields is negligible
  // compared to the aiUsage + subscriptions joins we skip.

  const t0 = Date.now();
  let user = await db.user.findUnique({
    where: { firebaseUid: decodedToken.uid },
  });
  console.log(JSON.stringify({ vz_debug: true, fn: 'getAuthUserBasic', step: 'findByUid', uid: decodedToken.uid, found: !!user, isNull: user === null, durationMs: Date.now() - t0 }));

  // Same email fallback as getAuthUser
  if (!user && decodedToken.email) {
    const t1 = Date.now();
    user = await db.user.findUnique({
      where: { email: decodedToken.email },
    });
    console.log(JSON.stringify({ vz_debug: true, fn: 'getAuthUserBasic', step: 'findByEmail', email: decodedToken.email, found: !!user, isNull: user === null, durationMs: Date.now() - t1 }));
    if (user && user.firebaseUid !== decodedToken.uid) {
      await db.user.update({
        where: { id: user.id },
        data: { firebaseUid: decodedToken.uid },
      });
    }
  }

  if (!user) {
    // User verified in Firebase but not found in DB.
    // This can happen if the initial /api/auth/sync failed or was interrupted.
    // Auto-create the user to self-heal, same as /api/auth/sync does.
    if (decodedToken.email) {
      console.log(JSON.stringify({ vz_debug: true, fn: 'getAuthUserBasic', step: 'autoSync', uid: decodedToken.uid, email: decodedToken.email }));
      try {
        user = await syncUserToDatabase(decodedToken.uid, decodedToken.email, decodedToken.name);
      } catch (syncError) {
        console.error(JSON.stringify({ vz_debug: true, fn: 'getAuthUserBasic', step: 'autoSyncFailed', error: syncError instanceof Error ? syncError.message : String(syncError) }));
        return null;
      }
    } else {
      console.log(JSON.stringify({ vz_debug: true, fn: 'getAuthUserBasic', step: 'userNotFoundNoEmail', uid: decodedToken.uid }));
      return null;
    }
  }

  console.log(JSON.stringify({ vz_debug: true, fn: 'getAuthUserBasic', step: 'success', userId: user.id, plan: user.plan }));
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
