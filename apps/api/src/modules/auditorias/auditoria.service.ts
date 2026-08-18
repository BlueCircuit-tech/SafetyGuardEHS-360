import type { Prisma } from '@prisma/client';
import { arredondar, percentual, type AuditoriaCreateData, type AuditoriaFiltro } from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { NaoEncontrado } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria, type ContextoAuditoria } from '../../lib/auditoria.js';

const ENTIDADE = 'Auditoria';

/** Score derivado: requisitos atendidos sobre avaliados. Nunca digitado. */
function scoreDaAuditoria(auditoria: { requisitosAvaliados: number | null; requisitosAtendidos: number | null }) {
  if (!auditoria.requisitosAvaliados || auditoria.requisitosAtendidos === null) return null;
  return percentual(auditoria.requisitosAtendidos, auditoria.requisitosAvaliados);
}

const COM_CLIENTE = {
  cliente: { select: { id: true, nomeFantasia: true } },
} satisfies Prisma.AuditoriaInclude;

export async function listarAuditorias(filtro: AuditoriaFiltro = {}) {
  const where: Prisma.AuditoriaWhereInput = {};
  if (filtro.clienteId) where.clienteId = filtro.clienteId;
  if (filtro.tipo) where.tipo = filtro.tipo;
  if (filtro.situacao) where.situacao = filtro.situacao;
  if (filtro.busca) {
    where.OR = [
      { titulo: { contains: filtro.busca, mode: 'insensitive' } },
      { auditor: { contains: filtro.busca, mode: 'insensitive' } },
      { referencia: { contains: filtro.busca, mode: 'insensitive' } },
    ];
  }

  const itens = await prisma.auditoria.findMany({
    where,
    orderBy: { dataRealizacao: 'desc' },
    take: 200,
    include: COM_CLIENTE,
  });

  return itens.map((auditoria) => ({ ...auditoria, score: scoreDaAuditoria(auditoria) }));
}

export async function obterAuditoriaOuFalhar(id: string) {
  const auditoria = await prisma.auditoria.findUnique({ where: { id }, include: COM_CLIENTE });
  if (!auditoria) throw new NaoEncontrado('Auditoria nao encontrada.', 'AUDITORIA_NAO_ENCONTRADA');
  return { ...auditoria, score: scoreDaAuditoria(auditoria) };
}

export async function criarAuditoria(dados: AuditoriaCreateData, contexto: ContextoAuditoria = {}) {
  const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true } });
  if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');

  return prisma.$transaction(async (tx) => {
    const auditoria = await tx.auditoria.create({ data: dados as Prisma.AuditoriaUncheckedCreateInput });
    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: auditoria.id,
      acao: 'CRIACAO',
      alteracoes: calcularDiferenca({}, auditoria as unknown as Record<string, unknown>),
      contexto,
    });
    return { ...auditoria, score: scoreDaAuditoria(auditoria) };
  });
}

export async function atualizarAuditoria(
  id: string,
  dados: Partial<AuditoriaCreateData>,
  contexto: ContextoAuditoria = {},
) {
  const atual = await prisma.auditoria.findUnique({ where: { id } });
  if (!atual) throw new NaoEncontrado('Auditoria nao encontrada.', 'AUDITORIA_NAO_ENCONTRADA');

  return prisma.$transaction(async (tx) => {
    const auditoria = await tx.auditoria.update({
      where: { id },
      data: dados as Prisma.AuditoriaUncheckedUpdateInput,
      include: COM_CLIENTE,
    });

    const diferenca = calcularDiferenca(
      atual as unknown as Record<string, unknown>,
      auditoria as unknown as Record<string, unknown>,
    );
    if (Object.keys(diferenca).length > 0) {
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: id,
        acao: 'ATUALIZACAO',
        alteracoes: diferenca,
        contexto,
      });
    }

    return { ...auditoria, score: scoreDaAuditoria(auditoria) };
  });
}

export async function excluirAuditoria(id: string, contexto: ContextoAuditoria = {}): Promise<void> {
  const auditoria = await prisma.auditoria.findUnique({ where: { id }, select: { titulo: true } });
  if (!auditoria) throw new NaoEncontrado('Auditoria nao encontrada.', 'AUDITORIA_NAO_ENCONTRADA');

  await prisma.$transaction(async (tx) => {
    await tx.auditoria.delete({ where: { id } });
    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'EXCLUSAO',
      alteracoes: { titulo: { de: auditoria.titulo, para: null } },
      contexto,
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Nota do pilar                                                               */
/* -------------------------------------------------------------------------- */

const JANELA_MESES = 12;

/**
 * Nota do pilar AUDITORIAS: media dos scores das auditorias CONCLUIDAS nos
 * ultimos 12 meses. `null` sem nenhuma — o motor renormaliza.
 */
export async function notaDeAuditorias(filtro: { clienteId?: string } = {}): Promise<number | null> {
  const inicio = new Date();
  inicio.setMonth(inicio.getMonth() - JANELA_MESES);

  const concluidas = await prisma.auditoria.findMany({
    where: {
      situacao: 'CONCLUIDA',
      dataRealizacao: { gte: inicio },
      requisitosAvaliados: { not: null },
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
    },
    select: { requisitosAvaliados: true, requisitosAtendidos: true },
  });

  const scores = concluidas
    .map(scoreDaAuditoria)
    .filter((score): score is number => score !== null);

  if (scores.length === 0) return null;
  return arredondar(scores.reduce((soma, score) => soma + score, 0) / scores.length);
}

/** Cards do painel de auditorias. */
export async function resumoAuditorias(clienteId?: string) {
  const base: Prisma.AuditoriaWhereInput = clienteId ? { clienteId } : {};

  const [total, planejadas, emAndamento, concluidas, agregadoNc] = await prisma.$transaction([
    prisma.auditoria.count({ where: base }),
    prisma.auditoria.count({ where: { ...base, situacao: 'PLANEJADA' } }),
    prisma.auditoria.count({ where: { ...base, situacao: 'EM_ANDAMENTO' } }),
    prisma.auditoria.count({ where: { ...base, situacao: 'CONCLUIDA' } }),
    prisma.auditoria.aggregate({
      where: { ...base, situacao: 'CONCLUIDA' },
      _sum: { ncMaiores: true, ncMenores: true },
    }),
  ]);

  return {
    total,
    planejadas,
    emAndamento,
    concluidas,
    ncMaiores: agregadoNc._sum.ncMaiores ?? 0,
    ncMenores: agregadoNc._sum.ncMenores ?? 0,
    nota: await notaDeAuditorias({ clienteId }),
  };
}
