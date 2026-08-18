import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { arredondar, ddsCreateSchema, ddsFiltroSchema, ddsUpdateSchema } from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { registrarAuditoria, calcularDiferenca } from '../../lib/auditoria.js';
import { MIMES_DOCUMENTO_ACEITOS, removerArquivoPublico, salvarDocumento } from '../../lib/arquivos.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';
import { uploadMaxBytes } from '../../env.js';

const ENTIDADE = 'RegistroDds';
const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });

async function receberLista(request: FastifyRequest): Promise<string> {
  const arquivo = await request.file({ limits: { fileSize: uploadMaxBytes } });
  if (!arquivo) {
    throw new RequisicaoInvalida('Envie o arquivo no campo "arquivo" (multipart/form-data).', 'ARQUIVO_AUSENTE');
  }
  if (!MIMES_DOCUMENTO_ACEITOS.includes(arquivo.mimetype)) {
    throw new RequisicaoInvalida(
      `Formato ${arquivo.mimetype} nao suportado. Envie PDF, PNG, JPG ou WEBP.`,
      'FORMATO_NAO_SUPORTADO',
    );
  }
  return salvarDocumento(await arquivo.toBuffer(), arquivo.mimetype, 'dds-presenca');
}

/**
 * Etapa 13 — DDS Digital.
 *
 * Rotina de campo: quem registra observacao tambem registra DDS, entao o par
 * de permissoes e o mesmo (`observacoes:*`).
 */
export async function registrarRotasDds(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'observacoes:ler', escrita: 'observacoes:escrever' }));

  /** Banco de temas, agrupado por categoria. */
  app.get('/dds/temas', async () => {
    return prisma.temaDds.findMany({ where: { ativo: true }, orderBy: { numero: 'asc' } });
  });

  app.get('/dds', async (request) => {
    const filtro = ddsFiltroSchema.parse(request.query);

    const where: Prisma.RegistroDdsWhereInput = {};
    if (filtro.clienteId) where.clienteId = filtro.clienteId;
    if (filtro.areaId) where.areaId = filtro.areaId;
    if (filtro.de || filtro.ate) {
      where.data = { ...(filtro.de ? { gte: filtro.de } : {}), ...(filtro.ate ? { lte: filtro.ate } : {}) };
    }
    if (filtro.busca) {
      where.OR = [
        { lider: { contains: filtro.busca, mode: 'insensitive' } },
        { temaLivre: { contains: filtro.busca, mode: 'insensitive' } },
        { tema: { titulo: { contains: filtro.busca, mode: 'insensitive' } } },
      ];
    }

    const [total, itens] = await prisma.$transaction([
      prisma.registroDds.count({ where }),
      prisma.registroDds.findMany({
        where,
        orderBy: { data: 'desc' },
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
        include: {
          tema: { select: { numero: true, titulo: true, categoria: true } },
          cliente: { select: { id: true, nomeFantasia: true } },
          area: { select: { id: true, nome: true, codigo: true } },
        },
      }),
    ]);

    return {
      itens,
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
      totalPaginas: Math.max(1, Math.ceil(total / filtro.porPagina)),
    };
  });

  /** Indicador de realizacao: constancia e participacao nos ultimos 30 dias. */
  app.get('/dds/resumo', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    const inicio30 = new Date();
    inicio30.setDate(inicio30.getDate() - 30);

    const base: Prisma.RegistroDdsWhereInput = clienteId ? { clienteId } : {};

    const [total, ultimos30, participacao, ultimo] = await prisma.$transaction([
      prisma.registroDds.count({ where: base }),
      prisma.registroDds.count({ where: { ...base, data: { gte: inicio30 } } }),
      prisma.registroDds.aggregate({ where: { ...base, data: { gte: inicio30 } }, _avg: { participantes: true } }),
      prisma.registroDds.findFirst({ where: base, orderBy: { data: 'desc' }, select: { data: true } }),
    ]);

    return {
      total,
      ultimos30Dias: ultimos30,
      participacaoMedia: participacao._avg.participantes ? arredondar(participacao._avg.participantes, 1) : null,
      ultimoRegistro: ultimo?.data ?? null,
    };
  });

  app.post('/dds', async (request, reply) => {
    const dados = ddsCreateSchema.parse(request.body);

    const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true } });
    if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');

    const registro = await prisma.$transaction(async (tx) => {
      const criado = await tx.registroDds.create({ data: dados as Prisma.RegistroDdsUncheckedCreateInput });
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

  app.put('/dds/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = ddsUpdateSchema.parse(request.body);

    const atual = await prisma.registroDds.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado('Registro nao encontrado.', 'DDS_NAO_ENCONTRADO');

    return prisma.$transaction(async (tx) => {
      const registro = await tx.registroDds.update({ where: { id }, data: dados as Prisma.RegistroDdsUncheckedUpdateInput });
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

  app.delete('/dds/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await prisma.registroDds.findUnique({ where: { id }, select: { lider: true, data: true } });
    if (!atual) throw new NaoEncontrado('Registro nao encontrado.', 'DDS_NAO_ENCONTRADO');

    await prisma.$transaction(async (tx) => {
      await tx.registroDds.delete({ where: { id } });
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: { lider: { de: atual.lider, para: null } },
        contexto: contextoDeAuditoria(request),
      });
    });
    return reply.status(204).send();
  });

  app.post('/dds/:id/lista-presenca', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await prisma.registroDds.findUnique({ where: { id }, select: { listaPresencaUrl: true } });
    if (!atual) throw new NaoEncontrado('Registro nao encontrado.', 'DDS_NAO_ENCONTRADO');

    const url = await receberLista(request);
    const registro = await prisma.registroDds.update({ where: { id }, data: { listaPresencaUrl: url } });
    await removerArquivoPublico(atual.listaPresencaUrl);
    return registro;
  });
}
