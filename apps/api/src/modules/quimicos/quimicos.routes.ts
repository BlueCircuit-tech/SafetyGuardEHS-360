import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  CODIGOS_PICTOGRAMA_GHS,
  ROTULO_ESTADO_FISICO,
  ROTULO_PALAVRA_ADVERTENCIA,
  ROTULO_PICTOGRAMA_GHS,
  ROTULO_SITUACAO_FDS,
  diasAteVencer,
  fdsSituacao,
  produtoQuimicoCreateSchema,
  produtoQuimicoFiltroSchema,
  produtoQuimicoUpdateSchema,
  type CodigoPictogramaGhs,
  type EstadoFisico,
  type PalavraAdvertencia,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { uploadMaxBytes } from '../../env.js';
import { MIMES_DOCUMENTO_ACEITOS, removerArquivoPublico, salvarDocumento } from '../../lib/arquivos.js';
import { calcularDiferenca, registrarAuditoria } from '../../lib/auditoria.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { guardaPorMetodo } from '../../lib/guarda.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });

const INCLUDE_PRODUTO = {
  cliente: { select: { id: true, nomeFantasia: true } },
  area: { select: { id: true, nome: true, codigo: true } },
} satisfies Prisma.ProdutoQuimicoInclude;

type ProdutoComRelacoes = Prisma.ProdutoQuimicoGetPayload<{ include: typeof INCLUDE_PRODUTO }>;

function lerPictogramas(valor: Prisma.JsonValue | null | undefined): CodigoPictogramaGhs[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter(
    (item): item is CodigoPictogramaGhs =>
      typeof item === 'string' && (CODIGOS_PICTOGRAMA_GHS as readonly string[]).includes(item),
  );
}

/** Campos derivados que a tela e a ficha imprimivel usam sem recalcular. */
function serializar(produto: ProdutoComRelacoes, hoje: Date) {
  const pictogramas = lerPictogramas(produto.pictogramas);
  const situacaoFds = fdsSituacao(produto.fdsValidade, hoje, Boolean(produto.fdsUrl));
  return {
    ...produto,
    pictogramas,
    quantidadeEstoque: produto.quantidadeEstoque === null ? null : Number(produto.quantidadeEstoque),
    situacaoFds,
    diasParaVencerFds: diasAteVencer(produto.fdsValidade, hoje),
    rotulos: {
      situacaoFds: ROTULO_SITUACAO_FDS[situacaoFds],
      estadoFisico: produto.estadoFisico ? ROTULO_ESTADO_FISICO[produto.estadoFisico as EstadoFisico] ?? produto.estadoFisico : null,
      palavraAdvertencia: produto.palavraAdvertencia
        ? ROTULO_PALAVRA_ADVERTENCIA[produto.palavraAdvertencia as PalavraAdvertencia] ?? produto.palavraAdvertencia
        : null,
      pictogramas: pictogramas.map((codigo) => ROTULO_PICTOGRAMA_GHS[codigo]),
    },
  };
}

function paraPrisma(dados: Record<string, unknown>): Record<string, unknown> {
  const { pictogramas, ...resto } = dados;
  const saida: Record<string, unknown> = { ...resto };
  if (pictogramas !== undefined) saida.pictogramas = pictogramas as Prisma.InputJsonValue;
  return saida;
}

async function obterProdutoOuFalhar(id: string): Promise<ProdutoComRelacoes> {
  const produto = await prisma.produtoQuimico.findUnique({ where: { id }, include: INCLUDE_PRODUTO });
  if (!produto) throw new NaoEncontrado('Produto quimico nao encontrado.', 'PRODUTO_QUIMICO_NAO_ENCONTRADO');
  return produto;
}

async function receberArquivo(request: FastifyRequest, aceitos: readonly string[]): Promise<{ buffer: Buffer; mimetype: string }> {
  const arquivo = await request.file({ limits: { fileSize: uploadMaxBytes } });
  if (!arquivo) {
    throw new RequisicaoInvalida('Envie o arquivo no campo "arquivo" (multipart/form-data).', 'ARQUIVO_AUSENTE');
  }
  if (!aceitos.includes(arquivo.mimetype)) {
    throw new RequisicaoInvalida(`Formato ${arquivo.mimetype} nao suportado. Envie PDF, PNG, JPG ou WEBP.`, 'FORMATO_NAO_SUPORTADO');
  }
  return { buffer: await arquivo.toBuffer(), mimetype: arquivo.mimetype };
}

/**
 * Etapa 24 — Produtos Quimicos (GHS / FDS).
 *
 * Inventario com classificacao GHS e a FDS anexada. A situacao da FDS e
 * derivada aqui (vigente / a vencer / vencida / sem FDS) para que a lista, o
 * resumo e a ficha imprimivel digam a mesma coisa.
 */
export async function registrarRotasQuimicos(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'cadastros:ler', escrita: 'cadastros:escrever' }));

  app.get('/quimicos', async (request) => {
    const filtro = produtoQuimicoFiltroSchema.parse(request.query);
    const hoje = new Date();

    const where: Prisma.ProdutoQuimicoWhereInput = {
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      ...(filtro.areaId ? { areaId: filtro.areaId } : {}),
      ...(filtro.inativos ? {} : { ativo: true }),
      ...(filtro.busca
        ? {
            OR: [
              { nome: { contains: filtro.busca, mode: 'insensitive' } },
              { fabricante: { contains: filtro.busca, mode: 'insensitive' } },
              { numeroCas: { contains: filtro.busca, mode: 'insensitive' } },
              { classificacao: { contains: filtro.busca, mode: 'insensitive' } },
              { localArmazenamento: { contains: filtro.busca, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const itens = await prisma.produtoQuimico.findMany({
      where,
      include: INCLUDE_PRODUTO,
      orderBy: [{ nome: 'asc' }],
      take: 500,
    });

    return itens
      .map((produto) => serializar(produto, hoje))
      .filter((produto) => !filtro.pictograma || produto.pictogramas.includes(filtro.pictograma));
  });

  app.get('/quimicos/resumo', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    const hoje = new Date();

    const itens = await prisma.produtoQuimico.findMany({
      where: { ativo: true, ...(clienteId ? { clienteId } : {}) },
      select: { pictogramas: true, fdsUrl: true, fdsValidade: true, palavraAdvertencia: true },
    });

    const porPictograma = Object.fromEntries(CODIGOS_PICTOGRAMA_GHS.map((codigo) => [codigo, 0])) as Record<CodigoPictogramaGhs, number>;
    let semFds = 0;
    let fdsVencidas = 0;
    let fdsAVencer = 0;
    let comPalavraPerigo = 0;

    for (const item of itens) {
      const situacao = fdsSituacao(item.fdsValidade, hoje, Boolean(item.fdsUrl));
      if (situacao === 'SEM_FDS') semFds += 1;
      if (situacao === 'VENCIDA') fdsVencidas += 1;
      if (situacao === 'A_VENCER') fdsAVencer += 1;
      if (item.palavraAdvertencia === 'PERIGO') comPalavraPerigo += 1;
      for (const codigo of lerPictogramas(item.pictogramas)) porPictograma[codigo] += 1;
    }

    return {
      total: itens.length,
      semFds,
      fdsVencidas,
      fdsAVencer,
      comPalavraPerigo,
      porPictograma: CODIGOS_PICTOGRAMA_GHS.map((codigo) => ({
        codigo,
        nome: ROTULO_PICTOGRAMA_GHS[codigo],
        total: porPictograma[codigo],
      })),
    };
  });

  app.get('/quimicos/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return serializar(await obterProdutoOuFalhar(id), new Date());
  });

  app.post('/quimicos', async (request, reply) => {
    const dados = produtoQuimicoCreateSchema.parse(request.body);

    const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true } });
    if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');
    if (dados.areaId) {
      const area = await prisma.area.findUnique({ where: { id: dados.areaId }, select: { clienteId: true } });
      if (!area) throw new NaoEncontrado('Area nao encontrada.', 'AREA_NAO_ENCONTRADA');
      if (area.clienteId !== dados.clienteId) throw new RequisicaoInvalida('A area informada nao pertence ao cliente.', 'AREA_DE_OUTRO_CLIENTE');
    }

    const produto = await prisma.$transaction(async (tx) => {
      const criado = await tx.produtoQuimico.create({
        data: paraPrisma(dados) as Prisma.ProdutoQuimicoUncheckedCreateInput,
        include: INCLUDE_PRODUTO,
      });
      await registrarAuditoria(tx, {
        entidade: 'ProdutoQuimico',
        entidadeId: criado.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, criado as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });
      return criado;
    });

    return reply.status(201).send(serializar(produto, new Date()));
  });

  app.put('/quimicos/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = produtoQuimicoUpdateSchema.parse(request.body);
    if (Object.keys(dados).length === 0) {
      throw new RequisicaoInvalida('Nenhum campo enviado para atualizacao.', 'PAYLOAD_VAZIO');
    }

    const atual = await obterProdutoOuFalhar(id);
    const clienteId = dados.clienteId ?? atual.clienteId;
    if (dados.areaId) {
      const area = await prisma.area.findUnique({ where: { id: dados.areaId }, select: { clienteId: true } });
      if (!area) throw new NaoEncontrado('Area nao encontrada.', 'AREA_NAO_ENCONTRADA');
      if (area.clienteId !== clienteId) throw new RequisicaoInvalida('A area informada nao pertence ao cliente.', 'AREA_DE_OUTRO_CLIENTE');
    }

    const produto = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.produtoQuimico.update({
        where: { id },
        data: paraPrisma(dados) as Prisma.ProdutoQuimicoUncheckedUpdateInput,
        include: INCLUDE_PRODUTO,
      });
      const diferenca = calcularDiferenca(
        atual as unknown as Record<string, unknown>,
        atualizado as unknown as Record<string, unknown>,
      );
      if (Object.keys(diferenca).length > 0) {
        await registrarAuditoria(tx, {
          entidade: 'ProdutoQuimico',
          entidadeId: id,
          acao: 'ATUALIZACAO',
          alteracoes: diferenca,
          contexto: contextoDeAuditoria(request),
        });
      }
      return atualizado;
    });

    return serializar(produto, new Date());
  });

  app.delete('/quimicos/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await obterProdutoOuFalhar(id);

    await prisma.$transaction(async (tx) => {
      await tx.produtoQuimico.delete({ where: { id } });
      await registrarAuditoria(tx, {
        entidade: 'ProdutoQuimico',
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: { nome: { de: atual.nome, para: null } },
        contexto: contextoDeAuditoria(request),
      });
    });
    await removerArquivoPublico(atual.fdsUrl);

    return reply.status(204).send();
  });

  /**
   * Anexa a FDS (PDF ou imagem). A validade vem na querystring porque o corpo
   * e multipart: `POST /quimicos/:id/fds?validade=2027-01-31`.
   */
  app.post('/quimicos/:id/fds', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const { validade } = z
      .object({
        validade: z
          .string()
          .trim()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'Validade deve estar no formato AAAA-MM-DD.')
          .optional(),
      })
      .parse(request.query);

    const atual = await obterProdutoOuFalhar(id);
    const { buffer, mimetype } = await receberArquivo(request, MIMES_DOCUMENTO_ACEITOS);
    const url = await salvarDocumento(buffer, mimetype, 'fds');

    const produto = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.produtoQuimico.update({
        where: { id },
        data: { fdsUrl: url, ...(validade ? { fdsValidade: new Date(`${validade}T00:00:00.000Z`) } : {}) },
        include: INCLUDE_PRODUTO,
      });
      await registrarAuditoria(tx, {
        entidade: 'ProdutoQuimico',
        entidadeId: id,
        acao: 'ATUALIZACAO',
        alteracoes: calcularDiferenca(
          { fdsUrl: atual.fdsUrl, fdsValidade: atual.fdsValidade },
          { fdsUrl: atualizado.fdsUrl, fdsValidade: atualizado.fdsValidade },
        ),
        contexto: contextoDeAuditoria(request),
      });
      return atualizado;
    });
    await removerArquivoPublico(atual.fdsUrl);

    return serializar(produto, new Date());
  });
}
