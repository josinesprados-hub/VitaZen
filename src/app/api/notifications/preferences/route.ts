export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  UpdateNotificationPreferencesPayload,
  NotificationPreferencesResponse,
} from '@/lib/notifications/types';

// GET /api/notifications/preferences — Fetch user notification preferences
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

    // Get or create preferences
    let prefs = await db.notificationPreference.findUnique({
      where: { userId: user.id },
    });

    if (!prefs) {
      prefs = await db.notificationPreference.create({
        data: { userId: user.id },
      });
    }

    // Count active tokens to determine push permission state
    const activeTokens = await db.pushToken.count({
      where: { userId: user.id, active: true },
    });

    const response: NotificationPreferencesResponse = {
      pushEnabled: prefs.pushEnabled,
      checkinReminders: prefs.checkinReminders,
      weeklyRecap: prefs.weeklyRecap,
      comebackReminders: prefs.comebackReminders,
      reflectionReminders: prefs.reflectionReminders,
      quietHoursEnabled: prefs.quietHoursEnabled,
      quietHoursStart: prefs.quietHoursStart,
      quietHoursEnd: prefs.quietHoursEnd,
      timezone: prefs.timezone,
      maxDailyNotifications: prefs.maxDailyNotifications,
      permissionState: activeTokens > 0 ? 'granted' : 'default',
    };

    return NextResponse.json({ preferences: response });
  } catch (error) {
    console.error('[Notifications] GET preferences error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/notifications/preferences — Update notification preferences
export async function PATCH(request: NextRequest) {
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

    const body: UpdateNotificationPreferencesPayload = await request.json();

    // Validate and sanitize
    const data: Record<string, unknown> = {};

    if (typeof body.pushEnabled === 'boolean') data.pushEnabled = body.pushEnabled;
    if (typeof body.checkinReminders === 'boolean') data.checkinReminders = body.checkinReminders;
    // streakReminders: kept in DB for backward compat, no longer set from API
    if (typeof body.weeklyRecap === 'boolean') data.weeklyRecap = body.weeklyRecap;
    if (typeof body.comebackReminders === 'boolean') data.comebackReminders = body.comebackReminders;
    if (typeof body.reflectionReminders === 'boolean') data.reflectionReminders = body.reflectionReminders;
    if (typeof body.quietHoursEnabled === 'boolean') data.quietHoursEnabled = body.quietHoursEnabled;

    // Validate time format HH:mm
    if (body.quietHoursStart && /^\d{2}:\d{2}$/.test(body.quietHoursStart)) {
      data.quietHoursStart = body.quietHoursStart;
    }
    if (body.quietHoursEnd && /^\d{2}:\d{2}$/.test(body.quietHoursEnd)) {
      data.quietHoursEnd = body.quietHoursEnd;
    }

    // Validate timezone (try formatting with it)
    if (body.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: body.timezone });
        data.timezone = body.timezone;
      } catch {
        return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
      }
    }

    // Validate daily cap range
    if (typeof body.maxDailyNotifications === 'number') {
      const cap = Math.min(Math.max(body.maxDailyNotifications, 1), 2);
      data.maxDailyNotifications = cap;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
    }

    // Upsert preferences
    const prefs = await db.notificationPreference.upsert({
      where: { userId: user.id },
      update: data,
      create: {
        userId: user.id,
        ...data,
      },
    });

    // If push was disabled, deactivate all tokens
    if (data.pushEnabled === false) {
      await db.pushToken.updateMany({
        where: { userId: user.id },
        data: { active: false },
      });
    }

    const response: NotificationPreferencesResponse = {
      pushEnabled: prefs.pushEnabled,
      checkinReminders: prefs.checkinReminders,
      weeklyRecap: prefs.weeklyRecap,
      comebackReminders: prefs.comebackReminders,
      reflectionReminders: prefs.reflectionReminders,
      quietHoursEnabled: prefs.quietHoursEnabled,
      quietHoursStart: prefs.quietHoursStart,
      quietHoursEnd: prefs.quietHoursEnd,
      timezone: prefs.timezone,
      maxDailyNotifications: prefs.maxDailyNotifications,
      permissionState: 'granted', // They just updated prefs, so they have access
    };

    return NextResponse.json({ preferences: response });
  } catch (error) {
    console.error('[Notifications] PATCH preferences error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
