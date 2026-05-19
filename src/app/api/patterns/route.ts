// ═══════════════════════════════════════════
// Patrones de Vida — API Route
// ═══════════════════════════════════════════
//
// Gathers data from all empires for the current user
// and runs the pattern detector. No AI. No external APIs.
// Only real data + sober logic.
//
// Returns observations only when there's enough data.
// Otherwise: silence.
// ═══════════════════════════════════════════

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { detectPatterns } from '@/lib/patterns/detector';
import type { CrossEmpireData } from '@/lib/patterns/types';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = user.id;

    // ── Fetch data from all empires ──
    // Last 90 days for relevant, current patterns
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [
      financeLogs,
      wellnessLogs,
      meditationSessions,
      habitLogs,
      checkins,
      journalEntries,
    ] = await Promise.all([
      db.financeLog.findMany({
        where: { userId, date: { gte: ninetyDaysAgo } },
        select: {
          date: true,
          type: true,
          category: true,
          amount: true,
          mood: true,
          contexto: true,
        },
        orderBy: { date: 'desc' },
      }),

      db.wellnessLog.findMany({
        where: { userId, date: { gte: ninetyDaysAgo } },
        select: {
          date: true,
          mood: true,
          energy: true,
          sleep: true,
          stress: true,
        },
        orderBy: { date: 'desc' },
      }),

      db.meditationSession.findMany({
        where: { userId, completedAt: { gte: ninetyDaysAgo } },
        select: {
          duration: true,
          type: true,
          completedAt: true,
        },
        orderBy: { completedAt: 'desc' },
      }),

      db.habitLog.findMany({
        where: { userId },
        select: {
          name: true,
          streak: true,
          lastCompletedAt: true,
        },
      }),

      db.dailyCheckin.findMany({
        where: { userId, date: { gte: ninetyDaysAgo } },
        select: {
          date: true,
          emotion: true,
          energy: true,
          focus: true,
          stress: true,
        },
        orderBy: { date: 'desc' },
      }),

      db.journalEntry.findMany({
        where: { userId, createdAt: { gte: ninetyDaysAgo } },
        select: {
          content: true,
          mood: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // ── Transform to CrossEmpireData format ──
    const crossEmpireData: CrossEmpireData = {
      financeLogs: financeLogs.map(l => ({
        date: l.date.toISOString(),
        type: l.type,
        category: l.category,
        amount: l.amount,
        mood: l.mood,
        contexto: l.contexto,
      })),
      wellnessLogs: wellnessLogs.map(l => ({
        date: l.date.toISOString(),
        mood: l.mood,
        energy: l.energy,
        sleep: l.sleep,
        stress: l.stress,
      })),
      meditationSessions: meditationSessions.map(s => ({
        duration: s.duration,
        type: s.type,
        completedAt: s.completedAt.toISOString(),
      })),
      habitLogs: habitLogs.map(h => ({
        name: h.name,
        streak: h.streak,
        lastCompletedAt: h.lastCompletedAt?.toISOString() || null,
      })),
      checkins: checkins.map(c => ({
        date: c.date.toISOString(),
        emotion: c.emotion,
        energy: c.energy,
        focus: c.focus,
        stress: c.stress,
      })),
      journalEntries: journalEntries.map(j => ({
        content: j.content,
        mood: j.mood,
        createdAt: j.createdAt.toISOString(),
      })),
    };

    // ── Run pattern detection ──
    const result = detectPatterns(crossEmpireData);

    // ── Return results ──
    // Never expose confidence scores, internal metrics, or raw data
    // Only the human observations
    return NextResponse.json({
      observations: result.observations.map(o => ({
        id: o.id,
        text: o.text,
        empires: o.empires,
      })),
      hasEnoughData: result.hasEnoughData,
      totalDataPoints: result.totalDataPoints,
    });
  } catch (error) {
    console.error('[Patrones] Error detecting patterns:', error);
    return NextResponse.json(
      { error: 'No se pudieron detectar patrones' },
      { status: 500 }
    );
  }
}
