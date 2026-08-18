import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  FAIXAS_IIR,
  ROTULO_NIVEL_CONTROLE,
  ROTULO_SITUACAO_RISCO,
  ROTULO_TIPO_RISCO,
  avaliarRisco,
  classificarIir,
  problemasDoRisco,
  riscoCreateSchema,
  riscoFiltroSchema,
  riscoUpdateSchema,
  type NivelControle,
  type SituacaoRisco,
  type TipoRisco,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria } from '../../lib/auditoria.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';

const ENTIDADE = 'InventarioRisco';
const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });

const COM_VINCULOS = {
  cliente: { select: { id: true, nomeFantasia: true } },
  area: { select: { id: true, nome: true, codigo: true } },
  planoAcao: { select: { id: true, codigo: true, status: true } },
} satisfies Prisma.InventarioRiscoInclude;

/** Serializa com a faixa e os rotulos derivados do IIR persistido. */
function serializar(risco: {
  iir: number;
  tipo: string;
  situacao: string;
  nivelControleAtual: string | null;
}) {
  return {
    ...risco,
    faixa: classificarIir(risco.iir),
    rotulos: {
      tipo: ROTULO_TIPO_RISCO[risco.tipo as TipoRisco],
      situacao: ROTULO_SITUACAO_RISCO[risco.situacao as SituacaoRisco],
      nivelControle: risco.nivelControleAtual
        ? ROTULO_NIVEL_CONTROLE[risco.nivelControleAtual as NivelControle]
        : null,
    },
  };
}

/**
 * Etapa 19 — Inventario de Riscos (GRO/PGR) e Central de Risco.
 *
 * Cadastro tecnico da consultoria: `cadastros:ler` / `cadastros:escrever`.
 */
export async function registrarRotasRiscos(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'cadastros:ler', escrita: 'cadastros:escrever' }));

  app.get('/riscos', async (request) => {
    const filtro = riscoFiltroSchema.parse(request.query);

    const where: Prisma.InventarioRiscoWhereInput = {};
    if (filtro.clienteId) where.clienteId = filtro.clienteId;
    if (filtro.areaId) where.areaId = filtro.areaId;
    if (filtro.tipo) where.tipo = filtro.tipo;
    if (filtro.situacao) where.situacao = filtro.situacao;
    if (filtro.busca) {
      where.OR = [
        { perigo: { contains: filtro.busca, mode: 'insensitive' } },
        { fonteGeradora: { contains: filtro.busca, mode: 'insensitive' } },
        { atividade: { contains: filtro.busca, mode: 'insensitive' } },
        { funcao: { contains: filtro.busca, mode: 'insensitive' } },
      ];
    }

    // Faixa vira intervalo de IIR — o filtro sobrevive a paginacao.
    if (filtro.faixa) {
      const indice = FAIXAS_IIR.findIndex((faixa) => faixa.nivel === filtro.faixa);
      if (indice >= 0) {
        const acima = indice > 0 ? FAIXAS_IIR[indice - 1]!.ate! : 0;
        const ate = FAIXAS_IIR[indice]!.ate;
        where.iir = ate === null ? { gt: acima } : { gt: acima, lte: ate };
      }
    }

    // Risco maior primeiro: a lista e uma fila de trabalho, nao um catalogo.
    const itens = await prisma.inventarioRisco.findMany({
      where,
      orderBy: { iir: 'desc' },
      take: 300,
      include: COM_VINCULOS,
    });

    return itens.map(serializar);
  });

  /**
   * Central de Risco (secao 10 do plano diretor): riscos por criticidade,
   * ocorrencias criticas e acoes atrasadas numa leitura so.
   */
  app.get('/riscos/central', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    const agora = new Date();
    const base: Prisma.InventarioRiscoWhereInput = clienteId ? { clienteId } : {};

    const [riscos, ocorrenciasCriticas, planosAtrasados, reavaliacoesVencidas] = await Promise.all([
      prisma.inventarioRisco.findMany({ where: base, select: { iir: true, situacao: true } }),
      prisma.observacao.findMany({
        where: {
          grauRisco: 'I',
          situacao: { in: ['REGISTRADA', 'EM_TRATATIVA'] },
          ...(clienteId ? { clienteId } : {}),
        },
        orderBy: { dataHora: 'desc' },
        take: 20,
        select: {
          id: true,
          descricao: true,
          dataHora: true,
          prazoLimite: true,
          observador: true,
          area: { select: { nome: true } },
          cliente: { select: { nomeFantasia: true } },
        },
      }),
      prisma.planoAcao.count({
        where: { status: { in: ['ABERTO', 'EM_ANDAMENTO'] }, prazo: { lt: agora }, ...(clienteId ? { clienteId } : {}) },
      }),
      prisma.inventarioRisco.count({ where: { ...base, reavaliarEm: { lt: agora } } }),
    ]);

    // Contagem por faixa do IIR — a leitura de criticidade que o plano pede.
    const porFaixa = FAIXAS_IIR.map((faixa) => ({
      nivel: faixa.nivel,
      rotulo: faixa.rotulo,
      cor: faixa.cor,
      quantidade: riscos.filter((risco) => classificarIir(risco.iir).nivel === faixa.nivel).length,
    }));

    return {
      geradoEm: agora,
      totalRiscos: riscos.length,
      porFaixa,
      naoControlados: riscos.filter((risco) => risco.situacao === 'IDENTIFICADO' || risco.situacao === 'EM_TRATAMENTO')
        .length,
      reavaliacoesVencidas,
      planosAtrasados,
      ocorrenciasCriticas: ocorrenciasCriticas.map((ocorrencia) => ({
        ...ocorrencia,
        prazoVencido: ocorrencia.prazoLimite ? ocorrencia.prazoLimite < agora : false,
      })),
    };
  });

  app.get('/riscos/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const risco = await prisma.inventarioRisco.findUnique({ where: { id }, include: COM_VINCULOS });
    if (!risco) throw new NaoEncontrado('Risco nao encontrado.', 'RISCO_NAO_ENCONTRADO');
    return serializar(risco);
  });

  app.post('/riscos', async (request, reply) => {
    const dados = riscoCreateSchema.parse(request.body);

    const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true } });
    if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');

    // IIR e grau derivados no servidor — nunca aceitos do formulario.
    const { iir, grauRisco } = avaliarRisco(dados);

    const risco = await prisma.$transaction(async (tx) => {
      const criado = await tx.inventarioRisco.create({
        data: { ...dados, iir, grauRisco } as Prisma.InventarioRiscoUncheckedCreateInput,
      });
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: criado.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, criado as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });
      return criado;
    });

    return reply.status(201).send(serializar(risco));
  });

  app.put('/riscos/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = riscoUpdateSchema.parse(request.body);

    const atual = await prisma.inventarioRisco.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado('Risco nao encontrado.', 'RISCO_NAO_ENCONTRADO');

    // A regra cruzada vale sobre o estado FINAL, nao sobre o payload parcial.
    const problemas = problemasDoRisco({ ...atual, ...dados });
    if (Object.keys(problemas).length > 0) {
      throw new RequisicaoInvalida('Os dados enviados nao passaram na validacao.', 'VALIDACAO', {
        campos: problemas,
      });
    }

    // Recalcula o IIR sempre que qualquer fator muda.
    const { iir, grauRisco } = avaliarRisco({
      severidade: dados.severidade ?? atual.severidade,
      probabilidade: dados.probabilidade ?? atual.probabilidade,
      exposicao: dados.exposicao ?? atual.exposicao,
      frequencia: dados.frequencia ?? atual.frequencia,
    });

    return prisma.$transaction(async (tx) => {
      const risco = await tx.inventarioRisco.update({
        where: { id },
        data: { ...(dados as Prisma.InventarioRiscoUncheckedUpdateInput), iir, grauRisco },
        include: COM_VINCULOS,
      });

      const diferenca = calcularDiferenca(
        atual as unknown as Record<string, unknown>,
        risco as unknown as Record<string, unknown>,
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
      return serializar(risco);
    });
  });

  app.delete('/riscos/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await prisma.inventarioRisco.findUnique({ where: { id }, select: { perigo: true } });
    if (!atual) throw new NaoEncontrado('Risco nao encontrado.', 'RISCO_NAO_ENCONTRADO');

    await prisma.$transaction(async (tx) => {
      await tx.inventarioRisco.delete({ where: { id } });
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: { perigo: { de: atual.perigo, para: null } },
        contexto: contextoDeAuditoria(request),
      });
    });
    return reply.status(204).send();
  });
}
