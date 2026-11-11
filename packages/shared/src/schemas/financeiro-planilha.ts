import { z } from 'zod';
import { dataObrigatoria, dataOpcional, opcional, texto } from './comuns.js';

/* -------------------------------------------------------------------------- */
/* Dominio                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Etapa 24 — Planilha financeira (controle de receitas e despesas).
 *
 * Substitui a planilha de Excel que a operacao mantinha a mao: cada linha e um
 * lancamento (receita ou despesa) com data, categoria, situacao e, quando faz
 * sentido, o cliente que pagou ou o fornecedor que recebeu. O Excel continua
 * existindo — agora e gerado a partir daqui.
 */
export const TIPOS_LANCAMENTO = ['RECEITA', 'DESPESA'] as const;
export type TipoLancamento = (typeof TIPOS_LANCAMENTO)[number];

export const ROTULO_TIPO_LANCAMENTO: Record<TipoLancamento, string> = {
  RECEITA: 'Receita',
  DESPESA: 'Despesa',
};

export const SITUACOES_LANCAMENTO = ['PENDENTE', 'PAGO', 'CANCELADO'] as const;
export type SituacaoLancamento = (typeof SITUACOES_LANCAMENTO)[number];

export const ROTULO_SITUACAO_LANCAMENTO: Record<SituacaoLancamento, string> = {
  PENDENTE: 'Pendente',
  PAGO: 'Pago',
  CANCELADO: 'Cancelado',
};

/** Categorias sugeridas no formulario, por tipo — o usuario pode digitar outra. */
export const CATEGORIAS_LANCAMENTO_SUGERIDAS: Record<TipoLancamento, readonly string[]> = {
  RECEITA: ['Contrato mensal', 'Servico avulso', 'Treinamento', 'Laudo'],
  DESPESA: ['Salarios', 'EPI', 'Deslocamento', 'Exames', 'Software', 'Impostos', 'Outro'],
};

/** Valor maximo aceito pela coluna Decimal(12,2). */
export const VALOR_MAXIMO_LANCAMENTO = 9_999_999_999.99;

/* -------------------------------------------------------------------------- */
/* Schemas de escrita                                                          */
/* -------------------------------------------------------------------------- */

const lancamentoBaseSchema = z.object({
  clienteId: opcional(z.string().uuid('Cliente invalido.')),
  fornecedorId: opcional(z.string().uuid('Fornecedor invalido.')),
  tipo: z.enum(TIPOS_LANCAMENTO, {
    required_error: 'Informe se e receita ou despesa.',
    invalid_type_error: 'Tipo de lancamento invalido.',
  }),
  categoria: texto(2, 80, 'Categoria'),
  descricao: texto(2, 200, 'Descricao'),
  valor: z.coerce
    .number({ required_error: 'Valor e obrigatorio.', invalid_type_error: 'Valor invalido.' })
    .positive('Valor deve ser maior que zero.')
    .max(VALOR_MAXIMO_LANCAMENTO, 'Valor acima do limite da planilha.'),
  data: dataObrigatoria('Data'),
  vencimento: dataOpcional('Vencimento'),
  situacao: z.enum(SITUACOES_LANCAMENTO).default('PENDENTE'),
  notaFiscal: opcional(z.string().trim().max(40, 'Nota fiscal deve ter no maximo 40 caracteres.')),
  observacoes: opcional(z.string().trim().max(500, 'Observacoes devem ter no maximo 500 caracteres.')),
});

export const lancamentoCreateSchema = lancamentoBaseSchema;
export const lancamentoUpdateSchema = lancamentoBaseSchema.partial();

export type LancamentoCreateInput = z.input<typeof lancamentoCreateSchema>;
export type LancamentoCreateData = z.output<typeof lancamentoCreateSchema>;
export type LancamentoUpdateInput = z.input<typeof lancamentoUpdateSchema>;
export type LancamentoUpdateData = z.output<typeof lancamentoUpdateSchema>;

/* -------------------------------------------------------------------------- */
/* Filtros                                                                     */
/* -------------------------------------------------------------------------- */

export const lancamentoFiltroSchema = z.object({
  clienteId: z.string().uuid('Cliente invalido.').optional(),
  fornecedorId: z.string().uuid('Fornecedor invalido.').optional(),
  tipo: z.enum(TIPOS_LANCAMENTO).optional(),
  situacao: z.enum(SITUACOES_LANCAMENTO).optional(),
  /** Ano de referencia (atalho para `de`/`ate`). */
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  de: dataOpcional('Data inicial').optional(),
  ate: dataOpcional('Data final').optional(),
  /** Busca por descricao, categoria ou nota fiscal. */
  busca: z.string().trim().max(120).optional(),
});

export type LancamentoFiltro = z.output<typeof lancamentoFiltroSchema>;

export const resumoFinanceiroFiltroSchema = z.object({
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  clienteId: z.string().uuid('Cliente invalido.').optional(),
});

/* -------------------------------------------------------------------------- */
/* Regras puras                                                                */
/* -------------------------------------------------------------------------- */

/** Um lancamento pendente cujo vencimento ja passou. */
export function lancamentoVencido(
  lancamento: { situacao: SituacaoLancamento; vencimento: Date | string | null | undefined },
  hoje: Date = new Date(),
): boolean {
  if (lancamento.situacao !== 'PENDENTE' || !lancamento.vencimento) return false;
  const vencimento = new Date(lancamento.vencimento);
  const limite = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  return vencimento.getTime() < limite.getTime();
}

/** Formulario da tela — tudo string. */
export type LancamentoFormValues = { [Campo in keyof LancamentoCreateData]-?: string };
