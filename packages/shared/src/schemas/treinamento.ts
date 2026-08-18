import { z } from 'zod';
import { dataNaoFutura, dataObrigatoria, opcional, texto } from './comuns.js';

/* -------------------------------------------------------------------------- */
/* Dominio                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Etapa 11 — Treinamentos e Matriz de Capacitacao.
 *
 * Tres pecas, na ordem em que dependem umas das outras:
 *
 * 1. **Catalogo**: quais treinamentos existem (NR-10, NR-35...), carga horaria
 *    e prazo de reciclagem;
 * 2. **Matriz de capacitacao**: quais funcoes exigem quais treinamentos —
 *    "Eletricista de manutencao" exige NR-10 em qualquer contrato;
 * 3. **Realizacoes**: quem fez o que, quando, e ate quando vale.
 *
 * O status por colaborador x requisito (OK / A vencer / Vencido / Sem
 * treinamento) sai do cruzamento das tres — e a media de requisitos em dia e
 * a nota do pilar TREINAMENTOS do ICSG, do Indice Global e da Maturidade.
 */

export const SITUACOES_CAPACITACAO = ['OK', 'A_VENCER', 'VENCIDO', 'SEM_TREINAMENTO'] as const;
export type SituacaoCapacitacao = (typeof SITUACOES_CAPACITACAO)[number];

export const ROTULO_SITUACAO_CAPACITACAO: Record<SituacaoCapacitacao, string> = {
  OK: 'Em dia',
  A_VENCER: 'A vencer',
  VENCIDO: 'Vencido',
  SEM_TREINAMENTO: 'Sem treinamento',
};

/** Normas mais comuns — atalho do formulario; o campo e livre. */
export const NORMAS_SUGERIDAS = [
  'NR-05',
  'NR-06',
  'NR-10',
  'NR-11',
  'NR-12',
  'NR-13',
  'NR-17',
  'NR-18',
  'NR-33',
  'NR-34',
  'NR-35',
  'Brigada de emergencia',
  'LOTO',
  'Integracao',
] as const;

/* -------------------------------------------------------------------------- */
/* Catalogo de treinamentos                                                    */
/* -------------------------------------------------------------------------- */

const treinamentoBaseSchema = z.object({
  nome: texto(3, 120, 'Nome do treinamento'),
  /** Norma ou origem da exigencia (NR-10, LOTO, Integracao...). */
  norma: opcional(z.string().trim().max(40)),
  descricao: opcional(z.string().trim().max(500)),
  cargaHorariaHoras: z.coerce
    .number()
    .min(1, 'Carga horaria deve ser de ao menos 1 hora.')
    .max(400, 'Carga horaria deve ser de no maximo 400 horas.'),
  /**
   * Prazo de reciclagem em meses. Vazio = sem reciclagem obrigatoria
   * (ex.: integracao unica). O formulario sugere a validade a partir daqui.
   */
  validadeMeses: opcional(
    z.coerce
      .number()
      .int('Validade deve ser um numero inteiro de meses.')
      .min(1, 'Validade minima de 1 mes.')
      .max(120, 'Validade maxima de 120 meses.'),
  ),
  ativo: z.boolean().default(true),
});

export const treinamentoCreateSchema = treinamentoBaseSchema;
export const treinamentoUpdateSchema = treinamentoBaseSchema.partial();

export type TreinamentoCreateInput = z.input<typeof treinamentoCreateSchema>;
export type TreinamentoCreateData = z.output<typeof treinamentoCreateSchema>;

/* -------------------------------------------------------------------------- */
/* Matriz: requisito por funcao                                                */
/* -------------------------------------------------------------------------- */

/**
 * A matriz cruza a FUNCAO (o mesmo texto do cadastro do colaborador) com o
 * treinamento exigido. E global da consultoria: um eletricista precisa de
 * NR-10 em qualquer contrato.
 */
export const requisitoCreateSchema = z.object({
  funcao: texto(2, 80, 'Funcao'),
  treinamentoId: z.string({ required_error: 'Informe o treinamento.' }).uuid('Treinamento invalido.'),
});

export type RequisitoCreateData = z.output<typeof requisitoCreateSchema>;

/* -------------------------------------------------------------------------- */
/* Realizacao                                                                  */
/* -------------------------------------------------------------------------- */

const realizacaoBaseSchema = z.object({
  colaboradorId: z.string({ required_error: 'Informe o colaborador.' }).uuid('Colaborador invalido.'),
  treinamentoId: z.string({ required_error: 'Informe o treinamento.' }).uuid('Treinamento invalido.'),
  dataRealizacao: dataNaoFutura('Data de realizacao'),
  /** Vazio = calculada pela reciclagem do catalogo. */
  validade: opcional(dataObrigatoria('Validade')),
  instrutor: opcional(z.string().trim().max(120)),
  /** Carga horaria efetiva, quando diferente da do catalogo. */
  cargaHorariaHoras: opcional(z.coerce.number().min(1).max(400)),
  observacoes: opcional(z.string().trim().max(500)),
});

function validarRealizacao(
  dados: { dataRealizacao?: Date; validade?: Date | null },
  ctx: z.RefinementCtx,
): void {
  if (dados.validade && dados.dataRealizacao && dados.validade <= dados.dataRealizacao) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['validade'],
      message: 'Validade deve ser posterior a realizacao.',
    });
  }
}

export const realizacaoCreateSchema = realizacaoBaseSchema.superRefine(validarRealizacao);
export const realizacaoUpdateSchema = realizacaoBaseSchema.partial().superRefine(validarRealizacao);

export type RealizacaoCreateInput = z.input<typeof realizacaoCreateSchema>;
export type RealizacaoCreateData = z.output<typeof realizacaoCreateSchema>;

/* -------------------------------------------------------------------------- */
/* Filtros                                                                     */
/* -------------------------------------------------------------------------- */

export const matrizFiltroSchema = z.object({
  clienteId: z.string().uuid('Cliente invalido.').optional(),
  terceiroId: z.string().uuid('Empresa contratada invalida.').optional(),
  funcao: z.string().trim().max(80).optional(),
  situacao: z.enum(SITUACOES_CAPACITACAO).optional(),
  /** Busca por colaborador ou treinamento. */
  busca: z.string().trim().max(120).optional(),
});

export type MatrizFiltro = z.output<typeof matrizFiltroSchema>;

/* -------------------------------------------------------------------------- */
/* Catalogo sugerido (seed)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Validades e cargas da pratica de mercado — sao SUGESTAO editavel no
 * catalogo, nao imposicao: a NR muda e o contrato pode exigir prazo menor.
 */
export const CATALOGO_TREINAMENTOS_SUGERIDO = [
  { nome: 'NR-10 — Seguranca em Instalacoes Eletricas (Basico)', norma: 'NR-10', cargaHorariaHoras: 40, validadeMeses: 24 },
  { nome: 'NR-10 — SEP (Sistema Eletrico de Potencia)', norma: 'NR-10', cargaHorariaHoras: 40, validadeMeses: 24 },
  { nome: 'NR-35 — Trabalho em Altura', norma: 'NR-35', cargaHorariaHoras: 8, validadeMeses: 24 },
  { nome: 'NR-33 — Espaco Confinado (Trabalhador Autorizado)', norma: 'NR-33', cargaHorariaHoras: 16, validadeMeses: 12 },
  { nome: 'NR-11 — Operacao de Empilhadeira', norma: 'NR-11', cargaHorariaHoras: 16, validadeMeses: 36 },
  { nome: 'NR-12 — Seguranca em Maquinas e Equipamentos', norma: 'NR-12', cargaHorariaHoras: 8, validadeMeses: 24 },
  { nome: 'NR-34 — Trabalho a Quente', norma: 'NR-34', cargaHorariaHoras: 8, validadeMeses: 12 },
  { nome: 'NR-05 — CIPA', norma: 'NR-05', cargaHorariaHoras: 20, validadeMeses: 12 },
  { nome: 'Brigada de Emergencia', norma: 'Brigada de emergencia', cargaHorariaHoras: 16, validadeMeses: 12 },
  { nome: 'LOTO — Bloqueio e Etiquetagem', norma: 'LOTO', cargaHorariaHoras: 8, validadeMeses: 12 },
  { nome: 'Integracao de Seguranca', norma: 'Integracao', cargaHorariaHoras: 4, validadeMeses: 12 },
] as const;
