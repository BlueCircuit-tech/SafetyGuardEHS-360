import { z } from 'zod';
import { dataNaoFutura, dataOpcional, opcional, texto } from './comuns.js';

/**
 * Etapa 21 — Absenteísmo.
 *
 * Registro de afastamento de colaborador. A taxa de absenteísmo (TA) é
 * calculada sobre estes registros:
 *   TA = (total_dias_afastados / (n_colaboradores × dias_úteis_período)) × 100
 *
 * O vínculo com Acidente é opcional: afastamentos por doença comum não
 * precisam de CAT.
 */

export const TIPOS_AFASTAMENTO = [
  'DOENCA_COMUM',
  'DOENCA_OCUPACIONAL',
  'ACIDENTE_TRABALHO',
  'ACIDENTE_TRAJETO',
  'MATERNIDADE',
  'PATERNIDADE',
  'LICENCA_TRATAMENTO',
  'OUTRO',
] as const;

export type TipoAfastamento = (typeof TIPOS_AFASTAMENTO)[number];

export const ROTULO_TIPO_AFASTAMENTO: Record<TipoAfastamento, string> = {
  DOENCA_COMUM: 'Doença comum',
  DOENCA_OCUPACIONAL: 'Doença ocupacional',
  ACIDENTE_TRABALHO: 'Acidente de trabalho',
  ACIDENTE_TRAJETO: 'Acidente de trajeto',
  MATERNIDADE: 'Licença maternidade',
  PATERNIDADE: 'Licença paternidade',
  LICENCA_TRATAMENTO: 'Licença para tratamento',
  OUTRO: 'Outro',
};

/** Tipos que devem estar vinculados a um Acidente registrado. */
export const TIPOS_COM_CAT: TipoAfastamento[] = ['ACIDENTE_TRABALHO', 'ACIDENTE_TRAJETO'];

const afastamentoBaseSchema = z.object({
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente inválido.'),
  colaboradorId: z.string({ required_error: 'Informe o colaborador.' }).uuid('Colaborador inválido.'),
  acidenteId: opcional(z.string().uuid('Acidente inválido.')),

  tipo: z.enum(TIPOS_AFASTAMENTO, { required_error: 'Informe o tipo de afastamento.' }),
  dataInicio: dataNaoFutura('Data de início'),
  dataFim: opcional(dataOpcional('Data de retorno')),
  diasAfastamento: z.coerce.number().int().min(0).max(3650).default(0),

  /** CID-10 opcional — exigido para doença comum e doença ocupacional. */
  cid: opcional(z.string().trim().max(10)),
  descricao: opcional(z.string().trim().max(500)),
});

function validarAfastamento(
  dados: { tipo: TipoAfastamento; dataInicio: Date; dataFim?: Date | null; cid?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (dados.dataFim && dados.dataFim < dados.dataInicio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dataFim'],
      message: 'Data de retorno deve ser posterior ao início.',
    });
  }
  if ((dados.tipo === 'DOENCA_COMUM' || dados.tipo === 'DOENCA_OCUPACIONAL') && !dados.cid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cid'],
      message: 'Informe o CID-10 para este tipo de afastamento.',
    });
  }
}

export const afastamentoCreateSchema = afastamentoBaseSchema.superRefine(validarAfastamento);
export const afastamentoUpdateSchema = afastamentoBaseSchema.partial();

export type AfastamentoCreateData = z.output<typeof afastamentoCreateSchema>;

/**
 * Taxa de Absenteísmo (TA) — fórmula padrão OIT.
 *
 *   TA = (total_dias_afastados / (n_colaboradores × dias_periodo)) × 100
 */
export function calcularTaxaAbsenteismo(totalDias: number, nColaboradores: number, diasPeriodo: number): number {
  if (nColaboradores === 0 || diasPeriodo === 0) return 0;
  return Math.round((totalDias / (nColaboradores * diasPeriodo)) * 10000) / 100;
}

/**
 * Dias úteis num intervalo — aproximação padrão (exclui sábados e domingos).
 * Feriados não são descontados aqui: dependem do município e precisariam de
 * um calendário importado, o que está fora do escopo do MVP.
 */
export function diasUteisEntre(inicio: Date, fim: Date): number {
  if (fim <= inicio) return 0;
  let total = 0;
  const cursor = new Date(inicio);
  while (cursor <= fim) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) total++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}
