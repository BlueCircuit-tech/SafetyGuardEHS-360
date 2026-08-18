import { z } from 'zod';
import { calcularValidade } from '../indicadores/conformidade.js';
import { PERIODICIDADE_ASO_MESES, type GrauRiscoFuncao } from './colaborador.js';
import { dataNaoFutura, dataObrigatoria, opcional, texto } from './comuns.js';

/* -------------------------------------------------------------------------- */
/* Dominio                                                                     */
/* -------------------------------------------------------------------------- */

/** Tipos de exame previstos na NR-7 (PCMSO). */
export const TIPOS_ASO = [
  'ADMISSIONAL',
  'PERIODICO',
  'RETORNO_AO_TRABALHO',
  'MUDANCA_DE_RISCO',
  'DEMISSIONAL',
] as const;
export type TipoAso = (typeof TIPOS_ASO)[number];

export const ROTULO_TIPO_ASO: Record<TipoAso, string> = {
  ADMISSIONAL: 'Admissional',
  PERIODICO: 'Periodico',
  RETORNO_AO_TRABALHO: 'Retorno ao trabalho',
  MUDANCA_DE_RISCO: 'Mudanca de risco / funcao',
  DEMISSIONAL: 'Demissional',
};

/**
 * O demissional encerra o vinculo: nao gera proxima validade, porque nao ha
 * proximo periodico a cobrar.
 */
export const TIPOS_ASO_SEM_VALIDADE: readonly TipoAso[] = ['DEMISSIONAL'];

export const RESULTADOS_ASO = ['APTO', 'APTO_COM_RESTRICAO', 'INAPTO'] as const;
export type ResultadoAso = (typeof RESULTADOS_ASO)[number];

export const ROTULO_RESULTADO_ASO: Record<ResultadoAso, string> = {
  APTO: 'Apto',
  APTO_COM_RESTRICAO: 'Apto com restricao',
  INAPTO: 'Inapto',
};

/** Exames complementares mais comuns — a lista e atalho, o campo e livre. */
export const EXAMES_COMPLEMENTARES_SUGERIDOS = [
  'Audiometria',
  'Espirometria',
  'Acuidade visual',
  'Hemograma completo',
  'Glicemia de jejum',
  'Eletrocardiograma',
  'Eletroencefalograma',
  'Raio-X de torax',
  'Avaliacao psicossocial',
  'Teste de esforco',
] as const;

/**
 * Validade sugerida do ASO a partir do grau de risco da funcao (NR-7/NR-4).
 * O usuario pode ajustar — a lei traz excecoes por idade e por agente.
 */
export function validadeSugeridaDoAso(dataExame: Date, grauRisco: GrauRiscoFuncao, tipo: TipoAso): Date | null {
  if (TIPOS_ASO_SEM_VALIDADE.includes(tipo)) return null;
  return calcularValidade(dataExame, PERIODICIDADE_ASO_MESES[grauRisco]);
}

/* -------------------------------------------------------------------------- */
/* Schema de escrita                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Etapa 9 — ASO (Atestado de Saude Ocupacional).
 *
 * O que importa para a operacao e simples: **quem esta apto e ate quando**.
 * O resto do cadastro existe para sustentar a resposta numa fiscalizacao.
 */
const asoBaseSchema = z.object({
  colaboradorId: z.string({ required_error: 'Informe o colaborador.' }).uuid('Colaborador invalido.'),

  tipo: z.enum(TIPOS_ASO, {
    required_error: 'Informe o tipo de exame.',
    invalid_type_error: 'Tipo de exame invalido.',
  }),
  dataExame: dataNaoFutura('Data do exame'),
  /** Vazio = calculada pela periodicidade do grau de risco. */
  validade: opcional(dataObrigatoria('Validade')),

  resultado: z.enum(RESULTADOS_ASO, {
    required_error: 'Informe o resultado do exame.',
    invalid_type_error: 'Resultado invalido.',
  }),
  /** Obrigatorio quando ha restricao ou inaptidao. */
  restricoes: opcional(z.string().trim().max(500)),

  /* --- Medico examinador --------------------------------------------------- */
  medicoNome: texto(3, 120, 'Nome do medico'),
  medicoCrm: z
    .string({ required_error: 'CRM e obrigatorio.' })
    .trim()
    .min(4, 'CRM e obrigatorio.')
    .max(20, 'CRM deve ter no maximo 20 caracteres.')
    .transform((valor) => valor.toUpperCase()),
  /** Medico coordenador do PCMSO, quando diferente do examinador. */
  medicoCoordenador: opcional(z.string().trim().max(120)),

  /* --- Conteudo ------------------------------------------------------------ */
  /** Riscos avaliados, separados por ponto e virgula. */
  riscosAvaliados: opcional(z.string().trim().max(300)),
  /** Exames complementares realizados, separados por ponto e virgula. */
  examesComplementares: opcional(z.string().trim().max(500)),
  observacoes: opcional(z.string().trim().max(1000)),
});

function validarAso(
  dados: { tipo?: TipoAso; dataExame?: Date; validade?: Date | null; resultado?: ResultadoAso; restricoes?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (dados.validade && dados.dataExame && dados.validade <= dados.dataExame) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['validade'],
      message: 'Validade deve ser posterior a data do exame.',
    });
  }

  if (dados.tipo && TIPOS_ASO_SEM_VALIDADE.includes(dados.tipo) && dados.validade) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['validade'],
      message: 'Exame demissional nao tem validade.',
    });
  }

  // Restricao sem descricao nao serve para nada em campo: o supervisor precisa
  // saber o que o colaborador nao pode fazer.
  if ((dados.resultado === 'APTO_COM_RESTRICAO' || dados.resultado === 'INAPTO') && !dados.restricoes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['restricoes'],
      message: 'Descreva a restricao ou o motivo da inaptidao.',
    });
  }
}

export const asoCreateSchema = asoBaseSchema.superRefine(validarAso);
export const asoUpdateSchema = asoBaseSchema.partial().superRefine(validarAso);

export type AsoCreateInput = z.input<typeof asoCreateSchema>;
export type AsoCreateData = z.output<typeof asoCreateSchema>;
export type AsoUpdateInput = z.input<typeof asoUpdateSchema>;

/* -------------------------------------------------------------------------- */
/* Filtros da listagem                                                         */
/* -------------------------------------------------------------------------- */

export const ORDENACOES_ASO = ['dataExame', 'validade', 'criadoEm'] as const;
export type OrdenacaoAso = (typeof ORDENACOES_ASO)[number];

export const asoFiltroSchema = z.object({
  /** Busca por colaborador, CPF, medico ou CRM. */
  busca: z.string().trim().max(120).optional(),
  clienteId: z.string().uuid('Cliente invalido.').optional(),
  terceiroId: z.string().uuid('Empresa contratada invalida.').optional(),
  colaboradorId: z.string().uuid('Colaborador invalido.').optional(),
  tipo: z.enum(TIPOS_ASO).optional(),
  resultado: z.enum(RESULTADOS_ASO).optional(),
  situacao: z.enum(['VIGENTE', 'A_VENCER', 'VENCIDO', 'SEM_VALIDADE']).optional(),
  /** Somente o ASO mais recente de cada colaborador. */
  somenteVigentes: z.coerce.boolean().optional(),
  ordenarPor: z.enum(ORDENACOES_ASO).default('dataExame'),
  direcao: z.enum(['asc', 'desc']).default('desc'),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(20),
});

export type AsoFiltro = z.output<typeof asoFiltroSchema>;

export type AsoFormValues = { [Campo in keyof AsoCreateData]-?: string };
