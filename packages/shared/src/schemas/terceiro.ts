import { z } from 'zod';
import { isCnpjValido, limparCnpj } from '../br/cnpj.js';
import { isCepValido, limparCep } from '../br/cep.js';
import { isCelular, isTelefoneValido, limparTelefone } from '../br/telefone.js';
import { isCnaeValido, limparCnae } from '../br/cnae.js';
import { SIGLAS_UF, type SiglaUf } from '../br/uf.js';
import { HEX_COR, dataObrigatoria, dataOpcional, opcional, texto } from './comuns.js';
import { PORTES_EMPRESA } from './cliente.js';

/* -------------------------------------------------------------------------- */
/* Dominio                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Situacao do terceiro na operacao do cliente.
 * `BLOQUEADO` e especifico de terceiros: impede a liberacao de acesso a area
 * enquanto houver pendencia documental ou de SSMA.
 */
export const SITUACOES_TERCEIRO = ['ATIVO', 'SUSPENSO', 'BLOQUEADO', 'ENCERRADO'] as const;
export type SituacaoTerceiro = (typeof SITUACOES_TERCEIRO)[number];

export const ROTULO_SITUACAO_TERCEIRO: Record<SituacaoTerceiro, string> = {
  ATIVO: 'Ativo',
  SUSPENSO: 'Suspenso',
  BLOQUEADO: 'Bloqueado',
  ENCERRADO: 'Encerrado',
};

/** Vinculo do terceiro com a operacao do cliente. */
export const TIPOS_VINCULO_TERCEIRO = ['CONTRATO', 'ORDEM_SERVICO', 'OBRA', 'SERVICO_EVENTUAL'] as const;
export type TipoVinculoTerceiro = (typeof TIPOS_VINCULO_TERCEIRO)[number];

export const ROTULO_VINCULO_TERCEIRO: Record<TipoVinculoTerceiro, string> = {
  CONTRATO: 'Contrato',
  ORDEM_SERVICO: 'Ordem de servico',
  OBRA: 'Obra / projeto',
  SERVICO_EVENTUAL: 'Servico eventual',
};

/** Atividades tipicas de terceiros na industria — sugestoes do formulario. */
export const ATIVIDADES_TERCEIRO_SUGERIDAS = [
  'Montagem eletromecanica',
  'Manutencao industrial',
  'Pintura industrial',
  'Isolamento termico',
  'Andaimes e acesso por corda',
  'Caldeiraria e solda',
  'Limpeza industrial e hidrojateamento',
  'Transporte e movimentacao de cargas',
  'Obras civis',
  'Instalacoes eletricas',
  'Refrigeracao e climatizacao',
  'Alimentacao e facilities',
] as const;

export const META_NOTA_SSMA_PADRAO = 85;
export const COR_DESTAQUE_TERCEIRO_PADRAO = '#7c3aed';

/* -------------------------------------------------------------------------- */
/* Classificacao do ranking                                                    */
/* -------------------------------------------------------------------------- */

export const CLASSIFICACOES_SSMA = ['A', 'B', 'C', 'D'] as const;
export type ClassificacaoSsma = (typeof CLASSIFICACOES_SSMA)[number];

/** Faixas da nota de desempenho SSMA usadas no ranking de terceiros. */
export const FAIXAS_CLASSIFICACAO: Array<{
  classificacao: ClassificacaoSsma;
  minimo: number;
  rotulo: string;
}> = [
  { classificacao: 'A', minimo: 90, rotulo: 'Excelente' },
  { classificacao: 'B', minimo: 75, rotulo: 'Adequado' },
  { classificacao: 'C', minimo: 60, rotulo: 'Requer atencao' },
  { classificacao: 'D', minimo: 0, rotulo: 'Critico' },
];

/** Converte a nota (0–100) na letra do ranking. `null` quando ainda nao avaliado. */
export function classificarNotaSsma(nota: number | null | undefined): ClassificacaoSsma | null {
  if (nota === null || nota === undefined || Number.isNaN(nota)) return null;
  return FAIXAS_CLASSIFICACAO.find((faixa) => nota >= faixa.minimo)?.classificacao ?? 'D';
}

export function rotuloClassificacao(classificacao: ClassificacaoSsma | null): string {
  if (!classificacao) return 'Nao avaliado';
  return FAIXAS_CLASSIFICACAO.find((faixa) => faixa.classificacao === classificacao)?.rotulo ?? '—';
}

/* -------------------------------------------------------------------------- */
/* Schema de escrita                                                           */
/* -------------------------------------------------------------------------- */

/** Campos que compoem o endereco — preenchidos em conjunto ou nenhum. */
const CAMPOS_ENDERECO = ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'uf'] as const;

/**
 * Etapa 3 — Empresas Contratadas / Terceiros.
 *
 * Empresas terceirizadas que atuam dentro da operacao de um cliente e que
 * tambem recebem nota e ranking de desempenho SSMA.
 */
const terceiroBaseSchema = z.object({
  /* --- Vinculo ------------------------------------------------------------ */
  /** Cliente em cuja operacao o terceiro atua. */
  clienteId: z
    .string({ required_error: 'Informe o cliente em que o terceiro atua.' })
    .uuid('Cliente invalido.'),

  /* --- Identificacao ------------------------------------------------------ */
  razaoSocial: texto(3, 150, 'Razao social'),
  nomeFantasia: texto(2, 120, 'Nome fantasia'),
  cnpj: z
    .string({ required_error: 'CNPJ e obrigatorio.' })
    .transform(limparCnpj)
    .refine(isCnpjValido, 'CNPJ invalido — confira os digitos verificadores.'),
  inscricaoEstadual: opcional(
    z.string().trim().max(20).transform((valor) => valor.toUpperCase()),
  ),
  cnaePrincipal: opcional(
    z.string().transform(limparCnae).refine(isCnaeValido, 'CNAE deve ter 7 digitos (ex.: 3321-0/00).'),
  ),
  porte: opcional(z.enum(PORTES_EMPRESA)),
  /** O que o terceiro executa na operacao (montagem, pintura, andaimes...). */
  atividadePrincipal: texto(3, 120, 'Atividade principal'),

  /* --- Atuacao na operacao do cliente ------------------------------------- */
  tipoVinculo: z.enum(TIPOS_VINCULO_TERCEIRO).default('CONTRATO'),
  numeroContrato: opcional(z.string().trim().max(40)),
  dataInicioAtuacao: dataObrigatoria('Data de inicio da atuacao'),
  dataFimAtuacao: dataOpcional('Data de fim da atuacao'),
  situacao: z.enum(SITUACOES_TERCEIRO).default('ATIVO'),
  escopoServicos: opcional(z.string().trim().max(500)),
  /** Areas/frentes do cliente onde o terceiro atua. */
  areasAtuacao: opcional(z.string().trim().max(300)),
  quantidadeFuncionarios: z.coerce
    .number({ required_error: 'Quantidade de funcionarios alocados e obrigatoria.' })
    .int('Quantidade de funcionarios deve ser um numero inteiro.')
    .min(1, 'Quantidade de funcionarios deve ser ao menos 1.'),

  /* --- Perfil SSMA e desempenho ------------------------------------------- */
  grauRisco: z.coerce
    .number({ required_error: 'Grau de risco e obrigatorio.', invalid_type_error: 'Grau de risco invalido.' })
    .int()
    .min(1, 'Grau de risco deve estar entre 1 e 4 (NR-4).')
    .max(4, 'Grau de risco deve estar entre 1 e 4 (NR-4).'),
  /**
   * Nota de desempenho SSMA (0–100) que posiciona o terceiro no ranking.
   * Enquanto as inspecoes nao existem, e lancada manualmente; depois passa a
   * ser calculada a partir dos eventos de campo.
   */
  notaSsma: opcional(
    z.coerce.number().min(0, 'Nota deve estar entre 0 e 100.').max(100, 'Nota deve estar entre 0 e 100.'),
  ),
  dataUltimaAvaliacao: dataOpcional('Data da ultima avaliacao'),
  metaNotaSsma: z.coerce
    .number()
    .min(0, 'Meta deve estar entre 0 e 100.')
    .max(100, 'Meta deve estar entre 0 e 100.')
    .default(META_NOTA_SSMA_PADRAO),

  /* --- Documentacao e conformidade ---------------------------------------- */
  possuiPgr: z.boolean().default(false),
  possuiPcmso: z.boolean().default(false),
  /** Vencimento da pasta de documentos do terceiro. */
  documentacaoValidaAte: dataOpcional('Validade da documentacao'),

  /* --- Preposto / responsavel do terceiro --------------------------------- */
  responsavelNome: texto(3, 120, 'Nome do responsavel'),
  responsavelCargo: opcional(z.string().trim().max(80)),
  responsavelEmail: z
    .string({ required_error: 'E-mail do responsavel e obrigatorio.' })
    .trim()
    .toLowerCase()
    .email('E-mail do responsavel invalido.')
    .max(150),
  responsavelTelefone: z
    .string({ required_error: 'Telefone do responsavel e obrigatorio.' })
    .transform(limparTelefone)
    .refine(isTelefoneValido, 'Telefone do responsavel invalido — informe DDD + numero.'),
  responsavelWhatsapp: opcional(
    z
      .string()
      .transform(limparTelefone)
      .refine(isCelular, 'WhatsApp deve ser um celular valido com DDD (11 digitos).'),
  ),

  /* --- Endereco (bloco inteiro opcional) ---------------------------------- */
  cep: opcional(z.string().transform(limparCep).refine(isCepValido, 'CEP invalido — informe 8 digitos.')),
  logradouro: opcional(z.string().trim().max(150)),
  numero: opcional(z.string().trim().max(20)),
  complemento: opcional(z.string().trim().max(80)),
  bairro: opcional(z.string().trim().max(80)),
  cidade: opcional(z.string().trim().max(80)),
  uf: opcional(
    z
      .string()
      .trim()
      .toUpperCase()
      .refine((valor): valor is SiglaUf => SIGLAS_UF.includes(valor as SiglaUf), 'UF invalida.'),
  ),

  /* --- Identidade e anotacoes --------------------------------------------- */
  logoUrl: opcional(z.string().trim().max(300)),
  corDestaque: z
    .string()
    .trim()
    .regex(HEX_COR, 'Cor de destaque deve estar no formato #RRGGBB.')
    .default(COR_DESTAQUE_TERCEIRO_PADRAO),
  observacoes: opcional(z.string().trim().max(1000)),
});

type DadosTerceiro = Partial<Record<(typeof CAMPOS_ENDERECO)[number], unknown>> & {
  dataInicioAtuacao?: Date | null;
  dataFimAtuacao?: Date | null;
  situacao?: SituacaoTerceiro;
  notaSsma?: number | null;
  dataUltimaAvaliacao?: Date | null;
};

function validarTerceiro(dados: DadosTerceiro, ctx: z.RefinementCtx): void {
  const { dataInicioAtuacao, dataFimAtuacao, situacao } = dados;

  if (dataInicioAtuacao && dataFimAtuacao && dataFimAtuacao < dataInicioAtuacao) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dataFimAtuacao'],
      message: 'Fim da atuacao nao pode ser anterior ao inicio.',
    });
  }

  if (situacao === 'ENCERRADO' && !dataFimAtuacao) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dataFimAtuacao'],
      message: 'Informe a data de encerramento ao marcar a atuacao como encerrada.',
    });
  }

  // O endereco e opcional, mas nao pode ficar pela metade.
  const informados = CAMPOS_ENDERECO.filter((campo) => Boolean(dados[campo]));
  if (informados.length > 0 && informados.length < CAMPOS_ENDERECO.length) {
    for (const campo of CAMPOS_ENDERECO) {
      if (!dados[campo]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [campo],
          message: 'Complete o endereco ou deixe o bloco inteiro em branco.',
        });
      }
    }
  }

  if (dados.notaSsma !== null && dados.notaSsma !== undefined && !dados.dataUltimaAvaliacao) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dataUltimaAvaliacao'],
      message: 'Informe a data da avaliacao que gerou esta nota.',
    });
  }
}

export const terceiroCreateSchema = terceiroBaseSchema.superRefine(validarTerceiro);
export const terceiroUpdateSchema = terceiroBaseSchema.partial().superRefine(validarTerceiro);

export type TerceiroCreateInput = z.input<typeof terceiroCreateSchema>;
export type TerceiroCreateData = z.output<typeof terceiroCreateSchema>;
export type TerceiroUpdateInput = z.input<typeof terceiroUpdateSchema>;

/* -------------------------------------------------------------------------- */
/* Filtros da listagem                                                         */
/* -------------------------------------------------------------------------- */

export const ORDENACOES_TERCEIRO = [
  'nomeFantasia',
  'razaoSocial',
  'notaSsma',
  'grauRisco',
  'quantidadeFuncionarios',
  'criadoEm',
] as const;
export type OrdenacaoTerceiro = (typeof ORDENACOES_TERCEIRO)[number];

export const terceiroFiltroSchema = z.object({
  /** Busca por nome fantasia, razao social, CNPJ, contrato ou atividade. */
  busca: z.string().trim().max(120).optional(),
  clienteId: z.string().uuid('Cliente invalido.').optional(),
  situacao: z.enum(SITUACOES_TERCEIRO).optional(),
  grauRisco: z.coerce.number().int().min(1).max(4).optional(),
  classificacao: z.enum(CLASSIFICACOES_SSMA).optional(),
  /** `true` = so terceiros com documentacao vencida. */
  documentacaoVencida: z.enum(['true', 'false']).optional(),
  ordenarPor: z.enum(ORDENACOES_TERCEIRO).default('nomeFantasia'),
  direcao: z.enum(['asc', 'desc']).default('asc'),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

export type TerceiroFiltro = z.output<typeof terceiroFiltroSchema>;

/* -------------------------------------------------------------------------- */
/* Formulario                                                                  */
/* -------------------------------------------------------------------------- */

export type TerceiroFormValues = Omit<
  { [Campo in keyof TerceiroCreateData]-?: string },
  'possuiPgr' | 'possuiPcmso'
> & { possuiPgr: boolean; possuiPcmso: boolean };
