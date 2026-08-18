import type { FastifyInstance } from 'fastify';
import type { Observacao } from '@prisma/client';
import { z } from 'zod';
import {
  DEFINICOES_TIPO_OBSERVACAO,
  TIPOS_OBSERVACAO,
  calcularEscalonamento,
  causaDesvioCreateSchema,
  classificarIir,
  definicaoDoTipo,
  formatarTelefone,
  indicadoresFiltroSchema,
  observacaoCreateSchema,
  observacaoFiltroSchema,
  observacaoUpdateSchema,
  type GrauRiscoOcorrencia,
  type TipoObservacao,
} from '@safetyguard/shared';
import {
  atualizarObservacao,
  comunicacaoDaObservacao,
  criarObservacao,
  definirArquivo,
  excluirObservacao,
  listarAuditoriaObservacao,
  listarCausas,
  listarObservacoes,
  obterObservacaoOuFalhar,
} from './observacao.service.js';
import { painelBbs, resumoObservacoes } from './indicadores.service.js';
import { prisma } from '../../db.js';
import { MIMES_IMAGEM_ACEITOS, removerArquivoPublico, salvarImagem } from '../../lib/arquivos.js';
import { NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';
import { uploadMaxBytes } from '../../env.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador de observacao invalido.') });

const MS_POR_HORA = 60 * 60 * 1000;

type ObservacaoComRelacoes = Observacao & {
  causa?: { descricao: string } | null;
};

/**
 * Acrescenta o que e derivado na leitura: rotulo e cor do tipo, faixa do IIR,
 * plano de comunicacao e situacao do escalonamento.
 */
function serializar(observacao: ObservacaoComRelacoes) {
  const definicao = definicaoDoTipo(observacao.tipo as TipoObservacao);
  const grauRisco = observacao.grauRisco as GrauRiscoOcorrencia | null;

  const comunicacao = comunicacaoDaObservacao({
    tipo: observacao.tipo as TipoObservacao,
    classificacaoBird: observacao.classificacaoBird,
    grauRisco,
    causa: observacao.causa,
  });

  const horasDesdeORegistro = (Date.now() - observacao.dataHora.getTime()) / MS_POR_HORA;
  const emAberto = observacao.situacao === 'REGISTRADA' || observacao.situacao === 'EM_TRATATIVA';

  const escalonamento =
    comunicacao && emAberto ? calcularEscalonamento(horasDesdeORegistro, comunicacao.prazoHoras) : null;

  return {
    ...observacao,
    latitude: observacao.latitude === null ? null : Number(observacao.latitude),
    longitude: observacao.longitude === null ? null : Number(observacao.longitude),
    rotulos: { tipo: definicao.rotulo, cor: definicao.cor, emoji: definicao.emoji },
    faixaIir: observacao.iir === null ? null : classificarIir(observacao.iir),
    /** Quem avisar, por qual canal e em que prazo — vem da matriz de comunicacao. */
    comunicacao,
    escalonamento,
    prazoVencido: emAberto && observacao.prazoLimite !== null && observacao.prazoLimite.getTime() < Date.now(),
    formatado: {
      coordenadas:
        observacao.latitude === null || observacao.longitude === null
          ? null
          : `${Number(observacao.latitude).toFixed(6)}, ${Number(observacao.longitude).toFixed(6)}`,
    },
  };
}

export async function rotasObservacoes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, {
    leitura: 'observacoes:ler',
    escrita: 'observacoes:escrever',
    excecoes: { '/api/v1/indicadores/bbs': 'indicadores:ler' },
  }));

  /* ---------------------------------------------------------- catalogo --- */

  app.get('/causas', async (request) => {
    const { tipo, incluirInativas } = z
      .object({
        tipo: z.enum(TIPOS_OBSERVACAO).optional(),
        incluirInativas: z.enum(['true', 'false']).default('false'),
      })
      .parse(request.query);

    return listarCausas(tipo, incluirInativas === 'true');
  });

  app.post('/causas', async (request, reply) => {
    const dados = causaDesvioCreateSchema.parse(request.body);

    const existente = await prisma.causaDesvio.findUnique({ where: { codigo: dados.codigo }, select: { id: true } });
    if (existente) {
      throw new RequisicaoInvalida(`O codigo ${dados.codigo} ja existe no catalogo.`, 'CAUSA_DUPLICADA', {
        campos: { codigo: ['Codigo ja utilizado.'] },
      });
    }

    return reply.status(201).send(await prisma.causaDesvio.create({ data: dados }));
  });

  /** Tipos de observacao com a regra de cada um — usado pelo formulario de campo. */
  app.get('/observacoes/tipos', async () =>
    DEFINICOES_TIPO_OBSERVACAO.map((definicao) => ({
      ...definicao,
      exigeFoto: definicao.tipo === 'CONDICAO_INSEGURA' || definicao.tipo === 'NAO_CONFORMIDADE',
      exigeCausa: definicao.abrePlanoDeAcao,
    })),
  );

  /* -------------------------------------------------------- indicadores --- */

  /**
   * Painel BBS: ICS, ICI, distribuicao, Pareto, tendencia, mapa de calor e
   * Piramide de Bird — tudo calculado a partir das observacoes reais.
   */
  app.get('/indicadores/bbs', async (request) => {
    const filtro = indicadoresFiltroSchema.parse(request.query);
    return painelBbs(filtro);
  });

  app.get('/observacoes/resumo', async (request) => {
    const filtro = indicadoresFiltroSchema.partial().parse(request.query);
    return resumoObservacoes(filtro);
  });

  /* --------------------------------------------------------- observacoes -- */

  app.get('/observacoes', async (request) => {
    const filtro = observacaoFiltroSchema.parse(request.query);
    const pagina = await listarObservacoes(filtro);
    return { ...pagina, itens: pagina.itens.map((item) => serializar(item as ObservacaoComRelacoes)) };
  });


  /**
   * Linha do tempo da ocorrencia (secao 32 do plano diretor): registro,
   * classificacao, comunicacao, plano, tratativa, evidencia e encerramento —
   * tudo derivado dos dados reais, nada digitado a mao.
   */
  app.get('/observacoes/:id/timeline', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const observacao = await prisma.observacao.findUnique({
      where: { id },
      include: {
        causa: { select: { descricao: true } },
        planosDeAcao: {
          orderBy: { criadoEm: 'asc' },
          select: {
            id: true,
            codigo: true,
            criadoEm: true,
            dataInicioTratativa: true,
            dataConclusao: true,
            evidenciaUrl: true,
            nivelEscalonamento: true,
            dataUltimoEscalonamento: true,
            status: true,
            responsavelNome: true,
          },
        },
      },
    });
    if (!observacao) throw new NaoEncontrado('Observacao nao encontrada.', 'OBSERVACAO_NAO_ENCONTRADA');

    const notificacoes = await prisma.notificacao.findMany({
      where: { observacaoId: id },
      orderBy: { criadoEm: 'asc' },
      select: { canal: true, destinatarios: true, criadoEm: true, nivelEscalonamento: true, prioridade: true },
    });

    interface EventoTimeline {
      quando: Date;
      titulo: string;
      detalhe: string;
      tipo: 'REGISTRO' | 'COMUNICACAO' | 'PLANO' | 'TRATATIVA' | 'EVIDENCIA' | 'ENCERRAMENTO' | 'ESCALONAMENTO';
    }
    const eventos: EventoTimeline[] = [];

    eventos.push({
      quando: observacao.dataHora,
      titulo: 'Registro de campo',
      detalhe: `${observacao.observador} registrou a ocorrencia${observacao.fotoUrl ? ' com foto' : ''}${observacao.grauRisco ? ` — grau ${observacao.grauRisco}` : ''}${observacao.causa ? ` · causa: ${observacao.causa.descricao}` : ''}.`,
      tipo: 'REGISTRO',
    });

    for (const notificacao of notificacoes) {
      const escalonada = notificacao.nivelEscalonamento > 0;
      eventos.push({
        quando: notificacao.criadoEm,
        titulo: escalonada ? `Escalonamento — ${notificacao.canal}` : `Comunicacao — ${notificacao.canal}`,
        detalhe: `Destinatarios: ${notificacao.destinatarios} · prioridade ${notificacao.prioridade}.`,
        tipo: escalonada ? 'ESCALONAMENTO' : 'COMUNICACAO',
      });
    }

    for (const plano of observacao.planosDeAcao) {
      eventos.push({
        quando: plano.criadoEm,
        titulo: `Plano de acao ${plano.codigo} aberto`,
        detalhe: `Responsavel: ${plano.responsavelNome}.`,
        tipo: 'PLANO',
      });
      if (plano.dataInicioTratativa) {
        eventos.push({
          quando: plano.dataInicioTratativa,
          titulo: 'Tratativa iniciada',
          detalhe: `${plano.codigo} entrou em andamento.`,
          tipo: 'TRATATIVA',
        });
      }
      if (plano.evidenciaUrl) {
        eventos.push({
          quando: plano.dataConclusao ?? plano.criadoEm,
          titulo: 'Evidencia anexada',
          detalhe: `Evidencia de correcao registrada no ${plano.codigo}.`,
          tipo: 'EVIDENCIA',
        });
      }
      if (plano.dataConclusao) {
        eventos.push({
          quando: plano.dataConclusao,
          titulo: `Plano ${plano.codigo} concluido`,
          detalhe: `Encerrado com status ${plano.status}.`,
          tipo: 'ENCERRAMENTO',
        });
      }
    }

    eventos.sort((a, b) => a.quando.getTime() - b.quando.getTime());
    return { observacaoId: id, eventos };
  });

  app.get('/observacoes/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return serializar((await obterObservacaoOuFalhar(id)) as ObservacaoComRelacoes);
  });

  app.post('/observacoes', async (request, reply) => {
    const dados = observacaoCreateSchema.parse(request.body);
    const observacao = await criarObservacao(dados, contextoDeAuditoria(request));
    return reply.status(201).send(serializar(observacao as ObservacaoComRelacoes));
  });

  app.put('/observacoes/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = observacaoUpdateSchema.parse(request.body);

    if (Object.keys(dados).length === 0) {
      throw new RequisicaoInvalida('Nenhum campo enviado para atualizacao.', 'PAYLOAD_VAZIO');
    }

    return serializar((await atualizarObservacao(id, dados, contextoDeAuditoria(request))) as ObservacaoComRelacoes);
  });

  app.delete('/observacoes/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await excluirObservacao(id, contextoDeAuditoria(request));
    return reply.status(204).send();
  });

  app.get('/observacoes/:id/auditoria', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const { limite } = z.object({ limite: z.coerce.number().int().min(1).max(200).default(50) }).parse(request.query);
    return listarAuditoriaObservacao(id, limite);
  });

  /* ------------------------------------------------------------ arquivos -- */

  for (const [rota, campo, prefixo] of [
    ['foto', 'fotoUrl', 'evidencia'],
    ['assinatura', 'assinaturaUrl', 'assinatura'],
  ] as const) {
    app.post(`/observacoes/:id/${rota}`, async (request) => {
      const { id } = paramsSchema.parse(request.params);
      const atual = await obterObservacaoOuFalhar(id);
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
      const url = await salvarImagem(conteudo, arquivo.mimetype, prefixo);
      const atualizada = await definirArquivo(id, campo, url, contextoDeAuditoria(request));

      await removerArquivoPublico(atual[campo]);

      return serializar(atualizada as ObservacaoComRelacoes);
    });
  }

  /** Utilitario para o front formatar telefones do plano de comunicacao. */
  app.get('/observacoes/:id/comunicacao', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const observacao = (await obterObservacaoOuFalhar(id)) as ObservacaoComRelacoes;
    const plano = comunicacaoDaObservacao({
      tipo: observacao.tipo as TipoObservacao,
      classificacaoBird: observacao.classificacaoBird,
      grauRisco: observacao.grauRisco as GrauRiscoOcorrencia | null,
      causa: observacao.causa,
    });

    if (!plano) {
      return { aplicavel: false, motivo: 'Este tipo de observacao nao dispara comunicacao automatica.' };
    }

    return {
      aplicavel: true,
      plano,
      prazoLimite: observacao.prazoLimite,
      telefoneMatriz: formatarTelefone(''),
    };
  });
}
