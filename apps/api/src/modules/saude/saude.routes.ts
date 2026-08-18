import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CATALOGO_DOCUMENTOS,
  ROTULO_ABRANGENCIA_DOCUMENTO,
  ROTULO_GRAU_RISCO_FUNCAO,
  ROTULO_RESULTADO_ASO,
  ROTULO_SITUACAO_COLABORADOR,
  ROTULO_SITUACAO_DOCUMENTO,
  ROTULO_SITUACAO_VENCIMENTO,
  ROTULO_TIPO_ASO,
  ROTULO_URGENCIA_RENOVACAO,
  ROTULO_VINCULO_COLABORADOR,
  asoCreateSchema,
  asoFiltroSchema,
  asoUpdateSchema,
  colaboradorCreateSchema,
  colaboradorFiltroSchema,
  colaboradorUpdateSchema,
  documentoCreateSchema,
  documentoFiltroSchema,
  documentoUpdateSchema,
  formatarCpf,
} from '@safetyguard/shared';
import {
  atualizarColaborador,
  criarColaborador,
  excluirColaborador,
  listarAuditoriaColaborador,
  listarColaboradores,
  listarOpcoesColaboradores,
  obterColaboradorOuFalhar,
} from './colaborador.service.js';
import {
  atualizarAso,
  criarAso,
  definirArquivoDoAso,
  excluirAso,
  listarAsos,
  obterAsoOuFalhar,
} from './aso.service.js';
import {
  atualizarDocumento,
  criarDocumento,
  definirArquivoDoDocumento,
  excluirDocumento,
  listarAuditoriaDocumento,
  listarDocumentos,
  obterDocumentoOuFalhar,
  revisarDocumento,
} from './documento.service.js';
import { filaDeRenovacao, painelConformidade } from './conformidade.service.js';
import { MIMES_DOCUMENTO_ACEITOS, removerArquivoPublico, salvarDocumento } from '../../lib/arquivos.js';
import { RequisicaoInvalida } from '../../lib/erros.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';
import { uploadMaxBytes } from '../../env.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });

const conformidadeFiltroSchema = z.object({
  clienteId: z.string().uuid('Cliente invalido.').optional(),
  terceiroId: z.string().uuid('Empresa contratada invalida.').optional(),
  janelaDias: z.coerce.number().int().min(1).max(365).optional(),
});

/** Lê o anexo do multipart e grava — mesma regra para ASO e documento. */
async function receberAnexo(request: FastifyRequest, prefixo: string): Promise<string> {
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

  return salvarDocumento(await arquivo.toBuffer(), arquivo.mimetype, prefixo);
}

/**
 * Etapa 9 — Saude ocupacional e documentacao legal.
 *
 * Colaboradores, ASO e documentos compartilham a mesma pergunta ("o que esta
 * valido?"), entao ficam sob a mesma guarda e o mesmo par de permissoes.
 */
export async function registrarRotasSaude(app: FastifyInstance): Promise<void> {
  app.addHook(
    'preHandler',
    guardaPorMetodo(app, {
      leitura: 'saude:ler',
      escrita: 'saude:escrever',
      excecoes: {
        // O painel e leitura de indicador, e nao de cadastro.
        '/api/v1/conformidade': 'indicadores:ler',
        '/api/v1/conformidade/renovacoes': 'indicadores:ler',
      },
    }),
  );

  /* =========================================================== colaboradores */

  app.get('/colaboradores', async (request) => {
    const filtro = colaboradorFiltroSchema.parse(request.query);
    const pagina = await listarColaboradores(filtro);

    return {
      ...pagina,
      itens: pagina.itens.map((item) => ({
        ...item,
        cpfFormatado: formatarCpf(item.cpf),
        rotulos: {
          vinculo: ROTULO_VINCULO_COLABORADOR[item.vinculo],
          situacao: ROTULO_SITUACAO_COLABORADOR[item.situacao],
          grauRisco: ROTULO_GRAU_RISCO_FUNCAO[item.grauRisco],
          situacaoAso:
            item.situacaoAso === 'SEM_ASO' ? 'Sem ASO' : ROTULO_SITUACAO_VENCIMENTO[item.situacaoAso],
        },
      })),
    };
  });

  app.get('/colaboradores/opcoes', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    const opcoes = await listarOpcoesColaboradores(clienteId);

    return opcoes.map((opcao) => ({ ...opcao, cpfFormatado: formatarCpf(opcao.cpf) }));
  });

  app.get('/colaboradores/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const colaborador = await obterColaboradorOuFalhar(id);

    return { ...colaborador, cpfFormatado: formatarCpf(colaborador.cpf) };
  });

  app.get('/colaboradores/:id/auditoria', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return listarAuditoriaColaborador(id);
  });

  app.post('/colaboradores', async (request, reply) => {
    const dados = colaboradorCreateSchema.parse(request.body);
    const colaborador = await criarColaborador(dados, contextoDeAuditoria(request));

    return reply.status(201).send(colaborador);
  });

  app.put('/colaboradores/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = colaboradorUpdateSchema.parse(request.body);

    return atualizarColaborador(id, dados, contextoDeAuditoria(request));
  });

  app.delete('/colaboradores/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await excluirColaborador(id, contextoDeAuditoria(request));

    return reply.status(204).send();
  });

  /* ===================================================================== ASO */

  app.get('/asos', async (request) => {
    const filtro = asoFiltroSchema.parse(request.query);
    const pagina = await listarAsos(filtro);

    return {
      ...pagina,
      itens: pagina.itens.map((item) => ({
        ...item,
        rotulos: {
          tipo: ROTULO_TIPO_ASO[item.tipo],
          resultado: ROTULO_RESULTADO_ASO[item.resultado],
          situacao: ROTULO_SITUACAO_VENCIMENTO[item.situacao],
        },
      })),
    };
  });

  app.get('/asos/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return obterAsoOuFalhar(id);
  });

  app.post('/asos', async (request, reply) => {
    const dados = asoCreateSchema.parse(request.body);
    const aso = await criarAso(dados, contextoDeAuditoria(request));

    return reply.status(201).send(aso);
  });

  app.put('/asos/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = asoUpdateSchema.parse(request.body);

    return atualizarAso(id, dados, contextoDeAuditoria(request));
  });

  app.delete('/asos/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await excluirAso(id, contextoDeAuditoria(request));

    return reply.status(204).send();
  });

  app.post('/asos/:id/arquivo', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await obterAsoOuFalhar(id);
    const url = await receberAnexo(request, 'aso');

    const atualizado = await definirArquivoDoAso(id, url, contextoDeAuditoria(request));
    await removerArquivoPublico(atual.arquivoUrl);

    return atualizado;
  });

  /* ============================================================== documentos */

  app.get('/documentos', async (request) => {
    const filtro = documentoFiltroSchema.parse(request.query);
    const pagina = await listarDocumentos(filtro);

    return {
      ...pagina,
      itens: pagina.itens.map((item) => ({
        ...item,
        rotulos: {
          abrangencia: ROTULO_ABRANGENCIA_DOCUMENTO[item.abrangencia],
          situacao: ROTULO_SITUACAO_DOCUMENTO[item.situacao],
          vencimento: ROTULO_SITUACAO_VENCIMENTO[item.situacaoVencimento],
        },
      })),
    };
  });

  /** Catalogo com prazos legais e exigencia de responsavel tecnico. */
  app.get('/documentos/catalogo', async () => CATALOGO_DOCUMENTOS);

  app.get('/documentos/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return obterDocumentoOuFalhar(id);
  });

  app.get('/documentos/:id/auditoria', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return listarAuditoriaDocumento(id);
  });

  app.post('/documentos', async (request, reply) => {
    const dados = documentoCreateSchema.parse(request.body);
    const documento = await criarDocumento(dados, contextoDeAuditoria(request));

    return reply.status(201).send(documento);
  });

  app.put('/documentos/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = documentoUpdateSchema.parse(request.body);

    return atualizarDocumento(id, dados, contextoDeAuditoria(request));
  });

  /** Nova revisao: o anterior vira SUBSTITUIDO e o historico fica de pe. */
  app.post('/documentos/:id/revisao', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = documentoUpdateSchema.parse(request.body ?? {});
    const novo = await revisarDocumento(id, dados, contextoDeAuditoria(request));

    return reply.status(201).send(novo);
  });

  app.delete('/documentos/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await excluirDocumento(id, contextoDeAuditoria(request));

    return reply.status(204).send();
  });

  app.post('/documentos/:id/arquivo', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await obterDocumentoOuFalhar(id);
    const url = await receberAnexo(request, 'documento');

    const atualizado = await definirArquivoDoDocumento(id, url, contextoDeAuditoria(request));
    await removerArquivoPublico(atual.arquivoUrl);

    return atualizado;
  });

  /* ============================================================ conformidade */

  app.get('/conformidade', async (request) => {
    const filtro = conformidadeFiltroSchema.parse(request.query);
    const painel = await painelConformidade(filtro);

    return {
      ...painel,
      renovacao: {
        ...painel.renovacao,
        itens: painel.renovacao.itens.map((item) => ({
          ...item,
          rotuloUrgencia: ROTULO_URGENCIA_RENOVACAO[item.urgencia],
        })),
      },
    };
  });

  app.get('/conformidade/renovacoes', async (request) => {
    const filtro = conformidadeFiltroSchema.parse(request.query);
    const itens = await filaDeRenovacao(filtro);

    return {
      total: itens.length,
      itens: itens.map((item) => ({ ...item, rotuloUrgencia: ROTULO_URGENCIA_RENOVACAO[item.urgencia] })),
    };
  });
}
