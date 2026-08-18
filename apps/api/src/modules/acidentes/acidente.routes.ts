import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  ROTULO_INVESTIGACAO,
  ROTULO_TIPO_ACIDENTE,
  acidenteCreateSchema,
  acidenteUpdateSchema,
  problemasDoAcidente,
  type SituacaoInvestigacao,
  type TipoAcidente,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria } from '../../lib/auditoria.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';

const ENTIDADE = 'Acidente';
const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });
const MS_POR_DIA = 24 * 60 * 60 * 1000;

const COM_VINCULOS = {
  cliente: { select: { id: true, nomeFantasia: true } },
  area: { select: { id: true, nome: true, codigo: true } },
  colaborador: { select: { id: true, nome: true, funcao: true } },
  planoAcao: { select: { id: true, codigo: true, status: true } },
} satisfies Prisma.AcidenteInclude;

/** CAT pendente: acidente tipico/trajeto sem numero de CAT ha mais de 1 dia. */
function catPendente(acidente: { catNumero: string | null; data: Date }): boolean {
  if (acidente.catNumero) return false;
  return Date.now() - acidente.data.getTime() > MS_POR_DIA;
}

/**
 * Etapa 18 — Acidentes, CAT e Investigacao.
 * Registro sensivel como a gestao de consequencias: permissoes `planos:*`.
 */
export async function registrarRotasAcidentes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'planos:ler', escrita: 'planos:escrever' }));

  app.get('/acidentes', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);

    const itens = await prisma.acidente.findMany({
      where: clienteId ? { clienteId } : {},
      orderBy: { data: 'desc' },
      take: 200,
      include: COM_VINCULOS,
    });

    return itens.map((acidente) => ({
      ...acidente,
      catPendente: catPendente(acidente),
      rotulos: {
        tipo: ROTULO_TIPO_ACIDENTE[acidente.tipo as TipoAcidente],
        investigacao: ROTULO_INVESTIGACAO[acidente.situacaoInvestigacao as SituacaoInvestigacao],
      },
    }));
  });

  app.get('/acidentes/resumo', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    const inicio = new Date();
    inicio.setMonth(inicio.getMonth() - 12);
    const base: Prisma.AcidenteWhereInput = { ...(clienteId ? { clienteId } : {}), data: { gte: inicio } };

    const [total, comAfastamento, diasPerdidos, investigacoesAbertas, semCat] = await prisma.$transaction([
      prisma.acidente.count({ where: base }),
      prisma.acidente.count({ where: { ...base, comAfastamento: true } }),
      prisma.acidente.aggregate({ where: base, _sum: { diasAfastamento: true } }),
      prisma.acidente.count({ where: { ...base, situacaoInvestigacao: { not: 'CONCLUIDA' } } }),
      prisma.acidente.findMany({ where: { ...base, catNumero: null }, select: { catNumero: true, data: true } }),
    ]);

    return {
      ultimos12Meses: total,
      comAfastamento,
      diasPerdidos: diasPerdidos._sum.diasAfastamento ?? 0,
      investigacoesAbertas,
      catsPendentes: semCat.filter(catPendente).length,
    };
  });

  app.get('/acidentes/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const acidente = await prisma.acidente.findUnique({ where: { id }, include: COM_VINCULOS });
    if (!acidente) throw new NaoEncontrado('Acidente nao encontrado.', 'ACIDENTE_NAO_ENCONTRADO');
    return { ...acidente, catPendente: catPendente(acidente) };
  });

  app.post('/acidentes', async (request, reply) => {
    const dados = acidenteCreateSchema.parse(request.body);

    const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true } });
    if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');

    const acidente = await prisma.$transaction(async (tx) => {
      const criado = await tx.acidente.create({ data: dados as Prisma.AcidenteUncheckedCreateInput });
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: criado.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, criado as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });
      return criado;
    });

    return reply.status(201).send(acidente);
  });

  app.put('/acidentes/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = acidenteUpdateSchema.parse(request.body);

    const atual = await prisma.acidente.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado('Acidente nao encontrado.', 'ACIDENTE_NAO_ENCONTRADO');

    // A regra cruzada vale sobre o estado FINAL, nao sobre o payload parcial.
    const problemas = problemasDoAcidente({ ...atual, ...dados });
    if (Object.keys(problemas).length > 0) {
      throw new RequisicaoInvalida('Os dados enviados nao passaram na validacao.', 'VALIDACAO', {
        campos: problemas,
      });
    }

    /*
     * Concluir a investigacao carimba a data automaticamente, como a conclusao
     * do plano de acao — sem depender do usuario lembrar do campo.
     */
    const concluindo =
      dados.situacaoInvestigacao === 'CONCLUIDA' &&
      atual.situacaoInvestigacao !== 'CONCLUIDA' &&
      !dados.investigacaoConcluidaEm;

    return prisma.$transaction(async (tx) => {
      const acidente = await tx.acidente.update({
        where: { id },
        data: {
          ...(dados as Prisma.AcidenteUncheckedUpdateInput),
          ...(concluindo ? { investigacaoConcluidaEm: new Date() } : {}),
        },
        include: COM_VINCULOS,
      });

      const diferenca = calcularDiferenca(
        atual as unknown as Record<string, unknown>,
        acidente as unknown as Record<string, unknown>,
      );
      if (Object.keys(diferenca).length > 0) {
        await registrarAuditoria(tx, {
          entidade: ENTIDADE,
          entidadeId: id,
          acao: 'ATUALIZACAO',
          alteracoes: diferenca,
          contexto: contextoDeAuditoria(request),
        });
      }
      return { ...acidente, catPendente: catPendente(acidente) };
    });
  });

  app.delete('/acidentes/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await prisma.acidente.findUnique({ where: { id }, select: { descricao: true } });
    if (!atual) throw new NaoEncontrado('Acidente nao encontrado.', 'ACIDENTE_NAO_ENCONTRADO');

    await prisma.$transaction(async (tx) => {
      await tx.acidente.delete({ where: { id } });
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: { descricao: { de: atual.descricao.slice(0, 80), para: null } },
        contexto: contextoDeAuditoria(request),
      });
    });
    return reply.status(204).send();
  });
}
