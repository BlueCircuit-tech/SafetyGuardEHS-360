import { z } from 'zod';
import { isCnpjValido, limparCnpj } from '../br/cnpj.js';
import { isCepValido, limparCep } from '../br/cep.js';
import { isCelular, isTelefoneValido, limparTelefone } from '../br/telefone.js';
import { isCnaeValido, limparCnae } from '../br/cnae.js';
import { SIGLAS_UF, type SiglaUf } from '../br/uf.js';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Torna o campo opcional tratando string vazia como ausencia de valor (null). */
function opcional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (valor) => (typeof valor === 'string' && valor.trim() === '' ? null : valor ?? null),
    schema.nullable(),
  );
}

const texto = (min: number, max: number, campo: string) =>
  z
    .string({ required_error: `${campo} e obrigatorio.`, invalid_type_error: `${campo} deve ser um texto.` })
    .trim()
    .min(min, `${campo} deve ter ao menos ${min} caracteres.`)
    .max(max, `${campo} deve ter no maximo ${max} caracteres.`);

const HEX_COR = /^#([0-9a-fA-F]{6})$/;

/* -------------------------------------------------------------------------- */
/* Dominio                                                                     */
/* -------------------------------------------------------------------------- */

/** Conselho / orgao onde o responsavel tecnico e registrado. */
export const TIPOS_REGISTRO_RT = ['CREA', 'CRM', 'CREFITO', 'COREN', 'CRQ', 'MTE', 'OUTRO'] as const;
export type TipoRegistroRt = (typeof TIPOS_REGISTRO_RT)[number];

export const REGIMES_TRIBUTARIOS = ['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI'] as const;
export type RegimeTributario = (typeof REGIMES_TRIBUTARIOS)[number];

export const ROTULO_REGIME_TRIBUTARIO: Record<RegimeTributario, string> = {
  SIMPLES_NACIONAL: 'Simples Nacional',
  LUCRO_PRESUMIDO: 'Lucro Presumido',
  LUCRO_REAL: 'Lucro Real',
  MEI: 'MEI',
};

export const COR_PRIMARIA_PADRAO = '#059669';
export const COR_SECUNDARIA_PADRAO = '#0e1a2b';
export const TIMEZONE_PADRAO = 'America/Sao_Paulo';

/* -------------------------------------------------------------------------- */
/* Schema de escrita (create)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Etapa 1.1 — Empresa de Consultoria (matriz do sistema).
 *
 * E o primeiro cadastro da plataforma. Estes dados alimentam o cabecalho dos
 * relatorios, a assinatura dos e-mails, o cabecalho das mensagens de WhatsApp
 * e o rodape dos laudos/auditorias.
 */
export const empresaConsultoriaCreateSchema = z.object({
  /* --- Identificacao ---------------------------------------------------- */
  razaoSocial: texto(3, 150, 'Razao social'),
  nomeFantasia: texto(2, 120, 'Nome fantasia'),
  cnpj: z
    .string({ required_error: 'CNPJ e obrigatorio.' })
    .transform(limparCnpj)
    .refine(isCnpjValido, 'CNPJ invalido — confira os digitos verificadores.'),
  inscricaoEstadual: opcional(
    z
      .string()
      .trim()
      .max(20, 'Inscricao estadual deve ter no maximo 20 caracteres.')
      .transform((valor) => valor.toUpperCase()),
  ),
  inscricaoMunicipal: opcional(z.string().trim().max(20, 'Inscricao municipal deve ter no maximo 20 caracteres.')),
  cnaePrincipal: opcional(
    z
      .string()
      .transform(limparCnae)
      .refine(isCnaeValido, 'CNAE deve ter 7 digitos (ex.: 7120-1/00).'),
  ),
  naturezaJuridica: opcional(z.string().trim().max(120)),
  regimeTributario: opcional(z.enum(REGIMES_TRIBUTARIOS)),
  dataFundacao: opcional(
    z.coerce
      .date()
      .refine((data) => data.getTime() <= Date.now(), 'Data de fundacao nao pode estar no futuro.'),
  ),

  /* --- Contato institucional -------------------------------------------- */
  email: z
    .string({ required_error: 'E-mail e obrigatorio.' })
    .trim()
    .toLowerCase()
    .email('E-mail invalido.')
    .max(150),
  emailFinanceiro: opcional(z.string().trim().toLowerCase().email('E-mail financeiro invalido.').max(150)),
  telefone: z
    .string({ required_error: 'Telefone e obrigatorio.' })
    .transform(limparTelefone)
    .refine(isTelefoneValido, 'Telefone invalido — informe DDD + numero.'),
  whatsapp: opcional(
    z
      .string()
      .transform(limparTelefone)
      .refine(isCelular, 'WhatsApp deve ser um celular valido com DDD (11 digitos).'),
  ),
  site: opcional(z.string().trim().url('Site deve ser uma URL valida (https://...).').max(150)),

  /* --- Endereco ---------------------------------------------------------- */
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

  /* --- Responsavel tecnico (assina laudos e auditorias) ------------------ */
  responsavelTecnicoNome: texto(3, 120, 'Nome do responsavel tecnico'),
  responsavelTecnicoCargo: opcional(z.string().trim().max(80)),
  responsavelTecnicoTipoRegistro: z.enum(TIPOS_REGISTRO_RT, {
    required_error: 'Informe o conselho do responsavel tecnico.',
    invalid_type_error: 'Conselho invalido.',
  }),
  responsavelTecnicoRegistro: texto(3, 40, 'Numero de registro do responsavel tecnico'),
  responsavelTecnicoUfRegistro: opcional(
    z
      .string()
      .trim()
      .toUpperCase()
      .refine((valor): valor is SiglaUf => SIGLAS_UF.includes(valor as SiglaUf), 'UF do registro invalida.'),
  ),
  responsavelTecnicoEmail: opcional(z.string().trim().toLowerCase().email('E-mail do responsavel tecnico invalido.')),
  responsavelTecnicoTelefone: opcional(
    z.string().transform(limparTelefone).refine(isTelefoneValido, 'Telefone do responsavel tecnico invalido.'),
  ),

  /* --- Identidade visual e textos institucionais ------------------------- */
  logoUrl: opcional(z.string().trim().max(300)),
  corPrimaria: z
    .string()
    .trim()
    .regex(HEX_COR, 'Cor primaria deve estar no formato #RRGGBB.')
    .default(COR_PRIMARIA_PADRAO),
  corSecundaria: z
    .string()
    .trim()
    .regex(HEX_COR, 'Cor secundaria deve estar no formato #RRGGBB.')
    .default(COR_SECUNDARIA_PADRAO),
  /** Assinatura anexada ao rodape dos e-mails enviados pela plataforma. */
  assinaturaEmail: opcional(z.string().trim().max(500)),
  /** Texto fixo do rodape de laudos, relatorios e auditorias. */
  rodapeRelatorio: opcional(z.string().trim().max(500)),
  /** Cabecalho aplicado as notificacoes de WhatsApp. */
  cabecalhoWhatsapp: opcional(z.string().trim().max(160)),

  /* --- Configuracao ------------------------------------------------------ */
  timezone: z.string().trim().max(60).default(TIMEZONE_PADRAO),
  ativa: z.boolean().default(true),
});

export const empresaConsultoriaUpdateSchema = empresaConsultoriaCreateSchema.partial();

export type EmpresaConsultoriaCreateInput = z.input<typeof empresaConsultoriaCreateSchema>;
export type EmpresaConsultoriaCreateData = z.output<typeof empresaConsultoriaCreateSchema>;
export type EmpresaConsultoriaUpdateInput = z.input<typeof empresaConsultoriaUpdateSchema>;

/* -------------------------------------------------------------------------- */
/* Schema de leitura (resposta da API)                                         */
/* -------------------------------------------------------------------------- */

export const empresaConsultoriaSchema = empresaConsultoriaCreateSchema.extend({
  id: z.string(),
  criadoEm: z.coerce.date(),
  atualizadoEm: z.coerce.date(),
});

export type EmpresaConsultoria = z.output<typeof empresaConsultoriaSchema>;

/**
 * Formato dos campos enquanto estao no formulario: tudo texto (com mascara),
 * exceto o interruptor `ativa`. Derivado do schema para nao existir uma
 * segunda lista de campos que possa sair de sincronia.
 */
export type EmpresaFormValues = Omit<
  { [Campo in keyof EmpresaConsultoriaCreateData]-?: string },
  'ativa'
> & { ativa: boolean };

/** Campos exibidos no formulario, na ordem dos blocos da Etapa 1. */
export const CAMPOS_OBRIGATORIOS_ETAPA1 = [
  'razaoSocial',
  'nomeFantasia',
  'cnpj',
  'email',
  'telefone',
  'cep',
  'logradouro',
  'numero',
  'bairro',
  'cidade',
  'uf',
  'responsavelTecnicoNome',
  'responsavelTecnicoTipoRegistro',
  'responsavelTecnicoRegistro',
] as const satisfies readonly (keyof EmpresaFormValues)[];

/**
 * Bloco derivado dos dados da matriz, consumido por relatorios, e-mails e
 * WhatsApp. Fica no pacote compartilhado para que API e front usem exatamente
 * a mesma composicao de cabecalho/rodape.
 */
export const cabecalhoInstitucionalSchema = z.object({
  nomeExibicao: z.string(),
  razaoSocial: z.string(),
  cnpjFormatado: z.string(),
  enderecoLinha: z.string(),
  contatoLinha: z.string(),
  responsavelTecnicoLinha: z.string(),
  logoUrl: z.string().nullable(),
  corPrimaria: z.string(),
  corSecundaria: z.string(),
  rodapeRelatorio: z.string(),
  assinaturaEmail: z.string(),
  cabecalhoWhatsapp: z.string(),
  geradoEm: z.coerce.date(),
});

export type CabecalhoInstitucional = z.output<typeof cabecalhoInstitucionalSchema>;
