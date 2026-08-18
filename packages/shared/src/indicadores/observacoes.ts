import { arredondar, classificarDesempenho, percentual, type FaixaDesempenho } from './classificacao.js';

/**
 * Indicador de Comportamento x Condicao Insegura (BBS).
 *
 * E o indicador de maturidade da cultura de seguranca: a maioria dos acidentes
 * nasce da combinacao entre comportamento inseguro e condicao insegura.
 */

/** Tipo escolhido pelo inspetor logo apos ler o QR Code da area. */
export const TIPOS_OBSERVACAO = [
  'COMPORTAMENTO_SEGURO',
  'COMPORTAMENTO_INSEGURO',
  'CONDICAO_INSEGURA',
  'MELHORIA_IDENTIFICADA',
  'NAO_CONFORMIDADE',
] as const;
export type TipoObservacao = (typeof TIPOS_OBSERVACAO)[number];

export interface DefinicaoTipoObservacao {
  tipo: TipoObservacao;
  rotulo: string;
  cor: string;
  emoji: string;
  /** Entra no denominador do ICS/ICI. */
  contaNoBbs: boolean;
  /** Abre plano de acao automaticamente ao ser registrada. */
  abrePlanoDeAcao: boolean;
}

/**
 * `MELHORIA_IDENTIFICADA` e `NAO_CONFORMIDADE` sao registradas e entram nos
 * demais paineis, mas ficam **fora** do denominador do ICS/ICI: o indice de
 * cultura compara comportamento seguro contra desvio de comportamento e de
 * condicao. E o que reproduz os exemplos do plano (425 + 72 + 18 = 515).
 */
export const DEFINICOES_TIPO_OBSERVACAO: readonly DefinicaoTipoObservacao[] = [
  {
    tipo: 'COMPORTAMENTO_SEGURO',
    rotulo: 'Comportamento Seguro',
    cor: '#16a34a',
    emoji: '🟢',
    contaNoBbs: true,
    abrePlanoDeAcao: false,
  },
  {
    tipo: 'COMPORTAMENTO_INSEGURO',
    rotulo: 'Comportamento Inseguro',
    cor: '#ca8a04',
    emoji: '🟡',
    contaNoBbs: true,
    abrePlanoDeAcao: true,
  },
  {
    tipo: 'CONDICAO_INSEGURA',
    rotulo: 'Condicao Insegura',
    cor: '#ea580c',
    emoji: '🟠',
    contaNoBbs: true,
    abrePlanoDeAcao: true,
  },
  {
    tipo: 'MELHORIA_IDENTIFICADA',
    rotulo: 'Melhoria Identificada',
    cor: '#2563eb',
    emoji: '🔵',
    contaNoBbs: false,
    abrePlanoDeAcao: false,
  },
  {
    tipo: 'NAO_CONFORMIDADE',
    rotulo: 'Nao Conformidade',
    cor: '#dc2626',
    emoji: '🔴',
    contaNoBbs: false,
    abrePlanoDeAcao: true,
  },
];

export function definicaoDoTipo(tipo: TipoObservacao): DefinicaoTipoObservacao {
  return DEFINICOES_TIPO_OBSERVACAO.find((definicao) => definicao.tipo === tipo)!;
}

/** Contagem bruta de observacoes por tipo, no periodo/filtro selecionado. */
export type ContagemObservacoes = Record<TipoObservacao, number>;

export const CONTAGEM_VAZIA: ContagemObservacoes = {
  COMPORTAMENTO_SEGURO: 0,
  COMPORTAMENTO_INSEGURO: 0,
  CONDICAO_INSEGURA: 0,
  MELHORIA_IDENTIFICADA: 0,
  NAO_CONFORMIDADE: 0,
};

export interface LinhaDistribuicao {
  tipo: TipoObservacao;
  rotulo: string
  cor: string;
  emoji: string;
  quantidade: number;
  /** Percentual sobre o total do BBS (seguro + inseguro + condicao). */
  percentual: number;
}

export interface IndicadoresBbs {
  /** Base do ICS/ICI: seguros + comportamentos inseguros + condicoes inseguras. */
  totalBbs: number;
  /** Inclui melhorias e nao conformidades — usado no card "Total de Observacoes". */
  totalRegistros: number;
  comportamentosSeguros: number;
  comportamentosInseguros: number;
  condicoesInseguras: number;
  melhoriasIdentificadas: number;
  naoConformidades: number;
  /** Indice de Comportamento Seguro (%). */
  ics: number;
  /** Indice de Condicoes Inseguras (%). */
  ici: number;
  /** Percentual de comportamentos inseguros (%). */
  ici_comportamental: number;
  classificacaoIcs: FaixaDesempenho;
  /** Distribuicao pronta para as barras do dashboard BBS. */
  distribuicao: LinhaDistribuicao[];
}

/**
 * Calcula os indicadores BBS a partir da contagem de observacoes.
 *
 *   ICS = (Comportamentos Seguros / Total de Observacoes BBS) x 100
 *   ICI = (Condicoes Inseguras   / Total de Observacoes BBS) x 100
 */
export function calcularIndicadoresBbs(contagem: Partial<ContagemObservacoes>): IndicadoresBbs {
  const numeros = { ...CONTAGEM_VAZIA, ...contagem };

  const comportamentosSeguros = numeros.COMPORTAMENTO_SEGURO;
  const comportamentosInseguros = numeros.COMPORTAMENTO_INSEGURO;
  const condicoesInseguras = numeros.CONDICAO_INSEGURA;

  const totalBbs = comportamentosSeguros + comportamentosInseguros + condicoesInseguras;
  const totalRegistros = totalBbs + numeros.MELHORIA_IDENTIFICADA + numeros.NAO_CONFORMIDADE;

  const ics = percentual(comportamentosSeguros, totalBbs);
  const ici = percentual(condicoesInseguras, totalBbs);

  const distribuicao = DEFINICOES_TIPO_OBSERVACAO.filter((definicao) => definicao.contaNoBbs).map((definicao) => ({
    tipo: definicao.tipo,
    rotulo: definicao.rotulo,
    cor: definicao.cor,
    emoji: definicao.emoji,
    quantidade: numeros[definicao.tipo],
    percentual: percentual(numeros[definicao.tipo], totalBbs),
  }));

  return {
    totalBbs,
    totalRegistros,
    comportamentosSeguros,
    comportamentosInseguros,
    condicoesInseguras,
    melhoriasIdentificadas: numeros.MELHORIA_IDENTIFICADA,
    naoConformidades: numeros.NAO_CONFORMIDADE,
    ics,
    ici,
    ici_comportamental: percentual(comportamentosInseguros, totalBbs),
    classificacaoIcs: classificarDesempenho(ics),
    distribuicao,
  };
}

/**
 * O ICI nao tem faixas proprias no plano diretor — so a meta (<= 10%).
 * Avaliamos contra a meta em vez de inventar uma escala.
 */
export const META_ICI_PADRAO = 10;

export interface AvaliacaoIci {
  ici: number;
  meta: number;
  dentroDaMeta: boolean;
  /** Diferenca em pontos percentuais (positivo = acima da meta). */
  desvio: number;
}

export function avaliarIci(ici: number, meta = META_ICI_PADRAO): AvaliacaoIci {
  return {
    ici,
    meta,
    dentroDaMeta: ici <= meta,
    desvio: arredondar(ici - meta),
  };
}

/* -------------------------------------------------------------------------- */
/* Pareto                                                                      */
/* -------------------------------------------------------------------------- */

export interface ItemPareto {
  causa: string;
  quantidade: number;
  percentual: number;
  /** Percentual acumulado — a curva do Pareto. */
  acumulado: number;
  /** `true` enquanto o acumulado nao ultrapassa 80% (as "poucas causas vitais"). */
  dentroDos80: boolean;
}

/**
 * Monta o Pareto de desvios (comportamentos ou condicoes), ordenado da causa
 * mais frequente para a menos frequente, com a curva acumulada.
 */
export function calcularPareto(
  ocorrencias: Array<{ causa: string; quantidade: number }>,
  limite?: number,
): ItemPareto[] {
  const total = ocorrencias.reduce((soma, item) => soma + item.quantidade, 0);
  if (total <= 0) return [];

  const ordenadas = [...ocorrencias].sort(
    (a, b) => b.quantidade - a.quantidade || a.causa.localeCompare(b.causa, 'pt-BR'),
  );

  let acumuladoBruto = 0;
  const itens = ordenadas.map((item) => {
    acumuladoBruto += item.quantidade;
    const acumulado = percentual(acumuladoBruto, total);
    return {
      causa: item.causa,
      quantidade: item.quantidade,
      percentual: percentual(item.quantidade, total),
      acumulado,
      dentroDos80: acumulado - percentual(item.quantidade, total) < 80,
    };
  });

  return typeof limite === 'number' ? itens.slice(0, limite) : itens;
}

/* -------------------------------------------------------------------------- */
/* Mapa de calor por area                                                      */
/* -------------------------------------------------------------------------- */

export const CRITICIDADES_AREA = ['BAIXA', 'MEDIA', 'MEDIA_ALTA', 'ALTA'] as const;
export type CriticidadeArea = (typeof CRITICIDADES_AREA)[number];

export interface CelulaMapaCalor {
  area: string;
  comportamentosInseguros: number;
  condicoesInseguras: number;
  /** Soma ponderada usada para ordenar e colorir. */
  desvios: number;
  criticidade: CriticidadeArea;
  cor: string;
  emoji: string;
}

const CORES_CRITICIDADE: Record<CriticidadeArea, { cor: string; emoji: string; rotulo: string }> = {
  BAIXA: { cor: '#16a34a', emoji: '🟢', rotulo: 'Baixa' },
  MEDIA: { cor: '#ca8a04', emoji: '🟡', rotulo: 'Media' },
  MEDIA_ALTA: { cor: '#ea580c', emoji: '🟠', rotulo: 'Media/Alta' },
  ALTA: { cor: '#dc2626', emoji: '🔴', rotulo: 'Alta' },
};

export function rotuloCriticidade(criticidade: CriticidadeArea): string {
  return CORES_CRITICIDADE[criticidade].rotulo;
}

/**
 * Cortes da criticidade relativa, calibrados com o exemplo do plano diretor
 * (Soldagem 24 = Alta · Logistica 18 = Media/Alta · Montagem 13 = Media ·
 * Pintura 6 = Baixa, sobre um pior caso de 24 desvios).
 */
export const CORTES_CRITICIDADE = { ALTA: 0.8, MEDIA_ALTA: 0.6, MEDIA: 0.3 } as const;

function criticidadePelaProporcao(desvios: number, proporcao: number): CriticidadeArea {
  if (desvios === 0) return 'BAIXA';
  if (proporcao >= CORTES_CRITICIDADE.ALTA) return 'ALTA';
  if (proporcao >= CORTES_CRITICIDADE.MEDIA_ALTA) return 'MEDIA_ALTA';
  if (proporcao >= CORTES_CRITICIDADE.MEDIA) return 'MEDIA';
  return 'BAIXA';
}

/**
 * Mapa de calor: cruza desvios por area de trabalho.
 *
 * A criticidade e **relativa ao pior caso do periodo** — o que importa para a
 * gestao e saber onde concentrar inspecao e investimento agora, nao comparar
 * com um limiar absoluto que muda de operacao para operacao.
 */
export function calcularMapaCalor(
  areas: Array<{ area: string; comportamentosInseguros: number; condicoesInseguras: number }>,
): CelulaMapaCalor[] {
  const comDesvios = areas.map((linha) => ({
    ...linha,
    desvios: linha.comportamentosInseguros + linha.condicoesInseguras,
  }));

  const pior = Math.max(0, ...comDesvios.map((linha) => linha.desvios));

  return comDesvios
    .map((linha) => {
      const proporcao = pior > 0 ? linha.desvios / pior : 0;
      const criticidade = criticidadePelaProporcao(linha.desvios, proporcao);

      return { ...linha, criticidade, ...CORES_CRITICIDADE[criticidade] };
    })
    .sort((a, b) => b.desvios - a.desvios || a.area.localeCompare(b.area, 'pt-BR'));
}

/* -------------------------------------------------------------------------- */
/* Tendencia mensal                                                            */
/* -------------------------------------------------------------------------- */

export const DIRECOES_TENDENCIA = ['MELHORANDO', 'ESTAVEL', 'PIORANDO'] as const;
export type DirecaoTendencia = (typeof DIRECOES_TENDENCIA)[number];

export interface PontoTendencia {
  periodo: string;
  comportamentosInseguros: number;
  condicoesInseguras: number;
  total: number;
}

export interface Tendencia {
  pontos: PontoTendencia[];
  direcao: DirecaoTendencia;
  /** Variacao percentual entre o primeiro e o ultimo periodo. */
  variacao: number;
  simbolo: string;
}

/**
 * Tendencia dos desvios ao longo dos meses — responde se as acoes
 * implementadas estao de fato reduzindo os desvios.
 */
export function calcularTendencia(
  periodos: Array<{ periodo: string; comportamentosInseguros: number; condicoesInseguras: number }>,
): Tendencia {
  const pontos = periodos.map((ponto) => ({
    ...ponto,
    total: ponto.comportamentosInseguros + ponto.condicoesInseguras,
  }));

  const primeiro = pontos[0];
  const ultimo = pontos[pontos.length - 1];

  if (!primeiro || !ultimo || pontos.length < 2 || primeiro.total === 0) {
    return { pontos, direcao: 'ESTAVEL', variacao: 0, simbolo: '→' };
  }

  const variacao = arredondar(((ultimo.total - primeiro.total) / primeiro.total) * 100);
  // Menos desvio e melhor, entao variacao negativa significa melhora.
  const direcao: DirecaoTendencia = variacao <= -5 ? 'MELHORANDO' : variacao >= 5 ? 'PIORANDO' : 'ESTAVEL';

  return {
    pontos,
    direcao,
    variacao,
    simbolo: direcao === 'MELHORANDO' ? '↓' : direcao === 'PIORANDO' ? '↑' : '→',
  };
}

/* -------------------------------------------------------------------------- */
/* Score composto por area                                                     */
/* -------------------------------------------------------------------------- */

export interface EntradaScoreArea {
  /** Desvios (comportamento + condicao insegura) nos ultimos 30 dias. */
  desvios30Dias: number;
  /** Ultima inspecao dentro da frequencia cadastrada da area. */
  inspecaoEmDia: boolean;
  /** Planos de acao em aberto na area. */
  planosAbertos: number;
}

/**
 * Nota composta da area (0-100) — secao 23 do plano diretor.
 *
 * **Convencao editavel**: parte de 100 e desconta 2 pontos por desvio no mes
 * (teto 40), 20 pontos se a inspecao esta atrasada e 5 por plano em aberto
 * (teto 30). Os pesos moram aqui, num lugar so, para a régua ser ajustada
 * sem cacar numeros no codigo.
 */
export const SCORE_AREA = {
  porDesvio: 2,
  tetoDesvios: 40,
  inspecaoAtrasada: 20,
  porPlanoAberto: 5,
  tetoPlanos: 30,
} as const;

export function calcularScoreArea(entrada: EntradaScoreArea): number {
  const descontoDesvios = Math.min(SCORE_AREA.tetoDesvios, entrada.desvios30Dias * SCORE_AREA.porDesvio);
  const descontoInspecao = entrada.inspecaoEmDia ? 0 : SCORE_AREA.inspecaoAtrasada;
  const descontoPlanos = Math.min(SCORE_AREA.tetoPlanos, entrada.planosAbertos * SCORE_AREA.porPlanoAberto);

  return Math.max(0, 100 - descontoDesvios - descontoInspecao - descontoPlanos);
}
