import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  ROTULO_OCORRENCIA_AMBIENTAL,
  indicadorAmbientalSchema,
  notaAmbiental,
  ocorrenciaAmbientalCreateSchema,
  ocorrenciaAmbientalUpdateSchema,
  planoDeComunicacao,
  type GrauRiscoOcorrencia,
  type TipoOcorrenciaAmbiental,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { NaoEncontrado } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria } from '../../lib/auditoria.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';
import { registrarNotificacoes } from '../planos/notificacao.service.js';

const ENTIDADE = 'OcorrenciaAmbiental';
const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });

/**
 * Nota do pilar MEIO_AMBIENTE (0-100) — meta do plano diretor: zero
 * ocorrencia. Convencao de desconto documentada no pacote compartilhado.
 * Sem NENHUM registro (nem leitura ESG), devolve `null` e o motor renormaliza:
 * ausencia de dado nao e nota 100.
 */
export async function notaDeMeioAmbiente(filtro: { clienteId?: string } = {}): Promise<number | null> {
  const inicio = new Date();
  inicio.setMonth(inicio.getMonth() - 12);

  const base = filtro.clienteId ? { clienteId: filtro.clienteId } : {};

  const [ocorrencias, leituras] = await Promise.all([
    prisma.ocorrenciaAmbiental.findMany({
      where: { ...base, data: { gte: inicio } },
      select: { contida: true },
    }),
    prisma.indicadorAmbiental.count({ where: base }),
  ]);

  // O modulo so pontua depois de comecar a ser usado.
  if (ocorrencias.length === 0 && leituras === 0) return null;
  return notaAmbiental(ocorrencias);
}

export async function registrarRotasMeioAmbiente(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'observacoes:ler', escrita: 'observacoes:escrever' }));

  /* --------------------------------------------------------- ocorrencias --- */

  app.get('/meio-ambiente/ocorrencias', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);

    const itens = await prisma.ocorrenciaAmbiental.findMany({
      where: clienteId ? { clienteId } : {},
      orderBy: { data: 'desc' },
      take: 200,
      include: {
        cliente: { select: { id: true, nomeFantasia: true } },
        area: { select: { id: true, nome: true, codigo: true } },
      },
    });

    return itens.map((ocorrencia) => ({
      ...ocorrencia,
      rotuloTipo: ROTULO_OCORRENCIA_AMBIENTAL[ocorrencia.tipo as TipoOcorrenciaAmbiental],
    }));
  });

  app.get('/meio-ambiente/resumo', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    const inicio = new Date();
    inicio.setMonth(inicio.getMonth() - 12);
    const base: Prisma.OcorrenciaAmbientalWhereInput = {
      ...(clienteId ? { clienteId } : {}),
      data: { gte: inicio },
    };

    const [total, naoContidas, grauI] = await prisma.$transaction([
      prisma.ocorrenciaAmbiental.count({ where: base }),
      prisma.ocorrenciaAmbiental.count({ where: { ...base, contida: false } }),
      prisma.ocorrenciaAmbiental.count({ where: { ...base, grauRisco: 'I' } }),
    ]);

    return {
      ultimos12Meses: total,
      naoContidas,
      grauI,
      nota: await notaDeMeioAmbiente({ clienteId }),
    };
  });

  app.post('/meio-ambiente/ocorrencias', async (request, reply) => {
    const dados = ocorrenciaAmbientalCreateSchema.parse(request.body);

    const cliente = await prisma.cliente.findUnique({
      where: { id: dados.clienteId },
      select: { id: true, nomeFantasia: true },
    });
    if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');

    const area = dados.areaId
      ? await prisma.area.findUnique({ where: { id: dados.areaId }, select: { nome: true, pontoReferencia: true } })
      : null;

    const ocorrencia = await prisma.$transaction(async (tx) => {
      const criada = await tx.ocorrenciaAmbiental.create({
        data: dados as Prisma.OcorrenciaAmbientalUncheckedCreateInput,
      });

      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: criada.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, criada as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });

      /*
       * A matriz de comunicacao tem linha propria para ocorrencia ambiental:
       * grau I aciona Meio Ambiente no registro e escala ate a Diretoria.
       * Graus II/III ficam no registro — a matriz nao preve disparo para eles.
       */
      if (dados.grauRisco === 'I') {
        const regra = planoDeComunicacao('OCORRENCIA_AMBIENTAL', dados.grauRisco as GrauRiscoOcorrencia);
        await registrarNotificacoes(tx, {
          clienteId: dados.clienteId,
          cliente: cliente.nomeFantasia,
          area: area?.nome ?? '—',
          local: area?.pontoReferencia,
          classificacao: 'Ocorrencia Ambiental',
          grauRisco: dados.grauRisco,
          tipo: ROTULO_OCORRENCIA_AMBIENTAL[dados.tipo],
          descricao: dados.descricao,
          responsavel: dados.responsavel,
          dataHora: dados.data,
          regra,
        });
      }

      return criada;
    });

    return reply.status(201).send(ocorrencia);
  });

  app.put('/meio-ambiente/ocorrencias/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = ocorrenciaAmbientalUpdateSchema.parse(request.body);

    const atual = await prisma.ocorrenciaAmbiental.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado('Ocorrencia nao encontrada.', 'OCORRENCIA_NAO_ENCONTRADA');

    return prisma.$transaction(async (tx) => {
      const ocorrencia = await tx.ocorrenciaAmbiental.update({
        where: { id },
        data: dados as Prisma.OcorrenciaAmbientalUncheckedUpdateInput,
      });
      const diferenca = calcularDiferenca(
        atual as unknown as Record<string, unknown>,
        ocorrencia as unknown as Record<string, unknown>,
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
      return ocorrencia;
    });
  });

  app.delete('/meio-ambiente/ocorrencias/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await prisma.ocorrenciaAmbiental.findUnique({ where: { id }, select: { tipo: true } });
    if (!atual) throw new NaoEncontrado('Ocorrencia nao encontrada.', 'OCORRENCIA_NAO_ENCONTRADA');

    await prisma.$transaction(async (tx) => {
      await tx.ocorrenciaAmbiental.delete({ where: { id } });
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: { tipo: { de: atual.tipo, para: null } },
        contexto: contextoDeAuditoria(request),
      });
    });
    return reply.status(204).send();
  });

  /* ---------------------------------------------------- indicadores ESG --- */

  app.get('/meio-ambiente/indicadores', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);

    return prisma.indicadorAmbiental.findMany({
      where: clienteId ? { clienteId } : {},
      orderBy: { competencia: 'desc' },
      take: 36,
      include: { cliente: { select: { id: true, nomeFantasia: true } } },
    });
  });

  /** Upsert por competencia: reenviar o mes corrige a leitura, nao duplica. */
  app.post('/meio-ambiente/indicadores', async (request, reply) => {
    const dados = indicadorAmbientalSchema.parse(request.body);
    // Normaliza para o dia 1 do mes.
    const competencia = new Date(dados.competencia.getFullYear(), dados.competencia.getMonth(), 1);

    const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true } });
    if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');

    const leitura = await prisma.indicadorAmbiental.upsert({
      where: { clienteId_competencia: { clienteId: dados.clienteId, competencia } },
      create: { ...dados, competencia } as Prisma.IndicadorAmbientalUncheckedCreateInput,
      update: {
        aguaM3: dados.aguaM3,
        energiaKwh: dados.energiaKwh,
        residuosKg: dados.residuosKg,
        residuosRecicladosKg: dados.residuosRecicladosKg,
        emissoesTco2: dados.emissoesTco2,
      },
    });

    return reply.status(201).send(leitura);
  });
}
