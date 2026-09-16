import { z } from 'zod';
import { dataObrigatoria, dataOpcional, opcional, texto } from './comuns.js';

/**
 * Etapa 23 — Documentacao Tecnica: Ordem de Servico, APR e checklist de pre-uso.
 *
 * Os tres compartilham um principio: o documento e uma FOTOGRAFIA do momento.
 * A OS guarda os riscos que o trabalhador foi informado naquele dia; a APR,
 * as etapas aprovadas; a execucao do checklist, os itens exatamente como
 * foram respondidos. Se a fonte mudar depois (inventario, modelo), o
 * documento ja emitido nao muda junto — gera-se uma versao nova.
 */

/* -------------------------------------------------------------------------- */
/* Ordem de Servico (NR-1, 1.4.4)                                             */
/* -------------------------------------------------------------------------- */

export const SITUACOES_OS = ['EMITIDA', 'ASSINADA', 'SUBSTITUIDA'] as const;
export type SituacaoOs = (typeof SITUACOES_OS)[number];

export const ROTULO_SITUACAO_OS: Record<SituacaoOs, string> = {
  EMITIDA: 'Emitida — aguardando ciencia',
  ASSINADA: 'Assinada pelo trabalhador',
  SUBSTITUIDA: 'Substituida por versao mais nova',
};

/** Gerar uma OS: o servidor monta o conteudo a partir dos cadastros. */
export const osGerarSchema = z.object({
  colaboradorId: z.string({ required_error: 'Informe o colaborador.' }).uuid('Colaborador invalido.'),
  /** Texto complementar do tecnico de seguranca (procedimentos, restricoes). */
  medidasPreventivas: opcional(z.string().trim().max(2000)),
});
export type OsGerarInput = z.input<typeof osGerarSchema>;

export const osFiltroSchema = z.object({
  clienteId: z.string().uuid().optional(),
  colaboradorId: z.string().uuid().optional(),
  situacao: z.enum(SITUACOES_OS).optional(),
  busca: z.string().trim().max(120).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(25),
});
export type OsFiltro = z.output<typeof osFiltroSchema>;

/** Item do snapshot de riscos gravado na OS. */
export interface OsRisco {
  tipo: string;
  perigo: string;
  danosPossiveis: string;
  grauRisco: string;
  iir: number;
  controlesExistentes: string | null;
  medidasPropostas: string | null;
}

export interface OsEpi {
  nome: string;
  ca: string;
  dataEntrega: string;
}

export interface OsTreinamento {
  nome: string;
  norma: string | null;
  situacao: 'EM_DIA' | 'A_VENCER' | 'VENCIDO' | 'NAO_REALIZADO';
}

/* -------------------------------------------------------------------------- */
/* APR — Analise Preliminar de Risco                                          */
/* -------------------------------------------------------------------------- */

export const SITUACOES_APR = ['RASCUNHO', 'APROVADA', 'ENCERRADA'] as const;
export type SituacaoApr = (typeof SITUACOES_APR)[number];

export const ROTULO_SITUACAO_APR: Record<SituacaoApr, string> = {
  RASCUNHO: 'Rascunho',
  APROVADA: 'Aprovada',
  ENCERRADA: 'Encerrada',
};

export const aprEtapaSchema = z.object({
  etapa: texto(3, 200, 'Etapa'),
  perigos: texto(3, 500, 'Perigos'),
  riscos: texto(3, 500, 'Riscos'),
  medidasControle: texto(3, 800, 'Medidas de controle'),
  epis: opcional(z.string().trim().max(300)),
});
export type AprEtapa = z.output<typeof aprEtapaSchema>;

const aprBaseSchema = z.object({
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente invalido.'),
  areaId: opcional(z.string().uuid('Area invalida.')),
  terceiroId: opcional(z.string().uuid('Terceiro invalido.')),
  atividade: texto(3, 200, 'Atividade'),
  local: opcional(z.string().trim().max(200)),
  dataInicio: dataObrigatoria('Data de inicio'),
  dataFim: opcional(dataOpcional('Data de fim')),
  responsavel: texto(3, 120, 'Responsavel'),
  etapas: z.array(aprEtapaSchema).min(1, 'Decomponha a atividade em ao menos uma etapa.').max(40),
});

export const aprCreateSchema = aprBaseSchema;
/** Aprovada ou encerrada, a APR nao se edita: nova versao. */
export const aprUpdateSchema = aprBaseSchema.partial();

export const aprAprovarSchema = z.object({
  aprovadaPor: texto(3, 120, 'Aprovador'),
});

export const aprFiltroSchema = z.object({
  clienteId: z.string().uuid().optional(),
  areaId: z.string().uuid().optional(),
  situacao: z.enum(SITUACOES_APR).optional(),
  busca: z.string().trim().max(120).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(25),
});
export type AprFiltro = z.output<typeof aprFiltroSchema>;
export type AprCreateInput = z.input<typeof aprCreateSchema>;

/* -------------------------------------------------------------------------- */
/* Checklist de pre-uso                                                       */
/* -------------------------------------------------------------------------- */

export const RESULTADOS_CHECKLIST = ['APTO', 'NAO_APTO'] as const;
export type ResultadoChecklist = (typeof RESULTADOS_CHECKLIST)[number];

export const checklistItemSchema = z.object({
  descricao: texto(3, 200, 'Item'),
  /** Nao conforme em item impeditivo reprova o equipamento. */
  impeditivo: z.boolean().default(false),
});
export type ChecklistItem = z.output<typeof checklistItemSchema>;

const modeloChecklistBase = z.object({
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente invalido.'),
  nome: texto(3, 120, 'Nome do checklist'),
  tipoEquipamento: texto(2, 80, 'Tipo de equipamento'),
  itens: z.array(checklistItemSchema).min(1, 'Inclua ao menos um item.').max(60),
  ativo: z.boolean().default(true),
});
export const modeloChecklistCreateSchema = modeloChecklistBase;
export const modeloChecklistUpdateSchema = modeloChecklistBase.partial();
export type ModeloChecklistCreateInput = z.input<typeof modeloChecklistCreateSchema>;

export const checklistRespostaSchema = z.object({
  descricao: z.string().trim().min(1).max(200),
  impeditivo: z.boolean(),
  conforme: z.boolean(),
  observacao: opcional(z.string().trim().max(300)),
});
export type ChecklistResposta = z.output<typeof checklistRespostaSchema>;

export const execucaoChecklistCreateSchema = z.object({
  modeloId: z.string({ required_error: 'Informe o modelo.' }).uuid('Modelo invalido.'),
  areaId: opcional(z.string().uuid('Area invalida.')),
  colaboradorId: opcional(z.string().uuid('Colaborador invalido.')),
  equipamentoIdentificacao: texto(1, 120, 'Identificacao do equipamento'),
  executadoPor: texto(3, 120, 'Executado por'),
  respostas: z.array(checklistRespostaSchema).min(1, 'Responda os itens.'),
});
export type ExecucaoChecklistCreateInput = z.input<typeof execucaoChecklistCreateSchema>;

export const execucaoChecklistFiltroSchema = z.object({
  clienteId: z.string().uuid().optional(),
  modeloId: z.string().uuid().optional(),
  resultado: z.enum(RESULTADOS_CHECKLIST).optional(),
  de: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(25),
});

/** APTO so quando nenhum item impeditivo esta nao conforme. */
export function resultadoDoChecklist(respostas: ChecklistResposta[]): ResultadoChecklist {
  return respostas.some((r) => r.impeditivo && !r.conforme) ? 'NAO_APTO' : 'APTO';
}
