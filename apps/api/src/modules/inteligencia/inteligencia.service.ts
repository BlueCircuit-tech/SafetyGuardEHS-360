import { arredondar, percentual } from '@safetyguard/shared';
import { prisma } from '../../db.js';

/**
 * Etapa 17 — SafetyGuard Intelligence.
 *
 * O plano diretor pede analises automaticas ("Soldagem subiu 18%...") com uma
 * exigencia explicita: "sempre permitir rastrear quais dados originaram a
 * analise". Por isso o motor e **deterministico, por regras** — nao ha IA
 * generativa: cada achado carrega a evidencia numerica que o produziu e o
 * link da tela que detalha. O que os dados nao sustentam, nao vira frase.
 */

export type SeveridadeAchado = 'CRITICO' | 'ATENCAO' | 'INFORMATIVO' | 'POSITIVO';

export interface Achado {
  categoria:
    | 'TENDENCIA'
    | 'AREA_CRITICA'
    | 'CAUSA_DOMINANTE'
    | 'PLANO_ACAO'
    | 'REINCIDENCIA'
    | 'CAPACITACAO'
    | 'SAUDE'
    | 'EPI'
    | 'AUDITORIA'
    | 'DDS'
    | 'RANKING';
  severidade: SeveridadeAchado;
  titulo: string;
  texto: string;
  /** Os numeros que originaram a analise — a rastreabilidade do plano diretor. */
  evidencia: Record<string, string | number>;
  /** Tela que detalha o achado. */
  link: string;
}

const ORDEM_SEVERIDADE: Record<SeveridadeAchado, number> = {
  CRITICO: 0,
  ATENCAO: 1,
  INFORMATIVO: 2,
  POSITIVO: 3,
};

const DIAS_JANELA = 30;
/** Variacao minima para virar achado — abaixo disso e ruido, nao tendencia. */
const VARIACAO_MINIMA = 15;

function janelas(agora = new Date()) {
  const fimAtual = agora;
  const inicioAtual = new Date(agora.getTime() - DIAS_JANELA * 24 * 60 * 60 * 1000);
  const inicioAnterior = new Date(inicioAtual.getTime() - DIAS_JANELA * 24 * 60 * 60 * 1000);
  return { inicioAtual, fimAtual, inicioAnterior, fimAnterior: inicioAtual };
}

function variacao(anterior: number, atual: number): number | null {
  if (anterior === 0) return null; // sem base de comparacao — nao inventa percentual
  return arredondar(((atual - anterior) / anterior) * 100);
}

/* -------------------------------------------------------------------------- */
/* Analises                                                                    */
/* -------------------------------------------------------------------------- */

const TIPOS_DESVIO = ['COMPORTAMENTO_INSEGURO', 'CONDICAO_INSEGURA'] as const;

/** Tendencia de desvios por cliente: janela de 30 dias contra a anterior. */
async function tendenciaPorCliente(clienteId?: string): Promise<Achado[]> {
  const { inicioAtual, inicioAnterior, fimAnterior } = janelas();
  const achados: Achado[] = [];

  const clientes = await prisma.cliente.findMany({
    where: { situacao: 'ATIVO', ...(clienteId ? { id: clienteId } : {}) },
    select: { id: true, nomeFantasia: true },
  });

  for (const cliente of clientes) {
    const [atual, anterior] = await Promise.all([
      prisma.observacao.count({
        where: { clienteId: cliente.id, tipo: { in: [...TIPOS_DESVIO] }, dataHora: { gte: inicioAtual } },
      }),
      prisma.observacao.count({
        where: {
          clienteId: cliente.id,
          tipo: { in: [...TIPOS_DESVIO] },
          dataHora: { gte: inicioAnterior, lt: fimAnterior },
        },
      }),
    ]);

    const delta = variacao(anterior, atual);
    if (delta === null || Math.abs(delta) < VARIACAO_MINIMA) continue;

    const piorou = delta > 0;
    achados.push({
      categoria: 'TENDENCIA',
      severidade: piorou ? 'ATENCAO' : 'POSITIVO',
      titulo: piorou ? `Desvios em alta em ${cliente.nomeFantasia}` : `Desvios em queda em ${cliente.nomeFantasia}`,
      texto: piorou
        ? `${cliente.nomeFantasia} registrou ${atual} desvios nos ultimos ${DIAS_JANELA} dias — aumento de ${delta}% sobre os ${anterior} do periodo anterior.`
        : `${cliente.nomeFantasia} registrou ${atual} desvios nos ultimos ${DIAS_JANELA} dias — reducao de ${Math.abs(delta)}% sobre os ${anterior} do periodo anterior. As acoes estao surtindo efeito.`,
      evidencia: { periodoDias: DIAS_JANELA, desviosAtuais: atual, desviosAnteriores: anterior, variacaoPercentual: delta },
      link: '/observacoes',
    });
  }

  return achados;
}

/** Area com pior evolucao de desvios — o exemplo classico do plano diretor. */
async function areasCriticas(clienteId?: string): Promise<Achado[]> {
  const { inicioAtual, inicioAnterior, fimAnterior } = janelas();
  const achados: Achado[] = [];

  const base = { tipo: { in: [...TIPOS_DESVIO] }, ...(clienteId ? { clienteId } : {}) };

  const [atualPorArea, anteriorPorArea] = await Promise.all([
    prisma.observacao.groupBy({
      by: ['areaId'],
      where: { ...base, dataHora: { gte: inicioAtual } },
      _count: { _all: true },
      orderBy: { areaId: 'asc' },
    }),
    prisma.observacao.groupBy({
      by: ['areaId'],
      where: { ...base, dataHora: { gte: inicioAnterior, lt: fimAnterior } },
      _count: { _all: true },
      orderBy: { areaId: 'asc' },
    }),
  ]);

  const anteriores = new Map(anteriorPorArea.map((linha) => [linha.areaId, linha._count._all]));
  const areas = await prisma.area.findMany({
    where: { id: { in: atualPorArea.map((linha) => linha.areaId) } },
    select: { id: true, nome: true, cliente: { select: { nomeFantasia: true } } },
  });
  const nomes = new Map(areas.map((area) => [area.id, `${area.nome} (${area.cliente.nomeFantasia})`]));

  for (const linha of atualPorArea) {
    const anterior = anteriores.get(linha.areaId) ?? 0;
    const delta = variacao(anterior, linha._count._all);
    if (delta === null || delta < VARIACAO_MINIMA) continue;

    achados.push({
      categoria: 'AREA_CRITICA',
      severidade: 'ATENCAO',
      titulo: `${nomes.get(linha.areaId) ?? 'Area'} em piora`,
      texto: `${nomes.get(linha.areaId) ?? 'A area'} apresentou aumento de ${delta}% nos desvios: ${linha._count._all} nos ultimos ${DIAS_JANELA} dias contra ${anterior} no periodo anterior. Priorize inspecao e DDS dirigido nesta area.`,
      evidencia: { desviosAtuais: linha._count._all, desviosAnteriores: anterior, variacaoPercentual: delta },
      link: '/dashboard-gerencial',
    });
  }

  // So os 3 piores — lista longa vira papel de parede.
  return achados
    .sort((a, b) => Number(b.evidencia.variacaoPercentual) - Number(a.evidencia.variacaoPercentual))
    .slice(0, 3);
}

/** Causa que concentra os desvios — onde a campanha rende mais. */
async function causaDominante(clienteId?: string): Promise<Achado[]> {
  const { inicioAtual } = janelas();

  const porCausa = await prisma.observacao.groupBy({
    by: ['causaId'],
    where: {
      tipo: { in: [...TIPOS_DESVIO] },
      causaId: { not: null },
      dataHora: { gte: inicioAtual },
      ...(clienteId ? { clienteId } : {}),
    },
    _count: { _all: true },
    orderBy: { causaId: 'asc' },
  });

  const total = porCausa.reduce((soma, linha) => soma + linha._count._all, 0);
  if (total < 10) return []; // amostra pequena demais para apontar dominancia

  const [maior] = porCausa.sort((a, b) => b._count._all - a._count._all);
  if (!maior?.causaId) return [];

  const participacao = percentual(maior._count._all, total);
  if (participacao < 30) return [];

  const causa = await prisma.causaDesvio.findUnique({ where: { id: maior.causaId }, select: { descricao: true } });

  return [
    {
      categoria: 'CAUSA_DOMINANTE',
      severidade: 'INFORMATIVO',
      titulo: `"${causa?.descricao}" concentra os desvios`,
      texto: `A causa "${causa?.descricao}" responde por ${participacao}% dos ${total} desvios classificados nos ultimos ${DIAS_JANELA} dias. E o alvo com maior retorno para campanha e treinamento dirigido.`,
      evidencia: { ocorrencias: maior._count._all, totalDesvios: total, participacaoPercentual: participacao },
      link: '/dashboard-gerencial',
    },
  ];
}

/** Planos atrasados e escalonamentos que ninguem tratou. */
async function planosEmRisco(clienteId?: string): Promise<Achado[]> {
  const agora = new Date();
  const base = { status: { in: ['ABERTO' as const, 'EM_ANDAMENTO' as const] }, ...(clienteId ? { clienteId } : {}) };

  const [atrasados, maisAntigo] = await Promise.all([
    prisma.planoAcao.count({ where: { ...base, prazo: { lt: agora } } }),
    prisma.planoAcao.findFirst({
      where: { ...base, prazo: { lt: agora } },
      orderBy: { prazo: 'asc' },
      select: { codigo: true, prazo: true, responsavelNome: true },
    }),
  ]);

  if (atrasados === 0) {
    return [
      {
        categoria: 'PLANO_ACAO',
        severidade: 'POSITIVO',
        titulo: 'Carteira de planos em dia',
        texto: 'Nenhum plano de acao esta com o prazo vencido.',
        evidencia: { atrasados: 0 },
        link: '/planos-acao',
      },
    ];
  }

  const diasAtraso = maisAntigo ? Math.floor((agora.getTime() - maisAntigo.prazo.getTime()) / (24 * 60 * 60 * 1000)) : 0;

  return [
    {
      categoria: 'PLANO_ACAO',
      severidade: diasAtraso > 30 ? 'CRITICO' : 'ATENCAO',
      titulo: `${atrasados} plano(s) de acao atrasado(s)`,
      texto: `Ha ${atrasados} plano(s) com prazo vencido. O mais antigo (${maisAntigo?.codigo}, responsavel ${maisAntigo?.responsavelNome}) acumula ${diasAtraso} dias de atraso. Rode o escalonamento e cobre os responsaveis.`,
      evidencia: { atrasados, maisAntigo: maisAntigo?.codigo ?? '—', diasAtrasoMaximo: diasAtraso },
      link: '/planos-acao?atrasados=true',
    },
  ];
}

/** Reincidencia na gestao de consequencias. */
async function reincidencias(clienteId?: string): Promise<Achado[]> {
  const grupos = await prisma.consequencia.groupBy({
    by: ['colaboradorId'],
    _count: { _all: true },
    where: clienteId ? { colaborador: { clienteId } } : {},
    having: { colaboradorId: { _count: { gt: 1 } } },
  });

  if (grupos.length === 0) return [];

  const pior = grupos.sort((a, b) => b._count._all - a._count._all)[0]!;
  const colaborador = await prisma.colaborador.findUnique({
    where: { id: pior.colaboradorId },
    select: { nome: true, funcao: true },
  });

  return [
    {
      categoria: 'REINCIDENCIA',
      severidade: 'ATENCAO',
      titulo: `${grupos.length} colaborador(es) reincidente(s) em gestao de consequencias`,
      texto: `${grupos.length} colaborador(es) acumulam mais de um registro. O caso mais recorrente e ${colaborador?.nome} (${colaborador?.funcao}), com ${pior._count._all} registros — avalie reciclagem dirigida antes de nova medida disciplinar.`,
      evidencia: { reincidentes: grupos.length, maiorRecorrencia: pior._count._all },
      link: '/consequencias',
    },
  ];
}

/** Capacitacao: vencidos e sem treinamento pesando na nota. */
async function capacitacao(clienteId?: string): Promise<Achado[]> {
  const { matrizDeCapacitacao } = await import('../treinamentos/treinamento.service.js');
  const { resumo } = await matrizDeCapacitacao({ clienteId });

  if (resumo.totalRequisitos === 0) return [];

  const pendentes = resumo.vencidos + resumo.semTreinamento;
  if (pendentes === 0) {
    return [
      {
        categoria: 'CAPACITACAO',
        severidade: 'POSITIVO',
        titulo: 'Matriz de capacitacao em dia',
        texto: `Todos os ${resumo.totalRequisitos} requisitos de treinamento estao em dia.`,
        evidencia: { requisitos: resumo.totalRequisitos },
        link: '/treinamentos',
      },
    ];
  }

  return [
    {
      categoria: 'CAPACITACAO',
      severidade: resumo.semTreinamento > 0 ? 'CRITICO' : 'ATENCAO',
      titulo: `${pendentes} requisito(s) de treinamento pendente(s)`,
      texto: `${resumo.vencidos} treinamento(s) vencido(s) e ${resumo.semTreinamento} nunca realizado(s), de ${resumo.totalRequisitos} requisitos. A nota do pilar Treinamentos esta em ${resumo.percentualEmDia}% — e o pilar que mais derruba o Indice Global hoje.`,
      evidencia: {
        vencidos: resumo.vencidos,
        semTreinamento: resumo.semTreinamento,
        totalRequisitos: resumo.totalRequisitos,
        notaPilar: resumo.percentualEmDia ?? 0,
      },
      link: '/treinamentos',
    },
  ];
}

/** Colaboradores impedidos de trabalhar (ASO). */
async function saudeOcupacional(clienteId?: string): Promise<Achado[]> {
  const { painelConformidade } = await import('../saude/conformidade.service.js');
  const painel = await painelConformidade({ clienteId });

  if (painel.saude.impedidos === 0) return [];

  return [
    {
      categoria: 'SAUDE',
      severidade: 'CRITICO',
      titulo: `${painel.saude.impedidos} colaborador(es) impedido(s) de trabalhar`,
      texto: `${painel.saude.semAso} sem nenhum ASO, ${painel.saude.vencidos} com ASO vencido e ${painel.saude.inaptos} inapto(s). Pessoa impedida em campo e passivo trabalhista imediato — regularize antes da proxima mobilizacao.`,
      evidencia: {
        impedidos: painel.saude.impedidos,
        semAso: painel.saude.semAso,
        asoVencidos: painel.saude.vencidos,
        inaptos: painel.saude.inaptos,
      },
      link: '/colaboradores?asoIrregular=true',
    },
  ];
}

/** EPI: CA vencido e estoque abaixo do minimo. */
async function epis(): Promise<Achado[]> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [caVencidos, itens] = await Promise.all([
    prisma.epi.count({ where: { ativo: true, validadeCa: { lt: hoje } } }),
    prisma.epi.findMany({ where: { ativo: true }, select: { nome: true, estoqueAtual: true, estoqueMinimo: true } }),
  ]);

  const abaixo = itens.filter((epi) => epi.estoqueAtual < epi.estoqueMinimo);
  const achados: Achado[] = [];

  if (caVencidos > 0) {
    achados.push({
      categoria: 'EPI',
      severidade: 'CRITICO',
      titulo: `${caVencidos} EPI(s) com CA vencido`,
      texto: `Ha ${caVencidos} EPI(s) ativo(s) com Certificado de Aprovacao vencido. EPI com CA vencido nao vale como protecao legal — suspenda a entrega ate regularizar.`,
      evidencia: { caVencidos },
      link: '/epis',
    });
  }

  if (abaixo.length > 0) {
    achados.push({
      categoria: 'EPI',
      severidade: 'ATENCAO',
      titulo: `${abaixo.length} EPI(s) abaixo do estoque minimo`,
      texto: `${abaixo.map((epi) => epi.nome).slice(0, 3).join(', ')}${abaixo.length > 3 ? ' e outros' : ''} atingiram o ponto de reposicao. Dispare a compra antes de faltar em campo.`,
      evidencia: { itensAbaixoDoMinimo: abaixo.length },
      link: '/epis',
    });
  }

  return achados;
}

/** Auditorias com NC maiores em aberto. */
async function auditorias(clienteId?: string): Promise<Achado[]> {
  const inicio = new Date();
  inicio.setMonth(inicio.getMonth() - 12);

  const agregado = await prisma.auditoria.aggregate({
    where: { situacao: 'CONCLUIDA', dataRealizacao: { gte: inicio }, ...(clienteId ? { clienteId } : {}) },
    _sum: { ncMaiores: true },
  });

  const ncMaiores = agregado._sum.ncMaiores ?? 0;
  if (ncMaiores === 0) return [];

  return [
    {
      categoria: 'AUDITORIA',
      severidade: 'ATENCAO',
      titulo: `${ncMaiores} nao conformidade(s) maior(es) em auditorias`,
      texto: `As auditorias concluidas nos ultimos 12 meses somam ${ncMaiores} NC maior(es). NC maior sem plano de acao formal reabre na proxima auditoria — confirme que cada uma tem tratativa com origem "Auditoria".`,
      evidencia: { ncMaiores, janelaMeses: 12 },
      link: '/auditorias',
    },
  ];
}

/** Constancia do DDS. */
async function dds(clienteId?: string): Promise<Achado[]> {
  const ultimo = await prisma.registroDds.findFirst({
    where: clienteId ? { clienteId } : {},
    orderBy: { data: 'desc' },
    select: { data: true },
  });

  if (!ultimo) return [];

  const diasSem = Math.floor((Date.now() - ultimo.data.getTime()) / (24 * 60 * 60 * 1000));
  if (diasSem <= 3) return [];

  return [
    {
      categoria: 'DDS',
      severidade: diasSem > 7 ? 'ATENCAO' : 'INFORMATIVO',
      titulo: `${diasSem} dias sem registro de DDS`,
      texto: `O ultimo DDS registrado foi ha ${diasSem} dias. A constancia do dialogo diario e o termometro mais barato da cultura de seguranca — retome a rotina ou verifique se os registros estao ficando fora do sistema.`,
      evidencia: { diasSemRegistro: diasSem },
      link: '/dds',
    },
  ];
}

/** Extremos do ranking — melhor e pior contrato. */
async function ranking(): Promise<Achado[]> {
  const { painelExecutivo } = await import('../dashboards/dashboard.service.js');
  const painel = await painelExecutivo({});

  if (painel.ranking.length < 2) return [];

  const melhor = painel.ranking[0]!;
  const pior = painel.ranking[painel.ranking.length - 1]!;
  const diferenca = arredondar(melhor.indiceGlobal - pior.indiceGlobal);

  if (diferenca < 5) return [];

  return [
    {
      categoria: 'RANKING',
      severidade: 'INFORMATIVO',
      titulo: `${diferenca} pontos separam o melhor e o pior contrato`,
      texto: `${melhor.cliente} lidera com indice ${melhor.indiceGlobal}; ${pior.cliente} fecha com ${pior.indiceGlobal}. Vale levar as praticas do primeiro para o segundo — em especial onde o ICI e mais alto (${pior.ici}% contra ${melhor.ici}%).`,
      evidencia: {
        melhorCliente: melhor.cliente,
        melhorIndice: melhor.indiceGlobal,
        piorCliente: pior.cliente,
        piorIndice: pior.indiceGlobal,
      },
      link: '/dashboard-executivo',
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Consolidacao                                                                */
/* -------------------------------------------------------------------------- */

export async function gerarAnalises(clienteId?: string) {
  const grupos = await Promise.all([
    tendenciaPorCliente(clienteId),
    areasCriticas(clienteId),
    causaDominante(clienteId),
    planosEmRisco(clienteId),
    reincidencias(clienteId),
    capacitacao(clienteId),
    saudeOcupacional(clienteId),
    epis(),
    auditorias(clienteId),
    dds(clienteId),
    ...(clienteId ? [] : [ranking()]),
  ]);

  const achados = grupos.flat().sort((a, b) => ORDEM_SEVERIDADE[a.severidade] - ORDEM_SEVERIDADE[b.severidade]);

  const criticos = achados.filter((achado) => achado.severidade === 'CRITICO').length;
  const atencao = achados.filter((achado) => achado.severidade === 'ATENCAO').length;
  const positivos = achados.filter((achado) => achado.severidade === 'POSITIVO').length;

  // Resumo gerencial: uma frase composta so do que os achados sustentam.
  const partes: string[] = [];
  if (criticos > 0) partes.push(`${criticos} ponto(s) critico(s) exigem acao imediata`);
  if (atencao > 0) partes.push(`${atencao} merecem atencao esta semana`);
  if (positivos > 0) partes.push(`${positivos} indicador(es) evoluiram bem`);

  return {
    geradoEm: new Date(),
    resumo:
      partes.length > 0
        ? `Leitura do periodo: ${partes.join('; ')}.`
        : 'Nenhum achado relevante no periodo — os indicadores estao estaveis.',
    totais: { criticos, atencao, informativos: achados.length - criticos - atencao - positivos, positivos },
    achados,
  };
}
