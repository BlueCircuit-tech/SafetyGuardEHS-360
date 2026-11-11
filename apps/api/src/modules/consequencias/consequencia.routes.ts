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
import { avisarHierarquiaSobreConsequencia } from '../planos/notificacao.service.js';

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
      select: { id: true, nome: true, funcao: true, clienteId: true, cliente: { select: { nomeFantasia: true } } },
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

    /*
     * Aviso aos niveis hierarquicos do cliente (pedido da operacao). Fora da
     * transacao e sem bloquear a resposta: falha de e-mail nao desfaz o
     * registro, so fica no log.
     */
    const aviso = await avisarHierarquiaSobreConsequencia({
      clienteId: colaborador.clienteId,
      cliente: colaborador.cliente.nomeFantasia,
      colaborador: `${colaborador.nome} — ${colaborador.funcao}`,
      medida: ROTULO_MEDIDA[dados.medida as MedidaDisciplinar],
      comportamento: dados.comportamento,
      data: dados.data,
      liderNome: dados.liderNome,
    });

    return reply.status(201).send({ ...registro, aviso });
  });

  /**
   * Relatorio mensal/anual por empresa (pedido da operacao): registros,
   * medidas aplicadas, reincidentes e lista nominal do periodo.
   */
  app.get('/consequencias/relatorio', async (request) => {
    const { clienteId, ano, mes } = z
      .object({
        clienteId: z.string().uuid().optional(),
        ano: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()),
        mes: z.coerce.number().int().min(1).max(12).optional(),
      })
      .parse(request.query);

    const inicio = mes ? new Date(ano, mes - 1, 1) : new Date(ano, 0, 1);
    const fim = mes ? new Date(ano, mes, 1) : new Date(ano + 1, 0, 1);
    const where: Prisma.ConsequenciaWhereInput = {
      data: { gte: inicio, lt: fim },
      ...(clienteId ? { colaborador: { clienteId } } : {}),
    };

    const itens = await prisma.consequencia.findMany({ where, orderBy: { data: 'asc' }, include: COM_VINCULOS });

    const porMedida = new Map<string, number>();
    const porMotivacao = new Map<string, number>();
    const porColaborador = new Map<string, { nome: string; funcao: string; cliente: string; registros: number }>();
    const porMes = new Map<string, number>();
    const porCliente = new Map<string, number>();

    for (const item of itens) {
      porMedida.set(item.medida, (porMedida.get(item.medida) ?? 0) + 1);
      porMotivacao.set(item.motivacao, (porMotivacao.get(item.motivacao) ?? 0) + 1);
      const chaveMes = item.data.toISOString().slice(0, 7);
      porMes.set(chaveMes, (porMes.get(chaveMes) ?? 0) + 1);
      const cliente = item.colaborador.cliente?.nomeFantasia ?? '—';
      porCliente.set(cliente, (porCliente.get(cliente) ?? 0) + 1);
      const c = porColaborador.get(item.colaboradorId) ?? { nome: item.colaborador.nome, funcao: item.colaborador.funcao, cliente, registros: 0 };
      c.registros += 1;
      porColaborador.set(item.colaboradorId, c);
    }

    return {
      periodo: { ano, mes: mes ?? null, inicio, fim },
      total: itens.length,
      colaboradoresEnvolvidos: porColaborador.size,
      reincidentes: [...porColaborador.values()].filter((c) => c.registros > 1).length,
      porMedida: [...porMedida.entries()].map(([medida, quantidade]) => ({ medida, rotulo: ROTULO_MEDIDA[medida as MedidaDisciplinar], quantidade })),
      porMotivacao: [...porMotivacao.entries()].map(([motivacao, quantidade]) => ({ motivacao, rotulo: ROTULO_MOTIVACAO[motivacao as MotivacaoConsequencia], quantidade })),
      porMes: [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, quantidade]) => ({ mes, quantidade })),
      porCliente: [...porCliente.entries()].map(([cliente, quantidade]) => ({ cliente, quantidade })),
      porColaborador: [...porColaborador.values()].sort((a, b) => b.registros - a.registros),
      itens: itens.map((item) => ({
        id: item.id,
        data: item.data,
        colaborador: item.colaborador.nome,
        funcao: item.colaborador.funcao,
        cliente: item.colaborador.cliente?.nomeFantasia ?? '—',
        lider: item.liderNome,
        comportamento: item.comportamento,
        medida: ROTULO_MEDIDA[item.medida as MedidaDisciplinar],
        motivacao: ROTULO_MOTIVACAO[item.motivacao as MotivacaoConsequencia],
      })),
    };
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
