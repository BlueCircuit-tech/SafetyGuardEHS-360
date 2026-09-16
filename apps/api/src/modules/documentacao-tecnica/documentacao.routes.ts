import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ROTULO_SITUACAO_APR,
  ROTULO_SITUACAO_OS,
  aprAprovarSchema,
  aprCreateSchema,
  aprFiltroSchema,
  aprUpdateSchema,
  execucaoChecklistCreateSchema,
  execucaoChecklistFiltroSchema,
  modeloChecklistCreateSchema,
  modeloChecklistUpdateSchema,
  osFiltroSchema,
  osGerarSchema,
  type SituacaoApr,
  type SituacaoOs,
} from '@safetyguard/shared';
import { MIMES_DOCUMENTO_ACEITOS, MIMES_IMAGEM_ACEITOS, removerArquivoPublico, salvarDocumento, salvarImagem } from '../../lib/arquivos.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { RequisicaoInvalida } from '../../lib/erros.js';
import { guardaPorMetodo } from '../../lib/guarda.js';
import { uploadMaxBytes } from '../../env.js';
import {
  aprovarApr,
  atualizarApr,
  atualizarModeloChecklist,
  criarApr,
  criarModeloChecklist,
  definirArquivoApr,
  definirFotoExecucao,
  encerrarApr,
  gerarOrdemServico,
  listarAprs,
  listarExecucoesChecklist,
  listarModelosChecklist,
  listarOrdensServico,
  novaVersaoApr,
  obterAprOuFalhar,
  obterExecucaoOuFalhar,
  obterOrdemServicoOuFalhar,
  registrarCienciaOs,
  registrarExecucaoChecklist,
  resumoDocumentacaoTecnica,
} from './documentacao.service.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });

async function receberArquivo(request: FastifyRequest, aceitos: readonly string[]): Promise<{ buffer: Buffer; mimetype: string }> {
  const arquivo = await request.file({ limits: { fileSize: uploadMaxBytes } });
  if (!arquivo) {
    throw new RequisicaoInvalida('Envie o arquivo no campo "arquivo" (multipart/form-data).', 'ARQUIVO_AUSENTE');
  }
  if (!aceitos.includes(arquivo.mimetype)) {
    throw new RequisicaoInvalida(`Formato ${arquivo.mimetype} nao suportado.`, 'FORMATO_NAO_SUPORTADO');
  }
  return { buffer: await arquivo.toBuffer(), mimetype: arquivo.mimetype };
}

function rotularOs<T extends { situacao: string }>(os: T) {
  return { ...os, rotulos: { situacao: ROTULO_SITUACAO_OS[os.situacao as SituacaoOs] } };
}

function rotularApr<T extends { situacao: string }>(apr: T) {
  return { ...apr, rotulos: { situacao: ROTULO_SITUACAO_APR[apr.situacao as SituacaoApr] } };
}

/**
 * Etapa 23 — Documentacao Tecnica.
 *
 * A OS diz respeito ao colaborador (permissoes `saude:*`, como o ASO). APR e
 * checklist sao rotina de campo, ao lado da observacao (`observacoes:*`).
 */
export async function registrarRotasDocumentacaoTecnica(app: FastifyInstance): Promise<void> {
  /* ------------------------------------------------------------- OS -- */

  await app.register(async (os) => {
    os.addHook('preHandler', guardaPorMetodo(os, { leitura: 'saude:ler', escrita: 'saude:escrever' }));

    os.get('/ordens-servico', async (request) => {
      const filtro = osFiltroSchema.parse(request.query);
      const pagina = await listarOrdensServico(filtro);
      return { ...pagina, itens: pagina.itens.map(rotularOs) };
    });

    os.get('/ordens-servico/:id', async (request) => {
      const { id } = paramsSchema.parse(request.params);
      return rotularOs(await obterOrdemServicoOuFalhar(id));
    });

    /** Gera (ou regera, como nova versao) a OS do colaborador. */
    os.post('/ordens-servico/gerar', async (request, reply) => {
      const dados = osGerarSchema.parse(request.body);
      const geradaPor = request.usuario?.nome ?? 'Sistema';
      const criada = await gerarOrdemServico(dados, geradaPor, contextoDeAuditoria(request));
      return reply.status(201).send(rotularOs(criada));
    });

    /** Ciencia do trabalhador: imagem da assinatura, que recebe carimbo. */
    os.post('/ordens-servico/:id/ciencia', async (request) => {
      const { id } = paramsSchema.parse(request.params);
      const atual = await obterOrdemServicoOuFalhar(id);
      const { buffer, mimetype } = await receberArquivo(request, MIMES_IMAGEM_ACEITOS);
      const url = await salvarImagem(buffer, mimetype, 'os-ciencia');
      const atualizada = await registrarCienciaOs(id, url, buffer, contextoDeAuditoria(request));
      await removerArquivoPublico(atual.cienciaAssinaturaUrl);
      return rotularOs(atualizada);
    });
  });

  /* ---------------------------------------------------- APR e checklists -- */

  await app.register(async (campo) => {
    campo.addHook('preHandler', guardaPorMetodo(campo, { leitura: 'observacoes:ler', escrita: 'observacoes:escrever' }));

    campo.get('/documentacao-tecnica/resumo', async (request) => {
      const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
      return resumoDocumentacaoTecnica(clienteId);
    });

    /* APR */

    campo.get('/aprs', async (request) => {
      const filtro = aprFiltroSchema.parse(request.query);
      const pagina = await listarAprs(filtro);
      return { ...pagina, itens: pagina.itens.map(rotularApr) };
    });

    campo.get('/aprs/:id', async (request) => {
      const { id } = paramsSchema.parse(request.params);
      return rotularApr(await obterAprOuFalhar(id));
    });

    campo.post('/aprs', async (request, reply) => {
      const dados = aprCreateSchema.parse(request.body);
      const apr = await criarApr(dados, contextoDeAuditoria(request));
      return reply.status(201).send(rotularApr(apr));
    });

    campo.put('/aprs/:id', async (request) => {
      const { id } = paramsSchema.parse(request.params);
      const dados = aprUpdateSchema.parse(request.body);
      return rotularApr(await atualizarApr(id, dados, contextoDeAuditoria(request)));
    });

    campo.post('/aprs/:id/aprovar', async (request) => {
      const { id } = paramsSchema.parse(request.params);
      const { aprovadaPor } = aprAprovarSchema.parse(request.body);
      return rotularApr(await aprovarApr(id, aprovadaPor, contextoDeAuditoria(request)));
    });

    campo.post('/aprs/:id/nova-versao', async (request, reply) => {
      const { id } = paramsSchema.parse(request.params);
      const nova = await novaVersaoApr(id, contextoDeAuditoria(request));
      return reply.status(201).send(rotularApr(nova));
    });

    campo.post('/aprs/:id/encerrar', async (request) => {
      const { id } = paramsSchema.parse(request.params);
      return rotularApr(await encerrarApr(id, contextoDeAuditoria(request)));
    });

    campo.post('/aprs/:id/arquivo', async (request) => {
      const { id } = paramsSchema.parse(request.params);
      const atual = await obterAprOuFalhar(id);
      const { buffer, mimetype } = await receberArquivo(request, MIMES_DOCUMENTO_ACEITOS);
      const url = await salvarDocumento(buffer, mimetype, 'apr');
      const atualizada = await definirArquivoApr(id, url);
      await removerArquivoPublico(atual.arquivoUrl);
      return rotularApr(atualizada);
    });

    /* Modelos de checklist */

    campo.get('/checklists/modelos', async (request) => {
      const { clienteId, inativos } = z
        .object({ clienteId: z.string().uuid().optional(), inativos: z.coerce.boolean().default(false) })
        .parse(request.query);
      return listarModelosChecklist(clienteId, inativos);
    });

    campo.post('/checklists/modelos', async (request, reply) => {
      const dados = modeloChecklistCreateSchema.parse(request.body);
      const modelo = await criarModeloChecklist(dados, contextoDeAuditoria(request));
      return reply.status(201).send(modelo);
    });

    campo.put('/checklists/modelos/:id', async (request) => {
      const { id } = paramsSchema.parse(request.params);
      const dados = modeloChecklistUpdateSchema.parse(request.body);
      return atualizarModeloChecklist(id, dados, contextoDeAuditoria(request));
    });

    /* Execucoes */

    campo.get('/checklists/execucoes', async (request) => {
      const filtro = execucaoChecklistFiltroSchema.parse(request.query);
      return listarExecucoesChecklist(filtro);
    });

    campo.get('/checklists/execucoes/:id', async (request) => {
      const { id } = paramsSchema.parse(request.params);
      return obterExecucaoOuFalhar(id);
    });

    campo.post('/checklists/execucoes', async (request, reply) => {
      const dados = execucaoChecklistCreateSchema.parse(request.body);
      const execucao = await registrarExecucaoChecklist(dados, contextoDeAuditoria(request));
      return reply.status(201).send(execucao);
    });

    campo.post('/checklists/execucoes/:id/foto', async (request) => {
      const { id } = paramsSchema.parse(request.params);
      const atual = await obterExecucaoOuFalhar(id);
      const { buffer, mimetype } = await receberArquivo(request, MIMES_IMAGEM_ACEITOS);
      const url = await salvarImagem(buffer, mimetype, 'checklist');
      const atualizada = await definirFotoExecucao(id, url);
      await removerArquivoPublico(atual.fotoUrl);
      return atualizada;
    });
  });
}
