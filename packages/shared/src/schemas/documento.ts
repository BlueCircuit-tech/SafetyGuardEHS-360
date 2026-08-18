import { z } from 'zod';
import { dataNaoFutura, dataObrigatoria, opcional, texto } from './comuns.js';

/* -------------------------------------------------------------------------- */
/* Catalogo de documentos                                                      */
/* -------------------------------------------------------------------------- */

export const TIPOS_DOCUMENTO = [
  'PGR',
  'PCMSO',
  'LTCAT',
  'PPP',
  'PCA',
  'PPR',
  'LAUDO_INSALUBRIDADE',
  'LAUDO_PERICULOSIDADE',
  'LAUDO_ERGONOMICO',
  'AVCB',
  'LICENCA_AMBIENTAL',
  'ART_RT',
  'CERTIFICADO_TREINAMENTO',
  'PROCEDIMENTO',
  'OUTRO',
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

/**
 * Cada tipo carrega o nome por extenso, a validade tipica em meses e se a
 * legislacao exige responsavel tecnico. A validade tipica so **sugere** a
 * data — programas podem ter prazo proprio definido em contrato.
 */
export interface DefinicaoDocumento {
  tipo: TipoDocumento;
  rotulo: string;
  descricao: string;
  /** Validade tipica em meses; `null` quando nao ha prazo padrao. */
  validadeMeses: number | null;
  exigeResponsavelTecnico: boolean;
  categoria: 'SAUDE' | 'SEGURANCA' | 'AMBIENTAL' | 'TREINAMENTO' | 'OUTRO';
}

export const CATALOGO_DOCUMENTOS: readonly DefinicaoDocumento[] = [
  {
    tipo: 'PGR',
    rotulo: 'PGR',
    descricao: 'Programa de Gerenciamento de Riscos (NR-1)',
    validadeMeses: 24,
    exigeResponsavelTecnico: true,
    categoria: 'SEGURANCA',
  },
  {
    tipo: 'PCMSO',
    rotulo: 'PCMSO',
    descricao: 'Programa de Controle Medico de Saude Ocupacional (NR-7)',
    validadeMeses: 12,
    exigeResponsavelTecnico: true,
    categoria: 'SAUDE',
  },
  {
    tipo: 'LTCAT',
    rotulo: 'LTCAT',
    descricao: 'Laudo Tecnico das Condicoes Ambientais do Trabalho',
    validadeMeses: 12,
    exigeResponsavelTecnico: true,
    categoria: 'SAUDE',
  },
  {
    tipo: 'PPP',
    rotulo: 'PPP',
    descricao: 'Perfil Profissiografico Previdenciario',
    validadeMeses: null,
    exigeResponsavelTecnico: true,
    categoria: 'SAUDE',
  },
  {
    tipo: 'PCA',
    rotulo: 'PCA',
    descricao: 'Programa de Conservacao Auditiva',
    validadeMeses: 12,
    exigeResponsavelTecnico: true,
    categoria: 'SAUDE',
  },
  {
    tipo: 'PPR',
    rotulo: 'PPR',
    descricao: 'Programa de Protecao Respiratoria',
    validadeMeses: 12,
    exigeResponsavelTecnico: true,
    categoria: 'SAUDE',
  },
  {
    tipo: 'LAUDO_INSALUBRIDADE',
    rotulo: 'Laudo de insalubridade',
    descricao: 'Avaliacao de agentes insalubres (NR-15)',
    validadeMeses: 12,
    exigeResponsavelTecnico: true,
    categoria: 'SAUDE',
  },
  {
    tipo: 'LAUDO_PERICULOSIDADE',
    rotulo: 'Laudo de periculosidade',
    descricao: 'Avaliacao de atividades perigosas (NR-16)',
    validadeMeses: 12,
    exigeResponsavelTecnico: true,
    categoria: 'SEGURANCA',
  },
  {
    tipo: 'LAUDO_ERGONOMICO',
    rotulo: 'AEP / laudo ergonomico',
    descricao: 'Avaliacao Ergonomica Preliminar (NR-17)',
    validadeMeses: 24,
    exigeResponsavelTecnico: true,
    categoria: 'SAUDE',
  },
  {
    tipo: 'AVCB',
    rotulo: 'AVCB',
    descricao: 'Auto de Vistoria do Corpo de Bombeiros',
    validadeMeses: 12,
    exigeResponsavelTecnico: false,
    categoria: 'SEGURANCA',
  },
  {
    tipo: 'LICENCA_AMBIENTAL',
    rotulo: 'Licenca ambiental',
    descricao: 'Licenca de operacao, instalacao ou previa',
    validadeMeses: 48,
    exigeResponsavelTecnico: false,
    categoria: 'AMBIENTAL',
  },
  {
    tipo: 'ART_RT',
    rotulo: 'ART / TRT',
    descricao: 'Anotacao de Responsabilidade Tecnica',
    validadeMeses: 12,
    exigeResponsavelTecnico: true,
    categoria: 'OUTRO',
  },
  {
    tipo: 'CERTIFICADO_TREINAMENTO',
    rotulo: 'Certificado de treinamento',
    descricao: 'NR-10, NR-33, NR-35 e demais capacitacoes',
    validadeMeses: 24,
    exigeResponsavelTecnico: false,
    categoria: 'TREINAMENTO',
  },
  {
    tipo: 'PROCEDIMENTO',
    rotulo: 'Procedimento / POP',
    descricao: 'Procedimento operacional padrao',
    validadeMeses: null,
    exigeResponsavelTecnico: false,
    categoria: 'OUTRO',
  },
  {
    tipo: 'OUTRO',
    rotulo: 'Outro',
    descricao: 'Documento nao catalogado',
    validadeMeses: null,
    exigeResponsavelTecnico: false,
    categoria: 'OUTRO',
  },
];

const POR_TIPO = new Map(CATALOGO_DOCUMENTOS.map((definicao) => [definicao.tipo, definicao]));

export function definicaoDoDocumento(tipo: TipoDocumento): DefinicaoDocumento {
  const definicao = POR_TIPO.get(tipo);
  if (!definicao) throw new Error(`Tipo de documento desconhecido: ${tipo}`);
  return definicao;
}

export const ROTULO_TIPO_DOCUMENTO = Object.fromEntries(
  CATALOGO_DOCUMENTOS.map((definicao) => [definicao.tipo, definicao.rotulo]),
) as Record<TipoDocumento, string>;

/* -------------------------------------------------------------------------- */
/* Abrangencia e situacao                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A que o documento se aplica.
 *
 * O mesmo PGR pode valer para o contrato inteiro, para uma area especifica ou
 * para uma contratada — e a cobranca muda conforme o alcance.
 */
export const ABRANGENCIAS_DOCUMENTO = ['CLIENTE', 'AREA', 'TERCEIRO', 'COLABORADOR'] as const;
export type AbrangenciaDocumento = (typeof ABRANGENCIAS_DOCUMENTO)[number];

export const ROTULO_ABRANGENCIA_DOCUMENTO: Record<AbrangenciaDocumento, string> = {
  CLIENTE: 'Todo o cliente',
  AREA: 'Area especifica',
  TERCEIRO: 'Empresa contratada',
  COLABORADOR: 'Colaborador',
};

export const SITUACOES_DOCUMENTO = ['ATIVO', 'SUBSTITUIDO', 'CANCELADO'] as const;
export type SituacaoDocumento = (typeof SITUACOES_DOCUMENTO)[number];

export const ROTULO_SITUACAO_DOCUMENTO: Record<SituacaoDocumento, string> = {
  ATIVO: 'Ativo',
  SUBSTITUIDO: 'Substituido por revisao',
  CANCELADO: 'Cancelado',
};

/* -------------------------------------------------------------------------- */
/* Schema de escrita                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Etapa 9 — Documento legal SSMA.
 *
 * Guarda o que a fiscalizacao pede: qual documento, de quem, quem assina,
 * ate quando vale e onde esta o arquivo.
 */
const documentoBaseSchema = z.object({
  /* --- A quem se aplica --------------------------------------------------- */
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente invalido.'),
  abrangencia: z.enum(ABRANGENCIAS_DOCUMENTO, {
    required_error: 'Informe a abrangencia do documento.',
    invalid_type_error: 'Abrangencia invalida.',
  }),
  areaId: opcional(z.string().uuid('Area invalida.')),
  terceiroId: opcional(z.string().uuid('Empresa contratada invalida.')),
  colaboradorId: opcional(z.string().uuid('Colaborador invalido.')),

  /* --- Identificacao ------------------------------------------------------ */
  tipo: z.enum(TIPOS_DOCUMENTO, {
    required_error: 'Informe o tipo do documento.',
    invalid_type_error: 'Tipo de documento invalido.',
  }),
  titulo: texto(3, 150, 'Titulo do documento'),
  /** Numero, protocolo ou codigo de revisao. */
  numero: opcional(z.string().trim().max(50)),
  revisao: opcional(z.string().trim().max(20)),
  descricao: opcional(z.string().trim().max(1000)),

  /* --- Vigencia ----------------------------------------------------------- */
  dataEmissao: dataNaoFutura('Data de emissao'),
  /** Vazio = sem prazo (PPP, procedimento). O formulario sugere pelo catalogo. */
  validade: opcional(dataObrigatoria('Validade')),

  /* --- Responsavel tecnico ------------------------------------------------ */
  responsavelNome: opcional(z.string().trim().max(120)),
  /** Registro profissional: CREA, CRM, CRT... */
  responsavelRegistro: opcional(z.string().trim().max(40)),
  /** Numero da ART, quando houver. */
  numeroArt: opcional(z.string().trim().max(40)),

  situacao: z.enum(SITUACOES_DOCUMENTO).default('ATIVO'),
  observacoes: opcional(z.string().trim().max(1000)),
});

/** Cada abrangencia exige o seu alvo — senao "documento da area" fica sem area. */
const ALVO_POR_ABRANGENCIA: Record<AbrangenciaDocumento, 'areaId' | 'terceiroId' | 'colaboradorId' | null> = {
  CLIENTE: null,
  AREA: 'areaId',
  TERCEIRO: 'terceiroId',
  COLABORADOR: 'colaboradorId',
};

const ROTULO_ALVO: Record<'areaId' | 'terceiroId' | 'colaboradorId', string> = {
  areaId: 'a area',
  terceiroId: 'a empresa contratada',
  colaboradorId: 'o colaborador',
};

function validarDocumento(
  dados: {
    abrangencia?: AbrangenciaDocumento;
    tipo?: TipoDocumento;
    areaId?: string | null;
    terceiroId?: string | null;
    colaboradorId?: string | null;
    dataEmissao?: Date;
    validade?: Date | null;
    responsavelNome?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (dados.abrangencia) {
    const alvo = ALVO_POR_ABRANGENCIA[dados.abrangencia];
    if (alvo && !dados[alvo]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [alvo],
        message: `Informe ${ROTULO_ALVO[alvo]} do documento.`,
      });
    }
  }

  if (dados.validade && dados.dataEmissao && dados.validade <= dados.dataEmissao) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['validade'],
      message: 'Validade deve ser posterior a emissao.',
    });
  }

  if (dados.tipo && definicaoDoDocumento(dados.tipo).exigeResponsavelTecnico && !dados.responsavelNome) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['responsavelNome'],
      message: 'Este documento exige responsavel tecnico.',
    });
  }
}

export const documentoCreateSchema = documentoBaseSchema.superRefine(validarDocumento);
export const documentoUpdateSchema = documentoBaseSchema.partial().superRefine(validarDocumento);

export type DocumentoCreateInput = z.input<typeof documentoCreateSchema>;
export type DocumentoCreateData = z.output<typeof documentoCreateSchema>;
export type DocumentoUpdateInput = z.input<typeof documentoUpdateSchema>;

/* -------------------------------------------------------------------------- */
/* Filtros da listagem                                                         */
/* -------------------------------------------------------------------------- */

export const ORDENACOES_DOCUMENTO = ['validade', 'dataEmissao', 'titulo', 'tipo', 'criadoEm'] as const;
export type OrdenacaoDocumento = (typeof ORDENACOES_DOCUMENTO)[number];

export const documentoFiltroSchema = z.object({
  /** Busca por titulo, numero, ART ou responsavel. */
  busca: z.string().trim().max(120).optional(),
  clienteId: z.string().uuid('Cliente invalido.').optional(),
  areaId: z.string().uuid('Area invalida.').optional(),
  terceiroId: z.string().uuid('Empresa contratada invalida.').optional(),
  colaboradorId: z.string().uuid('Colaborador invalido.').optional(),
  tipo: z.enum(TIPOS_DOCUMENTO).optional(),
  abrangencia: z.enum(ABRANGENCIAS_DOCUMENTO).optional(),
  situacao: z.enum(SITUACOES_DOCUMENTO).optional(),
  vencimento: z.enum(['VIGENTE', 'A_VENCER', 'VENCIDO', 'SEM_VALIDADE']).optional(),
  ordenarPor: z.enum(ORDENACOES_DOCUMENTO).default('validade'),
  direcao: z.enum(['asc', 'desc']).default('asc'),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(20),
});

export type DocumentoFiltro = z.output<typeof documentoFiltroSchema>;

export type DocumentoFormValues = { [Campo in keyof DocumentoCreateData]-?: string };
