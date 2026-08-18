import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  DESCRICAO_PERFIL,
  PERFIS,
  PERMISSOES_POR_PERFIL,
  ROTULO_PERFIL,
  exigeCliente,
  loginSchema,
  trocarSenhaSchema,
  usuarioCreateSchema,
  usuarioFiltroSchema,
  usuarioUpdateSchema,
  type Perfil,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { conferirSenha, gerarHashSenha } from '../../lib/senha.js';
import { NaoAutenticado, contextoDeAuditoria, montarSessao } from '../../lib/autenticacao.js';
import { Conflito, NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { registrarAuditoria } from '../../lib/auditoria.js';

const ENTIDADE = 'Usuario';

const paramsSchema = z.object({ id: z.string().uuid('Identificador de usuario invalido.') });

/** Campos devolvidos ao front. `senhaHash` nunca sai daqui. */
const CAMPOS_PUBLICOS = {
  id: true,
  nome: true,
  email: true,
  perfil: true,
  cargo: true,
  telefone: true,
  clienteId: true,
  ativo: true,
  ultimoAcesso: true,
  criadoEm: true,
  atualizadoEm: true,
  cliente: { select: { id: true, nomeFantasia: true } },
} satisfies Prisma.UsuarioSelect;

export async function rotasUsuarios(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------------- auth -- */

  app.post('/auth/login', async (request, reply) => {
    const { email, senha } = loginSchema.parse(request.body);

    const usuario = await prisma.usuario.findUnique({
      where: { email },
      select: { ...CAMPOS_PUBLICOS, senhaHash: true },
    });

    // Mensagem única para e-mail inexistente, senha errada ou usuário inativo:
    // não confirmamos quais e-mails existem na base.
    const generico = new NaoAutenticado('E-mail ou senha invalidos.');
    if (!usuario) {
      // Gasta o mesmo tempo do caminho válido, para não vazar por temporização.
      await conferirSenha(senha, 'scrypt$00$00');
      throw generico;
    }

    const confere = await conferirSenha(senha, usuario.senhaHash);
    if (!confere || !usuario.ativo) throw generico;

    await prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoAcesso: new Date() } });

    const sessao = montarSessao(usuario);
    const token = app.jwt.sign({ sub: usuario.id });

    return reply.send({ token, usuario: sessao });
  });

  app.get('/auth/eu', { preHandler: app.autenticar }, async (request) => request.usuario);

  app.get('/auth/perfis', async () =>
    PERFIS.map((perfil) => ({
      perfil,
      rotulo: ROTULO_PERFIL[perfil],
      descricao: DESCRICAO_PERFIL[perfil],
      permissoes: PERMISSOES_POR_PERFIL[perfil],
      exigeCliente: exigeCliente(perfil),
    })),
  );

  app.post('/auth/trocar-senha', { preHandler: app.autenticar }, async (request: FastifyRequest) => {
    const dados = trocarSenhaSchema.parse(request.body);
    const id = request.usuario!.id;

    const usuario = await prisma.usuario.findUnique({ where: { id }, select: { senhaHash: true } });
    if (!usuario) throw new NaoEncontrado('Usuario nao encontrado.', 'USUARIO_NAO_ENCONTRADO');

    if (!(await conferirSenha(dados.senhaAtual, usuario.senhaHash))) {
      throw new RequisicaoInvalida('Senha atual incorreta.', 'SENHA_INCORRETA', {
        campos: { senhaAtual: ['Senha atual incorreta.'] },
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id }, data: { senhaHash: await gerarHashSenha(dados.novaSenha) } });
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: id,
        acao: 'ATUALIZACAO',
        // Registra o evento, nunca o conteudo da senha.
        alteracoes: { senha: { de: null, para: 'alterada pelo proprio usuario' } },
        contexto: contextoDeAuditoria(request),
      });
    });

    return { alterada: true };
  });

  /* ------------------------------------------------------------ usuarios -- */

  const guarda = { preHandler: app.exigirPermissao('usuarios:gerenciar') };

  app.get('/usuarios', guarda, async (request) => {
    const filtro = usuarioFiltroSchema.parse(request.query);

    const where: Prisma.UsuarioWhereInput = {};
    if (filtro.perfil) where.perfil = filtro.perfil;
    if (filtro.ativo) where.ativo = filtro.ativo === 'true';
    if (filtro.busca) {
      where.OR = [
        { nome: { contains: filtro.busca, mode: 'insensitive' } },
        { email: { contains: filtro.busca, mode: 'insensitive' } },
        { cargo: { contains: filtro.busca, mode: 'insensitive' } },
      ];
    }

    const [total, itens] = await prisma.$transaction([
      prisma.usuario.count({ where }),
      prisma.usuario.findMany({
        where,
        orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
        select: CAMPOS_PUBLICOS,
      }),
    ]);

    return {
      itens: itens.map((usuario) => ({
        ...usuario,
        rotuloPerfil: ROTULO_PERFIL[usuario.perfil as Perfil],
        permissoes: PERMISSOES_POR_PERFIL[usuario.perfil as Perfil],
      })),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
      totalPaginas: Math.max(1, Math.ceil(total / filtro.porPagina)),
    };
  });

  app.post('/usuarios', guarda, async (request, reply) => {
    const dados = usuarioCreateSchema.parse(request.body);

    const existente = await prisma.usuario.findUnique({ where: { email: dados.email }, select: { id: true } });
    if (existente) {
      throw new Conflito('Ja existe um usuario com este e-mail.', 'EMAIL_DUPLICADO', {
        campos: { email: ['E-mail ja cadastrado.'] },
      });
    }

    const { senha, ...resto } = dados;

    const usuario = await prisma.$transaction(async (tx) => {
      const criado = await tx.usuario.create({
        data: { ...resto, senhaHash: await gerarHashSenha(senha) },
        select: CAMPOS_PUBLICOS,
      });

      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: criado.id,
        acao: 'CRIACAO',
        alteracoes: {
          nome: { de: null, para: criado.nome },
          email: { de: null, para: criado.email },
          perfil: { de: null, para: criado.perfil },
        },
        contexto: contextoDeAuditoria(request),
      });

      return criado;
    });

    return reply.status(201).send(usuario);
  });

  app.put('/usuarios/:id', guarda, async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = usuarioUpdateSchema.parse(request.body);

    const atual = await prisma.usuario.findUnique({ where: { id }, select: CAMPOS_PUBLICOS });
    if (!atual) throw new NaoEncontrado('Usuario nao encontrado.', 'USUARIO_NAO_ENCONTRADO');

    // Ninguem pode se auto-rebaixar ou se desativar e travar a plataforma.
    if (id === request.usuario?.id) {
      if (dados.perfil && dados.perfil !== atual.perfil) {
        throw new RequisicaoInvalida('Voce nao pode alterar o proprio perfil.', 'AUTO_ALTERACAO_PERFIL', {
          campos: { perfil: ['Peca a outro administrador para alterar o seu perfil.'] },
        });
      }
      if (dados.ativo === false) {
        throw new RequisicaoInvalida('Voce nao pode desativar a si mesmo.', 'AUTO_DESATIVACAO');
      }
    }

    if (dados.email && dados.email !== atual.email) {
      const emUso = await prisma.usuario.findUnique({ where: { email: dados.email }, select: { id: true } });
      if (emUso) {
        throw new Conflito('Ja existe um usuario com este e-mail.', 'EMAIL_DUPLICADO', {
          campos: { email: ['E-mail ja cadastrado.'] },
        });
      }
    }

    const { senha, ...resto } = dados;
    const data: Prisma.UsuarioUncheckedUpdateInput = { ...resto };
    if (senha) data.senhaHash = await gerarHashSenha(senha);

    return prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.update({ where: { id }, data, select: CAMPOS_PUBLICOS });

      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: id,
        acao: 'ATUALIZACAO',
        alteracoes: {
          ...(dados.perfil && dados.perfil !== atual.perfil
            ? { perfil: { de: atual.perfil, para: dados.perfil } }
            : {}),
          ...(dados.ativo !== undefined && dados.ativo !== atual.ativo
            ? { ativo: { de: atual.ativo, para: dados.ativo } }
            : {}),
          ...(senha ? { senha: { de: null, para: 'redefinida por administrador' } } : {}),
        },
        contexto: contextoDeAuditoria(request),
      });

      return usuario;
    });
  });

  app.delete('/usuarios/:id', guarda, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);

    if (id === request.usuario?.id) {
      throw new RequisicaoInvalida('Voce nao pode excluir a si mesmo.', 'AUTO_EXCLUSAO');
    }

    const usuario = await prisma.usuario.findUnique({ where: { id }, select: { nome: true, email: true } });
    if (!usuario) throw new NaoEncontrado('Usuario nao encontrado.', 'USUARIO_NAO_ENCONTRADO');

    await prisma.$transaction(async (tx) => {
      await tx.usuario.delete({ where: { id } });
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: { email: { de: usuario.email, para: null } },
        contexto: contextoDeAuditoria(request),
      });
    });

    return reply.status(204).send();
  });
}
