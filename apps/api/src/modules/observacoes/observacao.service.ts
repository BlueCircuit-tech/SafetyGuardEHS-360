import type { Observacao, Prisma } from '@prisma/client';
import {
  calcularIir,
  grauRiscoPeloIir,
  planoDeComunicacao,
  type EventoComunicacao,
  type GrauRiscoOcorrencia,
  type ObservacaoCreateData,
  type ObservacaoFiltro,
  type TipoObservacao,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria, type ContextoAuditoria } from '../../lib/auditoria.js';
import { obterEmpresaOuFalhar } from '../empresa/empresa.service.js';
import { resolverTokenQr } from '../areas/area.service.js';

const ENTIDADE = 'Observacao';

export interface PaginaObservacoes {
  itens: Observacao[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

export const COM_RELACOES = {
  area: { select: { id: true, nome: true, codigo: true, setor: true, criticidade: true } },
  cliente: {
    select: {
      id: true,
      nomeFantasia: true,
      numeroContrato: true,
      centroNegocio: { select: { id: true, nome: true, codigo: true } },
    },
  },
  terceiro: { select: { id: true, nomeFantasia: true } },
  causa: { select: { id: true, codigo: true, descricao: true, destinatarioSugerido: true } },
} satisfies Prisma.ObservacaoInclude;

/* -------------------------------------------------------------------------- */
/* Risco e comunicacao                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Calcula IIR e grau de risco quando os quatro fatores vieram preenchidos.
 * O schema ja garante que eles vêm juntos ou nenhum.
 */
function avaliarRisco(dados: {
  severidade?: number | null;
  probabilidade?: number | null;
  exposicao?: number | null;
  frequencia?: number | null;
}): { iir: number | null; grauRisco: GrauRiscoOcorrencia | null } {
  const { severidade, probabilidade, exposicao, frequencia } = dados;

  if (
    severidade === null || severidade === undefined ||
    probabilidade === null || probabilidade === undefined ||
    exposicao === null || exposicao === undefined ||
    frequencia === null || frequencia === undefined
  ) {
    return { iir: null, grauRisco: null };
  }

  const { valor } = calcularIir({ severidade, probabilidade, exposicao, frequencia });
  return { iir: valor, grauRisco: grauRiscoPeloIir(valor) };
}

/** Traduz o tipo da observacao no evento que a matriz de comunicacao entende. */
export function eventoDaObservacao(tipo: TipoObservacao, classificacaoBird: string | null): EventoComunicacao | null {
  if (classificacaoBird && classificacaoBird !== 'ATOS_E_CONDICOES') {
    return classificacaoBird as EventoComunicacao;
  }
  if (tipo === 'CONDICAO_INSEGURA') return 'CONDICAO_INSEGURA';
  if (tipo === 'COMPORTAMENTO_INSEGURO') return 'COMPORTAMENTO_INSEGURO';
  if (tipo === 'NAO_CONFORMIDADE') return 'CONDICAO_INSEGURA';
  return null;
}

/**
 * Resolve o plano de comunicacao da observacao: quem e avisado, por qual canal
 * e em que prazo. Usa a matriz do pacote compartilhado — nao ha regra aqui.
 */
export function comunicacaoDaObservacao(observacao: {
  tipo: TipoObservacao;
  classificacaoBird: string | null;
  grauRisco: GrauRiscoOcorrencia | null;
  causa?: { descricao: string } | null;
}) {
  const evento = eventoDaObservacao(observacao.tipo, observacao.classificacaoBird);
  if (!evento) return null;

  // Sem avaliacao de risco, assume o grau mais brando previsto na matriz.
  const grau = observacao.grauRisco ?? 'II';
  return planoDeComunicacao(evento, grau, observacao.causa?.descricao);
}

/** Prazo-limite da tratativa, a partir da matriz de comunicacao. */
function calcularPrazoLimite(
  dataHora: Date,
  tipo: TipoObservacao,
  classificacaoBird: string | null,
  grauRisco: GrauRiscoOcorrencia | null,
): Date | null {
  const regra = comunicacaoDaObservacao({ tipo, classificacaoBird, grauRisco });
  if (!regra) return null;

  if (regra.ateFimDoDia) {
    const fim = new Date(dataHora);
    fim.setHours(23, 59, 59, 999);
    return fim;
  }

  return new Date(dataHora.getTime() + regra.prazoHoras * 60 * 60 * 1000);
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                     */
/* -------------------------------------------------------------------------- */

export function montarWhere(empresaId: string, filtro: Partial<ObservacaoFiltro>): Prisma.ObservacaoWhereInput {
  const cliente: Prisma.ClienteWhereInput = { empresaId };
  if (filtro.centroNegocioId) cliente.centroNegocioId = filtro.centroNegocioId;

  const where: Prisma.ObservacaoWhereInput = { cliente };

  if (filtro.clienteId) where.clienteId = filtro.clienteId;
  if (filtro.areaId) where.areaId = filtro.areaId;
  if (filtro.terceiroId) where.terceiroId = filtro.terceiroId;
  if (filtro.tipo) where.tipo = filtro.tipo;
  if (filtro.situacao) where.situacao = filtro.situacao;

  if (filtro.de || filtro.ate) {
    where.dataHora = {
      ...(filtro.de ? { gte: filtro.de } : {}),
      ...(filtro.ate ? { lte: filtro.ate } : {}),
    };
  }

  const busca = filtro.busca?.trim();
  if (busca) {
    where.OR = [
      { descricao: { contains: busca, mode: 'insensitive' } },
      { observador: { contains: busca, mode: 'insensitive' } },
      { acaoImediata: { contains: busca, mode: 'insensitive' } },
      { area: { nome: { contains: busca, mode: 'insensitive' } } },
      { area: { codigo: { contains: busca, mode: 'insensitive' } } },
    ];
  }

  return where;
}

export async function listarObservacoes(filtro: ObservacaoFiltro): Promise<PaginaObservacoes> {
  const empresa = await obterEmpresaOuFalhar();
  const where = montarWhere(empresa.id, filtro);

  const [total, itens] = await prisma.$transaction([
    prisma.observacao.count({ where }),
    prisma.observacao.findMany({
      where,
      orderBy: { [filtro.ordenarPor]: filtro.direcao },
      skip: (filtro.pagina - 1) * filtro.porPagina,
      take: filtro.porPagina,
      include: COM_RELACOES,
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

export async function obterObservacaoOuFalhar(id: string): Promise<Observacao> {
  const observacao = await prisma.observacao.findUnique({ where: { id }, include: COM_RELACOES });
  if (!observacao) throw new NaoEncontrado('Observacao nao encontrada.', 'OBSERVACAO_NAO_ENCONTRADA');
  return observacao;
}

/* -------------------------------------------------------------------------- */
/* Catalogo de causas                                                          */
/* -------------------------------------------------------------------------- */

export async function listarCausas(tipo?: TipoObservacao, incluirInativas = false) {
  return prisma.causaDesvio.findMany({
    where: { ...(tipo ? { tipo } : {}), ...(incluirInativas ? {} : { ativa: true }) },
    orderBy: [{ tipo: 'asc' }, { descricao: 'asc' }],
  });
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                     */
/* -------------------------------------------------------------------------- */

/** Resolve a area a partir do id ou do token do QR Code. */
async function resolverArea(dados: { areaId?: string | null; tokenQr?: string | null }) {
  if (dados.tokenQr) return resolverTokenQr(dados.tokenQr);

  if (!dados.areaId) {
    throw new RequisicaoInvalida('Informe a area (ou leia o QR Code).', 'AREA_NAO_INFORMADA');
  }

  const area = await prisma.area.findUnique({ where: { id: dados.areaId } });
  if (!area) throw new NaoEncontrado('Area nao encontrada.', 'AREA_NAO_ENCONTRADA');
  return area;
}

export async function criarObservacao(
  dados: ObservacaoCreateData,
  contexto: ContextoAuditoria = {},
): Promise<Observacao> {
  const area = await resolverArea(dados);

  if (dados.terceiroId) {
    const terceiro = await prisma.terceiro.findFirst({
      where: { id: dados.terceiroId, clienteId: area.clienteId },
      select: { id: true },
    });
    if (!terceiro) {
      throw new RequisicaoInvalida(
        'O terceiro informado nao atua neste cliente.',
        'TERCEIRO_FORA_DO_CLIENTE',
        { campos: { terceiroId: ['Terceiro nao pertence ao cliente desta area.'] } },
      );
    }
  }

  const { tokenQr: _tokenQr, areaId: _areaId, ...resto } = dados;
  const { iir, grauRisco } = avaliarRisco(dados);
  const prazoLimite = calcularPrazoLimite(dados.dataHora, dados.tipo, dados.classificacaoBird ?? null, grauRisco);

  const data: Prisma.ObservacaoUncheckedCreateInput = {
    ...resto,
    areaId: area.id,
    // Derivado da area — nunca do payload.
    clienteId: area.clienteId,
    iir,
    grauRisco,
    prazoLimite,
  };

  return prisma.$transaction(async (tx) => {
    const observacao = await tx.observacao.create({ data, include: COM_RELACOES });

    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: observacao.id,
      acao: 'CRIACAO',
      alteracoes: calcularDiferenca({}, observacao as unknown as Record<string, unknown>),
      contexto,
    });

    return observacao;
  });
}

export async function atualizarObservacao(
  id: string,
  dados: Partial<ObservacaoCreateData>,
  contexto: ContextoAuditoria = {},
): Promise<Observacao> {
  const atual = await obterObservacaoOuFalhar(id);
  // `areaId` nulo significa "nao enviado" — nao pode virar null no banco.
  const { tokenQr: _tokenQr, areaId, ...resto } = dados;
  const areaDestino = areaId ?? undefined;

  // Recalcula o risco com a mistura do que ja existia e do que veio no payload.
  const fatores = {
    severidade: resto.severidade ?? atual.severidade,
    probabilidade: resto.probabilidade ?? atual.probabilidade,
    exposicao: resto.exposicao ?? atual.exposicao,
    frequencia: resto.frequencia ?? atual.frequencia,
  };
  const { iir, grauRisco } = avaliarRisco(fatores);

  const tipo = (resto.tipo ?? atual.tipo) as TipoObservacao;
  const bird = resto.classificacaoBird ?? atual.classificacaoBird;
  const dataHora = resto.dataHora ?? atual.dataHora;

  // Tipado explicitamente na variante "unchecked": trabalhamos com as chaves
  // estrangeiras diretas (areaId, causaId, terceiroId), nao com `connect`.
  const data: Prisma.ObservacaoUncheckedUpdateInput = {
    ...resto,
    ...(areaDestino ? { areaId: areaDestino } : {}),
    iir,
    grauRisco,
    prazoLimite: calcularPrazoLimite(dataHora, tipo, bird, grauRisco),
  };

  return prisma.$transaction(async (tx) => {
    const observacao = await tx.observacao.update({ where: { id }, data, include: COM_RELACOES });

    const diferenca = calcularDiferenca(
      atual as unknown as Record<string, unknown>,
      observacao as unknown as Record<string, unknown>,
    );

    if (Object.keys(diferenca).length > 0) {
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: observacao.id,
        acao: 'ATUALIZACAO',
        alteracoes: diferenca,
        contexto,
      });
    }

    return observacao;
  });
}

export async function excluirObservacao(id: string, contexto: ContextoAuditoria = {}): Promise<void> {
  const observacao = await obterObservacaoOuFalhar(id);

  await prisma.$transaction(async (tx) => {
    await tx.observacao.delete({ where: { id } });
    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'EXCLUSAO',
      alteracoes: {
        tipo: { de: observacao.tipo, para: null },
        descricao: { de: observacao.descricao, para: null },
      },
      contexto,
    });
  });
}

export async function definirArquivo(
  id: string,
  campo: 'fotoUrl' | 'assinaturaUrl',
  url: string | null,
  contexto: ContextoAuditoria = {},
): Promise<Observacao> {
  await obterObservacaoOuFalhar(id);

  return prisma.$transaction(async (tx) => {
    const observacao = await tx.observacao.update({
      where: { id },
      data: { [campo]: url },
      include: COM_RELACOES,
    });

    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'ATUALIZACAO',
      alteracoes: { [campo]: { de: null, para: url } },
      contexto,
    });

    return observacao;
  });
}

export async function listarAuditoriaObservacao(id: string, limite = 50) {
  await obterObservacaoOuFalhar(id);
  return prisma.registroAuditoria.findMany({
    where: { entidade: ENTIDADE, entidadeId: id },
    orderBy: { criadoEm: 'desc' },
    take: limite,
  });
}
