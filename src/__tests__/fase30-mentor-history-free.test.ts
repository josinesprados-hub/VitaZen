// ═════════════════════════════════════════════════════════════════════
// FASE 30 — MENTOR FREE/PREMIUM: HISTORIAL, LÍMITES Y ELIMINACIÓN
// ═════════════════════════════════════════════════════════════════════
//
// Fixes under test (spec §12):
//   BUG 2 / §1  GET /api/ai/threads no longer truncates FREE to the 10 most
//               recent threads nor PREMIUM to 100: every plan pages through
//               its ENTIRE history via keyset pagination (cursor + id
//               tie-breaker). History is not a premium feature.
//   §2          Pagination: stable order (updatedAt desc, id desc), opaque
//               cursor, invalid cursor → 400, page-size is a TRANSPORT cap
//               (≤ 50) — never a functional limit.
//   §8          Server-side search (?q=) — always scoped to the session user.
//   §3 / §6     POST: FREE keeps MAX_THREADS_FREE = 5 (archived not counted);
//               PREMIUM has NO functional creation cap (the old 100 is gone).
//   §4          DELETE: ownership enforced (A cannot delete B's thread);
//               deleting works for old conversations; AIUsage is NEVER
//               touched (deleting frees a conversation slot, never returns
//               daily messages — §5).
//   BUG 4 / §7  messages route: PREMIUM with >500 messages now receives the
//               500 MOST RECENT (orderBy desc + take + reverse), in
//               chronological display order, exactly like the FREE path (T-1).
//   §11         Ownership: A cannot list B's thread messages; cursor/search
//               can never escape the authenticated userId.
//   §12.21-24   Regression: the daily-limit module is untouched by DELETE
//               (asserted), FREE/PREMIUM message-path split preserved.
//
// Test strategy: Prisma is mocked with REAL keyset semantics over in-memory
// datasets (same approach as notifications-n04), so pagination correctness
// is verified against actual cursor behavior — not just call counts.
// ═════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ─── Module mocks ─────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  getAuthUser: vi.fn(),
  getAuthUserBasic: vi.fn(),
}));

// limits: mock the module (threads route only imports getAIUsageRemaining;
// the real module's checkAILimit/rollbackAILimit are exercised by the
// existing suite and remain untouched by this phase).
vi.mock('@/lib/limits', () => ({
  getAIUsageRemaining: vi.fn(async () => ({ remaining: 10, limit: 10 })),
  getDailyLimit: vi.fn(() => 10),
  checkAILimit: vi.fn(),
  rollbackAILimit: vi.fn(),
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, rateLimit: vi.fn() };
});

// ─── In-memory datasets with REAL keyset semantics ────────────────────

type ThreadRow = {
  id: string;
  userId: string;
  title: string;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  messages: Array<{ role: string; createdAt: Date }>;
};

function makeThreads(n: number, opts: { userId: string; archived?: boolean; oldDaysAgo?: number; prefix?: string }): ThreadRow[] {
  const base = Date.now() - (opts.oldDaysAgo ?? 0) * 24 * 60 * 60 * 1000;
  return Array.from({ length: n }, (_, i) => {
    // Distinct updatedAt per thread; some duplicates are injected by
    // tieBreaker-aware tests via sameUpdatedAtGroups.
    const d = new Date(base - i * 60_000);
    return {
      id: `${opts.prefix ?? 'thr'}-${String(i + 1).padStart(4, '0')}`,
      userId: opts.userId,
      title: `Conversación ${i + 1}`,
      archived: opts.archived ?? false,
      createdAt: d,
      updatedAt: d,
      messages: [{ role: 'user', createdAt: d }],
    };
  });
}

/** Threads sharing updatedAt values (2 per timestamp) to exercise the id tie-breaker. */
function makeTiedThreads(n: number, userId: string): ThreadRow[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.now() - Math.floor(i / 2) * 60_000);
    return {
      id: `tied-${String(i + 1).padStart(4, '0')}`,
      userId,
      title: `Empatada ${i + 1}`,
      archived: false,
      createdAt: d,
      updatedAt: d,
      messages: [],
    };
  });
}

type KeysetClause = { AND?: Array<{ OR?: Array<Record<string, any>> }> };

/**
 * Evaluates the exact where-shape the route builds: scalar userId/archived,
 * title contains (+ insensitive), and the keyset AND/OR clause.
 */
function matchWhere(where: Record<string, any>, row: ThreadRow): boolean {
  if (where.userId !== undefined && row.userId !== where.userId) return false;
  if (where.archived !== undefined && row.archived !== where.archived) return false;
  if (where.title && typeof where.title.contains === 'string') {
    const hay = row.title.toLowerCase();
    const needle = where.title.mode === 'insensitive' ? where.title.contains.toLowerCase() : where.title.contains;
    if (!hay.includes(needle)) return false;
  }
  const keyset = (where as KeysetClause).AND?.[0];
  if (keyset?.OR) {
    const ltClause = keyset.OR[0]?.updatedAt?.lt;
    const eqClause = keyset.OR[1]?.AND?.[0]?.updatedAt?.equals;
    const idLt = keyset.OR[1]?.AND?.[1]?.id?.lt;
    const a = ltClause !== undefined && row.updatedAt < new Date(ltClause);
    const b =
      eqClause !== undefined &&
      row.updatedAt.getTime() === new Date(eqClause).getTime() &&
      idLt !== undefined &&
      row.id < idLt;
    if (!(a || b)) return false;
  }
  return true;
}

function prismaKeysetFindMany(getRows: () => ThreadRow[]) {
  return vi.fn(async (args: any) => {
    let rows = getRows().filter(r => matchWhere(args.where ?? {}, r));
    const order = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
    rows = [...rows].sort((a, b) => {
      for (const o of order) {
        const key = Object.keys(o)[0];
        const dir = o[key] === 'desc' ? -1 : 1;
        const av = a[key as 'updatedAt' | 'id'];
        const bv = b[key as 'updatedAt' | 'id'];
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
      }
      return 0;
    });
    if (typeof args.take === 'number') rows = rows.slice(0, args.take);
    return rows;
  });
}

function prismaCount(getRows: () => ThreadRow[]) {
  return vi.fn(async (args: any) => getRows().filter(r => matchWhere(args.where ?? {}, r as ThreadRow)).length);
}

// ─── DB mock wiring ───────────────────────────────────────────────────

let THREADS: ThreadRow[] = [];
let MESSAGES: Array<{ id: string; threadId: string; role: string; content: string; createdAt: Date }> = [];

const findManyMock = vi.fn();
const messageFindManyMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    aIThread: {
      count: (...a: unknown[]) => countMock(...a),
      findMany: (...a: unknown[]) => findManyMock(...a),
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    aIMessage: {
      findMany: (...a: unknown[]) => messageFindManyMock(...a),
    },
    aIUsage: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let countMock: any;

// ─── Imports under test (after mocks) ─────────────────────────────────

import { GET as threadsGet, POST as threadsPost, DELETE as threadsDelete } from '@/app/api/ai/threads/route';
import { GET as messagesGet } from '@/app/api/ai/threads/[threadId]/messages/route';
import { getAuthUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';

const mockGetAuthUser = vi.mocked(getAuthUser);
const mockRateLimit = vi.mocked(rateLimit);

const USER_A = { id: 'user_a', plan: 'FREE' };
const USER_B = { id: 'user_b', plan: 'PREMIUM' };

beforeEach(() => {
  vi.clearAllMocks();
  THREADS = [];
  MESSAGES = [];
  countMock = prismaCount(() => THREADS);
  // Re-wire the aIThread.count indirection (vi.clearAllMocks keeps wrappers)
  findManyMock.mockImplementation(prismaKeysetFindMany(() => THREADS));
  messageFindManyMock.mockImplementation(async (args: any) => {
    let rows = MESSAGES.filter(m => !args.where?.threadId || m.threadId === args.where.threadId);
    const order = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
    rows = [...rows].sort((a, b) => {
      for (const o of order) {
        const key = Object.keys(o)[0];
        const dir = o[key] === 'desc' ? -1 : 1;
        if (a[key] < b[key]) return -1 * dir;
        if (a[key] > b[key]) return 1 * dir;
      }
      return 0;
    });
    if (typeof args.take === 'number') rows = rows.slice(0, args.take);
    return rows;
  });
  mockRateLimit.mockResolvedValue({ limited: false, current: 1, resetAt: Date.now() + 60_000 } as never);
  mockGetAuthUser.mockImplementation(async (token: string) =>
    token === 'token-a' ? (USER_A as never) : token === 'token-b' ? (USER_B as never) : null,
  );
  (vi.mocked(db.aIThread.create) as any).mockImplementation(async (args: any) => {
    const now = new Date();
    const row: ThreadRow = {
      id: 'thr-new-' + (THREADS.length + 1),
      userId: args.data.userId,
      title: args.data.title ?? 'Nueva conversación',
      archived: false,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    THREADS = [row, ...THREADS];
    return row;
  });
});

// ─── Request helpers ──────────────────────────────────────────────────

function getRequest(url: string, token = 'token-a'): NextRequest {
  const absolute = url.startsWith('http') ? url : `http://localhost:3000${url}`;
  return { headers: new Headers({ Authorization: `Bearer ${token}` }), url: absolute } as unknown as NextRequest;
}

function jsonRequest(body: unknown, token = 'token-a'): NextRequest {
  return {
    headers: new Headers({ Authorization: `Bearer ${token}` }),
    url: 'http://localhost:3000/api/ai/threads',
    json: async () => body,
  } as unknown as NextRequest;
}

// ═════════════════════════════════════════════════════════════════════
// GET /api/ai/threads — full history via keyset pagination
// ═════════════════════════════════════════════════════════════════════

describe('FASE 30 — GET threads: el historial FREE ya no está truncado (BUG 2 / §1-§2)', () => {
  it('1. FREE con 35 conversaciones (incluidas de hace meses) pagina TODO su historial', async () => {
    THREADS = [
      ...makeThreads(20, { userId: 'user_a', oldDaysAgo: 90, prefix: 'old' }),
      ...makeThreads(15, { userId: 'user_a', prefix: 'new' }),
    ];
    // Sort so the dataset is not pre-ordered (the route must order it)
    THREADS = THREADS.slice().reverse();

    const res = await threadsGet(getRequest('/api/ai/threads'));
    const body = await res.json();

    expect(res.status).toBe(200);
    // Default page size is 30 (transport cap), NOT the old FREE cap of 10
    expect(body.threads).toHaveLength(30);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBeTruthy();
    expect(body.totalActiveCount).toBe(35);

    // Walk every page — the union must cover the WHOLE history
    const seen: string[] = [];
    let cursor: string | null = body.nextCursor;
    let guard = 0;
    let first = true;
    while (cursor && guard++ < 10) {
      const url = '/api/ai/threads' + (first ? '' : `?cursor=${encodeURIComponent(cursor)}`);
      const pageRes = await threadsGet(getRequest(url));
      const page = await pageRes.json();
      seen.push(...page.threads.map((t: ThreadRow) => t.id));
      cursor = page.nextCursor;
      first = false;
    }
    expect(seen).toHaveLength(35);
    expect(new Set(seen).size).toBe(35); // no duplicates, no gaps
  });

  it('2. orden estable: updatedAt desc con id como tie-breaker (updatedAt repetido)', async () => {
    THREADS = makeTiedThreads(9, 'user_a');

    const res = await threadsGet(getRequest('/api/ai/threads?limit=4'));
    const p1 = await res.json();
    expect(p1.threads).toHaveLength(4);
    expect(p1.hasMore).toBe(true);

    const res2 = await threadsGet(getRequest(`/api/ai/threads?limit=4&cursor=${encodeURIComponent(p1.nextCursor)}`));
    const p2 = await res2.json();

    const ids = [...p1.threads.map((t: ThreadRow) => t.id), ...p2.threads.map((t: ThreadRow) => t.id)];
    expect(new Set(ids).size).toBe(ids.length); // sin repetidos entre páginas
    // Orden global esperado: updatedAt desc, id desc
    const expected = [...THREADS]
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.id < b.id ? 1 : -1))
      .map(t => t.id);
    expect(ids).toEqual(expected.slice(0, 8));
  });

  it('3. cursor manipulado o inválido → 400 (nunca 500 ni datos)', async () => {
    THREADS = makeThreads(3, { userId: 'user_a' });
    const res = await threadsGet(getRequest('/api/ai/threads?cursor=garbage!!'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid cursor');
  });

  it('4. el cursor NO escapa del userId: todas las consultas van filtradas por el usuario de sesión (§11/§19)', async () => {
    THREADS = [...makeThreads(6, { userId: 'user_a', prefix: 'ua' }), ...makeThreads(4, { userId: 'user_b', prefix: 'ub' })];

    const res = await threadsGet(getRequest('/api/ai/threads?limit=2'));
    const p1 = await res.json();
    expect(p1.threads).toHaveLength(2);
    expect(p1.threads.every((t: ThreadRow) => t.userId === 'user_a')).toBe(true);

    // Even with a cursor "stolen" from another user, the where clause of
    // every findMany call carries the SESSION user id.
    const res2 = await threadsGet(getRequest(`/api/ai/threads?limit=50&cursor=${encodeURIComponent(p1.nextCursor)}`));
    await res2.json();
    for (const call of findManyMock.mock.calls) {
      expect(call[0].where.userId).toBe('user_a');
    }
  });

  it('5. búsqueda server-side (?q=) filtra por título y SIEMPRE por userId (§8/§20)', async () => {
    THREADS = [
      ...makeThreads(3, { userId: 'user_a', prefix: 'q1' }).map((t, i) => ({ ...t, title: `Plan salud mental ${i + 1}` })),
      ...makeThreads(2, { userId: 'user_a', prefix: 'q2' }),
      ...makeThreads(2, { userId: 'user_b', prefix: 'q3' }).map((t, i) => ({ ...t, title: `salud de otro usuario ${i + 1}` })),
    ];

    const res = await threadsGet(getRequest('/api/ai/threads?q=SALUD'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.threads).toHaveLength(3); // solo las suyas (insensible a mayúsculas)
    expect(body.threads.every((t: ThreadRow) => t.userId === 'user_a')).toBe(true);

    const lastCall = findManyMock.mock.calls.at(-1)![0];
    expect(lastCall.where.title).toEqual({ contains: 'SALUD', mode: 'insensitive' });
    expect(lastCall.where.userId).toBe('user_a');
  });

  it('6. limit es un cap técnico de transporte: se acota a 50 aunque el cliente pida más (§2)', async () => {
    THREADS = makeThreads(80, { userId: 'user_a' });
    const res = await threadsGet(getRequest('/api/ai/threads?limit=999'));
    const body = await res.json();
    expect(body.threads).toHaveLength(50); // MAX_PAGE_SIZE
    expect(body.hasMore).toBe(true);
    expect(findManyMock.mock.calls.at(-1)![0].take).toBe(51); // pageSize + 1
  });

  it('7. respuesta compatible: historyLimited=false para ambos planes, counts reales (no page-size)', async () => {
    THREADS = [...makeThreads(7, { userId: 'user_a', prefix: 'fa' }), ...makeThreads(3, { userId: 'user_a', archived: true, prefix: 'fb' })];

    const resFree = await threadsGet(getRequest('/api/ai/threads'));
    const free = await resFree.json();
    expect(free.historyLimited).toBe(false);
    expect(free.totalActiveCount).toBe(7);
    expect(free.totalArchivedCount).toBe(3);
    // Sin ?archived= → activas + archivadas mezcladas (contrato legacy), 7+3
    expect(free.threads).toHaveLength(10);

    THREADS = THREADS.map(t => ({ ...t, userId: 'user_b' }));
    const resPrem = await threadsGet(getRequest('/api/ai/threads', 'token-b'));
    const prem = await resPrem.json();
    expect(prem.historyLimited).toBe(false);
    expect(prem.totalActiveCount).toBe(7);
  });

  it('8. PREMIUM con 120 conversaciones pagina sin cap funcional de 100 (§6/§14)', async () => {
    THREADS = makeThreads(120, { userId: 'user_b' });

    const res = await threadsGet(getRequest('/api/ai/threads?limit=50', 'token-b'));
    const p1 = await res.json();
    expect(p1.threads).toHaveLength(50);
    expect(p1.hasMore).toBe(true);
    expect(p1.totalActiveCount).toBe(120);

    const res2 = await threadsGet(getRequest(`/api/ai/threads?limit=50&cursor=${encodeURIComponent(p1.nextCursor)}`, 'token-b'));
    const p2 = await res2.json();
    expect(p2.threads).toHaveLength(50);
    const res3 = await threadsGet(getRequest(`/api/ai/threads?limit=50&cursor=${encodeURIComponent(p2.nextCursor)}`, 'token-b'));
    const p3 = await res3.json();
    expect(p3.threads).toHaveLength(20);
    expect(p3.hasMore).toBe(false);
    expect(p3.nextCursor).toBeNull();
  });

  it('9. filtro archived=true sigue funcionando con paginación (archivadas consultables)', async () => {
    THREADS = [...makeThreads(4, { userId: 'user_a', prefix: 'act' }), ...makeThreads(6, { userId: 'user_a', archived: true, oldDaysAgo: 60, prefix: 'arc' })];

    const res = await threadsGet(getRequest('/api/ai/threads?archived=true'));
    const body = await res.json();
    expect(body.threads).toHaveLength(6);
    expect(body.threads.every((t: ThreadRow) => t.archived)).toBe(true);
    expect(body.totalArchivedCount).toBe(6);
  });
});

// ═════════════════════════════════════════════════════════════════════
// POST /api/ai/threads — límite FREE 5 activas / PREMIUM sin límite
// ═════════════════════════════════════════════════════════════════════

describe('FASE 30 — POST threads: límite de 5 activas FREE intacto; PREMIUM sin límite funcional (§3/§6)', () => {
  it('10. FREE con 5 activas NO puede crear la sexta (403 server-side)', async () => {
    THREADS = makeThreads(5, { userId: 'user_a' });
    const res = await threadsPost(jsonRequest({ title: 'Sexta' }));
    expect(res.status).toBe(403);
    expect(vi.mocked(db.aIThread.create)).not.toHaveBeenCalled();
  });

  it('11. las archivadas NO cuentan para el límite FREE (4 activas + 3 archivadas → crea)', async () => {
    THREADS = [...makeThreads(4, { userId: 'user_a', prefix: 'act' }), ...makeThreads(3, { userId: 'user_a', archived: true, prefix: 'arc' })];
    const res = await threadsPost(jsonRequest({ title: 'Quinta' }));
    expect(res.status).toBe(200);
    expect(vi.mocked(db.aIThread.create)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.aIThread.create).mock.calls[0][0].data.userId).toBe('user_a');
  });

  it('12. PREMIUM con 1000 activas crea la 1001 — sin bloqueo funcional de 100 (§13)', async () => {
    THREADS = makeThreads(1000, { userId: 'user_b' });
    const res = await threadsPost(jsonRequest({ title: '1001' }, 'token-b'));
    expect(res.status).toBe(200);
    expect(vi.mocked(db.aIThread.create)).toHaveBeenCalledTimes(1);
  });

  it('13. FREE 5/5 → elimina una → puede crear otra (4/5 → crea) — server-side', async () => {
    THREADS = makeThreads(5, { userId: 'user_a' });
    expect((await threadsPost(jsonRequest({ title: 'x' }))).status).toBe(403);

    // User deletes one (DELETE verified below) → count drops to 4
    THREADS = THREADS.slice(0, 4);
    const res = await threadsPost(jsonRequest({ title: 'Nueva tras eliminar' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.thread.id).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════
// DELETE /api/ai/threads — ownership, antigüedad irrelevante, AIUsage intacto
// ═════════════════════════════════════════════════════════════════════

describe('FASE 30 — DELETE threads: ownership y cuota diaria intocada (§4/§5/§11)', () => {
  it('14. el usuario A NO puede eliminar el thread de B (404, delete no llamado) (§18)', async () => {
    THREADS = makeThreads(1, { userId: 'user_b' });
    vi.mocked(db.aIThread.findFirst).mockResolvedValue(null as never);

    const res = await threadsDelete(jsonRequest({ threadId: THREADS[0].id }, 'token-a'));
    expect(res.status).toBe(404);
    expect(vi.mocked(db.aIThread.delete)).not.toHaveBeenCalled();
  });

  it('15. FREE elimina una conversación antigua propia (sin restricción de antigüedad ni plan) (§3)', async () => {
    const oldThread = makeThreads(1, { userId: 'user_a', oldDaysAgo: 200 })[0];
    THREADS = [oldThread];
    vi.mocked(db.aIThread.findFirst).mockResolvedValue(oldThread as never);
    vi.mocked(db.aIThread.delete).mockResolvedValue(oldThread as never);

    const res = await threadsDelete(jsonRequest({ threadId: oldThread.id }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(db.aIThread.delete)).toHaveBeenCalledWith({ where: { id: oldThread.id } });
  });

  it('16. DELETE NO toca AIUsage en absoluto: 10/10 mensajes usados siguen usados (§10/§11)', async () => {
    const thread = makeThreads(1, { userId: 'user_a' })[0];
    THREADS = [thread];
    vi.mocked(db.aIThread.findFirst).mockResolvedValue(thread as never);
    vi.mocked(db.aIThread.delete).mockResolvedValue(thread as never);

    await threadsDelete(jsonRequest({ threadId: thread.id }));

    expect(vi.mocked(db.aIUsage.findUnique)).not.toHaveBeenCalled();
    expect(vi.mocked(db.aIUsage.upsert)).not.toHaveBeenCalled();
    expect(vi.mocked(db.aIUsage.update)).not.toHaveBeenCalled();
    expect(vi.mocked(db.$executeRaw)).not.toHaveBeenCalled();
    expect(vi.mocked(db.$transaction)).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════
// GET messages — PREMIUM >500 recibe los 500 MÁS RECIENTES (BUG 4 / §7)
// ═════════════════════════════════════════════════════════════════════

function makeMessages(n: number, threadId: string) {
  return Array.from({ length: n }, (_, i) => ({
    id: `msg-${String(i + 1).padStart(5, '0')}`,
    threadId,
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Mensaje ${i + 1}`,
    createdAt: new Date(Date.now() - (n - i) * 60_000), // ascending
  }));
}

describe('FASE 30 — messages: los 500 disponibles son los MÁS RECIENTES, en orden cronológico', () => {
  function ownedThread(userId: string) {
    return { id: 'thr-1', userId, title: 'T', archived: false, createdAt: new Date(), updatedAt: new Date(), messages: [] };
  }

  it('17. PREMIUM con 620 mensajes: orderBy desc + take 500 + reverse → recibe 120..619 (§15)', async () => {
    THREADS = [ownedThread('user_b')];
    MESSAGES = makeMessages(620, 'thr-1');
    vi.mocked(db.aIThread.findFirst).mockResolvedValue(THREADS[0] as never);

    const res = await messagesGet(
      { headers: new Headers({ Authorization: 'Bearer token-b' }) } as unknown as NextRequest,
      { params: Promise.resolve({ threadId: 'thr-1' }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    // The query itself must be desc + take 500
    expect(messageFindManyMock.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
    expect(messageFindManyMock.mock.calls[0][0].take).toBe(500);
    // Display order chronological, and the window is the NEWEST 500
    expect(body.messages).toHaveLength(500);
    expect(body.messages[0].id).toBe('msg-00121');
    expect(body.messages.at(-1).id).toBe('msg-00620');
    for (let i = 1; i < body.messages.length; i++) {
      expect(new Date(body.messages[i].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(body.messages[i - 1].createdAt).getTime(),
      );
    }
    expect(body.historyLimited).toBe(false);
  });

  it('18. PREMIUM con <500 mensajes: todos, en orden cronológico (§15)', async () => {
    THREADS = [ownedThread('user_b')];
    MESSAGES = makeMessages(180, 'thr-1');
    vi.mocked(db.aIThread.findFirst).mockResolvedValue(THREADS[0] as never);

    const res = await messagesGet(
      { headers: new Headers({ Authorization: 'Bearer token-b' }) } as unknown as NextRequest,
      { params: Promise.resolve({ threadId: 'thr-1' }) },
    );
    const body = await res.json();
    expect(body.messages).toHaveLength(180);
    expect(body.messages[0].id).toBe('msg-00001');
    expect(body.messages.at(-1).id).toBe('msg-00180');
  });

  it('19. PREMIUM con exactamente 500 mensajes: los 500, ordenado', async () => {
    THREADS = [ownedThread('user_b')];
    MESSAGES = makeMessages(500, 'thr-1');
    vi.mocked(db.aIThread.findFirst).mockResolvedValue(THREADS[0] as never);

    const res = await messagesGet(
      { headers: new Headers({ Authorization: 'Bearer token-b' }) } as unknown as NextRequest,
      { params: Promise.resolve({ threadId: 'thr-1' }) },
    );
    const body = await res.json();
    expect(body.messages).toHaveLength(500);
    expect(body.messages[0].id).toBe('msg-00001');
  });

  it('20. FREE mantiene T-1: las 50 más recientes en orden cronológico (regresión §10)', async () => {
    THREADS = [ownedThread('user_a')];
    MESSAGES = makeMessages(80, 'thr-1');
    vi.mocked(db.aIThread.findFirst).mockResolvedValue(THREADS[0] as never);

    const res = await messagesGet(
      { headers: new Headers({ Authorization: 'Bearer token-a' }) } as unknown as NextRequest,
      { params: Promise.resolve({ threadId: 'thr-1' }) },
    );
    const body = await res.json();
    expect(messageFindManyMock.mock.calls[0][0].take).toBe(50);
    expect(body.messages).toHaveLength(50);
    expect(body.messages[0].id).toBe('msg-00031'); // 31..80 — la ventana reciente
    expect(body.messages.at(-1).id).toBe('msg-00080');
  });

  it('21. el usuario A NO puede listar los mensajes del thread de B (ownership, §17)', async () => {
    THREADS = [ownedThread('user_b')];
    vi.mocked(db.aIThread.findFirst).mockResolvedValue(null as never);

    const res = await messagesGet(
      { headers: new Headers({ Authorization: 'Bearer token-a' }) } as unknown as NextRequest,
      { params: Promise.resolve({ threadId: 'thr-1' }) },
    );
    expect(res.status).toBe(404);
    expect(messageFindManyMock).not.toHaveBeenCalled();
  });
});
