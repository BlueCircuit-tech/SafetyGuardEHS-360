import type { Prisma } from '@prisma/client';
import {
  resultadoDoChecklist,
  type AprEtapa,
  type ChecklistResposta,
  type OsEpi,
  type OsRisco,
  type OsTreinamento,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { carimbar } from '../../lib/assinatura.js';
import { registrarAuditoria, type ContextoAuditoria } from '../../lib/auditoria.js';
import { NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';

/**
 * Etapa 23 — Documentacao Tecnica.
 *
 * Tres documentos que a fiscalizacao pede e que ate aqui viviam em papel:
 * a Ordem de Servico por funcao (NR-1), a APR da atividade e o checklist de
 * pre-uso do equipamento. Os tres sao FOTOGRAFIAS: gravam o conteudo no
 * momento da emissao e nao mudam quando a fonte muda.
 */

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const DIAS_A_VENCER = 30;

async function proximoCodigo(
  tx: Prisma.TransactionClient,
  modelo: 'ordemServico' | 'apr',
  prefixo: string,
): Promise<string> {
  const ultimo =
    modelo === 'ordemServico'
      ? await tx.ordemServico.findFirst({ orderBy: { codigo: 'desc' }, select: { codigo: true } })
      : await tx.apr.findFirst({ orderBy: { codigo: 'desc' }, select: { codigo: true } });

  const numero = ultimo ? Number(ultimo.codigo.replace(/\D/g, '')) + 1 : 1;
  return `${prefixo}-${String(numero).padStart(4, '0')}`;
}

/* -------------------------------------------------------------------------- */
/* Ordem de Servico                                                            */
/* -------------------------------------------------------------------------- */

const OS_COM_VINCULOS = {
  cliente: { select: { id: true, nomeFantasia: true } },
  colaborador: { select: { id: true, nome: true, cpf: true, matricula: true, funcao: true, setor: true } },
} satisfies Prisma.OrdemServicoInclude;

function situacaoDoTreinamento(validade: Date | null, hoje: Date): OsTreinamento['situacao'] {
  if (!validade) return 'EM_DIA';
  const dias = Math.ceil((validade.getTime() - hoje.getTime()) / MS_POR_DIA);
  if (dias < 0) return 'VENCIDO';
  if (dias <= DIAS_A_VENCER) return 'A_VENCER';
  return 'EM_DIA';
}

/**
 * Monta o conteudo da OS a partir dos cadastros do colaborador:
 * - riscos do inventario para a FUNCAO e para a AREA de lotacao;
 * - riscos ocupacionais declarados no proprio cadastro, quando o inventario
 *   nao os cobre (ficam como itens sem IIR);
 * - EPIs entregues (a ficha NR-06 e a prova do que ele tem em maos);
 * - treinamentos que a matriz exige para a funcao, com a situacao atual.
 */
async function montarConteudoOs(colaboradorId: string) {
  const colaborador = await prisma.colaborador.findUnique({
    where: { id: colaboradorId },
    include: {
      entregasEpi: { include: { epi: { select: { nome: true, ca: true } } }, orderBy: { data: 'desc' } },
      treinamentos: { include: { treinamento: { select: { id: true, nome: true, norma: true } } }, orderBy: { dataRealizacao: 'desc' } },
    },
  });
  if (!colaborador) throw new NaoEncontrado('Colaborador nao encontrado.', 'COLABORADOR_NAO_ENCONTRADO');

  const [riscosInventario, requisitos] = await Promise.all([
    prisma.inventarioRisco.findMany({
      where: {
        clienteId: colaborador.clienteId,
        situacao: { not: 'CONTROLADO' },
        OR: [
          { funcao: { equals: colaborador.funcao, mode: 'insensitive' } },
          ...(colaborador.areaId ? [{ areaId: colaborador.areaId }] : []),
        ],
      },
      orderBy: { iir: 'desc' },
    }),
    prisma.requisitoCapacitacao.findMany({
      where: { funcao: { equals: colaborador.funcao, mode: 'insensitive' } },
      include: { treinamento: { select: { id: true, nome: true, norma: true } } },
    }),
  ]);

  const riscos: OsRisco[] = riscosInventario.map((r) => ({
    tipo: r.tipo,
    perigo: r.perigo,
    danosPossiveis: r.danosPossiveis,
    grauRisco: r.grauRisco,
    iir: r.iir,
    controlesExistentes: r.controlesExistentes,
    medidasPropostas: r.medidasPropostas,
  }));

  // Riscos declarados no cadastro e ausentes do inventario entram como aviso.
  const perigosCobertos = new Set(riscos.map((r) => r.perigo.trim().toLowerCase()));
  for (const declarado of (colaborador.riscosOcupacionais ?? '').split(';').map((s) => s.trim()).filter(Boolean)) {
    if (!perigosCobertos.has(declarado.toLowerCase())) {
      riscos.push({
        tipo: 'DECLARADO',
        perigo: declarado,
        danosPossiveis: 'Risco declarado no cadastro do colaborador — sem avaliacao no inventario.',
        grauRisco: '-',
        iir: 0,
        controlesExistentes: null,
        medidasPropostas: null,
      });
    }
  }

  // Ultima entrega de cada EPI (o que ele tem em maos).
  const episVistos = new Set<string>();
  const episObrigatorios: OsEpi[] = [];
  for (const entrega of colaborador.entregasEpi) {
    const chave = `${entrega.epi.nome}|${entrega.epi.ca}`;
    if (episVistos.has(chave)) continue;
    episVistos.add(chave);
    episObrigatorios.push({ nome: entrega.epi.nome, ca: entrega.epi.ca, dataEntrega: entrega.data.toISOString().slice(0, 10) });
  }

  const hoje = new Date();
  const treinamentosExigidos: OsTreinamento[] = requisitos.map((req) => {
    const ultima = colaborador.treinamentos.find((t) => t.treinamentoId === req.treinamentoId);
    return {
      nome: req.treinamento.nome,
      norma: req.treinamento.norma,
      situacao: ultima ? situacaoDoTreinamento(ultima.validade, hoje) : 'NAO_REALIZADO',
    };
  });

  return { colaborador, riscos, episObrigatorios, treinamentosExigidos };
}

export async function gerarOrdemServico(
  dados: { colaboradorId: string; medidasPreventivas?: string | null },
  geradaPor: string,
  contexto: ContextoAuditoria = {},
) {
  const { colaborador, riscos, episObrigatorios, treinamentosExigidos } = await montarConteudoOs(dados.colaboradorId);

  if (riscos.length === 0) {
    throw new RequisicaoInvalida(
      'Nao ha riscos cadastrados para a funcao nem para a area deste colaborador. Cadastre no inventario de riscos antes de emitir a OS.',
      'OS_SEM_RISCOS',
    );
  }

  return prisma.$transaction(async (tx) => {
    // A OS anterior do colaborador vira SUBSTITUIDA; a nova recebe versao+1.
    const anterior = await tx.ordemServico.findFirst({
      where: { colaboradorId: colaborador.id, situacao: { not: 'SUBSTITUIDA' } },
      orderBy: { versao: 'desc' },
    });
    if (anterior) {
      await tx.ordemServico.update({ where: { id: anterior.id }, data: { situacao: 'SUBSTITUIDA' } });
    }

    const os = await tx.ordemServico.create({
      data: {
        clienteId: colaborador.clienteId,
        colaboradorId: colaborador.id,
        codigo: await proximoCodigo(tx, 'ordemServico', 'OS'),
        versao: (anterior?.versao ?? 0) + 1,
        funcao: colaborador.funcao,
        setor: colaborador.setor,
        grauRisco: colaborador.grauRisco,
        riscos: riscos as unknown as Prisma.InputJsonValue,
        episObrigatorios: episObrigatorios as unknown as Prisma.InputJsonValue,
        treinamentosExigidos: treinamentosExigidos as unknown as Prisma.InputJsonValue,
        medidasPreventivas: dados.medidasPreventivas ?? null,
        geradaPor,
      },
      include: OS_COM_VINCULOS,
    });

    await registrarAuditoria(tx, {
      entidade: 'OrdemServico',
      entidadeId: os.id,
      acao: 'CRIACAO',
      alteracoes: {
        codigo: { de: null, para: os.codigo },
        versao: { de: anterior?.versao ?? null, para: os.versao },
        riscos: { de: null, para: riscos.length },
      },
      contexto,
    });

    return os;
  });
}

export async function listarOrdensServico(filtro: {
  clienteId?: string;
  colaboradorId?: string;
  situacao?: 'EMITIDA' | 'ASSINADA' | 'SUBSTITUIDA';
  busca?: string;
  pagina: number;
  porPagina: number;
}) {
  const where: Prisma.OrdemServicoWhereInput = {};
  if (filtro.clienteId) where.clienteId = filtro.clienteId;
  if (filtro.colaboradorId) where.colaboradorId = filtro.colaboradorId;
  if (filtro.situacao) where.situacao = filtro.situacao;
  else where.situacao = { not: 'SUBSTITUIDA' };
  if (filtro.busca) {
    where.OR = [
      { codigo: { contains: filtro.busca, mode: 'insensitive' } },
      { funcao: { contains: filtro.busca, mode: 'insensitive' } },
      { colaborador: { nome: { contains: filtro.busca, mode: 'insensitive' } } },
    ];
  }

  const [total, itens] = await prisma.$transaction([
    prisma.ordemServico.count({ where }),
    prisma.ordemServico.findMany({
      where,
      orderBy: { geradaEm: 'desc' },
      skip: (filtro.pagina - 1) * filtro.porPagina,
      take: filtro.porPagina,
      include: OS_COM_VINCULOS,
    }),
  ]);

  return { itens, total, pagina: filtro.pagina, porPagina: filtro.porPagina, totalPaginas: Math.max(1, Math.ceil(total / filtro.porPagina)) };
}

export async function obterOrdemServicoOuFalhar(id: string) {
  const os = await prisma.ordemServico.findUnique({ where: { id }, include: OS_COM_VINCULOS });
  if (!os) throw new NaoEncontrado('Ordem de servico nao encontrada.', 'OS_NAO_ENCONTRADA');
  return os;
}

/** Ciencia do trabalhador: imagem da assinatura + carimbo sobre o conteudo da OS. */
export async function registrarCienciaOs(id: string, assinaturaUrl: string, assinatura: Buffer, contexto: ContextoAuditoria = {}) {
  const os = await obterOrdemServicoOuFalhar(id);
  if (os.situacao === 'SUBSTITUIDA') {
    throw new RequisicaoInvalida('Esta OS foi substituida por uma versao mais nova.', 'OS_SUBSTITUIDA');
  }

  const em = new Date();
  // O carimbo cobre a assinatura E o conteudo: trocar qualquer um dos dois o invalida.
  const hash = carimbar({
    conteudo: Buffer.concat([assinatura, Buffer.from(JSON.stringify({ riscos: os.riscos, epis: os.episObrigatorios, treinamentos: os.treinamentosExigidos }))]),
    signatario: os.colaborador.nome,
    momento: em,
  });

  return prisma.$transaction(async (tx) => {
    const atualizada = await tx.ordemServico.update({
      where: { id },
      data: { situacao: 'ASSINADA', cienciaEm: em, cienciaAssinaturaUrl: assinaturaUrl, cienciaHash: hash },
      include: OS_COM_VINCULOS,
    });
    await registrarAuditoria(tx, {
      entidade: 'OrdemServico',
      entidadeId: id,
      acao: 'ATUALIZACAO',
      alteracoes: { situacao: { de: os.situacao, para: 'ASSINADA' }, cienciaHash: { de: null, para: hash } },
      contexto,
    });
    return atualizada;
  });
}

/* -------------------------------------------------------------------------- */
/* APR                                                                         */
/* -------------------------------------------------------------------------- */

const APR_COM_VINCULOS = {
  cliente: { select: { id: true, nomeFantasia: true } },
  area: { select: { id: true, nome: true, codigo: true } },
  terceiro: { select: { id: true, nomeFantasia: true } },
} satisfies Prisma.AprInclude;

export async function listarAprs(filtro: {
  clienteId?: string;
  areaId?: string;
  situacao?: 'RASCUNHO' | 'APROVADA' | 'ENCERRADA';
  busca?: string;
  pagina: number;
  porPagina: number;
}) {
  const where: Prisma.AprWhereInput = {};
  if (filtro.clienteId) where.clienteId = filtro.clienteId;
  if (filtro.areaId) where.areaId = filtro.areaId;
  if (filtro.situacao) where.situacao = filtro.situacao;
  if (filtro.busca) {
    where.OR = [
      { codigo: { contains: filtro.busca, mode: 'insensitive' } },
      { atividade: { contains: filtro.busca, mode: 'insensitive' } },
      { responsavel: { contains: filtro.busca, mode: 'insensitive' } },
    ];
  }

  const [total, itens] = await prisma.$transaction([
    prisma.apr.count({ where }),
    prisma.apr.findMany({
      where,
      orderBy: { dataInicio: 'desc' },
      skip: (filtro.pagina - 1) * filtro.porPagina,
      take: filtro.porPagina,
      include: APR_COM_VINCULOS,
    }),
  ]);

  return { itens, total, pagina: filtro.pagina, porPagina: filtro.porPagina, totalPaginas: Math.max(1, Math.ceil(total / filtro.porPagina)) };
}

export async function obterAprOuFalhar(id: string) {
  const apr = await prisma.apr.findUnique({ where: { id }, include: APR_COM_VINCULOS });
  if (!apr) throw new NaoEncontrado('APR nao encontrada.', 'APR_NAO_ENCONTRADA');
  return apr;
}

export async function criarApr(
  dados: {
    clienteId: string;
    areaId?: string | null;
    terceiroId?: string | null;
    atividade: string;
    local?: string | null;
    dataInicio: Date;
    dataFim?: Date | null;
    responsavel: string;
    etapas: AprEtapa[];
  },
  contexto: ContextoAuditoria = {},
) {
  const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true } });
  if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');

  return prisma.$transaction(async (tx) => {
    const apr = await tx.apr.create({
      data: {
        ...dados,
        codigo: await proximoCodigo(tx, 'apr', 'APR'),
        etapas: dados.etapas as unknown as Prisma.InputJsonValue,
      },
      include: APR_COM_VINCULOS,
    });
    await registrarAuditoria(tx, {
      entidade: 'Apr',
      entidadeId: apr.id,
      acao: 'CRIACAO',
      alteracoes: { codigo: { de: null, para: apr.codigo }, etapas: { de: null, para: dados.etapas.length } },
      contexto,
    });
    return apr;
  });
}

/** So rascunho se edita. Aprovada ou encerrada exige nova versao. */
export async function atualizarApr(id: string, dados: Record<string, unknown>, contexto: ContextoAuditoria = {}) {
  const atual = await obterAprOuFalhar(id);
  if (atual.situacao !== 'RASCUNHO') {
    throw new RequisicaoInvalida(
      'APR aprovada ou encerrada nao pode ser editada — gere uma nova versao.',
      'APR_NAO_EDITAVEL',
      { detalhes: { situacao: atual.situacao } },
    );
  }

  const data: Prisma.AprUncheckedUpdateInput = { ...(dados as Prisma.AprUncheckedUpdateInput) };
  if (dados.etapas) data.etapas = dados.etapas as Prisma.InputJsonValue;

  return prisma.$transaction(async (tx) => {
    const apr = await tx.apr.update({ where: { id }, data, include: APR_COM_VINCULOS });
    await registrarAuditoria(tx, {
      entidade: 'Apr',
      entidadeId: id,
      acao: 'ATUALIZACAO',
      alteracoes: { campos: { de: null, para: Object.keys(dados).join(',') } },
      contexto,
    });
    return apr;
  });
}

/** Aprovar congela o conteudo e o carimba. */
export async function aprovarApr(id: string, aprovadaPor: string, contexto: ContextoAuditoria = {}) {
  const atual = await obterAprOuFalhar(id);
  if (atual.situacao !== 'RASCUNHO') {
    throw new RequisicaoInvalida('So um rascunho pode ser aprovado.', 'APR_NAO_RASCUNHO');
  }

  const em = new Date();
  const hash = carimbar({ conteudo: atual.etapas as object, signatario: aprovadaPor, momento: em });

  return prisma.$transaction(async (tx) => {
    const apr = await tx.apr.update({
      where: { id },
      data: { situacao: 'APROVADA', aprovadaPor, aprovadaEm: em, aprovacaoHash: hash },
      include: APR_COM_VINCULOS,
    });
    await registrarAuditoria(tx, {
      entidade: 'Apr',
      entidadeId: id,
      acao: 'ATUALIZACAO',
      alteracoes: { situacao: { de: 'RASCUNHO', para: 'APROVADA' }, aprovadaPor: { de: null, para: aprovadaPor } },
      contexto,
    });
    return apr;
  });
}

/** Nova versao: copia a APR (como rascunho) e encerra a anterior. */
export async function novaVersaoApr(id: string, contexto: ContextoAuditoria = {}) {
  const anterior = await obterAprOuFalhar(id);

  return prisma.$transaction(async (tx) => {
    if (anterior.situacao !== 'ENCERRADA') {
      await tx.apr.update({ where: { id }, data: { situacao: 'ENCERRADA' } });
    }
    const nova = await tx.apr.create({
      data: {
        clienteId: anterior.clienteId,
        areaId: anterior.areaId,
        terceiroId: anterior.terceiroId,
        codigo: anterior.codigo,
        versao: anterior.versao + 1,
        atividade: anterior.atividade,
        local: anterior.local,
        dataInicio: anterior.dataInicio,
        dataFim: anterior.dataFim,
        responsavel: anterior.responsavel,
        etapas: anterior.etapas as Prisma.InputJsonValue,
        situacao: 'RASCUNHO',
      },
      include: APR_COM_VINCULOS,
    });
    await registrarAuditoria(tx, {
      entidade: 'Apr',
      entidadeId: nova.id,
      acao: 'CRIACAO',
      alteracoes: { versaoDe: { de: null, para: id }, versao: { de: anterior.versao, para: nova.versao } },
      contexto,
    });
    return nova;
  });
}

export async function encerrarApr(id: string, contexto: ContextoAuditoria = {}) {
  const atual = await obterAprOuFalhar(id);
  return prisma.$transaction(async (tx) => {
    const apr = await tx.apr.update({ where: { id }, data: { situacao: 'ENCERRADA' }, include: APR_COM_VINCULOS });
    await registrarAuditoria(tx, {
      entidade: 'Apr',
      entidadeId: id,
      acao: 'ATUALIZACAO',
      alteracoes: { situacao: { de: atual.situacao, para: 'ENCERRADA' } },
      contexto,
    });
    return apr;
  });
}

export async function definirArquivoApr(id: string, url: string) {
  await obterAprOuFalhar(id);
  return prisma.apr.update({ where: { id }, data: { arquivoUrl: url }, include: APR_COM_VINCULOS });
}

/* -------------------------------------------------------------------------- */
/* Checklists de pre-uso                                                       */
/* -------------------------------------------------------------------------- */

export async function listarModelosChecklist(clienteId?: string, incluirInativos = false) {
  return prisma.modeloChecklist.findMany({
    where: { ...(clienteId ? { clienteId } : {}), ...(incluirInativos ? {} : { ativo: true }) },
    orderBy: [{ tipoEquipamento: 'asc' }, { nome: 'asc' }],
    include: { _count: { select: { execucoes: true } } },
  });
}

export async function obterModeloOuFalhar(id: string) {
  const modelo = await prisma.modeloChecklist.findUnique({ where: { id } });
  if (!modelo) throw new NaoEncontrado('Modelo de checklist nao encontrado.', 'CHECKLIST_NAO_ENCONTRADO');
  return modelo;
}

export async function criarModeloChecklist(
  dados: { clienteId: string; nome: string; tipoEquipamento: string; itens: unknown[]; ativo: boolean },
  contexto: ContextoAuditoria = {},
) {
  return prisma.$transaction(async (tx) => {
    const modelo = await tx.modeloChecklist.create({
      data: { ...dados, itens: dados.itens as Prisma.InputJsonValue },
    });
    await registrarAuditoria(tx, {
      entidade: 'ModeloChecklist',
      entidadeId: modelo.id,
      acao: 'CRIACAO',
      alteracoes: { nome: { de: null, para: modelo.nome }, itens: { de: null, para: dados.itens.length } },
      contexto,
    });
    return modelo;
  });
}

export async function atualizarModeloChecklist(id: string, dados: Record<string, unknown>, contexto: ContextoAuditoria = {}) {
  await obterModeloOuFalhar(id);
  const data: Prisma.ModeloChecklistUncheckedUpdateInput = { ...(dados as Prisma.ModeloChecklistUncheckedUpdateInput) };
  if (dados.itens) data.itens = dados.itens as Prisma.InputJsonValue;

  return prisma.$transaction(async (tx) => {
    const modelo = await tx.modeloChecklist.update({ where: { id }, data });
    await registrarAuditoria(tx, {
      entidade: 'ModeloChecklist',
      entidadeId: id,
      acao: 'ATUALIZACAO',
      alteracoes: { campos: { de: null, para: Object.keys(dados).join(',') } },
      contexto,
    });
    return modelo;
  });
}

const EXECUCAO_COM_VINCULOS = {
  modelo: { select: { id: true, nome: true, tipoEquipamento: true } },
  cliente: { select: { id: true, nomeFantasia: true } },
  area: { select: { id: true, nome: true, codigo: true } },
  colaborador: { select: { id: true, nome: true } },
} satisfies Prisma.ExecucaoChecklistInclude;

export async function listarExecucoesChecklist(filtro: {
  clienteId?: string;
  modeloId?: string;
  resultado?: 'APTO' | 'NAO_APTO';
  de?: Date;
  ate?: Date;
  pagina: number;
  porPagina: number;
}) {
  const where: Prisma.ExecucaoChecklistWhereInput = {};
  if (filtro.clienteId) where.clienteId = filtro.clienteId;
  if (filtro.modeloId) where.modeloId = filtro.modeloId;
  if (filtro.resultado) where.resultado = filtro.resultado;
  if (filtro.de || filtro.ate) {
    where.dataHora = { ...(filtro.de ? { gte: filtro.de } : {}), ...(filtro.ate ? { lte: filtro.ate } : {}) };
  }

  const [total, itens] = await prisma.$transaction([
    prisma.execucaoChecklist.count({ where }),
    prisma.execucaoChecklist.findMany({
      where,
      orderBy: { dataHora: 'desc' },
      skip: (filtro.pagina - 1) * filtro.porPagina,
      take: filtro.porPagina,
      include: EXECUCAO_COM_VINCULOS,
    }),
  ]);

  return { itens, total, pagina: filtro.pagina, porPagina: filtro.porPagina, totalPaginas: Math.max(1, Math.ceil(total / filtro.porPagina)) };
}

export async function obterExecucaoOuFalhar(id: string) {
  const execucao = await prisma.execucaoChecklist.findUnique({ where: { id }, include: EXECUCAO_COM_VINCULOS });
  if (!execucao) throw new NaoEncontrado('Execucao nao encontrada.', 'EXECUCAO_NAO_ENCONTRADA');
  return execucao;
}

/**
 * Registra a execucao: o resultado e DERIVADO das respostas (impeditivo nao
 * conforme reprova) e as respostas recebem carimbo com executor e momento.
 */
export async function registrarExecucaoChecklist(
  dados: {
    modeloId: string;
    areaId?: string | null;
    colaboradorId?: string | null;
    equipamentoIdentificacao: string;
    executadoPor: string;
    respostas: ChecklistResposta[];
  },
  contexto: ContextoAuditoria = {},
) {
  const modelo = await obterModeloOuFalhar(dados.modeloId);
  if (!modelo.ativo) throw new RequisicaoInvalida('Este modelo de checklist esta inativo.', 'CHECKLIST_INATIVO');

  const resultado = resultadoDoChecklist(dados.respostas);
  const em = new Date();
  const hash = carimbar({ conteudo: dados.respostas, signatario: dados.executadoPor, momento: em });

  return prisma.$transaction(async (tx) => {
    const execucao = await tx.execucaoChecklist.create({
      data: {
        clienteId: modelo.clienteId,
        modeloId: modelo.id,
        areaId: dados.areaId ?? null,
        colaboradorId: dados.colaboradorId ?? null,
        equipamentoIdentificacao: dados.equipamentoIdentificacao,
        executadoPor: dados.executadoPor,
        dataHora: em,
        respostas: dados.respostas as unknown as Prisma.InputJsonValue,
        resultado,
        hash,
      },
      include: EXECUCAO_COM_VINCULOS,
    });
    await registrarAuditoria(tx, {
      entidade: 'ExecucaoChecklist',
      entidadeId: execucao.id,
      acao: 'CRIACAO',
      alteracoes: { equipamento: { de: null, para: dados.equipamentoIdentificacao }, resultado: { de: null, para: resultado } },
      contexto,
    });
    return execucao;
  });
}

export async function definirFotoExecucao(id: string, url: string) {
  await obterExecucaoOuFalhar(id);
  return prisma.execucaoChecklist.update({ where: { id }, data: { fotoUrl: url }, include: EXECUCAO_COM_VINCULOS });
}

/** Indicadores do modulo para o painel: OS pendentes de ciencia, APRs abertas, reprovacoes recentes. */
export async function resumoDocumentacaoTecnica(clienteId?: string) {
  const porCliente = clienteId ? { clienteId } : {};
  const inicio30 = new Date(Date.now() - 30 * MS_POR_DIA);

  const [osEmitidas, osAssinadas, colaboradoresAtivos, aprsRascunho, aprsAprovadas, execucoes30, reprovadas30] =
    await prisma.$transaction([
      prisma.ordemServico.count({ where: { ...porCliente, situacao: 'EMITIDA' } }),
      prisma.ordemServico.count({ where: { ...porCliente, situacao: 'ASSINADA' } }),
      prisma.colaborador.count({ where: { ...porCliente, situacao: 'ATIVO' } }),
      prisma.apr.count({ where: { ...porCliente, situacao: 'RASCUNHO' } }),
      prisma.apr.count({ where: { ...porCliente, situacao: 'APROVADA' } }),
      prisma.execucaoChecklist.count({ where: { ...porCliente, dataHora: { gte: inicio30 } } }),
      prisma.execucaoChecklist.count({ where: { ...porCliente, dataHora: { gte: inicio30 }, resultado: 'NAO_APTO' } }),
    ]);

  return {
    os: { emitidas: osEmitidas, assinadas: osAssinadas, semOs: Math.max(0, colaboradoresAtivos - osEmitidas - osAssinadas) },
    apr: { rascunho: aprsRascunho, aprovadas: aprsAprovadas },
    checklist: { ultimos30Dias: execucoes30, reprovados30Dias: reprovadas30 },
  };
}
