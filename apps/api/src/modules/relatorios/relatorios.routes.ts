import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  MODELOS_RELATORIO_PADRAO,
  listarMarcadores,
  modeloRelatorioCreateSchema,
  modeloRelatorioGerarSchema,
  modeloRelatorioPreencherSchema,
  modeloRelatorioRedigirSchema,
  modeloRelatorioUpdateSchema,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria } from '../../lib/auditoria.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';
import {
  gerarModeloAssistido,
  montarRelatorioFotografico,
  preencherModelo,
  redigirRelatorioAssistido,
} from './relatorios.service.js';

const ENTIDADE = 'ModeloRelatorio';
const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });

function inicioDoMes(agora: Date): Date {
  return new Date(agora.getFullYear(), agora.getMonth(), 1);
}

function fimDoMes(agora: Date): Date {
  return new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999);
}

function fimDoDia(data: Date): Date {
  const copia = new Date(data.getTime());
  copia.setHours(23, 59, 59, 999);
  return copia;
}

/**
 * "2026-10-31" vira meia-noite LOCAL (e nao UTC, como faria `new Date`), para
 * o filtro por dia nao perder as ultimas horas do periodo nem pegar as do dia
 * anterior.
 */
const dataDoFiltro = z.preprocess((valor) => {
  if (typeof valor !== 'string' || valor.trim() === '') return undefined;
  const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
  if (dia) return new Date(Number(dia[1]), Number(dia[2]) - 1, Number(dia[3]));
  return new Date(valor);
}, z.date({ errorMap: () => ({ message: 'Data invalida.' }) }).optional());

const fotograficoQuerySchema = z.object({
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente invalido.'),
  de: dataDoFiltro,
  ate: dataDoFiltro,
  areaId: z.string().uuid('Area invalida.').optional(),
  incluirPlanos: z
    .enum(['true', 'false'])
    .default('true')
    .transform((valor) => valor === 'true'),
  incluirChecklists: z
    .enum(['true', 'false'])
    .default('true')
    .transform((valor) => valor === 'true'),
});

/**
 * Usuario restrito a um cliente so pode preencher/redigir com o proprio
 * cliente: o guarda cobre a query, aqui cobrimos o corpo.
 */
function clienteDoCorpo(request: FastifyRequest, clienteId: string | null | undefined): string | null {
  const restrito = request.usuario?.clienteId;
  if (restrito) return restrito;
  return clienteId ?? null;
}

async function obterModelo(id: string) {
  const modelo = await prisma.modeloRelatorio.findUnique({ where: { id } });
  if (!modelo) throw new NaoEncontrado('Modelo de relatorio nao encontrado.', 'MODELO_RELATORIO_NAO_ENCONTRADO');
  return modelo;
}

/**
 * Etapa 24 — Relatorios: modelos de relatorio (com geracao assistida) e
 * relatorio fotografico.
 *
 * Leitura com `indicadores:ler` (quem le indicadores emite relatorios);
 * cadastro dos modelos com `cadastros:escrever`. Preencher e redigir sao POST
 * que nao gravam nada, por isso ficam na permissao de leitura.
 */
export async function registrarRotasRelatorios(app: FastifyInstance): Promise<void> {
  app.addHook(
    'preHandler',
    guardaPorMetodo(app, {
      leitura: 'indicadores:ler',
      escrita: 'cadastros:escrever',
      excecoes: {
        '/api/v1/relatorios/modelos/:id/preencher': 'indicadores:ler',
        '/api/v1/relatorios/modelos/:id/redigir': 'indicadores:ler',
      },
    }),
  );

  /* ------------------------------------------------------------- modelos --- */

  app.get('/relatorios/modelos', async (request) => {
    const { inativos } = z.object({ inativos: z.enum(['true', 'false']).optional() }).parse(request.query);
    const itens = await prisma.modeloRelatorio.findMany({
      where: inativos === 'true' ? {} : { ativo: true },
      orderBy: [{ categoria: 'asc' }, { titulo: 'asc' }],
    });
    return itens.map((modelo) => ({ ...modelo, marcadores: listarMarcadores(modelo.conteudo) }));
  });

  /** Cria os modelos padrao que ainda nao existem (pelo titulo). */
  app.post('/relatorios/modelos/padrao', async (request, reply) => {
    const existentes = await prisma.modeloRelatorio.findMany({ select: { titulo: true } });
    const titulos = new Set(existentes.map((modelo) => modelo.titulo.trim().toLowerCase()));
    const faltantes = MODELOS_RELATORIO_PADRAO.filter((modelo) => !titulos.has(modelo.titulo.trim().toLowerCase()));

    const criados = await prisma.$transaction(async (tx) => {
      const lista = [];
      for (const padrao of faltantes) {
        const criado = await tx.modeloRelatorio.create({ data: { ...padrao, ativo: true } });
        await registrarAuditoria(tx, {
          entidade: ENTIDADE,
          entidadeId: criado.id,
          acao: 'CRIACAO',
          alteracoes: calcularDiferenca({}, { titulo: criado.titulo, categoria: criado.categoria, origem: 'PADRAO' }),
          contexto: contextoDeAuditoria(request),
        });
        lista.push(criado);
      }
      return lista;
    });

    return reply.status(201).send({ criados: criados.length, jaExistiam: MODELOS_RELATORIO_PADRAO.length - criados.length, itens: criados });
  });

  /** Geracao assistida de um modelo novo — devolve texto para a tela, nao grava. */
  app.post('/relatorios/modelos/gerar', async (request) => {
    const dados = modeloRelatorioGerarSchema.parse(request.body);
    const resultado = await gerarModeloAssistido({ ...dados, clienteId: clienteDoCorpo(request, dados.clienteId) });
    return { conteudo: resultado.texto, origem: resultado.origem };
  });

  app.get('/relatorios/modelos/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const modelo = await obterModelo(id);
    return { ...modelo, marcadores: listarMarcadores(modelo.conteudo) };
  });

  app.post('/relatorios/modelos', async (request, reply) => {
    const dados = modeloRelatorioCreateSchema.parse(request.body);

    const modelo = await prisma.$transaction(async (tx) => {
      const criado = await tx.modeloRelatorio.create({ data: dados as Prisma.ModeloRelatorioUncheckedCreateInput });
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: criado.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, criado as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });
      return criado;
    });

    return reply.status(201).send(modelo);
  });

  app.put('/relatorios/modelos/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = modeloRelatorioUpdateSchema.parse(request.body);
    const atual = await obterModelo(id);

    return prisma.$transaction(async (tx) => {
      const modelo = await tx.modeloRelatorio.update({ where: { id }, data: dados as Prisma.ModeloRelatorioUncheckedUpdateInput });
      const diferenca = calcularDiferenca(atual as unknown as Record<string, unknown>, modelo as unknown as Record<string, unknown>);
      if (Object.keys(diferenca).length > 0) {
        await registrarAuditoria(tx, {
          entidade: ENTIDADE,
          entidadeId: id,
          acao: 'ATUALIZACAO',
          alteracoes: diferenca,
          contexto: contextoDeAuditoria(request),
        });
      }
      return modelo;
    });
  });

  app.delete('/relatorios/modelos/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const modelo = await obterModelo(id);

    await prisma.$transaction(async (tx) => {
      await tx.modeloRelatorio.delete({ where: { id } });
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: { titulo: { de: modelo.titulo, para: null } },
        contexto: contextoDeAuditoria(request),
      });
    });
    return reply.status(204).send();
  });

  /** Troca os marcadores do modelo pelos valores do cliente/periodo. Nao grava. */
  app.post('/relatorios/modelos/:id/preencher', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = modeloRelatorioPreencherSchema.parse(request.body);
    const modelo = await obterModelo(id);

    const resultado = await preencherModelo(modelo.conteudo, {
      clienteId: clienteDoCorpo(request, dados.clienteId),
      periodo: dados.periodo,
      responsavel: dados.responsavel,
      usuarioNome: request.usuario?.nome,
    });

    return {
      modeloId: modelo.id,
      titulo: modelo.titulo,
      conteudo: resultado.conteudo,
      valores: resultado.valores,
      pendentes: listarMarcadores(resultado.conteudo),
    };
  });

  /** Redacao assistida do relatorio final a partir do modelo preenchido. Nao grava. */
  app.post('/relatorios/modelos/:id/redigir', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = modeloRelatorioRedigirSchema.parse(request.body);
    const modelo = await obterModelo(id);

    const resultado = await redigirRelatorioAssistido(
      modelo,
      {
        clienteId: clienteDoCorpo(request, dados.clienteId),
        periodo: dados.periodo,
        responsavel: dados.responsavel,
        usuarioNome: request.usuario?.nome,
      },
      dados.instrucoes,
    );

    return { modeloId: modelo.id, titulo: modelo.titulo, conteudo: resultado.texto, origem: resultado.origem };
  });

  /* ------------------------------------------------- relatorio fotografico --- */

  app.get('/relatorios/fotografico', async (request) => {
    const consulta = fotograficoQuerySchema.parse(request.query);
    const agora = new Date();
    const de = consulta.de ?? inicioDoMes(agora);
    const ate = consulta.ate ? fimDoDia(consulta.ate) : fimDoMes(agora);
    if (de.getTime() > ate.getTime()) {
      throw new RequisicaoInvalida('A data inicial deve ser anterior a data final.', 'PERIODO_INVALIDO');
    }

    return montarRelatorioFotografico({
      clienteId: consulta.clienteId,
      de,
      ate,
      areaId: consulta.areaId,
      incluirPlanos: consulta.incluirPlanos,
      incluirChecklists: consulta.incluirChecklists,
    });
  });
}
