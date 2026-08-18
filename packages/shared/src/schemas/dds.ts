import { z } from 'zod';
import { dataNaoFutura, opcional, texto } from './comuns.js';

/**
 * Etapa 13 — DDS Digital (Dialogo Diario de Seguranca).
 *
 * Banco de temas (semeado do acervo "100 Temas de DDS Prontos" — o documento
 * contem 90 temas numerados) + registro da realizacao com lider, area e
 * numero de participantes. O indicador e a constancia: DDS realizados no
 * periodo e participacao media.
 */

const ddsBaseSchema = z.object({
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente invalido.'),
  areaId: opcional(z.string().uuid('Area invalida.')),
  /** Tema do banco… */
  temaId: opcional(z.string().uuid('Tema invalido.')),
  /** …ou tema livre, quando o assunto do dia nao esta no banco. */
  temaLivre: opcional(z.string().trim().max(150)),
  data: dataNaoFutura('Data do DDS'),
  lider: texto(3, 120, 'Lider do DDS'),
  participantes: z.coerce
    .number({ required_error: 'Informe o numero de participantes.' })
    .int('Participantes deve ser um numero inteiro.')
    .min(1, 'Ao menos 1 participante.')
    .max(1000, 'No maximo 1000 participantes.'),
  duracaoMinutos: opcional(z.coerce.number().int().min(1).max(120)),
  observacoes: opcional(z.string().trim().max(1000)),
});

function validarDds(dados: { temaId?: string | null; temaLivre?: string | null }, ctx: z.RefinementCtx): void {
  if (!dados.temaId && !dados.temaLivre) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['temaId'],
      message: 'Escolha um tema do banco ou descreva o tema livre.',
    });
  }
}

export const ddsCreateSchema = ddsBaseSchema.superRefine(validarDds);
export const ddsUpdateSchema = ddsBaseSchema.partial().superRefine(validarDds);

export type DdsCreateInput = z.input<typeof ddsCreateSchema>;
export type DdsCreateData = z.output<typeof ddsCreateSchema>;

export const ddsFiltroSchema = z.object({
  clienteId: z.string().uuid('Cliente invalido.').optional(),
  areaId: z.string().uuid('Area invalida.').optional(),
  busca: z.string().trim().max(120).optional(),
  de: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(25),
});

export type DdsFiltro = z.output<typeof ddsFiltroSchema>;
