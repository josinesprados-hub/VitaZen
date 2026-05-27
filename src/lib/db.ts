import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// ═══════════════════════════════════════════
// Prisma Client with Slow Query Logging
// ═══════════════════════════════════════════
//
// Logs queries that exceed the slow query threshold (1s by default).
// Uses Prisma's built-in logging with a custom emitter that writes
// structured JSON to console — filterable in Vercel with: vz_obs:true slow:true
//
// What we log:
//   - Slow queries (>1s) as warnings with duration
//   - Prisma warnings (deprecations, etc.)
//   - Prisma errors (connection failures, query errors, etc.)
//
// What we do NOT log:
//   - Every query (too noisy, too much overhead)
//   - Query parameters (may contain PII)
//   - Normal fast queries
//
// Privacy: only the query MODEL and duration are logged,
// never the query parameters or user data.

const SLOW_QUERY_THRESHOLD_MS = 1_000;

function createPrismaClient() {
  const dbUrl = process.env.DATABASE_URL;
  console.log(JSON.stringify({ vz_debug: true, fn: 'createPrismaClient', step: 'init', hasDbUrl: !!dbUrl, dbUrlPrefix: dbUrl ? dbUrl.substring(0, 30) + '...' : 'MISSING', nodeEnv: process.env.NODE_ENV }));
  const adapter = new PrismaPg({ connectionString: dbUrl })
  return new PrismaClient({
    adapter,
    log: [
      {
        emit: 'event',
        level: 'query',
      },
      {
        emit: 'stdout',
        level: 'warn',
      },
      {
        emit: 'stdout',
        level: 'error',
      },
    ],
  })
}

const prisma = globalForPrisma.prisma ?? createPrismaClient()

// ─── Slow query detection ────────────────────
// Listen for query events and log slow ones.
// Only attaches the listener once (singleton pattern).

if (!globalForPrisma.prisma) {
  prisma.$on('query' as never, (e: { duration: number; model?: string; query: string }) => {
    if (e.duration >= SLOW_QUERY_THRESHOLD_MS) {
      // Extract model name from the query for context
      // (Don't log the full query — it may contain user data)
      const model = e.model || 'unknown';
      console.warn(JSON.stringify({
        vz_obs: true,
        level: 'warn',
        module: 'prisma',
        msg: `Slow query on ${model}`,
        durationMs: e.duration,
        model,
        slow: true,
        ts: new Date().toISOString(),
      }));
    }
  });
}

export const db = prisma

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
