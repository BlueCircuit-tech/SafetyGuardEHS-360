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
import { montarPpp } from './ppp.service.js';
import { prisma } from '../../db.js';
import {
  ROTULO_TIPO_AFASTAMENTO,
  afastamentoCreateSchema,
  afastamentoUpdateSchema,
  calcularTaxaAbsenteismo,
  diasUteisEntre,
  type TipoAfastamento,
} from '@safetyguard/shared';
import { MIMES_DOCUMENTO_ACEITOS, removerArquivoPublico, salvarDocumento } from '../../lib/arquivos.js';
import { NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
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
        '/api/v1/absenteismo': 'indicadores:ler',
        '/api/v1/absenteismo/painel': 'indicadores:ler',
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

  /**
   * PPP consolidado: vinculo + funcao + riscos do inventario + ASO + EPI.
   * A resposta traz as `fontes` de cada bloco e as `pendencias` que impedem a
   * emissao — documento incompleto ainda serve para ver o que falta.
   */
  app.get('/colaboradores/:id/ppp', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return montarPpp(id);
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

  /* ============================================================ absenteismo */

  app.get('/absenteismo/painel', async (request) => {
    const { clienteId, meses } = z
      .object({ clienteId: z.string().uuid().optional(), meses: z.coerce.number().int().min(1).max(24).default(12) })
      .parse(request.query);

    const inicio = new Date();
    inicio.setMonth(inicio.getMonth() - meses);
    const agora = new Date();

    const where = { ...(clienteId ? { clienteId } : {}), dataInicio: { gte: inicio } };

    const [afastamentos, totalColaboradoresAtivos] = await Promise.all([
      prisma.afastamento.findMany({
        where,
        orderBy: { dataInicio: 'desc' },
        include: {
          colaborador: { select: { id: true, nome: true, funcao: true, areaId: true } },
          cliente: { select: { id: true, nomeFantasia: true } },
        },
      }),
      prisma.colaborador.count({ where: { situacao: 'ATIVO', ...(clienteId ? { clienteId } : {}) } }),
    ]);

    const diasPeriodo = diasUteisEntre(inicio, agora);
    const totalDias = afastamentos.reduce((acc, a) => acc + a.diasAfastamento, 0);
    const taxaAbsenteismo = calcularTaxaAbsenteismo(totalDias, totalColaboradoresAtivos, diasPeriodo);

    // Agrupa por tipo
    const porTipo = Object.fromEntries(
      (Object.keys(ROTULO_TIPO_AFASTAMENTO) as TipoAfastamento[]).map((tipo) => {
        const itens = afastamentos.filter((a) => a.tipo === tipo);
        return [tipo, { rotulo: ROTULO_TIPO_AFASTAMENTO[tipo], quantidade: itens.length, dias: itens.reduce((s, a) => s + a.diasAfastamento, 0) }];
      }),
    );

    // Top 5 colaboradores com mais dias no período
    const porColaborador = new Map<string, { nome: string; funcao: string; dias: number }>();
    for (const a of afastamentos) {
      const atual = porColaborador.get(a.colaboradorId) ?? { nome: a.colaborador.nome, funcao: a.colaborador.funcao, dias: 0 };
      porColaborador.set(a.colaboradorId, { ...atual, dias: atual.dias + a.diasAfastamento });
    }
    const topColaboradores = [...porColaborador.values()].sort((a, b) => b.dias - a.dias).slice(0, 5);

    return {
      periodo: { inicio, fim: agora, meses, diasUteis: diasPeriodo },
      totalAfastamentos: afastamentos.length,
      totalDias,
      taxaAbsenteismo,
      colaboradoresAtivos: totalColaboradoresAtivos,
      emAfastamento: afastamentos.filter((a) => !a.dataFim).length,
      porTipo,
      topColaboradores,
    };
  });

  app.get('/absenteismo', async (request) => {
    const { clienteId, colaboradorId, tipo, meses } = z
      .object({
        clienteId: z.string().uuid().optional(),
        colaboradorId: z.string().uuid().optional(),
        tipo: z.string().optional(),
        meses: z.coerce.number().int().min(1).max(60).optional(),
      })
      .parse(request.query);

    const inicio = meses ? (() => { const d = new Date(); d.setMonth(d.getMonth() - meses); return d; })() : undefined;

    const itens = await prisma.afastamento.findMany({
      where: {
        ...(clienteId ? { clienteId } : {}),
        ...(colaboradorId ? { colaboradorId } : {}),
        ...(tipo ? { tipo: tipo as TipoAfastamento } : {}),
        ...(inicio ? { dataInicio: { gte: inicio } } : {}),
      },
      orderBy: { dataInicio: 'desc' },
      take: 300,
      include: {
        colaborador: { select: { id: true, nome: true, funcao: true } },
        cliente: { select: { id: true, nomeFantasia: true } },
        acidente: { select: { id: true, tipo: true, data: true } },
      },
    });

    return itens.map((a) => ({ ...a, rotulos: { tipo: ROTULO_TIPO_AFASTAMENTO[a.tipo as TipoAfastamento] } }));
  });

  app.get('/absenteismo/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const a = await prisma.afastamento.findUnique({
      where: { id },
      include: {
        colaborador: { select: { id: true, nome: true, funcao: true } },
        cliente: { select: { id: true, nomeFantasia: true } },
        acidente: { select: { id: true, tipo: true, data: true } },
      },
    });
    if (!a) throw new NaoEncontrado('Afastamento nao encontrado.', 'AFASTAMENTO_NAO_ENCONTRADO');
    return { ...a, rotulos: { tipo: ROTULO_TIPO_AFASTAMENTO[a.tipo as TipoAfastamento] } };
  });

  app.post('/absenteismo', async (request, reply) => {
    const dados = afastamentoCreateSchema.parse(request.body);
    const novo = await prisma.afastamento.create({ data: dados as unknown as Parameters<typeof prisma.afastamento.create>[0]['data'] });
    return reply.status(201).send({ ...novo, rotulos: { tipo: ROTULO_TIPO_AFASTAMENTO[novo.tipo as TipoAfastamento] } });
  });

  app.put('/absenteismo/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = afastamentoUpdateSchema.parse(request.body);
    const atual = await prisma.afastamento.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado('Afastamento nao encontrado.', 'AFASTAMENTO_NAO_ENCONTRADO');
    const atualizado = await prisma.afastamento.update({ where: { id }, data: dados as unknown as Parameters<typeof prisma.afastamento.update>[0]['data'] });
    return { ...atualizado, rotulos: { tipo: ROTULO_TIPO_AFASTAMENTO[atualizado.tipo as TipoAfastamento] } };
  });

  app.delete('/absenteismo/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await prisma.afastamento.findUnique({ where: { id }, select: { id: true } });
    if (!atual) throw new NaoEncontrado('Afastamento nao encontrado.', 'AFASTAMENTO_NAO_ENCONTRADO');
    await prisma.afastamento.delete({ where: { id } });
    return reply.status(204).send();
  });

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
