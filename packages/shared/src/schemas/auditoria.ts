import { z } from 'zod';
import { dataObrigatoria, opcional, texto } from './comuns.js';

/* -------------------------------------------------------------------------- */
/* Dominio                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Etapa 12 — Auditorias.
 *
 * Consolida ISO 45001/14001/50001, auditorias internas, de cliente e legais.
 * O score de cada auditoria e derivado (requisitos atendidos / avaliados) e a
 * media das concluidas nos ultimos 12 meses e a nota do pilar AUDITORIAS do
 * Indice Global (10%) e da Maturidade (15%).
 */

export const TIPOS_AUDITORIA = ['ISO_45001', 'ISO_14001', 'ISO_50001', 'INTERNA', 'CLIENTE', 'LEGAL'] as const;
export type TipoAuditoria = (typeof TIPOS_AUDITORIA)[number];

export const ROTULO_TIPO_AUDITORIA: Record<TipoAuditoria, string> = {
  ISO_45001: 'ISO 45001 — Saude e Seguranca',
  ISO_14001: 'ISO 14001 — Meio Ambiente',
  ISO_50001: 'ISO 50001 — Energia',
  INTERNA: 'Auditoria interna',
  CLIENTE: 'Auditoria do cliente',
  LEGAL: 'Requisitos legais',
};

export const SITUACOES_AUDITORIA = ['PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'] as const;
export type SituacaoAuditoria = (typeof SITUACOES_AUDITORIA)[number];

export const ROTULO_SITUACAO_AUDITORIA: Record<SituacaoAuditoria, string> = {
  PLANEJADA: 'Planejada',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluida',
  CANCELADA: 'Cancelada',
};

/* -------------------------------------------------------------------------- */
/* Schema de escrita                                                           */
/* -------------------------------------------------------------------------- */

const auditoriaBaseSchema = z.object({
  clienteId: z.string({ required_error: 'Informe o cliente auditado.' }).uuid('Cliente invalido.'),
  tipo: z.enum(TIPOS_AUDITORIA, {
    required_error: 'Informe o tipo da auditoria.',
    invalid_type_error: 'Tipo invalido.',
  }),
  titulo: texto(3, 150, 'Titulo da auditoria'),
  dataRealizacao: dataObrigatoria('Data de realizacao'),
  auditor: opcional(z.string().trim().max(120)),
  /** Orgao, certificadora ou norma especifica (para LEGAL). */
  referencia: opcional(z.string().trim().max(120)),
  situacao: z.enum(SITUACOES_AUDITORIA).default('PLANEJADA'),

  /* --- Resultado ----------------------------------------------------------- */
  requisitosAvaliados: opcional(z.coerce.number().int().min(1, 'Ao menos 1 requisito.').max(10000)),
  requisitosAtendidos: opcional(z.coerce.number().int().min(0).max(10000)),
  ncMaiores: z.coerce.number().int().min(0).max(1000).default(0),
  ncMenores: z.coerce.number().int().min(0).max(1000).default(0),
  oportunidadesMelhoria: z.coerce.number().int().min(0).max(1000).default(0),
  observacoes: opcional(z.string().trim().max(1000)),
});

function validarAuditoria(
  dados: {
    situacao?: SituacaoAuditoria;
    requisitosAvaliados?: number | null;
    requisitosAtendidos?: number | null;
  },
  ctx: z.RefinementCtx,
): void {
  const avaliados = dados.requisitosAvaliados ?? null;
  const atendidos = dados.requisitosAtendidos ?? null;

  if (atendidos !== null && avaliados !== null && atendidos > avaliados) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['requisitosAtendidos'],
      message: 'Atendidos nao pode superar os avaliados.',
    });
  }

  // Auditoria concluida sem resultado nao mede nada — e vira buraco no pilar.
  if (dados.situacao === 'CONCLUIDA' && (avaliados === null || atendidos === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['requisitosAvaliados'],
      message: 'Auditoria concluida exige requisitos avaliados e atendidos.',
    });
  }
}

export const auditoriaCreateSchema = auditoriaBaseSchema.superRefine(validarAuditoria);
export const auditoriaUpdateSchema = auditoriaBaseSchema.partial().superRefine(validarAuditoria);

export type AuditoriaCreateInput = z.input<typeof auditoriaCreateSchema>;
export type AuditoriaCreateData = z.output<typeof auditoriaCreateSchema>;

export const auditoriaFiltroSchema = z.object({
  clienteId: z.string().uuid('Cliente invalido.').optional(),
  tipo: z.enum(TIPOS_AUDITORIA).optional(),
  situacao: z.enum(SITUACOES_AUDITORIA).optional(),
  busca: z.string().trim().max(120).optional(),
});

export type AuditoriaFiltro = z.output<typeof auditoriaFiltroSchema>;
