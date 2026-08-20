export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

// GET /api/settings — Fetch current user settings
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const user = await getAuthUser(idToken);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      settings: {
        weeklyEmailSummary: user.weeklyEmailSummary,
        dailyReminders: user.dailyReminders,
        privacyStatsVisible: user.privacyStatsVisible,
      },
    });
  } catch (error) {
    console.error('[Settings] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/settings — Update current user settings
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const user = await getAuthUser(idToken);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'El formato de la solicitud no es válido' }, { status: 400 });
    }

    // Reject non-object bodies (arrays, strings, numbers, null)
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: 'El formato de la solicitud no es válido' }, { status: 400 });
    }

    const record = body as Record<string, unknown>;

    // NOTE (settings):
    //   weeklyEmailSummary  → CONSUMED by weekly-recap-sender.ts (cron)
    //   dailyReminders      → CONSUMED by notifications/reminders/daily.ts:188 (cron pre-filter)
    //   privacyStatsVisible → CONSUMED by usePrivacy() hook → <PrivacyMask> component
    //     Controls visual masking of personal metrics (scores, streaks, counts, balances).
    //     When false (= private), sensitive numbers are gently blurred in the UI.

    // Only accept known boolean fields. Extra fields are silently ignored
    // (Prisma would reject unknown fields anyway, but explicit allowlisting
    // provides a clear security boundary and HTTP 400 for empty payloads).
    const ALLOWED_SETTINGS = ['weeklyEmailSummary', 'dailyReminders', 'privacyStatsVisible'] as const;
    const data: Record<string, boolean> = {};

    for (const key of ALLOWED_SETTINGS) {
      if (typeof record[key] === 'boolean') {
        data[key] = record[key] as boolean;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No se han proporcionado ajustes válidos' }, { status: 400 });
    }

    const updatedUser = await db.user.update({
      where: { id: user.id },
      data,
    });

    return NextResponse.json({
      settings: {
        weeklyEmailSummary: updatedUser.weeklyEmailSummary,
        dailyReminders: updatedUser.dailyReminders,
        privacyStatsVisible: updatedUser.privacyStatsVisible,
      },
    });
  } catch (error) {
    console.error('[Settings] PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
