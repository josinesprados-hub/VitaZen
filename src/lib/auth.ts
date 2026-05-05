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
        where: { status: 'active' },
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
          where: { status: 'active' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (user) {
      console.log('[CRUD DEBUG] getAuthUser: found user by email (not firebaseUid). user.id:', user.id);
    }
  }

  return user;
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
