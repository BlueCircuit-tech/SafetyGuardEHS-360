import type { FastifyInstance } from 'fastify';
import type { Terceiro } from '@prisma/client';
import { z } from 'zod';
import {
  classificarNotaSsma,
  formatarCep,
  formatarCnae,
  formatarCnpj,
  formatarTelefone,
  rotuloClassificacao,
  terceiroCreateSchema,
  terceiroFiltroSchema,
  terceiroUpdateSchema,
} from '@safetyguard/shared';
import {
  atualizarTerceiro,
  criarTerceiro,
  definirLogoTerceiro,
  excluirTerceiro,
  listarAuditoriaTerceiro,
  listarTerceiros,
  obterTerceiroOuFalhar,
  rankingTerceiros,
  resumoTerceiros,
} from './terceiro.service.js';
import { MIMES_IMAGEM_ACEITOS, removerArquivoPublico, salvarImagem } from '../../lib/arquivos.js';
import { RequisicaoInvalida } from '../../lib/erros.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';
import { uploadMaxBytes } from '../../env.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador de terceiro invalido.') });

const MS_POR_DIA = 24 * 60 * 60 * 1000;

function diasAte(data: Date | null): number | null {
  return data === null ? null : Math.ceil((data.getTime() - Date.now()) / MS_POR_DIA);
}

/**
 * Normaliza para o front: Decimal vira numero, mascaras vao num bloco
 * `formatado` e o estado de desempenho/documentacao e derivado na leitura.
 */
function serializar(terceiro: Terceiro) {
  const notaSsma = terceiro.notaSsma === null ? null : Number(terceiro.notaSsma);
  const metaNotaSsma = Number(terceiro.metaNotaSsma);
  const classificacao = classificarNotaSsma(notaSsma);

  const diasParaFimAtuacao = diasAte(terceiro.dataFimAtuacao);
  const diasParaVencimentoDocumentacao = diasAte(terceiro.documentacaoValidaAte);

  return {
    ...terceiro,
    notaSsma,
    metaNotaSsma,
    classificacao,
    classificacaoRotulo: rotuloClassificacao(classificacao),
    abaixoDaMeta: notaSsma !== null && notaSsma < metaNotaSsma,
    diasParaFimAtuacao,
    atuacaoVencida: diasParaFimAtuacao !== null && diasParaFimAtuacao < 0 && terceiro.situacao === 'ATIVO',
    diasParaVencimentoDocumentacao,
    documentacaoVencida: diasParaVencimentoDocumentacao !== null && diasParaVencimentoDocumentacao < 0,
    /** Falta PGR, PCMSO ou documentacao vencida — impede liberacao de acesso. */
    pendenciaDocumental:
      !terceiro.possuiPgr ||
      !terceiro.possuiPcmso ||
      (diasParaVencimentoDocumentacao !== null && diasParaVencimentoDocumentacao < 0),
    formatado: {
      cnpj: formatarCnpj(terceiro.cnpj),
      cep: terceiro.cep ? formatarCep(terceiro.cep) : null,
      responsavelTelefone: formatarTelefone(terceiro.responsavelTelefone),
      responsavelWhatsapp: terceiro.responsavelWhatsapp ? formatarTelefone(terceiro.responsavelWhatsapp) : null,
      cnaePrincipal: terceiro.cnaePrincipal ? formatarCnae(terceiro.cnaePrincipal) : null,
    },
  };
}

export async function rotasTerceiros(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'cadastros:ler', escrita: 'cadastros:escrever' }));

  app.get('/terceiros/resumo', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    return resumoTerceiros(clienteId);
  });

  /** Ranking de desempenho SSMA — so terceiros ja avaliados. */
  app.get('/terceiros/ranking', async (request) => {
    const { clienteId, limite } = z
      .object({
        clienteId: z.string().uuid().optional(),
        limite: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(request.query);

    const itens = await rankingTerceiros({ clienteId, limite });

    return itens.map((terceiro, indice) => {
      const nota = Number(terceiro.notaSsma);
      const classificacao = classificarNotaSsma(nota);
      return {
        posicao: indice + 1,
        id: terceiro.id,
        nomeFantasia: terceiro.nomeFantasia,
        cnpjFormatado: formatarCnpj(terceiro.cnpj),
        atividadePrincipal: terceiro.atividadePrincipal,
        cliente: terceiro.cliente,
        notaSsma: nota,
        metaNotaSsma: Number(terceiro.metaNotaSsma),
        abaixoDaMeta: nota < Number(terceiro.metaNotaSsma),
        classificacao,
        classificacaoRotulo: rotuloClassificacao(classificacao),
        grauRisco: terceiro.grauRisco,
        situacao: terceiro.situacao,
        corDestaque: terceiro.corDestaque,
        quantidadeFuncionarios: terceiro.quantidadeFuncionarios,
        dataUltimaAvaliacao: terceiro.dataUltimaAvaliacao,
      };
    });
  });

  app.get('/terceiros', async (request) => {
    const filtro = terceiroFiltroSchema.parse(request.query);
    const pagina = await listarTerceiros(filtro);
    return { ...pagina, itens: pagina.itens.map(serializar) };
  });

  app.get('/terceiros/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return serializar(await obterTerceiroOuFalhar(id));
  });

  app.post('/terceiros', async (request, reply) => {
    const dados = terceiroCreateSchema.parse(request.body);
    const terceiro = await criarTerceiro(dados, contextoDeAuditoria(request));
    return reply.status(201).send(serializar(terceiro));
  });

  app.put('/terceiros/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = terceiroUpdateSchema.parse(request.body);

    if (Object.keys(dados).length === 0) {
      throw new RequisicaoInvalida('Nenhum campo enviado para atualizacao.', 'PAYLOAD_VAZIO');
    }

    return serializar(await atualizarTerceiro(id, dados, contextoDeAuditoria(request)));
  });

  app.delete('/terceiros/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await excluirTerceiro(id, contextoDeAuditoria(request));
    return reply.status(204).send();
  });

  app.get('/terceiros/:id/auditoria', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const { limite } = z.object({ limite: z.coerce.number().int().min(1).max(200).default(50) }).parse(request.query);
    return listarAuditoriaTerceiro(id, limite);
  });

  app.post('/terceiros/:id/logo', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const terceiro = await obterTerceiroOuFalhar(id);
    const arquivo = await request.file({ limits: { fileSize: uploadMaxBytes } });

    if (!arquivo) {
      throw new RequisicaoInvalida('Envie a logo no campo "arquivo" (multipart/form-data).', 'ARQUIVO_AUSENTE');
    }
    if (!MIMES_IMAGEM_ACEITOS.includes(arquivo.mimetype)) {
      throw new RequisicaoInvalida(
        `Formato ${arquivo.mimetype} nao suportado. Envie PNG, JPG, WEBP ou SVG.`,
        'FORMATO_NAO_SUPORTADO',
      );
    }

    const conteudo = await arquivo.toBuffer();
    const logoUrl = await salvarImagem(conteudo, arquivo.mimetype, 'terceiro');
    const atualizado = await definirLogoTerceiro(id, logoUrl, contextoDeAuditoria(request));

    await removerArquivoPublico(terceiro.logoUrl);

    return serializar(atualizado);
  });

  app.delete('/terceiros/:id/logo', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const terceiro = await obterTerceiroOuFalhar(id);
    const atualizado = await definirLogoTerceiro(id, null, contextoDeAuditoria(request));
    await removerArquivoPublico(terceiro.logoUrl);
    return serializar(atualizado);
  });
}
