import type { EmpresaConsultoria, Prisma, PrismaClient } from '@prisma/client';
import {
  montarCabecalhoInstitucional,
  type CabecalhoInstitucional,
  type EmpresaConsultoriaCreateData,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { Conflito, NaoEncontrado } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria, type ContextoAuditoria } from '../../lib/auditoria.js';

const ENTIDADE = 'EmpresaConsultoria';

type ClientePrisma = PrismaClient | Prisma.TransactionClient;

/**
 * Retorna a matriz cadastrada, ou `null` quando a Etapa 1 ainda nao foi concluida.
 *
 * Aceita o cliente da transacao: chamada de dentro de um `$transaction` com o
 * `prisma` global pede uma SEGUNDA conexao do pool. Em producao o pool tem
 * uma so (connection_limit=1 no pooler), entao a consulta espera a transacao
 * liberar — e a transacao espera a consulta. Deadlock ate o timeout de 5 s.
 */
export async function obterEmpresa(db: ClientePrisma = prisma): Promise<EmpresaConsultoria | null> {
  return db.empresaConsultoria.findFirst();
}

export async function obterEmpresaOuFalhar(db: ClientePrisma = prisma): Promise<EmpresaConsultoria> {
  const empresa = await obterEmpresa(db);
  if (!empresa) {
    throw new NaoEncontrado(
      'Empresa de consultoria ainda nao cadastrada. Conclua a Etapa 1 do cadastro.',
      'MATRIZ_NAO_CADASTRADA',
    );
  }
  return empresa;
}

/** Cria a matriz do sistema. Existe no maximo uma por instalacao. */
export async function criarEmpresa(
  dados: EmpresaConsultoriaCreateData,
  contexto: ContextoAuditoria = {},
): Promise<EmpresaConsultoria> {
  const jaExiste = await prisma.empresaConsultoria.count();
  if (jaExiste > 0) {
    throw new Conflito(
      'A empresa de consultoria (matriz) ja esta cadastrada. Use PUT /api/v1/empresa para atualizar.',
      'MATRIZ_JA_CADASTRADA',
    );
  }

  return prisma.$transaction(async (tx) => {
    const empresa = await tx.empresaConsultoria.create({ data: dados });

    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: empresa.id,
      acao: 'CRIACAO',
      alteracoes: calcularDiferenca({}, empresa as unknown as Record<string, unknown>),
      contexto,
    });

    return empresa;
  });
}

/** Atualiza a matriz. Aceita payload parcial. */
export async function atualizarEmpresa(
  dados: Partial<EmpresaConsultoriaCreateData>,
  contexto: ContextoAuditoria = {},
): Promise<EmpresaConsultoria> {
  const atual = await obterEmpresaOuFalhar();

  return prisma.$transaction(async (tx) => {
    const empresa = await tx.empresaConsultoria.update({ where: { id: atual.id }, data: dados });

    const diferenca = calcularDiferenca(
      atual as unknown as Record<string, unknown>,
      empresa as unknown as Record<string, unknown>,
    );

    if (Object.keys(diferenca).length > 0) {
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: empresa.id,
        acao: 'ATUALIZACAO',
        alteracoes: diferenca,
        contexto,
      });
    }

    return empresa;
  });
}

/** Grava a logo enviada e devolve a empresa atualizada. */
export async function definirLogo(
  logoUrl: string | null,
  contexto: ContextoAuditoria = {},
): Promise<EmpresaConsultoria> {
  return atualizarEmpresa({ logoUrl }, contexto);
}

/**
 * Bloco institucional usado em relatorios, e-mails e WhatsApp.
 * Centralizado aqui para que todos os canais usem a mesma composicao.
 */
export async function obterCabecalhoInstitucional(): Promise<CabecalhoInstitucional> {
  const empresa = await obterEmpresaOuFalhar();
  return montarCabecalhoInstitucional(empresa);
}

/** Historico de alteracoes da matriz (mais recentes primeiro). */
export async function listarAuditoriaEmpresa(limite = 50) {
  const empresa = await obterEmpresaOuFalhar();
  return prisma.registroAuditoria.findMany({
    where: { entidade: ENTIDADE, entidadeId: empresa.id },
    orderBy: { criadoEm: 'desc' },
    take: limite,
  });
}
