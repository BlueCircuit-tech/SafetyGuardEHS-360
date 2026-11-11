import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { fornecedorCreateSchema, fornecedorFiltroSchema, fornecedorUpdateSchema } from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { Conflito, NaoEncontrado } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria } from '../../lib/auditoria.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });

type FornecedorComContagem = Prisma.FornecedorGetPayload<{ include: { _count: { select: { lancamentos: true } } } }>;

/** Troca o `_count` do Prisma por um campo plano que a tela entende. */
function serializar(fornecedor: FornecedorComContagem) {
  const { _count, ...dados } = fornecedor;
  return { ...dados, totalLancamentos: _count.lancamentos };
}

const INCLUIR_CONTAGEM = { _count: { select: { lancamentos: true } } } as const;

/**
 * Etapa 24 — Fornecedores.
 *
 * Cadastro de quem a consultoria compra (EPI, exames, treinamento...). O
 * fornecedor e referenciado pelos lancamentos da planilha financeira, por
 * isso quem tem lancamento nao pode ser apagado — so desativado.
 */
export async function registrarRotasFornecedores(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'cadastros:ler', escrita: 'cadastros:escrever' }));

  app.get('/fornecedores', async (request) => {
    const filtro = fornecedorFiltroSchema.parse(request.query);

    const where: Prisma.FornecedorWhereInput = {};
    if (filtro.inativos !== 'true') where.ativo = true;
    if (filtro.categoria) where.categoria = { equals: filtro.categoria, mode: 'insensitive' };
    if (filtro.busca) {
      const digitos = filtro.busca.replace(/\D/g, '');
      where.OR = [
        { nome: { contains: filtro.busca, mode: 'insensitive' } },
        { contatoNome: { contains: filtro.busca, mode: 'insensitive' } },
        { email: { contains: filtro.busca, mode: 'insensitive' } },
        { categoria: { contains: filtro.busca, mode: 'insensitive' } },
        ...(digitos.length >= 3
          ? [{ cnpj: { contains: digitos } }, { telefone: { contains: digitos } }, { whatsapp: { contains: digitos } }]
          : []),
      ];
    }

    const itens = await prisma.fornecedor.findMany({
      where,
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
      include: INCLUIR_CONTAGEM,
    });
    return itens.map(serializar);
  });

  app.get('/fornecedores/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const fornecedor = await prisma.fornecedor.findUnique({ where: { id }, include: INCLUIR_CONTAGEM });
    if (!fornecedor) throw new NaoEncontrado('Fornecedor nao encontrado.', 'FORNECEDOR_NAO_ENCONTRADO');
    return serializar(fornecedor);
  });

  app.post('/fornecedores', async (request, reply) => {
    const dados = fornecedorCreateSchema.parse(request.body);

    if (dados.cnpj) {
      const duplicado = await prisma.fornecedor.findFirst({ where: { cnpj: dados.cnpj }, select: { id: true, nome: true } });
      if (duplicado) {
        throw new Conflito(`Este CNPJ ja esta cadastrado em "${duplicado.nome}".`, 'FORNECEDOR_DUPLICADO', {
          campos: { cnpj: ['CNPJ ja cadastrado.'] },
        });
      }
    }

    const fornecedor = await prisma.$transaction(async (tx) => {
      const criado = await tx.fornecedor.create({ data: dados, include: INCLUIR_CONTAGEM });
      await registrarAuditoria(tx, {
        entidade: 'Fornecedor',
        entidadeId: criado.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, dados as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });
      return criado;
    });

    return reply.status(201).send(serializar(fornecedor));
  });

  app.put('/fornecedores/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = fornecedorUpdateSchema.parse(request.body);

    const atual = await prisma.fornecedor.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado('Fornecedor nao encontrado.', 'FORNECEDOR_NAO_ENCONTRADO');

    if (dados.cnpj && dados.cnpj !== atual.cnpj) {
      const duplicado = await prisma.fornecedor.findFirst({
        where: { cnpj: dados.cnpj, id: { not: id } },
        select: { id: true, nome: true },
      });
      if (duplicado) {
        throw new Conflito(`Este CNPJ ja esta cadastrado em "${duplicado.nome}".`, 'FORNECEDOR_DUPLICADO', {
          campos: { cnpj: ['CNPJ ja cadastrado.'] },
        });
      }
    }

    const fornecedor = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.fornecedor.update({ where: { id }, data: dados, include: INCLUIR_CONTAGEM });
      const diferenca = calcularDiferenca(
        atual as unknown as Record<string, unknown>,
        atualizado as unknown as Record<string, unknown>,
      );
      if (Object.keys(diferenca).length > 0) {
        await registrarAuditoria(tx, {
          entidade: 'Fornecedor',
          entidadeId: id,
          acao: 'ATUALIZACAO',
          alteracoes: diferenca,
          contexto: contextoDeAuditoria(request),
        });
      }
      return atualizado;
    });

    return serializar(fornecedor);
  });

  app.delete('/fornecedores/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);

    const fornecedor = await prisma.fornecedor.findUnique({ where: { id }, include: INCLUIR_CONTAGEM });
    if (!fornecedor) throw new NaoEncontrado('Fornecedor nao encontrado.', 'FORNECEDOR_NAO_ENCONTRADO');

    if (fornecedor._count.lancamentos > 0) {
      throw new Conflito(
        `Este fornecedor tem ${fornecedor._count.lancamentos} lancamento(s) na planilha financeira. Desative-o em vez de excluir.`,
        'FORNECEDOR_COM_LANCAMENTOS',
        { detalhes: { lancamentos: fornecedor._count.lancamentos } },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.fornecedor.delete({ where: { id } });
      await registrarAuditoria(tx, {
        entidade: 'Fornecedor',
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: { nome: { de: fornecedor.nome, para: null } },
        contexto: contextoDeAuditoria(request),
      });
    });

    return reply.status(204).send();
  });
}
