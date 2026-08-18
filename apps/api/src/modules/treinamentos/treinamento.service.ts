import type { Prisma } from '@prisma/client';
import {
  calcularValidade,
  diasAteVencer,
  percentual,
  situacaoDaValidade,
  type MatrizFiltro,
  type RealizacaoCreateData,
  type RequisitoCreateData,
  type SituacaoCapacitacao,
  type TreinamentoCreateData,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { Conflito, NaoEncontrado } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria, type ContextoAuditoria } from '../../lib/auditoria.js';

const ENTIDADE = 'Treinamento';

/* -------------------------------------------------------------------------- */
/* Catalogo                                                                    */
/* -------------------------------------------------------------------------- */

export async function listarTreinamentos(incluirInativos = false) {
  return prisma.treinamento.findMany({
    where: incluirInativos ? {} : { ativo: true },
    orderBy: { nome: 'asc' },
    include: { _count: { select: { requisitos: true, realizacoes: true } } },
  });
}

export async function obterTreinamentoOuFalhar(id: string) {
  const treinamento = await prisma.treinamento.findUnique({
    where: { id },
    include: { requisitos: { orderBy: { funcao: 'asc' } } },
  });
  if (!treinamento) throw new NaoEncontrado('Treinamento nao encontrado.', 'TREINAMENTO_NAO_ENCONTRADO');
  return treinamento;
}

export async function criarTreinamento(dados: TreinamentoCreateData, contexto: ContextoAuditoria = {}) {
  const existente = await prisma.treinamento.findUnique({ where: { nome: dados.nome }, select: { id: true } });
  if (existente) {
    throw new Conflito('Ja existe um treinamento com este nome.', 'TREINAMENTO_DUPLICADO', {
      campos: { nome: ['Nome ja cadastrado.'] },
    });
  }

  return prisma.$transaction(async (tx) => {
    const treinamento = await tx.treinamento.create({ data: dados });
    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: treinamento.id,
      acao: 'CRIACAO',
      alteracoes: calcularDiferenca({}, treinamento as unknown as Record<string, unknown>),
      contexto,
    });
    return treinamento;
  });
}

export async function atualizarTreinamento(
  id: string,
  dados: Partial<TreinamentoCreateData>,
  contexto: ContextoAuditoria = {},
) {
  const atual = await prisma.treinamento.findUnique({ where: { id } });
  if (!atual) throw new NaoEncontrado('Treinamento nao encontrado.', 'TREINAMENTO_NAO_ENCONTRADO');

  return prisma.$transaction(async (tx) => {
    const treinamento = await tx.treinamento.update({ where: { id }, data: dados });

    const diferenca = calcularDiferenca(
      atual as unknown as Record<string, unknown>,
      treinamento as unknown as Record<string, unknown>,
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

    return treinamento;
  });
}

/**
 * Exclusao bloqueada com historico — apagar o treinamento levaria junto as
 * realizacoes (cascata) e a prova de capacitacao. O caminho e inativar.
 */
export async function excluirTreinamento(id: string, contexto: ContextoAuditoria = {}): Promise<void> {
  const treinamento = await prisma.treinamento.findUnique({
    where: { id },
    select: { nome: true, _count: { select: { realizacoes: true } } },
  });
  if (!treinamento) throw new NaoEncontrado('Treinamento nao encontrado.', 'TREINAMENTO_NAO_ENCONTRADO');

  if (treinamento._count.realizacoes > 0) {
    throw new Conflito(
      `Este treinamento tem ${treinamento._count.realizacoes} realizacao(oes) registrada(s). Inative-o para preservar o historico.`,
      'TREINAMENTO_COM_HISTORICO',
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.treinamento.delete({ where: { id } });
    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'EXCLUSAO',
      alteracoes: { nome: { de: treinamento.nome, para: null } },
      contexto,
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Matriz de requisitos                                                        */
/* -------------------------------------------------------------------------- */

export async function listarRequisitos() {
  return prisma.requisitoCapacitacao.findMany({
    orderBy: [{ funcao: 'asc' }],
    include: { treinamento: { select: { id: true, nome: true, norma: true, validadeMeses: true } } },
  });
}

export async function criarRequisito(dados: RequisitoCreateData, contexto: ContextoAuditoria = {}) {
  const treinamento = await prisma.treinamento.findUnique({ where: { id: dados.treinamentoId }, select: { id: true } });
  if (!treinamento) throw new NaoEncontrado('Treinamento nao encontrado.', 'TREINAMENTO_NAO_ENCONTRADO');

  const existente = await prisma.requisitoCapacitacao.findUnique({
    where: { funcao_treinamentoId: { funcao: dados.funcao, treinamentoId: dados.treinamentoId } },
    select: { id: true },
  });
  if (existente) {
    throw new Conflito('Esta funcao ja exige este treinamento.', 'REQUISITO_DUPLICADO');
  }

  return prisma.$transaction(async (tx) => {
    const requisito = await tx.requisitoCapacitacao.create({ data: dados });
    await registrarAuditoria(tx, {
      entidade: 'RequisitoCapacitacao',
      entidadeId: requisito.id,
      acao: 'CRIACAO',
      alteracoes: { funcao: { de: null, para: dados.funcao }, treinamentoId: { de: null, para: dados.treinamentoId } },
      contexto,
    });
    return requisito;
  });
}

export async function excluirRequisito(id: string, contexto: ContextoAuditoria = {}): Promise<void> {
  const requisito = await prisma.requisitoCapacitacao.findUnique({ where: { id } });
  if (!requisito) throw new NaoEncontrado('Requisito nao encontrado.', 'REQUISITO_NAO_ENCONTRADO');

  await prisma.$transaction(async (tx) => {
    await tx.requisitoCapacitacao.delete({ where: { id } });
    await registrarAuditoria(tx, {
      entidade: 'RequisitoCapacitacao',
      entidadeId: id,
      acao: 'EXCLUSAO',
      alteracoes: { funcao: { de: requisito.funcao, para: null } },
      contexto,
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Realizacoes                                                                 */
/* -------------------------------------------------------------------------- */

/** Sem validade informada, calcula pela reciclagem do catalogo. */
async function resolverValidadeDaRealizacao(dados: RealizacaoCreateData): Promise<Date | null> {
  if (dados.validade) return dados.validade;

  const treinamento = await prisma.treinamento.findUnique({
    where: { id: dados.treinamentoId },
    select: { validadeMeses: true },
  });
  if (!treinamento) throw new NaoEncontrado('Treinamento nao encontrado.', 'TREINAMENTO_NAO_ENCONTRADO');

  return treinamento.validadeMeses ? calcularValidade(dados.dataRealizacao, treinamento.validadeMeses) : null;
}

export async function registrarRealizacao(dados: RealizacaoCreateData, contexto: ContextoAuditoria = {}) {
  const colaborador = await prisma.colaborador.findUnique({
    where: { id: dados.colaboradorId },
    select: { id: true },
  });
  if (!colaborador) throw new NaoEncontrado('Colaborador nao encontrado.', 'COLABORADOR_NAO_ENCONTRADO');

  const validade = await resolverValidadeDaRealizacao(dados);

  return prisma.$transaction(async (tx) => {
    const realizacao = await tx.treinamentoRealizado.create({
      data: { ...dados, validade } as Prisma.TreinamentoRealizadoUncheckedCreateInput,
    });
    await registrarAuditoria(tx, {
      entidade: 'TreinamentoRealizado',
      entidadeId: realizacao.id,
      acao: 'CRIACAO',
      alteracoes: calcularDiferenca({}, realizacao as unknown as Record<string, unknown>),
      contexto,
    });
    return realizacao;
  });
}

export async function excluirRealizacao(id: string, contexto: ContextoAuditoria = {}): Promise<void> {
  const realizacao = await prisma.treinamentoRealizado.findUnique({ where: { id }, select: { id: true } });
  if (!realizacao) throw new NaoEncontrado('Registro nao encontrado.', 'REALIZACAO_NAO_ENCONTRADA');

  await prisma.$transaction(async (tx) => {
    await tx.treinamentoRealizado.delete({ where: { id } });
    await registrarAuditoria(tx, {
      entidade: 'TreinamentoRealizado',
      entidadeId: id,
      acao: 'EXCLUSAO',
      alteracoes: {},
      contexto,
    });
  });
}

export async function definirCertificado(id: string, url: string | null, contexto: ContextoAuditoria = {}) {
  const atual = await prisma.treinamentoRealizado.findUnique({ where: { id }, select: { certificadoUrl: true } });
  if (!atual) throw new NaoEncontrado('Registro nao encontrado.', 'REALIZACAO_NAO_ENCONTRADA');

  return prisma.$transaction(async (tx) => {
    const realizacao = await tx.treinamentoRealizado.update({ where: { id }, data: { certificadoUrl: url } });
    await registrarAuditoria(tx, {
      entidade: 'TreinamentoRealizado',
      entidadeId: id,
      acao: 'ATUALIZACAO',
      alteracoes: { certificadoUrl: { de: atual.certificadoUrl, para: url } },
      contexto,
    });
    return realizacao;
  });
}

/* -------------------------------------------------------------------------- */
/* Matriz de capacitacao (o cruzamento)                                        */
/* -------------------------------------------------------------------------- */

export interface LinhaMatriz {
  colaboradorId: string;
  colaborador: string;
  funcao: string;
  clienteId: string;
  cliente: string;
  terceiro: string | null;
  treinamentoId: string;
  treinamento: string;
  norma: string | null;
  dataRealizacao: Date | null;
  validade: Date | null;
  diasParaVencer: number | null;
  situacao: SituacaoCapacitacao;
}

/**
 * Cruza colaboradores ativos x requisitos da funcao x realizacoes.
 *
 * Quem nunca fez o treinamento exigido entra como `SEM_TREINAMENTO` — e conta
 * contra a nota, porque e a lacuna mais grave, nao uma ausencia de dado.
 * Funcao sem requisito cadastrado fica fora da conta: nao ha o que cobrar.
 */
export async function matrizDeCapacitacao(filtro: MatrizFiltro = {}) {
  const requisitos = await prisma.requisitoCapacitacao.findMany({
    include: { treinamento: { select: { id: true, nome: true, norma: true } } },
  });
  const porFuncao = new Map<string, typeof requisitos>();
  for (const requisito of requisitos) {
    const chave = requisito.funcao.toLowerCase();
    porFuncao.set(chave, [...(porFuncao.get(chave) ?? []), requisito]);
  }

  const colaboradores = await prisma.colaborador.findMany({
    where: {
      situacao: { not: 'DESLIGADO' },
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      ...(filtro.terceiroId ? { terceiroId: filtro.terceiroId } : {}),
      ...(filtro.funcao ? { funcao: { equals: filtro.funcao, mode: 'insensitive' } } : {}),
    },
    select: {
      id: true,
      nome: true,
      funcao: true,
      clienteId: true,
      cliente: { select: { nomeFantasia: true } },
      terceiro: { select: { nomeFantasia: true } },
      treinamentos: {
        orderBy: { dataRealizacao: 'desc' },
        select: { treinamentoId: true, dataRealizacao: true, validade: true },
      },
    },
  });

  const hoje = new Date();
  const linhas: LinhaMatriz[] = [];

  for (const colaborador of colaboradores) {
    const exigidos = porFuncao.get(colaborador.funcao.toLowerCase()) ?? [];

    for (const requisito of exigidos) {
      // Realizacao mais recente DESTE treinamento (historico preservado).
      const ultima = colaborador.treinamentos.find((registro) => registro.treinamentoId === requisito.treinamentoId);

      let situacao: SituacaoCapacitacao;
      if (!ultima) situacao = 'SEM_TREINAMENTO';
      else {
        const vencimento = situacaoDaValidade(ultima.validade, hoje);
        situacao = vencimento === 'VENCIDO' ? 'VENCIDO' : vencimento === 'A_VENCER' ? 'A_VENCER' : 'OK';
      }

      linhas.push({
        colaboradorId: colaborador.id,
        colaborador: colaborador.nome,
        funcao: colaborador.funcao,
        clienteId: colaborador.clienteId,
        cliente: colaborador.cliente.nomeFantasia,
        terceiro: colaborador.terceiro?.nomeFantasia ?? null,
        treinamentoId: requisito.treinamentoId,
        treinamento: requisito.treinamento.nome,
        norma: requisito.treinamento.norma,
        dataRealizacao: ultima?.dataRealizacao ?? null,
        validade: ultima?.validade ?? null,
        diasParaVencer: ultima ? diasAteVencer(ultima.validade, hoje) : null,
        situacao,
      });
    }
  }

  const filtradas = linhas.filter((linha) => {
    if (filtro.situacao && linha.situacao !== filtro.situacao) return false;
    if (filtro.busca) {
      const busca = filtro.busca.toLowerCase();
      if (!linha.colaborador.toLowerCase().includes(busca) && !linha.treinamento.toLowerCase().includes(busca)) {
        return false;
      }
    }
    return true;
  });

  const emDia = linhas.filter((linha) => linha.situacao === 'OK' || linha.situacao === 'A_VENCER').length;

  return {
    linhas: filtradas,
    resumo: {
      totalRequisitos: linhas.length,
      emDia,
      ok: linhas.filter((linha) => linha.situacao === 'OK').length,
      aVencer: linhas.filter((linha) => linha.situacao === 'A_VENCER').length,
      vencidos: linhas.filter((linha) => linha.situacao === 'VENCIDO').length,
      semTreinamento: linhas.filter((linha) => linha.situacao === 'SEM_TREINAMENTO').length,
      /** % de requisitos em dia — a nota do pilar TREINAMENTOS. */
      percentualEmDia: linhas.length > 0 ? percentual(emDia, linhas.length) : null,
      colaboradoresCobertos: new Set(linhas.map((linha) => linha.colaboradorId)).size,
    },
  };
}

/**
 * Nota do pilar TREINAMENTOS (0-100) para os indices compostos.
 * `null` quando nao ha nenhum requisito cadastrado — o motor renormaliza.
 */
export async function notaDeTreinamentos(filtro: { clienteId?: string } = {}): Promise<number | null> {
  const { resumo } = await matrizDeCapacitacao(filtro);
  return resumo.percentualEmDia;
}

/** Registros de um colaborador, do mais recente ao mais antigo. */
export async function realizacoesDoColaborador(colaboradorId: string) {
  return prisma.treinamentoRealizado.findMany({
    where: { colaboradorId },
    orderBy: { dataRealizacao: 'desc' },
    include: { treinamento: { select: { id: true, nome: true, norma: true } } },
  });
}
