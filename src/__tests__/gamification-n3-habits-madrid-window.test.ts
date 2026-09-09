/**
 * N-3 — Hábitos: la ventana temporal del día civil Madrid es CANÓNICA
 * (madridDayBoundaries), nunca una duración física fija de 24 horas.
 *
 * Defecto original (auditado como N-3 en 1cbfc2f):
 *   POST /api/habits (cuota anti-spam H-05 de 5 creaciones/día) construía
 *   la ventana "hoy" como
 *       todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
 *   Un día civil de Europe/Madrid NO siempre dura 24 horas:
 *     - 2026-03-29 (cambio a verano): 23 horas. start+24h caía a las
 *       01:00 Madrid del día SIGUIENTE → la ventana filtraba la primera
 *       hora del día siguiente dentro de la cuota de hoy.
 *     - 2026-10-25 (cambio a invierno): 25 horas. start+24h caía a las
 *       23:00 Madrid del MISMO día → la última hora del día (23:00–24:00)
 *       quedaba fuera de la cuota de hoy y se contaba en la del día
 *       siguiente (creaciones a 23:30 Madrid no contaban para el día 25).
 *
 * Fix (este commit): la ventana del count es exactamente
 *       { start, end } = madridDayBoundaries(getTodayDateKey())
 *   es decir [inicio del día Madrid, inicio del día Madrid siguiente),
 *   comparada como intervalo semiabierto (gte start, lt end) — la MISMA
 *   utilidad canónica que H-10, G-07 y H-12 ya usan en este archivo y la
 *   que el propio cálculo de Retry-After (línea ~105) ya consumía.
 *
 * Semántica que NO cambia (verificada abajo):
 *   - XP de Hábitos: crear = 0 XP (G-04), completar válida = +10, undo y
 *     DELETE intactos; ningún test G-04 se modifica.
 *   - locks (familia user|disciplina|día), streak source of truth
 *     (src/lib/streaks.ts intacto), achievements, challenges, schema.
 *   - La cuota sigue siendo 5 creaciones/día Madrid.
 *
 * Estrategia de test (determinista, patrón del proyecto g04/F-7/N-2):
 * - Solo se pinea "hoy" (getTodayDateKey) a claves de fecha concretas;
 *   TODAS las conversiones Madrid (Intl) son las reales de dates.ts.
 * - La ventana que usa la lógica REAL se captura verbatim del where del
 *   habitLog.count que ejecuta el POST del route (sin sleeps, sin timers,
 *   sin azar): cada instante de prueba es un UTC timestamp explícito cuyo
 *   día Madrid fue verificado con getMadridDateKey real.
 * - La sombra del bug viejo (start+24h) se reconstruye en el test solo
 *   para DOCUMENTAR la desviación que el fix elimina.
 *
 * Fechas DST elegidas (anclas del proyecto): 2026-03-29 (23h) y
 * 2026-10-25 (25h).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { madridDayBoundaries, getMadridDateKey } from '@/lib/dates';

// ─── Mock setup (hoisted) ────────────────────────────────────

const H = vi.hoisted(() => {
  const state = { todayKey: '2026-06-15', quotaCount: 0 };

  // Ventanas capturadas verbatim del where del count real del route.
  const capturedWindows: Array<{ gte: Date; lt: Date }> = [];

  const MOCK_DB = {
    // POST /api/habits no abre transacción (G-04: sin XP, sin tx).
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
    habitLog: {
      count: vi.fn(async (args: { where: { createdAt: { gte: Date; lt: Date } } }) => {
        capturedWindows.push(args.where.createdAt);
        return state.quotaCount;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'habit-new',
        ...data,
        streak: 0,
        lastCompletedAt: null,
        createdAt: new Date(),
      })),
      findFirst: vi.fn(async () => null),
    },
  };

  const getAuthUserBasicMock = vi.fn();
  const rateLimitMock = vi.fn().mockResolvedValue({ limited: false });
  const evaluateAchievementsMock = vi.fn().mockResolvedValue([]);

  return {
    state,
    capturedWindows,
    MOCK_DB,
    getAuthUserBasicMock,
    rateLimitMock,
    evaluateAchievementsMock,
  };
});

vi.mock('@/lib/db', () => ({ db: H.MOCK_DB }));

vi.mock('@/lib/auth', () => ({
  getAuthUser: vi.fn(),
  getAuthUserBasic: H.getAuthUserBasicMock,
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: H.rateLimitMock,
  RATE_LIMITS: {},
  rateLimitedResponse: vi.fn(),
}));

vi.mock('@/lib/analytics-server', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('@/lib/achievements', () => ({
  evaluateAchievements: H.evaluateAchievementsMock,
}));

vi.mock('@/lib/challenge-auto-complete', () => ({
  tryAutoCompleteChallenge: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/widgets/triggers', () => ({
  onHabitChange: vi.fn().mockResolvedValue(undefined),
}));

// Solo se pinea "hoy"; TODAS las conversiones Madrid siguen siendo las
// reales de dates.ts (Intl) — exactamente el patrón del test G-04.
vi.mock('@/lib/dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/dates')>();
  return { ...actual, getTodayDateKey: () => H.state.todayKey };
});

vi.mock('@/lib/deterministic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deterministic')>();
  return { ...actual, getTodayDateKey: () => H.state.todayKey };
});

// ─── Helpers ─────────────────────────────────────────────────

const TEST_USER = { id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' };

const HABIT_BODY = { name: 'Leer 20 minutos', frequency: 'daily' };

async function postHabit(): Promise<Response> {
  const { POST } = await import('@/app/api/habits/route');
  return POST(
    new Request('http://localhost/api/habits', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(HABIT_BODY),
    }) as any,
  ) as unknown as Response;
}

/** Ventana canónica REAL para una clave (función genuina de dates.ts). */
function canonical(dateKey: string): { start: Date; end: Date } {
  return madridDayBoundaries(dateKey);
}

/** Sombra del bug viejo: end = start + 24h (solo para documentar). */
function oldWindow(dateKey: string): { start: Date; end: Date } {
  const start = madridDayBoundaries(dateKey).start;
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function inWindow(t: Date, w: { start?: Date; end?: Date; gte?: Date; lt?: Date }): boolean {
  const s = (w.start ?? w.gte) as Date;
  const e = (w.end ?? w.lt) as Date;
  return t.getTime() >= s.getTime() && t.getTime() < e.getTime();
}

/** Última ventana capturada del route real. */
function lastCaptured(): { gte: Date; lt: Date } {
  expect(H.capturedWindows.length).toBeGreaterThan(0);
  return H.capturedWindows[H.capturedWindows.length - 1];
}

const MS_H = 3600000;

// Instants de prueba — el día Madrid de cada uno fue verificado con
// getMadridDateKey real (Intl) antes de escribir el test:
//   2026-06-15T21:59:59Z        → 23:59:59 Madrid del 15 (CEST)
//   2026-06-15T22:00:00Z        → 00:00 Madrid del 16
//   2026-03-29T21:59:59Z        → 23:59:59 Madrid del 29 (CEST)
//   2026-03-29T22:00:00Z        → 00:00 Madrid del 30 (medianoche canónica)
//   2026-03-29T22:30:00Z        → 00:30 Madrid del 30 (fuga del bug viejo)
//   2026-10-25T22:30:00Z        → 23:30 Madrid del 25 (CET)
//   2026-10-25T22:59:59.999Z    → 23:59:59.999 Madrid del 25
//   2026-10-25T23:00:00Z        → 00:00 Madrid del 26 (medianoche canónica)
const INSIDE_NORMAL_END = new Date('2026-06-15T21:59:59Z');
const NEXT_DAY_NORMAL_START = new Date('2026-06-15T22:00:00Z');
const INSIDE_SPRING_END = new Date('2026-03-29T21:59:59Z');
const SPRING_MIDNIGHT = new Date('2026-03-29T22:00:00Z');
const OLD_LEAK_INSTANT = new Date('2026-03-29T22:30:00Z'); // 00:30 Madrid 30/03
const INSIDE_AUTUMN_2330 = new Date('2026-10-25T22:30:00Z'); // 23:30 Madrid 25/10
const INSIDE_AUTUMN_LAST = new Date('2026-10-25T22:59:59.999Z');
const AUTUMN_MIDNIGHT = new Date('2026-10-25T23:00:00Z'); // 00:00 Madrid 26/10

// ─── Estructura: la lógica real captura la ventana canónica ──

describe('N-3 — la ventana del POST real es madridDayBoundaries (captura verbatim)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.capturedWindows.length = 0;
    H.state.todayKey = '2026-06-15';
    H.state.quotaCount = 0;
    H.getAuthUserBasicMock.mockResolvedValue(TEST_USER);
    H.rateLimitMock.mockResolvedValue({ limited: false });
  });

  it('1. el where del count del route es EXACTAMENTE la ventana canónica [start,end) semiabierta', async () => {
    const res = await postHabit();
    expect(res.status).toBe(200);

    expect(H.capturedWindows.length).toBe(1);
    const captured = lastCaptured();
    const canon = canonical('2026-06-15');

    // Identidad exacta con la utilidad canónica (mismo instante, no una
    // reconstrucción aproximada):
    expect(captured.gte.getTime()).toBe(canon.start.getTime());
    expect(captured.lt.getTime()).toBe(canon.end.getTime());

    // Semiabierta: gte inclusivo (gte === start) y lt EXCLUSIVO (no lte).
    expect(captured.lt.getTime()).toBeGreaterThan(captured.gte.getTime());
  });
});

// ─── CASO A — día normal (24h) ───────────────────────────────

describe('N-3 — CASO A: día normal 2026-06-15 (24h, comportamiento idéntico)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.capturedWindows.length = 0;
    H.state.todayKey = '2026-06-15';
    H.state.quotaCount = 0;
    H.getAuthUserBasicMock.mockResolvedValue(TEST_USER);
    H.rateLimitMock.mockResolvedValue({ limited: false });
  });

  it('2. ventana de exactamente 24h: 23:59:59 Madrid dentro, 00:00 del día siguiente fuera', async () => {
    const res = await postHabit();
    expect(res.status).toBe(200);

    const captured = lastCaptured();
    // 22:00Z ↔ 00:00 Madrid (CEST, UTC+2) en junio:
    expect(captured.gte.toISOString()).toBe('2026-06-14T22:00:00.000Z');
    expect(captured.lt.toISOString()).toBe('2026-06-15T22:00:00.000Z');
    expect(captured.lt.getTime() - captured.gte.getTime()).toBe(24 * MS_H);

    // Fronteras del caso A sobre la ventana REAL del route:
    expect(inWindow(INSIDE_NORMAL_END, captured)).toBe(true); // 23:59:59
    expect(inWindow(NEXT_DAY_NORMAL_START, captured)).toBe(false); // 00:00 del 16
  });

  it('3. la cuota H-05 sigue intacta: 4 → 200 con create; 5 → 429 con Retry-After', async () => {
    H.state.quotaCount = 4;
    const ok = await postHabit();
    expect(ok.status).toBe(200);
    expect(H.MOCK_DB.habitLog.create).toHaveBeenCalledTimes(1);

    H.state.quotaCount = 5;
    const blocked = await postHabit();
    expect(blocked.status).toBe(429);
    const retry = blocked.headers.get('Retry-After');
    expect(retry).not.toBeNull();
    expect(parseInt(retry as string, 10)).toBeGreaterThanOrEqual(1);
    expect(H.MOCK_DB.habitLog.create).toHaveBeenCalledTimes(1); // sin create extra
  });
});

// ─── CASO B — cambio a verano (2026-03-29, 23 horas) ─────────

describe('N-3 — CASO B: 2026-03-29 tiene 23h; la ventana es [inicio 29, inicio 30)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.capturedWindows.length = 0;
    H.state.todayKey = '2026-03-29';
    H.state.quotaCount = 0;
    H.getAuthUserBasicMock.mockResolvedValue(TEST_USER);
    H.rateLimitMock.mockResolvedValue({ limited: false });
  });

  it('4. la ventana real dura EXACTAMENTE 23h y NO es start+24h (fuga eliminada)', async () => {
    const res = await postHabit();
    expect(res.status).toBe(200);

    const captured = lastCaptured();
    const canon = canonical('2026-03-29');
    const old = oldWindow('2026-03-29');

    // Ventana canónica exacta: 23:00Z(28) → 22:00Z(29) = 23 horas.
    expect(captured.gte.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(captured.lt.toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect(captured.lt.getTime() - captured.gte.getTime()).toBe(23 * MS_H);
    expect(captured.lt.getTime()).toBe(canon.end.getTime());

    // Sombra del bug viejo (documentación): start+24h = 2026-03-29T23:00Z
    // (= 01:00 Madrid del 30) — una hora DE MÁS que el fix ya no incluye.
    expect(old.end.toISOString()).toBe('2026-03-29T23:00:00.000Z');
    expect(captured.lt.getTime()).toBe(old.end.getTime() - 1 * MS_H);
  });

  it('5. 23:59:59 del 29 cuenta para el día 29; 00:30 del 30 NO (con el bug viejo sí contaba)', async () => {
    const res = await postHabit();
    expect(res.status).toBe(200);

    const captured = lastCaptured();
    const old = oldWindow('2026-03-29');

    // 23:59:59 Madrid del 29 → dentro de la ventana real:
    expect(inWindow(INSIDE_SPRING_END, captured)).toBe(true);
    // 00:30 Madrid del 30 → fuera de la ventana real (el día 30 tiene su
    // propia cuota):
    expect(inWindow(OLD_LEAK_INSTANT, captured)).toBe(false);
    // Sombra del bug viejo: esa misma creación de 00:30 del 30 SÍ caía
    // dentro de la ventana vieja — la fuga que el fix elimina:
    expect(inWindow(OLD_LEAK_INSTANT, old)).toBe(true);
    // Y la medianoche canónica del 30 es exactamente el fin de la ventana:
    expect(SPRING_MIDNIGHT.getTime()).toBe(captured.lt.getTime());
    expect(getMadridDateKey(SPRING_MIDNIGHT)).toBe('2026-03-30');
  });
});

// ─── CASO C — cambio a invierno (2026-10-25, 25 horas) ───────

describe('N-3 — CASO C: 2026-10-25 tiene 25h; la hora extra pertenece al día 25', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.capturedWindows.length = 0;
    H.state.todayKey = '2026-10-25';
    H.state.quotaCount = 0;
    H.getAuthUserBasicMock.mockResolvedValue(TEST_USER);
    H.rateLimitMock.mockResolvedValue({ limited: false });
  });

  it('6. la ventana real dura EXACTAMENTE 25h y NO es start+24h (última hora recuperada)', async () => {
    const res = await postHabit();
    expect(res.status).toBe(200);

    const captured = lastCaptured();
    const old = oldWindow('2026-10-25');

    // Ventana canónica exacta: 22:00Z(24) → 23:00Z(25) = 25 horas.
    expect(captured.gte.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(captured.lt.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(captured.lt.getTime() - captured.gte.getTime()).toBe(25 * MS_H);

    // Sombra del bug viejo (documentación): start+24h = 2026-10-25T22:00Z
    // (= 23:00 Madrid del 25) — el fix extiende el fin EXACTAMENTE 1 hora
    // (la hora extra del día de 25h):
    expect(old.end.toISOString()).toBe('2026-10-25T22:00:00.000Z');
    expect(captured.lt.getTime()).toBe(old.end.getTime() + 1 * MS_H);
  });

  it('7. 23:30 Madrid del 25 pertenece al día 25 (dentro); 00:00 del 26 fuera', async () => {
    const res = await postHabit();
    expect(res.status).toBe(200);

    const captured = lastCaptured();
    const old = oldWindow('2026-10-25');

    // El instante que pide el spec: 23:30 Madrid del 25 → DENTRO de la
    // ventana real (con el bug viejo quedaba fuera → se perdía la última
    // hora del día de 25h):
    expect(getMadridDateKey(INSIDE_AUTUMN_2330)).toBe('2026-10-25');
    expect(inWindow(INSIDE_AUTUMN_2330, captured)).toBe(true);
    expect(inWindow(INSIDE_AUTUMN_2330, old)).toBe(false);

    // Último instante del día de 25h dentro; medianoche del 26 fuera:
    expect(inWindow(INSIDE_AUTUMN_LAST, captured)).toBe(true);
    expect(inWindow(AUTUMN_MIDNIGHT, captured)).toBe(false);
    expect(AUTUMN_MIDNIGHT.getTime()).toBe(captured.lt.getTime());
    expect(getMadridDateKey(AUTUMN_MIDNIGHT)).toBe('2026-10-26');
  });
});

// ─── CASO D — medianoche: sin hueco, sin solapamiento ────────

describe('N-3 — CASO D: frontera de medianoche (end de N === start de N+1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.capturedWindows.length = 0;
    H.state.quotaCount = 0;
    H.getAuthUserBasicMock.mockResolvedValue(TEST_USER);
    H.rateLimitMock.mockResolvedValue({ limited: false });
  });

  async function captureTwoConsecutiveDays(dayN: string, dayN1: string) {
    H.state.todayKey = dayN;
    const resN = await postHabit();
    expect(resN.status).toBe(200);
    H.state.todayKey = dayN1;
    const resN1 = await postHabit();
    expect(resN1.status).toBe(200);
    return { wN: H.capturedWindows[0], wN1: H.capturedWindows[1] };
  }

  it('8. par normal 15→16 jun: end(15) === start(16); último instante dentro, primero del día siguiente fuera', async () => {
    const { wN, wN1 } = await captureTwoConsecutiveDays('2026-06-15', '2026-06-16');
    expect(wN1.gte.getTime()).toBe(wN.lt.getTime()); // sin hueco ni solape
    expect(inWindow(INSIDE_NORMAL_END, wN)).toBe(true); // 23:59:59 del 15 → día 15
    expect(inWindow(NEXT_DAY_NORMAL_START, wN)).toBe(false); // 00:00 del 16 → NO día 15
    expect(NEXT_DAY_NORMAL_START.getTime()).toBe(wN1.gte.getTime()); // → día 16
  });

  it('9. par DST verano 29→30 mar: end(29) === start(30) pese al día de 23h', async () => {
    const { wN, wN1 } = await captureTwoConsecutiveDays('2026-03-29', '2026-03-30');
    expect(wN.lt.getTime() - wN.gte.getTime()).toBe(23 * MS_H);
    expect(wN1.gte.getTime()).toBe(wN.lt.getTime());
    expect(inWindow(INSIDE_SPRING_END, wN)).toBe(true);
    expect(inWindow(SPRING_MIDNIGHT, wN)).toBe(false);
    expect(SPRING_MIDNIGHT.getTime()).toBe(wN1.gte.getTime());
  });

  it('10. par DST invierno 25→26 oct: end(25) === start(26) pese al día de 25h', async () => {
    const { wN, wN1 } = await captureTwoConsecutiveDays('2026-10-25', '2026-10-26');
    expect(wN.lt.getTime() - wN.gte.getTime()).toBe(25 * MS_H);
    expect(wN1.gte.getTime()).toBe(wN.lt.getTime());
    expect(inWindow(INSIDE_AUTUMN_LAST, wN)).toBe(true); // 23:59:59.999 del 25
    expect(inWindow(AUTUMN_MIDNIGHT, wN)).toBe(false); // 00:00 del 26
    expect(AUTUMN_MIDNIGHT.getTime()).toBe(wN1.gte.getTime());
  });
});

// ─── CASO E — lógica real de Hábitos (cuota H-05 con ventana Madrid) ──

describe('N-3 — CASO E: la lógica REAL de hábitos decide con la ventana Madrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.capturedWindows.length = 0;
    H.state.todayKey = '2026-10-25'; // el día de 25h como escenario
    H.state.quotaCount = 0;
    H.getAuthUserBasicMock.mockResolvedValue(TEST_USER);
    H.rateLimitMock.mockResolvedValue({ limited: false });
  });

  it('11. con 4 creaciones previas, una creación a 23:30 Madrid del 25 está permitida y la ventana que decide la cuota la incluye', async () => {
    H.state.quotaCount = 4;
    const res = await postHabit();
    expect(res.status).toBe(200);
    expect(H.MOCK_DB.habitLog.create).toHaveBeenCalledTimes(1);

    // La decisión real (count → >=5) usó la ventana capturada; esa ventana
    // incluye 23:30 Madrid del día 25 — la creación tardía del día de 25h
    // cuenta para HOY, no para mañana:
    const captured = lastCaptured();
    expect(inWindow(INSIDE_AUTUMN_2330, captured)).toBe(true);
    // …y NO incluye la primera hora del día siguiente:
    expect(inWindow(AUTUMN_MIDNIGHT, captured)).toBe(false);
  });

  it('12. escalera de cuota en el día de 25h: 0..4 → todas 200 (5 derechos); 5 → 429', async () => {
    for (let count = 0; count <= 4; count++) {
      H.state.quotaCount = count;
      const res = await postHabit();
      expect(res.status).toBe(200);
    }
    expect(H.MOCK_DB.habitLog.create).toHaveBeenCalledTimes(5);

    H.state.quotaCount = 5;
    const blocked = await postHabit();
    expect(blocked.status).toBe(429);
    expect(parseInt(blocked.headers.get('Retry-After') as string, 10)).toBeGreaterThanOrEqual(1);
    expect(H.MOCK_DB.habitLog.create).toHaveBeenCalledTimes(5); // sin 6º create
  });

  it('13. G-04 intacto: el POST sigue sin tocar XP (sin transacción, sin EmpireProgress, sin SQL raw)', async () => {
    H.state.quotaCount = 0;
    const res = await postHabit();
    expect(res.status).toBe(200);

    // Sin transacción abierta (POST nunca escribe XP desde G-04):
    expect(H.MOCK_DB.$transaction).not.toHaveBeenCalled();
    // Solo count + create tocaron la DB de hábitos:
    expect(H.MOCK_DB.habitLog.count).toHaveBeenCalledTimes(1);
    expect(H.MOCK_DB.habitLog.create).toHaveBeenCalledTimes(1);
    expect(H.MOCK_DB.habitLog.findFirst).not.toHaveBeenCalled();
    // La ventana usada sigue siendo el día Madrid canónico (no 24h fija):
    const canon = canonical('2026-10-25');
    const captured = lastCaptured();
    expect(captured.gte.getTime()).toBe(canon.start.getTime());
    expect(captured.lt.getTime()).toBe(canon.end.getTime());
  });
});
