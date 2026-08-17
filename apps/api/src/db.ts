import { PrismaClient } from '@prisma/client';
import { isProducao } from './env.js';

/**
 * Cliente Prisma reaproveitado entre reloads do `tsx watch`, evitando
 * estourar o pool de conexoes do Postgres em desenvolvimento.
 */
const globalRef = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalRef.prisma ??
  new PrismaClient({
    log: isProducao ? ['warn', 'error'] : ['warn', 'error'],
  });

if (!isProducao) globalRef.prisma = prisma;
