import type { Prisma } from '@prisma/client';
import {
  CATALOGO_DOCUMENTOS,
  ROTULO_TIPO_DOCUMENTO,
  calcularConformidade,
  calcularIcl,
  diasAteVencer,
  percentual,
  situacaoDaValidade,
  urgenciaDaRenovacao,
  type SituacaoVencimento,
  type UrgenciaRenovacao,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';

/**
 * Painel de conformidade legal (Etapa 9).
 *
 * Responde as tres perguntas que uma fiscalizacao faz: quem esta apto, quais
 * documentos estao vigentes e o que vence a seguir.
 */

export interface FiltroConformidade {
  clienteId?: string;
  terceiroId?: string;
  /** Janela da fila de renovacao, em dias. */
  janelaDias?: number;
}

const JANELA_PADRAO = 90;

/* -------------------------------------------------------------------------- */
/* Saude ocupacional                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Conformidade de ASO por colaborador ativo.
 *
 * O denominador e o **colaborador**, e nao o ASO: dez atestados vencidos da
 * mesma pessoa sao uma pendencia, nao dez. E quem nunca fez exame entra como
 * irregular, e nao como ausente da conta.
 */
async function conformidadeDeSaude(filtro: FiltroConformidade, hoje: Date) {
  const where: Prisma.ColaboradorWhereInput = { situacao: { not: 'DESLIGADO' } };
  if (filtro.clienteId) where.clienteId = filtro.clienteId;
  if (filtro.terceiroId) where.terceiroId = filtro.terceiroId;

  const colaboradores = await prisma.colaborador.findMany({
    where,
    select: {
      id: true,
      nome: true,
      cpf: true,
      funcao: true,
      grauRisco: true,
      clienteId: true,
      cliente: { select: { nomeFantasia: true } },
      terceiro: { select: { nomeFantasia: true } },
      asos: {
        where: { tipo: { not: 'DEMISSIONAL' } },
        orderBy: { dataExame: 'desc' },
        take: 1,
        select: { id: true, tipo: true, dataExame: true, validade: true, resultado: true },
      },
    },
  });

  const linhas = colaboradores.map((colaborador) => {
    const [ultimo] = colaborador.asos;
    const situacao: SituacaoVencimento | 'SEM_ASO' = ultimo ? situacaoDaValidade(ultimo.validade, hoje) : 'SEM_ASO';

    return {
      colaboradorId: colaborador.id,
      nome: colaborador.nome,
      funcao: colaborador.funcao,
      grauRisco: colaborador.grauRisco,
      clienteId: colaborador.clienteId,
      cliente: colaborador.cliente.nomeFantasia,
      terceiro: colaborador.terceiro?.nomeFantasia ?? null,
      asoId: ultimo?.id ?? null,
      dataExame: ultimo?.dataExame ?? null,
      validade: ultimo?.validade ?? null,
      resultado: ultimo?.resultado ?? null,
      situacao,
      diasParaVencer: ultimo ? diasAteVencer(ultimo.validade, hoje) : null,
      impedido: !ultimo || situacao === 'VENCIDO' || ultimo.resultado === 'INAPTO',
    };
  });

  // Quem nunca fez exame entra na conta como item sem validade — pendencia,
  // e nao "sem dado".
  const resumo = calcularConformidade(
    linhas.map((linha) => ({ validade: linha.validade })),
    hoje,
  );

  return {
    resumo,
    linhas,
    semAso: linhas.filter((linha) => linha.situacao === 'SEM_ASO').length,
    inaptos: linhas.filter((linha) => linha.resultado === 'INAPTO').length,
    comRestricao: linhas.filter((linha) => linha.resultado === 'APTO_COM_RESTRICAO').length,
    impedidos: linhas.filter((linha) => linha.impedido).length,
    colaboradoresAtivos: linhas.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Documentacao legal                                                          */
/* -------------------------------------------------------------------------- */

async function conformidadeDeDocumentos(filtro: FiltroConformidade, hoje: Date) {
  const where: Prisma.DocumentoSsmaWhereInput = { situacao: 'ATIVO' };
  if (filtro.clienteId) where.clienteId = filtro.clienteId;
  if (filtro.terceiroId) where.terceiroId = filtro.terceiroId;

  const documentos = await prisma.documentoSsma.findMany({
    where,
    select: { id: true, tipo: true, titulo: true, validade: true, clienteId: true },
  });

  const resumo = calcularConformidade(documentos, hoje);

  // Consolidado por tipo: mostra qual programa esta furando, e nao apenas
  // que "existem 12 documentos vencidos".
  const porTipo = CATALOGO_DOCUMENTOS.map((definicao) => {
    const doTipo = documentos.filter((documento) => documento.tipo === definicao.tipo);
    const parcial = calcularConformidade(doTipo, hoje);

    return {
      tipo: definicao.tipo,
      rotulo: definicao.rotulo,
      categoria: definicao.categoria,
      total: doTipo.length,
      vigentes: parcial.vigentes,
      aVencer: parcial.aVencer,
      vencidos: parcial.vencidos,
      semValidade: parcial.semValidade,
      percentualConformidade: parcial.percentualConformidade,
    };
  }).filter((linha) => linha.total > 0);

  return { resumo, porTipo, total: documentos.length };
}

/* -------------------------------------------------------------------------- */
/* Fila de renovacao                                                           */
/* -------------------------------------------------------------------------- */

export interface ItemRenovacao {
  origem: 'ASO' | 'DOCUMENTO';
  id: string;
  descricao: string;
  referente: string;
  clienteId: string;
  validade: Date | null;
  diasParaVencer: number | null;
  urgencia: UrgenciaRenovacao;
}

const ORDEM_URGENCIA: Record<UrgenciaRenovacao, number> = {
  VENCIDO: 0,
  CRITICO: 1,
  ATENCAO: 2,
  PROGRAMADO: 3,
};

/**
 * O que exige acao, em uma lista so — ASO e documento misturados e ordenados
 * pelo que aperta primeiro. E a fila de trabalho da renovacao.
 */
export async function filaDeRenovacao(filtro: FiltroConformidade = {}, hoje = new Date()): Promise<ItemRenovacao[]> {
  const janela = filtro.janelaDias ?? JANELA_PADRAO;
  const limite = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  limite.setDate(limite.getDate() + janela);

  const ondeDocumento: Prisma.DocumentoSsmaWhereInput = {
    situacao: 'ATIVO',
    validade: { not: null, lte: limite },
    ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
    ...(filtro.terceiroId ? { terceiroId: filtro.terceiroId } : {}),
  };

  // So o ASO **atual** de cada colaborador entra na fila. Buscar todos os ASO
  // vencidos traria os admissionais antigos, ja substituidos por um periodico
  // valido — a fila encheria de pendencia que nao existe.
  const [colaboradores, documentos] = await Promise.all([
    prisma.colaborador.findMany({
      where: {
        situacao: { not: 'DESLIGADO' },
        ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
        ...(filtro.terceiroId ? { terceiroId: filtro.terceiroId } : {}),
      },
      select: {
        nome: true,
        funcao: true,
        clienteId: true,
        asos: {
          where: { tipo: { not: 'DEMISSIONAL' } },
          orderBy: { dataExame: 'desc' },
          take: 1,
          select: { id: true, tipo: true, validade: true },
        },
      },
    }),
    prisma.documentoSsma.findMany({
      where: ondeDocumento,
      orderBy: { validade: 'asc' },
      take: 300,
      select: { id: true, tipo: true, titulo: true, validade: true, clienteId: true },
    }),
  ]);

  const itens: ItemRenovacao[] = [];

  for (const colaborador of colaboradores) {
    const [atual] = colaborador.asos;
    if (!atual || !atual.validade || atual.validade > limite) continue;

    const urgencia = urgenciaDaRenovacao(atual.validade, hoje);
    if (!urgencia) continue;

    itens.push({
      origem: 'ASO',
      id: atual.id,
      descricao: `ASO ${atual.tipo.toLowerCase().replace(/_/g, ' ')}`,
      referente: `${colaborador.nome} — ${colaborador.funcao}`,
      clienteId: colaborador.clienteId,
      validade: atual.validade,
      diasParaVencer: diasAteVencer(atual.validade, hoje),
      urgencia,
    });
  }

  for (const documento of documentos) {
    const urgencia = urgenciaDaRenovacao(documento.validade, hoje);
    if (!urgencia) continue;

    itens.push({
      origem: 'DOCUMENTO',
      id: documento.id,
      descricao: ROTULO_TIPO_DOCUMENTO[documento.tipo],
      referente: documento.titulo,
      clienteId: documento.clienteId,
      validade: documento.validade,
      diasParaVencer: diasAteVencer(documento.validade, hoje),
      urgencia,
    });
  }

  return itens.sort((a, b) => {
    const porUrgencia = ORDEM_URGENCIA[a.urgencia] - ORDEM_URGENCIA[b.urgencia];
    if (porUrgencia !== 0) return porUrgencia;
    return (a.diasParaVencer ?? 0) - (b.diasParaVencer ?? 0);
  });
}

/* -------------------------------------------------------------------------- */
/* Painel                                                                      */
/* -------------------------------------------------------------------------- */

/** Painel completo: ICL, saude, documentos, fila e ranking por cliente. */
export async function painelConformidade(filtro: FiltroConformidade = {}) {
  const hoje = new Date();

  const [saude, documentos, fila] = await Promise.all([
    conformidadeDeSaude(filtro, hoje),
    conformidadeDeDocumentos(filtro, hoje),
    filaDeRenovacao(filtro, hoje),
  ]);

  const icl = calcularIcl(saude.resumo, documentos.resumo);

  // Ranking por cliente so faz sentido na visao consolidada.
  const porCliente = filtro.clienteId ? [] : montarRankingPorCliente(saude, documentos);

  return {
    geradoEm: hoje,
    filtro,
    icl,
    saude: {
      ...saude.resumo,
      colaboradoresAtivos: saude.colaboradoresAtivos,
      semAso: saude.semAso,
      inaptos: saude.inaptos,
      comRestricao: saude.comRestricao,
      impedidos: saude.impedidos,
      /** Quem esta impedido de trabalhar — a pendencia que para a operacao. */
      pendencias: saude.linhas.filter((linha) => linha.impedido).slice(0, 50),
    },
    documentos: {
      ...documentos.resumo,
      porTipo: documentos.porTipo,
    },
    renovacao: {
      janelaDias: filtro.janelaDias ?? JANELA_PADRAO,
      total: fila.length,
      vencidos: fila.filter((item) => item.urgencia === 'VENCIDO').length,
      criticos: fila.filter((item) => item.urgencia === 'CRITICO').length,
      itens: fila.slice(0, 100),
    },
    porCliente,
  };
}

type ResumoSaude = Awaited<ReturnType<typeof conformidadeDeSaude>>;
type ResumoDocumentos = Awaited<ReturnType<typeof conformidadeDeDocumentos>>;

/** Comparativo entre clientes — a mesma leitura do ranking de desempenho. */
function montarRankingPorCliente(saude: ResumoSaude, _documentos: ResumoDocumentos) {
  const porCliente = new Map<string, { clienteId: string; cliente: string; total: number; emDia: number; impedidos: number }>();

  for (const linha of saude.linhas) {
    const atual = porCliente.get(linha.clienteId) ?? {
      clienteId: linha.clienteId,
      cliente: linha.cliente,
      total: 0,
      emDia: 0,
      impedidos: 0,
    };

    atual.total += 1;
    if (linha.situacao === 'VIGENTE' || linha.situacao === 'A_VENCER') atual.emDia += 1;
    if (linha.impedido) atual.impedidos += 1;

    porCliente.set(linha.clienteId, atual);
  }

  return [...porCliente.values()]
    .map((linha) => ({ ...linha, percentualAsoEmDia: percentual(linha.emDia, linha.total) }))
    .sort((a, b) => b.percentualAsoEmDia - a.percentualAsoEmDia);
}
