import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  CHECKLIST_ERGONOMIA_PADRAO,
  NIVEIS_RISCO_ERGONOMICO,
  ROTULO_NIVEL_RISCO_ERGONOMICO,
  ROTULO_TIPO_AVALIACAO_ERGONOMICA,
  avaliacaoErgonomicaCreateSchema,
  avaliacaoErgonomicaFiltroSchema,
  avaliacaoErgonomicaUpdateSchema,
  nivelRiscoErgonomico,
  pontuacaoErgonomica,
  type ItemErgonomia,
  type NivelRiscoErgonomico,
  type TipoAvaliacaoErgonomica,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { uploadMaxBytes } from '../../env.js';
import { MIMES_DOCUMENTO_ACEITOS, removerArquivoPublico, salvarDocumento } from '../../lib/arquivos.js';
import { calcularDiferenca, registrarAuditoria } from '../../lib/auditoria.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { guardaPorMetodo } from '../../lib/guarda.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });

const INCLUIR_RELACOES = {
  cliente: { select: { id: true, nomeFantasia: true } },
  area: { select: { id: true, nome: true, codigo: true } },
} satisfies Prisma.AvaliacaoErgonomicaInclude;

type AvaliacaoComRelacoes = Prisma.AvaliacaoErgonomicaGetPayload<{ include: typeof INCLUIR_RELACOES }>;

/** Rotulos derivados para a tela nao repetir os mapas do shared em cada linha. */
function rotular<T extends { tipo: string; nivelRisco: string | null }>(avaliacao: T) {
  return {
    ...avaliacao,
    rotulos: {
      tipo: ROTULO_TIPO_AVALIACAO_ERGONOMICA[avaliacao.tipo as TipoAvaliacaoErgonomica] ?? avaliacao.tipo,
      nivelRisco: avaliacao.nivelRisco ? ROTULO_NIVEL_RISCO_ERGONOMICO[avaliacao.nivelRisco as NivelRiscoErgonomico] ?? avaliacao.nivelRisco : null,
    },
  };
}

async function obterOuFalhar(id: string): Promise<AvaliacaoComRelacoes> {
  const avaliacao = await prisma.avaliacaoErgonomica.findUnique({ where: { id }, include: INCLUIR_RELACOES });
  if (!avaliacao) throw new NaoEncontrado('Avaliacao ergonomica nao encontrada.', 'AVALIACAO_ERGONOMICA_NAO_ENCONTRADA');
  return avaliacao;
}

async function validarVinculos(clienteId: string | undefined, areaId: string | null | undefined): Promise<void> {
  if (clienteId) {
    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true } });
    if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');
  }
  if (areaId) {
    const area = await prisma.area.findUnique({ where: { id: areaId }, select: { id: true, clienteId: true } });
    if (!area) throw new NaoEncontrado('Area nao encontrada.', 'AREA_NAO_ENCONTRADA');
    if (clienteId && area.clienteId !== clienteId) {
      throw new RequisicaoInvalida('A area informada pertence a outro cliente.', 'AREA_DE_OUTRO_CLIENTE', {
        campos: { areaId: ['A area informada pertence a outro cliente.'] },
      });
    }
  }
}

async function receberDocumento(request: FastifyRequest): Promise<{ buffer: Buffer; mimetype: string }> {
  const arquivo = await request.file({ limits: { fileSize: uploadMaxBytes } });
  if (!arquivo) {
    throw new RequisicaoInvalida('Envie o arquivo no campo "arquivo" (multipart/form-data).', 'ARQUIVO_AUSENTE');
  }
  if (!MIMES_DOCUMENTO_ACEITOS.includes(arquivo.mimetype)) {
    throw new RequisicaoInvalida(`Formato ${arquivo.mimetype} nao suportado.`, 'FORMATO_NAO_SUPORTADO');
  }
  return { buffer: await arquivo.toBuffer(), mimetype: arquivo.mimetype };
}

/** Resumo auditavel: nunca grava o Json inteiro na trilha, so o tamanho. */
function paraAuditoria(avaliacao: Record<string, unknown>): Record<string, unknown> {
  const { itens, cliente, area, ...resto } = avaliacao;
  return { ...resto, itens: Array.isArray(itens) ? itens.length : itens, cliente: undefined, area: undefined };
}

/**
 * Etapa 24 — Ergonomia (NR-17).
 *
 * A pontuacao (% de itens conformes entre os aplicaveis) e o nivel de risco
 * sao calculados AQUI a partir dos itens, com as mesmas funcoes puras que a
 * tela usa ao vivo. O cliente nunca os envia: o schema nem os aceita.
 */
export async function registrarRotasErgonomia(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'cadastros:ler', escrita: 'cadastros:escrever' }));

  app.get('/ergonomia/checklist-padrao', async () => CHECKLIST_ERGONOMIA_PADRAO);

  app.get('/ergonomia/avaliacoes', async (request) => {
    const filtro = avaliacaoErgonomicaFiltroSchema.parse(request.query);

    const where: Prisma.AvaliacaoErgonomicaWhereInput = {
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      ...(filtro.areaId ? { areaId: filtro.areaId } : {}),
      ...(filtro.nivelRisco ? { nivelRisco: filtro.nivelRisco } : {}),
      ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
      ...(filtro.busca
        ? {
            OR: [
              { funcao: { contains: filtro.busca, mode: 'insensitive' } },
              { avaliador: { contains: filtro.busca, mode: 'insensitive' } },
              { area: { nome: { contains: filtro.busca, mode: 'insensitive' } } },
              { cliente: { nomeFantasia: { contains: filtro.busca, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const itens = await prisma.avaliacaoErgonomica.findMany({
      where,
      orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
      take: 200,
      include: INCLUIR_RELACOES,
    });
    return itens.map(rotular);
  });

  app.get('/ergonomia/resumo', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    const where: Prisma.AvaliacaoErgonomicaWhereInput = clienteId ? { clienteId } : {};

    const [total, porNivel, ultima, todas] = await Promise.all([
      prisma.avaliacaoErgonomica.count({ where }),
      prisma.avaliacaoErgonomica.groupBy({ by: ['nivelRisco'], where, _count: { _all: true } }),
      prisma.avaliacaoErgonomica.findFirst({ where, orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }], include: INCLUIR_RELACOES }),
      prisma.avaliacaoErgonomica.findMany({ where, select: { itens: true } }),
    ]);

    const contagemPorNivel: Record<NivelRiscoErgonomico, number> = { BAIXO: 0, MEDIO: 0, ALTO: 0 };
    let semPontuacao = 0;
    for (const grupo of porNivel) {
      const nivel = grupo.nivelRisco as NivelRiscoErgonomico | null;
      if (nivel && NIVEIS_RISCO_ERGONOMICO.includes(nivel)) contagemPorNivel[nivel] += grupo._count._all;
      else semPontuacao += grupo._count._all;
    }

    // Categorias com mais nao conformidades — onde a NR-17 mais aperta neste cliente.
    const naoConformesPorCategoria = new Map<string, number>();
    for (const avaliacao of todas) {
      const itens = Array.isArray(avaliacao.itens) ? (avaliacao.itens as unknown as ItemErgonomia[]) : [];
      for (const item of itens) {
        if (item && item.conforme === false && typeof item.categoria === 'string') {
          naoConformesPorCategoria.set(item.categoria, (naoConformesPorCategoria.get(item.categoria) ?? 0) + 1);
        }
      }
    }
    const categoriasCriticas = [...naoConformesPorCategoria.entries()]
      .map(([categoria, naoConformes]) => ({ categoria, naoConformes }))
      .sort((a, b) => b.naoConformes - a.naoConformes || a.categoria.localeCompare(b.categoria))
      .slice(0, 5);

    return {
      total,
      porNivel: contagemPorNivel,
      semPontuacao,
      ultima: ultima ? rotular(ultima) : null,
      categoriasCriticas,
    };
  });

  app.get('/ergonomia/avaliacoes/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return rotular(await obterOuFalhar(id));
  });

  app.post('/ergonomia/avaliacoes', async (request, reply) => {
    const dados = avaliacaoErgonomicaCreateSchema.parse(request.body);
    await validarVinculos(dados.clienteId, dados.areaId);

    const pontuacao = pontuacaoErgonomica(dados.itens);
    const nivelRisco = nivelRiscoErgonomico(pontuacao);

    const criada = await prisma.$transaction(async (tx) => {
      const avaliacao = await tx.avaliacaoErgonomica.create({
        data: {
          clienteId: dados.clienteId,
          areaId: dados.areaId ?? null,
          funcao: dados.funcao ?? null,
          data: dados.data,
          avaliador: dados.avaliador,
          tipo: dados.tipo,
          itens: dados.itens as unknown as Prisma.InputJsonValue,
          pontuacao,
          nivelRisco,
          conclusao: dados.conclusao ?? null,
          recomendacoes: dados.recomendacoes ?? null,
        },
        include: INCLUIR_RELACOES,
      });
      await registrarAuditoria(tx, {
        entidade: 'AvaliacaoErgonomica',
        entidadeId: avaliacao.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, paraAuditoria(avaliacao as unknown as Record<string, unknown>)),
        contexto: contextoDeAuditoria(request),
      });
      return avaliacao;
    });

    return reply.status(201).send(rotular(criada));
  });

  app.put('/ergonomia/avaliacoes/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = avaliacaoErgonomicaUpdateSchema.parse(request.body);
    const atual = await obterOuFalhar(id);

    const clienteId = dados.clienteId ?? atual.clienteId;
    const areaId = dados.areaId === undefined ? atual.areaId : dados.areaId;
    await validarVinculos(clienteId, areaId);

    const data: Prisma.AvaliacaoErgonomicaUncheckedUpdateInput = {};
    if (dados.clienteId !== undefined) data.clienteId = dados.clienteId;
    if (dados.areaId !== undefined) data.areaId = dados.areaId;
    if (dados.funcao !== undefined) data.funcao = dados.funcao;
    if (dados.data !== undefined) data.data = dados.data;
    if (dados.avaliador !== undefined) data.avaliador = dados.avaliador;
    if (dados.tipo !== undefined) data.tipo = dados.tipo;
    if (dados.conclusao !== undefined) data.conclusao = dados.conclusao;
    if (dados.recomendacoes !== undefined) data.recomendacoes = dados.recomendacoes;
    if (dados.itens !== undefined) {
      // Itens mudaram: pontuacao e nivel sao recalculados, nunca mantidos do que veio antes.
      const pontuacao = pontuacaoErgonomica(dados.itens);
      data.itens = dados.itens as unknown as Prisma.InputJsonValue;
      data.pontuacao = pontuacao;
      data.nivelRisco = nivelRiscoErgonomico(pontuacao);
    }

    const atualizada = await prisma.$transaction(async (tx) => {
      const avaliacao = await tx.avaliacaoErgonomica.update({ where: { id }, data, include: INCLUIR_RELACOES });
      const diferenca = calcularDiferenca(
        paraAuditoria(atual as unknown as Record<string, unknown>),
        paraAuditoria(avaliacao as unknown as Record<string, unknown>),
      );
      if (dados.itens !== undefined) {
        diferenca.itens = { de: 'respostas anteriores', para: `${dados.itens.length} item(ns) respondido(s)` };
      }
      if (Object.keys(diferenca).length > 0) {
        await registrarAuditoria(tx, {
          entidade: 'AvaliacaoErgonomica',
          entidadeId: id,
          acao: 'ATUALIZACAO',
          alteracoes: diferenca,
          contexto: contextoDeAuditoria(request),
        });
      }
      return avaliacao;
    });

    return rotular(atualizada);
  });

  app.delete('/ergonomia/avaliacoes/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await obterOuFalhar(id);

    await prisma.$transaction(async (tx) => {
      await tx.avaliacaoErgonomica.delete({ where: { id } });
      await registrarAuditoria(tx, {
        entidade: 'AvaliacaoErgonomica',
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: calcularDiferenca(paraAuditoria(atual as unknown as Record<string, unknown>), {}),
        contexto: contextoDeAuditoria(request),
      });
    });
    await removerArquivoPublico(atual.arquivoUrl);

    return reply.status(204).send();
  });

  /** Laudo, relatorio da AET ou foto do posto: documento ou imagem. */
  app.post('/ergonomia/avaliacoes/:id/arquivo', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await obterOuFalhar(id);
    const { buffer, mimetype } = await receberDocumento(request);
    const url = await salvarDocumento(buffer, mimetype, 'ergonomia');

    const atualizada = await prisma.$transaction(async (tx) => {
      const avaliacao = await tx.avaliacaoErgonomica.update({ where: { id }, data: { arquivoUrl: url }, include: INCLUIR_RELACOES });
      await registrarAuditoria(tx, {
        entidade: 'AvaliacaoErgonomica',
        entidadeId: id,
        acao: 'ATUALIZACAO',
        alteracoes: { arquivoUrl: { de: atual.arquivoUrl, para: url } },
        contexto: contextoDeAuditoria(request),
      });
      return avaliacao;
    });
    await removerArquivoPublico(atual.arquivoUrl);

    return rotular(atualizada);
  });
}
