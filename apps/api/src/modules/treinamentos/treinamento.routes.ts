import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ROTULO_SITUACAO_CAPACITACAO,
  matrizFiltroSchema,
  realizacaoCreateSchema,
  requisitoCreateSchema,
  treinamentoCreateSchema,
  treinamentoUpdateSchema,
} from '@safetyguard/shared';
import {
  atualizarTreinamento,
  criarRequisito,
  criarTreinamento,
  definirCertificado,
  excluirRealizacao,
  excluirRequisito,
  excluirTreinamento,
  listarRequisitos,
  listarTreinamentos,
  matrizDeCapacitacao,
  obterTreinamentoOuFalhar,
  realizacoesDoColaborador,
  registrarRealizacao,
} from './treinamento.service.js';
import { MIMES_DOCUMENTO_ACEITOS, removerArquivoPublico, salvarDocumento } from '../../lib/arquivos.js';
import { RequisicaoInvalida } from '../../lib/erros.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';
import { uploadMaxBytes } from '../../env.js';
import { prisma } from '../../db.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });

async function receberCertificado(request: FastifyRequest): Promise<string> {
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
  return salvarDocumento(await arquivo.toBuffer(), arquivo.mimetype, 'certificado');
}

/**
 * Etapa 11 — Treinamentos e Matriz de Capacitacao.
 *
 * Mesmo par de permissoes da saude ocupacional: capacitacao e aptidao andam
 * juntas na cobranca legal.
 */
export async function registrarRotasTreinamentos(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'saude:ler', escrita: 'saude:escrever' }));

  /* ------------------------------------------------------------ catalogo --- */

  app.get('/treinamentos', async (request) => {
    const { incluirInativos } = z.object({ incluirInativos: z.coerce.boolean().optional() }).parse(request.query);
    return listarTreinamentos(incluirInativos ?? false);
  });

  app.get('/treinamentos/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return obterTreinamentoOuFalhar(id);
  });

  app.post('/treinamentos', async (request, reply) => {
    const dados = treinamentoCreateSchema.parse(request.body);
    return reply.status(201).send(await criarTreinamento(dados, contextoDeAuditoria(request)));
  });

  app.put('/treinamentos/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = treinamentoUpdateSchema.parse(request.body);
    return atualizarTreinamento(id, dados, contextoDeAuditoria(request));
  });

  app.delete('/treinamentos/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await excluirTreinamento(id, contextoDeAuditoria(request));
    return reply.status(204).send();
  });

  /* ------------------------------------------------------------- matriz --- */

  app.get('/capacitacao/requisitos', async () => listarRequisitos());

  app.post('/capacitacao/requisitos', async (request, reply) => {
    const dados = requisitoCreateSchema.parse(request.body);
    return reply.status(201).send(await criarRequisito(dados, contextoDeAuditoria(request)));
  });

  app.delete('/capacitacao/requisitos/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await excluirRequisito(id, contextoDeAuditoria(request));
    return reply.status(204).send();
  });

  /** Funcoes em uso no cadastro de colaboradores — atalho do formulario. */
  app.get('/capacitacao/funcoes', async () => {
    const funcoes = await prisma.colaborador.groupBy({
      by: ['funcao'],
      where: { situacao: { not: 'DESLIGADO' } },
      orderBy: { funcao: 'asc' },
    });
    return funcoes.map((linha) => linha.funcao);
  });

  /** A matriz cruzada: colaborador x requisito x situacao. */
  app.get('/capacitacao/matriz', async (request) => {
    const filtro = matrizFiltroSchema.parse(request.query);
    const { linhas, resumo } = await matrizDeCapacitacao(filtro);

    return {
      resumo,
      linhas: linhas.map((linha) => ({
        ...linha,
        rotuloSituacao: ROTULO_SITUACAO_CAPACITACAO[linha.situacao],
      })),
    };
  });

  /* --------------------------------------------------------- realizacoes --- */

  app.get('/colaboradores/:id/treinamentos', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return realizacoesDoColaborador(id);
  });

  app.post('/treinamentos-realizados', async (request, reply) => {
    const dados = realizacaoCreateSchema.parse(request.body);
    return reply.status(201).send(await registrarRealizacao(dados, contextoDeAuditoria(request)));
  });

  app.delete('/treinamentos-realizados/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await excluirRealizacao(id, contextoDeAuditoria(request));
    return reply.status(204).send();
  });

  app.post('/treinamentos-realizados/:id/certificado', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await prisma.treinamentoRealizado.findUnique({ where: { id }, select: { certificadoUrl: true } });
    const url = await receberCertificado(request);
    const realizacao = await definirCertificado(id, url, contextoDeAuditoria(request));
    await removerArquivoPublico(atual?.certificadoUrl);
    return realizacao;
  });
}
