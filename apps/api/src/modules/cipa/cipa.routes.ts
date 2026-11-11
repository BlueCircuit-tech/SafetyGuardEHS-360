import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  ROTULO_SITUACAO_CIPA,
  ROTULO_TIPO_DOCUMENTO_CIPA,
  cipaCreateSchema,
  cipaDocumentoCreateSchema,
  cipaFiltroSchema,
  cipaUpdateSchema,
  cronogramaPadraoCipa,
  diasParaFimDoMandato,
  type SituacaoCipa,
  type TipoDocumentoCipa,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { uploadMaxBytes } from '../../env.js';
import { MIMES_DOCUMENTO_ACEITOS, removerArquivoPublico, salvarDocumento } from '../../lib/arquivos.js';
import { calcularDiferenca, registrarAuditoria } from '../../lib/auditoria.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { guardaPorMetodo } from '../../lib/guarda.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });

const CLIENTE_RESUMIDO = { select: { id: true, nomeFantasia: true } } as const;

function rotular<T extends { situacao: string; dataFimMandato: Date }>(cipa: T, hoje: Date) {
  return {
    ...cipa,
    diasParaFimDoMandato: diasParaFimDoMandato(cipa.dataFimMandato, hoje),
    rotulos: { situacao: ROTULO_SITUACAO_CIPA[cipa.situacao as SituacaoCipa] },
  };
}

function rotularDocumento<T extends { tipo: string }>(documento: T) {
  return { ...documento, rotulos: { tipo: ROTULO_TIPO_DOCUMENTO_CIPA[documento.tipo as TipoDocumentoCipa] ?? documento.tipo } };
}

async function obterCipaOuFalhar(id: string) {
  const cipa = await prisma.cipa.findUnique({
    where: { id },
    include: {
      cliente: CLIENTE_RESUMIDO,
      documentos: { orderBy: [{ tipo: 'asc' }, { data: 'desc' }, { criadoEm: 'desc' }] },
    },
  });
  if (!cipa) throw new NaoEncontrado('CIPA nao encontrada.', 'CIPA_NAO_ENCONTRADA');
  return cipa;
}

/**
 * Etapa 24 — CIPA (NR-5).
 *
 * O mandato e a unidade: cronograma do processo eleitoral e membros vivem no
 * proprio registro (Json); os documentos do processo sao anexos. Os modelos
 * imprimiveis (edital, ficha, cedula, atas, certificado) sao gerados no front
 * a partir destes dados — a API guarda apenas o que foi anexado.
 */
export async function registrarRotasCipa(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'cadastros:ler', escrita: 'cadastros:escrever' }));

  /* -------------------------------------------------------------- resumo --- */

  app.get('/cipas/resumo', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    const hoje = new Date();
    hoje.setUTCHours(0, 0, 0, 0);
    const limite = new Date(hoje.getTime());
    limite.setUTCDate(limite.getUTCDate() + 60);

    const escopo = clienteId ? { clienteId } : {};

    const [emMandato, emProcessoEleitoral, vencendo60Dias, documentos, total] = await prisma.$transaction([
      prisma.cipa.count({ where: { ...escopo, situacao: 'EM_MANDATO' } }),
      prisma.cipa.count({ where: { ...escopo, situacao: 'PROCESSO_ELEITORAL' } }),
      prisma.cipa.count({
        where: { ...escopo, situacao: { in: ['EM_MANDATO', 'PROCESSO_ELEITORAL'] }, dataFimMandato: { gte: hoje, lte: limite } },
      }),
      prisma.cipaDocumento.count({ where: clienteId ? { cipa: { clienteId } } : {} }),
      prisma.cipa.count({ where: escopo }),
    ]);

    return { total, emMandato, emProcessoEleitoral, vencendo60Dias, documentos };
  });

  /* ------------------------------------------------------------- mandatos --- */

  app.get('/cipas', async (request) => {
    const filtro = cipaFiltroSchema.parse(request.query);
    const hoje = new Date();

    const itens = await prisma.cipa.findMany({
      where: {
        ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
        ...(filtro.situacao ? { situacao: filtro.situacao } : {}),
      },
      orderBy: [{ dataInicioMandato: 'desc' }, { criadoEm: 'desc' }],
      take: 200,
      include: { cliente: CLIENTE_RESUMIDO, _count: { select: { documentos: true } } },
    });

    return itens.map((cipa) => rotular(cipa, hoje));
  });

  app.get('/cipas/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const cipa = await obterCipaOuFalhar(id);
    return { ...rotular(cipa, new Date()), documentos: cipa.documentos.map(rotularDocumento) };
  });

  app.post('/cipas', async (request, reply) => {
    const dados = cipaCreateSchema.parse(request.body);

    const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true } });
    if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');

    // Sem cronograma informado, a CIPA nasce com o calendario tipico da NR-5
    // contado para tras a partir da posse.
    const cronograma = dados.cronograma && dados.cronograma.length > 0 ? dados.cronograma : cronogramaPadraoCipa(dados.dataInicioMandato);

    const cipa = await prisma.$transaction(async (tx) => {
      const criada = await tx.cipa.create({
        data: {
          clienteId: dados.clienteId,
          gestao: dados.gestao,
          dataInicioMandato: dados.dataInicioMandato,
          dataFimMandato: dados.dataFimMandato,
          situacao: dados.situacao,
          cronograma: cronograma as unknown as Prisma.InputJsonValue,
          membros: (dados.membros ?? []) as unknown as Prisma.InputJsonValue,
          observacoes: dados.observacoes ?? null,
        },
        include: { cliente: CLIENTE_RESUMIDO, _count: { select: { documentos: true } } },
      });
      await registrarAuditoria(tx, {
        entidade: 'Cipa',
        entidadeId: criada.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca(
          {},
          {
            clienteId: criada.clienteId,
            gestao: criada.gestao,
            dataInicioMandato: criada.dataInicioMandato,
            dataFimMandato: criada.dataFimMandato,
            situacao: criada.situacao,
            etapas: cronograma.length,
            membros: (dados.membros ?? []).length,
          },
        ),
        contexto: contextoDeAuditoria(request),
      });
      return criada;
    });

    return reply.status(201).send(rotular(cipa, new Date()));
  });

  app.put('/cipas/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = cipaUpdateSchema.parse(request.body);

    const atual = await prisma.cipa.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado('CIPA nao encontrada.', 'CIPA_NAO_ENCONTRADA');

    if (dados.clienteId && dados.clienteId !== atual.clienteId) {
      const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true } });
      if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');
    }

    // Coerencia do mandato quando so uma das datas muda.
    const inicio = dados.dataInicioMandato ?? atual.dataInicioMandato;
    const fim = dados.dataFimMandato ?? atual.dataFimMandato;
    if (fim.getTime() <= inicio.getTime()) {
      throw new RequisicaoInvalida('O fim do mandato deve ser posterior ao inicio.', 'MANDATO_INCOERENTE', {
        campos: { dataFimMandato: ['O fim do mandato deve ser posterior ao inicio.'] },
      });
    }

    const data: Prisma.CipaUncheckedUpdateInput = {};
    if (dados.clienteId !== undefined) data.clienteId = dados.clienteId;
    if (dados.gestao !== undefined) data.gestao = dados.gestao;
    if (dados.dataInicioMandato !== undefined) data.dataInicioMandato = dados.dataInicioMandato;
    if (dados.dataFimMandato !== undefined) data.dataFimMandato = dados.dataFimMandato;
    if (dados.situacao !== undefined) data.situacao = dados.situacao;
    if (dados.cronograma !== undefined) data.cronograma = dados.cronograma as unknown as Prisma.InputJsonValue;
    if (dados.membros !== undefined) data.membros = dados.membros as unknown as Prisma.InputJsonValue;
    if (dados.observacoes !== undefined) data.observacoes = dados.observacoes;

    const cipa = await prisma.$transaction(async (tx) => {
      const atualizada = await tx.cipa.update({
        where: { id },
        data,
        include: { cliente: CLIENTE_RESUMIDO, documentos: { orderBy: [{ tipo: 'asc' }, { data: 'desc' }, { criadoEm: 'desc' }] } },
      });

      const diferenca = calcularDiferenca(
        atual as unknown as Record<string, unknown>,
        Object.fromEntries(Object.keys(data).map((campo) => [campo, (atualizada as unknown as Record<string, unknown>)[campo]])),
      );
      if (Object.keys(diferenca).length > 0) {
        await registrarAuditoria(tx, {
          entidade: 'Cipa',
          entidadeId: id,
          acao: 'ATUALIZACAO',
          alteracoes: diferenca,
          contexto: contextoDeAuditoria(request),
        });
      }
      return atualizada;
    });

    return { ...rotular(cipa, new Date()), documentos: cipa.documentos.map(rotularDocumento) };
  });

  app.delete('/cipas/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await prisma.cipa.findUnique({ where: { id }, include: { documentos: { select: { url: true } } } });
    if (!atual) throw new NaoEncontrado('CIPA nao encontrada.', 'CIPA_NAO_ENCONTRADA');

    await prisma.$transaction(async (tx) => {
      // Os documentos caem em cascata no banco; os arquivos saem depois.
      await tx.cipa.delete({ where: { id } });
      await registrarAuditoria(tx, {
        entidade: 'Cipa',
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: {
          gestao: { de: atual.gestao, para: null },
          clienteId: { de: atual.clienteId, para: null },
          documentos: { de: atual.documentos.length, para: null },
        },
        contexto: contextoDeAuditoria(request),
      });
    });

    for (const documento of atual.documentos) await removerArquivoPublico(documento.url);

    return reply.status(204).send();
  });

  /* ----------------------------------------------------------- documentos --- */

  /**
   * Anexo: o arquivo vai no campo `arquivo` (multipart) e os metadados na
   * querystring (`tipo`, `titulo`, `data`, `observacoes`), porque o helper
   * `request.file()` entrega apenas o arquivo.
   */
  app.post('/cipas/:id/documentos', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const metadados = cipaDocumentoCreateSchema.parse(request.query);

    const cipa = await prisma.cipa.findUnique({ where: { id }, select: { id: true, clienteId: true } });
    if (!cipa) throw new NaoEncontrado('CIPA nao encontrada.', 'CIPA_NAO_ENCONTRADA');

    const arquivo = await request.file({ limits: { fileSize: uploadMaxBytes } });
    if (!arquivo) {
      throw new RequisicaoInvalida('Envie o arquivo no campo "arquivo" (multipart/form-data).', 'ARQUIVO_AUSENTE');
    }
    if (!MIMES_DOCUMENTO_ACEITOS.includes(arquivo.mimetype)) {
      throw new RequisicaoInvalida(`Formato ${arquivo.mimetype} nao suportado. Envie PDF, PNG, JPG ou WEBP.`, 'FORMATO_NAO_SUPORTADO');
    }

    const buffer = await arquivo.toBuffer();
    const url = await salvarDocumento(buffer, arquivo.mimetype, 'cipa');

    try {
      const documento = await prisma.$transaction(async (tx) => {
        const criado = await tx.cipaDocumento.create({
          data: {
            cipaId: id,
            tipo: metadados.tipo,
            titulo: metadados.titulo,
            url,
            data: metadados.data ?? null,
            observacoes: metadados.observacoes ?? null,
          },
        });
        await registrarAuditoria(tx, {
          entidade: 'CipaDocumento',
          entidadeId: criado.id,
          acao: 'CRIACAO',
          alteracoes: calcularDiferenca({}, { cipaId: id, tipo: criado.tipo, titulo: criado.titulo, url: criado.url }),
          contexto: contextoDeAuditoria(request),
        });
        return criado;
      });
      return reply.status(201).send({ ...rotularDocumento(documento), clienteId: cipa.clienteId });
    } catch (erro) {
      // Arquivo ja gravado e registro falhou: nao deixa orfao no disco.
      await removerArquivoPublico(url);
      throw erro;
    }
  });

  app.delete('/cipas/documentos/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const documento = await prisma.cipaDocumento.findUnique({ where: { id } });
    if (!documento) throw new NaoEncontrado('Documento nao encontrado.', 'DOCUMENTO_NAO_ENCONTRADO');

    await prisma.$transaction(async (tx) => {
      await tx.cipaDocumento.delete({ where: { id } });
      await registrarAuditoria(tx, {
        entidade: 'CipaDocumento',
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: { titulo: { de: documento.titulo, para: null }, tipo: { de: documento.tipo, para: null } },
        contexto: contextoDeAuditoria(request),
      });
    });

    await removerArquivoPublico(documento.url);
    return reply.status(204).send();
  });
}
