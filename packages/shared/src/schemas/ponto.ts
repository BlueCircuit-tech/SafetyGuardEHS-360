import { z } from 'zod';
import { dataObrigatoria, dataOpcional, opcional } from './comuns.js';

/* -------------------------------------------------------------------------- */
/* Dominio                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Etapa 24 — Cartao de ponto do consultor.
 *
 * Cada registro e um turno: entrada, saida, intervalo e, opcionalmente, o
 * cliente em que o consultor esteve. As horas liquidas e o valor (horas x
 * valor/hora fotografado no momento) alimentam o fechamento mensal por cliente.
 */

/** Intervalo maximo aceito num unico turno (12h). */
export const INTERVALO_MAXIMO_MINUTOS = 720;

/** Duracao maxima de um turno (24h) — acima disso e erro de digitacao. */
export const TURNO_MAXIMO_HORAS = 24;

/* -------------------------------------------------------------------------- */
/* Regras puras                                                                */
/* -------------------------------------------------------------------------- */

function paraData(valor: Date | string | number | null | undefined): Date | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * Horas liquidas do turno em horas decimais com 2 casas:
 * (saida - entrada) - intervalo. `null` enquanto o turno esta aberto ou quando
 * os horarios nao fecham (saida antes da entrada).
 */
export function horasLiquidas(
  entrada: Date | string | number,
  saida: Date | string | number | null | undefined,
  intervaloMinutos = 0,
): number | null {
  const inicio = paraData(entrada);
  const fim = paraData(saida);
  if (!inicio || !fim) return null;

  const minutos = (fim.getTime() - inicio.getTime()) / 60_000 - Math.max(0, intervaloMinutos || 0);
  if (minutos <= 0) return null;
  return Math.round((minutos / 60) * 100) / 100;
}

/** Valor do turno = horas x valor/hora, 2 casas. `null` sem horas ou sem valor/hora. */
export function valorDoRegistro(horas: number | null | undefined, valorHora: number | null | undefined): number | null {
  if (horas === null || horas === undefined || valorHora === null || valorHora === undefined) return null;
  if (Number.isNaN(horas) || Number.isNaN(valorHora)) return null;
  return Math.round(horas * valorHora * 100) / 100;
}

/** `2026-03` -> inicio (inclusivo) e fim (exclusivo) do mes, em UTC. */
export function intervaloDoMes(mes: string): { inicio: Date; fim: Date } {
  const [ano, mesNumero] = mes.split('-').map(Number);
  const inicio = new Date(Date.UTC(ano!, mesNumero! - 1, 1));
  const fim = new Date(Date.UTC(ano!, mesNumero!, 1));
  return { inicio, fim };
}

/** Mes corrente no formato `YYYY-MM` (fuso local). */
export function mesAtual(hoje: Date = new Date()): string {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------- */
/* Schemas de escrita                                                          */
/* -------------------------------------------------------------------------- */

const pontoBaseSchema = z.object({
  clienteId: opcional(z.string().uuid('Cliente invalido.')),
  /** Dia do turno (data pura). */
  data: dataObrigatoria('Data'),
  /** Horario de entrada (data e hora). */
  entrada: dataObrigatoria('Entrada'),
  saida: dataOpcional('Saida'),
  intervaloMinutos: z.coerce
    .number({ invalid_type_error: 'Intervalo invalido.' })
    .int('Intervalo deve ser em minutos inteiros.')
    .min(0, 'Intervalo nao pode ser negativo.')
    .max(INTERVALO_MAXIMO_MINUTOS, `Intervalo deve ter no maximo ${INTERVALO_MAXIMO_MINUTOS} minutos.`)
    .default(0),
  atividade: opcional(z.string().trim().max(300, 'Atividade deve ter no maximo 300 caracteres.')),
});

function validarTurno(
  dados: { entrada?: Date; saida?: Date | null; intervaloMinutos?: number },
  ctx: z.RefinementCtx,
): void {
  if (!dados.entrada || !dados.saida) return;

  if (dados.saida.getTime() <= dados.entrada.getTime()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['saida'], message: 'Saida deve ser depois da entrada.' });
    return;
  }

  const horasBrutas = (dados.saida.getTime() - dados.entrada.getTime()) / 3_600_000;
  if (horasBrutas > TURNO_MAXIMO_HORAS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['saida'],
      message: `Um turno nao pode passar de ${TURNO_MAXIMO_HORAS} horas — confira as datas.`,
    });
  }

  if (horasLiquidas(dados.entrada, dados.saida, dados.intervaloMinutos ?? 0) === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['intervaloMinutos'],
      message: 'Intervalo maior que o proprio turno.',
    });
  }
}

export const pontoCreateSchema = pontoBaseSchema.superRefine(validarTurno);
export const pontoUpdateSchema = pontoBaseSchema.partial().superRefine(validarTurno);

export type PontoCreateInput = z.input<typeof pontoCreateSchema>;
export type PontoCreateData = z.output<typeof pontoCreateSchema>;
export type PontoUpdateInput = z.input<typeof pontoUpdateSchema>;
export type PontoUpdateData = z.output<typeof pontoUpdateSchema>;

/** Define o valor/hora de um usuario (o proprio, ou outro para quem gerencia usuarios). */
export const valorHoraSchema = z.object({
  usuarioId: opcional(z.string().uuid('Usuario invalido.')),
  valorHora: opcional(
    z.coerce
      .number({ invalid_type_error: 'Valor/hora invalido.' })
      .min(0, 'Valor/hora nao pode ser negativo.')
      .max(99_999_999.99, 'Valor/hora acima do limite.'),
  ),
});

export type ValorHoraInput = z.input<typeof valorHoraSchema>;

/* -------------------------------------------------------------------------- */
/* Filtros                                                                     */
/* -------------------------------------------------------------------------- */

export const MES_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export const pontoFiltroSchema = z.object({
  mes: z.string().regex(MES_REGEX, 'Mes deve estar no formato AAAA-MM.').optional(),
  usuarioId: z.string().uuid('Usuario invalido.').optional(),
  clienteId: z.string().uuid('Cliente invalido.').optional(),
});

export type PontoFiltro = z.output<typeof pontoFiltroSchema>;
