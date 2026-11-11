import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { z } from 'zod';
import {
  CATALOGO_DOCUMENTOS,
  DOCUMENTOS_OBRIGATORIOS_COLABORADOR,
  ROTULO_RESULTADO_ASO,
  ROTULO_SITUACAO_COLABORADOR,
  ROTULO_SITUACAO_VENCIMENTO,
  ROTULO_TIPO_ASO,
  ROTULO_TIPO_DOCUMENTO,
  ROTULO_VINCULO_COLABORADOR,
  diasAteVencer,
  formatarCpf,
  formatarTelefone,
  situacaoDaValidade,
  type ResultadoAso,
  type SituacaoColaborador,
  type TipoAso,
  type TipoDocumento,
  type VinculoColaborador,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { env, uploadMaxBytes } from '../../env.js';
import { MIMES_IMAGEM_ACEITOS, removerArquivoPublico, salvarImagem } from '../../lib/arquivos.js';
import { calcularDiferenca, registrarAuditoria } from '../../lib/auditoria.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { adicionarAba, novaPlanilha, responderPlanilha } from '../../lib/excel.js';
import { guardaPorMetodo } from '../../lib/guarda.js';
import { DIAS_ALERTA_ASO } from './colaborador.service.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });
const TOKEN_CARTEIRINHA = /^[A-F0-9]{32}$/;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

function urlDaCarteirinha(token: string): string {
  return `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/carteirinha/${token}`;
}

async function garantirTokenCarteirinha(id: string): Promise<string> {
  const colaborador = await prisma.colaborador.findUnique({ where: { id }, select: { tokenCarteirinha: true } });
  if (!colaborador) throw new NaoEncontrado('Colaborador nao encontrado.', 'COLABORADOR_NAO_ENCONTRADO');
  if (colaborador.tokenCarteirinha) return colaborador.tokenCarteirinha;
  const token = randomBytes(16).toString('hex').toUpperCase();
  await prisma.colaborador.update({ where: { id }, data: { tokenCarteirinha: token } });
  return token;
}

/**
 * Situacao de capacitacao e liberacao do colaborador para a carteirinha e
 * para a tela publica de verificacao: nome, funcao, ASO, treinamentos
 * validos e bloqueio. Nada sensivel (sem CPF completo, sem telefone).
 */
async function montarCarteirinha(colaboradorId: string) {
  const hoje = new Date();
  const colaborador = await prisma.colaborador.findUnique({
    where: { id: colaboradorId },
    include: {
      cliente: { select: { nomeFantasia: true, logoUrl: true } },
      terceiro: { select: { nomeFantasia: true } },
      asos: { where: { tipo: { not: 'DEMISSIONAL' } }, orderBy: { dataExame: 'desc' }, take: 1, select: { validade: true, resultado: true } },
      treinamentos: { orderBy: { dataRealizacao: 'desc' }, include: { treinamento: { select: { id: true, nome: true, norma: true } } } },
    },
  });
  if (!colaborador) throw new NaoEncontrado('Colaborador nao encontrado.', 'COLABORADOR_NAO_ENCONTRADO');

  const empresa = await prisma.empresaConsultoria.findFirst({ select: { nomeFantasia: true, logoUrl: true } });
  const [aso] = colaborador.asos;
  const situacaoAso = aso ? situacaoDaValidade(aso.validade, hoje, DIAS_ALERTA_ASO) : 'SEM_ASO';

  // Ultima realizacao de cada treinamento.
  const vistos = new Set<string>();
  const treinamentos = colaborador.treinamentos
    .filter((t) => {
      if (vistos.has(t.treinamentoId)) return false;
      vistos.add(t.treinamentoId);
      return true;
    })
    .map((t) => ({
      nome: t.treinamento.nome,
      norma: t.treinamento.norma,
      dataRealizacao: t.dataRealizacao,
      validade: t.validade,
      situacao: situacaoDaValidade(t.validade, hoje),
    }));

  // Treinamentos que a matriz exige para a funcao e que nunca foram feitos.
  const requisitos = await prisma.requisitoCapacitacao.findMany({
    where: { funcao: { equals: colaborador.funcao, mode: 'insensitive' } },
    select: { treinamentoId: true, treinamento: { select: { nome: true, norma: true } } },
  });
  const treinamentosFaltantes = requisitos
    .filter((r) => !vistos.has(r.treinamentoId))
    .map((r) => ({ nome: r.treinamento.nome, norma: r.treinamento.norma }));
  const treinamentosVencidos = treinamentos.filter((t) => t.situacao === 'VENCIDO').map((t) => t.nome);

  const liberado =
    colaborador.situacao === 'ATIVO' &&
    !colaborador.bloqueado &&
    Boolean(aso) &&
    situacaoAso !== 'VENCIDO' &&
    aso?.resultado !== 'INAPTO';

  return {
    geradoEm: hoje,
    consultoria: empresa,
    empregador: colaborador.terceiro?.nomeFantasia ?? colaborador.cliente.nomeFantasia,
    cliente: colaborador.cliente,
    colaborador: {
      id: colaborador.id,
      nome: colaborador.nome,
      cpfParcial: `***.${colaborador.cpf.slice(3, 6)}.${colaborador.cpf.slice(6, 9)}-**`,
      matricula: colaborador.matricula,
      funcao: colaborador.funcao,
      setor: colaborador.setor,
      fotoUrl: colaborador.fotoUrl,
      situacao: ROTULO_SITUACAO_COLABORADOR[colaborador.situacao as SituacaoColaborador],
      bloqueado: colaborador.bloqueado,
      motivoBloqueio: colaborador.bloqueado ? colaborador.motivoBloqueio : null,
    },
    aso: aso ? { validade: aso.validade, resultado: ROTULO_RESULTADO_ASO[aso.resultado as ResultadoAso], situacao: situacaoAso } : null,
    treinamentos,
    treinamentosFaltantes,
    treinamentosVencidos,
    liberado,
  };
}

/**
 * Pasta do colaborador: quais documentos obrigatorios existem (com arquivo),
 * quais faltam e quais venceram. Alimenta o alerta de pendencias e a tela.
 */
export async function documentacaoDoColaborador(colaboradorId: string) {
  const hoje = new Date();
  const colaborador = await prisma.colaborador.findUnique({
    where: { id: colaboradorId },
    select: {
      id: true,
      nome: true,
      clienteId: true,
      documentos: { where: { vigente: true, situacao: 'ATIVO' }, orderBy: { dataEmissao: 'desc' }, select: { id: true, tipo: true, titulo: true, validade: true, arquivoUrl: true, dataEmissao: true } },
      asos: { where: { tipo: { not: 'DEMISSIONAL' } }, orderBy: { dataExame: 'desc' }, take: 1, select: { id: true, validade: true, arquivoUrl: true } },
      treinamentos: { orderBy: { dataRealizacao: 'desc' }, select: { id: true, validade: true, certificadoUrl: true, treinamento: { select: { nome: true } } } },
      ordensServico: { where: { situacao: { not: 'SUBSTITUIDA' } }, orderBy: { versao: 'desc' }, take: 1, select: { id: true, codigo: true, situacao: true, arquivoAssinadoUrl: true } },
    },
  });
  if (!colaborador) throw new NaoEncontrado('Colaborador nao encontrado.', 'COLABORADOR_NAO_ENCONTRADO');

  const itens = DOCUMENTOS_OBRIGATORIOS_COLABORADOR.map((tipo) => {
    const documento = colaborador.documentos.find((d) => d.tipo === tipo);
    const definicao = CATALOGO_DOCUMENTOS.find((d) => d.tipo === tipo);
    let situacao: 'OK' | 'A_VENCER' | 'VENCIDO' | 'SEM_ARQUIVO' | 'AUSENTE' = 'AUSENTE';
    if (documento) {
      const validade = situacaoDaValidade(documento.validade, hoje);
      if (!documento.arquivoUrl) situacao = 'SEM_ARQUIVO';
      else if (validade === 'VENCIDO') situacao = 'VENCIDO';
      else if (validade === 'A_VENCER') situacao = 'A_VENCER';
      else situacao = 'OK';
    }
    return {
      tipo,
      rotulo: ROTULO_TIPO_DOCUMENTO[tipo as TipoDocumento],
      descricao: definicao?.descricao ?? null,
      documento,
      situacao,
    };
  });

  const [aso] = colaborador.asos;
  const asoSituacao = aso ? situacaoDaValidade(aso.validade, hoje, DIAS_ALERTA_ASO) : 'SEM_ASO';
  const [os] = colaborador.ordensServico;

  const pendencias = [
    ...itens.filter((i) => i.situacao !== 'OK').map((i) => `${i.rotulo}: ${i.situacao === 'AUSENTE' ? 'nao cadastrado' : i.situacao === 'SEM_ARQUIVO' ? 'sem arquivo anexado' : i.situacao === 'VENCIDO' ? 'vencido' : 'a vencer'}`),
    ...(asoSituacao === 'SEM_ASO' ? ['ASO: nenhum exame registrado'] : asoSituacao === 'VENCIDO' ? ['ASO: vencido'] : asoSituacao === 'A_VENCER' ? ['ASO: vence em breve'] : []),
    ...(!os ? ['Ordem de servico: nao emitida'] : os.situacao === 'EMITIDA' ? ['Ordem de servico: sem ciencia do trabalhador'] : []),
  ];

  return {
    colaboradorId: colaborador.id,
    nome: colaborador.nome,
    clienteId: colaborador.clienteId,
    itens,
    aso: aso ? { id: aso.id, validade: aso.validade, arquivoUrl: aso.arquivoUrl, situacao: asoSituacao } : null,
    ordemServico: os ?? null,
    certificados: colaborador.treinamentos.map((t) => ({ id: t.id, treinamento: t.treinamento.nome, validade: t.validade, certificadoUrl: t.certificadoUrl, situacao: situacaoDaValidade(t.validade, hoje) })),
    pendencias,
    completo: pendencias.length === 0,
  };
}

/**
 * Extras do colaborador (Etapa 24): foto, bloqueio, carteirinha com QR Code,
 * pasta de documentos, relatorio de ASO e exportacoes em Excel.
 */
export async function registrarRotasColaboradorExtras(app: FastifyInstance): Promise<void> {
  app.addHook(
    'preHandler',
    guardaPorMetodo(app, {
      leitura: 'saude:ler',
      escrita: 'saude:escrever',
      // A verificacao da carteirinha e publica: o token do QR e a credencial.
      excecoes: { '/api/v1/carteirinha/:token': null },
    }),
  );

  /* --------------------------------------------------------------- foto --- */

  app.post('/colaboradores/:id/foto', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await prisma.colaborador.findUnique({ where: { id }, select: { fotoUrl: true } });
    if (!atual) throw new NaoEncontrado('Colaborador nao encontrado.', 'COLABORADOR_NAO_ENCONTRADO');
    const arquivo = await request.file({ limits: { fileSize: uploadMaxBytes } });
    if (!arquivo) throw new RequisicaoInvalida('Envie a foto no campo "arquivo" (multipart/form-data).', 'ARQUIVO_AUSENTE');
    if (!MIMES_IMAGEM_ACEITOS.includes(arquivo.mimetype)) throw new RequisicaoInvalida(`Formato ${arquivo.mimetype} nao suportado.`, 'FORMATO_NAO_SUPORTADO');
    const url = await salvarImagem(await arquivo.toBuffer(), arquivo.mimetype, 'colaborador');
    const atualizado = await prisma.colaborador.update({ where: { id }, data: { fotoUrl: url }, select: { id: true, fotoUrl: true } });
    await removerArquivoPublico(atual.fotoUrl);
    return atualizado;
  });

  /* ----------------------------------------------------------- bloqueio --- */

  app.post('/colaboradores/:id/bloqueio', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const { bloqueado, motivo } = z
      .object({ bloqueado: z.boolean(), motivo: z.string().trim().max(300).optional() })
      .parse(request.body);
    if (bloqueado && !motivo) throw new RequisicaoInvalida('Informe o motivo do bloqueio.', 'VALIDACAO', { campos: { motivoBloqueio: ['Informe o motivo do bloqueio.'] } });

    const atual = await prisma.colaborador.findUnique({ where: { id }, select: { bloqueado: true, motivoBloqueio: true } });
    if (!atual) throw new NaoEncontrado('Colaborador nao encontrado.', 'COLABORADOR_NAO_ENCONTRADO');

    return prisma.$transaction(async (tx) => {
      const atualizado = await tx.colaborador.update({
        where: { id },
        data: { bloqueado, motivoBloqueio: bloqueado ? motivo : null, bloqueadoEm: bloqueado ? new Date() : null },
        select: { id: true, bloqueado: true, motivoBloqueio: true, bloqueadoEm: true },
      });
      await registrarAuditoria(tx, {
        entidade: 'Colaborador',
        entidadeId: id,
        acao: 'ATUALIZACAO',
        alteracoes: calcularDiferenca(atual as unknown as Record<string, unknown>, { bloqueado, motivoBloqueio: atualizado.motivoBloqueio }),
        contexto: contextoDeAuditoria(request),
      });
      return atualizado;
    });
  });

  /* -------------------------------------------------------- carteirinha --- */

  app.get('/colaboradores/:id/carteirinha', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const token = await garantirTokenCarteirinha(id);
    const dados = await montarCarteirinha(id);
    return { ...dados, token, urlVerificacao: urlDaCarteirinha(token), urlQrCode: `${env.PUBLIC_API_URL}/api/v1/colaboradores/${id}/carteirinha.svg` };
  });

  app.get('/colaboradores/:id/carteirinha.svg', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const token = await garantirTokenCarteirinha(id);
    const svg = await QRCode.toString(urlDaCarteirinha(token), { type: 'svg', errorCorrectionLevel: 'M', margin: 1, scale: 5 });
    return reply.header('Content-Type', 'image/svg+xml').send(svg);
  });

  /** Verificacao publica: quem le o QR da carteirinha ve se a pessoa esta liberada. */
  app.get('/carteirinha/:token', async (request) => {
    const { token } = z.object({ token: z.string().trim().toUpperCase() }).parse(request.params);
    if (!TOKEN_CARTEIRINHA.test(token)) throw new NaoEncontrado('Carteirinha invalida.', 'CARTEIRINHA_INVALIDA');
    const colaborador = await prisma.colaborador.findUnique({ where: { tokenCarteirinha: token }, select: { id: true } });
    if (!colaborador) throw new NaoEncontrado('Carteirinha nao reconhecida.', 'CARTEIRINHA_NAO_ENCONTRADA');
    return montarCarteirinha(colaborador.id);
  });

  /* ------------------------------------------------------- documentacao --- */

  app.get('/colaboradores/:id/documentacao', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return documentacaoDoColaborador(id);
  });

  /** Pendencias de documentacao de todos os ativos de um cliente (alerta e e-mail). */
  app.get('/colaboradores/documentacao/pendencias', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    const ativos = await prisma.colaborador.findMany({
      where: { situacao: 'ATIVO', ...(clienteId ? { clienteId } : {}) },
      select: { id: true },
      take: 500,
    });
    const resultados = await Promise.all(ativos.map((c) => documentacaoDoColaborador(c.id)));
    const comPendencia = resultados.filter((r) => !r.completo);
    return {
      avaliados: resultados.length,
      comPendencia: comPendencia.length,
      itens: comPendencia.map((r) => ({ colaboradorId: r.colaboradorId, nome: r.nome, clienteId: r.clienteId, pendencias: r.pendencias })),
    };
  });

  /* ------------------------------------------------------ relatorio ASO --- */

  /**
   * Lista/relatorio de ASO por colaborador: admissional, ultimo periodico,
   * demissional, afastamentos e situacao — com filtro vencido/valido.
   */
  async function relatorioAso(filtro: { clienteId?: string; situacao?: string; busca?: string }) {
    const hoje = new Date();
    const colaboradores = await prisma.colaborador.findMany({
      where: {
        ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
        ...(filtro.busca ? { OR: [{ nome: { contains: filtro.busca, mode: 'insensitive' } }, { funcao: { contains: filtro.busca, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { nome: 'asc' },
      take: 1000,
      include: {
        cliente: { select: { nomeFantasia: true } },
        terceiro: { select: { nomeFantasia: true } },
        asos: { orderBy: { dataExame: 'desc' }, select: { tipo: true, dataExame: true, validade: true, resultado: true } },
        _count: { select: { afastamentos: true } },
        afastamentos: { orderBy: { dataInicio: 'desc' }, take: 1, select: { dataInicio: true, dataFim: true, diasAfastamento: true } },
      },
    });

    const linhas = colaboradores.map((c) => {
      const porTipo = (tipo: TipoAso) => c.asos.find((a) => a.tipo === tipo) ?? null;
      const atual = c.asos.find((a) => a.tipo !== 'DEMISSIONAL') ?? null;
      const situacao = atual ? situacaoDaValidade(atual.validade, hoje, DIAS_ALERTA_ASO) : 'SEM_ASO';
      return {
        id: c.id,
        nome: c.nome,
        cpf: formatarCpf(c.cpf),
        matricula: c.matricula,
        funcao: c.funcao,
        setor: c.setor,
        cliente: c.cliente.nomeFantasia,
        terceiro: c.terceiro?.nomeFantasia ?? null,
        vinculo: ROTULO_VINCULO_COLABORADOR[c.vinculo as VinculoColaborador],
        situacaoColaborador: ROTULO_SITUACAO_COLABORADOR[c.situacao as SituacaoColaborador],
        admissao: c.dataAdmissao,
        admissional: porTipo('ADMISSIONAL')?.dataExame ?? null,
        periodico: porTipo('PERIODICO')?.dataExame ?? null,
        retornoAoTrabalho: porTipo('RETORNO_AO_TRABALHO')?.dataExame ?? null,
        mudancaDeRisco: porTipo('MUDANCA_DE_RISCO')?.dataExame ?? null,
        demissional: porTipo('DEMISSIONAL')?.dataExame ?? null,
        ultimoExameTipo: atual ? ROTULO_TIPO_ASO[atual.tipo as TipoAso] : null,
        ultimoExame: atual?.dataExame ?? null,
        validade: atual?.validade ?? null,
        diasParaVencer: atual ? diasAteVencer(atual.validade, hoje) : null,
        resultado: atual ? ROTULO_RESULTADO_ASO[atual.resultado as ResultadoAso] : null,
        situacaoAso: situacao,
        rotuloSituacaoAso: situacao === 'SEM_ASO' ? 'Sem ASO' : ROTULO_SITUACAO_VENCIMENTO[situacao],
        afastamentos: c._count.afastamentos,
        ultimoAfastamento: c.afastamentos[0]?.dataInicio ?? null,
        bloqueado: c.bloqueado,
        telefone: c.telefone ? formatarTelefone(c.telefone) : null,
        email: c.email,
      };
    });

    const filtradas =
      filtro.situacao === 'VALIDO'
        ? linhas.filter((l) => l.situacaoAso === 'VIGENTE' || l.situacaoAso === 'A_VENCER')
        : filtro.situacao === 'VENCIDO'
          ? linhas.filter((l) => l.situacaoAso === 'VENCIDO' || l.situacaoAso === 'SEM_ASO')
          : filtro.situacao
            ? linhas.filter((l) => l.situacaoAso === filtro.situacao)
            : linhas;

    return {
      geradoEm: hoje,
      diasAlerta: DIAS_ALERTA_ASO,
      total: filtradas.length,
      resumo: {
        vigentes: linhas.filter((l) => l.situacaoAso === 'VIGENTE').length,
        aVencer: linhas.filter((l) => l.situacaoAso === 'A_VENCER').length,
        vencidos: linhas.filter((l) => l.situacaoAso === 'VENCIDO').length,
        semAso: linhas.filter((l) => l.situacaoAso === 'SEM_ASO').length,
      },
      itens: filtradas,
    };
  }

  const filtroAsoSchema = z.object({
    clienteId: z.string().uuid().optional(),
    situacao: z.enum(['VALIDO', 'VENCIDO', 'VIGENTE', 'A_VENCER', 'SEM_ASO', 'SEM_VALIDADE']).optional(),
    busca: z.string().trim().max(120).optional(),
  });

  app.get('/asos/relatorio', async (request) => relatorioAso(filtroAsoSchema.parse(request.query)));

  app.get('/asos/relatorio.xlsx', async (request, reply) => {
    const filtro = filtroAsoSchema.parse(request.query);
    const dados = await relatorioAso(filtro);
    const workbook = novaPlanilha();
    adicionarAba(
      workbook,
      'ASO',
      [
        { cabecalho: 'Colaborador', chave: 'nome', largura: 32 },
        { cabecalho: 'CPF', chave: 'cpf', largura: 16 },
        { cabecalho: 'Matricula', chave: 'matricula' },
        { cabecalho: 'Funcao', chave: 'funcao', largura: 24 },
        { cabecalho: 'Setor', chave: 'setor', largura: 18 },
        { cabecalho: 'Cliente', chave: 'cliente', largura: 24 },
        { cabecalho: 'Empresa contratada', chave: 'terceiro', largura: 24 },
        { cabecalho: 'Admissao', chave: 'admissao', formato: 'data' },
        { cabecalho: 'Admissional', chave: 'admissional', formato: 'data' },
        { cabecalho: 'Periodico', chave: 'periodico', formato: 'data' },
        { cabecalho: 'Retorno ao trabalho', chave: 'retornoAoTrabalho', formato: 'data' },
        { cabecalho: 'Mudanca de risco', chave: 'mudancaDeRisco', formato: 'data' },
        { cabecalho: 'Demissional', chave: 'demissional', formato: 'data' },
        { cabecalho: 'Ultimo exame', chave: 'ultimoExameTipo', largura: 20 },
        { cabecalho: 'Validade', chave: 'validade', formato: 'data' },
        { cabecalho: 'Dias para vencer', chave: 'diasParaVencer', formato: 'numero' },
        { cabecalho: 'Resultado', chave: 'resultado', largura: 18 },
        { cabecalho: 'Situacao do ASO', chave: 'rotuloSituacaoAso', largura: 16 },
        { cabecalho: 'Afastamentos', chave: 'afastamentos', formato: 'numero' },
        { cabecalho: 'Ultimo afastamento', chave: 'ultimoAfastamento', formato: 'data' },
        { cabecalho: 'Situacao', chave: 'situacaoColaborador' },
      ],
      dados.itens,
      { titulo: `Relatorio de ASO — gerado em ${dados.geradoEm.toLocaleDateString('pt-BR')} (alerta ${DIAS_ALERTA_ASO} dias)` },
    );
    return responderPlanilha(reply, workbook, `relatorio-aso-${dados.geradoEm.toISOString().slice(0, 10)}.xlsx`);
  });

  /* ------------------------------------- lista de funcionarios (Excel) --- */

  app.get('/colaboradores/lista.xlsx', async (request, reply) => {
    const { clienteId, situacao } = z
      .object({ clienteId: z.string().uuid().optional(), situacao: z.enum(['ATIVO', 'AFASTADO', 'DESLIGADO']).optional() })
      .parse(request.query);
    const itens = await prisma.colaborador.findMany({
      where: { ...(clienteId ? { clienteId } : {}), ...(situacao ? { situacao } : {}) },
      orderBy: [{ cliente: { nomeFantasia: 'asc' } }, { nome: 'asc' }],
      take: 2000,
      include: { cliente: { select: { nomeFantasia: true } }, terceiro: { select: { nomeFantasia: true } }, area: { select: { nome: true } } },
    });
    const workbook = novaPlanilha();
    adicionarAba(
      workbook,
      'Funcionarios',
      [
        { cabecalho: 'Nome', chave: 'nome', largura: 32 },
        { cabecalho: 'CPF', chave: 'cpf', largura: 16 },
        { cabecalho: 'Matricula', chave: 'matricula' },
        { cabecalho: 'Funcao', chave: 'funcao', largura: 24 },
        { cabecalho: 'Setor', chave: 'setor', largura: 18 },
        { cabecalho: 'Area', chave: 'area', largura: 20 },
        { cabecalho: 'Telefone', chave: 'telefone', largura: 16 },
        { cabecalho: 'E-mail', chave: 'email', largura: 30 },
        { cabecalho: 'Lideranca', chave: 'liderNome', largura: 24 },
        { cabecalho: 'Vinculo', chave: 'vinculo', largura: 20 },
        { cabecalho: 'Cliente', chave: 'cliente', largura: 24 },
        { cabecalho: 'Empresa contratada', chave: 'terceiro', largura: 24 },
        { cabecalho: 'Admissao', chave: 'dataAdmissao', formato: 'data' },
        { cabecalho: 'Situacao', chave: 'situacao' },
        { cabecalho: 'Bloqueado', chave: 'bloqueado' },
      ],
      itens.map((c) => ({
        nome: c.nome,
        cpf: formatarCpf(c.cpf),
        matricula: c.matricula,
        funcao: c.funcao,
        setor: c.setor,
        area: c.area?.nome ?? null,
        telefone: c.telefone ? formatarTelefone(c.telefone) : null,
        email: c.email,
        liderNome: c.liderNome,
        vinculo: ROTULO_VINCULO_COLABORADOR[c.vinculo as VinculoColaborador],
        cliente: c.cliente.nomeFantasia,
        terceiro: c.terceiro?.nomeFantasia ?? null,
        dataAdmissao: c.dataAdmissao,
        situacao: ROTULO_SITUACAO_COLABORADOR[c.situacao as SituacaoColaborador],
        bloqueado: c.bloqueado ? `Sim — ${c.motivoBloqueio ?? ''}` : 'Nao',
      })),
      { titulo: `Lista de funcionarios — ${new Date().toLocaleDateString('pt-BR')}` },
    );
    return responderPlanilha(reply, workbook, `funcionarios-${new Date().toISOString().slice(0, 10)}.xlsx`);
  });

  /* ------------------------------------------- alerta de ASO a vencer --- */

  /** ASOs que vencem nos proximos N dias (padrao 35) — alimenta o alerta e o e-mail diario. */
  app.get('/asos/a-vencer', async (request) => {
    const { clienteId, dias } = z.object({ clienteId: z.string().uuid().optional(), dias: z.coerce.number().int().min(1).max(365).default(DIAS_ALERTA_ASO) }).parse(request.query);
    const hoje = new Date();
    const limite = new Date(hoje.getTime() + dias * MS_POR_DIA);
    const asos = await prisma.aso.findMany({
      where: { tipo: { not: 'DEMISSIONAL' }, validade: { lte: limite }, colaborador: { situacao: 'ATIVO', ...(clienteId ? { clienteId } : {}) } },
      orderBy: { validade: 'asc' },
      include: { colaborador: { select: { id: true, nome: true, funcao: true, clienteId: true, cliente: { select: { nomeFantasia: true } } } } },
    });
    // Apenas o ASO mais recente de cada colaborador conta.
    const vistos = new Set<string>();
    const ultimos = await prisma.aso.findMany({ where: { tipo: { not: 'DEMISSIONAL' } }, orderBy: { dataExame: 'desc' }, select: { id: true, colaboradorId: true } });
    const ultimoPorColaborador = new Map<string, string>();
    for (const a of ultimos) if (!ultimoPorColaborador.has(a.colaboradorId)) ultimoPorColaborador.set(a.colaboradorId, a.id);
    return asos
      .filter((a) => ultimoPorColaborador.get(a.colaboradorId) === a.id && !vistos.has(a.colaboradorId) && vistos.add(a.colaboradorId))
      .map((a) => ({
        asoId: a.id,
        colaboradorId: a.colaborador.id,
        nome: a.colaborador.nome,
        funcao: a.colaborador.funcao,
        cliente: a.colaborador.cliente.nomeFantasia,
        tipo: ROTULO_TIPO_ASO[a.tipo as TipoAso],
        validade: a.validade,
        diasParaVencer: diasAteVencer(a.validade, hoje),
        vencido: Boolean(a.validade && a.validade < hoje),
      }));
  });
}
