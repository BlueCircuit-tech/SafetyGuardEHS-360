import { z } from 'zod';
import { isCnpjValido, limparCnpj } from '../br/cnpj.js';
import { isCelular, isTelefoneValido, limparTelefone } from '../br/telefone.js';
import { opcional, texto } from './comuns.js';

/* -------------------------------------------------------------------------- */
/* Dominio                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Etapa 24 — Fornecedores da consultoria.
 *
 * Cadastro simples de quem a consultoria compra: EPI, laboratorio de exames,
 * instrutores, recarga de extintores... O pedido da operacao foi "registro de
 * fornecedor x telefone / e-mail" — a tela precisa deixar o contato a um clique.
 */
export const CATEGORIAS_FORNECEDOR_SUGERIDAS = [
  'EPI',
  'Laboratorio / exames',
  'Treinamento',
  'Extintores / brigada',
  'Uniformes',
  'Sinalizacao',
  'Software',
  'Outro',
] as const;
export type CategoriaFornecedorSugerida = (typeof CATEGORIAS_FORNECEDOR_SUGERIDAS)[number];

/* -------------------------------------------------------------------------- */
/* Schemas de escrita                                                          */
/* -------------------------------------------------------------------------- */

const fornecedorBaseSchema = z.object({
  nome: texto(2, 150, 'Nome do fornecedor'),
  /** Opcional, mas quando informado precisa ser um CNPJ valido. */
  cnpj: opcional(
    z.string().transform(limparCnpj).refine(isCnpjValido, 'CNPJ invalido — confira os digitos verificadores.'),
  ),
  categoria: opcional(z.string().trim().max(80, 'Categoria deve ter no maximo 80 caracteres.')),
  contatoNome: opcional(z.string().trim().max(120, 'Nome do contato deve ter no maximo 120 caracteres.')),
  telefone: opcional(
    z.string().transform(limparTelefone).refine(isTelefoneValido, 'Telefone invalido — informe DDD + numero.'),
  ),
  whatsapp: opcional(
    z
      .string()
      .transform(limparTelefone)
      .refine(isCelular, 'WhatsApp deve ser um celular valido com DDD (11 digitos).'),
  ),
  email: opcional(z.string().trim().toLowerCase().email('E-mail invalido.').max(150, 'E-mail muito longo.')),
  site: opcional(z.string().trim().max(150, 'Site deve ter no maximo 150 caracteres.')),
  observacoes: opcional(z.string().trim().max(500, 'Observacoes devem ter no maximo 500 caracteres.')),
  ativo: z.boolean().default(true),
});

export const fornecedorCreateSchema = fornecedorBaseSchema;
export const fornecedorUpdateSchema = fornecedorBaseSchema.partial();

export type FornecedorCreateInput = z.input<typeof fornecedorCreateSchema>;
export type FornecedorCreateData = z.output<typeof fornecedorCreateSchema>;
export type FornecedorUpdateInput = z.input<typeof fornecedorUpdateSchema>;
export type FornecedorUpdateData = z.output<typeof fornecedorUpdateSchema>;

/* -------------------------------------------------------------------------- */
/* Filtros da listagem                                                         */
/* -------------------------------------------------------------------------- */

export const fornecedorFiltroSchema = z.object({
  /** Busca por nome, contato, CNPJ, e-mail ou categoria. */
  busca: z.string().trim().max(120).optional(),
  categoria: z.string().trim().max(80).optional(),
  /** `true` = inclui os inativos na lista (por padrao so os ativos). */
  inativos: z.enum(['true', 'false']).default('false'),
});

export type FornecedorFiltro = z.output<typeof fornecedorFiltroSchema>;

/** Formulario da tela — tudo string, mascaras aplicadas pelo front. */
export type FornecedorFormValues = Omit<{ [Campo in keyof FornecedorCreateData]-?: string }, 'ativo'> & {
  ativo: boolean;
};
