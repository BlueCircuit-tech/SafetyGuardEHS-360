import { z } from 'zod';
import { dataNaoFutura, dataObrigatoria, opcional, texto } from './comuns.js';

/**
 * Etapa 14 — Gestao de EPI e Estoque.
 *
 * Duas pecas: o **catalogo** (EPI com CA, validade do CA, estoque e minimo) e
 * a **entrega** ao colaborador (ficha NR-06). A entrega da baixa no estoque;
 * o painel acusa CA vencido e item abaixo do minimo.
 */

export const MOTIVOS_ENTREGA_EPI = ['PRIMEIRA_ENTREGA', 'SUBSTITUICAO', 'PERDA', 'DANIFICADO'] as const;
export type MotivoEntregaEpi = (typeof MOTIVOS_ENTREGA_EPI)[number];

export const ROTULO_MOTIVO_ENTREGA: Record<MotivoEntregaEpi, string> = {
  PRIMEIRA_ENTREGA: 'Primeira entrega',
  SUBSTITUICAO: 'Substituicao periodica',
  PERDA: 'Perda',
  DANIFICADO: 'Danificado',
};

const epiBaseSchema = z.object({
  nome: texto(3, 120, 'Nome do EPI'),
  /** Certificado de Aprovacao — obrigatorio para EPI de verdade (NR-06). */
  ca: texto(2, 20, 'CA'),
  validadeCa: opcional(dataObrigatoria('Validade do CA')),
  fornecedor: opcional(z.string().trim().max(120)),
  custoUnitario: opcional(z.coerce.number().min(0).max(100000)),
  /** Troca periodica em meses (vida util). Vazio = troca por desgaste. */
  vidaUtilMeses: opcional(z.coerce.number().int().min(1).max(120)),
  estoqueAtual: z.coerce.number({ required_error: 'Informe o estoque.' }).int().min(0).default(0),
  estoqueMinimo: z.coerce.number().int().min(0).default(0),
  ativo: z.boolean().default(true),
});

export const epiCreateSchema = epiBaseSchema;
export const epiUpdateSchema = epiBaseSchema.partial();

export type EpiCreateInput = z.input<typeof epiCreateSchema>;
export type EpiCreateData = z.output<typeof epiCreateSchema>;

export const entregaEpiCreateSchema = z.object({
  epiId: z.string({ required_error: 'Informe o EPI.' }).uuid('EPI invalido.'),
  colaboradorId: z.string({ required_error: 'Informe o colaborador.' }).uuid('Colaborador invalido.'),
  data: dataNaoFutura('Data da entrega'),
  quantidade: z.coerce.number().int().min(1, 'Ao menos 1 unidade.').max(100).default(1),
  motivo: z.enum(MOTIVOS_ENTREGA_EPI).default('PRIMEIRA_ENTREGA'),
  observacoes: opcional(z.string().trim().max(500)),
});

export type EntregaEpiCreateData = z.output<typeof entregaEpiCreateSchema>;
