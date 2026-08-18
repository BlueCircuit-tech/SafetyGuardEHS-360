import type { Prisma } from '@prisma/client';
import {
  ROTULO_HIERARQUIA,
  arredondar,
  calcularEscalonamento,
  calcularIndiceGlobalSsma,
  calcularScoreMaturidade,
  classificarDesempenho,
  percentual,
  type IndicadoresFiltro,
  type PilarIndiceGlobal,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { obterEmpresaOuFalhar } from '../empresa/empresa.service.js';
import { painelBbs } from '../observacoes/indicadores.service.js';
import { resumoPlanos } from '../planos/plano.service.js';
import { painelConformidade } from '../saude/conformidade.service.js';

/**
 * Etapa 10 — dashboards executivo, gerencial e operacional.
 *
 * Nao ha formula nova aqui: as tres visoes **compoem** o que as etapas
 * anteriores ja calculam (BBS, planos, conformidade) e mudam o recorte —
 * a diretoria quer a nota, o gerente quer a causa, o campo quer a fila.
 */

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const MS_POR_HORA = 60 * 60 * 1000;

export interface FiltroDashboard {
  clienteId?: string;
  centroNegocioId?: string;
  meses?: number;
}

function filtroDeIndicadores(filtro: FiltroDashboard): IndicadoresFiltro {
  return {
    clienteId: filtro.clienteId,
    centroNegocioId: filtro.centroNegocioId,
    meses: filtro.meses ?? 12,
    topCausas: 8,
  } as IndicadoresFiltro;
}

/* -------------------------------------------------------------------------- */
/* Pilares do Indice Global                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Nota do pilar **Seguranca** a partir da piramide de Bird.
 *
 * `100 - (% de registros que viraram acidente com lesao)`. E um **proxy**: a
 * medida classica seria a Taxa de Frequencia (TF), que exige homem-hora
 * trabalhada — dado que a plataforma ainda nao coleta. Fica declarado aqui,
 * e nao escondido dentro do numero.
 */
async function notaDeSeguranca(where: Prisma.ObservacaoWhereInput): Promise<{
  nota: number | null;
  acidentes: number;
  quaseAcidentes: number;
  registros: number;
}> {
  const [registros, acidentes, quaseAcidentes] = await prisma.$transaction([
    prisma.observacao.count({ where }),
    prisma.observacao.count({
      where: { ...where, classificacaoBird: { in: ['A_MAJOR', 'B_SERIOUS', 'C_MINOR', 'F_FIRST_AID'] } },
    }),
    prisma.observacao.count({
      where: { ...where, classificacaoBird: { in: ['D_MAJOR_NEAR_MISS', 'E_NEAR_MISS'] } },
    }),
  ]);

  return {
    nota: registros > 0 ? arredondar(100 - percentual(acidentes, registros)) : null,
    acidentes,
    quaseAcidentes,
    registros,
  };
}

/**
 * Nota do pilar **Gestao de Riscos**: percentual de areas com inspecao em dia.
 *
 * Cada area declara a sua frequencia minima de inspecao no cadastro (Etapa 5).
 * A nota compara a ultima observacao registrada com esse prazo — e o proprio
 * cadastro cobrando a rotina que ele mesmo definiu.
 */
async function notaDeGestaoDeRiscos(filtro: FiltroDashboard, empresaId: string) {
  const where: Prisma.AreaWhereInput = {
    situacao: 'ATIVA',
    cliente: {
      empresaId,
      ...(filtro.clienteId ? { id: filtro.clienteId } : {}),
      ...(filtro.centroNegocioId ? { centroNegocioId: filtro.centroNegocioId } : {}),
    },
  };

  const areas = await prisma.area.findMany({
    where,
    select: {
      id: true,
      nome: true,
      codigo: true,
      criticidade: true,
      frequenciaInspecaoDias: true,
      cliente: { select: { nomeFantasia: true } },
      observacoesDeCampo: { orderBy: { dataHora: 'desc' }, take: 1, select: { dataHora: true } },
    },
  });

  const agora = Date.now();

  const linhas = areas.map((area) => {
    const [ultima] = area.observacoesDeCampo;
    const diasSemInspecao = ultima ? Math.floor((agora - ultima.dataHora.getTime()) / MS_POR_DIA) : null;

    return {
      areaId: area.id,
      area: area.nome,
      codigo: area.codigo,
      cliente: area.cliente.nomeFantasia,
      criticidade: area.criticidade,
      frequenciaInspecaoDias: area.frequenciaInspecaoDias,
      ultimaInspecao: ultima?.dataHora ?? null,
      diasSemInspecao,
      /** Nunca inspecionada tambem esta fora do prazo — e o caso mais grave. */
      emDia: diasSemInspecao !== null && diasSemInspecao <= area.frequenciaInspecaoDias,
    };
  });

  const emDia = linhas.filter((linha) => linha.emDia).length;

  return {
    nota: linhas.length > 0 ? percentual(emDia, linhas.length) : null,
    totalAreas: linhas.length,
    emDia,
    atrasadas: linhas.filter((linha) => !linha.emDia).length,
    nuncaInspecionadas: linhas.filter((linha) => linha.diasSemInspecao === null).length,
    linhas,
  };
}

/** Motivo pelo qual um pilar ficou sem nota — o painel mostra, nao esconde. */
const MOTIVO_SEM_FONTE: Partial<Record<PilarIndiceGlobal, string>> = {
  AUDITORIAS: 'Modulo de auditorias ainda nao implementado.',
  MEIO_AMBIENTE: 'Indicadores ambientais ainda nao coletados.',
  TREINAMENTOS: 'Matriz de capacitacao ainda nao implementada (Etapa futura).',
};

/* -------------------------------------------------------------------------- */
/* Painel executivo                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Visao da diretoria: uma nota, a tendencia e o ranking.
 *
 * O que a diretoria pergunta e "estamos melhorando e onde esta o pior
 * contrato?". Detalhe de causa fica no painel gerencial.
 */
export async function painelExecutivo(filtro: FiltroDashboard = {}) {
  const empresa = await obterEmpresaOuFalhar();

  const [bbs, planos, conformidade, riscos] = await Promise.all([
    painelBbs(filtroDeIndicadores(filtro)),
    resumoPlanos({ clienteId: filtro.clienteId, centroNegocioId: filtro.centroNegocioId }),
    painelConformidade({ clienteId: filtro.clienteId }),
    notaDeGestaoDeRiscos(filtro, empresa.id),
  ]);

  const ondeObservacao: Prisma.ObservacaoWhereInput = {
    cliente: {
      empresaId: empresa.id,
      ...(filtro.centroNegocioId ? { centroNegocioId: filtro.centroNegocioId } : {}),
    },
    ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
  };

  const seguranca = await notaDeSeguranca(ondeObservacao);

  const notas: Partial<Record<PilarIndiceGlobal, number | null>> = {
    SEGURANCA: seguranca.nota,
    CULTURA_SEGURANCA: bbs.icsg.pesoConsiderado > 0 ? bbs.icsg.valor : null,
    GESTAO_RISCOS: riscos.nota,
    PLANO_ACAO: planos.percentualConcluido,
  };

  const indiceGlobal = calcularIndiceGlobalSsma(notas);

  // Maturidade reaproveita as mesmas notas onde os pilares coincidem.
  const maturidade = calcularScoreMaturidade({
    CULTURA_SEGURANCA: notas.CULTURA_SEGURANCA,
    BBS: bbs.bbs.totalBbs > 0 ? bbs.bbs.ics : null,
    PLANO_ACAO: planos.percentualConcluido,
  });

  const [clientesAtivos, colaboradores, terceirosAtivos, areasAtivas] = await prisma.$transaction([
    prisma.cliente.count({ where: { empresaId: empresa.id, situacao: 'ATIVO' } }),
    prisma.colaborador.count({ where: { situacao: 'ATIVO' } }),
    prisma.terceiro.count({ where: { situacao: 'ATIVO' } }),
    prisma.area.count({ where: { situacao: 'ATIVA' } }),
  ]);

  return {
    geradoEm: new Date(),
    filtro,
    indiceGlobal,
    /** Por que o indice nao usa 100% dos pesos — transparencia do calculo. */
    cobertura: {
      pesoConsiderado: indiceGlobal.pesoConsiderado,
      pilaresSemDados: indiceGlobal.pilaresSemDados.map((pilar) => ({
        pilar,
        motivo: MOTIVO_SEM_FONTE[pilar as PilarIndiceGlobal] ?? 'Sem registros no periodo.',
      })),
    },
    maturidade,
    seguranca: {
      ...seguranca,
      observacao: 'Proxy pela piramide de Bird. A Taxa de Frequencia exige homem-hora trabalhada.',
    },
    cultura: { ics: bbs.bbs.ics, ici: bbs.bbs.ici, icsg: bbs.icsg.valor, totalBbs: bbs.bbs.totalBbs },
    riscos: {
      nota: riscos.nota,
      totalAreas: riscos.totalAreas,
      emDia: riscos.emDia,
      atrasadas: riscos.atrasadas,
      nuncaInspecionadas: riscos.nuncaInspecionadas,
    },
    planos,
    conformidade: {
      icl: conformidade.icl.valor,
      classificacao: conformidade.icl.classificacao,
      impedidos: conformidade.saude.impedidos,
      documentosVencidos: conformidade.documentos.vencidos,
      renovacoesPendentes: conformidade.renovacao.total,
    },
    tendencia: bbs.tendencia,
    piramideBird: bbs.piramideBird,
    carteira: { clientesAtivos, colaboradores, terceirosAtivos, areasAtivas },
    ranking: await rankingPorCliente(empresa.id, filtro),
    centros: await comparativoPorCentro(empresa.id),
  };
}

/**
 * Ranking de contratos.
 *
 * Cada cliente recebe a mesma composicao do indice global, calculada sobre os
 * seus proprios numeros — e o que permite dizer "o contrato X esta pior".
 */
async function rankingPorCliente(empresaId: string, filtro: FiltroDashboard) {
  const clientes = await prisma.cliente.findMany({
    where: {
      empresaId,
      situacao: 'ATIVO',
      ...(filtro.centroNegocioId ? { centroNegocioId: filtro.centroNegocioId } : {}),
      ...(filtro.clienteId ? { id: filtro.clienteId } : {}),
    },
    orderBy: { nomeFantasia: 'asc' },
    take: 50,
    select: { id: true, nomeFantasia: true, centroNegocio: { select: { nome: true } } },
  });

  const linhas = await Promise.all(
    clientes.map(async (cliente) => {
      const [bbs, planos, seguranca, riscos] = await Promise.all([
        painelBbs(filtroDeIndicadores({ clienteId: cliente.id, meses: filtro.meses })),
        resumoPlanos({ clienteId: cliente.id }),
        notaDeSeguranca({ clienteId: cliente.id }),
        notaDeGestaoDeRiscos({ clienteId: cliente.id }, empresaId),
      ]);

      const indice = calcularIndiceGlobalSsma({
        SEGURANCA: seguranca.nota,
        CULTURA_SEGURANCA: bbs.icsg.pesoConsiderado > 0 ? bbs.icsg.valor : null,
        GESTAO_RISCOS: riscos.nota,
        PLANO_ACAO: planos.percentualConcluido,
      });

      return {
        clienteId: cliente.id,
        cliente: cliente.nomeFantasia,
        centroNegocio: cliente.centroNegocio?.nome ?? null,
        indiceGlobal: indice.valor,
        classificacao: indice.classificacao,
        ics: bbs.bbs.ics,
        ici: bbs.bbs.ici,
        observacoes: bbs.bbs.totalRegistros,
        planosAtrasados: planos.atrasados,
        aderenciaAoPrazo: planos.aderenciaAoPrazo,
        areasAtrasadas: riscos.atrasadas,
        acidentes: seguranca.acidentes,
      };
    }),
  );

  return linhas.sort((a, b) => b.indiceGlobal - a.indiceGlobal);
}

/** Comparativo entre centros de negocio, com a meta cadastrada na Etapa 4. */
async function comparativoPorCentro(empresaId: string) {
  const centros = await prisma.centroNegocio.findMany({
    where: { empresaId, situacao: 'ATIVO' },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, codigo: true, corDestaque: true, metaIndiceGlobal: true },
  });

  return Promise.all(
    centros.map(async (centro) => {
      const [bbs, planos, seguranca, riscos] = await Promise.all([
        painelBbs(filtroDeIndicadores({ centroNegocioId: centro.id })),
        resumoPlanos({ centroNegocioId: centro.id }),
        notaDeSeguranca({ cliente: { centroNegocioId: centro.id } }),
        notaDeGestaoDeRiscos({ centroNegocioId: centro.id }, empresaId),
      ]);

      const indice = calcularIndiceGlobalSsma({
        SEGURANCA: seguranca.nota,
        CULTURA_SEGURANCA: bbs.icsg.pesoConsiderado > 0 ? bbs.icsg.valor : null,
        GESTAO_RISCOS: riscos.nota,
        PLANO_ACAO: planos.percentualConcluido,
      });

      const meta = Number(centro.metaIndiceGlobal);

      return {
        centroId: centro.id,
        centro: centro.nome,
        codigo: centro.codigo,
        cor: centro.corDestaque,
        indiceGlobal: indice.valor,
        classificacao: indice.classificacao,
        meta,
        /** Distancia para a meta cadastrada — negativo = abaixo. */
        desvioDaMeta: arredondar(indice.valor - meta),
        atingiuMeta: indice.valor >= meta,
      };
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Painel gerencial                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Visao do gerente: onde esta o problema.
 *
 * Mesma base do executivo, recortada por causa, area e responsavel — Pareto,
 * mapa de calor, carteira de planos e desempenho dos terceiros.
 */
export async function painelGerencial(filtro: FiltroDashboard = {}) {
  const empresa = await obterEmpresaOuFalhar();

  const [bbs, planos, conformidade, riscos] = await Promise.all([
    painelBbs(filtroDeIndicadores(filtro)),
    resumoPlanos({ clienteId: filtro.clienteId, centroNegocioId: filtro.centroNegocioId }),
    painelConformidade({ clienteId: filtro.clienteId }),
    notaDeGestaoDeRiscos(filtro, empresa.id),
  ]);

  const ondeTerceiro: Prisma.TerceiroWhereInput = {
    situacao: 'ATIVO',
    cliente: {
      empresaId: empresa.id,
      ...(filtro.centroNegocioId ? { centroNegocioId: filtro.centroNegocioId } : {}),
    },
    ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
  };

  const terceiros = await prisma.terceiro.findMany({
    where: ondeTerceiro,
    orderBy: { nomeFantasia: 'asc' },
    take: 50,
    select: {
      id: true,
      nomeFantasia: true,
      cliente: { select: { nomeFantasia: true } },
      _count: { select: { observacoesDeCampo: true, planosDeAcao: true, colaboradores: true } },
    },
  });

  // Nota do terceiro: quanto do que ele gerou ja foi tratado. E a leitura que
  // o ranking de contratadas do plano diretor pede.
  const desempenhoTerceiros = await Promise.all(
    terceiros.map(async (terceiro) => {
      const [desvios, planosDoTerceiro] = await Promise.all([
        prisma.observacao.count({
          where: { terceiroId: terceiro.id, tipo: { in: ['COMPORTAMENTO_INSEGURO', 'CONDICAO_INSEGURA'] } },
        }),
        resumoPlanos({ terceiroId: terceiro.id }),
      ]);

      const nota = planosDoTerceiro.total > 0 ? planosDoTerceiro.percentualConcluido : null;

      return {
        terceiroId: terceiro.id,
        terceiro: terceiro.nomeFantasia,
        cliente: terceiro.cliente.nomeFantasia,
        colaboradores: terceiro._count.colaboradores,
        observacoes: terceiro._count.observacoesDeCampo,
        desvios,
        planos: planosDoTerceiro.total,
        planosAtrasados: planosDoTerceiro.atrasados,
        nota,
        classificacao: nota === null ? null : classificarDesempenho(nota),
      };
    }),
  );

  return {
    geradoEm: new Date(),
    filtro,
    icsg: bbs.icsg,
    bbs: bbs.bbs,
    pareto: bbs.pareto,
    mapaCalor: bbs.mapaCalor,
    tendencia: bbs.tendencia,
    piramideBird: bbs.piramideBird,
    planos,
    inspecoes: riscos,
    conformidade: {
      icl: conformidade.icl,
      saude: conformidade.saude,
      documentos: conformidade.documentos,
    },
    terceiros: desempenhoTerceiros.sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1)),
  };
}

/* -------------------------------------------------------------------------- */
/* Painel operacional                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Visao do campo: a fila de hoje.
 *
 * Nada de indice — so o que precisa de acao, na ordem em que aperta.
 */
export async function painelOperacional(filtro: FiltroDashboard = {}) {
  const empresa = await obterEmpresaOuFalhar();
  const agora = new Date();

  const escopoCliente = {
    empresaId: empresa.id,
    ...(filtro.centroNegocioId ? { centroNegocioId: filtro.centroNegocioId } : {}),
    ...(filtro.clienteId ? { id: filtro.clienteId } : {}),
  };

  const ondePlano: Prisma.PlanoAcaoWhereInput = {
    status: { in: ['ABERTO', 'EM_ANDAMENTO'] },
    cliente: escopoCliente,
  };

  const emSeteDias = new Date(agora.getTime() + 7 * MS_POR_DIA);

  const [planosAbertos, observacoesSemTratativa, riscos, conformidade] = await Promise.all([
    prisma.planoAcao.findMany({
      where: ondePlano,
      orderBy: { prazo: 'asc' },
      take: 100,
      select: {
        id: true,
        codigo: true,
        acao: true,
        criticidade: true,
        status: true,
        prazo: true,
        criadoEm: true,
        nivelEscalonamento: true,
        responsavelNome: true,
        cliente: { select: { nomeFantasia: true } },
        area: { select: { nome: true, codigo: true } },
      },
    }),
    prisma.observacao.findMany({
      where: {
        situacao: 'REGISTRADA',
        tipo: { in: ['COMPORTAMENTO_INSEGURO', 'CONDICAO_INSEGURA', 'NAO_CONFORMIDADE'] },
        cliente: escopoCliente,
      },
      orderBy: { dataHora: 'desc' },
      take: 50,
      select: {
        id: true,
        descricao: true,
        tipo: true,
        grauRisco: true,
        dataHora: true,
        prazoLimite: true,
        observador: true,
        cliente: { select: { nomeFantasia: true } },
        area: { select: { nome: true, codigo: true } },
      },
    }),
    notaDeGestaoDeRiscos(filtro, empresa.id),
    painelConformidade({ clienteId: filtro.clienteId, janelaDias: 30 }),
  ]);

  const planos = planosAbertos.map((plano) => {
    const horasDesdeORegistro = (agora.getTime() - plano.criadoEm.getTime()) / MS_POR_HORA;
    const prazoHoras = Math.max(0, (plano.prazo.getTime() - plano.criadoEm.getTime()) / MS_POR_HORA);
    const situacao = calcularEscalonamento(horasDesdeORegistro, prazoHoras);

    return {
      ...plano,
      diasParaPrazo: Math.ceil((plano.prazo.getTime() - agora.getTime()) / MS_POR_DIA),
      atrasado: plano.prazo < agora,
      venceEmBreve: plano.prazo >= agora && plano.prazo <= emSeteDias,
      nivelDevido: situacao ? situacao.rotuloNivel : ROTULO_HIERARQUIA.SUPERVISOR,
      escalonamentoPendente: Boolean(situacao && situacao.degrau > plano.nivelEscalonamento),
    };
  });

  const areasAtrasadas = riscos.linhas
    .filter((linha) => !linha.emDia)
    .sort((a, b) => (b.diasSemInspecao ?? Number.MAX_SAFE_INTEGER) - (a.diasSemInspecao ?? Number.MAX_SAFE_INTEGER));

  return {
    geradoEm: agora,
    filtro,
    fila: {
      planosAtrasados: planos.filter((plano) => plano.atrasado).length,
      planosVencendo: planos.filter((plano) => plano.venceEmBreve).length,
      escalonamentosPendentes: planos.filter((plano) => plano.escalonamentoPendente).length,
      observacoesSemTratativa: observacoesSemTratativa.length,
      areasSemInspecao: areasAtrasadas.length,
      colaboradoresImpedidos: conformidade.saude.impedidos,
      renovacoesEm30Dias: conformidade.renovacao.total,
    },
    planos,
    observacoes: observacoesSemTratativa,
    areasAtrasadas: areasAtrasadas.slice(0, 30),
    renovacoes: conformidade.renovacao.itens.slice(0, 30),
    impedidos: conformidade.saude.pendencias.slice(0, 30),
  };
}
