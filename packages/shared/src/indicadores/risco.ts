/**
 * Indice Inteligente de Risco (IIR) e Piramide de Bird.
 *
 * O IIR mede o risco **antes** do acidente, permitindo priorizar inspecoes.
 * A Piramide de Bird classifica o que ja ocorreu.
 */

/* -------------------------------------------------------------------------- */
/* Indice Inteligente de Risco                                                 */
/* -------------------------------------------------------------------------- */

export interface FatoresRisco {
  /** Gravidade do dano potencial (1–5). */
  severidade: number;
  /** Chance de o evento ocorrer (1–5). */
  probabilidade: number;
  /** Quantidade de pessoas / tempo de exposicao (1–5). */
  exposicao: number;
  /** Com que frequencia a atividade acontece (1–5). */
  frequencia: number;
}

export const NIVEIS_IIR = ['BAIXO', 'MODERADO', 'ALTO', 'CRITICO'] as const;
export type NivelIir = (typeof NIVEIS_IIR)[number];

export interface FaixaIir {
  nivel: NivelIir;
  /** Limite superior (inclusivo). `null` = sem teto. */
  ate: number | null;
  rotulo: string;
  cor: string;
  emoji: string;
}

/** Faixas do plano: 0–20 Baixo · 21–50 Moderado · 51–100 Alto · >100 Critico. */
export const FAIXAS_IIR: readonly FaixaIir[] = [
  { nivel: 'BAIXO', ate: 20, rotulo: 'Baixo', cor: '#16a34a', emoji: '🟢' },
  { nivel: 'MODERADO', ate: 50, rotulo: 'Moderado', cor: '#ca8a04', emoji: '🟡' },
  { nivel: 'ALTO', ate: 100, rotulo: 'Alto', cor: '#ea580c', emoji: '🟠' },
  { nivel: 'CRITICO', ate: null, rotulo: 'Critico', cor: '#dc2626', emoji: '🔴' },
];

export const FATOR_RISCO_MIN = 1;
export const FATOR_RISCO_MAX = 5;

export interface ResultadoIir {
  valor: number;
  faixa: FaixaIir;
  fatores: FatoresRisco;
}

function validarFator(valor: number, nome: string): number {
  if (!Number.isFinite(valor) || valor < FATOR_RISCO_MIN || valor > FATOR_RISCO_MAX) {
    throw new RangeError(`${nome} deve estar entre ${FATOR_RISCO_MIN} e ${FATOR_RISCO_MAX}.`);
  }
  return valor;
}

/** IIR = Severidade x Probabilidade x Exposicao x Frequencia (25 a 625). */
export function calcularIir(fatores: FatoresRisco): ResultadoIir {
  const severidade = validarFator(fatores.severidade, 'Severidade');
  const probabilidade = validarFator(fatores.probabilidade, 'Probabilidade');
  const exposicao = validarFator(fatores.exposicao, 'Exposicao');
  const frequencia = validarFator(fatores.frequencia, 'Frequencia');

  const valor = severidade * probabilidade * exposicao * frequencia;

  return { valor, faixa: classificarIir(valor), fatores: { severidade, probabilidade, exposicao, frequencia } };
}

export function classificarIir(valor: number): FaixaIir {
  return FAIXAS_IIR.find((faixa) => faixa.ate === null || valor <= faixa.ate) ?? FAIXAS_IIR[FAIXAS_IIR.length - 1]!;
}

/* -------------------------------------------------------------------------- */
/* Grau de risco da ocorrencia (I, II, III)                                    */
/* -------------------------------------------------------------------------- */

/** Grau de risco usado pela matriz de comunicacao. */
export const GRAUS_RISCO_OCORRENCIA = ['I', 'II', 'III'] as const;
export type GrauRiscoOcorrencia = (typeof GRAUS_RISCO_OCORRENCIA)[number];

export const DESCRICAO_GRAU_OCORRENCIA: Record<GrauRiscoOcorrencia, string> = {
  I: 'Grau I — risco iminente, exige acao imediata',
  II: 'Grau II — risco relevante, acao programada de curto prazo',
  III: 'Grau III — risco baixo, registro e acompanhamento',
};

/**
 * Deriva o grau de risco da ocorrencia a partir do IIR, para que o inspetor
 * nao precise escolher os dois campos manualmente.
 */
export function grauRiscoPeloIir(valor: number): GrauRiscoOcorrencia {
  const nivel = classificarIir(valor).nivel;
  if (nivel === 'CRITICO' || nivel === 'ALTO') return 'I';
  if (nivel === 'MODERADO') return 'II';
  return 'III';
}

/* -------------------------------------------------------------------------- */
/* Piramide de Bird                                                            */
/* -------------------------------------------------------------------------- */

export const CLASSIFICACOES_BIRD = [
  'A_MAJOR',
  'B_SERIOUS',
  'C_MINOR',
  'D_MAJOR_NEAR_MISS',
  'E_NEAR_MISS',
  'F_FIRST_AID',
  'ATOS_E_CONDICOES',
] as const;
export type ClassificacaoBird = (typeof CLASSIFICACOES_BIRD)[number];

export interface DefinicaoBird {
  classificacao: ClassificacaoBird;
  codigo: string;
  rotulo: string;
  descricao: string;
  /** Posicao na piramide: 1 = topo (mais grave). */
  nivel: number;
  cor: string;
}

export const DEFINICOES_BIRD: readonly DefinicaoBird[] = [
  {
    classificacao: 'A_MAJOR',
    codigo: 'A',
    rotulo: 'MAJOR',
    descricao: 'Acidente grave, com afastamento ou dano maior',
    nivel: 1,
    cor: '#7f1d1d',
  },
  {
    classificacao: 'B_SERIOUS',
    codigo: 'B',
    rotulo: 'SERIOUS',
    descricao: 'Acidente serio, com tratamento medico',
    nivel: 2,
    cor: '#dc2626',
  },
  {
    classificacao: 'C_MINOR',
    codigo: 'C',
    rotulo: 'MINOR',
    descricao: 'Acidente leve, sem afastamento',
    nivel: 3,
    cor: '#ea580c',
  },
  {
    classificacao: 'D_MAJOR_NEAR_MISS',
    codigo: 'D',
    rotulo: 'MAJOR NEAR MISS',
    descricao: 'Quase acidente com potencial de dano grave',
    nivel: 4,
    cor: '#f59e0b',
  },
  {
    classificacao: 'E_NEAR_MISS',
    codigo: 'E',
    rotulo: 'NEAR MISS',
    descricao: 'Quase acidente',
    nivel: 5,
    cor: '#ca8a04',
  },
  {
    classificacao: 'F_FIRST_AID',
    codigo: 'F',
    rotulo: 'FIRST AID',
    descricao: 'Primeiros socorros',
    nivel: 6,
    cor: '#65a30d',
  },
  {
    classificacao: 'ATOS_E_CONDICOES',
    codigo: '—',
    rotulo: 'Atos e Condicoes Inseguras',
    descricao: 'Base da piramide: desvios observados antes de virarem ocorrencia',
    nivel: 7,
    cor: '#2563eb',
  },
];

/**
 * Classificacoes que podem ser atribuidas a uma ocorrencia.
 * `ATOS_E_CONDICOES` fica de fora: e a base da piramide, alimentada pela
 * contagem de desvios observados, e nao um valor que o inspetor escolhe.
 */
export const CLASSIFICACOES_BIRD_OCORRENCIA = [
  'A_MAJOR',
  'B_SERIOUS',
  'C_MINOR',
  'D_MAJOR_NEAR_MISS',
  'E_NEAR_MISS',
  'F_FIRST_AID',
] as const satisfies readonly Exclude<ClassificacaoBird, 'ATOS_E_CONDICOES'>[];

export type ClassificacaoBirdOcorrencia = (typeof CLASSIFICACOES_BIRD_OCORRENCIA)[number];

export function definicaoBird(classificacao: ClassificacaoBird): DefinicaoBird {
  return DEFINICOES_BIRD.find((definicao) => definicao.classificacao === classificacao)!;
}

export type ContagemBird = Partial<Record<ClassificacaoBird, number>>;

export interface NivelPiramide extends DefinicaoBird {
  quantidade: number;
  /** Quantas ocorrencias da base existem para cada evento deste nivel. */
  razaoParaBase: number | null;
}

/**
 * Monta a piramide de Bird do topo para a base.
 *
 * A razao para a base e o que da sentido a piramide: uma base larga de desvios
 * observados com poucos acidentes no topo indica um programa de observacao
 * funcionando.
 */
/** Piramide montada: os niveis, o total de ocorrencias e a base de desvios. */
export interface PiramideBird {
  niveis: NivelPiramide[];
  totalOcorrencias: number;
  /** Desvios observados (atos e condicoes) — a base da piramide. */
  base: number;
}

export function montarPiramideBird(contagem: ContagemBird): PiramideBird {
  const base = contagem.ATOS_E_CONDICOES ?? 0;

  const niveis = DEFINICOES_BIRD.map((definicao) => {
    const quantidade = contagem[definicao.classificacao] ?? 0;
    return {
      ...definicao,
      quantidade,
      razaoParaBase:
        definicao.classificacao === 'ATOS_E_CONDICOES' || quantidade === 0 || base === 0
          ? null
          : Math.round(base / quantidade),
    };
  });

  const totalOcorrencias = niveis
    .filter((nivel) => nivel.classificacao !== 'ATOS_E_CONDICOES')
    .reduce((soma, nivel) => soma + nivel.quantidade, 0);

  return { niveis, totalOcorrencias, base };
}
