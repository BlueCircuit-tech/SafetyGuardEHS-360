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

export const CATEGORIAS_EPI_SUGERIDAS = [
  'Protecao da cabeca',
  'Protecao dos olhos e face',
  'Protecao auditiva',
  'Protecao respiratoria',
  'Protecao do tronco',
  'Protecao dos membros superiores',
  'Protecao dos membros inferiores',
  'Protecao contra quedas',
  'Protecao do corpo inteiro',
] as const;

export const TIPOS_ANEXO_EPI = ['LAUDO', 'CA', 'FICHA_TECNICA', 'NOTA_FISCAL', 'OUTRO'] as const;
export type TipoAnexoEpi = (typeof TIPOS_ANEXO_EPI)[number];

export const ROTULO_TIPO_ANEXO_EPI: Record<TipoAnexoEpi, string> = {
  LAUDO: 'Laudo de ensaio',
  CA: 'Certificado de Aprovacao (CA)',
  FICHA_TECNICA: 'Ficha tecnica',
  NOTA_FISCAL: 'Nota fiscal',
  OUTRO: 'Outro',
};

/** Percentual do estoque de referencia que define o ponto de reposicao quando nao ha minimo informado. */
export const PERCENTUAL_REPOSICAO_PADRAO = 0.1;

/** Ponto de reposicao efetivo: o minimo informado ou 10% do estoque de referencia. */
export function pontoDeReposicao(epi: { estoqueMinimo: number; estoqueReferencia?: number | null }): number {
  if (epi.estoqueMinimo > 0) return epi.estoqueMinimo;
  if (epi.estoqueReferencia && epi.estoqueReferencia > 0) return Math.ceil(epi.estoqueReferencia * PERCENTUAL_REPOSICAO_PADRAO);
  return 0;
}

/** Link oficial de consulta do CA no MTE (abre em nova aba). */
export function urlConsultaCa(ca: string): string {
  return `https://consultaca.com/${encodeURIComponent(ca.trim())}`;
}

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
  /** Estoque "cheio" (lote de compra): base do ponto de reposicao de 10%. */
  estoqueReferencia: opcional(z.coerce.number().int().min(1).max(1000000)),
  categoria: opcional(z.string().trim().max(60)),
  ativo: z.boolean().default(true),
});

export const anexoEpiCreateSchema = z.object({
  titulo: texto(2, 120, 'Titulo do anexo'),
  tipo: z.enum(TIPOS_ANEXO_EPI).default('OUTRO'),
});

export const entradaEpiCreateSchema = z.object({
  epiId: z.string({ required_error: 'Informe o EPI.' }).uuid('EPI invalido.'),
  data: dataNaoFutura('Data da entrada'),
  quantidade: z.coerce.number().int().min(1, 'Ao menos 1 unidade.').max(100000),
  custoUnitario: opcional(z.coerce.number().min(0).max(100000)),
  notaFiscal: opcional(z.string().trim().max(40)),
  fornecedor: opcional(z.string().trim().max(120)),
  observacoes: opcional(z.string().trim().max(300)),
});
export type EntradaEpiCreateData = z.output<typeof entradaEpiCreateSchema>;

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
