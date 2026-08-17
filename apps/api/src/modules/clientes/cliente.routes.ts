import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Cliente } from '@prisma/client';
import { z } from 'zod';
import {
  clienteCreateSchema,
  clienteFiltroSchema,
  clienteUpdateSchema,
  formatarCep,
  formatarCnae,
  formatarCnpj,
  formatarTelefone,
} from '@safetyguard/shared';
import {
  atualizarCliente,
  criarCliente,
  definirLogoCliente,
  excluirCliente,
  listarAuditoriaCliente,
  listarClientes,
  listarOpcoesClientes,
  obterClienteOuFalhar,
  resumoClientes,
} from './cliente.service.js';
import { MIMES_IMAGEM_ACEITOS, removerArquivoPublico, salvarImagem } from '../../lib/arquivos.js';
import { RequisicaoInvalida } from '../../lib/erros.js';
import { uploadMaxBytes } from '../../env.js';
import type { ContextoAuditoria } from '../../lib/auditoria.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador de cliente invalido.') });

const MS_POR_DIA = 24 * 60 * 60 * 1000;

function contextoDaRequisicao(request: FastifyRequest): ContextoAuditoria {
  const cabecalho = request.headers['x-usuario'];
  return {
    autor: (Array.isArray(cabecalho) ? cabecalho[0] : cabecalho) ?? 'sistema',
    ip: request.ip,
  };
}

const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Normaliza o registro para o front: converte Decimal em numero, aplica
 * mascaras num bloco `formatado` e deriva o estado da vigencia do contrato.
 */
function serializar(cliente: Cliente) {
  const valorMensal = cliente.valorMensal === null ? null : Number(cliente.valorMensal);
  const metaIndiceGlobal = Number(cliente.metaIndiceGlobal);

  const fim = cliente.dataFimContrato;
  const diasParaFimContrato =
    fim === null ? null : Math.ceil((fim.getTime() - Date.now()) / MS_POR_DIA);

  return {
    ...cliente,
    valorMensal,
    metaIndiceGlobal,
    diasParaFimContrato,
    contratoVencido: diasParaFimContrato !== null && diasParaFimContrato < 0 && cliente.situacao === 'ATIVO',
    formatado: {
      cnpj: formatarCnpj(cliente.cnpj),
      cep: formatarCep(cliente.cep),
      contatoTelefone: formatarTelefone(cliente.contatoTelefone),
      contatoWhatsapp: cliente.contatoWhatsapp ? formatarTelefone(cliente.contatoWhatsapp) : null,
      cnaePrincipal: cliente.cnaePrincipal ? formatarCnae(cliente.cnaePrincipal) : null,
      valorMensal: valorMensal === null ? null : dinheiro.format(valorMensal),
    },
  };
}

export async function rotasClientes(app: FastifyInstance): Promise<void> {
  /** Cards de contagem da listagem. */
  app.get('/clientes/resumo', async () => resumoClientes());

  /** Lista enxuta para seletores de dashboard e cadastros seguintes. */
  app.get('/clientes/opcoes', async (request) => {
    const { incluirInativos } = z
      .object({ incluirInativos: z.enum(['true', 'false']).default('false') })
      .parse(request.query);
    return listarOpcoesClientes(incluirInativos === 'false');
  });

  app.get('/clientes', async (request) => {
    const filtro = clienteFiltroSchema.parse(request.query);
    const pagina = await listarClientes(filtro);
    return { ...pagina, itens: pagina.itens.map(serializar) };
  });

  app.get('/clientes/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return serializar(await obterClienteOuFalhar(id));
  });

  app.post('/clientes', async (request, reply) => {
    const dados = clienteCreateSchema.parse(request.body);
    const cliente = await criarCliente(dados, contextoDaRequisicao(request));
    return reply.status(201).send(serializar(cliente));
  });

  app.put('/clientes/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = clienteUpdateSchema.parse(request.body);

    if (Object.keys(dados).length === 0) {
      throw new RequisicaoInvalida('Nenhum campo enviado para atualizacao.', 'PAYLOAD_VAZIO');
    }

    return serializar(await atualizarCliente(id, dados, contextoDaRequisicao(request)));
  });

  app.delete('/clientes/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await excluirCliente(id, contextoDaRequisicao(request));
    return reply.status(204).send();
  });

  app.get('/clientes/:id/auditoria', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const { limite } = z.object({ limite: z.coerce.number().int().min(1).max(200).default(50) }).parse(request.query);
    return listarAuditoriaCliente(id, limite);
  });

  app.post('/clientes/:id/logo', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const cliente = await obterClienteOuFalhar(id);
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
    const logoUrl = await salvarImagem(conteudo, arquivo.mimetype, 'cliente');
    const atualizado = await definirLogoCliente(id, logoUrl, contextoDaRequisicao(request));

    await removerArquivoPublico(cliente.logoUrl);

    return serializar(atualizado);
  });

  app.delete('/clientes/:id/logo', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const cliente = await obterClienteOuFalhar(id);
    const atualizado = await definirLogoCliente(id, null, contextoDaRequisicao(request));
    await removerArquivoPublico(cliente.logoUrl);
    return serializar(atualizado);
  });
}
