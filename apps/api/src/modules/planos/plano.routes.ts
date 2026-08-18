import type { FastifyInstance } from 'fastify';
import type { PlanoAcao } from '@prisma/client';
import { z } from 'zod';
import {
  ESCALONAMENTO,
  ROTULO_CRITICIDADE_PLANO,
  ROTULO_HIERARQUIA,
  ROTULO_ORIGEM_PLANO,
  ROTULO_STATUS_PLANO,
  calcularEscalonamento,
  estaEmAberto,
  notificacaoFiltroSchema,
  planoAcaoCreateSchema,
  planoAcaoFiltroSchema,
  planoAcaoUpdateSchema,
  type CriticidadePlano,
  type OrigemPlano,
  type StatusPlano,
} from '@safetyguard/shared';
import {
  abrirPlanoDaObservacao,
  atualizarPlano,
  criarPlano,
  definirEvidencia,
  excluirPlano,
  listarAuditoriaPlano,
  listarPlanos,
  obterPlanoOuFalhar,
  planosPorCriticidade,
  processarEscalonamentos,
  resumoPlanos,
} from './plano.service.js';
import { listarNotificacoes, resumoNotificacoes } from './notificacao.service.js';
import { MIMES_IMAGEM_ACEITOS, removerArquivoPublico, salvarImagem } from '../../lib/arquivos.js';
import { RequisicaoInvalida } from '../../lib/erros.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';
import { uploadMaxBytes } from '../../env.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador de plano invalido.') });

const MS_POR_HORA = 60 * 60 * 1000;
const MS_POR_DIA = 24 * MS_POR_HORA;

/** Acrescenta prazo, atraso e degrau de escalonamento — tudo derivado na leitura. */
function serializar(plano: PlanoAcao) {
  const agora = Date.now();
  const emAberto = estaEmAberto(plano.status as StatusPlano);

  const diasParaPrazo = Math.ceil((plano.prazo.getTime() - agora) / MS_POR_DIA);
  const atrasado = emAberto && plano.prazo.getTime() < agora;

  const horasDesdeORegistro = (agora - plano.criadoEm.getTime()) / MS_POR_HORA;
  const prazoHoras = Math.max(0, (plano.prazo.getTime() - plano.criadoEm.getTime()) / MS_POR_HORA);
  const situacao = emAberto ? calcularEscalonamento(horasDesdeORegistro, prazoHoras) : null;

  const degrauRegistrado = ESCALONAMENTO[plano.nivelEscalonamento];

  return {
    ...plano,
    rotulos: {
      status: ROTULO_STATUS_PLANO[plano.status as StatusPlano],
      criticidade: ROTULO_CRITICIDADE_PLANO[plano.criticidade as CriticidadePlano],
      origem: ROTULO_ORIGEM_PLANO[plano.origem as OrigemPlano],
    },
    diasParaPrazo,
    atrasado,
    /** Nivel ja acionado pelo escalonamento. */
    nivelAtual: degrauRegistrado ? ROTULO_HIERARQUIA[degrauRegistrado.nivel] : ROTULO_HIERARQUIA.SUPERVISOR,
    /** Nivel que o escalonamento acionaria agora, se rodasse. */
    nivelDevido: situacao ? situacao.rotuloNivel : null,
    escalonamentoPendente: Boolean(situacao && situacao.degrau > plano.nivelEscalonamento),
    tempoFechamentoDias:
      plano.dataConclusao === null
        ? null
        : Math.round(((plano.dataConclusao.getTime() - plano.criadoEm.getTime()) / MS_POR_DIA) * 10) / 10,
    concluidoNoPrazo:
      plano.dataConclusao === null ? null : plano.dataConclusao.getTime() <= plano.prazo.getTime(),
  };
}

export async function rotasPlanos(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, {
    leitura: 'planos:ler',
    escrita: 'planos:escrever',
    excecoes: {
      '/api/v1/planos-acao/escalonar': 'planos:escalonar',
      '/api/v1/notificacoes': 'planos:ler',
      '/api/v1/notificacoes/resumo': 'planos:ler',
    },
  }));

  /* ------------------------------------------------------------ painel --- */

  app.get('/planos-acao/resumo', async (request) => {
    const filtro = planoAcaoFiltroSchema.partial().parse(request.query);
    return resumoPlanos(filtro);
  });

  app.get('/planos-acao/por-criticidade', async (request) => {
    const filtro = planoAcaoFiltroSchema.partial().parse(request.query);
    return planosPorCriticidade(filtro);
  });

  /* ---------------------------------------------------------- listagem --- */

  app.get('/planos-acao', async (request) => {
    const filtro = planoAcaoFiltroSchema.parse(request.query);
    const pagina = await listarPlanos(filtro);
    return { ...pagina, itens: pagina.itens.map(serializar) };
  });

  app.get('/planos-acao/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return serializar(await obterPlanoOuFalhar(id));
  });

  app.post('/planos-acao', async (request, reply) => {
    const dados = planoAcaoCreateSchema.parse(request.body);
    const plano = await criarPlano(dados, contextoDeAuditoria(request));
    return reply.status(201).send(serializar(plano));
  });

  /**
   * Abre o plano a partir de uma observacao, com prazo, criticidade e
   * destinatarios vindos da matriz de comunicacao.
   */
  app.post('/observacoes/:id/plano-acao', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid('Observacao invalida.') }).parse(request.params);
    const plano = await abrirPlanoDaObservacao(id, contextoDeAuditoria(request));
    return reply.status(201).send(serializar(plano));
  });

  app.put('/planos-acao/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = planoAcaoUpdateSchema.parse(request.body);

    if (Object.keys(dados).length === 0) {
      throw new RequisicaoInvalida('Nenhum campo enviado para atualizacao.', 'PAYLOAD_VAZIO');
    }

    return serializar(await atualizarPlano(id, dados, contextoDeAuditoria(request)));
  });

  app.delete('/planos-acao/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await excluirPlano(id, contextoDeAuditoria(request));
    return reply.status(204).send();
  });

  app.get('/planos-acao/:id/auditoria', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const { limite } = z.object({ limite: z.coerce.number().int().min(1).max(200).default(50) }).parse(request.query);
    return listarAuditoriaPlano(id, limite);
  });

  app.post('/planos-acao/:id/evidencia', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await obterPlanoOuFalhar(id);
    const arquivo = await request.file({ limits: { fileSize: uploadMaxBytes } });

    if (!arquivo) {
      throw new RequisicaoInvalida('Envie o arquivo no campo "arquivo" (multipart/form-data).', 'ARQUIVO_AUSENTE');
    }
    if (!MIMES_IMAGEM_ACEITOS.includes(arquivo.mimetype)) {
      throw new RequisicaoInvalida(
        `Formato ${arquivo.mimetype} nao suportado. Envie PNG, JPG, WEBP ou SVG.`,
        'FORMATO_NAO_SUPORTADO',
      );
    }

    const conteudo = await arquivo.toBuffer();
    const url = await salvarImagem(conteudo, arquivo.mimetype, 'evidencia-plano');
    const atualizado = await definirEvidencia(id, url, contextoDeAuditoria(request));

    await removerArquivoPublico(atual.evidenciaUrl);

    return serializar(atualizado);
  });

  /* ----------------------------------------------------- escalonamento --- */

  /**
   * Roda o escalonamento agora. Idempotente — pensado para um agendador; hoje
   * e acionado sob demanda pela interface.
   */
  app.post('/planos-acao/escalonar', async (request) => {
    return processarEscalonamentos(contextoDeAuditoria(request));
  });

  app.get('/planos-acao/escalonamento/niveis', async () =>
    ESCALONAMENTO.map((degrau, indice) => ({
      degrau: indice,
      aposHoras: degrau.aposHoras,
      nivel: degrau.nivel,
      rotulo: degrau.rotulo,
      rotuloNivel: ROTULO_HIERARQUIA[degrau.nivel],
    })),
  );

  /* ------------------------------------------------------ notificacoes --- */

  app.get('/notificacoes', async (request) => {
    const filtro = notificacaoFiltroSchema.parse(request.query);
    return listarNotificacoes(filtro);
  });

  app.get('/notificacoes/resumo', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    return resumoNotificacoes(clienteId);
  });
}
