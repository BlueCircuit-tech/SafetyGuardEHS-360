import type { PlanoAcao, Prisma } from '@prisma/client';
import {
  ESCALONAMENTO,
  PRAZO_PADRAO_POR_CRITICIDADE,
  ROTULO_HIERARQUIA,
  calcularEscalonamento,
  criticidadePeloGrau,
  definicaoDoTipo,
  estaEmAberto,
  type CriticidadePlano,
  type PlanoAcaoCreateData,
  type PlanoAcaoFiltro,
  type TipoObservacao,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { Conflito, NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria, type ContextoAuditoria } from '../../lib/auditoria.js';
import { obterEmpresaOuFalhar } from '../empresa/empresa.service.js';
import { comunicacaoDaObservacao } from '../observacoes/observacao.service.js';
import { registrarNotificacoes } from './notificacao.service.js';

const ENTIDADE = 'PlanoAcao';
const MS_POR_HORA = 60 * 60 * 1000;

export const COM_RELACOES = {
  observacao: {
    select: {
      id: true,
      tipo: true,
      descricao: true,
      dataHora: true,
      iir: true,
      grauRisco: true,
      classificacaoBird: true,
      causa: { select: { descricao: true } },
    },
  },
  cliente: {
    select: {
      id: true,
      nomeFantasia: true,
      numeroContrato: true,
      centroNegocio: { select: { id: true, nome: true, codigo: true } },
    },
  },
  area: { select: { id: true, nome: true, codigo: true, setor: true } },
  terceiro: { select: { id: true, nomeFantasia: true } },
} satisfies Prisma.PlanoAcaoInclude;

/* -------------------------------------------------------------------------- */
/* Codigo sequencial                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Gera o proximo codigo legivel (PA-0001).
 *
 * Roda dentro da transacao de criacao; em caso de corrida, o indice unico do
 * banco rejeita e a operacao e repetida pelo chamador.
 */
async function proximoCodigo(tx: Prisma.TransactionClient): Promise<string> {
  const ultimo = await tx.planoAcao.findFirst({
    orderBy: { codigo: 'desc' },
    select: { codigo: true },
  });

  const numero = ultimo ? Number(ultimo.codigo.replace(/\D/g, '')) + 1 : 1;
  return `PA-${String(numero).padStart(4, '0')}`;
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                     */
/* -------------------------------------------------------------------------- */

function montarWhere(empresaId: string, filtro: Partial<PlanoAcaoFiltro>): Prisma.PlanoAcaoWhereInput {
  const cliente: Prisma.ClienteWhereInput = { empresaId };
  if (filtro.centroNegocioId) cliente.centroNegocioId = filtro.centroNegocioId;

  const where: Prisma.PlanoAcaoWhereInput = { cliente };

  if (filtro.clienteId) where.clienteId = filtro.clienteId;
  if (filtro.areaId) where.areaId = filtro.areaId;
  if (filtro.terceiroId) where.terceiroId = filtro.terceiroId;
  if (filtro.criticidade) where.criticidade = filtro.criticidade;
  if (filtro.status) where.status = filtro.status;
  if (filtro.origem) where.origem = filtro.origem;

  if (filtro.atrasados === 'true') {
    where.status = { in: ['ABERTO', 'EM_ANDAMENTO'] };
    where.prazo = { lt: new Date() };
  }

  const busca = filtro.busca?.trim();
  if (busca) {
    where.OR = [
      { codigo: { contains: busca, mode: 'insensitive' } },
      { acao: { contains: busca, mode: 'insensitive' } },
      { responsavelNome: { contains: busca, mode: 'insensitive' } },
      { descricao: { contains: busca, mode: 'insensitive' } },
    ];
  }

  return where;
}

export async function listarPlanos(filtro: PlanoAcaoFiltro) {
  const empresa = await obterEmpresaOuFalhar();
  const where = montarWhere(empresa.id, filtro);

  const [total, itens] = await prisma.$transaction([
    prisma.planoAcao.count({ where }),
    prisma.planoAcao.findMany({
      where,
      orderBy: [{ [filtro.ordenarPor]: filtro.direcao }, { criadoEm: 'desc' }],
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

export async function obterPlanoOuFalhar(id: string): Promise<PlanoAcao> {
  const plano = await prisma.planoAcao.findUnique({ where: { id }, include: COM_RELACOES });
  if (!plano) throw new NaoEncontrado('Plano de acao nao encontrado.', 'PLANO_NAO_ENCONTRADO');
  return plano;
}

/**
 * KPIs do painel: abertos, em andamento, concluidos, atrasados e o tempo medio
 * de fechamento — indicador que o plano diretor pede explicitamente.
 */
export async function resumoPlanos(filtro: Partial<PlanoAcaoFiltro> = {}) {
  const empresa = await obterEmpresaOuFalhar();
  const base = montarWhere(empresa.id, { ...filtro, atrasados: undefined, status: undefined });
  const agora = new Date();

  const [total, abertos, emAndamento, concluidos, cancelados, atrasados, escalonados, concluidosComDatas] =
    await prisma.$transaction([
      prisma.planoAcao.count({ where: base }),
      prisma.planoAcao.count({ where: { ...base, status: 'ABERTO' } }),
      prisma.planoAcao.count({ where: { ...base, status: 'EM_ANDAMENTO' } }),
      prisma.planoAcao.count({ where: { ...base, status: 'CONCLUIDO' } }),
      prisma.planoAcao.count({ where: { ...base, status: 'CANCELADO' } }),
      prisma.planoAcao.count({
        where: { ...base, status: { in: ['ABERTO', 'EM_ANDAMENTO'] }, prazo: { lt: agora } },
      }),
      prisma.planoAcao.count({ where: { ...base, nivelEscalonamento: { gt: 0 } } }),
      prisma.planoAcao.findMany({
        where: { ...base, status: 'CONCLUIDO', dataConclusao: { not: null } },
        select: { criadoEm: true, dataConclusao: true, prazo: true },
      }),
    ]);

  const tempos = concluidosComDatas.map(
    (plano) => (plano.dataConclusao!.getTime() - plano.criadoEm.getTime()) / (24 * MS_POR_HORA),
  );
  const tempoMedioFechamentoDias =
    tempos.length > 0 ? Math.round((tempos.reduce((soma, dias) => soma + dias, 0) / tempos.length) * 10) / 10 : null;

  const noPrazo = concluidosComDatas.filter((plano) => plano.dataConclusao! <= plano.prazo).length;
  const aderenciaAoPrazo =
    concluidosComDatas.length > 0 ? Math.round((noPrazo / concluidosComDatas.length) * 1000) / 10 : null;

  const emAberto = abertos + emAndamento;

  return {
    total,
    abertos,
    emAndamento,
    concluidos,
    cancelados,
    atrasados,
    escalonados,
    tempoMedioFechamentoDias,
    /** % dos concluidos que fecharam dentro do prazo. */
    aderenciaAoPrazo,
    /** % de conclusao sobre o que ja foi aberto (exclui cancelados). */
    percentualConcluido:
      concluidos + emAberto > 0 ? Math.round((concluidos / (concluidos + emAberto)) * 1000) / 10 : null,
  };
}

/** Distribuicao por criticidade — a "matriz de criticidade" do painel gerencial. */
export async function planosPorCriticidade(filtro: Partial<PlanoAcaoFiltro> = {}) {
  const empresa = await obterEmpresaOuFalhar();
  const base = montarWhere(empresa.id, { ...filtro, atrasados: undefined, status: undefined });
  const agora = new Date();

  const criticidades: CriticidadePlano[] = ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'];

  return Promise.all(
    criticidades.map(async (criticidade) => {
      const where = { ...base, criticidade };
      const [total, emAberto, atrasados, concluidos] = await prisma.$transaction([
        prisma.planoAcao.count({ where }),
        prisma.planoAcao.count({ where: { ...where, status: { in: ['ABERTO', 'EM_ANDAMENTO'] } } }),
        prisma.planoAcao.count({
          where: { ...where, status: { in: ['ABERTO', 'EM_ANDAMENTO'] }, prazo: { lt: agora } },
        }),
        prisma.planoAcao.count({ where: { ...where, status: 'CONCLUIDO' } }),
      ]);

      return {
        criticidade,
        total,
        emAberto,
        atrasados,
        concluidos,
        prazoPadraoHoras: PRAZO_PADRAO_POR_CRITICIDADE[criticidade],
      };
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                     */
/* -------------------------------------------------------------------------- */

interface DadosCriacao extends PlanoAcaoCreateData {
  clienteId: string;
}

async function criarComNotificacao(
  dados: DadosCriacao,
  contexto: ContextoAuditoria,
  notificar?: (tx: Prisma.TransactionClient, plano: PlanoAcao) => Promise<void>,
): Promise<PlanoAcao> {
  return prisma.$transaction(async (tx) => {
    const codigo = await proximoCodigo(tx);
    const plano = await tx.planoAcao.create({
      data: { ...dados, codigo } as Prisma.PlanoAcaoUncheckedCreateInput,
      include: COM_RELACOES,
    });

    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: plano.id,
      acao: 'CRIACAO',
      alteracoes: calcularDiferenca({}, plano as unknown as Record<string, unknown>),
      contexto,
    });

    if (notificar) await notificar(tx, plano);

    return plano;
  });
}

export async function criarPlano(dados: PlanoAcaoCreateData, contexto: ContextoAuditoria = {}): Promise<PlanoAcao> {
  // O cliente vem da observacao ou da area — nunca do payload.
  let clienteId: string | null = null;

  if (dados.observacaoId) {
    const observacao = await prisma.observacao.findUnique({
      where: { id: dados.observacaoId },
      select: { clienteId: true, areaId: true },
    });
    if (!observacao) throw new NaoEncontrado('Observacao nao encontrada.', 'OBSERVACAO_NAO_ENCONTRADA');
    clienteId = observacao.clienteId;
    dados.areaId = dados.areaId ?? observacao.areaId;
  } else if (dados.areaId) {
    const area = await prisma.area.findUnique({ where: { id: dados.areaId }, select: { clienteId: true } });
    if (!area) throw new NaoEncontrado('Area nao encontrada.', 'AREA_NAO_ENCONTRADA');
    clienteId = area.clienteId;
  }

  if (!clienteId) {
    throw new RequisicaoInvalida(
      'Informe a observacao de origem ou a area do plano.',
      'CLIENTE_NAO_RESOLVIDO',
      { campos: { areaId: ['Sem observacao de origem, a area e obrigatoria.'] } },
    );
  }

  return criarComNotificacao({ ...dados, clienteId }, contexto);
}

/**
 * Abre o plano automaticamente a partir de uma observacao.
 *
 * Chamado quando o tipo da observacao exige tratativa. O prazo e a criticidade
 * vêm da matriz de comunicacao — a mesma que decide quem e avisado —, e a
 * notificacao inicial e registrada na mesma transacao.
 */
export async function abrirPlanoDaObservacao(
  observacaoId: string,
  contexto: ContextoAuditoria = {},
): Promise<PlanoAcao> {
  const observacao = await prisma.observacao.findUnique({
    where: { id: observacaoId },
    include: {
      area: { select: { id: true, nome: true, codigo: true, pontoReferencia: true } },
      cliente: { select: { id: true, nomeFantasia: true } },
      terceiro: { select: { id: true, nomeFantasia: true } },
      causa: { select: { descricao: true } },
    },
  });

  if (!observacao) throw new NaoEncontrado('Observacao nao encontrada.', 'OBSERVACAO_NAO_ENCONTRADA');

  const definicao = definicaoDoTipo(observacao.tipo as TipoObservacao);
  if (!definicao.abrePlanoDeAcao) {
    throw new Conflito(
      `${definicao.rotulo} nao abre plano de acao.`,
      'TIPO_NAO_ABRE_PLANO',
    );
  }

  const jaExiste = await prisma.planoAcao.findFirst({
    where: { observacaoId, status: { in: ['ABERTO', 'EM_ANDAMENTO'] } },
    select: { id: true, codigo: true },
  });
  if (jaExiste) {
    throw new Conflito(`Esta observacao ja tem o plano ${jaExiste.codigo} em aberto.`, 'PLANO_JA_ABERTO', {
      detalhes: { planoId: jaExiste.id, codigo: jaExiste.codigo },
    });
  }

  const regra = comunicacaoDaObservacao({
    tipo: observacao.tipo as TipoObservacao,
    classificacaoBird: observacao.classificacaoBird,
    grauRisco: observacao.grauRisco,
    causa: observacao.causa,
  });

  const criticidade = criticidadePeloGrau(observacao.grauRisco);
  const horas = regra?.prazoHoras ?? PRAZO_PADRAO_POR_CRITICIDADE[criticidade];
  const prazo = observacao.prazoLimite ?? new Date(observacao.dataHora.getTime() + horas * MS_POR_HORA);

  const dados = {
    origem: 'OBSERVACAO' as const,
    observacaoId,
    clienteId: observacao.clienteId,
    areaId: observacao.areaId,
    terceiroId: observacao.terceiroId,
    acao: regra?.acao ?? 'Tratar o desvio registrado',
    descricao: observacao.descricao,
    responsavelNome: observacao.observador,
    responsavelCargo: null,
    responsavelEmail: null,
    criticidade,
    prazo,
    status: 'ABERTO' as const,
    dataConclusao: null,
    evidenciaUrl: null,
    comentarioConclusao: null,
    observacoes: null,
  };

  return criarComNotificacao(dados as unknown as DadosCriacao, contexto, async (tx, plano) => {
    if (!regra) return;

    await registrarNotificacoes(tx, {
      clienteId: observacao.clienteId,
      planoAcaoId: plano.id,
      observacaoId,
      cliente: observacao.cliente.nomeFantasia,
      terceiro: observacao.terceiro?.nomeFantasia,
      area: observacao.area.nome,
      local: observacao.area.pontoReferencia,
      classificacao: definicao.rotulo,
      grauRisco: observacao.grauRisco ?? '—',
      tipo: observacao.causa?.descricao ?? definicao.rotulo,
      descricao: observacao.descricao,
      responsavel: observacao.observador,
      dataHora: observacao.dataHora,
      regra,
      prazoLimite: prazo,
      codigoPlano: plano.codigo,
    });
  });
}

export async function atualizarPlano(
  id: string,
  dados: Partial<PlanoAcaoCreateData>,
  contexto: ContextoAuditoria = {},
): Promise<PlanoAcao> {
  const atual = await obterPlanoOuFalhar(id);

  // Conclusao sem data explicita carimba o momento atual.
  const concluindo = dados.status === 'CONCLUIDO' && atual.status !== 'CONCLUIDO';
  const data: Prisma.PlanoAcaoUncheckedUpdateInput = {
    ...dados,
    ...(concluindo && !dados.dataConclusao ? { dataConclusao: new Date() } : {}),
  };

  return prisma.$transaction(async (tx) => {
    const plano = await tx.planoAcao.update({ where: { id }, data, include: COM_RELACOES });

    const diferenca = calcularDiferenca(
      atual as unknown as Record<string, unknown>,
      plano as unknown as Record<string, unknown>,
    );

    if (Object.keys(diferenca).length > 0) {
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: plano.id,
        acao: 'ATUALIZACAO',
        alteracoes: diferenca,
        contexto,
      });
    }

    return plano;
  });
}

export async function excluirPlano(id: string, contexto: ContextoAuditoria = {}): Promise<void> {
  const plano = await obterPlanoOuFalhar(id);

  await prisma.$transaction(async (tx) => {
    await tx.planoAcao.delete({ where: { id } });
    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'EXCLUSAO',
      alteracoes: { codigo: { de: plano.codigo, para: null }, acao: { de: plano.acao, para: null } },
      contexto,
    });
  });
}

export async function definirEvidencia(
  id: string,
  evidenciaUrl: string | null,
  contexto: ContextoAuditoria = {},
): Promise<PlanoAcao> {
  return atualizarPlano(id, { evidenciaUrl }, contexto);
}

/* -------------------------------------------------------------------------- */
/* Escalonamento automatico                                                    */
/* -------------------------------------------------------------------------- */

export interface ResultadoEscalonamento {
  avaliados: number;
  escalonados: Array<{ id: string; codigo: string; de: number; para: number; nivel: string }>;
}

/**
 * Varre os planos em aberto e sobe de nivel os que estouraram o prazo.
 *
 * Idempotente: so escalona quando o degrau calculado e maior que o ja
 * registrado, entao rodar duas vezes nao duplica notificacao. Pensado para ser
 * chamado por um agendador; hoje e acionado sob demanda pelo endpoint.
 */
export async function processarEscalonamentos(contexto: ContextoAuditoria = {}): Promise<ResultadoEscalonamento> {
  const empresa = await obterEmpresaOuFalhar();
  const agora = new Date();

  const vencidos = await prisma.planoAcao.findMany({
    where: {
      cliente: { empresaId: empresa.id },
      status: { in: ['ABERTO', 'EM_ANDAMENTO'] },
      prazo: { lt: agora },
    },
    include: {
      cliente: { select: { id: true, nomeFantasia: true } },
      area: { select: { nome: true, pontoReferencia: true } },
      terceiro: { select: { nomeFantasia: true } },
      observacao: {
        select: { tipo: true, grauRisco: true, classificacaoBird: true, causa: { select: { descricao: true } } },
      },
    },
  });

  const escalonados: ResultadoEscalonamento['escalonados'] = [];

  for (const plano of vencidos) {
    const horasDesdeORegistro = (agora.getTime() - plano.criadoEm.getTime()) / MS_POR_HORA;
    const prazoHoras = (plano.prazo.getTime() - plano.criadoEm.getTime()) / MS_POR_HORA;
    const situacao = calcularEscalonamento(horasDesdeORegistro, Math.max(0, prazoHoras));

    if (situacao.degrau <= plano.nivelEscalonamento) continue;

    const degrau = ESCALONAMENTO[situacao.degrau];
    if (!degrau) continue;

    const regra = plano.observacao
      ? comunicacaoDaObservacao({
          tipo: plano.observacao.tipo as TipoObservacao,
          classificacaoBird: plano.observacao.classificacaoBird,
          grauRisco: plano.observacao.grauRisco,
          causa: plano.observacao.causa,
        })
      : null;

    await prisma.$transaction(async (tx) => {
      await tx.planoAcao.update({
        where: { id: plano.id },
        data: { nivelEscalonamento: situacao.degrau, dataUltimoEscalonamento: agora },
      });

      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: plano.id,
        acao: 'ATUALIZACAO',
        alteracoes: {
          nivelEscalonamento: { de: plano.nivelEscalonamento, para: situacao.degrau },
          escalonadoPara: { de: null, para: ROTULO_HIERARQUIA[degrau.nivel] },
        },
        contexto: { autor: contexto.autor ?? 'escalonamento-automatico', ip: contexto.ip },
      });

      if (regra) {
        await registrarNotificacoes(tx, {
          clienteId: plano.clienteId,
          planoAcaoId: plano.id,
          observacaoId: plano.observacaoId,
          cliente: plano.cliente.nomeFantasia,
          terceiro: plano.terceiro?.nomeFantasia,
          area: plano.area?.nome ?? '—',
          local: plano.area?.pontoReferencia,
          classificacao: plano.criticidade,
          grauRisco: plano.observacao?.grauRisco ?? '—',
          tipo: plano.observacao?.causa?.descricao ?? plano.acao,
          descricao: plano.descricao ?? plano.acao,
          responsavel: plano.responsavelNome,
          dataHora: plano.criadoEm,
          regra: { ...regra, destinatarios: [...new Set([...regra.destinatarios, degrau.nivel])] },
          prazoLimite: plano.prazo,
          nivelAcionado: degrau.nivel,
          nivelEscalonamento: situacao.degrau,
          codigoPlano: plano.codigo,
        });
      }
    });

    escalonados.push({
      id: plano.id,
      codigo: plano.codigo,
      de: plano.nivelEscalonamento,
      para: situacao.degrau,
      nivel: ROTULO_HIERARQUIA[degrau.nivel],
    });
  }

  return { avaliados: vencidos.length, escalonados };
}

export async function listarAuditoriaPlano(id: string, limite = 50) {
  await obterPlanoOuFalhar(id);
  return prisma.registroAuditoria.findMany({
    where: { entidade: ENTIDADE, entidadeId: id },
    orderBy: { criadoEm: 'desc' },
    take: limite,
  });
}

export { estaEmAberto };
