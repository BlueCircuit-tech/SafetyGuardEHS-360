import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  DIAS_DEBITADOS,
  ROTULO_INVESTIGACAO,
  ROTULO_LESAO_PERMANENTE,
  ROTULO_TIPO_ACIDENTE,
  acidenteCreateSchema,
  acidenteUpdateSchema,
  diasComputados,
  problemasDoAcidente,
  totalCausasIshikawa,
  type Ishikawa,
  type LesaoPermanente,
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
 * Campos Json? do Prisma nao aceitam `null` puro — exigem `Prisma.DbNull`.
 * O schema compartilhado entrega `null` para "limpar"; aqui se traduz.
 */
function normalizarJson<T extends { ishikawa?: unknown; cincoPorques?: unknown; lesaoPermanente?: string }>(dados: T): T {
  const saida: Record<string, unknown> = { ...dados };
  for (const campo of ['ishikawa', 'cincoPorques'] as const) {
    if (campo in saida && saida[campo] === null) saida[campo] = Prisma.DbNull;
  }
  // Dias debitados (NBR 14280) sao DERIVADOS da lesao — nunca digitados.
  if (typeof saida.lesaoPermanente === 'string') {
    saida.diasDebitados = DIAS_DEBITADOS[saida.lesaoPermanente as LesaoPermanente] ?? 0;
  }
  return saida as T;
}

function rotular<T extends { tipo: string; situacaoInvestigacao: string; lesaoPermanente: string | null; diasAfastamento: number; diasDebitados: number }>(acidente: T) {
  return {
    ...acidente,
    diasComputados: diasComputados(acidente),
    rotulos: {
      tipo: ROTULO_TIPO_ACIDENTE[acidente.tipo as TipoAcidente],
      investigacao: ROTULO_INVESTIGACAO[acidente.situacaoInvestigacao as SituacaoInvestigacao],
      lesaoPermanente: ROTULO_LESAO_PERMANENTE[(acidente.lesaoPermanente ?? 'NENHUMA') as LesaoPermanente],
    },
  };
}

const filtroSchema = z.object({
  clienteId: z.string().uuid().optional(),
  areaId: z.string().uuid().optional(),
  tipo: z.enum(['TIPICO', 'TRAJETO', 'DOENCA_OCUPACIONAL']).optional(),
  situacaoInvestigacao: z.enum(['ABERTA', 'EM_INVESTIGACAO', 'CONCLUIDA']).optional(),
  comAfastamento: z.coerce.boolean().optional(),
  busca: z.string().trim().max(120).optional(),
  de: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
});

/** Inicio e fim (exclusivo) do dia civil da data informada. */
function janelaDoDia(data: Date): { inicio: Date; fim: Date } {
  const inicio = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const fim = new Date(inicio.getTime() + MS_POR_DIA);
  return { inicio, fim };
}

/**
 * Etapa 18 — Acidentes, CAT e Investigacao.
 * Registro sensivel como a gestao de consequencias: permissoes `planos:*`.
 */
export async function registrarRotasAcidentes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'planos:ler', escrita: 'planos:escrever' }));

  /** Historico pesquisavel: texto livre, periodo, tipo, area e situacao. */
  app.get('/acidentes', async (request) => {
    const filtro = filtroSchema.parse(request.query);

    const where: Prisma.AcidenteWhereInput = {};
    if (filtro.clienteId) where.clienteId = filtro.clienteId;
    if (filtro.areaId) where.areaId = filtro.areaId;
    if (filtro.tipo) where.tipo = filtro.tipo;
    if (filtro.situacaoInvestigacao) where.situacaoInvestigacao = filtro.situacaoInvestigacao;
    if (filtro.comAfastamento !== undefined) where.comAfastamento = filtro.comAfastamento;
    if (filtro.de || filtro.ate) {
      where.data = { ...(filtro.de ? { gte: filtro.de } : {}), ...(filtro.ate ? { lte: filtro.ate } : {}) };
    }
    if (filtro.busca) {
      where.OR = [
        { descricao: { contains: filtro.busca, mode: 'insensitive' } },
        { causaRaiz: { contains: filtro.busca, mode: 'insensitive' } },
        { parteCorpoAtingida: { contains: filtro.busca, mode: 'insensitive' } },
        { catNumero: { contains: filtro.busca, mode: 'insensitive' } },
        { colaborador: { nome: { contains: filtro.busca, mode: 'insensitive' } } },
        { area: { nome: { contains: filtro.busca, mode: 'insensitive' } } },
      ];
    }

    const itens = await prisma.acidente.findMany({
      where,
      orderBy: { data: 'desc' },
      take: 200,
      include: COM_VINCULOS,
    });

    return itens.map((acidente) => ({
      ...rotular(acidente),
      catPendente: catPendente(acidente),
      causasIshikawa: totalCausasIshikawa(acidente.ishikawa as Ishikawa | null),
    }));
  });

  /**
   * Relatorio diario consolidado: tudo que aconteceu no dia, com evidencias.
   *
   * Reune acidentes, observacoes com foto, planos abertos e planos que
   * venceram — e o material do fechamento do dia da consultoria. A data e
   * interpretada no fuso do servidor (America/Sao_Paulo em producao).
   */
  app.get('/acidentes/relatorio-diario', async (request) => {
    const { clienteId, data } = z
      .object({ clienteId: z.string().uuid().optional(), data: z.coerce.date().default(() => new Date()) })
      .parse(request.query);
    const { inicio, fim } = janelaDoDia(data);
    const porCliente = clienteId ? { clienteId } : {};

    const cliente = clienteId
      ? await prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true, nomeFantasia: true, razaoSocial: true } })
      : null;

    const [acidentes, observacoes, planosAbertos, planosVencidos] = await prisma.$transaction([
      prisma.acidente.findMany({
        where: { ...porCliente, data: { gte: inicio, lt: fim } },
        orderBy: { data: 'asc' },
        include: COM_VINCULOS,
      }),
      prisma.observacao.findMany({
        where: { ...porCliente, dataHora: { gte: inicio, lt: fim }, tipo: { not: 'COMPORTAMENTO_SEGURO' } },
        orderBy: { dataHora: 'asc' },
        include: {
          area: { select: { id: true, nome: true, codigo: true } },
          terceiro: { select: { id: true, razaoSocial: true } },
          causa: { select: { descricao: true } },
        },
      }),
      prisma.planoAcao.findMany({
        where: { ...porCliente, criadoEm: { gte: inicio, lt: fim } },
        orderBy: { criadoEm: 'asc' },
        select: {
          id: true,
          codigo: true,
          acao: true,
          criticidade: true,
          prazo: true,
          status: true,
          responsavelNome: true,
          area: { select: { nome: true } },
        },
      }),
      prisma.planoAcao.findMany({
        where: { ...porCliente, prazo: { gte: inicio, lt: fim }, status: { notIn: ['CONCLUIDO', 'CANCELADO'] } },
        orderBy: { prazo: 'asc' },
        select: {
          id: true,
          codigo: true,
          acao: true,
          criticidade: true,
          prazo: true,
          status: true,
          responsavelNome: true,
          area: { select: { nome: true } },
        },
      }),
    ]);

    return {
      data: inicio,
      cliente,
      resumo: {
        acidentes: acidentes.length,
        acidentesComAfastamento: acidentes.filter((a) => a.comAfastamento).length,
        desvios: observacoes.length,
        desviosComFoto: observacoes.filter((o) => o.fotoUrl).length,
        planosAbertos: planosAbertos.length,
        planosVencidos: planosVencidos.length,
      },
      acidentes: acidentes.map((acidente) => ({
        ...acidente,
        catPendente: catPendente(acidente),
        rotulos: {
          tipo: ROTULO_TIPO_ACIDENTE[acidente.tipo as TipoAcidente],
          investigacao: ROTULO_INVESTIGACAO[acidente.situacaoInvestigacao as SituacaoInvestigacao],
        },
      })),
      desvios: observacoes,
      planosAbertos,
      planosVencidos,
    };
  });

  app.get('/acidentes/resumo', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    const inicio = new Date();
    inicio.setMonth(inicio.getMonth() - 12);
    const base: Prisma.AcidenteWhereInput = { ...(clienteId ? { clienteId } : {}), data: { gte: inicio } };

    const [total, comAfastamento, dias, investigacoesAbertas, semCat, comLesaoPermanente] = await prisma.$transaction([
      prisma.acidente.count({ where: base }),
      prisma.acidente.count({ where: { ...base, comAfastamento: true } }),
      prisma.acidente.aggregate({ where: base, _sum: { diasAfastamento: true, diasDebitados: true } }),
      prisma.acidente.count({ where: { ...base, situacaoInvestigacao: { not: 'CONCLUIDA' } } }),
      prisma.acidente.findMany({ where: { ...base, catNumero: null }, select: { catNumero: true, data: true } }),
      prisma.acidente.count({ where: { ...base, diasDebitados: { gt: 0 } } }),
    ]);

    const diasPerdidos = dias._sum.diasAfastamento ?? 0;
    const diasDebitados = dias._sum.diasDebitados ?? 0;

    return {
      ultimos12Meses: total,
      comAfastamento,
      diasPerdidos,
      /** NBR 14280: morte 6000, perda de membro 3000, visao de um olho 1800. */
      diasDebitados,
      diasComputados: diasPerdidos + diasDebitados,
      comLesaoPermanente,
      investigacoesAbertas,
      catsPendentes: semCat.filter(catPendente).length,
    };
  });

  app.get('/acidentes/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const acidente = await prisma.acidente.findUnique({ where: { id }, include: COM_VINCULOS });
    if (!acidente) throw new NaoEncontrado('Acidente nao encontrado.', 'ACIDENTE_NAO_ENCONTRADO');
    return { ...rotular(acidente), catPendente: catPendente(acidente) };
  });

  app.post('/acidentes', async (request, reply) => {
    const dados = acidenteCreateSchema.parse(request.body);

    const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true } });
    if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');

    const acidente = await prisma.$transaction(async (tx) => {
      const criado = await tx.acidente.create({ data: normalizarJson(dados) as Prisma.AcidenteUncheckedCreateInput });
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: criado.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, criado as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });
      return criado;
    });

    return reply.status(201).send(rotular(acidente));
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
          ...(normalizarJson(dados) as Prisma.AcidenteUncheckedUpdateInput),
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
      return { ...rotular(acidente), catPendente: catPendente(acidente) };
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
