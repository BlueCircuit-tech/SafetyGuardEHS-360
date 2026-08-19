import { z } from 'zod';
import { isTelefoneValido, limparTelefone } from '../br/telefone.js';
import { opcional, texto } from './comuns.js';

/* -------------------------------------------------------------------------- */
/* Dominio                                                                     */
/* -------------------------------------------------------------------------- */

/** Natureza da area — orienta o checklist e o tipo de risco esperado. */
export const TIPOS_AREA = [
  'PRODUCAO',
  'MANUTENCAO',
  'ARMAZENAGEM',
  'LOGISTICA',
  'UTILIDADES',
  'LABORATORIO',
  'OBRA',
  'ADMINISTRATIVO',
  'AREA_EXTERNA',
  'OUTRO',
] as const;
export type TipoArea = (typeof TIPOS_AREA)[number];

export const ROTULO_TIPO_AREA: Record<TipoArea, string> = {
  PRODUCAO: 'Producao',
  MANUTENCAO: 'Manutencao',
  ARMAZENAGEM: 'Armazenagem',
  LOGISTICA: 'Logistica',
  UTILIDADES: 'Utilidades',
  LABORATORIO: 'Laboratorio',
  OBRA: 'Obra / canteiro',
  ADMINISTRATIVO: 'Administrativo',
  AREA_EXTERNA: 'Area externa',
  OUTRO: 'Outro',
};

/**
 * Criticidade cadastral da area — define a prioridade e a frequencia minima
 * de inspecao antes de existir historico. Depois que as observacoes entrarem,
 * o mapa de calor mostra a criticidade *realizada* ao lado desta.
 */
export const CRITICIDADES_AREA_CADASTRO = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] as const;
export type CriticidadeAreaCadastro = (typeof CRITICIDADES_AREA_CADASTRO)[number];

export const ROTULO_CRITICIDADE_AREA: Record<CriticidadeAreaCadastro, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Media',
  ALTA: 'Alta',
  CRITICA: 'Critica',
};

/** Frequencia minima de inspecao sugerida por criticidade, em dias. */
export const FREQUENCIA_SUGERIDA_POR_CRITICIDADE: Record<CriticidadeAreaCadastro, number> = {
  BAIXA: 90,
  MEDIA: 30,
  ALTA: 15,
  CRITICA: 7,
};

export const SITUACOES_AREA = ['ATIVA', 'INATIVA'] as const;
export type SituacaoArea = (typeof SITUACOES_AREA)[number];

export const ROTULO_SITUACAO_AREA: Record<SituacaoArea, string> = {
  ATIVA: 'Ativa',
  INATIVA: 'Inativa',
};

/** Riscos tipicos sugeridos no formulario — campo livre, a lista e so atalho. */
export const RISCOS_SUGERIDOS = [
  'Ruido',
  'Poeira / particulados',
  'Calor',
  'Trabalho em altura',
  'Espaco confinado',
  'Eletricidade',
  'Movimentacao de cargas',
  'Produtos quimicos',
  'Maquinas e equipamentos',
  'Vibracao',
  'Radiacao',
  'Trabalho a quente',
  'Risco biologico',
  'Ergonomia',
] as const;

export const FREQUENCIA_INSPECAO_PADRAO = 30;

/* -------------------------------------------------------------------------- */
/* Schema de escrita                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Etapa 5 — Areas e QR Code.
 *
 * A area e o **ponto de leitura** da inspecao de campo: cada uma tem um QR
 * Code proprio que, ao ser lido, abre o formulario de observacao ja
 * identificado com cliente, area e riscos esperados.
 *
 * O `tokenQr` nao entra no schema — e gerado pelo servidor e nunca editado
 * pelo formulario, para que reimprimir a placa nao invalide as leituras.
 */
const areaBaseSchema = z.object({
  /* --- Onde fica ---------------------------------------------------------- */
  clienteId: z.string({ required_error: 'Informe o cliente da area.' }).uuid('Cliente invalido.'),
  /** Agrupamento livre dentro do cliente (planta, unidade, prédio). */
  setor: opcional(z.string().trim().max(80)),

  /* --- Identificacao ------------------------------------------------------ */
  nome: texto(2, 120, 'Nome da area'),
  /**
   * Codigo curto e unico por cliente. Aparece na placa do QR Code, nos
   * relatorios e no mapa de calor.
   */
  codigo: z
    .string({ required_error: 'Codigo e obrigatorio.' })
    .trim()
    .min(1, 'Codigo e obrigatorio.')
    .max(20, 'Codigo deve ter no maximo 20 caracteres.')
    .transform((valor) => valor.toUpperCase().replace(/\s+/g, '-'))
    .refine((valor) => /^[A-Z0-9._-]+$/.test(valor), 'Codigo aceita apenas letras, numeros, ponto, hifen e underline.'),
  tipo: z.enum(TIPOS_AREA, {
    required_error: 'Informe o tipo da area.',
    invalid_type_error: 'Tipo de area invalido.',
  }),
  descricao: opcional(z.string().trim().max(500)),

  /* --- Risco -------------------------------------------------------------- */
  criticidade: z.enum(CRITICIDADES_AREA_CADASTRO, {
    required_error: 'Informe a criticidade da area.',
    invalid_type_error: 'Criticidade invalida.',
  }),
  /** Riscos presentes, separados por ponto e virgula. */
  riscosPresentes: opcional(z.string().trim().max(300)),
  exigeAutorizacaoEntrada: z.boolean().default(false),
  exigePermissaoTrabalho: z.boolean().default(false),

  /* --- Responsavel pela area ---------------------------------------------- */
  responsavelNome: opcional(z.string().trim().max(120)),
  responsavelCargo: opcional(z.string().trim().max(80)),
  responsavelEmail: opcional(z.string().trim().toLowerCase().email('E-mail do responsavel invalido.').max(150)),
  responsavelTelefone: opcional(
    z.string().transform(limparTelefone).refine(isTelefoneValido, 'Telefone do responsavel invalido.'),
  ),

  /* --- Localizacao fisica -------------------------------------------------- */
  /** Coordenadas da placa do QR — usadas para conferir o GPS da observacao. */
  latitude: opcional(z.coerce.number().min(-90, 'Latitude invalida.').max(90, 'Latitude invalida.')),
  longitude: opcional(z.coerce.number().min(-180, 'Longitude invalida.').max(180, 'Longitude invalida.')),
  pontoReferencia: opcional(z.string().trim().max(150)),
  /** Posicao X (0–100%) da area sobre a imagem de planta baixa do cliente. */
  coordPlantaX: opcional(z.coerce.number().min(0, 'Coordenada X deve estar entre 0 e 100.').max(100, 'Coordenada X deve estar entre 0 e 100.')),
  /** Posicao Y (0–100%) da area sobre a imagem de planta baixa do cliente. */
  coordPlantaY: opcional(z.coerce.number().min(0, 'Coordenada Y deve estar entre 0 e 100.').max(100, 'Coordenada Y deve estar entre 0 e 100.')),

  /* --- Inspecao ------------------------------------------------------------ */
  /** Periodicidade minima de inspecao, em dias. */
  frequenciaInspecaoDias: z.coerce
    .number()
    .int('Frequencia deve ser um numero inteiro de dias.')
    .min(1, 'Frequencia deve ser de ao menos 1 dia.')
    .max(365, 'Frequencia deve ser de no maximo 365 dias.')
    .default(FREQUENCIA_INSPECAO_PADRAO),
  situacao: z.enum(SITUACOES_AREA).default('ATIVA'),
  observacoes: opcional(z.string().trim().max(1000)),
});

/** Latitude e longitude andam juntas — meia coordenada nao localiza nada. */
function validarArea(
  dados: { latitude?: number | null; longitude?: number | null },
  ctx: z.RefinementCtx,
): void {
  const temLatitude = dados.latitude !== null && dados.latitude !== undefined;
  const temLongitude = dados.longitude !== null && dados.longitude !== undefined;

  if (temLatitude !== temLongitude) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [temLatitude ? 'longitude' : 'latitude'],
      message: 'Informe latitude e longitude juntas, ou deixe as duas em branco.',
    });
  }
}

export const areaCreateSchema = areaBaseSchema.superRefine(validarArea);
export const areaUpdateSchema = areaBaseSchema.partial().superRefine(validarArea);

export type AreaCreateInput = z.input<typeof areaCreateSchema>;
export type AreaCreateData = z.output<typeof areaCreateSchema>;
export type AreaUpdateInput = z.input<typeof areaUpdateSchema>;

/* -------------------------------------------------------------------------- */
/* Filtros da listagem                                                         */
/* -------------------------------------------------------------------------- */

export const ORDENACOES_AREA = ['nome', 'codigo', 'criticidade', 'setor', 'criadoEm'] as const;
export type OrdenacaoArea = (typeof ORDENACOES_AREA)[number];

export const areaFiltroSchema = z.object({
  /** Busca por nome, codigo, setor, riscos ou ponto de referencia. */
  busca: z.string().trim().max(120).optional(),
  clienteId: z.string().uuid('Cliente invalido.').optional(),
  centroNegocioId: z.string().uuid('Centro de negocio invalido.').optional(),
  tipo: z.enum(TIPOS_AREA).optional(),
  criticidade: z.enum(CRITICIDADES_AREA_CADASTRO).optional(),
  situacao: z.enum(SITUACOES_AREA).optional(),
  ordenarPor: z.enum(ORDENACOES_AREA).default('nome'),
  direcao: z.enum(['asc', 'desc']).default('asc'),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(20),
});

export type AreaFiltro = z.output<typeof areaFiltroSchema>;

/* -------------------------------------------------------------------------- */
/* QR Code                                                                     */
/* -------------------------------------------------------------------------- */

/** Alfabeto do token do QR: sem caracteres ambiguos (0/O, 1/I/L). */
export const ALFABETO_TOKEN_QR = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const TAMANHO_TOKEN_QR = 10;

/** `true` quando o texto tem o formato de token de QR de area. */
export function isTokenQrValido(token: string): boolean {
  if (typeof token !== 'string' || token.length !== TAMANHO_TOKEN_QR) return false;
  return token.split('').every((caractere) => ALFABETO_TOKEN_QR.includes(caractere));
}

/**
 * URL gravada no QR Code da area. Abrir esse endereco no celular leva direto
 * ao formulario de observacao com cliente e area ja preenchidos.
 */
export function urlDaInspecao(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/inspecao/${token}`;
}

/* -------------------------------------------------------------------------- */
/* Formulario                                                                  */
/* -------------------------------------------------------------------------- */

export type AreaFormValues = Omit<
  { [Campo in keyof AreaCreateData]-?: string },
  'exigeAutorizacaoEntrada' | 'exigePermissaoTrabalho'
> & { exigeAutorizacaoEntrada: boolean; exigePermissaoTrabalho: boolean };
