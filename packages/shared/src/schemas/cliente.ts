import { z } from 'zod';
import { isCnpjValido, limparCnpj } from '../br/cnpj.js';
import { isCepValido, limparCep } from '../br/cep.js';
import { isCelular, isTelefoneValido, limparTelefone } from '../br/telefone.js';
import { isCnaeValido, limparCnae } from '../br/cnae.js';
import { SIGLAS_UF, type SiglaUf } from '../br/uf.js';
import { HEX_COR, dataObrigatoria, dataOpcional, opcional, texto } from './comuns.js';

/* -------------------------------------------------------------------------- */
/* Dominio                                                                     */
/* -------------------------------------------------------------------------- */

export const PORTES_EMPRESA = ['MEI', 'ME', 'EPP', 'MEDIO', 'GRANDE'] as const;
export type PorteEmpresa = (typeof PORTES_EMPRESA)[number];

export const ROTULO_PORTE: Record<PorteEmpresa, string> = {
  MEI: 'MEI',
  ME: 'Microempresa',
  EPP: 'Empresa de Pequeno Porte',
  MEDIO: 'Medio porte',
  GRANDE: 'Grande porte',
};

export const SITUACOES_CONTRATO = ['ATIVO', 'SUSPENSO', 'ENCERRADO'] as const;
export type SituacaoContrato = (typeof SITUACOES_CONTRATO)[number];

export const ROTULO_SITUACAO: Record<SituacaoContrato, string> = {
  ATIVO: 'Ativo',
  SUSPENSO: 'Suspenso',
  ENCERRADO: 'Encerrado',
};

/**
 * Grau de risco da atividade principal (NR-4, Quadro I). Define a
 * obrigatoriedade de SESMT e o dimensionamento das equipes de seguranca.
 */
export const GRAUS_RISCO = [1, 2, 3, 4] as const;
export type GrauRisco = (typeof GRAUS_RISCO)[number];

export const DESCRICAO_GRAU_RISCO: Record<GrauRisco, string> = {
  1: 'Grau 1 — risco baixo (comercio, servicos administrativos)',
  2: 'Grau 2 — risco moderado (industria leve, alimentos)',
  3: 'Grau 3 — risco alto (metalurgia, quimica, transporte)',
  4: 'Grau 4 — risco muito alto (mineracao, construcao pesada, energia)',
};

/** Segmentos sugeridos no formulario — campo livre, a lista e so atalho. */
export const SEGMENTOS_SUGERIDOS = [
  'Mineracao',
  'Construcao civil',
  'Metalurgia e siderurgia',
  'Quimica e petroquimica',
  'Energia e utilities',
  'Agroindustria',
  'Alimentos e bebidas',
  'Papel e celulose',
  'Logistica e transporte',
  'Saneamento e residuos',
  'Industria automotiva',
  'Comercio e servicos',
] as const;

export const META_INDICE_GLOBAL_PADRAO = 85;
export const COR_DESTAQUE_PADRAO = '#2563eb';

/* -------------------------------------------------------------------------- */
/* Schema de escrita                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Etapa 2 — Clientes / Contratantes.
 *
 * Cada empresa atendida pela consultoria (ex.: Toyota, Volkswagen). E a chave
 * de segmentacao de toda a plataforma: ranking por cliente, filtro dos
 * dashboards e escopo das inspecoes, planos de acao e documentos.
 */
const clienteBaseSchema = z.object({
  /* --- Agrupamento -------------------------------------------------------- */
  /** Centro de negocio (regional, unidade ou tipo de contrato) ao qual pertence. */
  centroNegocioId: opcional(z.string().uuid('Centro de negocio invalido.')),

  /* --- Identificacao ----------------------------------------------------- */
  razaoSocial: texto(3, 150, 'Razao social'),
  nomeFantasia: texto(2, 120, 'Nome fantasia'),
  cnpj: z
    .string({ required_error: 'CNPJ e obrigatorio.' })
    .transform(limparCnpj)
    .refine(isCnpjValido, 'CNPJ invalido — confira os digitos verificadores.'),
  inscricaoEstadual: opcional(
    z.string().trim().max(20, 'Inscricao estadual deve ter no maximo 20 caracteres.').transform((v) => v.toUpperCase()),
  ),
  inscricaoMunicipal: opcional(z.string().trim().max(20)),
  cnaePrincipal: opcional(
    z.string().transform(limparCnae).refine(isCnaeValido, 'CNAE deve ter 7 digitos (ex.: 2910-7/01).'),
  ),
  porte: opcional(z.enum(PORTES_EMPRESA)),
  segmento: opcional(z.string().trim().max(80)),
  site: opcional(z.string().trim().url('Site deve ser uma URL valida (https://...).').max(150)),

  /* --- Contrato ---------------------------------------------------------- */
  numeroContrato: texto(1, 40, 'Numero do contrato'),
  dataInicioContrato: dataObrigatoria('Data de inicio do contrato'),
  dataFimContrato: dataOpcional('Data de fim do contrato'),
  situacao: z.enum(SITUACOES_CONTRATO).default('ATIVO'),
  escopoServicos: opcional(z.string().trim().max(500)),
  valorMensal: opcional(z.coerce.number().min(0, 'Valor mensal nao pode ser negativo.')),
  diaVencimento: opcional(
    z.coerce.number().int().min(1, 'Dia de vencimento deve estar entre 1 e 31.').max(31, 'Dia de vencimento deve estar entre 1 e 31.'),
  ),
  /** Consultor da matriz responsavel pela conta. Vira vinculo de usuario na etapa de acessos. */
  consultorResponsavel: opcional(z.string().trim().max(120)),

  /* --- Perfil SSMA (alimenta ranking e indicadores) ---------------------- */
  grauRisco: z.coerce
    .number({ required_error: 'Grau de risco e obrigatorio.', invalid_type_error: 'Grau de risco invalido.' })
    .int()
    .min(1, 'Grau de risco deve estar entre 1 e 4 (NR-4).')
    .max(4, 'Grau de risco deve estar entre 1 e 4 (NR-4).'),
  quantidadeFuncionarios: z.coerce
    .number({ required_error: 'Quantidade de funcionarios e obrigatoria.' })
    .int('Quantidade de funcionarios deve ser um numero inteiro.')
    .min(1, 'Quantidade de funcionarios deve ser ao menos 1.'),
  /** Meta do Indice Global SSMA (0–100) usada no ranking e nos alertas. */
  metaIndiceGlobal: z.coerce
    .number()
    .min(0, 'Meta deve estar entre 0 e 100.')
    .max(100, 'Meta deve estar entre 0 e 100.')
    .default(META_INDICE_GLOBAL_PADRAO),
  possuiCipa: z.boolean().default(false),
  possuiSesmt: z.boolean().default(false),

  /* --- Interlocutor no cliente ------------------------------------------- */
  contatoNome: texto(3, 120, 'Nome do contato'),
  contatoCargo: opcional(z.string().trim().max(80)),
  contatoEmail: z
    .string({ required_error: 'E-mail do contato e obrigatorio.' })
    .trim()
    .toLowerCase()
    .email('E-mail do contato invalido.')
    .max(150),
  contatoTelefone: z
    .string({ required_error: 'Telefone do contato e obrigatorio.' })
    .transform(limparTelefone)
    .refine(isTelefoneValido, 'Telefone do contato invalido — informe DDD + numero.'),
  contatoWhatsapp: opcional(
    z
      .string()
      .transform(limparTelefone)
      .refine(isCelular, 'WhatsApp deve ser um celular valido com DDD (11 digitos).'),
  ),

  /* --- Endereco da sede --------------------------------------------------- */
  cep: z
    .string({ required_error: 'CEP e obrigatorio.' })
    .transform(limparCep)
    .refine(isCepValido, 'CEP invalido — informe 8 digitos.'),
  logradouro: texto(3, 150, 'Logradouro'),
  numero: texto(1, 20, 'Numero'),
  complemento: opcional(z.string().trim().max(80)),
  bairro: texto(2, 80, 'Bairro'),
  cidade: texto(2, 80, 'Cidade'),
  uf: z
    .string({ required_error: 'UF e obrigatoria.' })
    .trim()
    .toUpperCase()
    .refine((valor): valor is SiglaUf => SIGLAS_UF.includes(valor as SiglaUf), 'UF invalida.'),

  /* --- Identidade e anotacoes -------------------------------------------- */
  logoUrl: opcional(z.string().trim().max(300)),
  /** Cor da serie do cliente nos graficos comparativos. */
  corDestaque: z
    .string()
    .trim()
    .regex(HEX_COR, 'Cor de destaque deve estar no formato #RRGGBB.')
    .default(COR_DESTAQUE_PADRAO),
  observacoes: opcional(z.string().trim().max(1000)),
});

/** Coerencia entre as datas e a situacao do contrato. */
function validarVigencia(
  dados: { dataInicioContrato?: Date | null; dataFimContrato?: Date | null; situacao?: SituacaoContrato },
  ctx: z.RefinementCtx,
): void {
  const { dataInicioContrato, dataFimContrato, situacao } = dados;

  if (dataInicioContrato && dataFimContrato && dataFimContrato < dataInicioContrato) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dataFimContrato'],
      message: 'Fim do contrato nao pode ser anterior ao inicio.',
    });
  }

  if (situacao === 'ENCERRADO' && !dataFimContrato) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dataFimContrato'],
      message: 'Informe a data de encerramento ao marcar o contrato como encerrado.',
    });
  }
}

export const clienteCreateSchema = clienteBaseSchema.superRefine(validarVigencia);
export const clienteUpdateSchema = clienteBaseSchema.partial().superRefine(validarVigencia);

export type ClienteCreateInput = z.input<typeof clienteCreateSchema>;
export type ClienteCreateData = z.output<typeof clienteCreateSchema>;
export type ClienteUpdateInput = z.input<typeof clienteUpdateSchema>;

/* -------------------------------------------------------------------------- */
/* Filtros da listagem                                                         */
/* -------------------------------------------------------------------------- */

export const ORDENACOES_CLIENTE = ['nomeFantasia', 'razaoSocial', 'criadoEm', 'grauRisco', 'quantidadeFuncionarios'] as const;
export type OrdenacaoCliente = (typeof ORDENACOES_CLIENTE)[number];

export const clienteFiltroSchema = z.object({
  /** Busca por nome fantasia, razao social, CNPJ ou numero do contrato. */
  busca: z.string().trim().max(120).optional(),
  situacao: z.enum(SITUACOES_CONTRATO).optional(),
  grauRisco: z.coerce.number().int().min(1).max(4).optional(),
  uf: z.string().trim().toUpperCase().length(2).optional(),
  centroNegocioId: z.string().uuid('Centro de negocio invalido.').optional(),
  /** `true` = so clientes ainda sem centro de negocio. */
  semCentroNegocio: z.enum(['true', 'false']).optional(),
  ordenarPor: z.enum(ORDENACOES_CLIENTE).default('nomeFantasia'),
  direcao: z.enum(['asc', 'desc']).default('asc'),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

export type ClienteFiltro = z.output<typeof clienteFiltroSchema>;

/* -------------------------------------------------------------------------- */
/* Formulario                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Campos do formulario: tudo texto (com mascara), exceto os interruptores.
 * Derivado do schema para nao existir uma segunda lista de campos.
 */
export type ClienteFormValues = Omit<
  { [Campo in keyof ClienteCreateData]-?: string },
  'possuiCipa' | 'possuiSesmt'
> & { possuiCipa: boolean; possuiSesmt: boolean };
