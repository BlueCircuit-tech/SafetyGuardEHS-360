import { z } from 'zod';
import { dataNaoFutura, opcional, texto } from './comuns.js';
import type { GrauRiscoOcorrencia } from '../indicadores/risco.js';

/**
 * Etapa 16 — Meio Ambiente e ESG.
 *
 * Duas pecas:
 * 1. **Ocorrencias ambientais** (derramamento, vazamento, emissao...) — meta
 *    do plano diretor: ZERO. Grau I dispara a matriz de comunicacao
 *    (evento OCORRENCIA_AMBIENTAL: Meio Ambiente 0h → Gerente +2h → Diretoria +4h).
 * 2. **Indicadores mensais ESG** (agua, energia, residuos, reciclagem,
 *    emissoes) — leitura por competencia, por cliente.
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
