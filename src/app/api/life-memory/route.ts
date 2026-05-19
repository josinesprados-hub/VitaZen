// ═══════════════════════════════════════════
// /api/life-memory
// ═══════════════════════════════════════════
// GET — Returns the life memory timeline.
// Combines stages, transitions, memories, and patterns.
//
// FREE: basic timeline, stages visible but limited.
// ÉLITE: full depth — transitions, memories, patterns.
// ═══════════════════════════════════════════

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { detectLifeStages, getPastMonths } from '@/lib/life-memory/stages';
import { getHighlightedMemories, buildTimeline, observationsFromPatterns } from '@/lib/life-memory/observations';
import type { PatternObservationData } from '@/lib/life-memory/observations';
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

    const isPremium = user.plan === 'PREMIUM';
    const months = getPastMonths(6);

    // ── 1. Detect life stages ──
    const { stages, transitions } = await detectLifeStages(user.id, months);

    // ── 2. Get highlighted memories ──
    const memories = isPremium ? await getHighlightedMemories(user.id, months) : [];

    // ── 3. Get pattern observations (reuse existing system) ──
    let patternObs: PatternObservationData[] = [];

    if (isPremium) {
      try {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const [
          financeLogs, wellnessLogs, meditationSessions,
          habitLogs, checkins, journalEntries,
        ] = await Promise.all([
          db.financeLog.findMany({
            where: { userId: user.id, date: { gte: ninetyDaysAgo } },
            select: { date: true, type: true, category: true, amount: true, mood: true, contexto: true },
            orderBy: { date: 'desc' },
          }),
          db.wellnessLog.findMany({
            where: { userId: user.id, date: { gte: ninetyDaysAgo } },
            select: { date: true, mood: true, energy: true, sleep: true, stress: true },
            orderBy: { date: 'desc' },
          }),
          db.meditationSession.findMany({
            where: { userId: user.id, completedAt: { gte: ninetyDaysAgo } },
            select: { duration: true, type: true, completedAt: true },
            orderBy: { completedAt: 'desc' },
          }),
          db.habitLog.findMany({
            where: { userId: user.id },
            select: { name: true, streak: true, lastCompletedAt: true },
          }),
          db.dailyCheckin.findMany({
            where: { userId: user.id, date: { gte: ninetyDaysAgo } },
            select: { date: true, emotion: true, energy: true, focus: true, stress: true },
            orderBy: { date: 'desc' },
          }),
          db.journalEntry.findMany({
            where: { userId: user.id, createdAt: { gte: ninetyDaysAgo } },
            select: { content: true, mood: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
          }),
        ]);

        const crossEmpireData: CrossEmpireData = {
          financeLogs: financeLogs.map(l => ({ date: l.date.toISOString(), type: l.type, category: l.category, amount: l.amount, mood: l.mood, contexto: l.contexto })),
          wellnessLogs: wellnessLogs.map(l => ({ date: l.date.toISOString(), mood: l.mood, energy: l.energy, sleep: l.sleep, stress: l.stress })),
          meditationSessions: meditationSessions.map(s => ({ duration: s.duration, type: s.type, completedAt: s.completedAt.toISOString() })),
          habitLogs: habitLogs.map(h => ({ name: h.name, streak: h.streak, lastCompletedAt: h.lastCompletedAt?.toISOString() || null })),
          checkins: checkins.map(c => ({ date: c.date.toISOString(), emotion: c.emotion, energy: c.energy, focus: c.focus, stress: c.stress })),
          journalEntries: journalEntries.map(j => ({ content: j.content, mood: j.mood, createdAt: j.createdAt.toISOString() })),
        };

        const patternResult = detectPatterns(crossEmpireData);
        patternObs = patternResult.observations.map(o => ({
          id: o.id,
          text: o.text,
          empires: o.empires,
        }));
      } catch {
        // Pattern detection failed — continue without patterns
      }
    }

    // ── 4. Build timeline ──
    const lifeObs = observationsFromPatterns(patternObs);
    const timeline = buildTimeline(stages, transitions, memories, lifeObs, months);

    // ── 5. Trim for FREE ──
    const response = isPremium
      ? timeline
      : {
          ...timeline,
          transitions: [],      // Élite only
          memories: [],          // Élite only
          observations: timeline.observations.filter(o => o.type === 'stage'), // FREE sees stages only
        };

    return NextResponse.json({
      ...response,
      isPremium,
    });
  } catch (error) {
    console.error('[Life Memory] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
