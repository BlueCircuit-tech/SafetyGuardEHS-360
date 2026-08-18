import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { permissoesDoPerfil, type Perfil, type Permissao, type UsuarioSessao } from '@safetyguard/shared';
import { ErroApp, NaoEncontrado } from './erros.js';
import { env } from '../env.js';
import { prisma } from '../db.js';

/**
 * Autenticacao por JWT e autorizacao por permissao.
 *
 * O token carrega apenas o id do usuario; perfil e permissoes sao relidos do
 * banco a cada requisicao. Assim, revogar acesso ou trocar o perfil de alguem
 * tem efeito imediato, sem esperar o token expirar.
 */

declare module 'fastify' {
  interface FastifyRequest {
    /** Usuario autenticado. `null` nas rotas publicas. */
    usuario: UsuarioSessao | null;
  }

  interface FastifyInstance {
    /** Exige token valido. Use em `preHandler`. */
    autenticar: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Exige token valido e a permissao informada. */
    exigirPermissao: (
      permissao: Permissao,
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export class NaoAutenticado extends ErroApp {
  constructor(mensagem = 'Faca login para continuar.') {
    super(mensagem, { status: 401, codigo: 'NAO_AUTENTICADO' });
  }
}

export class SemPermissao extends ErroApp {
  constructor(permissao: Permissao) {
    super(`Seu perfil nao tem a permissao "${permissao}".`, {
      status: 403,
      codigo: 'SEM_PERMISSAO',
      detalhes: { permissao },
    });
  }
}

/** Monta a sessao a partir do registro do usuario. Nunca inclui a senha. */
export function montarSessao(usuario: {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  cargo: string | null;
  clienteId: string | null;
}): UsuarioSessao {
  const perfil = usuario.perfil as Perfil;
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil,
    cargo: usuario.cargo,
    clienteId: usuario.clienteId,
    permissoes: [...permissoesDoPerfil(perfil)],
  };
}

export async function registrarAutenticacao(app: FastifyInstance): Promise<void> {
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRA_EM },
  });

  app.decorateRequest('usuario', null);

  app.decorate('autenticar', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new NaoAutenticado('Sessao invalida ou expirada.');
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: request.user.sub },
      select: { id: true, nome: true, email: true, perfil: true, cargo: true, clienteId: true, ativo: true },
    });

    if (!usuario) throw new NaoAutenticado('Usuario nao encontrado.');
    if (!usuario.ativo) throw new NaoAutenticado('Usuario inativo.');

    request.usuario = montarSessao(usuario);
  });

  app.decorate('exigirPermissao', (permissao: Permissao) => async (request: FastifyRequest, reply: FastifyReply) => {
    await app.autenticar(request, reply);

    if (!request.usuario?.permissoes.includes(permissao)) {
      throw new SemPermissao(permissao);
    }
  });
}

/**
 * Escopo do usuario restrito a um cliente.
 *
 * Perfis de cliente so enxergam o proprio contrato: o `clienteId` do filtro e
 * sobrescrito, entao nao adianta o front mandar outro.
 */
export function aplicarEscopoDoUsuario<T extends { clienteId?: string | undefined }>(
  request: FastifyRequest,
  filtro: T,
): T {
  if (request.usuario?.clienteId) {
    return { ...filtro, clienteId: request.usuario.clienteId };
  }
  return filtro;
}

/**
 * Barreira de saida: nenhum registro de outro cliente sai na resposta.
 *
 * O filtro de query cobre as listagens, mas nao o acesso direto por id
 * (`GET /observacoes/:id`). Este gancho vale para toda rota de uma vez: se o
 * payload traz um `clienteId` diferente do escopo do usuario, vira 404 — nao
 * confirmamos nem que o registro existe.
 */
export function registrarEscopoNaResposta(app: FastifyInstance): void {
  app.addHook('preSerialization', async (request, _reply, payload) => {
    const escopo = request.usuario?.clienteId;
    if (!escopo || !payload || typeof payload !== 'object') return payload;

    const registro = payload as { clienteId?: unknown };
    if (typeof registro.clienteId === 'string' && registro.clienteId !== escopo) {
      throw new NaoEncontrado();
    }

    return payload;
  });
}

/**
 * Impoe o escopo do usuario sobre a query string da requisicao.
 *
 * Chamada pela guarda de rota, entao vale para toda listagem sem que cada
 * handler precise lembrar. O `clienteId` enviado pelo front e descartado: quem
 * e restrito a um cliente le apenas o proprio contrato.
 */
export function aplicarEscopoNaConsulta(request: FastifyRequest): void {
  const clienteId = request.usuario?.clienteId;
  if (!clienteId) return;

  const consulta = request.query;
  if (consulta && typeof consulta === 'object') {
    (consulta as Record<string, unknown>).clienteId = clienteId;
  }
}

/** Contexto de auditoria com o usuario autenticado — nao mais um cabecalho. */
export function contextoDeAuditoria(request: FastifyRequest): { autor: string; ip: string } {
  return {
    autor: request.usuario ? `${request.usuario.nome} <${request.usuario.email}>` : 'sistema',
    ip: request.ip,
  };
}
