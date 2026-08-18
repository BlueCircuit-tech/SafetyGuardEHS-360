import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  ROTULO_MEDIDA,
  ROTULO_MOTIVACAO,
  consequenciaCreateSchema,
  consequenciaFiltroSchema,
  consequenciaUpdateSchema,
  type MedidaDisciplinar,
  type MotivacaoConsequencia,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { NaoEncontrado } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria } from '../../lib/auditoria.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';

const ENTIDADE = 'Consequencia';
const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });

const COM_VINCULOS = {
  colaborador: {
    select: {
      id: true,
      nome: true,
      funcao: true,
      clienteId: true,
      cliente: { select: { nomeFantasia: true } },
      terceiro: { select: { nomeFantasia: true } },
    },
  },
  observacao: { select: { id: true, descricao: true } },
} satisfies Prisma.ConsequenciaInclude;

/**
 * Etapa 15 — Gestao de Consequencias.
 *
 * Registro sensivel: envolve medida disciplinar sobre pessoa identificada.
 * Fica sob `planos:*` — quem trata desvio trata consequencia — e fora do
 * alcance do perfil TECNICO, que nao tem planos:escrever.
 */
export async function registrarRotasConsequencias(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'planos:ler', escrita: 'planos:escrever' }));

  app.get('/consequencias', async (request) => {
    const filtro = consequenciaFiltroSchema.parse(request.query);

    const where: Prisma.ConsequenciaWhereInput = {};
    if (filtro.colaboradorId) where.colaboradorId = filtro.colaboradorId;
    if (filtro.medida) where.medida = filtro.medida;
    if (filtro.clienteId) where.colaborador = { clienteId: filtro.clienteId };
    if (filtro.busca) {
      where.OR = [
        { comportamento: { contains: filtro.busca, mode: 'insensitive' } },
        { liderNome: { contains: filtro.busca, mode: 'insensitive' } },
        { colaborador: { nome: { contains: filtro.busca, mode: 'insensitive' } } },
      ];
    }

    const itens = await prisma.consequencia.findMany({
      where,
      orderBy: { data: 'desc' },
      take: 200,
      include: COM_VINCULOS,
    });

    // Reincidencia derivada, nunca digitada: quantos registros o mesmo
    // colaborador acumula — e o dado que a planilha original contava a mao.
    const contagens = await prisma.consequencia.groupBy({
      by: ['colaboradorId'],
      _count: { _all: true },
      where: { colaboradorId: { in: [...new Set(itens.map((item) => item.colaboradorId))] } },
    });
    const reincidencias = new Map(contagens.map((linha) => [linha.colaboradorId, linha._count._all]));

    return itens.map((item) => ({
      ...item,
      clienteId: item.colaborador.clienteId,
      ocorrenciasDoColaborador: reincidencias.get(item.colaboradorId) ?? 1,
      rotulos: {
        medida: ROTULO_MEDIDA[item.medida as MedidaDisciplinar],
        motivacao: ROTULO_MOTIVACAO[item.motivacao as MotivacaoConsequencia],
      },
    }));
  });

  app.get('/consequencias/resumo', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    const base: Prisma.ConsequenciaWhereInput = clienteId ? { colaborador: { clienteId } } : {};

    const [total, porMedida, reincidentes] = await Promise.all([
      prisma.consequencia.count({ where: base }),
      prisma.consequencia.groupBy({ by: ['medida'], _count: { _all: true }, where: base }),
      prisma.consequencia.groupBy({
        by: ['colaboradorId'],
        _count: { _all: true },
        where: base,
        having: { colaboradorId: { _count: { gt: 1 } } },
      }),
    ]);

    return {
      total,
      reincidentes: reincidentes.length,
      porMedida: porMedida.map((linha) => ({
        medida: linha.medida,
        rotulo: ROTULO_MEDIDA[linha.medida as MedidaDisciplinar],
        quantidade: linha._count._all,
      })),
    };
  });

  app.post('/consequencias', async (request, reply) => {
    const dados = consequenciaCreateSchema.parse(request.body);

    const colaborador = await prisma.colaborador.findUnique({
      where: { id: dados.colaboradorId },
      select: { id: true },
    });
    if (!colaborador) throw new NaoEncontrado('Colaborador nao encontrado.', 'COLABORADOR_NAO_ENCONTRADO');

    const registro = await prisma.$transaction(async (tx) => {
      const criado = await tx.consequencia.create({ data: dados as Prisma.ConsequenciaUncheckedCreateInput });
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: criado.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, criado as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });
      return criado;
    });

    return reply.status(201).send(registro);
  });

  app.put('/consequencias/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = consequenciaUpdateSchema.parse(request.body);

    const atual = await prisma.consequencia.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado('Registro nao encontrado.', 'CONSEQUENCIA_NAO_ENCONTRADA');

    return prisma.$transaction(async (tx) => {
      const registro = await tx.consequencia.update({
        where: { id },
        data: dados as Prisma.ConsequenciaUncheckedUpdateInput,
      });
      const diferenca = calcularDiferenca(
        atual as unknown as Record<string, unknown>,
        registro as unknown as Record<string, unknown>,
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
      return registro;
    });
  });

  app.delete('/consequencias/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await prisma.consequencia.findUnique({ where: { id }, select: { comportamento: true } });
    if (!atual) throw new NaoEncontrado('Registro nao encontrado.', 'CONSEQUENCIA_NAO_ENCONTRADA');

    await prisma.$transaction(async (tx) => {
      await tx.consequencia.delete({ where: { id } });
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: { comportamento: { de: atual.comportamento, para: null } },
        contexto: contextoDeAuditoria(request),
      });
    });
    return reply.status(204).send();
  });
}
