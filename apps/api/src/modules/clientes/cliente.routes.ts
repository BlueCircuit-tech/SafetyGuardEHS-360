import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Cliente } from '@prisma/client';
import QRCode from 'qrcode';
import { z } from 'zod';
import {
  ROTULO_NIVEL_CONTATO,
  clienteCreateSchema,
  clienteFiltroSchema,
  clienteUpdateSchema,
  contatoClienteCreateSchema,
  contatoClienteUpdateSchema,
  formatarCep,
  formatarCnae,
  formatarCnpj,
  formatarTelefone,
  type NivelContatoCliente,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { env } from '../../env.js';
import { calcularDiferenca, registrarAuditoria } from '../../lib/auditoria.js';
import { NaoEncontrado } from '../../lib/erros.js';
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
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';
import { uploadMaxBytes } from '../../env.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador de cliente invalido.') });
const contatoParamsSchema = z.object({ id: z.string().uuid('Identificador de contato invalido.') });

/** Token do QR Code geral do cliente: 32 hex maiusculos. */
const TOKEN_CLIENTE = /^[A-F0-9]{32}$/;

/** Endereco gravado no QR geral do cliente — abre a lista de areas no celular. */
function urlDaInspecaoDoCliente(token: string): string {
  return `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/inspecao-cliente/${token}`;
}

async function garantirTokenQrDoCliente(id: string): Promise<string> {
  const cliente = await prisma.cliente.findUnique({ where: { id }, select: { tokenQr: true } });
  if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');
  if (cliente.tokenQr) return cliente.tokenQr;
  const token = randomBytes(16).toString('hex').toUpperCase();
  await prisma.cliente.update({ where: { id }, data: { tokenQr: token } });
  return token;
}

function serializarContato<T extends { nivel: string; telefone: string | null; whatsapp: string | null }>(contato: T) {
  return {
    ...contato,
    rotuloNivel: ROTULO_NIVEL_CONTATO[contato.nivel as NivelContatoCliente] ?? contato.nivel,
    formatado: {
      telefone: contato.telefone ? formatarTelefone(contato.telefone) : null,
      whatsapp: contato.whatsapp ? formatarTelefone(contato.whatsapp) : null,
    },
  };
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

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
  app.addHook(
    'preHandler',
    guardaPorMetodo(app, {
      leitura: 'cadastros:ler',
      escrita: 'cadastros:escrever',
      // O QR geral do cliente e lido em campo, sem login: o token e a credencial.
      excecoes: { '/api/v1/clientes/qr/:token': null },
    }),
  );

  /* ---------------------------------------------------- QR geral do cliente */

  /**
   * Leitura do QR Code unico do cliente: devolve as areas ativas para a
   * pessoa escolher onde esta. Cada area leva ao seu formulario de observacao.
   */
  app.get('/clientes/qr/:token', async (request) => {
    const { token } = z.object({ token: z.string().trim().toUpperCase() }).parse(request.params);
    if (!TOKEN_CLIENTE.test(token)) throw new NaoEncontrado('QR Code invalido.', 'QR_INVALIDO');

    const cliente = await prisma.cliente.findUnique({
      where: { tokenQr: token },
      select: {
        id: true,
        nomeFantasia: true,
        razaoSocial: true,
        logoUrl: true,
        situacao: true,
        areas: {
          where: { situacao: 'ATIVA' },
          orderBy: [{ setor: 'asc' }, { nome: 'asc' }],
          select: { id: true, nome: true, codigo: true, setor: true, tipo: true, criticidade: true, tokenQr: true },
        },
      },
    });
    if (!cliente) throw new NaoEncontrado('QR Code nao reconhecido.', 'QR_NAO_ENCONTRADO');

    return {
      cliente: { id: cliente.id, nomeFantasia: cliente.nomeFantasia, razaoSocial: cliente.razaoSocial, logoUrl: cliente.logoUrl },
      areas: cliente.areas.map((area) => ({ ...area, urlInspecao: `/inspecao/${area.tokenQr}` })),
    };
  });

  /** QR Code geral do cliente (SVG), gerando o token na primeira vez. */
  app.get('/clientes/:id/qrcode.svg', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const { escala } = z.object({ escala: z.coerce.number().int().min(2).max(20).default(6) }).parse(request.query);
    const token = await garantirTokenQrDoCliente(id);
    const svg = await QRCode.toString(urlDaInspecaoDoCliente(token), { type: 'svg', errorCorrectionLevel: 'M', margin: 1, scale: escala });
    return reply.header('Content-Type', 'image/svg+xml').header('Content-Disposition', 'inline; filename="qr-cliente.svg"').send(svg);
  });

  app.get('/clientes/:id/qrcode', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const token = await garantirTokenQrDoCliente(id);
    return { token, urlInspecao: urlDaInspecaoDoCliente(token), urlQrCode: `${env.PUBLIC_API_URL}/api/v1/clientes/${id}/qrcode.svg` };
  });

  /* ---------------------------------------------- contatos hierarquicos --- */

  app.get('/clientes/:id/contatos', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    await obterClienteOuFalhar(id);
    const contatos = await prisma.contatoCliente.findMany({ where: { clienteId: id }, orderBy: [{ nivel: 'asc' }, { nome: 'asc' }] });
    return contatos.map(serializarContato);
  });

  app.post('/clientes/:id/contatos', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await obterClienteOuFalhar(id);
    const dados = contatoClienteCreateSchema.parse(request.body);

    const contato = await prisma.$transaction(async (tx) => {
      const criado = await tx.contatoCliente.create({ data: { ...dados, clienteId: id } });
      await registrarAuditoria(tx, {
        entidade: 'ContatoCliente',
        entidadeId: criado.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, criado as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });
      return criado;
    });
    return reply.status(201).send(serializarContato(contato));
  });

  app.put('/clientes/contatos/:id', async (request) => {
    const { id } = contatoParamsSchema.parse(request.params);
    const dados = contatoClienteUpdateSchema.parse(request.body);
    const atual = await prisma.contatoCliente.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado('Contato nao encontrado.', 'CONTATO_NAO_ENCONTRADO');

    const contato = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.contatoCliente.update({ where: { id }, data: dados });
      const diferenca = calcularDiferenca(atual as unknown as Record<string, unknown>, atualizado as unknown as Record<string, unknown>);
      if (Object.keys(diferenca).length > 0) {
        await registrarAuditoria(tx, { entidade: 'ContatoCliente', entidadeId: id, acao: 'ATUALIZACAO', alteracoes: diferenca, contexto: contextoDeAuditoria(request) });
      }
      return atualizado;
    });
    return serializarContato(contato);
  });

  app.delete('/clientes/contatos/:id', async (request, reply) => {
    const { id } = contatoParamsSchema.parse(request.params);
    const atual = await prisma.contatoCliente.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado('Contato nao encontrado.', 'CONTATO_NAO_ENCONTRADO');
    await prisma.$transaction(async (tx) => {
      await tx.contatoCliente.delete({ where: { id } });
      await registrarAuditoria(tx, { entidade: 'ContatoCliente', entidadeId: id, acao: 'EXCLUSAO', alteracoes: { nome: { de: atual.nome, para: null } }, contexto: contextoDeAuditoria(request) });
    });
    return reply.status(204).send();
  });

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
    const cliente = await criarCliente(dados, contextoDeAuditoria(request));
    return reply.status(201).send(serializar(cliente));
  });

  app.put('/clientes/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = clienteUpdateSchema.parse(request.body);

    if (Object.keys(dados).length === 0) {
      throw new RequisicaoInvalida('Nenhum campo enviado para atualizacao.', 'PAYLOAD_VAZIO');
    }

    return serializar(await atualizarCliente(id, dados, contextoDeAuditoria(request)));
  });

  app.delete('/clientes/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await excluirCliente(id, contextoDeAuditoria(request));
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
    const atualizado = await definirLogoCliente(id, logoUrl, contextoDeAuditoria(request));

    await removerArquivoPublico(cliente.logoUrl);

    return serializar(atualizado);
  });

  app.delete('/clientes/:id/logo', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const cliente = await obterClienteOuFalhar(id);
    const atualizado = await definirLogoCliente(id, null, contextoDeAuditoria(request));
    await removerArquivoPublico(cliente.logoUrl);
    return serializar(atualizado);
  });
}
