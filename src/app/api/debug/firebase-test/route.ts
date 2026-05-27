export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

// TEMPORAL: Diagnostic endpoint to verify Firebase Admin setup.
export async function GET() {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'MISSING',
    hasClientEmail: !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL || 'MISSING',
    hasPrivateKey: !!process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    privateKeyLength: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.length || 0,
    privateKeyHasRealNewlines: process.env.FIREBASE_ADMIN_PRIVATE_KEY
      ? process.env.FIREBASE_ADMIN_PRIVATE_KEY.includes('\n')
      : false,
  };

  // Try to verify a fake token to see if Firebase Admin is properly initialized
  try {
    await adminAuth.verifyIdToken('fake_token_for_testing');
    results.verifyResult = 'unexpected_success';
  } catch (error: any) {
    results.verifyResult = 'failed_as_expected';
    results.verifyErrorCode = error?.code || error?.errorInfo?.code || 'unknown';
    results.verifyErrorMessage = error?.message?.substring(0, 200) || String(error).substring(0, 200);
  }

  return NextResponse.json(results, { status: 200 });
}
