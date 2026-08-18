import { z } from 'zod';
import { isCelular, isTelefoneValido, limparTelefone } from '../br/telefone.js';
import { SIGLAS_UF, type SiglaUf } from '../br/uf.js';
import { HEX_COR, opcional, texto } from './comuns.js';

/* -------------------------------------------------------------------------- */
/* Dominio                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Como o centro agrupa a operacao. Define o vocabulario do filtro no
 * dashboard — "Regional Centro-Oeste", "Unidade Sorocaba", "Contratos de obra".
 */
export const TIPOS_CENTRO_NEGOCIO = ['REGIONAL', 'UNIDADE', 'TIPO_CONTRATO', 'DIVISAO'] as const;
export type TipoCentroNegocio = (typeof TIPOS_CENTRO_NEGOCIO)[number];

export const ROTULO_TIPO_CENTRO: Record<TipoCentroNegocio, string> = {
  REGIONAL: 'Regional',
  UNIDADE: 'Unidade / planta',
  TIPO_CONTRATO: 'Tipo de contrato',
  DIVISAO: 'Divisao de negocio',
};

export const DESCRICAO_TIPO_CENTRO: Record<TipoCentroNegocio, string> = {
  REGIONAL: 'Agrupa clientes por regiao geografica (ex.: Regional Centro-Oeste).',
  UNIDADE: 'Representa uma planta ou unidade operacional (ex.: Unidade Sorocaba).',
  TIPO_CONTRATO: 'Agrupa por natureza do servico (ex.: Contratos de obra, Contratos de manutencao).',
  DIVISAO: 'Divisao interna da consultoria (ex.: Divisao Industrial).',
};

export const SITUACOES_CENTRO = ['ATIVO', 'INATIVO'] as const;
export type SituacaoCentro = (typeof SITUACOES_CENTRO)[number];

export const ROTULO_SITUACAO_CENTRO: Record<SituacaoCentro, string> = {
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
};

export const META_INDICE_CENTRO_PADRAO = 85;
export const COR_DESTAQUE_CENTRO_PADRAO = '#0e1a2b';

/* -------------------------------------------------------------------------- */
/* Schema de escrita                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Etapa 4 — Centros de Negocio / Unidades.
 *
 * Agrupamento intermediario entre a matriz e os clientes, usado quando a
 * consultoria organiza a operacao por regional, por unidade ou por tipo de
 * contrato. Cada cliente aponta para no maximo um centro; o filtro "Centro de
 * Negocio" do dashboard desce em cascata para clientes e terceiros.
 */
const centroNegocioBaseSchema = z.object({
  /* --- Identificacao ------------------------------------------------------ */
  nome: texto(2, 120, 'Nome do centro de negocio'),
  /**
   * Codigo curto usado em relatorios, filtros e exportacoes.
   * Unico por matriz, normalizado para maiusculas sem espacos.
   */
  codigo: z
    .string({ required_error: 'Codigo e obrigatorio.' })
    .trim()
    .min(1, 'Codigo e obrigatorio.')
    .max(20, 'Codigo deve ter no maximo 20 caracteres.')
    .transform((valor) => valor.toUpperCase().replace(/\s+/g, '-'))
    .refine((valor) => /^[A-Z0-9._-]+$/.test(valor), 'Codigo aceita apenas letras, numeros, ponto, hifen e underline.'),
  tipo: z.enum(TIPOS_CENTRO_NEGOCIO, {
    required_error: 'Informe o tipo de agrupamento.',
    invalid_type_error: 'Tipo de agrupamento invalido.',
  }),
  descricao: opcional(z.string().trim().max(500)),

  /* --- Responsavel -------------------------------------------------------- */
  responsavelNome: texto(3, 120, 'Nome do responsavel'),
  responsavelCargo: opcional(z.string().trim().max(80)),
  responsavelEmail: z
    .string({ required_error: 'E-mail do responsavel e obrigatorio.' })
    .trim()
    .toLowerCase()
    .email('E-mail do responsavel invalido.')
    .max(150),
  responsavelTelefone: opcional(
    z.string().transform(limparTelefone).refine(isTelefoneValido, 'Telefone do responsavel invalido.'),
  ),
  responsavelWhatsapp: opcional(
    z
      .string()
      .transform(limparTelefone)
      .refine(isCelular, 'WhatsApp deve ser um celular valido com DDD (11 digitos).'),
  ),

  /* --- Localizacao de referencia ------------------------------------------ */
  cidade: opcional(z.string().trim().max(80)),
  uf: opcional(
    z
      .string()
      .trim()
      .toUpperCase()
      .refine((valor): valor is SiglaUf => SIGLAS_UF.includes(valor as SiglaUf), 'UF invalida.'),
  ),

  /* --- Gestao ------------------------------------------------------------- */
  /** Meta do Indice Global SSMA do centro — referencia do comparativo entre centros. */
  metaIndiceGlobal: z.coerce
    .number()
    .min(0, 'Meta deve estar entre 0 e 100.')
    .max(100, 'Meta deve estar entre 0 e 100.')
    .default(META_INDICE_CENTRO_PADRAO),
  situacao: z.enum(SITUACOES_CENTRO).default('ATIVO'),
  corDestaque: z
    .string()
    .trim()
    .regex(HEX_COR, 'Cor de destaque deve estar no formato #RRGGBB.')
    .default(COR_DESTAQUE_CENTRO_PADRAO),
  observacoes: opcional(z.string().trim().max(1000)),
});

export const centroNegocioCreateSchema = centroNegocioBaseSchema;
export const centroNegocioUpdateSchema = centroNegocioBaseSchema.partial();

export type CentroNegocioCreateInput = z.input<typeof centroNegocioCreateSchema>;
export type CentroNegocioCreateData = z.output<typeof centroNegocioCreateSchema>;
export type CentroNegocioUpdateInput = z.input<typeof centroNegocioUpdateSchema>;

/* -------------------------------------------------------------------------- */
/* Filtros da listagem                                                         */
/* -------------------------------------------------------------------------- */

export const ORDENACOES_CENTRO = ['nome', 'codigo', 'tipo', 'criadoEm'] as const;
export type OrdenacaoCentro = (typeof ORDENACOES_CENTRO)[number];

export const centroNegocioFiltroSchema = z.object({
  /** Busca por nome, codigo, responsavel ou cidade. */
  busca: z.string().trim().max(120).optional(),
  tipo: z.enum(TIPOS_CENTRO_NEGOCIO).optional(),
  situacao: z.enum(SITUACOES_CENTRO).optional(),
  uf: z.string().trim().toUpperCase().length(2).optional(),
  ordenarPor: z.enum(ORDENACOES_CENTRO).default('nome'),
  direcao: z.enum(['asc', 'desc']).default('asc'),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

export type CentroNegocioFiltro = z.output<typeof centroNegocioFiltroSchema>;

/* -------------------------------------------------------------------------- */
/* Formulario                                                                  */
/* -------------------------------------------------------------------------- */

export type CentroNegocioFormValues = {
  [Campo in keyof CentroNegocioCreateData]-?: string;
};
