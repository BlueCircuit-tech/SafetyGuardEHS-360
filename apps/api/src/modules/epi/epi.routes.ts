import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  ROTULO_MOTIVO_ENTREGA,
  diasAteVencer,
  entregaEpiCreateSchema,
  epiCreateSchema,
  epiUpdateSchema,
  situacaoDaValidade,
  type MotivoEntregaEpi,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { Conflito, NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria } from '../../lib/auditoria.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });

/**
 * Etapa 14 — Gestao de EPI e Estoque.
 *
 * A entrega da baixa no estoque na mesma transacao — nunca ha ficha sem baixa
 * nem baixa sem ficha. Estoque zerado bloqueia a entrega, em vez de deixar o
 * saldo negativo esconder a falta.
 */
export async function registrarRotasEpi(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'cadastros:ler', escrita: 'cadastros:escrever' }));

  /* ------------------------------------------------------------ catalogo --- */

  app.get('/epis', async () => {
    const hoje = new Date();
    const itens = await prisma.epi.findMany({
      orderBy: { nome: 'asc' },
      include: { _count: { select: { entregas: true } } },
    });

    return itens.map((epi) => ({
      ...epi,
      situacaoCa: situacaoDaValidade(epi.validadeCa, hoje),
      diasParaVencerCa: diasAteVencer(epi.validadeCa, hoje),
      abaixoDoMinimo: epi.estoqueAtual < epi.estoqueMinimo,
    }));
  });

  app.get('/epis/resumo', async () => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const alerta = new Date(hoje.getTime());
    alerta.setDate(alerta.getDate() + 30);

    const inicio30 = new Date(hoje.getTime());
    inicio30.setDate(inicio30.getDate() - 30);

    const [ativos, caVencidos, caAVencer, entregas30, todos] = await prisma.$transaction([
      prisma.epi.count({ where: { ativo: true } }),
      prisma.epi.count({ where: { ativo: true, validadeCa: { lt: hoje } } }),
      prisma.epi.count({ where: { ativo: true, validadeCa: { gte: hoje, lte: alerta } } }),
      prisma.entregaEpi.aggregate({ where: { data: { gte: inicio30 } }, _sum: { quantidade: true } }),
      prisma.epi.findMany({ where: { ativo: true }, select: { estoqueAtual: true, estoqueMinimo: true } }),
    ]);

    return {
      ativos,
      caVencidos,
      caAVencer,
      abaixoDoMinimo: todos.filter((epi) => epi.estoqueAtual < epi.estoqueMinimo).length,
      entregues30Dias: entregas30._sum.quantidade ?? 0,
    };
  });

  app.post('/epis', async (request, reply) => {
    const dados = epiCreateSchema.parse(request.body);

    const existente = await prisma.epi.findUnique({
      where: { nome_ca: { nome: dados.nome, ca: dados.ca } },
      select: { id: true },
    });
    if (existente) throw new Conflito('Este EPI com este CA ja esta cadastrado.', 'EPI_DUPLICADO');

    const epi = await prisma.$transaction(async (tx) => {
      const criado = await tx.epi.create({ data: dados as Prisma.EpiUncheckedCreateInput });
      await registrarAuditoria(tx, {
        entidade: 'Epi',
        entidadeId: criado.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, criado as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });
      return criado;
    });

    return reply.status(201).send(epi);
  });

  app.put('/epis/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = epiUpdateSchema.parse(request.body);

    const atual = await prisma.epi.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado('EPI nao encontrado.', 'EPI_NAO_ENCONTRADO');

    return prisma.$transaction(async (tx) => {
      const epi = await tx.epi.update({ where: { id }, data: dados as Prisma.EpiUncheckedUpdateInput });
      const diferenca = calcularDiferenca(
        atual as unknown as Record<string, unknown>,
        epi as unknown as Record<string, unknown>,
      );
      if (Object.keys(diferenca).length > 0) {
        await registrarAuditoria(tx, {
          entidade: 'Epi',
          entidadeId: id,
          acao: 'ATUALIZACAO',
          alteracoes: diferenca,
          contexto: contextoDeAuditoria(request),
        });
      }
      return epi;
    });
  });

  /* ------------------------------------------------------------ entregas --- */

  app.get('/epis/entregas', async (request) => {
    const { colaboradorId, epiId } = z
      .object({ colaboradorId: z.string().uuid().optional(), epiId: z.string().uuid().optional() })
      .parse(request.query);

    const itens = await prisma.entregaEpi.findMany({
      where: { ...(colaboradorId ? { colaboradorId } : {}), ...(epiId ? { epiId } : {}) },
      orderBy: { data: 'desc' },
      take: 200,
      include: {
        epi: { select: { id: true, nome: true, ca: true } },
        colaborador: { select: { id: true, nome: true, funcao: true, clienteId: true } },
      },
    });

    return itens.map((entrega) => ({
      ...entrega,
      rotuloMotivo: ROTULO_MOTIVO_ENTREGA[entrega.motivo as MotivoEntregaEpi],
    }));
  });

  app.post('/epis/entregas', async (request, reply) => {
    const dados = entregaEpiCreateSchema.parse(request.body);

    const [epi, colaborador] = await Promise.all([
      prisma.epi.findUnique({ where: { id: dados.epiId }, select: { id: true, estoqueAtual: true, ativo: true } }),
      prisma.colaborador.findUnique({ where: { id: dados.colaboradorId }, select: { id: true } }),
    ]);
    if (!epi) throw new NaoEncontrado('EPI nao encontrado.', 'EPI_NAO_ENCONTRADO');
    if (!colaborador) throw new NaoEncontrado('Colaborador nao encontrado.', 'COLABORADOR_NAO_ENCONTRADO');
    if (!epi.ativo) throw new RequisicaoInvalida('EPI inativo nao pode ser entregue.', 'EPI_INATIVO');

    if (epi.estoqueAtual < dados.quantidade) {
      throw new RequisicaoInvalida(
        `Estoque insuficiente: ha ${epi.estoqueAtual} unidade(s) e a entrega pede ${dados.quantidade}.`,
        'ESTOQUE_INSUFICIENTE',
        { detalhes: { estoqueAtual: epi.estoqueAtual } },
      );
    }

    const entrega = await prisma.$transaction(async (tx) => {
      const criada = await tx.entregaEpi.create({ data: dados as Prisma.EntregaEpiUncheckedCreateInput });
      // Baixa no estoque na MESMA transacao da ficha.
      await tx.epi.update({ where: { id: dados.epiId }, data: { estoqueAtual: { decrement: dados.quantidade } } });
      await registrarAuditoria(tx, {
        entidade: 'EntregaEpi',
        entidadeId: criada.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, criada as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });
      return criada;
    });

    return reply.status(201).send(entrega);
  });

  /** Estorno: apaga a ficha e devolve a quantidade ao estoque. */
  app.delete('/epis/entregas/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const entrega = await prisma.entregaEpi.findUnique({ where: { id } });
    if (!entrega) throw new NaoEncontrado('Entrega nao encontrada.', 'ENTREGA_NAO_ENCONTRADA');

    await prisma.$transaction(async (tx) => {
      await tx.entregaEpi.delete({ where: { id } });
      await tx.epi.update({ where: { id: entrega.epiId }, data: { estoqueAtual: { increment: entrega.quantidade } } });
      await registrarAuditoria(tx, {
        entidade: 'EntregaEpi',
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: { quantidade: { de: entrega.quantidade, para: null } },
        contexto: contextoDeAuditoria(request),
      });
    });
    return reply.status(204).send();
  });
}
