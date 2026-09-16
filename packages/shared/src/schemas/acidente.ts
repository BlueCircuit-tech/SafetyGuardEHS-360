import { z } from 'zod';
import { dataNaoFutura, dataOpcional, opcional, texto } from './comuns.js';

/**
 * Etapa 18 — Acidentes, CAT e Investigacao.
 *
 * Formaliza o que a observacao de campo so registra: o acidente com CAT
 * (evento S-2210 do eSocial — checklist do acervo da consultoria) e a
 * investigacao com causa raiz. O plano de acao da tratativa e vinculado, nao
 * duplicado.
 */

export const TIPOS_ACIDENTE = ['TIPICO', 'TRAJETO', 'DOENCA_OCUPACIONAL'] as const;
export type TipoAcidente = (typeof TIPOS_ACIDENTE)[number];

export const ROTULO_TIPO_ACIDENTE: Record<TipoAcidente, string> = {
  TIPICO: 'Tipico (no exercicio do trabalho)',
  TRAJETO: 'De trajeto',
  DOENCA_OCUPACIONAL: 'Doenca ocupacional',
};

export const SITUACOES_INVESTIGACAO = ['ABERTA', 'EM_INVESTIGACAO', 'CONCLUIDA'] as const;
export type SituacaoInvestigacao = (typeof SITUACOES_INVESTIGACAO)[number];

export const ROTULO_INVESTIGACAO: Record<SituacaoInvestigacao, string> = {
  ABERTA: 'Investigacao aberta',
  EM_INVESTIGACAO: 'Em investigacao',
  CONCLUIDA: 'Investigacao concluida',
};

/** Prazo legal da CAT: ate o 1o dia util seguinte (obito: imediato). */
export const PRAZO_CAT_DIAS_UTEIS = 1;

/* -------------------------------------------------------------------------- */
/* Investigacao estruturada: Ishikawa (6M) e 5 Porques                        */
/* -------------------------------------------------------------------------- */

export const CATEGORIAS_ISHIKAWA = ['metodo', 'maquina', 'material', 'maoDeObra', 'medida', 'meioAmbiente'] as const;
export type CategoriaIshikawa = (typeof CATEGORIAS_ISHIKAWA)[number];

export const ROTULO_ISHIKAWA: Record<CategoriaIshikawa, string> = {
  metodo: 'Metodo',
  maquina: 'Maquina',
  material: 'Material',
  maoDeObra: 'Mao de obra',
  medida: 'Medida',
  meioAmbiente: 'Meio ambiente',
};

/** Pergunta-guia de cada M, para orientar quem investiga. */
export const PERGUNTA_ISHIKAWA: Record<CategoriaIshikawa, string> = {
  metodo: 'O procedimento existia, era conhecido e foi seguido?',
  maquina: 'O equipamento estava integro, protegido e adequado a tarefa?',
  material: 'O material ou insumo tinha a qualidade e a condicao esperadas?',
  maoDeObra: 'A pessoa estava treinada, habilitada e em condicoes de executar?',
  medida: 'Havia inspecao, medicao ou controle que deveria ter detectado o problema?',
  meioAmbiente: 'Iluminacao, ruido, piso, clima ou layout contribuiram?',
};

const listaDeCausas = z.array(z.string().trim().min(3).max(300)).max(20).default([]);

/** Cada categoria e uma lista de causas; categoria vazia e permitida. */
export const ishikawaSchema = z.object({
  metodo: listaDeCausas,
  maquina: listaDeCausas,
  material: listaDeCausas,
  maoDeObra: listaDeCausas,
  medida: listaDeCausas,
  meioAmbiente: listaDeCausas,
});
export type Ishikawa = z.output<typeof ishikawaSchema>;

export const ISHIKAWA_VAZIO: Ishikawa = {
  metodo: [],
  maquina: [],
  material: [],
  maoDeObra: [],
  medida: [],
  meioAmbiente: [],
};

/**
 * Os 5 Porques: lista ordenada. Aceita de 1 a 7 — cinco e a convencao, mas a
 * cadeia para quando chega a uma causa que a organizacao consegue controlar.
 */
export const cincoPorquesSchema = z
  .array(z.string().trim().min(3, 'Descreva o porque.').max(500))
  .min(1, 'Registre ao menos um porque.')
  .max(7);
export type CincoPorques = z.output<typeof cincoPorquesSchema>;

/** Quantas causas foram levantadas no Ishikawa, somando as seis categorias. */
export function totalCausasIshikawa(ishikawa: Ishikawa | null | undefined): number {
  if (!ishikawa) return 0;
  return CATEGORIAS_ISHIKAWA.reduce((soma, categoria) => soma + (ishikawa[categoria]?.length ?? 0), 0);
}

const acidenteBaseSchema = z.object({
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente invalido.'),
  areaId: opcional(z.string().uuid('Area invalida.')),
  colaboradorId: opcional(z.string().uuid('Colaborador invalido.')),
  observacaoId: opcional(z.string().uuid('Observacao invalida.')),
  planoAcaoId: opcional(z.string().uuid('Plano invalido.')),

  data: dataNaoFutura('Data do acidente'),
  tipo: z.enum(TIPOS_ACIDENTE, { required_error: 'Informe o tipo do acidente.' }),
  descricao: texto(10, 2000, 'Descricao do acidente'),
  parteCorpoAtingida: opcional(z.string().trim().max(120)),
  comAfastamento: z.boolean().default(false),
  diasAfastamento: z.coerce.number().int().min(0).max(10000).default(0),

  /* --- CAT ---------------------------------------------------------------- */
  catNumero: opcional(z.string().trim().max(40)),
  catEmitidaEm: opcional(dataOpcional('Emissao da CAT')),

  /* --- Investigacao ------------------------------------------------------- */
  situacaoInvestigacao: z.enum(SITUACOES_INVESTIGACAO).default('ABERTA'),
  investigador: opcional(z.string().trim().max(120)),
  causaRaiz: opcional(z.string().trim().max(1000)),
  fatoresContribuintes: opcional(z.string().trim().max(1000)),
  investigacaoConcluidaEm: opcional(dataOpcional('Conclusao da investigacao')),

  /* --- Investigacao estruturada ------------------------------------------- */
  ishikawa: ishikawaSchema.nullable().optional(),
  cincoPorques: cincoPorquesSchema.nullable().optional(),
});

function validarAcidente(
  dados: {
    comAfastamento?: boolean;
    diasAfastamento?: number;
    situacaoInvestigacao?: SituacaoInvestigacao;
    causaRaiz?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (dados.comAfastamento === false && (dados.diasAfastamento ?? 0) > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['diasAfastamento'],
      message: 'Sem afastamento, os dias devem ser zero.',
    });
  }

  // Investigacao concluida sem causa raiz nao investigou nada.
  if (dados.situacaoInvestigacao === 'CONCLUIDA' && !dados.causaRaiz) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['causaRaiz'],
      message: 'Investigacao concluida exige a causa raiz.',
    });
  }
}

export const acidenteCreateSchema = acidenteBaseSchema.superRefine(validarAcidente);

/** Sem a regra cruzada — o update e validado sobre o estado mesclado. */
export const acidenteUpdateSchema = acidenteBaseSchema.partial();

/** Problemas do acidente no estado FINAL (registro + alteracoes). */
export function problemasDoAcidente(estado: {
  comAfastamento?: boolean | null;
  diasAfastamento?: number | null;
  situacaoInvestigacao?: SituacaoInvestigacao | string | null;
  causaRaiz?: string | null;
}): Record<string, string[]> {
  const problemas: Record<string, string[]> = {};

  if (estado.comAfastamento === false && (estado.diasAfastamento ?? 0) > 0) {
    problemas.diasAfastamento = ['Sem afastamento, os dias devem ser zero.'];
  }
  if (estado.situacaoInvestigacao === 'CONCLUIDA' && !estado.causaRaiz) {
    problemas.causaRaiz = ['Investigacao concluida exige a causa raiz.'];
  }

  return problemas;
}

export type AcidenteCreateData = z.output<typeof acidenteCreateSchema>;
