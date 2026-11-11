import { z } from 'zod';
import { dataNaoFutura, opcional, texto } from './comuns.js';
import type { GrauRiscoOcorrencia } from '../indicadores/risco.js';
import type { TipoDocumento } from './documento.js';

/**
 * Etapa 16 — Meio Ambiente e ESG.
 *
 * Duas pecas:
 * 1. **Ocorrencias ambientais** (derramamento, vazamento, emissao...) — meta
 *    do plano diretor: ZERO. Grau I dispara a matriz de comunicacao
 *    (evento OCORRENCIA_AMBIENTAL: Meio Ambiente 0h → Gerente +2h → Diretoria +4h).
 * 2. **Indicadores mensais ESG** (agua, energia, residuos, reciclagem,
 *    emissoes) — leitura por competencia, por cliente.
 *
 * Etapa 24 acrescenta:
 * 3. **Aspectos e impactos ambientais** (LAIA, ISO 14001 6.1.2) — matriz
 *    severidade x probabilidade por atividade; significancia e calculada
 *    no servidor, nunca vem do cliente.
 * 4. **Documentos ambientais** (licenca, PGRSS, PGRS, CTR/manifesto,
 *    inventario de residuos) — vivem no acervo de documentos legais
 *    (`DocumentoSsma`, com controle de versao); aqui so a lista de tipos.
 */

export const TIPOS_OCORRENCIA_AMBIENTAL = [
  'DERRAMAMENTO',
  'VAZAMENTO',
  'EMISSAO_NAO_CONTROLADA',
  'DESCARTE_IRREGULAR',
  'PRODUTO_QUIMICO',
  'OUTRO',
] as const;
export type TipoOcorrenciaAmbiental = (typeof TIPOS_OCORRENCIA_AMBIENTAL)[number];

export const ROTULO_OCORRENCIA_AMBIENTAL: Record<TipoOcorrenciaAmbiental, string> = {
  DERRAMAMENTO: 'Derramamento',
  VAZAMENTO: 'Vazamento',
  EMISSAO_NAO_CONTROLADA: 'Emissao nao controlada',
  DESCARTE_IRREGULAR: 'Descarte irregular de residuo',
  PRODUTO_QUIMICO: 'Incidente com produto quimico',
  OUTRO: 'Outro',
};

const ocorrenciaAmbientalBaseSchema = z.object({
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente invalido.'),
  areaId: opcional(z.string().uuid('Area invalida.')),
  tipo: z.enum(TIPOS_OCORRENCIA_AMBIENTAL, { required_error: 'Informe o tipo.' }),
  data: dataNaoFutura('Data da ocorrencia'),
  descricao: texto(10, 2000, 'Descricao da ocorrencia'),
  /** Grau I aciona a matriz de comunicacao imediatamente. */
  grauRisco: z.enum(['I', 'II', 'III'], { required_error: 'Informe o grau de risco.' }),
  /** Volume estimado com unidade livre (L, kg, m3). */
  volumeEstimado: opcional(z.string().trim().max(40)),
  contida: z.boolean().default(false),
  acaoImediata: opcional(z.string().trim().max(1000)),
  responsavel: texto(3, 120, 'Responsavel pelo registro'),
});

export const ocorrenciaAmbientalCreateSchema = ocorrenciaAmbientalBaseSchema;
export const ocorrenciaAmbientalUpdateSchema = ocorrenciaAmbientalBaseSchema.partial();

export type OcorrenciaAmbientalCreateData = z.output<typeof ocorrenciaAmbientalCreateSchema>;
export type GrauOcorrenciaAmbiental = GrauRiscoOcorrencia;

/* -------------------------------------------------------------------------- */
/* Indicadores mensais                                                         */
/* -------------------------------------------------------------------------- */

export const indicadorAmbientalSchema = z.object({
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente invalido.'),
  /** Competencia: sempre o dia 1 do mes. */
  competencia: dataNaoFutura('Competencia'),
  aguaM3: opcional(z.coerce.number().min(0).max(1e9)),
  energiaKwh: opcional(z.coerce.number().min(0).max(1e9)),
  residuosKg: opcional(z.coerce.number().min(0).max(1e9)),
  residuosRecicladosKg: opcional(z.coerce.number().min(0).max(1e9)),
  emissoesTco2: opcional(z.coerce.number().min(0).max(1e9)),
});

export type IndicadorAmbientalData = z.output<typeof indicadorAmbientalSchema>;

/* -------------------------------------------------------------------------- */
/* Nota do pilar                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A meta do plano diretor e ZERO ocorrencia ambiental — a nota parte de 100 e
 * desconta por ocorrencia nos ultimos 12 meses.
 *
 * **Convencao editavel, nao lei**: ocorrencia nao contida pesa 15 pontos;
 * contida, 5. Ajustar a severidade da regua e uma decisao de gestao — por
 * isso as constantes vivem aqui, num lugar so.
 */
export const PENALIDADE_OCORRENCIA_NAO_CONTIDA = 15;
export const PENALIDADE_OCORRENCIA_CONTIDA = 5;

export function notaAmbiental(ocorrencias: Array<{ contida: boolean }>): number {
  const desconto = ocorrencias.reduce(
    (soma, ocorrencia) =>
      soma + (ocorrencia.contida ? PENALIDADE_OCORRENCIA_CONTIDA : PENALIDADE_OCORRENCIA_NAO_CONTIDA),
    0,
  );
  return Math.max(0, 100 - desconto);
}

/* -------------------------------------------------------------------------- */
/* Aspectos e impactos ambientais                                              */
/* -------------------------------------------------------------------------- */

/**
 * Condicao operacional em que o aspecto se manifesta (ISO 14001):
 * NORMAL (rotina), ANORMAL (partida, parada, manutencao) ou EMERGENCIA
 * (incendio, derramamento, falha de contencao).
 */
export const CONDICOES_ASPECTO = ['NORMAL', 'ANORMAL', 'EMERGENCIA'] as const;
export type CondicaoAspecto = (typeof CONDICOES_ASPECTO)[number];

export const ROTULO_CONDICAO_ASPECTO: Record<CondicaoAspecto, string> = {
  NORMAL: 'Normal',
  ANORMAL: 'Anormal',
  EMERGENCIA: 'Emergencia',
};

/** Escalas de 1 a 5 (matriz 5x5). */
export const ESCALA_ASPECTO = [1, 2, 3, 4, 5] as const;

export const ROTULO_SEVERIDADE_ASPECTO: Record<number, string> = {
  1: 'Desprezivel',
  2: 'Baixa',
  3: 'Moderada',
  4: 'Alta',
  5: 'Critica',
};

export const ROTULO_PROBABILIDADE_ASPECTO: Record<number, string> = {
  1: 'Rara',
  2: 'Improvavel',
  3: 'Possivel',
  4: 'Provavel',
  5: 'Frequente',
};

/**
 * Significancia minima para o aspecto ser tratado como significativo.
 *
 * **Convencao editavel, nao lei**: 12 numa matriz 5x5 corresponde a
 * (3x4), (4x3), (4x4) e acima — o que a maioria dos SGA trata como faixa
 * de controle obrigatorio. Mudar a regua e decisao de gestao; por isso a
 * constante vive aqui, num lugar so.
 */
export const SIGNIFICANCIA_MINIMA_SIGNIFICATIVO = 12;

/** Significancia = severidade x probabilidade (1..25). Funcao pura. */
export function significanciaAmbiental(severidade: number, probabilidade: number): number {
  return severidade * probabilidade;
}

/** Aspecto significativo quando a significancia atinge a regua. Funcao pura. */
export function aspectoSignificativo(significancia: number): boolean {
  return significancia >= SIGNIFICANCIA_MINIMA_SIGNIFICATIVO;
}

function escalaAspecto(campo: string) {
  return z.coerce
    .number({ required_error: `Informe a ${campo}.`, invalid_type_error: `${campo} invalida.` })
    .int(`${campo} deve ser um inteiro de 1 a 5.`)
    .min(1, `${campo} deve ser de 1 a 5.`)
    .max(5, `${campo} deve ser de 1 a 5.`);
}

/**
 * O schema NAO aceita `significancia` nem `significativo`: `z.object` descarta
 * chaves desconhecidas, e o servidor recalcula os dois a partir de
 * severidade x probabilidade em toda escrita.
 */
const aspectoAmbientalBaseSchema = z.object({
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente invalido.'),
  areaId: opcional(z.string().uuid('Area invalida.')),
  atividade: texto(3, 150, 'Atividade'),
  aspecto: texto(3, 150, 'Aspecto ambiental'),
  impacto: texto(3, 200, 'Impacto ambiental'),
  condicao: z.enum(CONDICOES_ASPECTO, { invalid_type_error: 'Condicao invalida.' }).default('NORMAL'),
  severidade: escalaAspecto('severidade'),
  probabilidade: escalaAspecto('probabilidade'),
  controles: opcional(z.string().trim().max(500, 'Controles devem ter no maximo 500 caracteres.')),
  requisitoLegal: opcional(z.string().trim().max(200, 'Requisito legal deve ter no maximo 200 caracteres.')),
  responsavel: opcional(z.string().trim().max(120, 'Responsavel deve ter no maximo 120 caracteres.')),
});

export const aspectoAmbientalCreateSchema = aspectoAmbientalBaseSchema;
export const aspectoAmbientalUpdateSchema = aspectoAmbientalBaseSchema.partial();

export type AspectoAmbientalCreateData = z.output<typeof aspectoAmbientalCreateSchema>;
export type AspectoAmbientalUpdateData = z.output<typeof aspectoAmbientalUpdateSchema>;

/* -------------------------------------------------------------------------- */
/* Documentos ambientais                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Tipos do acervo de documentos legais que compoem o checklist ambiental.
 * Os documentos em si (com versao, validade e arquivo) sao `DocumentoSsma`.
 */
export const TIPOS_DOCUMENTO_AMBIENTAL: readonly TipoDocumento[] = [
  'LICENCA_AMBIENTAL',
  'PGRSS',
  'PGRS',
  'CTR_MANIFESTO',
  'INVENTARIO_RESIDUOS',
];
