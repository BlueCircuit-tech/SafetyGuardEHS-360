import { z } from 'zod';
import { dataNaoFutura, opcional, texto } from './comuns.js';

/**
 * Etapa 15 — Gestao de Consequencias.
 *
 * Formato da planilha real da operacao ("Controle Gestao Consequencias"):
 * comportamento de risco -> envolvido -> lider -> medida aplicada -> motivacao.
 * O objetivo nao e punir, e medir reincidencia e coerencia das medidas — por
 * isso o vinculo com o colaborador cadastrado e a contagem de reincidencia
 * sao automaticos.
 */

/** Escala progressiva usual de medidas disciplinares. */
export const MEDIDAS_DISCIPLINARES = [
  'ORIENTACAO_VERBAL',
  'ADVERTENCIA_ESCRITA',
  'SUSPENSAO',
  'DESLIGAMENTO',
  'RECICLAGEM_TREINAMENTO',
] as const;
export type MedidaDisciplinar = (typeof MEDIDAS_DISCIPLINARES)[number];

export const ROTULO_MEDIDA: Record<MedidaDisciplinar, string> = {
  ORIENTACAO_VERBAL: 'Orientacao verbal',
  ADVERTENCIA_ESCRITA: 'Advertencia escrita',
  SUSPENSAO: 'Suspensao',
  DESLIGAMENTO: 'Desligamento',
  RECICLAGEM_TREINAMENTO: 'Reciclagem / treinamento',
};

/** Quem motivou a aplicacao — coluna da planilha original. */
export const MOTIVACOES_CONSEQUENCIA = ['CLIENTE', 'INTERNA', 'AUDITORIA', 'REINCIDENCIA'] as const;
export type MotivacaoConsequencia = (typeof MOTIVACOES_CONSEQUENCIA)[number];

export const ROTULO_MOTIVACAO: Record<MotivacaoConsequencia, string> = {
  CLIENTE: 'Solicitada pelo cliente',
  INTERNA: 'Decisao interna',
  AUDITORIA: 'Resultado de auditoria',
  REINCIDENCIA: 'Reincidencia de comportamento',
};

const consequenciaBaseSchema = z.object({
  colaboradorId: z.string({ required_error: 'Informe o colaborador envolvido.' }).uuid('Colaborador invalido.'),
  /** Lider direto do envolvido no momento do fato. */
  liderNome: texto(3, 120, 'Nome do lider'),
  data: dataNaoFutura('Data do fato'),
  /** Comportamento de risco que motivou (regra de ouro, LOTO, EPI...). */
  comportamento: texto(3, 200, 'Comportamento de risco'),
  detalhamento: texto(10, 2000, 'Detalhamento do ocorrido'),
  medida: z.enum(MEDIDAS_DISCIPLINARES, { required_error: 'Informe a medida aplicada.' }),
  motivacao: z.enum(MOTIVACOES_CONSEQUENCIA).default('INTERNA'),
  /** TST que conduziu o registro. */
  responsavelSst: opcional(z.string().trim().max(120)),
  /** Observacao vinculada, quando o fato nasceu de um registro de campo. */
  observacaoId: opcional(z.string().uuid('Observacao invalida.')),
});

export const consequenciaCreateSchema = consequenciaBaseSchema;
export const consequenciaUpdateSchema = consequenciaBaseSchema.partial();

export type ConsequenciaCreateData = z.output<typeof consequenciaCreateSchema>;

export const consequenciaFiltroSchema = z.object({
  clienteId: z.string().uuid('Cliente invalido.').optional(),
  colaboradorId: z.string().uuid('Colaborador invalido.').optional(),
  medida: z.enum(MEDIDAS_DISCIPLINARES).optional(),
  busca: z.string().trim().max(120).optional(),
});

export type ConsequenciaFiltro = z.output<typeof consequenciaFiltroSchema>;
