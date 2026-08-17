import type { Prisma, Terceiro } from '@prisma/client';
import {
  FAIXAS_CLASSIFICACAO,
  limparCnpj,
  type ClassificacaoSsma,
  type TerceiroCreateData,
  type TerceiroFiltro,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { Conflito, NaoEncontrado } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria, type ContextoAuditoria } from '../../lib/auditoria.js';
import { obterEmpresaOuFalhar } from '../empresa/empresa.service.js';
import { obterClienteOuFalhar } from '../clientes/cliente.service.js';

const ENTIDADE = 'Terceiro';

export interface PaginaTerceiros {
  itens: Terceiro[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

/** Faixa numerica [minimo, maximo) de uma classificacao do ranking. */
function faixaDaClassificacao(classificacao: ClassificacaoSsma): { gte: number; lt?: number } {
  const indice = FAIXAS_CLASSIFICACAO.findIndex((faixa) => faixa.classificacao === classificacao);
  const atual = FAIXAS_CLASSIFICACAO[indice]!;
  const acima = FAIXAS_CLASSIFICACAO[indice - 1];
  return acima ? { gte: atual.minimo, lt: acima.minimo } : { gte: atual.minimo };
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                     */
/* -------------------------------------------------------------------------- */

function montarWhere(empresaId: string, filtro: TerceiroFiltro): Prisma.TerceiroWhereInput {
  // Escopo pela matriz: o terceiro so existe dentro de um cliente da consultoria.
  const where: Prisma.TerceiroWhereInput = { cliente: { empresaId } };

  if (filtro.clienteId) where.clienteId = filtro.clienteId;
  if (filtro.situacao) where.situacao = filtro.situacao;
  if (filtro.grauRisco) where.grauRisco = filtro.grauRisco;

  if (filtro.classificacao) {
    where.notaSsma = faixaDaClassificacao(filtro.classificacao);
  }

  if (filtro.documentacaoVencida === 'true') {
    where.documentacaoValidaAte = { lt: new Date() };
  }

  const busca = filtro.busca?.trim();
  if (busca) {
    const somenteDocumento = limparCnpj(busca);
    where.OR = [
      { nomeFantasia: { contains: busca, mode: 'insensitive' } },
      { razaoSocial: { contains: busca, mode: 'insensitive' } },
      { atividadePrincipal: { contains: busca, mode: 'insensitive' } },
      { numeroContrato: { contains: busca, mode: 'insensitive' } },
      ...(somenteDocumento ? [{ cnpj: { contains: somenteDocumento } }] : []),
    ];
  }

  return where;
}

export async function listarTerceiros(filtro: TerceiroFiltro): Promise<PaginaTerceiros> {
  const empresa = await obterEmpresaOuFalhar();
  const where = montarWhere(empresa.id, filtro);

  // Terceiro sem nota vai para o fim do ranking, nao para o topo.
  const orderBy: Prisma.TerceiroOrderByWithRelationInput =
    filtro.ordenarPor === 'notaSsma'
      ? { notaSsma: { sort: filtro.direcao, nulls: 'last' } }
      : { [filtro.ordenarPor]: filtro.direcao };

  const [total, itens] = await prisma.$transaction([
    prisma.terceiro.count({ where }),
    prisma.terceiro.findMany({
      where,
      orderBy,
      skip: (filtro.pagina - 1) * filtro.porPagina,
      take: filtro.porPagina,
      include: { cliente: { select: { id: true, nomeFantasia: true, numeroContrato: true } } },
    }),
  ]);

  return {
    itens,
    total,
    pagina: filtro.pagina,
    porPagina: filtro.porPagina,
    totalPaginas: Math.max(1, Math.ceil(total / filtro.porPagina)),
  };
}

export async function obterTerceiroOuFalhar(id: string): Promise<Terceiro> {
  const terceiro = await prisma.terceiro.findUnique({
    where: { id },
    include: { cliente: { select: { id: true, nomeFantasia: true, numeroContrato: true } } },
  });
  if (!terceiro) throw new NaoEncontrado('Terceiro nao encontrado.', 'TERCEIRO_NAO_ENCONTRADO');
  return terceiro;
}

/**
 * Ranking de desempenho SSMA. Terceiros ainda nao avaliados ficam de fora —
 * eles aparecem na listagem como "nao avaliado", mas nao ocupam posicao.
 */
export async function rankingTerceiros(opcoes: { clienteId?: string; limite?: number } = {}) {
  const empresa = await obterEmpresaOuFalhar();

  return prisma.terceiro.findMany({
    where: {
      cliente: { empresaId: empresa.id },
      ...(opcoes.clienteId ? { clienteId: opcoes.clienteId } : {}),
      situacao: { in: ['ATIVO', 'SUSPENSO', 'BLOQUEADO'] },
      notaSsma: { not: null },
    },
    orderBy: [{ notaSsma: 'desc' }, { nomeFantasia: 'asc' }],
    take: opcoes.limite ?? 50,
    select: {
      id: true,
      nomeFantasia: true,
      cnpj: true,
      atividadePrincipal: true,
      notaSsma: true,
      metaNotaSsma: true,
      grauRisco: true,
      situacao: true,
      corDestaque: true,
      quantidadeFuncionarios: true,
      dataUltimaAvaliacao: true,
      cliente: { select: { id: true, nomeFantasia: true } },
    },
  });
}

/** Contagens usadas nos cards da listagem. */
export async function resumoTerceiros(clienteId?: string) {
  const empresa = await obterEmpresaOuFalhar();
  const base: Prisma.TerceiroWhereInput = {
    cliente: { empresaId: empresa.id },
    ...(clienteId ? { clienteId } : {}),
  };

  const [total, ativos, bloqueados, docVencida, semAvaliacao, agregados] = await prisma.$transaction([
    prisma.terceiro.count({ where: base }),
    prisma.terceiro.count({ where: { ...base, situacao: 'ATIVO' } }),
    prisma.terceiro.count({ where: { ...base, situacao: 'BLOQUEADO' } }),
    prisma.terceiro.count({ where: { ...base, documentacaoValidaAte: { lt: new Date() } } }),
    prisma.terceiro.count({ where: { ...base, notaSsma: null } }),
    prisma.terceiro.aggregate({
      where: { ...base, situacao: 'ATIVO' },
      _sum: { quantidadeFuncionarios: true },
      _avg: { notaSsma: true },
    }),
  ]);

  return {
    total,
    ativos,
    bloqueados,
    documentacaoVencida: docVencida,
    semAvaliacao,
    funcionariosAlocados: agregados._sum.quantidadeFuncionarios ?? 0,
    notaMedia: agregados._avg.notaSsma === null ? null : Number(agregados._avg.notaSsma),
  };
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * O CNPJ e unico dentro de cada cliente — o mesmo terceiro pode atuar em
 * varios clientes, mas nunca duas vezes na mesma operacao.
 */
async function garantirUnicidade(clienteId: string, cnpj: string | undefined, ignorarId?: string): Promise<void> {
  if (!cnpj) return;

  const existente = await prisma.terceiro.findFirst({
    where: { clienteId, cnpj, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    select: { id: true, nomeFantasia: true },
  });

  if (existente) {
    throw new Conflito(
      `Este CNPJ ja esta cadastrado neste cliente como "${existente.nomeFantasia}".`,
      'CNPJ_TERCEIRO_DUPLICADO',
      { campos: { cnpj: ['CNPJ ja cadastrado para este cliente.'] } },
    );
  }
}

export async function criarTerceiro(dados: TerceiroCreateData, contexto: ContextoAuditoria = {}): Promise<Terceiro> {
  // Garante que o cliente existe e pertence a matriz.
  await obterClienteOuFalhar(dados.clienteId);
  await garantirUnicidade(dados.clienteId, dados.cnpj);

  return prisma.$transaction(async (tx) => {
    const terceiro = await tx.terceiro.create({ data: dados });

    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: terceiro.id,
      acao: 'CRIACAO',
      alteracoes: calcularDiferenca({}, terceiro as unknown as Record<string, unknown>),
      contexto,
    });

    return terceiro;
  });
}

export async function atualizarTerceiro(
  id: string,
  dados: Partial<TerceiroCreateData>,
  contexto: ContextoAuditoria = {},
): Promise<Terceiro> {
  const atual = await obterTerceiroOuFalhar(id);
  const clienteDestino = dados.clienteId ?? atual.clienteId;

  if (dados.clienteId && dados.clienteId !== atual.clienteId) {
    await obterClienteOuFalhar(dados.clienteId);
  }
  await garantirUnicidade(clienteDestino, dados.cnpj ?? atual.cnpj, id);

  return prisma.$transaction(async (tx) => {
    const terceiro = await tx.terceiro.update({ where: { id }, data: dados });

    const diferenca = calcularDiferenca(
      atual as unknown as Record<string, unknown>,
      terceiro as unknown as Record<string, unknown>,
    );

    if (Object.keys(diferenca).length > 0) {
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: terceiro.id,
        acao: 'ATUALIZACAO',
        alteracoes: diferenca,
        contexto,
      });
    }

    return terceiro;
  });
}

export async function excluirTerceiro(id: string, contexto: ContextoAuditoria = {}): Promise<void> {
  const terceiro = await obterTerceiroOuFalhar(id);

  await prisma.$transaction(async (tx) => {
    await tx.terceiro.delete({ where: { id } });
    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'EXCLUSAO',
      alteracoes: {
        nomeFantasia: { de: terceiro.nomeFantasia, para: null },
        cnpj: { de: terceiro.cnpj, para: null },
      },
      contexto,
    });
  });
}

export async function definirLogoTerceiro(
  id: string,
  logoUrl: string | null,
  contexto: ContextoAuditoria = {},
): Promise<Terceiro> {
  return atualizarTerceiro(id, { logoUrl }, contexto);
}

export async function listarAuditoriaTerceiro(id: string, limite = 50) {
  await obterTerceiroOuFalhar(id);
  return prisma.registroAuditoria.findMany({
    where: { entidade: ENTIDADE, entidadeId: id },
    orderBy: { criadoEm: 'desc' },
    take: limite,
  });
}
