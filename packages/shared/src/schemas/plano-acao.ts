import { z } from 'zod';
import { dataObrigatoria, dataOpcional, opcional, texto } from './comuns.js';

/* -------------------------------------------------------------------------- */
/* Dominio                                                                     */
/* -------------------------------------------------------------------------- */

/** De onde o plano nasceu. */
export const ORIGENS_PLANO = ['OBSERVACAO', 'AUDITORIA', 'INSPECAO', 'MANUAL'] as const;
export type OrigemPlano = (typeof ORIGENS_PLANO)[number];

export const ROTULO_ORIGEM_PLANO: Record<OrigemPlano, string> = {
  OBSERVACAO: 'Observacao de campo',
  AUDITORIA: 'Auditoria',
  INSPECAO: 'Inspecao programada',
  MANUAL: 'Abertura manual',
};

export const CRITICIDADES_PLANO = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] as const;
export type CriticidadePlano = (typeof CRITICIDADES_PLANO)[number];

export const ROTULO_CRITICIDADE_PLANO: Record<CriticidadePlano, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Media',
  ALTA: 'Alta',
  CRITICA: 'Critica',
};

/**
 * Prazo padrao por criticidade, em horas — a matriz de criticidade do plano
 * diretor. Usado quando o plano nasce sem prazo explicito.
 */
export const PRAZO_PADRAO_POR_CRITICIDADE: Record<CriticidadePlano, number> = {
  CRITICA: 0,
  ALTA: 24,
  MEDIA: 72,
  BAIXA: 168,
};

export const STATUS_PLANO = ['ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'] as const;
export type StatusPlano = (typeof STATUS_PLANO)[number];

export const ROTULO_STATUS_PLANO: Record<StatusPlano, string> = {
  ABERTO: 'Aberto',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluido',
  CANCELADO: 'Cancelado',
};

/** Status que ainda consomem prazo e podem escalonar. */
export const STATUS_EM_ABERTO: readonly StatusPlano[] = ['ABERTO', 'EM_ANDAMENTO'];

export function estaEmAberto(status: StatusPlano): boolean {
  return STATUS_EM_ABERTO.includes(status);
}

/** Deriva a criticidade do plano a partir do grau de risco da ocorrencia. */
export function criticidadePeloGrau(grau: 'I' | 'II' | 'III' | null | undefined): CriticidadePlano {
  if (grau === 'I') return 'CRITICA';
  if (grau === 'II') return 'MEDIA';
  if (grau === 'III') return 'BAIXA';
  return 'MEDIA';
}

/* -------------------------------------------------------------------------- */
/* Schema de escrita                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Etapa 7 — Plano de Acao.
 *
 * A tratativa da ocorrencia. Nasce automaticamente da observacao quando o tipo
 * exige, ou e aberto manualmente. O prazo e o escalonamento vêm da matriz de
 * comunicacao; o fechamento exige evidencia.
 */
const planoAcaoBaseSchema = z.object({
  /* --- Origem -------------------------------------------------------------- */
  origem: z.enum(ORIGENS_PLANO).default('MANUAL'),
  /** Observacao que originou o plano. Obrigatoria quando `origem = OBSERVACAO`. */
  observacaoId: opcional(z.string().uuid('Observacao invalida.')),
  /** Area onde a acao sera executada. Herdada da observacao quando houver. */
  areaId: opcional(z.string().uuid('Area invalida.')),
  /** Terceiro responsavel, quando o desvio e de uma contratada. */
  terceiroId: opcional(z.string().uuid('Terceiro invalido.')),

  /* --- O que fazer --------------------------------------------------------- */
  acao: texto(5, 300, 'Acao'),
  descricao: opcional(z.string().trim().max(1000)),

  /* --- Quem e quando ------------------------------------------------------- */
  responsavelNome: texto(3, 120, 'Nome do responsavel'),
  responsavelCargo: opcional(z.string().trim().max(80)),
  responsavelEmail: opcional(z.string().trim().toLowerCase().email('E-mail do responsavel invalido.').max(150)),
  criticidade: z.enum(CRITICIDADES_PLANO, {
    required_error: 'Informe a criticidade do plano.',
    invalid_type_error: 'Criticidade invalida.',
  }),
  prazo: dataObrigatoria('Prazo'),

  /* --- Andamento ------------------------------------------------------------ */
  status: z.enum(STATUS_PLANO).default('ABERTO'),
  dataConclusao: dataOpcional('Data de conclusao'),
  /** Evidencia da correcao — exigida para concluir. */
  evidenciaUrl: opcional(z.string().trim().max(300)),
  comentarioConclusao: opcional(z.string().trim().max(1000)),
  observacoes: opcional(z.string().trim().max(1000)),
});

type DadosPlano = {
  origem?: OrigemPlano;
  observacaoId?: string | null;
  status?: StatusPlano;
  prazo?: Date | null;
  dataConclusao?: Date | null;
  evidenciaUrl?: string | null;
  comentarioConclusao?: string | null;
};

/**
 * Regras de coerencia do ciclo de vida do plano.
 *
 * A exigencia de evidencia para concluir e o que sustenta a auditoria depois:
 * "acao concluida" sem prova nao vale.
 */
function validarPlano(dados: DadosPlano, ctx: z.RefinementCtx): void {
  if (dados.origem === 'OBSERVACAO' && dados.observacaoId === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['observacaoId'],
      message: 'Informe a observacao que originou o plano.',
    });
  }

  if (dados.status === 'CONCLUIDO') {
    if (!dados.evidenciaUrl && !dados.comentarioConclusao) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['evidenciaUrl'],
        message: 'Anexe a evidencia ou descreva o que foi feito para concluir o plano.',
      });
    }
  }

  if (dados.dataConclusao && dados.status && dados.status !== 'CONCLUIDO' && dados.status !== 'CANCELADO') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dataConclusao'],
      message: 'Data de conclusao so faz sentido em plano concluido ou cancelado.',
    });
  }
}

export const planoAcaoCreateSchema = planoAcaoBaseSchema.superRefine(validarPlano);
export const planoAcaoUpdateSchema = planoAcaoBaseSchema.partial().superRefine(validarPlano);

export type PlanoAcaoCreateInput = z.input<typeof planoAcaoCreateSchema>;
export type PlanoAcaoCreateData = z.output<typeof planoAcaoCreateSchema>;
export type PlanoAcaoUpdateInput = z.input<typeof planoAcaoUpdateSchema>;

/* -------------------------------------------------------------------------- */
/* Filtros                                                                     */
/* -------------------------------------------------------------------------- */

export const ORDENACOES_PLANO = ['prazo', 'criticidade', 'status', 'criadoEm'] as const;
export type OrdenacaoPlano = (typeof ORDENACOES_PLANO)[number];

export const planoAcaoFiltroSchema = z.object({
  busca: z.string().trim().max(120).optional(),
  clienteId: z.string().uuid('Cliente invalido.').optional(),
  centroNegocioId: z.string().uuid('Centro de negocio invalido.').optional(),
  areaId: z.string().uuid('Area invalida.').optional(),
  terceiroId: z.string().uuid('Terceiro invalido.').optional(),
  criticidade: z.enum(CRITICIDADES_PLANO).optional(),
  status: z.enum(STATUS_PLANO).optional(),
  origem: z.enum(ORIGENS_PLANO).optional(),
  /** `true` = so planos com prazo vencido e ainda em aberto. */
  atrasados: z.enum(['true', 'false']).optional(),
  ordenarPor: z.enum(ORDENACOES_PLANO).default('prazo'),
  direcao: z.enum(['asc', 'desc']).default('asc'),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(20),
});

export type PlanoAcaoFiltro = z.output<typeof planoAcaoFiltroSchema>;

/* -------------------------------------------------------------------------- */
/* Notificacoes                                                                */
/* -------------------------------------------------------------------------- */

export const CANAIS_NOTIFICACAO = ['EMAIL', 'WHATSAPP', 'VOZ'] as const;
export type CanalNotificacao = (typeof CANAIS_NOTIFICACAO)[number];

/**
 * Situacao do envio.
 *
 * `SIMULADA` e o estado real de hoje: a mensagem foi montada e registrada, mas
 * nenhum provedor foi acionado. Quando a integracao entrar, ela vira
 * `ENVIADA` ou `FALHOU` sem mudar mais nada no modelo.
 */
export const STATUS_NOTIFICACAO = ['SIMULADA', 'ENVIADA', 'FALHOU'] as const;
export type StatusNotificacao = (typeof STATUS_NOTIFICACAO)[number];

export const ROTULO_STATUS_NOTIFICACAO: Record<StatusNotificacao, string> = {
  SIMULADA: 'Simulada (sem provedor)',
  ENVIADA: 'Enviada',
  FALHOU: 'Falhou',
};

export const notificacaoFiltroSchema = z.object({
  planoAcaoId: z.string().uuid().optional(),
  observacaoId: z.string().uuid().optional(),
  clienteId: z.string().uuid().optional(),
  canal: z.enum(CANAIS_NOTIFICACAO).optional(),
  status: z.enum(STATUS_NOTIFICACAO).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(30),
});

export type NotificacaoFiltro = z.output<typeof notificacaoFiltroSchema>;

/* -------------------------------------------------------------------------- */
/* Formulario                                                                  */
/* -------------------------------------------------------------------------- */

export type PlanoAcaoFormValues = {
  [Campo in keyof PlanoAcaoCreateData]-?: string;
};
