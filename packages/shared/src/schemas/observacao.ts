import { z } from 'zod';
import { opcional, texto } from './comuns.js';
import { TIPOS_OBSERVACAO, definicaoDoTipo, type TipoObservacao } from '../indicadores/observacoes.js';
import { CLASSIFICACOES_BIRD_OCORRENCIA, FATOR_RISCO_MAX, FATOR_RISCO_MIN } from '../indicadores/risco.js';
import { isTokenQrValido } from './area.js';

/* -------------------------------------------------------------------------- */
/* Dominio                                                                     */
/* -------------------------------------------------------------------------- */

export const SITUACOES_OBSERVACAO = ['REGISTRADA', 'EM_TRATATIVA', 'CONCLUIDA', 'CANCELADA'] as const;
export type SituacaoObservacao = (typeof SITUACOES_OBSERVACAO)[number];

export const ROTULO_SITUACAO_OBSERVACAO: Record<SituacaoObservacao, string> = {
  REGISTRADA: 'Registrada',
  EM_TRATATIVA: 'Em tratativa',
  CONCLUIDA: 'Concluida',
  CANCELADA: 'Cancelada',
};

/** Tipos que representam desvio — exigem causa e avaliacao de risco. */
export const TIPOS_DESVIO: readonly TipoObservacao[] = [
  'COMPORTAMENTO_INSEGURO',
  'CONDICAO_INSEGURA',
  'NAO_CONFORMIDADE',
];

export function isDesvio(tipo: TipoObservacao): boolean {
  return TIPOS_DESVIO.includes(tipo);
}

/**
 * Tipos que exigem foto de evidencia.
 *
 * Condicao insegura e nao conformidade precisam de prova visual: a foto e o
 * que sustenta o plano de acao e a auditoria depois.
 */
export const TIPOS_COM_FOTO_OBRIGATORIA: readonly TipoObservacao[] = ['CONDICAO_INSEGURA', 'NAO_CONFORMIDADE'];

export function exigeFoto(tipo: TipoObservacao): boolean {
  return TIPOS_COM_FOTO_OBRIGATORIA.includes(tipo);
}

/* -------------------------------------------------------------------------- */
/* Catalogo de causas (base do Pareto)                                         */
/* -------------------------------------------------------------------------- */

/**
 * As causas sao catalogadas, e nao texto livre, porque o Pareto so faz sentido
 * se "Nao utilizacao de EPI" for sempre a mesma coisa. Cada causa vale para um
 * tipo de observacao.
 */
export const causaDesvioCreateSchema = z.object({
  codigo: z
    .string({ required_error: 'Codigo e obrigatorio.' })
    .trim()
    .min(1, 'Codigo e obrigatorio.')
    .max(20, 'Codigo deve ter no maximo 20 caracteres.')
    .transform((valor) => valor.toUpperCase().replace(/\s+/g, '-')),
  descricao: texto(3, 120, 'Descricao da causa'),
  tipo: z.enum(TIPOS_OBSERVACAO, {
    required_error: 'Informe a que tipo de observacao esta causa se aplica.',
    invalid_type_error: 'Tipo invalido.',
  }),
  /** Setor que costuma resolver — alimenta o roteamento da comunicacao. */
  destinatarioSugerido: opcional(z.string().trim().max(60)),
  ativa: z.boolean().default(true),
});

export const causaDesvioUpdateSchema = causaDesvioCreateSchema.partial();

export type CausaDesvioCreateData = z.output<typeof causaDesvioCreateSchema>;

/* -------------------------------------------------------------------------- */
/* Schema de escrita                                                           */
/* -------------------------------------------------------------------------- */

const fatorRisco = (campo: string) =>
  z.coerce
    .number({ invalid_type_error: `${campo} deve ser um numero de ${FATOR_RISCO_MIN} a ${FATOR_RISCO_MAX}.` })
    .int()
    .min(FATOR_RISCO_MIN, `${campo} deve estar entre ${FATOR_RISCO_MIN} e ${FATOR_RISCO_MAX}.`)
    .max(FATOR_RISCO_MAX, `${campo} deve estar entre ${FATOR_RISCO_MIN} e ${FATOR_RISCO_MAX}.`);

/**
 * Etapa 6 — Registro de Observacoes (BBS).
 *
 * E o evento que alimenta todos os indicadores: ICS, ICI, distribuicao,
 * Pareto, tendencia, mapa de calor, Piramide de Bird e o pilar BBS do Indice
 * Global. Tambem e o gatilho da matriz de comunicacao.
 *
 * O `clienteId` nao vem do formulario — e derivado da area pelo servidor.
 */
const observacaoBaseSchema = z.object({
  /* --- Onde ---------------------------------------------------------------- */
  /** Area lida pelo QR Code. Pode vir por id ou pelo token do QR. */
  areaId: opcional(z.string().uuid('Area invalida.')),
  tokenQr: opcional(z.string().trim().toUpperCase().refine(isTokenQrValido, 'Token de QR Code invalido.')),
  /** Terceiro envolvido, quando o desvio e de uma contratada. */
  terceiroId: opcional(z.string().uuid('Terceiro invalido.')),

  /* --- Quando -------------------------------------------------------------- */
  dataHora: z.coerce
    .date({ invalid_type_error: 'Data e hora da observacao invalidas.' })
    .refine((data) => data.getTime() <= Date.now() + 60_000, 'A observacao nao pode ser registrada no futuro.')
    .default(() => new Date()),

  /* --- Classificacao -------------------------------------------------------- */
  tipo: z.enum(TIPOS_OBSERVACAO, {
    required_error: 'Escolha o tipo da observacao.',
    invalid_type_error: 'Tipo de observacao invalido.',
  }),
  /** Causa catalogada — obrigatoria nos desvios, para o Pareto fazer sentido. */
  causaId: opcional(z.string().uuid('Causa invalida.')),
  descricao: texto(10, 1000, 'Descricao'),
  observador: texto(3, 120, 'Nome do observador'),

  /* --- Avaliacao de risco (desvios) ---------------------------------------- */
  severidade: opcional(fatorRisco('Severidade')),
  probabilidade: opcional(fatorRisco('Probabilidade')),
  exposicao: opcional(fatorRisco('Exposicao')),
  frequencia: opcional(fatorRisco('Frequencia')),
  /** Classificacao da Piramide de Bird, quando a observacao virou ocorrencia. */
  classificacaoBird: opcional(z.enum(CLASSIFICACOES_BIRD_OCORRENCIA)),

  /* --- Evidencias ----------------------------------------------------------- */
  fotoUrl: opcional(z.string().trim().max(300)),
  assinaturaUrl: opcional(z.string().trim().max(300)),
  latitude: opcional(z.coerce.number().min(-90, 'Latitude invalida.').max(90, 'Latitude invalida.')),
  longitude: opcional(z.coerce.number().min(-180, 'Longitude invalida.').max(180, 'Longitude invalida.')),

  /* --- Tratativa ------------------------------------------------------------ */
  /** O que foi feito na hora, antes de abrir plano de acao. */
  acaoImediata: opcional(z.string().trim().max(500)),
  situacao: z.enum(SITUACOES_OBSERVACAO).default('REGISTRADA'),
  observacoes: opcional(z.string().trim().max(1000)),
});

const FATORES_RISCO = ['severidade', 'probabilidade', 'exposicao', 'frequencia'] as const;

type DadosObservacao = {
  areaId?: string | null;
  tokenQr?: string | null;
  tipo?: TipoObservacao;
  causaId?: string | null;
  fotoUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  severidade?: number | null;
  probabilidade?: number | null;
  exposicao?: number | null;
  frequencia?: number | null;
};

/**
 * Regras que dependem do tipo escolhido. Ficam aqui, e nao no formulario, para
 * valerem tambem no aplicativo de campo e em qualquer integracao.
 */
function validarObservacao(dados: DadosObservacao, ctx: z.RefinementCtx, exigirArea = true): void {
  if (exigirArea && !dados.areaId && !dados.tokenQr) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['areaId'],
      message: 'Informe a area (ou leia o QR Code).',
    });
  }

  const tipo = dados.tipo;
  if (!tipo) return;

  if (isDesvio(tipo)) {
    if (!dados.causaId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['causaId'],
        message: 'Escolha a causa do desvio — e ela que monta o Pareto.',
      });
    }

    // Avaliacao de risco: ou os quatro fatores, ou nenhum.
    const informados = FATORES_RISCO.filter((fator) => dados[fator] !== null && dados[fator] !== undefined);
    if (informados.length > 0 && informados.length < FATORES_RISCO.length) {
      for (const fator of FATORES_RISCO) {
        if (dados[fator] === null || dados[fator] === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [fator],
            message: 'Preencha os quatro fatores de risco ou deixe todos em branco.',
          });
        }
      }
    }
  }

  if (exigeFoto(tipo) && !dados.fotoUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fotoUrl'],
      message: `Foto de evidencia e obrigatoria para ${definicaoDoTipo(tipo).rotulo.toLowerCase()}.`,
    });
  }

  const temLatitude = dados.latitude !== null && dados.latitude !== undefined;
  const temLongitude = dados.longitude !== null && dados.longitude !== undefined;
  if (temLatitude !== temLongitude) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [temLatitude ? 'longitude' : 'latitude'],
      message: 'Informe latitude e longitude juntas, ou deixe as duas em branco.',
    });
  }
}

export const observacaoCreateSchema = observacaoBaseSchema.superRefine((dados, ctx) =>
  validarObservacao(dados, ctx, true),
);

export const observacaoUpdateSchema = observacaoBaseSchema
  .partial()
  .superRefine((dados, ctx) => validarObservacao(dados, ctx, false));

export type ObservacaoCreateInput = z.input<typeof observacaoCreateSchema>;
export type ObservacaoCreateData = z.output<typeof observacaoCreateSchema>;
export type ObservacaoUpdateInput = z.input<typeof observacaoUpdateSchema>;

/* -------------------------------------------------------------------------- */
/* Filtros                                                                     */
/* -------------------------------------------------------------------------- */

export const ORDENACOES_OBSERVACAO = ['dataHora', 'tipo', 'iir', 'situacao'] as const;
export type OrdenacaoObservacao = (typeof ORDENACOES_OBSERVACAO)[number];

/** Filtros compartilhados pela listagem e pelo painel de indicadores. */
export const observacaoFiltroBaseSchema = z.object({
  busca: z.string().trim().max(120).optional(),
  clienteId: z.string().uuid('Cliente invalido.').optional(),
  centroNegocioId: z.string().uuid('Centro de negocio invalido.').optional(),
  areaId: z.string().uuid('Area invalida.').optional(),
  terceiroId: z.string().uuid('Terceiro invalido.').optional(),
  tipo: z.enum(TIPOS_OBSERVACAO).optional(),
  situacao: z.enum(SITUACOES_OBSERVACAO).optional(),
  /** Recorte do periodo — base da tendencia e dos comparativos. */
  de: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
});

export const observacaoFiltroSchema = observacaoFiltroBaseSchema.extend({
  ordenarPor: z.enum(ORDENACOES_OBSERVACAO).default('dataHora'),
  direcao: z.enum(['asc', 'desc']).default('desc'),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(20),
});

export type ObservacaoFiltro = z.output<typeof observacaoFiltroSchema>;
export type ObservacaoFiltroBase = z.output<typeof observacaoFiltroBaseSchema>;

/** Quantos meses a tendencia mensal cobre por padrao. */
export const MESES_TENDENCIA_PADRAO = 6;

export const indicadoresFiltroSchema = observacaoFiltroBaseSchema.extend({
  meses: z.coerce.number().int().min(1).max(24).default(MESES_TENDENCIA_PADRAO),
  /** Quantas causas aparecem em cada Pareto. */
  topCausas: z.coerce.number().int().min(3).max(20).default(8),
});

export type IndicadoresFiltro = z.output<typeof indicadoresFiltroSchema>;

/* -------------------------------------------------------------------------- */
/* Formulario                                                                  */
/* -------------------------------------------------------------------------- */

export type ObservacaoFormValues = {
  [Campo in keyof ObservacaoCreateData]-?: string;
};
