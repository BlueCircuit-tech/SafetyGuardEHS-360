import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  CLASSE_FOGO_EXTINTOR,
  FUNCOES_BRIGADA,
  ORDEM_FUNCAO_BRIGADA,
  ROTULO_FUNCAO_BRIGADA,
  ROTULO_SITUACAO_EXTINTOR,
  ROTULO_SITUACAO_TREINAMENTO_BRIGADA,
  ROTULO_TIPO_EXTINTOR,
  TIPOS_EXTINTOR,
  brigadistaCreateSchema,
  brigadistaFiltroSchema,
  brigadistaUpdateSchema,
  diasAteVencer,
  extintorCreateSchema,
  extintorFiltroSchema,
  extintorUpdateSchema,
  inspecaoExtintorSchema,
  situacaoDoExtintor,
  situacaoTreinamentoBrigada,
  type FuncaoBrigada,
  type SituacaoExtintor,
  type TipoExtintor,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { uploadMaxBytes } from '../../env.js';
import {
  MIMES_DOCUMENTO_ACEITOS,
  MIMES_IMAGEM_ACEITOS,
  removerArquivoPublico,
  salvarDocumento,
  salvarImagem,
} from '../../lib/arquivos.js';
import { calcularDiferenca, registrarAuditoria } from '../../lib/auditoria.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { Conflito, NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { guardaPorMetodo } from '../../lib/guarda.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });

const INCLUDE_BRIGADISTA = {
  colaborador: { select: { id: true, nome: true, funcao: true, setor: true, telefone: true, fotoUrl: true, situacao: true } },
  area: { select: { id: true, nome: true, codigo: true } },
} satisfies Prisma.BrigadistaInclude;

const INCLUDE_EXTINTOR = {
  area: { select: { id: true, nome: true, codigo: true } },
} satisfies Prisma.ExtintorInclude;

type BrigadistaComRelacoes = Prisma.BrigadistaGetPayload<{ include: typeof INCLUDE_BRIGADISTA }>;
type ExtintorComRelacoes = Prisma.ExtintorGetPayload<{ include: typeof INCLUDE_EXTINTOR }>;

function serializarBrigadista(brigadista: BrigadistaComRelacoes, hoje: Date) {
  const situacaoTreinamento = situacaoTreinamentoBrigada(brigadista.validadeTreinamento, hoje);
  return {
    ...brigadista,
    situacaoTreinamento,
    diasParaVencerTreinamento: diasAteVencer(brigadista.validadeTreinamento, hoje),
    rotulos: {
      funcaoBrigada: ROTULO_FUNCAO_BRIGADA[brigadista.funcaoBrigada as FuncaoBrigada] ?? brigadista.funcaoBrigada,
      situacaoTreinamento: ROTULO_SITUACAO_TREINAMENTO_BRIGADA[situacaoTreinamento],
    },
  };
}

function serializarExtintor(extintor: ExtintorComRelacoes, hoje: Date) {
  const situacaoEfetiva = situacaoDoExtintor(extintor, hoje);
  return {
    ...extintor,
    situacaoEfetiva,
    diasParaVencerCarga: diasAteVencer(extintor.validadeCarga, hoje),
    diasParaVencerTeste: diasAteVencer(extintor.validadeTesteHidrostatico, hoje),
    rotulos: {
      tipo: ROTULO_TIPO_EXTINTOR[extintor.tipo as TipoExtintor] ?? extintor.tipo,
      classeFogo: CLASSE_FOGO_EXTINTOR[extintor.tipo as TipoExtintor] ?? '—',
      situacao: ROTULO_SITUACAO_EXTINTOR[situacaoEfetiva],
    },
  };
}

async function obterBrigadistaOuFalhar(id: string): Promise<BrigadistaComRelacoes> {
  const brigadista = await prisma.brigadista.findUnique({ where: { id }, include: INCLUDE_BRIGADISTA });
  if (!brigadista) throw new NaoEncontrado('Brigadista nao encontrado.', 'BRIGADISTA_NAO_ENCONTRADO');
  return brigadista;
}

async function obterExtintorOuFalhar(id: string): Promise<ExtintorComRelacoes> {
  const extintor = await prisma.extintor.findUnique({ where: { id }, include: INCLUDE_EXTINTOR });
  if (!extintor) throw new NaoEncontrado('Extintor nao encontrado.', 'EXTINTOR_NAO_ENCONTRADO');
  return extintor;
}

async function validarAreaDoCliente(areaId: string | null | undefined, clienteId: string): Promise<void> {
  if (!areaId) return;
  const area = await prisma.area.findUnique({ where: { id: areaId }, select: { clienteId: true } });
  if (!area) throw new NaoEncontrado('Area nao encontrada.', 'AREA_NAO_ENCONTRADA');
  if (area.clienteId !== clienteId) throw new RequisicaoInvalida('A area informada nao pertence ao cliente.', 'AREA_DE_OUTRO_CLIENTE');
}

async function validarColaboradorDoCliente(colaboradorId: string, clienteId: string): Promise<void> {
  const colaborador = await prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { clienteId: true } });
  if (!colaborador) throw new NaoEncontrado('Colaborador nao encontrado.', 'COLABORADOR_NAO_ENCONTRADO');
  if (colaborador.clienteId !== clienteId) {
    throw new RequisicaoInvalida('O colaborador informado nao pertence ao cliente selecionado.', 'COLABORADOR_DE_OUTRO_CLIENTE');
  }
}

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

/** Troca um anexo do brigadista (foto ou certificado) com auditoria e limpeza do antigo. */
async function trocarAnexoBrigadista(
  request: FastifyRequest,
  id: string,
  campo: 'fotoUrl' | 'certificadoUrl',
  url: string,
) {
  const atual = await obterBrigadistaOuFalhar(id);
  const brigadista = await prisma.$transaction(async (tx) => {
    const atualizado = await tx.brigadista.update({ where: { id }, data: { [campo]: url }, include: INCLUDE_BRIGADISTA });
    await registrarAuditoria(tx, {
      entidade: 'Brigadista',
      entidadeId: id,
      acao: 'ATUALIZACAO',
      alteracoes: calcularDiferenca({ [campo]: atual[campo] }, { [campo]: url }),
      contexto: contextoDeAuditoria(request),
    });
    return atualizado;
  });
  await removerArquivoPublico(atual[campo]);
  return serializarBrigadista(brigadista, new Date());
}

/**
 * Etapa 24 — Brigada de Incendio e Extintores.
 *
 * Brigadistas (colaboradores com funcao na brigada, treinamento, foto e
 * certificado), extintores (carga, teste hidrostatico e inspecao) e o resumo
 * que alimenta os cards. O organograma e montado na tela a partir desta lista.
 */
export async function registrarRotasBrigada(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'cadastros:ler', escrita: 'cadastros:escrever' }));

  /* ------------------------------------------------------------- resumo --- */

  app.get('/brigada/resumo', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    const hoje = new Date();
    const escopo = clienteId ? { clienteId } : {};

    const [brigadistas, extintores] = await Promise.all([
      prisma.brigadista.findMany({
        where: { ativo: true, ...escopo },
        select: { funcaoBrigada: true, validadeTreinamento: true },
      }),
      prisma.extintor.findMany({
        where: escopo,
        select: { tipo: true, situacao: true, validadeCarga: true, validadeTesteHidrostatico: true, ultimaInspecao: true },
      }),
    ]);

    const porFuncao = Object.fromEntries(FUNCOES_BRIGADA.map((f) => [f, 0])) as Record<FuncaoBrigada, number>;
    let treinamentosVencidos = 0;
    let treinamentosAVencer = 0;
    let semTreinamento = 0;
    for (const b of brigadistas) {
      porFuncao[b.funcaoBrigada as FuncaoBrigada] += 1;
      const situacao = situacaoTreinamentoBrigada(b.validadeTreinamento, hoje);
      if (situacao === 'VENCIDO') treinamentosVencidos += 1;
      if (situacao === 'A_VENCER') treinamentosAVencer += 1;
      if (situacao === 'SEM_TREINAMENTO') semTreinamento += 1;
    }

    const porTipo = Object.fromEntries(TIPOS_EXTINTOR.map((t) => [t, 0])) as Record<TipoExtintor, number>;
    const porSituacao: Record<SituacaoExtintor, number> = { OK: 0, VENCIDO: 0, EM_MANUTENCAO: 0, OBSTRUIDO: 0 };
    const limiteInspecao = new Date(hoje.getTime());
    limiteInspecao.setDate(limiteInspecao.getDate() - 30);
    let semInspecao30Dias = 0;
    for (const e of extintores) {
      porTipo[e.tipo as TipoExtintor] += 1;
      porSituacao[situacaoDoExtintor(e, hoje)] += 1;
      if (!e.ultimaInspecao || e.ultimaInspecao < limiteInspecao) semInspecao30Dias += 1;
    }

    return {
      brigadistas: {
        ativos: brigadistas.length,
        porFuncao: FUNCOES_BRIGADA.map((funcao) => ({ funcao, rotulo: ROTULO_FUNCAO_BRIGADA[funcao], total: porFuncao[funcao] })),
        treinamentosVencidos,
        treinamentosAVencer,
        semTreinamento,
      },
      extintores: {
        total: extintores.length,
        vencidos: porSituacao.VENCIDO,
        emManutencao: porSituacao.EM_MANUTENCAO,
        obstruidos: porSituacao.OBSTRUIDO,
        semInspecao30Dias,
        porTipo: TIPOS_EXTINTOR.map((tipo) => ({ tipo, rotulo: ROTULO_TIPO_EXTINTOR[tipo], total: porTipo[tipo] })),
      },
    };
  });

  /* -------------------------------------------------------- brigadistas --- */

  app.get('/brigada/brigadistas', async (request) => {
    const filtro = brigadistaFiltroSchema.parse(request.query);
    const hoje = new Date();

    const itens = await prisma.brigadista.findMany({
      where: {
        ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
        ...(filtro.areaId ? { areaId: filtro.areaId } : {}),
        ...(filtro.inativos ? {} : { ativo: true }),
      },
      include: INCLUDE_BRIGADISTA,
      orderBy: [{ colaborador: { nome: 'asc' } }],
      take: 500,
    });

    return itens
      .map((b) => serializarBrigadista(b, hoje))
      .sort(
        (a, b) =>
          ORDEM_FUNCAO_BRIGADA[a.funcaoBrigada as FuncaoBrigada] - ORDEM_FUNCAO_BRIGADA[b.funcaoBrigada as FuncaoBrigada] ||
          a.colaborador.nome.localeCompare(b.colaborador.nome, 'pt-BR'),
      );
  });

  app.post('/brigada/brigadistas', async (request, reply) => {
    const dados = brigadistaCreateSchema.parse(request.body);

    const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true } });
    if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');
    await validarColaboradorDoCliente(dados.colaboradorId, dados.clienteId);
    await validarAreaDoCliente(dados.areaId, dados.clienteId);

    const existente = await prisma.brigadista.findUnique({
      where: { clienteId_colaboradorId: { clienteId: dados.clienteId, colaboradorId: dados.colaboradorId } },
      select: { id: true, ativo: true },
    });
    if (existente) {
      throw new Conflito(
        existente.ativo
          ? 'Este colaborador ja faz parte da brigada.'
          : 'Este colaborador ja foi brigadista: reative o cadastro em vez de criar outro.',
        'BRIGADISTA_DUPLICADO',
      );
    }

    const brigadista = await prisma.$transaction(async (tx) => {
      const criado = await tx.brigadista.create({
        data: dados as Prisma.BrigadistaUncheckedCreateInput,
        include: INCLUDE_BRIGADISTA,
      });
      await registrarAuditoria(tx, {
        entidade: 'Brigadista',
        entidadeId: criado.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, criado as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });
      return criado;
    });

    return reply.status(201).send(serializarBrigadista(brigadista, new Date()));
  });

  app.put('/brigada/brigadistas/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = brigadistaUpdateSchema.parse(request.body);
    if (Object.keys(dados).length === 0) {
      throw new RequisicaoInvalida('Nenhum campo enviado para atualizacao.', 'PAYLOAD_VAZIO');
    }

    const atual = await obterBrigadistaOuFalhar(id);
    const clienteId = dados.clienteId ?? atual.clienteId;
    const colaboradorId = dados.colaboradorId ?? atual.colaboradorId;
    if (dados.colaboradorId || dados.clienteId) await validarColaboradorDoCliente(colaboradorId, clienteId);
    await validarAreaDoCliente(dados.areaId, clienteId);

    const brigadista = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.brigadista.update({
        where: { id },
        data: dados as Prisma.BrigadistaUncheckedUpdateInput,
        include: INCLUDE_BRIGADISTA,
      });
      const diferenca = calcularDiferenca(
        atual as unknown as Record<string, unknown>,
        atualizado as unknown as Record<string, unknown>,
      );
      if (Object.keys(diferenca).length > 0) {
        await registrarAuditoria(tx, {
          entidade: 'Brigadista',
          entidadeId: id,
          acao: 'ATUALIZACAO',
          alteracoes: diferenca,
          contexto: contextoDeAuditoria(request),
        });
      }
      return atualizado;
    });

    return serializarBrigadista(brigadista, new Date());
  });

  app.delete('/brigada/brigadistas/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await obterBrigadistaOuFalhar(id);

    await prisma.$transaction(async (tx) => {
      await tx.brigadista.delete({ where: { id } });
      await registrarAuditoria(tx, {
        entidade: 'Brigadista',
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: { colaborador: { de: atual.colaborador.nome, para: null } },
        contexto: contextoDeAuditoria(request),
      });
    });
    await removerArquivoPublico(atual.fotoUrl);
    await removerArquivoPublico(atual.certificadoUrl);

    return reply.status(204).send();
  });

  app.post('/brigada/brigadistas/:id/foto', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    await obterBrigadistaOuFalhar(id);
    const { buffer, mimetype } = await receberArquivo(request, MIMES_IMAGEM_ACEITOS);
    const url = await salvarImagem(buffer, mimetype, 'brigadista');
    return trocarAnexoBrigadista(request, id, 'fotoUrl', url);
  });

  app.post('/brigada/brigadistas/:id/certificado', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    await obterBrigadistaOuFalhar(id);
    const { buffer, mimetype } = await receberArquivo(request, MIMES_DOCUMENTO_ACEITOS);
    const url = await salvarDocumento(buffer, mimetype, 'brigada-certificado');
    return trocarAnexoBrigadista(request, id, 'certificadoUrl', url);
  });

  /* --------------------------------------------------------- extintores --- */

  app.get('/brigada/extintores', async (request) => {
    const filtro = extintorFiltroSchema.parse(request.query);
    const hoje = new Date();

    const itens = await prisma.extintor.findMany({
      where: {
        ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
        ...(filtro.areaId ? { areaId: filtro.areaId } : {}),
      },
      include: INCLUDE_EXTINTOR,
      orderBy: [{ numero: 'asc' }],
      take: 1000,
    });

    // O filtro de situacao usa a situacao EFETIVA (derivada das datas).
    return itens
      .map((e) => serializarExtintor(e, hoje))
      .filter((e) => !filtro.situacao || e.situacaoEfetiva === filtro.situacao);
  });

  app.post('/brigada/extintores', async (request, reply) => {
    const dados = extintorCreateSchema.parse(request.body);

    const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true } });
    if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');
    await validarAreaDoCliente(dados.areaId, dados.clienteId);

    const existente = await prisma.extintor.findUnique({
      where: { clienteId_numero: { clienteId: dados.clienteId, numero: dados.numero } },
      select: { id: true },
    });
    if (existente) throw new Conflito(`Ja existe um extintor com o numero ${dados.numero} neste cliente.`, 'EXTINTOR_DUPLICADO');

    const extintor = await prisma.$transaction(async (tx) => {
      const criado = await tx.extintor.create({
        data: dados as Prisma.ExtintorUncheckedCreateInput,
        include: INCLUDE_EXTINTOR,
      });
      await registrarAuditoria(tx, {
        entidade: 'Extintor',
        entidadeId: criado.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, criado as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });
      return criado;
    });

    return reply.status(201).send(serializarExtintor(extintor, new Date()));
  });

  app.put('/brigada/extintores/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = extintorUpdateSchema.parse(request.body);
    if (Object.keys(dados).length === 0) {
      throw new RequisicaoInvalida('Nenhum campo enviado para atualizacao.', 'PAYLOAD_VAZIO');
    }

    const atual = await obterExtintorOuFalhar(id);
    const clienteId = dados.clienteId ?? atual.clienteId;
    await validarAreaDoCliente(dados.areaId, clienteId);

    const numero = dados.numero ?? atual.numero;
    if (numero !== atual.numero || clienteId !== atual.clienteId) {
      const existente = await prisma.extintor.findUnique({
        where: { clienteId_numero: { clienteId, numero } },
        select: { id: true },
      });
      if (existente && existente.id !== id) {
        throw new Conflito(`Ja existe um extintor com o numero ${numero} neste cliente.`, 'EXTINTOR_DUPLICADO');
      }
    }

    const extintor = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.extintor.update({
        where: { id },
        data: dados as Prisma.ExtintorUncheckedUpdateInput,
        include: INCLUDE_EXTINTOR,
      });
      const diferenca = calcularDiferenca(
        atual as unknown as Record<string, unknown>,
        atualizado as unknown as Record<string, unknown>,
      );
      if (Object.keys(diferenca).length > 0) {
        await registrarAuditoria(tx, {
          entidade: 'Extintor',
          entidadeId: id,
          acao: 'ATUALIZACAO',
          alteracoes: diferenca,
          contexto: contextoDeAuditoria(request),
        });
      }
      return atualizado;
    });

    return serializarExtintor(extintor, new Date());
  });

  app.delete('/brigada/extintores/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await obterExtintorOuFalhar(id);

    await prisma.$transaction(async (tx) => {
      await tx.extintor.delete({ where: { id } });
      await registrarAuditoria(tx, {
        entidade: 'Extintor',
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: { numero: { de: atual.numero, para: null } },
        contexto: contextoDeAuditoria(request),
      });
    });

    return reply.status(204).send();
  });

  /** Inspecao mensal: grava a data e a situacao observada (e as observacoes, se vierem). */
  app.post('/brigada/extintores/:id/inspecao', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = inspecaoExtintorSchema.parse(request.body);
    const atual = await obterExtintorOuFalhar(id);

    const extintor = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.extintor.update({
        where: { id },
        data: {
          ultimaInspecao: dados.data,
          situacao: dados.situacao,
          ...(dados.observacoes !== undefined ? { observacoes: dados.observacoes } : {}),
        },
        include: INCLUDE_EXTINTOR,
      });
      await registrarAuditoria(tx, {
        entidade: 'Extintor',
        entidadeId: id,
        acao: 'ATUALIZACAO',
        alteracoes: calcularDiferenca(
          { ultimaInspecao: atual.ultimaInspecao, situacao: atual.situacao, observacoes: atual.observacoes },
          { ultimaInspecao: atualizado.ultimaInspecao, situacao: atualizado.situacao, observacoes: atualizado.observacoes },
        ),
        contexto: contextoDeAuditoria(request),
      });
      return atualizado;
    });

    return serializarExtintor(extintor, new Date());
  });
}
