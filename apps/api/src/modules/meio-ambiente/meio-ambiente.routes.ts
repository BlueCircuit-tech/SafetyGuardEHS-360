import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  ROTULO_CONDICAO_ASPECTO,
  ROTULO_OCORRENCIA_AMBIENTAL,
  aspectoAmbientalCreateSchema,
  aspectoAmbientalUpdateSchema,
  aspectoSignificativo,
  indicadorAmbientalSchema,
  notaAmbiental,
  ocorrenciaAmbientalCreateSchema,
  ocorrenciaAmbientalUpdateSchema,
  planoDeComunicacao,
  significanciaAmbiental,
  type CondicaoAspecto,
  type GrauRiscoOcorrencia,
  type TipoOcorrenciaAmbiental,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria } from '../../lib/auditoria.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';
import { despacharEmails, registrarNotificacoes } from '../planos/notificacao.service.js';
import { montarDashboardMeioAmbiente } from './meio-ambiente.service.js';

const ENTIDADE = 'OcorrenciaAmbiental';
const ENTIDADE_ASPECTO = 'AspectoAmbiental';
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

    let emailIds: string[] = [];
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
        const registro = await registrarNotificacoes(tx, {
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
        emailIds = registro.emailIds;
      }

      return criada;
    });

    // Fora da transacao: SMTP real leva segundos e o limite dela e 5 s.
    await despacharEmails(emailIds);

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

  /* ------------------------------------------------- aspectos e impactos --- */

  /** A area, quando informada, precisa pertencer ao cliente do aspecto. */
  async function validarAreaDoCliente(clienteId: string, areaId: string | null | undefined): Promise<void> {
    if (!areaId) return;
    const area = await prisma.area.findUnique({ where: { id: areaId }, select: { clienteId: true } });
    if (!area) throw new NaoEncontrado('Area nao encontrada.', 'AREA_NAO_ENCONTRADA');
    if (area.clienteId !== clienteId) {
      throw new RequisicaoInvalida('A area informada nao pertence ao cliente.', 'AREA_DE_OUTRO_CLIENTE', {
        campos: { areaId: ['A area informada nao pertence ao cliente.'] },
      });
    }
  }

  app.get('/meio-ambiente/aspectos', async (request) => {
    const filtro = z
      .object({
        clienteId: z.string().uuid().optional(),
        areaId: z.string().uuid().optional(),
        significativo: z.enum(['true', 'false']).optional(),
        busca: z.string().trim().max(120).optional(),
      })
      .parse(request.query);

    const where: Prisma.AspectoAmbientalWhereInput = {
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      ...(filtro.areaId ? { areaId: filtro.areaId } : {}),
      ...(filtro.significativo ? { significativo: filtro.significativo === 'true' } : {}),
    };
    if (filtro.busca) {
      where.OR = [
        { atividade: { contains: filtro.busca, mode: 'insensitive' } },
        { aspecto: { contains: filtro.busca, mode: 'insensitive' } },
        { impacto: { contains: filtro.busca, mode: 'insensitive' } },
      ];
    }

    const itens = await prisma.aspectoAmbiental.findMany({
      where,
      // Os mais significativos primeiro: e o que a gestao precisa olhar.
      orderBy: [{ significancia: 'desc' }, { atividade: 'asc' }],
      take: 500,
      include: {
        cliente: { select: { id: true, nomeFantasia: true } },
        area: { select: { id: true, nome: true, codigo: true } },
      },
    });

    return itens.map((aspecto) => ({
      ...aspecto,
      rotuloCondicao: ROTULO_CONDICAO_ASPECTO[aspecto.condicao as CondicaoAspecto] ?? aspecto.condicao,
    }));
  });

  app.post('/meio-ambiente/aspectos', async (request, reply) => {
    const dados = aspectoAmbientalCreateSchema.parse(request.body);

    const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true } });
    if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');
    await validarAreaDoCliente(dados.clienteId, dados.areaId);

    // Significancia e sempre do servidor — o schema ja descarta o que vier do cliente.
    const significancia = significanciaAmbiental(dados.severidade, dados.probabilidade);

    const aspecto = await prisma.$transaction(async (tx) => {
      const criado = await tx.aspectoAmbiental.create({
        data: {
          ...dados,
          significancia,
          significativo: aspectoSignificativo(significancia),
        } as Prisma.AspectoAmbientalUncheckedCreateInput,
      });
      await registrarAuditoria(tx, {
        entidade: ENTIDADE_ASPECTO,
        entidadeId: criado.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, criado as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });
      return criado;
    });

    return reply.status(201).send(aspecto);
  });

  app.put('/meio-ambiente/aspectos/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = aspectoAmbientalUpdateSchema.parse(request.body);

    const atual = await prisma.aspectoAmbiental.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado('Aspecto ambiental nao encontrado.', 'ASPECTO_NAO_ENCONTRADO');

    const clienteId = dados.clienteId ?? atual.clienteId;
    if (dados.clienteId && dados.clienteId !== atual.clienteId) {
      const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true } });
      if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');
    }
    // Trocar o cliente sem trocar a area deixaria a area orfã: revalida com o que ficar.
    await validarAreaDoCliente(clienteId, dados.areaId === undefined ? atual.areaId : dados.areaId);

    // Recalcula a partir do par final (o que veio + o que ja estava).
    const significancia = significanciaAmbiental(
      dados.severidade ?? atual.severidade,
      dados.probabilidade ?? atual.probabilidade,
    );

    return prisma.$transaction(async (tx) => {
      const aspecto = await tx.aspectoAmbiental.update({
        where: { id },
        data: {
          ...dados,
          significancia,
          significativo: aspectoSignificativo(significancia),
        } as Prisma.AspectoAmbientalUncheckedUpdateInput,
      });
      const diferenca = calcularDiferenca(
        atual as unknown as Record<string, unknown>,
        aspecto as unknown as Record<string, unknown>,
      );
      if (Object.keys(diferenca).length > 0) {
        await registrarAuditoria(tx, {
          entidade: ENTIDADE_ASPECTO,
          entidadeId: id,
          acao: 'ATUALIZACAO',
          alteracoes: diferenca,
          contexto: contextoDeAuditoria(request),
        });
      }
      return aspecto;
    });
  });

  app.delete('/meio-ambiente/aspectos/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await prisma.aspectoAmbiental.findUnique({
      where: { id },
      select: { atividade: true, aspecto: true },
    });
    if (!atual) throw new NaoEncontrado('Aspecto ambiental nao encontrado.', 'ASPECTO_NAO_ENCONTRADO');

    await prisma.$transaction(async (tx) => {
      await tx.aspectoAmbiental.delete({ where: { id } });
      await registrarAuditoria(tx, {
        entidade: ENTIDADE_ASPECTO,
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: {
          atividade: { de: atual.atividade, para: null },
          aspecto: { de: atual.aspecto, para: null },
        },
        contexto: contextoDeAuditoria(request),
      });
    });
    return reply.status(204).send();
  });

  /* --------------------------------------------------------- dashboard --- */

  app.get('/meio-ambiente/dashboard', async (request) => {
    const { clienteId, meses } = z
      .object({
        clienteId: z.string().uuid().optional(),
        meses: z.coerce.number().int().min(1).max(36).default(12),
      })
      .parse(request.query);

    return montarDashboardMeioAmbiente({ clienteId, meses });
  });
}
