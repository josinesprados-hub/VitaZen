export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  NotificationPreferencesResponse,
} from '@/lib/notifications/types';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

// GET /api/notifications/preferences — Fetch user notification preferences
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const user = await getAuthUserBasic(idToken);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get or create preferences (atomic upsert eliminates TOCTOU race — DI-01 fix)
    const prefs = await db.notificationPreference.upsert({
      where: { userId: user.id },
      update: {}, // No-op when row already exists — we only need to ensure it exists
      create: { userId: user.id },
    });

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
    const user = await getAuthUserBasic(idToken);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const rl = await rateLimit(user.id, 'notifications:preferences', RATE_LIMITS['notifications:preferences']);
    if (rl.limited) return NextResponse.json({ error: 'Too many requests', retryAfter: rl.resetAt }, { status: 429 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'El formato de la solicitud no es válido' }, { status: 400 });
    }

    // Reject non-object bodies
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: 'El formato de la solicitud no es válido' }, { status: 400 });
    }

    const record = body as Record<string, unknown>;

    // Validate and sanitize — only accept known fields
    const data: Record<string, unknown> = {};

    if (typeof record.pushEnabled === 'boolean') data.pushEnabled = record.pushEnabled;
    if (typeof record.checkinReminders === 'boolean') data.checkinReminders = record.checkinReminders;
    if (typeof record.weeklyRecap === 'boolean') data.weeklyRecap = record.weeklyRecap;
    if (typeof record.comebackReminders === 'boolean') data.comebackReminders = record.comebackReminders;
    if (typeof record.reflectionReminders === 'boolean') data.reflectionReminders = record.reflectionReminders;
    if (typeof record.quietHoursEnabled === 'boolean') data.quietHoursEnabled = record.quietHoursEnabled;

    // Validate time format HH:mm (00:00–23:59)
    const VALID_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (typeof record.quietHoursStart === 'string' && VALID_TIME.test(record.quietHoursStart)) {
      data.quietHoursStart = record.quietHoursStart;
    }
    if (typeof record.quietHoursEnd === 'string' && VALID_TIME.test(record.quietHoursEnd)) {
      data.quietHoursEnd = record.quietHoursEnd;
    }

    // Validate timezone: must be a non-empty string that Intl accepts
    if (typeof record.timezone === 'string' && record.timezone.length > 0) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: record.timezone });
        data.timezone = record.timezone;
      } catch {
        return NextResponse.json({ error: 'Zona horaria no válida' }, { status: 400 });
      }
    }

    // Validate daily cap range (must be integer, not NaN/Infinity)
    if (typeof record.maxDailyNotifications === 'number' &&
        Number.isFinite(record.maxDailyNotifications)) {
      const cap = Math.min(Math.max(Math.floor(record.maxDailyNotifications), 1), 2);
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
