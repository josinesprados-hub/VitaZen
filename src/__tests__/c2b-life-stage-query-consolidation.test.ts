/**
 * C-2b — Life-stage query consolidation (FASE 23).
 *
 * detectLifeStages formerly ran SEVEN queries per month (3 findMany + 4
 * count) inside Promise.all(months.map(aggregateMonth)):
 *
 *     3 months  (Mentor)        → 21 queries
 *     6 months  (/api/life-memory) → 42 queries
 *
 * C-2b consolidates them into SEVEN queries total (one per model), each
 * covering the global [oldest month start, newest month end) window, and
 * splits the rows in memory with the EXACT same Madrid month boundaries
 * (getMadridMonthRange). No groupBy, no raw SQL, no take, no orderBy.
 *
 * Golden equivalence strategy (FASE 23 §19): this file carries a VERBATIM
 * frozen copy of the pre-C-2b implementation (legacy* functions below, taken
 * from 7807601) that queries the SAME mocked database. Every scenario must
 * produce byte-identical { stages, transitions } output between the legacy
 * oracle and the new implementation — including null months, boundary
 * instants (gte start / lt end), DST switches, year rollover, intention and
 * finance-mood classification, and the connections-enriched premium variant.
 *
 * Query budget (1 mock call = 1 query):
 *   detectLifeStages 3 months   21 → 7
 *   detectLifeStages 6 months   42 → 7
 *   Mentor PREMIUM              51 → 37 (asserted in c2a suite)
 *   Mentor FREE                 10 (unchanged)
 *
 * Test strategy (project pattern from c1/c2a/n7): @/lib/db is replaced by a
 * mini query engine that RESPECTS each query's where clause, so both
 * implementations receive exactly the rows they ask for from one shared
 * dataset. The clock is frozen per scenario; all Madrid conversions stay real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getMadridMonthRange, getPastMonthKeys, formatMonthLabel } from '@/lib/dates';
import type { EmpireConnectionSignal } from '@/lib/patterns/types';
import { db } from '@/lib/db';

// ─── Mini query engine (hoisted — used by the vi.mock factory) ──────

const H = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type Where = Record<string, unknown>;

  const state: Record<string, Row[]> = {};
  let queryCount = 0;

  function matchesWhere(row: Row, where: Where | undefined): boolean {
    if (!where) return true;
    for (const [key, cond] of Object.entries(where)) {
      if (key === 'OR') {
        const branches = cond as Where[];
        if (!branches.some((w) => matchesWhere(row, w))) return false;
        continue;
      }
      const v = row[key];
      if (cond === null) {
        if (v !== null && v !== undefined) return false;
        continue;
      }
      if (cond instanceof Date) {
        if (!(v instanceof Date) || v.getTime() !== cond.getTime()) return false;
        continue;
      }
      if (typeof cond === 'object') {
        const c = cond as Record<string, unknown>;
        const t = (x: unknown) => (x instanceof Date ? x.getTime() : typeof x === 'number' ? (x as number) : null);
        if ('gte' in c) {
          const tv = t(v); const tc = t(c.gte);
          if (tv === null || tc === null || tv < tc) return false;
        }
        if ('gt' in c) {
          const tv = t(v); const tc = t(c.gt);
          if (tv === null || tc === null || tv <= tc) return false;
        }
        if ('lt' in c) {
          const tv = t(v); const tc = t(c.lt);
          if (tv === null || tc === null || tv >= tc) return false;
        }
        if ('not' in c) {
          if (c.not === null && (v === null || v === undefined)) return false;
          if (c.not !== null && v === null) return false;
        }
        continue;
      }
      if (v !== cond) return false;
    }
    return true;
  }

  function query(table: string, args: Record<string, unknown>): Promise<Row[]> {
    queryCount++;
    let rows = state[table] ?? [];
    const where = args?.where as Where | undefined;
    if (where) rows = rows.filter((r) => matchesWhere(r, where));
    return Promise.resolve(rows);
  }

  function makeTable(name: string) {
    return {
      findMany: vi.fn((args?: Record<string, unknown>) => query(name, args ?? {})),
      count: vi.fn(async (args?: Record<string, unknown>) => {
        const rows = await query(name, args ?? {});
        return rows.length;
      }),
    };
  }

  function seed(data: Record<string, Row[]>) {
    for (const [k, v] of Object.entries(data)) state[k] = v;
  }
  function clearSeed() {
    for (const k of Object.keys(state)) delete state[k];
    queryCount = 0;
  }
  function getQueryCount() {
    return queryCount;
  }
  function resetQueryCount() {
    queryCount = 0;
  }

  return { seed, clearSeed, getQueryCount, resetQueryCount, MOCK_DB: {
    wellnessLog: makeTable('wellnessLog'),
    dailyCheckin: makeTable('dailyCheckin'),
    financeLog: makeTable('financeLog'),
    journalEntry: makeTable('journalEntry'),
    meditationSession: makeTable('meditationSession'),
    habitLog: makeTable('habitLog'),
    nutritionLog: makeTable('nutritionLog'),
  } };
});

vi.mock('@/lib/db', () => ({ db: H.MOCK_DB }));

// ═══════════════════════════════════════════════════════════
// LEGACY ORACLE — verbatim frozen copy of the pre-C-2b
// implementation of src/lib/life-memory/stages.ts at 7807601.
// It queries the SAME mocked db and must produce IDENTICAL
// output to the new consolidated implementation.
// ═══════════════════════════════════════════════════════════

type StageFlavor =
  | 'calm' | 'growth' | 'intensity' | 'dispersion'
  | 'exhaustion' | 'quiet' | 'stability';

interface LifeStage {
  month: string;
  monthLabel: string;
  flavor: StageFlavor;
  observation: string;
  dataPoints: number;
}

interface StageTransition {
  from: StageFlavor;
  to: StageFlavor;
  month: string;
  monthLabel: string;
  observation: string;
}

interface MonthAggregation {
  month: string;
  avgStress: number;
  avgEnergy: number;
  avgSleep: number;
  avgMood: number;
  intentionBalance: { tranquility: number; growth: number; necessity: number; enjoyment: number; total: number };
  totalActivity: number;
  financeLogs: number;
  checkins: number;
  wellnessLogs: number;
  journalEntries: number;
  meditationSessions: number;
  habitLogs: number;
  nutritionLogs: number;
}

async function legacyAggregateMonth(userId: string, yyyyMM: string): Promise<MonthAggregation | null> {
  const { start, end } = getMadridMonthRange(yyyyMM);

  const [wellness, checkins, finances, journals, meditations, habits, nutritions] = await Promise.all([
    db.wellnessLog.findMany({
      where: { userId, date: { gte: start, lt: end } },
      select: { stress: true, energy: true, sleep: true, mood: true },
    }),
    db.dailyCheckin.findMany({
      where: { userId, date: { gte: start, lt: end } },
      select: { stress: true, energy: true, emotion: true, intention: true },
    }),
    db.financeLog.findMany({
      where: { userId, date: { gte: start, lt: end }, mood: { not: null } },
      select: { mood: true },
    }),
    db.journalEntry.count({
      where: { userId, createdAt: { gte: start, lt: end } },
    }),
    db.meditationSession.count({
      where: { userId, completedAt: { gte: start, lt: end } },
    }),
    db.habitLog.count({
      where: { userId, lastCompletedAt: { gte: start, lt: end } },
    }),
    db.nutritionLog.count({
      where: { userId, date: { gte: start, lt: end } },
    }),
  ]);

  const meditationCount = meditations;
  const habitCount = habits;
  const nutritionCount = nutritions;
  const totalLogs = wellness.length + checkins.length + finances.length;
  if (totalLogs === 0 && journals === 0 && meditationCount === 0 && habitCount === 0 && nutritionCount === 0) return null;

  const allStress = [...wellness.map(w => w.stress), ...checkins.map(c => c.stress)];
  const allEnergy = [...wellness.map(w => w.energy), ...checkins.map(c => c.energy)];
  const allMood = [...wellness.map(w => w.mood), ...checkins.map(c => c.emotion)];
  const allSleep = wellness.map(w => w.sleep);

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const intentionBalance = { tranquility: 0, growth: 0, necessity: 0, enjoyment: 0, total: 0 };
  for (const f of finances) {
    const m = f.mood?.toLowerCase();
    if (m === 'tranquility' || m === 'calm') intentionBalance.tranquility++;
    else if (m === 'growth' || m === 'conscious') intentionBalance.growth++;
    else if (m === 'necessity' || m === 'necessary') intentionBalance.necessity++;
    else if (m === 'enjoyment' || m === 'impulse') intentionBalance.enjoyment++;
    else intentionBalance.tranquility++;
    intentionBalance.total++;
  }
  for (const c of checkins) {
    const intent = c.intention?.toLowerCase();
    if (!intent) continue;
    if (intent.includes('calma') || intent.includes('tranquil') || intent.includes('reposo') || intent.includes('descans')) intentionBalance.tranquility++;
    else if (intent.includes('creci') || intent.includes('movimiento') || intent.includes('aprend') || intent.includes('mejor') || intent.includes('progres')) intentionBalance.growth++;
    else if (intent.includes('necesid') || intent.includes('oblig') || intent.includes('deber') || intent.includes('trabaj')) intentionBalance.necessity++;
    else if (intent.includes('disfrut') || intent.includes('placer') || intent.includes('gust')) intentionBalance.enjoyment++;
    else intentionBalance.tranquility++;
    intentionBalance.total++;
  }

  return {
    month: yyyyMM,
    avgStress: avg(allStress),
    avgEnergy: avg(allEnergy),
    avgSleep: avg(allSleep),
    avgMood: avg(allMood),
    intentionBalance,
    totalActivity: totalLogs + journals + meditationCount + habitCount + nutritionCount,
    financeLogs: finances.length,
    checkins: checkins.length,
    wellnessLogs: wellness.length,
    journalEntries: journals,
    meditationSessions: meditationCount,
    habitLogs: habitCount,
    nutritionLogs: nutritionCount,
  };
}

// ─── Legacy classification (verbatim copy, unchanged by C-2b) ───

function legacyClassifyStage(agg: MonthAggregation): StageFlavor {
  const { avgStress, avgEnergy, avgSleep, intentionBalance, totalActivity } = agg;

  if (totalActivity < 3) return 'quiet';
  if (avgStress > 3.5 && avgEnergy < 2.5) return 'exhaustion';
  if (avgStress > 3.2 && totalActivity > 15) return 'intensity';
  const { growth, tranquility, necessity, enjoyment, total } = intentionBalance;
  if (total > 0 && growth / total > 0.4) return 'growth';
  if (total > 0 && tranquility / total > 0.4 && avgStress < 2.5) return 'calm';
  if (avgStress < 2.5 && avgEnergy >= 3) return 'stability';
  return 'dispersion';
}

const STAGE_CONNECTION_MAP: Record<StageFlavor, string[]> = {
  growth: ['finanzas-mente', 'energia-mente', 'checkin-mente'],
  stability: ['finanzas-mente', 'energia-mente'],
  calm: ['finanzas-energia', 'energia-mente'],
  intensity: ['finanzas-estres'],
  exhaustion: ['finanzas-energia', 'finanzas-sueno'],
  dispersion: [],
  quiet: [],
};

const CONNECTION_ENRICHMENT: Record<string, string> = {
  'finanzas-mente': 'También coincide con una mayor estabilidad en tus decisiones.',
  'energia-mente': 'También coincide con una mejora de tu energía.',
  'checkin-mente': 'También coincide con un mayor enfoque en tu día a día.',
  'finanzas-energia': 'También coincide con cambios en tu nivel de energía.',
  'finanzas-estres': 'También coincide con un cambio en tu nivel de presión.',
  'finanzas-sueno': 'También coincide con un cambio en tu descanso.',
};

function legacyFindRelevantConnection(
  flavor: StageFlavor,
  connections: EmpireConnectionSignal[],
): EmpireConnectionSignal | null {
  const candidates = STAGE_CONNECTION_MAP[flavor] || [];
  for (const connectionId of candidates) {
    const match = connections.find(c => c.connection === connectionId && c.showable);
    if (match) return match;
  }
  return null;
}

function legacyStageObservation(
  flavor: StageFlavor,
  agg: MonthAggregation,
  connections: EmpireConnectionSignal[],
  isPremium: boolean,
): string {
  const { intentionBalance } = agg;
  const { growth, tranquility, total } = intentionBalance;

  let base: string;

  switch (flavor) {
    case 'calm':
      if (total > 0 && tranquility / total > 0.5)
        base = 'Este fue uno de tus períodos con más calma.';
      else
        base = 'Un período tranquilo, con poca presión.';
      break;

    case 'growth':
      if (total > 0 && growth / total > 0.5)
        base = 'Este fue uno de tus períodos más activos.';
      else
        base = 'Tu actividad fue mayor que en meses anteriores.';
      break;

    case 'intensity':
      base = 'Fue un período con mucha actividad y varios cambios.';
      break;

    case 'dispersion':
      base = 'Tus días fueron muy distintos entre sí durante este período.';
      break;

    case 'exhaustion':
      base = 'Tu energía fue más baja durante estas semanas.';
      break;

    case 'quiet':
      base = 'Hubo menos registros, por lo que este período ofrece menos información.';
      break;

    case 'stability':
      base = 'Mantuviste un ritmo constante durante estas semanas.';
      break;

    default:
      return '';
  }

  if (!isPremium) return base;

  const relevant = legacyFindRelevantConnection(flavor, connections);
  if (relevant) {
    const enrichment = CONNECTION_ENRICHMENT[relevant.connection];
    if (enrichment) return `${base} ${enrichment}`;
  }

  return base;
}

const TRANSITION_ENRICHMENT: Record<string, string> = {
  'exhaustion->calm': 'Tus finanzas también reflejan ese cambio.',
  'exhaustion->stability': 'Esa estabilidad se nota también en otras áreas.',
  'intensity->calm': 'Tu práctica mental también se reflejó en ese cambio.',
  'intensity->stability': 'Ese ritmo más constante se observa en varias áreas.',
  'quiet->growth': 'Esa actividad aumentó de forma coordinada en varias áreas.',
  'quiet->stability': 'Encontraste un ritmo constante en varios aspectos de tu vida.',
  'growth->stability': 'Esa estabilidad abarca varios aspectos de tu vida.',
  'exhaustion->growth': 'Esa recuperación se observa en varias áreas a la vez.',
};

const TRANSITION_CONNECTION_VALIDATION: Record<string, string[]> = {
  'exhaustion->calm': ['finanzas-energia', 'energia-mente'],
  'exhaustion->stability': ['finanzas-energia', 'energia-mente'],
  'intensity->calm': ['finanzas-mente', 'energia-mente'],
  'intensity->stability': ['finanzas-mente', 'checkin-mente'],
  'quiet->growth': ['energia-mente', 'checkin-mente', 'finanzas-mente'],
  'quiet->stability': ['finanzas-mente', 'energia-mente'],
  'growth->stability': ['energia-mente', 'checkin-mente'],
  'exhaustion->growth': ['energia-mente'],
};

function legacyGenerateTransitionObservation(
  from: StageFlavor,
  to: StageFlavor,
  connections: EmpireConnectionSignal[],
  isPremium: boolean,
): string {
  const transitions: Record<string, string> = {
    'exhaustion->calm': 'Tu nivel de tranquilidad aumentó respecto al período anterior.',
    'exhaustion->stability': 'Encontraste un ritmo más estable que antes.',
    'intensity->calm': 'Después de un período intenso, la actividad se calmó.',
    'intensity->stability': 'Tu ritmo se volvió más constante después de varias semanas activas.',
    'dispersion->stability': 'Tus días se volvieron más uniformes que antes.',
    'dispersion->calm': 'La variabilidad entre días disminuyó respecto al período anterior.',
    'quiet->growth': 'Después de un período con poca actividad, tu nivel de actividad aumentó.',
    'quiet->stability': 'Tu ritmo pasó de ser irregular a más constante.',
    'calm->growth': 'Después de un período tranquilo, aumentó tu nivel de actividad.',
    'calm->intensity': 'Un período tranquilo seguido de uno con más cambios y actividad.',
    'growth->calm': 'Después de un período activo, la actividad disminuyó.',
    'growth->stability': 'Tu actividad se estabilizó tras un período de crecimiento.',
    'stability->intensity': 'Después de un ritmo constante, el nivel de actividad aumentó.',
    'stability->dispersion': 'Tus días se volvieron más irregulares que en el período anterior.',
    'stability->exhaustion': 'Tu nivel de energía disminuyó respecto al período anterior.',
    'calm->dispersion': 'Tus días se volvieron más distintos entre sí.',
    'growth->intensity': 'La alta actividad del período anterior trajo consigo más intensidad.',
    'intensity->exhaustion': 'Después de un período muy activo, tu energía bajó.',
    'exhaustion->growth': 'Tras un período con poca energía, la actividad volvió a subir.',
    'quiet->calm': 'Tu nivel de actividad fue mayor tras un período con poca información.',
  };

  const key = `${from}->${to}`;
  const base = transitions[key] || '';
  if (!base) return '';

  if (!isPremium) return base;

  const validConnections = TRANSITION_CONNECTION_VALIDATION[key] || [];
  const hasValidation = validConnections.some(
    connId => connections.some(c => c.connection === connId && c.showable),
  );
  if (hasValidation) {
    const enrichment = TRANSITION_ENRICHMENT[key];
    if (enrichment) return `${base} ${enrichment}`;
  }

  return base;
}

function legacyDetectTransitions(
  stages: LifeStage[],
  connections: EmpireConnectionSignal[],
  isPremium: boolean,
): StageTransition[] {
  const transitions: StageTransition[] = [];

  for (let i = 1; i < stages.length; i++) {
    const prev = stages[i - 1];
    const curr = stages[i];

    if (prev.flavor === curr.flavor) continue;

    const observation = legacyGenerateTransitionObservation(prev.flavor, curr.flavor, connections, isPremium);
    if (observation) {
      transitions.push({
        from: prev.flavor,
        to: curr.flavor,
        month: curr.month,
        monthLabel: curr.monthLabel,
        observation,
      });
    }
  }

  return transitions;
}

async function legacyDetectLifeStages(
  userId: string,
  months: string[],
  options?: {
    connections?: EmpireConnectionSignal[];
    isPremium?: boolean;
  },
): Promise<{ stages: LifeStage[]; transitions: StageTransition[] }> {
  const connections = options?.connections || [];
  const isPremium = options?.isPremium ?? false;

  const aggregations = await Promise.all(
    months.map(m => legacyAggregateMonth(userId, m))
  );

  const stages: LifeStage[] = [];
  for (let i = 0; i < months.length; i++) {
    const agg = aggregations[i];
    if (!agg) continue;

    const flavor = legacyClassifyStage(agg);
    stages.push({
      month: agg.month,
      monthLabel: formatMonthLabel(agg.month),
      flavor,
      observation: legacyStageObservation(flavor, agg, connections, isPremium),
      dataPoints: agg.totalActivity,
    });
  }

  const transitions = legacyDetectTransitions(stages, connections, isPremium);

  return { stages, transitions };
}

// ═══════════════════════════════════════════════════════════
// GOLDEN COMPARISON HARNESS
// ═══════════════════════════════════════════════════════════

async function compareGolden(
  userId: string,
  months: string[],
  options?: { connections?: EmpireConnectionSignal[]; isPremium?: boolean },
) {
  // 1. Legacy oracle (7 × months queries against the same seeded state)
  H.resetQueryCount();
  const legacy = await legacyDetectLifeStages(userId, months, options);
  const legacyQueries = H.getQueryCount();

  // 2. New consolidated implementation (same seeded state — reads are pure)
  H.resetQueryCount();
  const { detectLifeStages } = await import('@/lib/life-memory/stages');
  const fresh = await detectLifeStages(userId, months, options);
  const freshQueries = H.getQueryCount();

  return { legacy, fresh, legacyQueries, freshQueries };
}

function emptySeed(): Record<string, Record<string, unknown>[]> {
  return {
    wellnessLog: [], dailyCheckin: [], financeLog: [], journalEntry: [],
    meditationSession: [], habitLog: [], nutritionLog: [],
  };
}

function checkin(date: Date, over: Record<string, unknown> = {}) {
  return { userId: 'user-1', date, stress: 2, energy: 4, emotion: 4, intention: 'calma', ...over };
}

function wellness(date: Date, over: Record<string, unknown> = {}) {
  return { userId: 'user-1', date, stress: 2, energy: 4, sleep: 4, mood: 4, ...over };
}

function finance(date: Date, over: Record<string, unknown> = {}) {
  return { userId: 'user-1', date, type: 'expense', category: 'ocio', amount: 10, mood: 'enjoyment', contexto: null, ...over };
}

function journal(date: Date) {
  return { userId: 'user-1', title: 'T', content: 'C', mood: 3, createdAt: date };
}

function meditation(date: Date) {
  return { userId: 'user-1', duration: 10, type: 'mindfulness', completedAt: date };
}

function nutrition(date: Date) {
  return { userId: 'user-1', date };
}

function habit(date: Date) {
  return { userId: 'user-1', name: 'H', streak: 1, lastCompletedAt: date, frequency: 'daily' };
}

// Frozen "today" variants drive getPastMonthKeys(3):
const FREEZE_DEFAULT = '2026-09-07T12:00:00.000Z'; // months: 2026-06, 2026-07, 2026-08
const FREEZE_DST_SPRING = '2026-04-10T12:00:00.000Z'; // months: 2026-01, 2026-02, 2026-03 (CEST starts 2026-03-29)
const FREEZE_DST_FALL = '2025-12-15T12:00:00.000Z'; // months: 2025-09, 2025-10, 2025-11 (CEST→CET 2025-10-26)
const FREEZE_YEAR_END = '2026-02-10T12:00:00.000Z'; // months: 2025-11, 2025-12, 2026-01

let CURRENT_MONTHS: string[] = [];

function useFrozenClock(isoNow: string) {
  beforeEach(() => {
    H.clearSeed();
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(isoNow) });
    CURRENT_MONTHS = getPastMonthKeys(3);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}

function conn(connection: string, showable = true): EmpireConnectionSignal {
  return { connection, showable } as unknown as EmpireConnectionSignal;
}

// ═══════════════════════════════════════════════════════════
// 1. GOLDEN EQUIVALENCE — legacy (7807601) vs consolidated
// ═══════════════════════════════════════════════════════════

describe('C-2b — golden equivalence legacy vs consolidated (3 closed months)', () => {
  useFrozenClock(FREEZE_DEFAULT);

  it('case 1: three fully-loaded months — every model, identical stages/transitions', async () => {
    const [m0, m1, m2] = CURRENT_MONTHS; // 2026-06, 2026-07, 2026-08
    const r0 = getMadridMonthRange(m0), r1 = getMadridMonthRange(m1), r2 = getMadridMonthRange(m2);
    const mid = (r: { start: Date; end: Date }) => new Date((r.start.getTime() + r.end.getTime()) / 2);
    const s = emptySeed();
    s.wellnessLog = [wellness(mid(r0), { stress: 4, energy: 2, sleep: 2, mood: 2 }), wellness(mid(r1)), wellness(mid(r2), { stress: 1, energy: 5, sleep: 5, mood: 5 })];
    s.dailyCheckin = [
      checkin(mid(r0), { stress: 4, energy: 2, emotion: 2, intention: 'obligaciones de trabajo' }),
      checkin(mid(r1), { intention: 'crecer y aprender' }),
      checkin(mid(r2), { stress: 1, energy: 5, emotion: 5, intention: 'disfrutar el placer' }),
      checkin(new Date(mid(r2).getTime() + 86400000), { intention: 'otra' }),
    ];
    s.financeLog = [finance(mid(r0), { mood: 'necessity' }), finance(mid(r1), { mood: 'calm' }), finance(mid(r2), { mood: 'impulse' })];
    s.journalEntry = [journal(mid(r0)), journal(mid(r1)), journal(mid(r2))];
    s.meditationSession = [meditation(mid(r0)), meditation(mid(r1)), meditation(mid(r2))];
    s.habitLog = [habit(mid(r1)), habit(mid(r2))];
    s.nutritionLog = [nutrition(mid(r1)), nutrition(mid(r2))];
    H.seed(s);

    const { legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS);
    expect(fresh).toEqual(legacy);
    expect(legacy.stages).toHaveLength(3);
    expect(fresh.stages.map(s => s.month)).toEqual([m0, m1, m2]);
    // the flavor sequence differs across months → at least one transition
    expect(fresh.transitions.length).toBeGreaterThanOrEqual(1);
  });

  it('case 2: middle month empty — null month stays null, no transition across the gap', async () => {
    const [m0, , m2] = CURRENT_MONTHS;
    const r0 = getMadridMonthRange(m0), r2 = getMadridMonthRange(m2);
    const mid = (r: { start: Date; end: Date }) => new Date((r.start.getTime() + r.end.getTime()) / 2);
    const s = emptySeed();
    s.dailyCheckin = [checkin(mid(r0)), checkin(mid(r2))];
    H.seed(s);

    const { legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS);
    expect(fresh).toEqual(legacy);
    expect(fresh.stages.map(s => s.month)).toEqual([m0, m2]); // middle month skipped
    expect(fresh.transitions).toEqual([]); // quiet→quiet same flavor → none
  });

  it('case 3: two empty months — only the oldest month produces a stage', async () => {
    const [m0] = CURRENT_MONTHS;
    const r0 = getMadridMonthRange(m0);
    const mid = (r: { start: Date; end: Date }) => new Date((r.start.getTime() + r.end.getTime()) / 2);
    const s = emptySeed();
    s.wellnessLog = [wellness(mid(r0))];
    H.seed(s);

    const { legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS);
    expect(fresh).toEqual(legacy);
    expect(fresh.stages).toHaveLength(1);
    expect(fresh.stages[0].month).toBe(m0);
    expect(fresh.stages[0].flavor).toBe('quiet'); // 1 data point
  });

  it('case 4: all months empty — silence (stages [] transitions [])', async () => {
    H.seed(emptySeed());
    const { legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS);
    expect(fresh).toEqual(legacy);
    expect(fresh.stages).toEqual([]);
    expect(fresh.transitions).toEqual([]);
  });

  it('cases 5-7: boundary instants — exact month start belongs (gte), 1ms before goes to the previous month, 1ms after belongs', async () => {
    const [m0, m1] = CURRENT_MONTHS;
    const r1 = getMadridMonthRange(m1);

    // row EXACTLY at m1 start → belongs to m1 (gte)
    H.seed({ ...emptySeed(), dailyCheckin: [checkin(r1.start)] });
    let { legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS);
    expect(fresh).toEqual(legacy);
    expect(fresh.stages.map(s => s.month)).toEqual([m1]);
    expect(fresh.stages[0].dataPoints).toBe(1);

    // row 1ms BEFORE m1 start → belongs to the previous month m0 (contiguous ranges)
    H.seed({ ...emptySeed(), dailyCheckin: [checkin(new Date(r1.start.getTime() - 1))] });
    ({ legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS));
    expect(fresh).toEqual(legacy);
    expect(fresh.stages.map(s => s.month)).toEqual([m0]);

    // row 1ms AFTER m1 start → still belongs to m1
    H.seed({ ...emptySeed(), dailyCheckin: [checkin(new Date(r1.start.getTime() + 1))] });
    ({ legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS));
    expect(fresh).toEqual(legacy);
    expect(fresh.stages.map(s => s.month)).toEqual([m1]);
  });

  it('case 8 (explicit): a row EXACTLY at month end belongs to the NEXT month, never to the previous (lt)', async () => {
    const [, m1, m2] = CURRENT_MONTHS;
    const r1 = getMadridMonthRange(m1);
    H.seed({ ...emptySeed(), dailyCheckin: [checkin(r1.end)] }); // end == start of m2
    const { legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS);
    expect(fresh).toEqual(legacy);
    expect(fresh.stages.map(s => s.month)).toEqual([m2]);
  });

  it('case 8b: rows outside the global window are invisible to BOTH implementations', async () => {
    const [, , m2] = CURRENT_MONTHS;
    const r2 = getMadridMonthRange(m2);
    const s = emptySeed();
    s.dailyCheckin = [checkin(new Date(r2.end.getTime() + 86400000))]; // after the newest month ends
    s.wellnessLog = [wellness(new Date(getMadridMonthRange(CURRENT_MONTHS[0]).start.getTime() - 86400000))]; // before the oldest month starts
    H.seed(s);
    const { legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS);
    expect(fresh).toEqual(legacy);
    expect(fresh.stages).toEqual([]);
  });

  it('case 10: intention classification over the same free texts (mixed / all-growth / empty string skipped)', async () => {
    const [, m1] = CURRENT_MONTHS;
    const r1 = getMadridMonthRange(m1);
    const mid = (r: { start: Date; end: Date }) => new Date((r.start.getTime() + r.end.getTime()) / 2);

    // mixed intentions → stability (1/4 each bucket, low stress, energy ≥ 3)
    H.seed({ ...emptySeed(), dailyCheckin: [
      checkin(new Date(mid(r1).getTime() - 3 * 86400000), { intention: 'Quiero calma y descanso' }),
      checkin(new Date(mid(r1).getTime() - 2 * 86400000), { intention: 'Crecer y aprender cosas' }),
      checkin(new Date(mid(r1).getTime() - 1 * 86400000), { intention: 'Obligaciones de trabajo' }),
      checkin(mid(r1), { intention: 'Disfrutar el placer' }),
    ] });
    let { legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS);
    expect(fresh).toEqual(legacy);
    expect(fresh.stages).toHaveLength(1);
    expect(fresh.stages[0].flavor).toBe('stability');

    // all-growth → growth (ratio 1.0 > 0.4)
    H.seed({ ...emptySeed(), dailyCheckin: [
      checkin(new Date(mid(r1).getTime() - 2 * 86400000), { intention: 'aprender algo nuevo' }),
      checkin(new Date(mid(r1).getTime() - 1 * 86400000), { intention: 'movimiento y progreso' }),
      checkin(mid(r1), { intention: 'mejorar cada día' }),
    ] });
    ({ legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS));
    expect(fresh).toEqual(legacy);
    expect(fresh.stages[0].flavor).toBe('growth');

    // empty intention is skipped by BOTH (the `if (!intent) continue` rule)
    H.seed({ ...emptySeed(), dailyCheckin: [
      checkin(new Date(mid(r1).getTime() - 1 * 86400000), { intention: '' }),
      checkin(mid(r1), { intention: 'tranquila' }),
    ] });
    ({ legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS));
    expect(fresh).toEqual(legacy);
  });

  it('case 11: finance mood classification incl. legacy aliases, unknown → tranquility default, null-mood excluded', async () => {
    const [, m1] = CURRENT_MONTHS;
    const r1 = getMadridMonthRange(m1);
    const mid = (r: { start: Date; end: Date }) => new Date((r.start.getTime() + r.end.getTime()) / 2);
    const s = emptySeed();
    s.financeLog = [
      finance(new Date(mid(r1).getTime() - 3 * 86400000), { mood: 'enjoyment' }),
      finance(new Date(mid(r1).getTime() - 2 * 86400000), { mood: 'impulse' }),
      finance(new Date(mid(r1).getTime() - 1 * 86400000), { mood: 'something-else' }), // default → tranquility
      finance(mid(r1), { mood: null }), // excluded by BOTH (mood not null filter)
    ];
    H.seed(s);
    const { legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS);
    expect(fresh).toEqual(legacy);
    // enjoyment+impulse=2, unknown→tranquility=1 → tranquility/total=0.25 not >0.4,
    // no stress/energy sources → dispersion
    expect(fresh.stages[0].flavor).toBe('dispersion');
  });

  it('case 12: multiple records within the same month — counts and averages over ALL rows', async () => {
    const [, m1] = CURRENT_MONTHS;
    const r1 = getMadridMonthRange(m1);
    const mid = (r: { start: Date; end: Date }) => new Date((r.start.getTime() + r.end.getTime()) / 2);
    const s = emptySeed();
    s.dailyCheckin = [
      checkin(new Date(mid(r1).getTime() - 2 * 86400000), { stress: 5, energy: 1, emotion: 1 }),
      checkin(new Date(mid(r1).getTime() - 1 * 86400000), { stress: 1, energy: 5, emotion: 5 }),
      checkin(mid(r1), { stress: 3, energy: 3, emotion: 3 }),
    ];
    s.wellnessLog = [wellness(new Date(mid(r1).getTime() - 86400000), { stress: 4 }), wellness(mid(r1), { stress: 2 })];
    s.journalEntry = [journal(mid(r1)), journal(new Date(mid(r1).getTime() - 3600000))];
    s.meditationSession = [meditation(mid(r1)), meditation(new Date(mid(r1).getTime() - 7200000))];
    s.habitLog = [habit(mid(r1))];
    s.nutritionLog = [nutrition(mid(r1))];
    H.seed(s);

    const { legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS);
    expect(fresh).toEqual(legacy);
    // totalActivity for m1 = (3 checkins + 2 wellness) + 2 journals + 2 meditations + 1 habit + 1 nutrition = 11
    expect(fresh.stages[0].dataPoints).toBe(11);
  });

  it('premium variant (/api/life-memory style): connections + isPremium enrich observations and transitions identically', async () => {
    const [m0, m1] = CURRENT_MONTHS;
    const r0 = getMadridMonthRange(m0), r1 = getMadridMonthRange(m1);
    const mid = (r: { start: Date; end: Date }) => new Date((r.start.getTime() + r.end.getTime()) / 2);
    const s = emptySeed();
    s.dailyCheckin = [
      checkin(mid(r0)), // quiet month (1 data point)
      checkin(new Date(mid(r1).getTime() - 86400000), { intention: 'aprender cada día' }),
      checkin(new Date(mid(r1).getTime() - 3600000), { intention: 'movimiento constante' }),
      checkin(mid(r1), { intention: 'progresar cada semana' }), // 3 data points → growth
    ];
    H.seed(s);
    const options = { connections: [conn('energia-mente'), conn('finanzas-mente', false)], isPremium: true };

    const { legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS, options);
    expect(fresh).toEqual(legacy);
    expect(fresh.transitions).toHaveLength(1); // quiet → growth
    expect(fresh.transitions[0].observation).toContain('coordinada'); // enriched by the showable connection
  });
});

// ═══════════════════════════════════════════════════════════
// 2. MADRID / DST / YEAR ROLLOVER
// ═══════════════════════════════════════════════════════════

describe('C-2b — Madrid/DST boundaries (CET→CEST spring switch month)', () => {
  useFrozenClock(FREEZE_DST_SPRING); // months 2026-01, 2026-02, 2026-03

  it('a row at Madrid midnight of March 1 (CET) belongs to March; a UTC-ambiguous journal lands by Madrid day', async () => {
    const [, , m2] = CURRENT_MONTHS;
    const rStart = getMadridMonthRange(m2).start; // 2026-03-01T00:00 Madrid (CET, UTC+1)
    const s = emptySeed();
    s.dailyCheckin = [checkin(rStart)]; // exact start (CET side of the switch month)
    // 2026-02-28T23:59Z == 2026-03-01T00:59 Madrid → March bucket for BOTH
    s.journalEntry = [journal(new Date('2026-02-28T23:59:00.000Z'))];
    H.seed(s);
    const { legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS);
    expect(fresh).toEqual(legacy);
    expect(fresh.stages.map(s => s.month)).toEqual([m2]);
    expect(fresh.stages[0].dataPoints).toBe(2); // checkin + journal
  });

  it('rows on both sides of the CEST switch (2026-03-29) and at the CEST month end split correctly', async () => {
    const [, , m2] = CURRENT_MONTHS;
    const r2 = getMadridMonthRange(m2);
    const s = emptySeed();
    s.meditationSession = [
      meditation(new Date('2026-03-28T00:30:00.000Z')), // 01:30 CET
      meditation(new Date('2026-03-29T01:30:00.000Z')), // 03:30 CEST (after the switch)
      meditation(new Date(r2.end.getTime() - 1)),       // last ms of March (CEST)
    ];
    H.seed(s);
    const { legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS);
    expect(fresh).toEqual(legacy);
    expect(fresh.stages).toHaveLength(1);
    expect(fresh.stages[0].month).toBe(m2);
    expect(fresh.stages[0].dataPoints).toBe(3);
  });
});

describe('C-2b — Madrid/DST boundaries (CEST→CET fall switch month)', () => {
  useFrozenClock(FREEZE_DST_FALL); // months 2025-09, 2025-10, 2025-11

  it('rows across the 2025-10-26 switch and the CEST month start bucket identically', async () => {
    const [, m1] = CURRENT_MONTHS; // 2025-10
    const r1 = getMadridMonthRange(m1); // start = 2025-09-30T22:00Z (CEST)
    const s = emptySeed();
    s.dailyCheckin = [
      checkin(r1.start), // exact Madrid month start (CEST side)
      checkin(new Date('2025-10-26T00:30:00.000Z')), // 02:30 CEST
      checkin(new Date('2025-10-26T01:30:00.000Z')), // 02:30 CET (repeated hour, after switch)
    ];
    H.seed(s);
    const { legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS);
    expect(fresh).toEqual(legacy);
    expect(fresh.stages.map(s => s.month)).toEqual([m1]);
    expect(fresh.stages[0].dataPoints).toBe(3);
  });
});

describe('C-2b — year rollover', () => {
  useFrozenClock(FREEZE_YEAR_END); // months 2025-11, 2025-12, 2026-01

  it('a row exactly at Madrid midnight of Jan 1 belongs to 2026-01; 1ms before belongs to 2025-12', async () => {
    const [m0, m1, m2] = CURRENT_MONTHS;
    const rJan = getMadridMonthRange(m2);
    H.seed({ ...emptySeed(), dailyCheckin: [checkin(rJan.start)] });
    let { legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS);
    expect(fresh).toEqual(legacy);
    expect(fresh.stages.map(s => s.month)).toEqual([m2]);

    H.seed({ ...emptySeed(), dailyCheckin: [checkin(new Date(rJan.start.getTime() - 1))] });
    ({ legacy, fresh } = await compareGolden('user-1', CURRENT_MONTHS));
    expect(fresh).toEqual(legacy);
    expect(fresh.stages.map(s => s.month)).toEqual([m1]);
    expect(m1).toBe('2025-12');
    expect(m0).toBe('2025-11');
  });
});

// ═══════════════════════════════════════════════════════════
// 3. QUERY BUDGET — the C-2b regression guard
// ═══════════════════════════════════════════════════════════

describe('C-2b — query budget', () => {
  useFrozenClock(FREEZE_DEFAULT);

  it('detectLifeStages with 3 months executes exactly 7 queries (was 21)', async () => {
    H.seed(emptySeed());
    H.resetQueryCount();
    const { detectLifeStages } = await import('@/lib/life-memory/stages');
    await detectLifeStages('user-1', CURRENT_MONTHS);
    expect(H.getQueryCount()).toBe(7);
  });

  it('detectLifeStages with 6 months (/api/life-memory) executes exactly 7 queries (was 42)', async () => {
    H.seed(emptySeed());
    H.resetQueryCount();
    const { detectLifeStages } = await import('@/lib/life-memory/stages');
    await detectLifeStages('user-1', getPastMonthKeys(6));
    expect(H.getQueryCount()).toBe(7);
  });

  it('the consolidated implementation never uses count() and issues exactly one query per model', async () => {
    H.seed(emptySeed());
    // isolate THIS run: accumulated mock call history from previous tests would pollute the per-model assertions
    for (const table of ['wellnessLog', 'dailyCheckin', 'financeLog', 'journalEntry', 'meditationSession', 'habitLog', 'nutritionLog'] as const) {
      H.MOCK_DB[table].findMany.mockClear();
      H.MOCK_DB[table].count.mockClear();
    }
    const { detectLifeStages } = await import('@/lib/life-memory/stages');
    await detectLifeStages('user-1', CURRENT_MONTHS);
    for (const table of ['wellnessLog', 'dailyCheckin', 'financeLog', 'journalEntry', 'meditationSession', 'habitLog', 'nutritionLog'] as const) {
      expect(H.MOCK_DB[table].count.mock.calls).toHaveLength(0);
      expect(H.MOCK_DB[table].findMany.mock.calls).toHaveLength(1);
    }
  });

  it('detectLifeStages with 0 months issues no queries and returns silence', async () => {
    H.seed(emptySeed());
    H.resetQueryCount();
    const { detectLifeStages } = await import('@/lib/life-memory/stages');
    const result = await detectLifeStages('user-1', []);
    expect(result).toEqual({ stages: [], transitions: [] });
    expect(H.getQueryCount()).toBe(0);
  });

  it('legacy oracle still costs 7 queries per month (documents the former budget)', async () => {
    H.seed(emptySeed());
    H.resetQueryCount();
    await legacyDetectLifeStages('user-1', CURRENT_MONTHS);
    expect(H.getQueryCount()).toBe(21); // 3 × 7 — the cost C-2b removed
  });
});
