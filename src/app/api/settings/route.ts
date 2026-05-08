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

    const body = await request.json();
    const { weeklyEmailSummary, dailyReminders, privacyStatsVisible } = body;

    // Only accept boolean values for settings
    const data: Record<string, boolean> = {};
    if (typeof weeklyEmailSummary === 'boolean') data.weeklyEmailSummary = weeklyEmailSummary;
    if (typeof dailyReminders === 'boolean') data.dailyReminders = dailyReminders;
    if (typeof privacyStatsVisible === 'boolean') data.privacyStatsVisible = privacyStatsVisible;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid settings provided' }, { status: 400 });
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
