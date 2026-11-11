import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { arredondar, ddsCreateSchema, ddsFiltroSchema, ddsGerarSchema, ddsUpdateSchema } from '@safetyguard/shared';
import { assistenteDisponivel, gerarTexto } from '../../lib/assistente.js';
import { prisma } from '../../db.js';
import { NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { registrarAuditoria, calcularDiferenca } from '../../lib/auditoria.js';
import { MIMES_DOCUMENTO_ACEITOS, removerArquivoPublico, salvarDocumento } from '../../lib/arquivos.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';
import { uploadMaxBytes } from '../../env.js';

const ENTIDADE = 'RegistroDds';
const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });

async function receberLista(request: FastifyRequest): Promise<string> {
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
  return salvarDocumento(await arquivo.toBuffer(), arquivo.mimetype, 'dds-presenca');
}

/**
 * Etapa 13 — DDS Digital.
 *
 * Rotina de campo: quem registra observacao tambem registra DDS, entao o par
 * de permissoes e o mesmo (`observacoes:*`).
 */
export async function registrarRotasDds(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'observacoes:ler', escrita: 'observacoes:escrever' }));

  /** Banco de temas, agrupado por categoria. */
  app.get('/dds/temas', async () => {
    return prisma.temaDds.findMany({ where: { ativo: true }, orderBy: { numero: 'asc' } });
  });

  app.get('/dds', async (request) => {
    const filtro = ddsFiltroSchema.parse(request.query);

    const where: Prisma.RegistroDdsWhereInput = {};
    if (filtro.clienteId) where.clienteId = filtro.clienteId;
    if (filtro.areaId) where.areaId = filtro.areaId;
    if (filtro.temaId) where.temaId = filtro.temaId;
    if (filtro.lider) where.lider = { contains: filtro.lider, mode: 'insensitive' };
    if (filtro.de || filtro.ate) {
      where.data = { ...(filtro.de ? { gte: filtro.de } : {}), ...(filtro.ate ? { lte: filtro.ate } : {}) };
    }
    if (filtro.busca) {
      where.OR = [
        { lider: { contains: filtro.busca, mode: 'insensitive' } },
        { temaLivre: { contains: filtro.busca, mode: 'insensitive' } },
        { tema: { titulo: { contains: filtro.busca, mode: 'insensitive' } } },
      ];
    }

    const [total, itens] = await prisma.$transaction([
      prisma.registroDds.count({ where }),
      prisma.registroDds.findMany({
        where,
        orderBy: { data: 'desc' },
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
        include: {
          tema: { select: { numero: true, titulo: true, categoria: true } },
          cliente: { select: { id: true, nomeFantasia: true } },
          area: { select: { id: true, nome: true, codigo: true } },
        },
      }),
    ]);

    return {
      itens,
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
      totalPaginas: Math.max(1, Math.ceil(total / filtro.porPagina)),
    };
  });

  /**
   * Roteiro de DDS gerado pela assistente a partir do tema. Com a chave da
   * Anthropic configurada usa a IA; sem ela, monta um roteiro-modelo a partir
   * do titulo e da categoria do tema. Nada e gravado aqui: o texto volta
   * para a tela, editavel, e so entra no registro quando o usuario salvar.
   */
  app.post('/dds/gerar', async (request) => {
    const dados = ddsGerarSchema.parse(request.body);
    const tema = dados.temaId ? await prisma.temaDds.findUnique({ where: { id: dados.temaId } }) : null;
    const titulo = tema?.titulo ?? dados.temaLivre?.trim();
    if (!titulo) throw new RequisicaoInvalida('Escolha um tema do banco ou descreva o tema livre.', 'TEMA_AUSENTE');

    const categoria = tema?.categoria ?? 'Seguranca do trabalho';
    const minutos = dados.duracaoMinutos;

    const reserva = () =>
      [
        `# DDS — ${titulo}`,
        `Categoria: ${categoria} · Duracao sugerida: ${minutos} min`,
        '',
        '## 1. Abertura (1 min)',
        `Bom dia a todos. O tema de hoje e "${titulo}". Vamos conversar sobre por que isso importa para a nossa seguranca e o que cada um pode fazer ainda hoje.`,
        '',
        '## 2. Por que falar disso? (2 min)',
        `- Situacoes do dia a dia em que "${titulo.toLowerCase()}" aparece na nossa atividade.`,
        '- Consequencias quando o cuidado falha: lesoes, afastamento, impacto na familia e na equipe.',
        dados.contexto ? `- Contexto da nossa operacao: ${dados.contexto.trim()}` : '- Exemplos recentes da nossa area (se houver, cite sem expor pessoas).',
        '',
        '## 3. O que fazer — boas praticas (4 min)',
        '- Planejar a atividade antes de comecar: conhecer os riscos e os controles.',
        '- Usar os EPIs exigidos e verificar o estado deles antes do uso.',
        '- Respeitar bloqueios, sinalizacoes e permissoes de trabalho.',
        '- Em duvida, parar e perguntar ao supervisor — nenhuma tarefa justifica um acidente.',
        '',
        '## 4. Perguntas para a equipe (2 min)',
        `- Onde "${titulo.toLowerCase()}" pode acontecer na tarefa de hoje?`,
        '- O que podemos mudar agora para reduzir esse risco?',
        '',
        '## 5. Compromisso e encerramento (1 min)',
        'Cada um se compromete com uma atitude segura hoje. Registre as presencas na lista.',
        '',
        '_Roteiro-modelo: a assistente de IA nao esta configurada (ANTHROPIC_API_KEY). Edite o texto antes de usar._',
      ].join('\n');

    const resultado = await gerarTexto({
      sistema:
        'Voce e um tecnico de seguranca do trabalho experiente, redigindo roteiros de DDS (Dialogo Diario de Seguranca) em portugues do Brasil para equipes operacionais. ' +
        'Escreva em linguagem simples e direta, sem jargao desnecessario, com exemplos concretos de campo. Use Markdown com titulos "##" numerados: abertura, por que falar disso, o que fazer (boas praticas em lista), perguntas para a equipe, compromisso/encerramento. ' +
        'Cite as NRs aplicaveis quando fizer sentido. Nao invente dados da empresa. O roteiro deve caber na duracao informada.',
      pedido: `Tema: ${titulo}\nCategoria: ${categoria}\nDuracao: ${minutos} minutos${dados.contexto ? `\nContexto da operacao: ${dados.contexto}` : ''}`,
      reserva,
      maxTokens: 2500,
    });

    return { titulo, categoria, ...resultado, assistenteConfigurada: assistenteDisponivel() };
  });

  /** Painel do DDS: por mes, por categoria, por area e por lider. */
  app.get('/dds/painel', async (request) => {
    const { clienteId, meses } = z
      .object({ clienteId: z.string().uuid().optional(), meses: z.coerce.number().int().min(1).max(24).default(6) })
      .parse(request.query);
    const inicio = new Date();
    inicio.setMonth(inicio.getMonth() - meses);
    inicio.setDate(1);
    inicio.setHours(0, 0, 0, 0);

    const registros = await prisma.registroDds.findMany({
      where: { ...(clienteId ? { clienteId } : {}), data: { gte: inicio } },
      select: {
        data: true,
        lider: true,
        participantes: true,
        duracaoMinutos: true,
        temaLivre: true,
        tema: { select: { titulo: true, categoria: true } },
        area: { select: { nome: true } },
      },
    });

    const porMes = new Map<string, { mes: string; dds: number; participantes: number }>();
    const porCategoria = new Map<string, number>();
    const porArea = new Map<string, number>();
    const porLider = new Map<string, { dds: number; participantes: number }>();
    const porTema = new Map<string, number>();

    for (const r of registros) {
      const mes = r.data.toISOString().slice(0, 7);
      const m = porMes.get(mes) ?? { mes, dds: 0, participantes: 0 };
      m.dds += 1;
      m.participantes += r.participantes;
      porMes.set(mes, m);

      const categoria = r.tema?.categoria ?? 'Tema livre';
      porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + 1);
      const area = r.area?.nome ?? 'Geral';
      porArea.set(area, (porArea.get(area) ?? 0) + 1);
      const l = porLider.get(r.lider) ?? { dds: 0, participantes: 0 };
      l.dds += 1;
      l.participantes += r.participantes;
      porLider.set(r.lider, l);
      const tema = r.tema?.titulo ?? r.temaLivre ?? '—';
      porTema.set(tema, (porTema.get(tema) ?? 0) + 1);
    }

    const contagem = (mapa: Map<string, number>) =>
      [...mapa.entries()].map(([chave, total]) => ({ chave, total })).sort((a, b) => b.total - a.total);

    return {
      periodo: { inicio, meses },
      total: registros.length,
      participantesTotal: registros.reduce((soma, r) => soma + r.participantes, 0),
      minutosTotal: registros.reduce((soma, r) => soma + (r.duracaoMinutos ?? 0), 0),
      porMes: [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes)),
      porCategoria: contagem(porCategoria),
      porArea: contagem(porArea),
      porLider: [...porLider.entries()].map(([chave, v]) => ({ chave, ...v })).sort((a, b) => b.dds - a.dds),
      temasMaisUsados: contagem(porTema).slice(0, 10),
    };
  });

  /** Indicador de realizacao: constancia e participacao nos ultimos 30 dias. */
  app.get('/dds/resumo', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    const inicio30 = new Date();
    inicio30.setDate(inicio30.getDate() - 30);

    const base: Prisma.RegistroDdsWhereInput = clienteId ? { clienteId } : {};

    const [total, ultimos30, participacao, ultimo] = await prisma.$transaction([
      prisma.registroDds.count({ where: base }),
      prisma.registroDds.count({ where: { ...base, data: { gte: inicio30 } } }),
      prisma.registroDds.aggregate({ where: { ...base, data: { gte: inicio30 } }, _avg: { participantes: true } }),
      prisma.registroDds.findFirst({ where: base, orderBy: { data: 'desc' }, select: { data: true } }),
    ]);

    return {
      total,
      ultimos30Dias: ultimos30,
      participacaoMedia: participacao._avg.participantes ? arredondar(participacao._avg.participantes, 1) : null,
      ultimoRegistro: ultimo?.data ?? null,
    };
  });

  app.post('/dds', async (request, reply) => {
    const dados = ddsCreateSchema.parse(request.body);

    const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true } });
    if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');

    const registro = await prisma.$transaction(async (tx) => {
      const criado = await tx.registroDds.create({ data: dados as Prisma.RegistroDdsUncheckedCreateInput });
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: criado.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, criado as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });
      return criado;
    });

    return reply.status(201).send(registro);
  });

  app.put('/dds/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = ddsUpdateSchema.parse(request.body);

    const atual = await prisma.registroDds.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado('Registro nao encontrado.', 'DDS_NAO_ENCONTRADO');

    return prisma.$transaction(async (tx) => {
      const registro = await tx.registroDds.update({ where: { id }, data: dados as Prisma.RegistroDdsUncheckedUpdateInput });
      const diferenca = calcularDiferenca(
        atual as unknown as Record<string, unknown>,
        registro as unknown as Record<string, unknown>,
      );
      if (Object.keys(diferenca).length > 0) {
        await registrarAuditoria(tx, {
          entidade: ENTIDADE,
          entidadeId: id,
          acao: 'ATUALIZACAO',
          alteracoes: diferenca,
          contexto: contextoDeAuditoria(request),
        });
      }
      return registro;
    });
  });

  app.delete('/dds/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await prisma.registroDds.findUnique({ where: { id }, select: { lider: true, data: true } });
    if (!atual) throw new NaoEncontrado('Registro nao encontrado.', 'DDS_NAO_ENCONTRADO');

    await prisma.$transaction(async (tx) => {
      await tx.registroDds.delete({ where: { id } });
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: { lider: { de: atual.lider, para: null } },
        contexto: contextoDeAuditoria(request),
      });
    });
    return reply.status(204).send();
  });

  app.post('/dds/:id/lista-presenca', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await prisma.registroDds.findUnique({ where: { id }, select: { listaPresencaUrl: true } });
    if (!atual) throw new NaoEncontrado('Registro nao encontrado.', 'DDS_NAO_ENCONTRADO');

    const url = await receberLista(request);
    const registro = await prisma.registroDds.update({ where: { id }, data: { listaPresencaUrl: url } });
    await removerArquivoPublico(atual.listaPresencaUrl);
    return registro;
  });
}
