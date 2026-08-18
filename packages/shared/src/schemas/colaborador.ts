import { z } from 'zod';
import { isCpfValido, limparCpf } from '../br/cpf.js';
import { isTelefoneValido, limparTelefone } from '../br/telefone.js';
import { dataNaoFutura, dataOpcional, opcional, texto } from './comuns.js';

/* -------------------------------------------------------------------------- */
/* Dominio                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * De quem e o colaborador.
 *
 * O mesmo canteiro tem gente do cliente e gente das contratadas, e a
 * conformidade e cobrada de quem emprega — por isso o vinculo e explicito.
 */
export const VINCULOS_COLABORADOR = ['CLIENTE', 'TERCEIRO', 'CONSULTORIA'] as const;
export type VinculoColaborador = (typeof VINCULOS_COLABORADOR)[number];

export const ROTULO_VINCULO_COLABORADOR: Record<VinculoColaborador, string> = {
  CLIENTE: 'Proprio do cliente',
  TERCEIRO: 'Empresa contratada',
  CONSULTORIA: 'Equipe da consultoria',
};

export const SITUACOES_COLABORADOR = ['ATIVO', 'AFASTADO', 'DESLIGADO'] as const;
export type SituacaoColaborador = (typeof SITUACOES_COLABORADOR)[number];

export const ROTULO_SITUACAO_COLABORADOR: Record<SituacaoColaborador, string> = {
  ATIVO: 'Ativo',
  AFASTADO: 'Afastado',
  DESLIGADO: 'Desligado',
};

/**
 * Grau de risco da funcao (NR-4).
 *
 * Define a periodicidade legal minima do exame periodico: funcao de risco
 * alto exige exame anual; as demais, bienal.
 */
export const GRAUS_RISCO_FUNCAO = ['BAIXO', 'MEDIO', 'ALTO'] as const;
export type GrauRiscoFuncao = (typeof GRAUS_RISCO_FUNCAO)[number];

export const ROTULO_GRAU_RISCO_FUNCAO: Record<GrauRiscoFuncao, string> = {
  BAIXO: 'Baixo',
  MEDIO: 'Medio',
  ALTO: 'Alto',
};

/** Periodicidade legal do exame periodico, em meses, por grau de risco. */
export const PERIODICIDADE_ASO_MESES: Record<GrauRiscoFuncao, number> = {
  BAIXO: 24,
  MEDIO: 24,
  ALTO: 12,
};

/* -------------------------------------------------------------------------- */
/* Schema de escrita                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Etapa 9 — Colaborador.
 *
 * E o sujeito do ASO e do PPP. Sem ele, "ASO vencido" nao tem a quem se
 * referir e a conformidade de saude vira um numero solto.
 */
const colaboradorBaseSchema = z.object({
  /* --- Vinculo ------------------------------------------------------------ */
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente invalido.'),
  vinculo: z.enum(VINCULOS_COLABORADOR, {
    required_error: 'Informe o vinculo do colaborador.',
    invalid_type_error: 'Vinculo invalido.',
  }),
  /** Obrigatorio quando o vinculo e TERCEIRO — e quem responde pelo ASO. */
  terceiroId: opcional(z.string().uuid('Empresa contratada invalida.')),
  /** Area de lotacao, quando aplicavel. */
  areaId: opcional(z.string().uuid('Area invalida.')),

  /* --- Identificacao ------------------------------------------------------ */
  nome: texto(3, 120, 'Nome do colaborador'),
  cpf: z
    .string({ required_error: 'CPF e obrigatorio.' })
    .transform(limparCpf)
    .refine((valor) => valor.length > 0, 'CPF e obrigatorio.')
    .refine(isCpfValido, 'CPF invalido.'),
  matricula: opcional(z.string().trim().max(30)),
  dataNascimento: opcional(dataNaoFutura('Data de nascimento')),

  /* --- Trabalho ----------------------------------------------------------- */
  funcao: texto(2, 80, 'Funcao'),
  setor: opcional(z.string().trim().max(80)),
  /** Grau de risco da funcao (NR-4) — define a periodicidade do exame. */
  grauRisco: z.enum(GRAUS_RISCO_FUNCAO, { required_error: 'Informe o grau de risco da funcao.' }).default('MEDIO'),
  /** Riscos ocupacionais da funcao, separados por ponto e virgula. */
  riscosOcupacionais: opcional(z.string().trim().max(300)),
  dataAdmissao: opcional(dataNaoFutura('Data de admissao')),
  dataDesligamento: opcional(dataOpcional('Data de desligamento')),

  /* --- Contato ------------------------------------------------------------ */
  email: opcional(z.string().trim().toLowerCase().email('E-mail invalido.').max(150)),
  telefone: opcional(z.string().transform(limparTelefone).refine(isTelefoneValido, 'Telefone invalido.')),

  situacao: z.enum(SITUACOES_COLABORADOR).default('ATIVO'),
  observacoes: opcional(z.string().trim().max(1000)),
});

function validarColaborador(
  dados: {
    vinculo?: VinculoColaborador;
    terceiroId?: string | null;
    situacao?: SituacaoColaborador;
    dataAdmissao?: Date | null;
    dataDesligamento?: Date | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (dados.vinculo === 'TERCEIRO' && !dados.terceiroId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['terceiroId'],
      message: 'Informe a empresa contratada do colaborador.',
    });
  }

  if (dados.vinculo && dados.vinculo !== 'TERCEIRO' && dados.terceiroId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['terceiroId'],
      message: 'Empresa contratada so se aplica ao vinculo de terceiro.',
    });
  }

  if (dados.dataAdmissao && dados.dataDesligamento && dados.dataDesligamento < dados.dataAdmissao) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dataDesligamento'],
      message: 'Desligamento nao pode ser anterior a admissao.',
    });
  }

  if (dados.situacao === 'DESLIGADO' && !dados.dataDesligamento) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dataDesligamento'],
      message: 'Informe a data de desligamento.',
    });
  }
}

export const colaboradorCreateSchema = colaboradorBaseSchema.superRefine(validarColaborador);
export const colaboradorUpdateSchema = colaboradorBaseSchema.partial().superRefine(validarColaborador);

export type ColaboradorCreateInput = z.input<typeof colaboradorCreateSchema>;
export type ColaboradorCreateData = z.output<typeof colaboradorCreateSchema>;
export type ColaboradorUpdateInput = z.input<typeof colaboradorUpdateSchema>;

/* -------------------------------------------------------------------------- */
/* Filtros da listagem                                                         */
/* -------------------------------------------------------------------------- */

export const ORDENACOES_COLABORADOR = ['nome', 'funcao', 'setor', 'dataAdmissao', 'criadoEm'] as const;
export type OrdenacaoColaborador = (typeof ORDENACOES_COLABORADOR)[number];

export const colaboradorFiltroSchema = z.object({
  /** Busca por nome, CPF, matricula, funcao ou setor. */
  busca: z.string().trim().max(120).optional(),
  clienteId: z.string().uuid('Cliente invalido.').optional(),
  terceiroId: z.string().uuid('Empresa contratada invalida.').optional(),
  areaId: z.string().uuid('Area invalida.').optional(),
  vinculo: z.enum(VINCULOS_COLABORADOR).optional(),
  grauRisco: z.enum(GRAUS_RISCO_FUNCAO).optional(),
  situacao: z.enum(SITUACOES_COLABORADOR).optional(),
  /** `true` filtra quem esta com ASO vencido ou sem nenhum ASO. */
  asoIrregular: z.coerce.boolean().optional(),
  ordenarPor: z.enum(ORDENACOES_COLABORADOR).default('nome'),
  direcao: z.enum(['asc', 'desc']).default('asc'),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(20),
});

export type ColaboradorFiltro = z.output<typeof colaboradorFiltroSchema>;

/* -------------------------------------------------------------------------- */
/* Formulario                                                                  */
/* -------------------------------------------------------------------------- */

export type ColaboradorFormValues = { [Campo in keyof ColaboradorCreateData]-?: string };
