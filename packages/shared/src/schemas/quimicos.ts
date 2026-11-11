import { z } from 'zod';
import { diasAteVencer } from '../indicadores/conformidade.js';
import { dataOpcional, opcional, texto } from './comuns.js';

/**
 * Etapa 24 — Produtos Quimicos (GHS / FDS).
 *
 * Inventario de produtos quimicos com a classificacao GHS (pictogramas,
 * palavra de advertencia e frases de perigo), o local de armazenamento, os
 * EPIs exigidos e a Ficha de Dados de Seguranca (FDS, antiga FISPQ) anexada
 * com validade. A ficha resumo imprimivel serve como rotulo e ficha de
 * emergencia da area.
 */

/* -------------------------------------------------------------------------- */
/* Pictogramas GHS                                                             */
/* -------------------------------------------------------------------------- */

export const CODIGOS_PICTOGRAMA_GHS = [
  'GHS01',
  'GHS02',
  'GHS03',
  'GHS04',
  'GHS05',
  'GHS06',
  'GHS07',
  'GHS08',
  'GHS09',
] as const;
export type CodigoPictogramaGhs = (typeof CODIGOS_PICTOGRAMA_GHS)[number];

export interface PictogramaGhs {
  codigo: CodigoPictogramaGhs;
  nome: string;
  descricao: string;
}

export const PICTOGRAMAS_GHS: readonly PictogramaGhs[] = [
  { codigo: 'GHS01', nome: 'Explosivo', descricao: 'Explosivos, substancias e misturas autorreativas e peroxidos organicos.' },
  { codigo: 'GHS02', nome: 'Inflamavel', descricao: 'Gases, aerossois, liquidos e solidos inflamaveis; piroforicos e autoaqueciveis.' },
  { codigo: 'GHS03', nome: 'Oxidante', descricao: 'Gases, liquidos e solidos oxidantes que intensificam o fogo.' },
  { codigo: 'GHS04', nome: 'Gas sob pressao', descricao: 'Gases comprimidos, liquefeitos, refrigerados ou dissolvidos.' },
  { codigo: 'GHS05', nome: 'Corrosivo', descricao: 'Corrosao da pele, lesoes oculares graves e corrosao de metais.' },
  { codigo: 'GHS06', nome: 'Toxicidade aguda', descricao: 'Toxicidade aguda grave (oral, dermica ou por inalacao).' },
  { codigo: 'GHS07', nome: 'Irritante / nocivo', descricao: 'Irritacao, sensibilizacao cutanea, toxicidade aguda leve ou narcose.' },
  { codigo: 'GHS08', nome: 'Perigo a saude', descricao: 'Carcinogenicidade, mutagenicidade, toxicidade reprodutiva ou sistemica.' },
  { codigo: 'GHS09', nome: 'Perigo ao ambiente', descricao: 'Perigo agudo ou cronico ao ambiente aquatico.' },
];

export const ROTULO_PICTOGRAMA_GHS: Record<CodigoPictogramaGhs, string> = Object.fromEntries(
  PICTOGRAMAS_GHS.map((p) => [p.codigo, p.nome]),
) as Record<CodigoPictogramaGhs, string>;

/* -------------------------------------------------------------------------- */
/* Dominio                                                                     */
/* -------------------------------------------------------------------------- */

export const ESTADOS_FISICOS = ['SOLIDO', 'LIQUIDO', 'GAS', 'AEROSSOL'] as const;
export type EstadoFisico = (typeof ESTADOS_FISICOS)[number];

export const ROTULO_ESTADO_FISICO: Record<EstadoFisico, string> = {
  SOLIDO: 'Solido',
  LIQUIDO: 'Liquido',
  GAS: 'Gas',
  AEROSSOL: 'Aerossol',
};

export const PALAVRAS_ADVERTENCIA = ['PERIGO', 'ATENCAO'] as const;
export type PalavraAdvertencia = (typeof PALAVRAS_ADVERTENCIA)[number];

export const ROTULO_PALAVRA_ADVERTENCIA: Record<PalavraAdvertencia, string> = {
  PERIGO: 'Perigo',
  ATENCAO: 'Atencao',
};

export const UNIDADES_ESTOQUE_QUIMICO = ['L', 'mL', 'kg', 'g', 'm3', 'un', 'gal', 'tambor'] as const;

/* -------------------------------------------------------------------------- */
/* Situacao da FDS                                                             */
/* -------------------------------------------------------------------------- */

export const SITUACOES_FDS = ['VIGENTE', 'A_VENCER', 'VENCIDA', 'SEM_FDS'] as const;
export type SituacaoFds = (typeof SITUACOES_FDS)[number];

export const ROTULO_SITUACAO_FDS: Record<SituacaoFds, string> = {
  VIGENTE: 'FDS vigente',
  A_VENCER: 'FDS a vencer',
  VENCIDA: 'FDS vencida',
  SEM_FDS: 'Sem FDS',
};

export const DIAS_ALERTA_FDS = 30;

/**
 * Situacao da Ficha de Dados de Seguranca.
 *
 * - Sem arquivo e sem validade: `SEM_FDS` (cadastro incompleto).
 * - Com arquivo e sem validade: `VIGENTE` — a FDS nao tem prazo legal fixo;
 *   a validade cadastrada e a revisao periodica adotada pela empresa.
 * - Com validade: vencida quando a data ja passou; a vencer dentro de 30 dias.
 */
export function fdsSituacao(
  validade: Date | string | null | undefined,
  hoje: Date = new Date(),
  possuiArquivo = false,
): SituacaoFds {
  const dias = diasAteVencer(validade, hoje);
  if (dias === null) return possuiArquivo ? 'VIGENTE' : 'SEM_FDS';
  if (dias < 0) return 'VENCIDA';
  if (dias <= DIAS_ALERTA_FDS) return 'A_VENCER';
  return 'VIGENTE';
}

/* -------------------------------------------------------------------------- */
/* Schemas                                                                     */
/* -------------------------------------------------------------------------- */

const produtoQuimicoBaseSchema = z.object({
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente invalido.'),
  areaId: opcional(z.string().uuid('Area invalida.')),
  nome: texto(2, 150, 'Nome do produto'),
  fabricante: opcional(z.string().trim().max(120, 'Fabricante deve ter no maximo 120 caracteres.')),
  /** Numero CAS no formato 0000-00-0 (ate 7 digitos no primeiro bloco). */
  numeroCas: opcional(
    z
      .string()
      .trim()
      .max(20)
      .regex(/^\d{2,7}-\d{2}-\d$/, 'Numero CAS invalido (ex.: 67-64-1).'),
  ),
  estadoFisico: opcional(z.enum(ESTADOS_FISICOS, { errorMap: () => ({ message: 'Estado fisico invalido.' }) })),
  pictogramas: z
    .array(z.enum(CODIGOS_PICTOGRAMA_GHS, { errorMap: () => ({ message: 'Pictograma invalido.' }) }))
    .max(9)
    .default([])
    .transform((lista) => Array.from(new Set(lista))),
  palavraAdvertencia: opcional(
    z.enum(PALAVRAS_ADVERTENCIA, { errorMap: () => ({ message: 'Palavra de advertencia invalida.' }) }),
  ),
  /** Frases H (ex.: "H225 Liquido e vapores altamente inflamaveis; H319 ..."). */
  frasesPerigo: opcional(z.string().trim().max(500, 'Frases de perigo devem ter no maximo 500 caracteres.')),
  classificacao: opcional(z.string().trim().max(200, 'Classificacao deve ter no maximo 200 caracteres.')),
  localArmazenamento: opcional(z.string().trim().max(150, 'Local deve ter no maximo 150 caracteres.')),
  quantidadeEstoque: opcional(z.coerce.number().min(0, 'Quantidade nao pode ser negativa.').max(9_999_999_999)),
  unidade: opcional(z.string().trim().max(10, 'Unidade deve ter no maximo 10 caracteres.')),
  episNecessarios: opcional(z.string().trim().max(300, 'EPIs devem ter no maximo 300 caracteres.')),
  medidasControle: opcional(z.string().trim().max(500, 'Medidas de controle devem ter no maximo 500 caracteres.')),
  fdsValidade: dataOpcional('Validade da FDS'),
  observacoes: opcional(z.string().trim().max(500, 'Observacoes devem ter no maximo 500 caracteres.')),
  ativo: z.boolean().default(true),
});

export const produtoQuimicoCreateSchema = produtoQuimicoBaseSchema;
export const produtoQuimicoUpdateSchema = produtoQuimicoBaseSchema.partial();

export type ProdutoQuimicoCreateInput = z.input<typeof produtoQuimicoCreateSchema>;
export type ProdutoQuimicoCreateData = z.output<typeof produtoQuimicoCreateSchema>;
export type ProdutoQuimicoUpdateData = z.output<typeof produtoQuimicoUpdateSchema>;

export const produtoQuimicoFiltroSchema = z.object({
  clienteId: z.string().uuid().optional(),
  areaId: z.string().uuid().optional(),
  busca: z.string().trim().max(120).optional(),
  pictograma: z.enum(CODIGOS_PICTOGRAMA_GHS).optional(),
  inativos: z.preprocess((v) => v === true || v === 'true', z.boolean()).default(false),
});

export type ProdutoQuimicoFiltro = z.output<typeof produtoQuimicoFiltroSchema>;
