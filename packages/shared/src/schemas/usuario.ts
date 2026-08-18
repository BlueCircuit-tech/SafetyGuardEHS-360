import { z } from 'zod';
import { isTelefoneValido, limparTelefone } from '../br/telefone.js';
import { opcional, texto } from './comuns.js';

/* -------------------------------------------------------------------------- */
/* Perfis                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Perfis de acesso do plano diretor: Diretoria, Gerência, Supervisão, Técnicos
 * e Clientes — mais o ADMIN, que administra a própria plataforma.
 */
export const PERFIS = [
  'ADMIN',
  'DIRETORIA',
  'GERENTE',
  'COORDENADOR',
  'SUPERVISOR',
  'TECNICO',
  'CLIENTE',
] as const;
export type Perfil = (typeof PERFIS)[number];

export const ROTULO_PERFIL: Record<Perfil, string> = {
  ADMIN: 'Administrador',
  DIRETORIA: 'Diretoria',
  GERENTE: 'Gerente',
  COORDENADOR: 'Coordenador',
  SUPERVISOR: 'Supervisor',
  TECNICO: 'Tecnico de campo',
  CLIENTE: 'Cliente (somente leitura)',
};

export const DESCRICAO_PERFIL: Record<Perfil, string> = {
  ADMIN: 'Administra a plataforma, incluindo usuarios e a matriz.',
  DIRETORIA: 'Le tudo e acompanha indicadores; nao mexe em cadastro.',
  GERENTE: 'Gerencia cadastros, planos de acao e escalonamento.',
  COORDENADOR: 'Trata planos de acao e acompanha as areas sob sua gestao.',
  SUPERVISOR: 'Registra observacoes e trata os planos da sua equipe.',
  TECNICO: 'Registra observacoes de campo.',
  CLIENTE: 'Ve apenas os dados do proprio contrato, sem editar.',
};

/* -------------------------------------------------------------------------- */
/* Permissoes                                                                  */
/* -------------------------------------------------------------------------- */

export const PERMISSOES = [
  'cadastros:ler',
  'cadastros:escrever',
  'observacoes:ler',
  'observacoes:escrever',
  'planos:ler',
  'planos:escrever',
  'planos:escalonar',
  'saude:ler',
  'saude:escrever',
  'indicadores:ler',
  'usuarios:gerenciar',
] as const;
export type Permissao = (typeof PERMISSOES)[number];

/**
 * Matriz perfil → permissões.
 *
 * Fica no pacote compartilhado para que a API a aplique e o front use a mesma
 * tabela para esconder o que o usuário não pode fazer — sem duas verdades.
 * A checagem que vale é sempre a do servidor.
 */
export const PERMISSOES_POR_PERFIL: Record<Perfil, readonly Permissao[]> = {
  ADMIN: [...PERMISSOES],
  DIRETORIA: ['cadastros:ler', 'observacoes:ler', 'planos:ler', 'saude:ler', 'indicadores:ler'],
  GERENTE: [
    'cadastros:ler',
    'cadastros:escrever',
    'observacoes:ler',
    'observacoes:escrever',
    'planos:ler',
    'planos:escrever',
    'planos:escalonar',
    'saude:ler',
    'saude:escrever',
    'indicadores:ler',
  ],
  COORDENADOR: [
    'cadastros:ler',
    'observacoes:ler',
    'observacoes:escrever',
    'planos:ler',
    'planos:escrever',
    'planos:escalonar',
    'saude:ler',
    'saude:escrever',
    'indicadores:ler',
  ],
  SUPERVISOR: [
    'cadastros:ler',
    'observacoes:ler',
    'observacoes:escrever',
    'planos:ler',
    'planos:escrever',
    'saude:ler',
    'indicadores:ler',
  ],
  TECNICO: ['cadastros:ler', 'observacoes:ler', 'observacoes:escrever', 'planos:ler', 'saude:ler'],
  CLIENTE: ['cadastros:ler', 'observacoes:ler', 'planos:ler', 'saude:ler', 'indicadores:ler'],
};

export function permissoesDoPerfil(perfil: Perfil): readonly Permissao[] {
  return PERMISSOES_POR_PERFIL[perfil] ?? [];
}

export function podeFazer(perfil: Perfil, permissao: Permissao): boolean {
  return permissoesDoPerfil(perfil).includes(permissao);
}

/**
 * Perfis cujo acesso e restrito a um unico cliente.
 * Para eles, `clienteId` e obrigatorio e todas as consultas sao escopadas.
 */
export const PERFIS_RESTRITOS_A_CLIENTE: readonly Perfil[] = ['CLIENTE'];

export function exigeCliente(perfil: Perfil): boolean {
  return PERFIS_RESTRITOS_A_CLIENTE.includes(perfil);
}

/* -------------------------------------------------------------------------- */
/* Senha                                                                       */
/* -------------------------------------------------------------------------- */

export const SENHA_TAMANHO_MINIMO = 8;

/**
 * Regra de senha: comprimento minimo e ao menos uma letra e um numero.
 * Deliberadamente simples — regras barrocas empurram o usuario para o post-it.
 */
export const senhaSchema = z
  .string({ required_error: 'Senha e obrigatoria.' })
  .min(SENHA_TAMANHO_MINIMO, `Senha deve ter ao menos ${SENHA_TAMANHO_MINIMO} caracteres.`)
  .max(100, 'Senha deve ter no maximo 100 caracteres.')
  .refine((valor) => /[A-Za-z]/.test(valor), 'Senha deve conter ao menos uma letra.')
  .refine((valor) => /\d/.test(valor), 'Senha deve conter ao menos um numero.');

/* -------------------------------------------------------------------------- */
/* Schemas                                                                     */
/* -------------------------------------------------------------------------- */

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Informe o e-mail.' })
    .trim()
    .toLowerCase()
    .email('E-mail invalido.'),
  senha: z.string({ required_error: 'Informe a senha.' }).min(1, 'Informe a senha.'),
});

export type LoginInput = z.input<typeof loginSchema>;

const usuarioBaseSchema = z.object({
  nome: texto(3, 120, 'Nome'),
  email: z
    .string({ required_error: 'E-mail e obrigatorio.' })
    .trim()
    .toLowerCase()
    .email('E-mail invalido.')
    .max(150),
  perfil: z.enum(PERFIS, {
    required_error: 'Informe o perfil de acesso.',
    invalid_type_error: 'Perfil invalido.',
  }),
  cargo: opcional(z.string().trim().max(80)),
  telefone: opcional(z.string().transform(limparTelefone).refine(isTelefoneValido, 'Telefone invalido.')),
  /** Restringe o acesso a um unico cliente. Obrigatorio no perfil CLIENTE. */
  clienteId: opcional(z.string().uuid('Cliente invalido.')),
  ativo: z.boolean().default(true),
});

function validarUsuario(dados: { perfil?: Perfil; clienteId?: string | null }, ctx: z.RefinementCtx): void {
  if (dados.perfil && exigeCliente(dados.perfil) && !dados.clienteId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['clienteId'],
      message: 'Perfil de cliente exige o vinculo com um cliente.',
    });
  }
}

export const usuarioCreateSchema = usuarioBaseSchema
  .extend({ senha: senhaSchema })
  .superRefine(validarUsuario);

export const usuarioUpdateSchema = usuarioBaseSchema
  .extend({ senha: senhaSchema.optional() })
  .partial()
  .superRefine(validarUsuario);

export type UsuarioCreateInput = z.input<typeof usuarioCreateSchema>;
export type UsuarioCreateData = z.output<typeof usuarioCreateSchema>;

/** Troca de senha pelo proprio usuario — exige a senha atual. */
export const trocarSenhaSchema = z
  .object({
    senhaAtual: z.string({ required_error: 'Informe a senha atual.' }).min(1, 'Informe a senha atual.'),
    novaSenha: senhaSchema,
    confirmacao: z.string({ required_error: 'Confirme a nova senha.' }),
  })
  .superRefine((dados, ctx) => {
    if (dados.novaSenha !== dados.confirmacao) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmacao'],
        message: 'A confirmacao nao confere com a nova senha.',
      });
    }
    if (dados.novaSenha === dados.senhaAtual) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['novaSenha'],
        message: 'A nova senha precisa ser diferente da atual.',
      });
    }
  });

export const usuarioFiltroSchema = z.object({
  busca: z.string().trim().max(120).optional(),
  perfil: z.enum(PERFIS).optional(),
  ativo: z.enum(['true', 'false']).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

export type UsuarioFiltro = z.output<typeof usuarioFiltroSchema>;

/* -------------------------------------------------------------------------- */
/* Sessao                                                                      */
/* -------------------------------------------------------------------------- */

/** O que a API devolve sobre o usuario autenticado. Nunca inclui a senha. */
export interface UsuarioSessao {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  cargo: string | null;
  clienteId: string | null;
  permissoes: Permissao[];
}

export type UsuarioFormValues = Omit<{ [Campo in keyof UsuarioCreateData]-?: string }, 'ativo'> & {
  ativo: boolean;
};
