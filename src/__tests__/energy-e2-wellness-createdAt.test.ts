/**
 * E-2 — H-2: GET /api/wellness debe exponer createdAt.
 *
 * La UI de Energía (src/app/(dashboard)/imperio/energia/page.tsx) renderiza
 * safeFormatTime(log.createdAt) en cada fila. El select del GET (introducido
 * en PERF-5.2 para reducir payload) excluía createdAt, así que tras cada
 * recarga la hora caía al fallback "—". Este test congela el CONTRATO del
 * shape: incluye createdAt y no añade NINGÚN campo más.
 *
 * Estrategia: el mock de Prisma simula la semántica real de `select`
 * (solo se devuelven las claves pedidas). Así la aserción sobre la respuesta
 * HTTP es una aserción sobre el select real del handler — el test falla sin
 * el fix y pasa con él, sin acoplarse a la implementación.
 *
 * Nutrition no se toca: su GET no usa select y devuelve el modelo completo
 * (incluye createdAt) — se congela también para demostrar que no se rompe.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock setup (hoisted) ────────────────────────────────────

const H = vi.hoisted(() => {
  // Fila "completa" tal como la devolvería Prisma sin select (modelo real:
  // id, userId, date, mood, energy, sleep, stress, notes, createdAt, updatedAt).
  const FULL_WELLNESS_ROW = {
    id: 'wl-1',
    userId: 'user-1',
    date: new Date('2026-09-07T10:00:00.000Z'),
    mood: 4,
    energy: 3,
    sleep: 4,
    stress: 2,
    notes: 'Bien',
    createdAt: new Date('2026-09-07T10:30:00.000Z'),
    updatedAt: new Date('2026-09-07T10:30:00.000Z'),
  };

  const FULL_NUTRITION_ROW = {
    id: 'nl-1',
    userId: 'user-1',
    date: new Date('2026-09-07T10:00:00.000Z'),
    meals: 'Comida',
    water: 6,
    calories: 2100,
    notes: null,
    createdAt: new Date('2026-09-07T11:00:00.000Z'),
    updatedAt: new Date('2026-09-07T11:00:00.000Z'),
  };

  const wellnessFindMany = vi.fn();
  const nutritionFindMany = vi.fn();

  const MOCK_DB = {
    wellnessLog: { findMany: wellnessFindMany },
    nutritionLog: { findMany: nutritionFindMany },
  };

  return { FULL_WELLNESS_ROW, FULL_NUTRITION_ROW, MOCK_DB, wellnessFindMany, nutritionFindMany };
});

vi.mock('@/lib/db', () => ({ db: H.MOCK_DB }));

vi.mock('@/lib/auth', () => ({
  getAuthUser: vi.fn(),
  getAuthUserBasic: vi.fn().mockResolvedValue({ id: 'user-1', plan: 'free' }),
}));

// El GET de wellness/nutrition no usa rate-limit, pero el módulo se importa
// a nivel de ruta — se mockea para aislar la prueba.
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ limited: false }),
  RATE_LIMITS: {},
  rateLimitedResponse: vi.fn(),
}));

vi.mock('@/lib/challenge-auto-complete', () => ({
  tryAutoCompleteChallenge: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/achievements', () => ({
  evaluateAchievements: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/widgets/triggers', () => ({
  onEnergiaChange: vi.fn().mockResolvedValue(undefined),
  onCheckinChange: vi.fn().mockResolvedValue(undefined),
}));

// Semántica real de `select` de Prisma: filtra la fila a las claves pedidas.
H.wellnessFindMany.mockImplementation(async ({ select }: { select?: Record<string, boolean> }) => {
  if (!select) return [{ ...H.FULL_WELLNESS_ROW }];
  return [Object.fromEntries(Object.entries(H.FULL_WELLNESS_ROW).filter(([k]) => select[k]))];
});
H.nutritionFindMany.mockImplementation(async () => [{ ...H.FULL_NUTRITION_ROW }]);

function makeGet(path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: 'GET',
    headers: { Authorization: 'Bearer valid-token' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  H.wellnessFindMany.mockImplementation(async ({ select }: { select?: Record<string, boolean> }) => {
    if (!select) return [{ ...H.FULL_WELLNESS_ROW }];
    return [Object.fromEntries(Object.entries(H.FULL_WELLNESS_ROW).filter(([k]) => select[k]))];
  });
  H.nutritionFindMany.mockImplementation(async () => [{ ...H.FULL_NUTRITION_ROW }]);
});

describe('E-2 H-2 — GET /api/wellness expone createdAt (y solo lo necesario)', () => {
  it('la respuesta incluye createdAt en cada log', async () => {
    const { GET } = await import('@/app/api/wellness/route');
    const res = await GET(makeGet('/api/wellness') as any) as unknown as Response;
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data.logs)).toBe(true);
    expect(data.logs).toHaveLength(1);
    expect(data.logs[0].createdAt).toBe('2026-09-07T10:30:00.000Z');
  });

  it('el shape es EXACTAMENTE { id, date, mood, energy, sleep, stress, notes, createdAt } — sin campos añadidos ni internos', async () => {
    const { GET } = await import('@/app/api/wellness/route');
    const res = await GET(makeGet('/api/wellness?days=30') as any) as unknown as Response;
    const data = await res.json();

    expect(Object.keys(data.logs[0]).sort()).toEqual(
      ['createdAt', 'date', 'energy', 'id', 'mood', 'notes', 'sleep', 'stress'].sort(),
    );
    // Ni userId ni updatedAt se filtran al cliente.
    expect(data.logs[0].userId).toBeUndefined();
    expect(data.logs[0].updatedAt).toBeUndefined();
  });

  it('los parámetros de la consulta no cambian (orderBy date desc, take = days)', async () => {
    const { GET } = await import('@/app/api/wellness/route');
    await GET(makeGet('/api/wellness?days=7') as any) as unknown as Response;

    expect(H.wellnessFindMany).toHaveBeenCalledTimes(1);
    const arg = H.wellnessFindMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual({ date: 'desc' });
    expect(arg.take).toBe(7);
    expect(arg.where).toEqual({ userId: 'user-1' });
  });
});

describe('E-2 H-2 — GET /api/nutrition no se rompe (modelo completo, createdAt incluido)', () => {
  it('la respuesta de nutrition sigue incluyendo createdAt', async () => {
    const { GET } = await import('@/app/api/nutrition/route');
    const res = await GET(makeGet('/api/nutrition') as any) as unknown as Response;
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.logs[0].createdAt).toBe('2026-09-07T11:00:00.000Z');
    // Sin select: la fila completa sigue disponible (id, date, meals, water, calories, notes).
    expect(data.logs[0].meals).toBe('Comida');
    expect(data.logs[0].water).toBe(6);
    expect(data.logs[0].calories).toBe(2100);
  });
});
