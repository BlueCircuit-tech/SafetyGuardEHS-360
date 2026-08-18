import { z } from 'zod';
import { opcional, texto } from './comuns.js';
import { calcularIir, grauRiscoPeloIir, type FaixaIir } from '../indicadores/risco.js';

/**
 * Etapa 19 — Inventario de Riscos (GRO / PGR).
 *
 * A base do PGR exigido pela NR-1: para cada **perigo** identificado num
 * contexto (area ou funcao), o inventario registra a fonte, os danos
 * possiveis, as medidas de controle existentes e a avaliacao do risco.
 *
 * A avaliacao reaproveita o motor de IIR ja usado nas observacoes de campo
 * (Severidade × Probabilidade × Exposicao × Frequencia) — a mesma regua vale
 * para o risco previsto no inventario e para o risco observado em campo,
 * senao o mesmo perigo teria dois graus diferentes na mesma plataforma.
 */

/** Classificacao de agentes da NR-1 / NR-9. */
export const TIPOS_RISCO = ['FISICO', 'QUIMICO', 'BIOLOGICO', 'ERGONOMICO', 'ACIDENTE'] as const;
export type TipoRisco = (typeof TIPOS_RISCO)[number];

export const ROTULO_TIPO_RISCO: Record<TipoRisco, string> = {
  FISICO: 'Fisico',
  QUIMICO: 'Quimico',
  BIOLOGICO: 'Biologico',
  ERGONOMICO: 'Ergonomico',
  ACIDENTE: 'Acidente (mecanico)',
};

/**
 * Hierarquia de controles (NR-1, item 1.5.4.4.4) — da medida mais eficaz para
 * a menos. O EPI e o ULTIMO recurso, nao o primeiro: por isso a ordem importa
 * e fica registrada, nao e so um rotulo.
 */
export const NIVEIS_CONTROLE = [
  'ELIMINACAO',
  'SUBSTITUICAO',
  'ENGENHARIA',
  'ADMINISTRATIVO',
  'EPI',
] as const;
export type NivelControle = (typeof NIVEIS_CONTROLE)[number];

export const ROTULO_NIVEL_CONTROLE: Record<NivelControle, string> = {
  ELIMINACAO: 'Eliminacao do perigo',
  SUBSTITUICAO: 'Substituicao do processo',
  ENGENHARIA: 'Controle de engenharia',
  ADMINISTRATIVO: 'Controle administrativo',
  EPI: 'EPI (ultimo recurso)',
};

export const SITUACOES_RISCO = ['IDENTIFICADO', 'EM_TRATAMENTO', 'CONTROLADO', 'MONITORADO'] as const;
export type SituacaoRisco = (typeof SITUACOES_RISCO)[number];

export const ROTULO_SITUACAO_RISCO: Record<SituacaoRisco, string> = {
  IDENTIFICADO: 'Identificado',
  EM_TRATAMENTO: 'Em tratamento',
  CONTROLADO: 'Controlado',
  MONITORADO: 'Monitorado',
};

/** Perigos comuns por tipo — atalho do formulario, o campo e livre. */
export const PERIGOS_SUGERIDOS: Record<TipoRisco, readonly string[]> = {
  FISICO: ['Ruido', 'Calor', 'Vibracao', 'Radiacao ionizante', 'Radiacao nao ionizante', 'Umidade', 'Frio'],
  QUIMICO: ['Poeira / particulados', 'Fumos metalicos', 'Vapores organicos', 'Nevoas', 'Gases', 'Produto corrosivo'],
  BIOLOGICO: ['Bacterias', 'Fungos', 'Virus', 'Contato com residuos', 'Agua contaminada'],
  ERGONOMICO: ['Levantamento manual de carga', 'Postura inadequada', 'Movimento repetitivo', 'Trabalho em pe prolongado'],
  ACIDENTE: [
    'Trabalho em altura',
    'Espaco confinado',
    'Eletricidade',
    'Maquina sem protecao',
    'Movimentacao de cargas',
    'Piso irregular',
    'Trabalho a quente',
    'Projecao de particulas',
  ],
};

/* -------------------------------------------------------------------------- */
/* Schema                                                                      */
/* -------------------------------------------------------------------------- */

const escala = (campo: string) =>
  z.coerce
    .number({ required_error: `Informe ${campo}.`, invalid_type_error: `${campo} invalida.` })
    .int(`${campo} deve ser um numero inteiro.`)
    .min(1, `${campo} vai de 1 a 5.`)
    .max(5, `${campo} vai de 1 a 5.`);

const riscoBaseSchema = z.object({
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente invalido.'),
  /** Onde o perigo existe. Area OU funcao — ao menos um. */
  areaId: opcional(z.string().uuid('Area invalida.')),
  funcao: opcional(z.string().trim().max(80)),

  /* --- Identificacao do perigo -------------------------------------------- */
  tipo: z.enum(TIPOS_RISCO, { required_error: 'Informe o tipo de risco.' }),
  perigo: texto(3, 150, 'Perigo'),
  fonteGeradora: opcional(z.string().trim().max(200)),
  /** Atividade em que o perigo se manifesta. */
  atividade: opcional(z.string().trim().max(200)),
  danosPossiveis: texto(3, 500, 'Danos possiveis'),

  /* --- Avaliacao (mesma regua do IIR de campo) ---------------------------- */
  severidade: escala('a severidade'),
  probabilidade: escala('a probabilidade'),
  exposicao: escala('a exposicao'),
  frequencia: escala('a frequencia'),

  /* --- Controles ----------------------------------------------------------- */
  controlesExistentes: opcional(z.string().trim().max(1000)),
  /** Nivel mais eficaz ja aplicado — a hierarquia da NR-1. */
  nivelControleAtual: opcional(z.enum(NIVEIS_CONTROLE)),
  medidasPropostas: opcional(z.string().trim().max(1000)),
  planoAcaoId: opcional(z.string().uuid('Plano invalido.')),

  situacao: z.enum(SITUACOES_RISCO).default('IDENTIFICADO'),
  responsavel: opcional(z.string().trim().max(120)),
  /** Data da proxima reavaliacao — o PGR e documento vivo. */
  reavaliarEm: opcional(z.coerce.date()),
});

function validarRisco(
  dados: { areaId?: string | null; funcao?: string | null; situacao?: SituacaoRisco; controlesExistentes?: string | null },
  ctx: z.RefinementCtx,
): void {
  // Perigo sem contexto nao entra no PGR: nao da para dizer onde ele existe.
  if (!dados.areaId && !dados.funcao) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['areaId'],
      message: 'Informe a area ou a funcao em que o perigo existe.',
    });
  }

  // "Controlado" sem controle descrito e so uma afirmacao.
  if (dados.situacao === 'CONTROLADO' && !dados.controlesExistentes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['controlesExistentes'],
      message: 'Risco controlado exige a descricao das medidas de controle.',
    });
  }
}

export const riscoCreateSchema = riscoBaseSchema.superRefine(validarRisco);

/**
 * O update NAO carrega a validacao cruzada: num PUT parcial o payload nao tem
 * os campos que a regra precisa (area/funcao, controles). Quem valida o
 * estado final e `problemasDoRisco`, chamada no servico sobre o registro ja
 * mesclado — senao editar so a situacao falharia por falta de um campo que o
 * registro tem, mas o payload nao.
 */
export const riscoUpdateSchema = riscoBaseSchema.partial();

/** Problemas do risco no estado FINAL (registro + alteracoes). */
export function problemasDoRisco(estado: {
  areaId?: string | null;
  funcao?: string | null;
  situacao?: SituacaoRisco | string | null;
  controlesExistentes?: string | null;
}): Record<string, string[]> {
  const problemas: Record<string, string[]> = {};

  if (!estado.areaId && !estado.funcao) {
    problemas.areaId = ['Informe a area ou a funcao em que o perigo existe.'];
  }
  if (estado.situacao === 'CONTROLADO' && !estado.controlesExistentes) {
    problemas.controlesExistentes = ['Risco controlado exige a descricao das medidas de controle.'];
  }

  return problemas;
}

export type RiscoCreateData = z.output<typeof riscoCreateSchema>;

export const riscoFiltroSchema = z.object({
  clienteId: z.string().uuid('Cliente invalido.').optional(),
  areaId: z.string().uuid('Area invalida.').optional(),
  tipo: z.enum(TIPOS_RISCO).optional(),
  situacao: z.enum(SITUACOES_RISCO).optional(),
  /** Filtra pela faixa do IIR (BAIXO, MODERADO, ALTO, CRITICO). */
  faixa: z.string().trim().max(20).optional(),
  busca: z.string().trim().max(120).optional(),
});

export type RiscoFiltro = z.output<typeof riscoFiltroSchema>;

/* -------------------------------------------------------------------------- */
/* Avaliacao                                                                   */
/* -------------------------------------------------------------------------- */

export interface AvaliacaoRisco {
  iir: number;
  faixa: FaixaIir;
  grauRisco: ReturnType<typeof grauRiscoPeloIir>;
}

/** Avalia um risco do inventario com a mesma regua do IIR de campo. */
export function avaliarRisco(entrada: {
  severidade: number;
  probabilidade: number;
  exposicao: number;
  frequencia: number;
}): AvaliacaoRisco {
  const { valor, faixa } = calcularIir(entrada);
  return { iir: valor, faixa, grauRisco: grauRiscoPeloIir(valor) };
}
