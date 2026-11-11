import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  ROTULO_MOTIVO_ENTREGA,
  ROTULO_TIPO_ANEXO_EPI,
  anexoEpiCreateSchema,
  diasAteVencer,
  entradaEpiCreateSchema,
  entregaEpiCreateSchema,
  epiCreateSchema,
  epiUpdateSchema,
  formatarCpf,
  montarCabecalhoInstitucional,
  pontoDeReposicao,
  situacaoDaValidade,
  urlConsultaCa,
  type MotivoEntregaEpi,
  type TipoAnexoEpi,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { Conflito, NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria } from '../../lib/auditoria.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';
import { MIMES_DOCUMENTO_ACEITOS, MIMES_IMAGEM_ACEITOS, removerArquivoPublico, salvarDocumento, salvarImagem } from '../../lib/arquivos.js';
import { carimbar } from '../../lib/assinatura.js';
import { uploadMaxBytes } from '../../env.js';
import { obterEmpresaOuFalhar } from '../empresa/empresa.service.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });
const MS_POR_DIA = 24 * 60 * 60 * 1000;

async function receberArquivo(request: FastifyRequest, aceitos: readonly string[]): Promise<{ buffer: Buffer; mimetype: string }> {
  const arquivo = await request.file({ limits: { fileSize: uploadMaxBytes } });
  if (!arquivo) throw new RequisicaoInvalida('Envie o arquivo no campo "arquivo" (multipart/form-data).', 'ARQUIVO_AUSENTE');
  if (!aceitos.includes(arquivo.mimetype)) {
    throw new RequisicaoInvalida(`Formato ${arquivo.mimetype} nao suportado.`, 'FORMATO_NAO_SUPORTADO');
  }
  return { buffer: await arquivo.toBuffer(), mimetype: arquivo.mimetype };
}

/** Proxima troca prevista: data da entrega + vida util do EPI (meses). */
function validadeDaTroca(data: Date, vidaUtilMeses: number | null): Date | null {
  if (!vidaUtilMeses) return null;
  const validade = new Date(data);
  validade.setMonth(validade.getMonth() + vidaUtilMeses);
  return validade;
}

function serializarEpi<T extends { validadeCa: Date | null; estoqueAtual: number; estoqueMinimo: number; estoqueReferencia: number | null; custoUnitario: Prisma.Decimal | null; ca: string }>(epi: T, hoje: Date) {
  const reposicao = pontoDeReposicao(epi);
  const custo = epi.custoUnitario === null ? null : Number(epi.custoUnitario);
  return {
    ...epi,
    custoUnitario: custo,
    situacaoCa: situacaoDaValidade(epi.validadeCa, hoje),
    diasParaVencerCa: diasAteVencer(epi.validadeCa, hoje),
    pontoReposicao: reposicao,
    abaixoDoMinimo: reposicao > 0 && epi.estoqueAtual <= reposicao,
    valorEmEstoque: custo === null ? null : Math.round(custo * epi.estoqueAtual * 100) / 100,
    urlConsultaCa: urlConsultaCa(epi.ca),
  };
}

/**
 * Etapa 14 — Gestao de EPI e Estoque.
 *
 * A entrega da baixa no estoque na mesma transacao — nunca ha ficha sem baixa
 * nem baixa sem ficha. Estoque zerado bloqueia a entrega, em vez de deixar o
 * saldo negativo esconder a falta.
 */
export async function registrarRotasEpi(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'cadastros:ler', escrita: 'cadastros:escrever' }));

  /* ------------------------------------------------------------ catalogo --- */

  app.get('/epis', async (request) => {
    const { busca, categoria, inativos } = z
      .object({ busca: z.string().trim().max(120).optional(), categoria: z.string().trim().max(60).optional(), inativos: z.enum(['true', 'false']).default('false') })
      .parse(request.query);
    const hoje = new Date();
    const itens = await prisma.epi.findMany({
      where: {
        ...(inativos === 'true' ? {} : { ativo: true }),
        ...(categoria ? { categoria } : {}),
        ...(busca
          ? { OR: [{ nome: { contains: busca, mode: 'insensitive' } }, { ca: { contains: busca, mode: 'insensitive' } }, { fornecedor: { contains: busca, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: { nome: 'asc' },
      include: { _count: { select: { entregas: true, anexos: true } } },
    });

    return itens.map((epi) => serializarEpi(epi, hoje));
  });

  app.get('/epis/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const epi = await prisma.epi.findUnique({
      where: { id },
      include: {
        anexos: { orderBy: { criadoEm: 'desc' } },
        entradas: { orderBy: { data: 'desc' }, take: 50 },
        _count: { select: { entregas: true } },
      },
    });
    if (!epi) throw new NaoEncontrado('EPI nao encontrado.', 'EPI_NAO_ENCONTRADO');
    return {
      ...serializarEpi(epi, new Date()),
      anexos: epi.anexos.map((a) => ({ ...a, rotuloTipo: ROTULO_TIPO_ANEXO_EPI[a.tipo as TipoAnexoEpi] ?? a.tipo })),
      entradas: epi.entradas.map((e) => ({ ...e, custoUnitario: e.custoUnitario === null ? null : Number(e.custoUnitario) })),
    };
  });

  /* ------------------------------------------------------------- anexos --- */

  /** Laudo, CA, ficha tecnica, nota fiscal: metadados na querystring, arquivo no multipart. */
  app.post('/epis/:id/anexos', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const epi = await prisma.epi.findUnique({ where: { id }, select: { id: true } });
    if (!epi) throw new NaoEncontrado('EPI nao encontrado.', 'EPI_NAO_ENCONTRADO');
    const meta = anexoEpiCreateSchema.parse(request.query);
    const { buffer, mimetype } = await receberArquivo(request, MIMES_DOCUMENTO_ACEITOS);
    const url = await salvarDocumento(buffer, mimetype, 'epi-anexo');
    const anexo = await prisma.anexoEpi.create({ data: { epiId: id, titulo: meta.titulo, tipo: meta.tipo, url } });
    return reply.status(201).send({ ...anexo, rotuloTipo: ROTULO_TIPO_ANEXO_EPI[anexo.tipo as TipoAnexoEpi] });
  });

  app.delete('/epis/anexos/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const anexo = await prisma.anexoEpi.findUnique({ where: { id } });
    if (!anexo) throw new NaoEncontrado('Anexo nao encontrado.', 'ANEXO_NAO_ENCONTRADO');
    await prisma.anexoEpi.delete({ where: { id } });
    await removerArquivoPublico(anexo.url);
    return reply.status(204).send();
  });

  /* ----------------------------------------------------------- entradas --- */

  /** Entrada de estoque (compra): soma ao estoque e guarda custo e nota fiscal. */
  app.post('/epis/entradas', async (request, reply) => {
    const dados = entradaEpiCreateSchema.parse(request.body);
    const epi = await prisma.epi.findUnique({ where: { id: dados.epiId }, select: { id: true } });
    if (!epi) throw new NaoEncontrado('EPI nao encontrado.', 'EPI_NAO_ENCONTRADO');

    const entrada = await prisma.$transaction(async (tx) => {
      const criada = await tx.entradaEpi.create({ data: dados as Prisma.EntradaEpiUncheckedCreateInput });
      await tx.epi.update({
        where: { id: dados.epiId },
        data: {
          estoqueAtual: { increment: dados.quantidade },
          ...(dados.custoUnitario !== null && dados.custoUnitario !== undefined ? { custoUnitario: dados.custoUnitario } : {}),
          ...(dados.fornecedor ? { fornecedor: dados.fornecedor } : {}),
        },
      });
      await registrarAuditoria(tx, {
        entidade: 'EntradaEpi',
        entidadeId: criada.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, criada as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });
      return criada;
    });
    return reply.status(201).send({ ...entrada, custoUnitario: entrada.custoUnitario === null ? null : Number(entrada.custoUnitario) });
  });

  app.get('/epis/entradas', async (request) => {
    const { epiId } = z.object({ epiId: z.string().uuid().optional() }).parse(request.query);
    const itens = await prisma.entradaEpi.findMany({
      where: epiId ? { epiId } : {},
      orderBy: { data: 'desc' },
      take: 200,
      include: { epi: { select: { id: true, nome: true, ca: true } } },
    });
    return itens.map((e) => ({ ...e, custoUnitario: e.custoUnitario === null ? null : Number(e.custoUnitario) }));
  });

  /* ------------------------------------------------------------ consumo --- */

  /** Dashboard de consumo e estoque em 3/6/9/12 meses, com destaque de maior consumo. */
  app.get('/epis/consumo', async (request) => {
    const { meses, clienteId } = z
      .object({ meses: z.coerce.number().int().refine((m) => [3, 6, 9, 12].includes(m), 'Use 3, 6, 9 ou 12 meses.').default(6), clienteId: z.string().uuid().optional() })
      .parse(request.query);
    const inicio = new Date();
    inicio.setMonth(inicio.getMonth() - meses);
    inicio.setDate(1);
    inicio.setHours(0, 0, 0, 0);

    const [entregas, entradas, epis] = await Promise.all([
      prisma.entregaEpi.findMany({
        where: { data: { gte: inicio }, ...(clienteId ? { colaborador: { clienteId } } : {}) },
        select: { data: true, quantidade: true, motivo: true, epiId: true, epi: { select: { nome: true, ca: true, custoUnitario: true } } },
      }),
      prisma.entradaEpi.findMany({ where: { data: { gte: inicio } }, select: { data: true, quantidade: true, epiId: true, custoUnitario: true } }),
      prisma.epi.findMany({ where: { ativo: true }, select: { id: true, nome: true, ca: true, estoqueAtual: true, estoqueMinimo: true, estoqueReferencia: true, custoUnitario: true } }),
    ]);

    const porMes = new Map<string, { mes: string; entregues: number; entradas: number; custoEntregue: number }>();
    const porEpi = new Map<string, { epiId: string; nome: string; ca: string; entregues: number; custo: number; porMotivo: Record<string, number> }>();
    for (const e of entregas) {
      const mes = e.data.toISOString().slice(0, 7);
      const m = porMes.get(mes) ?? { mes, entregues: 0, entradas: 0, custoEntregue: 0 };
      const custo = e.epi.custoUnitario === null ? 0 : Number(e.epi.custoUnitario) * e.quantidade;
      m.entregues += e.quantidade;
      m.custoEntregue += custo;
      porMes.set(mes, m);
      const item = porEpi.get(e.epiId) ?? { epiId: e.epiId, nome: e.epi.nome, ca: e.epi.ca, entregues: 0, custo: 0, porMotivo: {} };
      item.entregues += e.quantidade;
      item.custo += custo;
      item.porMotivo[e.motivo] = (item.porMotivo[e.motivo] ?? 0) + e.quantidade;
      porEpi.set(e.epiId, item);
    }
    for (const e of entradas) {
      const mes = e.data.toISOString().slice(0, 7);
      const m = porMes.get(mes) ?? { mes, entregues: 0, entradas: 0, custoEntregue: 0 };
      m.entradas += e.quantidade;
      porMes.set(mes, m);
    }

    const ranking = [...porEpi.values()].sort((a, b) => b.entregues - a.entregues);
    const totalEntregue = ranking.reduce((soma, r) => soma + r.entregues, 0);

    return {
      periodo: { meses, inicio },
      totalEntregue,
      custoTotal: Math.round(ranking.reduce((soma, r) => soma + r.custo, 0) * 100) / 100,
      porMes: [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes)).map((m) => ({ ...m, custoEntregue: Math.round(m.custoEntregue * 100) / 100 })),
      ranking: ranking.map((r, indice) => ({
        ...r,
        custo: Math.round(r.custo * 100) / 100,
        percentual: totalEntregue > 0 ? Math.round((r.entregues / totalEntregue) * 100) : 0,
        destaque: indice < 3,
        /** Consumo medio mensal e meses de cobertura do estoque atual. */
        mediaMensal: Math.round((r.entregues / meses) * 10) / 10,
        cobertura: (() => {
          const epi = epis.find((x) => x.id === r.epiId);
          const media = r.entregues / meses;
          return epi && media > 0 ? Math.round((epi.estoqueAtual / media) * 10) / 10 : null;
        })(),
      })),
      estoque: epis.map((epi) => ({
        id: epi.id,
        nome: epi.nome,
        ca: epi.ca,
        estoqueAtual: epi.estoqueAtual,
        pontoReposicao: pontoDeReposicao(epi),
        valorEmEstoque: epi.custoUnitario === null ? null : Math.round(Number(epi.custoUnitario) * epi.estoqueAtual * 100) / 100,
      })),
    };
  });

  /* ------------------------------------------------- trocas e vencimentos --- */

  /** Entregas cuja vida util venceu ou vence em 30 dias: EPI a trocar. */
  app.get('/epis/trocas', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    const hoje = new Date();
    const limite = new Date(hoje.getTime() + 30 * MS_POR_DIA);
    const entregas = await prisma.entregaEpi.findMany({
      where: { validadeTroca: { lte: limite }, ...(clienteId ? { colaborador: { clienteId } } : {}) },
      orderBy: { validadeTroca: 'asc' },
      take: 300,
      include: { epi: { select: { id: true, nome: true, ca: true } }, colaborador: { select: { id: true, nome: true, funcao: true } } },
    });
    // So a ultima entrega de cada par colaborador x EPI conta — a troca ja feita nao vence.
    const vistos = new Set<string>();
    const itens: typeof entregas = [];
    const todas = await prisma.entregaEpi.findMany({
      where: { ...(clienteId ? { colaborador: { clienteId } } : {}) },
      orderBy: { data: 'desc' },
      select: { id: true, epiId: true, colaboradorId: true },
    });
    const ultimaPorPar = new Map<string, string>();
    for (const e of todas) {
      const chave = `${e.colaboradorId}|${e.epiId}`;
      if (!ultimaPorPar.has(chave)) ultimaPorPar.set(chave, e.id);
    }
    for (const e of entregas) {
      const chave = `${e.colaboradorId}|${e.epiId}`;
      if (ultimaPorPar.get(chave) !== e.id || vistos.has(chave)) continue;
      vistos.add(chave);
      itens.push(e);
    }
    return itens.map((e) => ({
      ...e,
      diasParaTroca: e.validadeTroca ? Math.ceil((e.validadeTroca.getTime() - hoje.getTime()) / MS_POR_DIA) : null,
      vencida: Boolean(e.validadeTroca && e.validadeTroca < hoje),
    }));
  });

  /* --------------------------------------------- ficha de EPI (NR-06) --- */

  /** Ficha de EPI do colaborador: cabecalho institucional + todas as entregas, pronta para imprimir. */
  app.get('/epis/ficha/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const [empresa, colaborador] = await Promise.all([
      obterEmpresaOuFalhar(),
      prisma.colaborador.findUnique({
        where: { id },
        include: {
          cliente: { select: { nomeFantasia: true, razaoSocial: true, cnpj: true, logoUrl: true } },
          terceiro: { select: { nomeFantasia: true } },
          entregasEpi: { orderBy: { data: 'asc' }, include: { epi: { select: { nome: true, ca: true, validadeCa: true } } } },
        },
      }),
    ]);
    if (!colaborador) throw new NaoEncontrado('Colaborador nao encontrado.', 'COLABORADOR_NAO_ENCONTRADO');
    const hoje = new Date();
    return {
      geradoEm: hoje,
      cabecalho: montarCabecalhoInstitucional(empresa),
      empregador: colaborador.cliente,
      terceiro: colaborador.terceiro,
      trabalhador: {
        id: colaborador.id,
        nome: colaborador.nome,
        cpfFormatado: formatarCpf(colaborador.cpf),
        matricula: colaborador.matricula,
        funcao: colaborador.funcao,
        setor: colaborador.setor,
        dataAdmissao: colaborador.dataAdmissao,
        fotoUrl: colaborador.fotoUrl,
      },
      entregas: colaborador.entregasEpi.map((e) => ({
        id: e.id,
        data: e.data,
        epi: e.epi.nome,
        ca: e.epi.ca,
        validadeCa: e.epi.validadeCa,
        quantidade: e.quantidade,
        motivo: ROTULO_MOTIVO_ENTREGA[e.motivo as MotivoEntregaEpi],
        validadeTroca: e.validadeTroca,
        assinaturaUrl: e.assinaturaUrl,
        assinaturaEm: e.assinaturaEm,
        assinaturaHash: e.assinaturaHash,
      })),
      termo:
        'Declaro que recebi os EPIs acima relacionados, gratuitamente, em perfeito estado de conservacao e funcionamento, e que fui orientado(a) quanto ao uso, guarda e conservacao, comprometendo-me a usa-los apenas para a finalidade a que se destinam, a responsabilizar-me pela guarda e conservacao, a comunicar qualquer alteracao que os torne improprios para uso e a cumprir as determinacoes do empregador sobre o uso adequado (NR-6, item 6.7.1).',
    };
  });

  app.get('/epis/resumo', async () => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const alerta = new Date(hoje.getTime());
    alerta.setDate(alerta.getDate() + 30);

    const inicio30 = new Date(hoje.getTime());
    inicio30.setDate(inicio30.getDate() - 30);

    const [ativos, caVencidos, caAVencer, entregas30, todos] = await prisma.$transaction([
      prisma.epi.count({ where: { ativo: true } }),
      prisma.epi.count({ where: { ativo: true, validadeCa: { lt: hoje } } }),
      prisma.epi.count({ where: { ativo: true, validadeCa: { gte: hoje, lte: alerta } } }),
      prisma.entregaEpi.aggregate({ where: { data: { gte: inicio30 } }, _sum: { quantidade: true } }),
      prisma.epi.findMany({ where: { ativo: true }, select: { estoqueAtual: true, estoqueMinimo: true, estoqueReferencia: true, custoUnitario: true } }),
    ]);

    const trocasVencidas = await prisma.entregaEpi.count({ where: { validadeTroca: { lt: hoje } } });

    return {
      ativos,
      caVencidos,
      caAVencer,
      abaixoDoMinimo: todos.filter((epi) => {
        const ponto = pontoDeReposicao(epi);
        return ponto > 0 && epi.estoqueAtual <= ponto;
      }).length,
      entregues30Dias: entregas30._sum.quantidade ?? 0,
      trocasVencidas,
      valorEmEstoque: Math.round(todos.reduce((soma, epi) => soma + (epi.custoUnitario === null ? 0 : Number(epi.custoUnitario) * epi.estoqueAtual), 0) * 100) / 100,
    };
  });

  app.post('/epis', async (request, reply) => {
    const dados = epiCreateSchema.parse(request.body);

    const existente = await prisma.epi.findUnique({
      where: { nome_ca: { nome: dados.nome, ca: dados.ca } },
      select: { id: true },
    });
    if (existente) throw new Conflito('Este EPI com este CA ja esta cadastrado.', 'EPI_DUPLICADO');

    const epi = await prisma.$transaction(async (tx) => {
      const criado = await tx.epi.create({ data: dados as Prisma.EpiUncheckedCreateInput });
      await registrarAuditoria(tx, {
        entidade: 'Epi',
        entidadeId: criado.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, criado as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });
      return criado;
    });

    return reply.status(201).send(epi);
  });

  app.put('/epis/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = epiUpdateSchema.parse(request.body);

    const atual = await prisma.epi.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado('EPI nao encontrado.', 'EPI_NAO_ENCONTRADO');

    return prisma.$transaction(async (tx) => {
      const epi = await tx.epi.update({ where: { id }, data: dados as Prisma.EpiUncheckedUpdateInput });
      const diferenca = calcularDiferenca(
        atual as unknown as Record<string, unknown>,
        epi as unknown as Record<string, unknown>,
      );
      if (Object.keys(diferenca).length > 0) {
        await registrarAuditoria(tx, {
          entidade: 'Epi',
          entidadeId: id,
          acao: 'ATUALIZACAO',
          alteracoes: diferenca,
          contexto: contextoDeAuditoria(request),
        });
      }
      return epi;
    });
  });

  /* ------------------------------------------------------------ entregas --- */

  app.get('/epis/entregas', async (request) => {
    const { colaboradorId, epiId } = z
      .object({ colaboradorId: z.string().uuid().optional(), epiId: z.string().uuid().optional() })
      .parse(request.query);

    const itens = await prisma.entregaEpi.findMany({
      where: { ...(colaboradorId ? { colaboradorId } : {}), ...(epiId ? { epiId } : {}) },
      orderBy: { data: 'desc' },
      take: 200,
      include: {
        epi: { select: { id: true, nome: true, ca: true } },
        colaborador: { select: { id: true, nome: true, funcao: true, clienteId: true } },
      },
    });

    return itens.map((entrega) => ({
      ...entrega,
      rotuloMotivo: ROTULO_MOTIVO_ENTREGA[entrega.motivo as MotivoEntregaEpi],
    }));
  });

  app.post('/epis/entregas', async (request, reply) => {
    const dados = entregaEpiCreateSchema.parse(request.body);

    const [epi, colaborador] = await Promise.all([
      prisma.epi.findUnique({ where: { id: dados.epiId }, select: { id: true, estoqueAtual: true, ativo: true, vidaUtilMeses: true } }),
      prisma.colaborador.findUnique({ where: { id: dados.colaboradorId }, select: { id: true } }),
    ]);
    if (!epi) throw new NaoEncontrado('EPI nao encontrado.', 'EPI_NAO_ENCONTRADO');
    if (!colaborador) throw new NaoEncontrado('Colaborador nao encontrado.', 'COLABORADOR_NAO_ENCONTRADO');
    if (!epi.ativo) throw new RequisicaoInvalida('EPI inativo nao pode ser entregue.', 'EPI_INATIVO');

    if (epi.estoqueAtual < dados.quantidade) {
      throw new RequisicaoInvalida(
        `Estoque insuficiente: ha ${epi.estoqueAtual} unidade(s) e a entrega pede ${dados.quantidade}.`,
        'ESTOQUE_INSUFICIENTE',
        { detalhes: { estoqueAtual: epi.estoqueAtual } },
      );
    }

    const entrega = await prisma.$transaction(async (tx) => {
      const criada = await tx.entregaEpi.create({
        data: { ...(dados as Prisma.EntregaEpiUncheckedCreateInput), validadeTroca: validadeDaTroca(dados.data, epi.vidaUtilMeses) },
      });
      // Baixa no estoque na MESMA transacao da ficha.
      await tx.epi.update({ where: { id: dados.epiId }, data: { estoqueAtual: { decrement: dados.quantidade } } });
      await registrarAuditoria(tx, {
        entidade: 'EntregaEpi',
        entidadeId: criada.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, criada as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });
      return criada;
    });

    return reply.status(201).send(entrega);
  });

  /**
   * Assinatura do recebimento (imagem), carimbada com o conteudo da entrega —
   * a "assinatura digital" da ficha NR-06. Trocar a imagem ou a entrega
   * invalida o carimbo.
   */
  app.post('/epis/entregas/:id/assinatura', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const entrega = await prisma.entregaEpi.findUnique({ where: { id }, include: { colaborador: { select: { nome: true } }, epi: { select: { nome: true, ca: true } } } });
    if (!entrega) throw new NaoEncontrado('Entrega nao encontrada.', 'ENTREGA_NAO_ENCONTRADA');
    const { buffer, mimetype } = await receberArquivo(request, MIMES_IMAGEM_ACEITOS);
    const url = await salvarImagem(buffer, mimetype, 'epi-assinatura');
    const em = new Date();
    const hash = carimbar({
      conteudo: Buffer.concat([buffer, Buffer.from(JSON.stringify({ epi: entrega.epi.nome, ca: entrega.epi.ca, quantidade: entrega.quantidade, data: entrega.data.toISOString() }))]),
      signatario: entrega.colaborador.nome,
      momento: em,
    });
    const atualizada = await prisma.entregaEpi.update({ where: { id }, data: { assinaturaUrl: url, assinaturaHash: hash, assinaturaEm: em } });
    await removerArquivoPublico(entrega.assinaturaUrl);
    return { ...atualizada, rotuloMotivo: ROTULO_MOTIVO_ENTREGA[atualizada.motivo as MotivoEntregaEpi] };
  });

  /** Estorno: apaga a ficha e devolve a quantidade ao estoque. */
  app.delete('/epis/entregas/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const entrega = await prisma.entregaEpi.findUnique({ where: { id } });
    if (!entrega) throw new NaoEncontrado('Entrega nao encontrada.', 'ENTREGA_NAO_ENCONTRADA');

    await prisma.$transaction(async (tx) => {
      await tx.entregaEpi.delete({ where: { id } });
      await tx.epi.update({ where: { id: entrega.epiId }, data: { estoqueAtual: { increment: entrega.quantidade } } });
      await registrarAuditoria(tx, {
        entidade: 'EntregaEpi',
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: { quantidade: { de: entrega.quantidade, para: null } },
        contexto: contextoDeAuditoria(request),
      });
    });
    return reply.status(204).send();
  });
}
