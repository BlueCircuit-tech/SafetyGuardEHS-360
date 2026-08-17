import type { AcaoAuditoria, Prisma, PrismaClient } from '@prisma/client';

type ClientePrisma = PrismaClient | Prisma.TransactionClient;

export interface ContextoAuditoria {
  autor?: string | null;
  ip?: string | null;
}

/** Diferenca campo a campo entre o estado anterior e o novo. */
export type Diferenca = Record<string, { de: unknown; para: unknown }>;

function normalizar(valor: unknown): unknown {
  if (valor instanceof Date) return valor.toISOString();
  return valor ?? null;
}

/**
 * Compara apenas as chaves presentes em `depois`, para que uma atualizacao
 * parcial nao registre como alteracao os campos que sequer foram enviados.
 */
export function calcularDiferenca(antes: Record<string, unknown>, depois: Record<string, unknown>): Diferenca {
  const diferenca: Diferenca = {};

  for (const [campo, valorDepois] of Object.entries(depois)) {
    if (campo === 'atualizadoEm' || campo === 'criadoEm') continue;
    const de = normalizar(antes[campo]);
    const para = normalizar(valorDepois);
    if (JSON.stringify(de) !== JSON.stringify(para)) {
      diferenca[campo] = { de, para };
    }
  }

  return diferenca;
}

/** Grava um evento na trilha de auditoria. */
export async function registrarAuditoria(
  db: ClientePrisma,
  dados: {
    entidade: string;
    entidadeId: string;
    acao: AcaoAuditoria;
    alteracoes?: Diferenca | null;
    contexto?: ContextoAuditoria;
  },
): Promise<void> {
  await db.registroAuditoria.create({
    data: {
      entidade: dados.entidade,
      entidadeId: dados.entidadeId,
      acao: dados.acao,
      alteracoes: (dados.alteracoes ?? undefined) as Prisma.InputJsonValue | undefined,
      autor: dados.contexto?.autor ?? null,
      ip: dados.contexto?.ip ?? null,
    },
  });
}
