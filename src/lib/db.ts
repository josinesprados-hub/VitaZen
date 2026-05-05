import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

// [PRISMA DEBUG] Log modelos disponibles en runtime
console.log('[PRISMA MODELS]:', Object.keys(db))

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db