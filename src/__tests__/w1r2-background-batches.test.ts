// ═════════════════════════════════════════════════════════════════════
// FASE 25 — W-1 + R-2: HIGIENE DE BATCHES EN SEGUNDO PLANO
// ═════════════════════════════════════════════════════════════════════
//
// W-1 (widgets): la ruta /api/cron/widget-maintenance ejecutaba
// cleanupExpiredSnapshots() (deleteMany expiresAt<now SIN límite) ANTES que
// batchRefreshExpiredSnapshots(50), que busca el MISMO predicado → el lote
// recibía siempre un conjunto vacío y el refresh del cron era un NO-OP.
// Fix: refresh ANTES de cleanup + orderBy { expiresAt: 'asc' } (determinismo,
// anti-starvation; soportado por @@index([expiresAt]) "PERF-5.2: for batch
// refresh cron") + take: 50 intacto.
//
// R-2 (delivery recovery): la consulta de candidatos ordenaba solo por
// scheduledFor ASC sin desempate único. computeQuietHoursExit da a TODAS las
// notificaciones diferidas de un usuario el MISMO scheduledFor (los empates
// son la norma), así que el recorte del lote (take 100) era arbitrario.
// Fix: orderBy [{ scheduledFor: 'asc' }, { id: 'asc' }] — desempate único,
// sin tocar claim atómico, batch 100, ventana 24h ni nada más.
//
// Estrategia de mocks: findMany con semántica REAL (filtro + orderBy +
// take) sobre datasets en memoria, igual que N-04/data-cleanup, para que
// las aserciones de orden/ corte verifiquen comportamiento, no llamadas.
// ═════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Estado compartido (hoisted) ─────────────────────────────

const H = vi.hoisted(() => {
  type Snap = {
    userId: string;
    widgetType: string;
    expiresAt: Date;
    computedAt: Date;
    data: string;
    version: number;
  };
  type Deferred = {
    id: string;
    userId: string;
    status: string;
    scheduledFor: Date;
    createdAt: Date;
    attemptCount: number;
    title: string;
    body: string;
    type: string;
    processedAt?: Date | null;
  };

  const state = {
    snapshots: [] as Snap[],
    deferred: [] as Deferred[],
    users: [] as { id: string; plan: string }[],
    claimOrder: [] as string[], // ids en el orden en que se reclamaron
  };

  const recomputeSnapshot = vi.fn(async (userId: string, widgetType: string) => {
    // Simula el efecto real de recompute: expiresAt pasa a futuro → la fila
    // sobrevive al cleanup y sale del pool de expirados.
    const row = state.snapshots.find(
      s => s.userId === userId && s.widgetType === widgetType,
    );
    if (row) row.expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    return { computedAt: new Date(), expiresAt: new Date(Date.now() + 60 * 60 * 1000) };
  });

  const cleanupExpiredSnapshots = vi.fn(async () => {
    const now = new Date();
    const before = state.snapshots.length;
    state.snapshots = state.snapshots.filter(s => s.expiresAt >= now);
    return before - state.snapshots.length;
  });

  const batchRefreshExpiredSnapshots = vi.fn();
  const startCacheCleanup = vi.fn();

  // ── Semántica real de findMany para widgetSnapshot (W-1) ──
  const widgetSnapshotFindMany = vi.fn(async (args: {
    where?: { expiresAt?: { lt?: Date } };
    orderBy?: Record<string, string>;
    select?: Record<string, boolean>;
    take?: number;
  }) => {
    let rows = [...state.snapshots];
    const lt = args.where?.expiresAt?.lt;
    if (lt) rows = rows.filter(r => r.expiresAt < lt);
    // orderBy puede ser objeto o array — implementamos ambos como ASC.
    const sortKey = (r: Snap) => r.expiresAt.getTime();
    rows.sort((a, b) => sortKey(a) - sortKey(b));
    if (typeof args.take === 'number') rows = rows.slice(0, args.take);
    if (args.select) {
      return rows.map(r =>
        Object.fromEntries(
          Object.entries(r).filter(([k]) => args.select![k]),
        ),
      );
    }
    return rows;
  });

  // ── Semántica real de findMany para deferredNotification (R-2) ──
  const deferredFindMany = vi.fn(async (args: {
    where?: {
      status?: string;
      scheduledFor?: { lte?: Date };
      createdAt?: { gte?: Date };
    };
    orderBy?: Array<Record<string, string>> | Record<string, string>;
    take?: number;
  }) => {
    let rows = [...state.deferred];
    const w = args.where;
    if (w?.status !== undefined) rows = rows.filter(r => r.status === w.status);
    if (w?.scheduledFor?.lte)
      rows = rows.filter(r => r.scheduledFor <= w.scheduledFor!.lte!);
    if (w?.createdAt?.gte)
      rows = rows.filter(r => r.createdAt >= w.createdAt!.gte!);
    const orders = Array.isArray(args.orderBy)
      ? args.orderBy
      : args.orderBy
        ? [args.orderBy]
        : [];
    rows.sort((a, b) => {
      for (const o of orders) {
        if (o.scheduledFor !== undefined) {
          const d = a.scheduledFor.getTime() - b.scheduledFor.getTime();
          if (d !== 0) return o.scheduledFor === 'asc' ? d : -d;
        }
        if (o.id !== undefined) {
          const d = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
          if (d !== 0) return o.id === 'asc' ? d : -d;
        }
      }
      return 0;
    });
    if (typeof args.take === 'number') rows = rows.slice(0, args.take);
    return rows;
  });

  // ── Claim atómico: registra orden y falla por defecto (count 0) ──
  // NOTA: el sweep de expirados del final TAMBIÉN usa updateMany (sin id en
  // el where) — solo se registra el orden cuando hay id (claim por fila).
  const deferredClaim = vi.fn(async (args: { where: { id?: string; status?: string } }) => {
    if (args.where.id !== undefined) state.claimOrder.push(args.where.id);
    return { count: 0 };
  });

  const db = {
    widgetSnapshot: {
      findMany: widgetSnapshotFindMany,
      upsert: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      count: vi.fn(async () => 0),
    },
    user: {
      findMany: vi.fn(async (args: { where: { id: { in: string[] } } }) =>
        state.users.filter(u => args.where.id.in.includes(u.id)),
      ),
    },
    deferredNotification: {
      findMany: deferredFindMany,
      updateMany: deferredClaim,
      update: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => null),
    },
    notificationPreference: { findUnique: vi.fn(async () => null) },
    pushToken: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    notificationLog: { create: vi.fn(async () => ({})) },
  };

  return {
    state,
    db,
    recomputeSnapshot,
    cleanupExpiredSnapshots,
    batchRefreshExpiredSnapshots,
    startCacheCleanup,
    widgetSnapshotFindMany,
    deferredFindMany,
    deferredClaim,
  };
});

vi.mock('@/lib/db', () => ({ db: H.db }));

// refresh.ts importa './snapshot' directamente — se mockea el módulo para
// observar recomputes sin tocar shaping/DB reales.
vi.mock('@/lib/widgets/snapshot', () => ({
  recomputeSnapshot: H.recomputeSnapshot,
  cleanupExpiredSnapshots: H.cleanupExpiredSnapshots,
}));

// Para el test de RUTA se mockea el barrel '@/lib/widgets' (la ruta importa
// desde él) — los tests de función usan el refresh.ts real.
vi.mock('@/lib/widgets', () => ({
  batchRefreshExpiredSnapshots: H.batchRefreshExpiredSnapshots,
  cleanupExpiredSnapshots: H.cleanupExpiredSnapshots,
}));
vi.mock('@/lib/widgets/cache', () => ({
  startCacheCleanup: H.startCacheCleanup,
}));
vi.mock('@/lib/observability/server-tracking', () => ({
  trackCronFailure: vi.fn(),
  trackCronSlowRun: vi.fn(),
  trackBatchProcessingFailure: vi.fn(),
}));
vi.mock('@/lib/observability/server-logger', () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// delivery-recovery importa firebase-admin a nivel de módulo — se mockea
// para poder importar el módulo real sin credenciales.
vi.mock('firebase-admin/messaging', () => ({ getMessaging: vi.fn() }));
vi.mock('@/lib/notifications/firebase-admin-wrapper', () => ({
  getFirebaseAdminApp: vi.fn(),
}));

import { batchRefreshExpiredSnapshots } from '@/lib/widgets/refresh';
import { processDeferredNotifications } from '@/lib/notifications/delivery-recovery';
import { RECOVERY_BATCH_SIZE } from '@/lib/notifications/recovery-constants';

// ─── Helpers ─────────────────────────────────────────────────

let tick = 0;
function expiredSnap(
  userId: string,
  widgetType: string,
  minutesAgoExpired: number,
): { userId: string; widgetType: string; expiresAt: Date } {
  return {
    userId,
    widgetType,
    expiresAt: new Date(Date.now() - minutesAgoExpired * 60 * 1000),
  };
}

function seedSnapshots(n: number, shuffle = false) {
  const rows = Array.from({ length: n }, (_, i) => ({
    ...expiredSnap(`user-${i}`, 'momentum', 1000 - i), // expiraciones escalonadas
    computedAt: new Date(),
    data: '{}',
    version: 1,
  }));
  if (shuffle) rows.sort(() => Math.random() - 0.5);
  H.state.snapshots.push(...rows);
  return rows;
}

function seedDeferred(id: string, scheduledFor: Date, createdAtOffsetMin = 10) {
  H.state.deferred.push({
    id,
    userId: `u-${id}`,
    status: 'pending',
    scheduledFor,
    createdAt: new Date(Date.now() - createdAtOffsetMin * 60 * 1000),
    attemptCount: 0,
    title: 't',
    body: 'b',
    type: 'daily',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  H.state.snapshots = [];
  H.state.deferred = [];
  H.state.users = [];
  H.state.claimOrder = [];
  H.deferredClaim.mockClear();
  // Re-armar la implementación POR DEFECTO de recompute (algunos tests la
  // sobreescriben con una variante que lanza errores; clearAllMocks no
  // restaura implementaciones).
  H.recomputeSnapshot.mockImplementation(async (userId: string, widgetType: string) => {
    const row = H.state.snapshots.find(
      s => s.userId === userId && s.widgetType === widgetType,
    );
    if (row) row.expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    return { computedAt: new Date(), expiresAt: new Date(Date.now() + 60 * 60 * 1000) };
  });
  // Los mocks del barrel reciben mockResolvedValue en el test de ruta — reset.
  H.batchRefreshExpiredSnapshots.mockReset();
  H.state.users = [
    { id: 'user-0', plan: 'FREE' },
    { id: 'user-1', plan: 'premium' },
  ];
});

// ═════════════════════════════════════════════════════════════
// W-1 — batchRefreshExpiredSnapshots
// ═════════════════════════════════════════════════════════════

describe('W-1 — batchRefreshExpiredSnapshots', () => {
  it('consulta expiresAt < now con orderBy expiresAt ASC y take=50 por defecto', async () => {
    await batchRefreshExpiredSnapshots();

    expect(H.widgetSnapshotFindMany).toHaveBeenCalledTimes(1);
    const args = H.widgetSnapshotFindMany.mock.calls[0][0] as {
      where: { expiresAt: { lt: Date } };
      orderBy: Record<string, string>;
      take: number;
    };
    expect(args.where.expiresAt.lt).toBeInstanceOf(Date);
    expect(args.where.expiresAt.lt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(args.orderBy).toEqual({ expiresAt: 'asc' });
    expect(args.take).toBe(50); // límite intacto
  });

  it('respeta el límite explícito (50 desde la ruta) y procesa solo filas expiradas', async () => {
    seedSnapshots(3);
    // una fila NO expirada no debe salir en la consulta
    H.state.snapshots.push({
      userId: 'user-fresh',
      widgetType: 'momentum',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      computedAt: new Date(),
      data: '{}',
      version: 1,
    });

    const res = await batchRefreshExpiredSnapshots(50);

    expect(H.widgetSnapshotFindMany.mock.calls[0][0].take).toBe(50);
    expect(res).toEqual({ processed: 3, refreshed: 3, errors: 0 });
    expect(H.recomputeSnapshot).toHaveBeenCalledTimes(3);
    expect(H.recomputeSnapshot).toHaveBeenCalledWith('user-0', 'momentum', 'FREE');
    expect(H.recomputeSnapshot).toHaveBeenCalledWith('user-1', 'momentum', 'premium');
  });

  it('si el plan del usuario no está en la BD usa FREE como fallback', async () => {
    H.state.snapshots.push({
      ...expiredSnap('ghost-user', 'checkin', 30),
      computedAt: new Date(),
      data: '{}',
      version: 1,
    });
    H.state.users = []; // sin filas de usuario

    const res = await batchRefreshExpiredSnapshots(50);

    expect(H.recomputeSnapshot).toHaveBeenCalledWith('ghost-user', 'checkin', 'FREE');
    expect(res.refreshed).toBe(1);
  });

  it('cuenta errores sin abortar el lote (una fila fallando no detiene las demás)', async () => {
    seedSnapshots(3);
    H.recomputeSnapshot.mockImplementation(async (userId: string) => {
      if (userId === 'user-1') throw new Error('boom');
      const row = H.state.snapshots.find(s => s.userId === userId);
      if (row) row.expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      return { computedAt: new Date(), expiresAt: new Date() };
    });

    const res = await batchRefreshExpiredSnapshots(50);

    expect(res).toEqual({ processed: 3, refreshed: 2, errors: 1 });
    expect(H.recomputeSnapshot).toHaveBeenCalledTimes(3);
  });

  it('con >50 expirados selecciona exactamente los 50 MÁS ANTIGUOS por expiresAt ASC', async () => {
    const rows = seedSnapshots(60, /* shuffle */ true);
    H.state.snapshots.sort(() => Math.random() - 0.5); // orden físico arbitrario
    // Esperado calculado ANTES de la pasada: el mock de recompute muta
    // expiresAt de las filas procesadas (salen del pool expirado).
    const oldest50 = [...rows]
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())
      .slice(0, 50)
      .map(r => `${r.userId}:${r.widgetType}`);

    const res = await batchRefreshExpiredSnapshots(50);

    expect(res.processed).toBe(50);
    expect(H.recomputeSnapshot).toHaveBeenCalledTimes(50);

    const calls = H.recomputeSnapshot.mock.calls as unknown as [string, string, string][];
    const processed = new Set(calls.map(([uid, type]) => `${uid}:${type}`));
    // Los 50 seleccionados son EXACTAMENTE los de expiración más antigua
    expect(processed).toEqual(new Set(oldest50));
    // y el primero procesado es el más antiguo de todos
    expect(calls[0][0]).toBe(oldest50[0].split(':')[0]);
  });

  it('no existe starvation: dos pasadas consecutivas procesan el pool completo sin repetir', async () => {
    seedSnapshots(60, true);

    // Pasada 1: 50 más antiguos (el mock de recompute les da expiresAt futuro)
    const r1 = await batchRefreshExpiredSnapshots(50);
    expect(r1).toEqual({ processed: 50, refreshed: 50, errors: 0 });

    // Pasada 2: las 10 restantes (las 50 ya no están expiradas)
    const r2 = await batchRefreshExpiredSnapshots(50);
    expect(r2).toEqual({ processed: 10, refreshed: 10, errors: 0 });

    expect(H.recomputeSnapshot).toHaveBeenCalledTimes(60);
    // Sin duplicados: cada (user,type) se refrescó exactamente una vez
    const keys = (H.recomputeSnapshot.mock.calls as [string, string][]).map(
      ([u, t]) => `${u}:${t}`,
    );
    expect(new Set(keys).size).toBe(60);
  });
});

// ═════════════════════════════════════════════════════════════
// W-1 — orden de operaciones del cron widget-maintenance
// ═════════════════════════════════════════════════════════════

describe('W-1 — /api/cron/widget-maintenance ejecuta refresh ANTES que cleanup', () => {
  it('con secret válido: refresh(limite 50) → cleanup, en ese orden, y respuesta 200', async () => {
    process.env.CRON_SECRET = 'test-cron-secret';
    H.batchRefreshExpiredSnapshots.mockResolvedValue({
      processed: 2,
      refreshed: 2,
      errors: 0,
    });
    H.cleanupExpiredSnapshots.mockResolvedValue(7);

    const { GET } = await import('@/app/api/cron/widget-maintenance/route');
    const req = new Request('http://localhost/api/cron/widget-maintenance', {
      headers: { authorization: 'Bearer test-cron-secret' },
    });
    const res = (await GET(req as any)) as unknown as Response;

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.refresh).toEqual({ processed: 2, refreshed: 2, errors: 0 });
    expect(data.cleanup).toEqual({ deletedSnapshots: 7 });

    // Orden: refresh OCURRE ANTES que cleanup (invocationCallOrder global)
    expect(H.batchRefreshExpiredSnapshots).toHaveBeenCalledTimes(1);
    expect(H.cleanupExpiredSnapshots).toHaveBeenCalledTimes(1);
    expect(H.batchRefreshExpiredSnapshots.mock.invocationCallOrder[0]).toBeLessThan(
      H.cleanupExpiredSnapshots.mock.invocationCallOrder[0],
    );
    // El límite 50 llega desde la ruta
    expect(H.batchRefreshExpiredSnapshots).toHaveBeenCalledWith(50);
    // El timer del cache se arranca
    expect(H.startCacheCleanup).toHaveBeenCalledTimes(1);
  });

  it('sin/ con secret incorrecto devuelve 401 y NO toca snapshots', async () => {
    process.env.CRON_SECRET = 'test-cron-secret';

    const { GET } = await import('@/app/api/cron/widget-maintenance/route');

    const noAuth = new Request('http://localhost/api/cron/widget-maintenance');
    const badAuth = new Request('http://localhost/api/cron/widget-maintenance', {
      headers: { authorization: 'Bearer wrong-secret' },
    });

    for (const req of [noAuth, badAuth]) {
      const res = (await GET(req as any)) as unknown as Response;
      expect(res.status).toBe(401);
    }
    expect(H.batchRefreshExpiredSnapshots).not.toHaveBeenCalled();
    expect(H.cleanupExpiredSnapshots).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════
// R-2 — processDeferredNotifications: desempate determinista
// ═════════════════════════════════════════════════════════════

describe('R-2 — delivery recovery: orderBy [{ scheduledFor asc }, { id asc }]', () => {
  it('la consulta de candidatos usa desempate único por id, take=100 y filtros intactos', async () => {
    seedDeferred('d-1', new Date(Date.now() - 60 * 1000));

    await processDeferredNotifications();

    expect(H.deferredFindMany).toHaveBeenCalledTimes(1);
    const args = H.deferredFindMany.mock.calls[0][0] as {
      where: {
        status: string;
        scheduledFor: { lte: Date };
        createdAt: { gte: Date };
      };
      orderBy: Array<Record<string, string>>;
      take: number;
    };
    expect(args.where.status).toBe('pending');
    expect(args.where.scheduledFor.lte).toBeInstanceOf(Date);
    // ventana de 24h intacta: createdAt >= now - 24h (tolerancia de reloj)
    const gte = args.where.createdAt.gte as Date;
    const expectedMin = Date.now() - 24 * 60 * 60 * 1000 - 5000;
    expect(gte.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(args.orderBy).toEqual([{ scheduledFor: 'asc' }, { id: 'asc' }]);
    expect(args.take).toBe(RECOVERY_BATCH_SIZE);
    expect(RECOVERY_BATCH_SIZE).toBe(100); // constante sin cambios
  });

  it('empates de scheduledFor (norma tras quiet hours): procesa en orden ASC de id', async () => {
    // Mismo instante de salida (computeQuietHoursExit da el mismo instante),
    // ids insertados en orden DESC para que el orden físico no delate.
    // Fechas RELATIVAS al reloj: todas en pasado reciente.
    const sameExit = new Date(Date.now() - 5 * 60 * 1000);
    seedDeferred('d-6', sameExit);
    seedDeferred('d-5', sameExit);
    seedDeferred('d-4', sameExit);
    seedDeferred('d-3', sameExit);
    H.state.deferred.sort(() => Math.random() - 0.5);

    await processDeferredNotifications();

    // El claim registra el orden de procesamiento; con claim count 0 todas
    // quedan "skipped" pero el ORDEN es observable y debe ser id ASC.
    expect(H.state.claimOrder).toEqual(['d-3', 'd-4', 'd-5', 'd-6']);
  });

  it('scheduledFor manda sobre id: los más antiguos primero aunque su id sea mayor', async () => {
    const earlier = new Date(Date.now() - 10 * 60 * 1000);
    const later = new Date(Date.now() - 5 * 60 * 1000);
    seedDeferred('zzz-1', later);
    seedDeferred('aaa-9', later);
    seedDeferred('mmm-2', earlier);
    H.state.deferred.sort(() => Math.random() - 0.5);

    await processDeferredNotifications();

    // primero el de scheduledFor anterior; dentro del empate, id asc
    expect(H.state.claimOrder).toEqual(['mmm-2', 'aaa-9', 'zzz-1']);
  });

  it('respeta el límite del lote: con >100 vencidas procesa exactamente las 100 primeras (deterministas)', async () => {
    const base = Date.now() - 30 * 60 * 1000; // todas en pasado reciente
    for (let i = 0; i < 130; i++) {
      seedDeferred(`d-${String(i).padStart(3, '0')}`, new Date(base + i * 1000));
    }
    H.state.deferred.sort(() => Math.random() - 0.5);

    const res = await processDeferredNotifications();

    expect(res.processed).toBe(100);
    expect(H.state.claimOrder).toHaveLength(100);
    // determinismo: son las 100 de scheduledFor más antiguo (d-000..d-099)
    expect(H.state.claimOrder[0]).toBe('d-000');
    expect(H.state.claimOrder[99]).toBe('d-099');
  });

  it('el resto del pipeline no cambia: filas futuras fuera, claim atómico presente, expiración 24h activa', async () => {
    const now = new Date();
    seedDeferred('d-future', new Date(now.getTime() + 60 * 60 * 1000)); // futura
    seedDeferred('d-due', new Date(now.getTime() - 60 * 1000)); // vencida
    seedDeferred('d-old', new Date(now.getTime() - 60 * 1000), /*created 48h ago*/ 48 * 60);

    const res = await processDeferredNotifications();

    // solo la vencida y no demasiado antigua entra en el lote
    expect(H.state.claimOrder).toEqual(['d-due']);
    expect(res.processed).toBe(1);
    expect(res.skipped).toBe(1); // claim count 0 del mock
    // la expiración de antiguos (updateMany de sweep) sigue activa
    expect(H.db.deferredNotification.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'd-old' } }),
    );
  });
});
