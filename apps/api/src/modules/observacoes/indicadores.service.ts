import type { Prisma } from '@prisma/client';
import {
  CONTAGEM_VAZIA,
  calcularIcsg,
  calcularIndicadoresBbs,
  calcularMapaCalor,
  calcularPareto,
  calcularTendencia,
  montarPiramideBird,
  type ContagemObservacoes,
  type IndicadoresFiltro,
  type TipoObservacao,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { obterEmpresaOuFalhar } from '../empresa/empresa.service.js';
import { montarWhere } from './observacao.service.js';
import { resumoPlanos } from '../planos/plano.service.js';

/**
 * Painel BBS montado a partir das observacoes reais.
 *
 * Toda a matematica vem de `@safetyguard/shared` — aqui so buscamos os numeros
 * no banco e entregamos ao motor de indicadores. Nenhuma formula e reescrita.
 */

const MESES_PT = [
  'Janeiro',
  'Fevereiro',
  'Marco',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/** Primeiro dia do mes, N meses atras — inicio da janela da tendencia. */
function inicioDaJanela(meses: number, referencia = new Date()): Date {
  const inicio = new Date(referencia.getFullYear(), referencia.getMonth() - (meses - 1), 1);
  inicio.setHours(0, 0, 0, 0);
  return inicio;
}

function rotuloDoMes(data: Date): string {
  return `${MESES_PT[data.getMonth()]}/${String(data.getFullYear()).slice(2)}`;
}

export async function painelBbs(filtro: IndicadoresFiltro) {
  const empresa = await obterEmpresaOuFalhar();
  const where = montarWhere(empresa.id, filtro);

  /* --- 1. Distribuicao por tipo -> ICS e ICI ----------------------------- */
  const porTipo = await prisma.observacao.groupBy({
    by: ['tipo'],
    where,
    orderBy: { tipo: 'asc' },
    _count: { _all: true },
  });

  const contagem: ContagemObservacoes = { ...CONTAGEM_VAZIA };
  for (const linha of porTipo) {
    contagem[linha.tipo as TipoObservacao] = linha._count._all;
  }

  const bbs = calcularIndicadoresBbs(contagem);

  /* --- 2. Pareto por causa ------------------------------------------------ */
  async function paretoDoTipo(tipo: TipoObservacao) {
    const linhas = await prisma.observacao.groupBy({
      by: ['causaId'],
      where: { ...where, tipo, causaId: { not: null } },
      orderBy: { causaId: 'asc' },
      _count: { _all: true },
    });

    if (linhas.length === 0) return [];

    const causas = await prisma.causaDesvio.findMany({
      where: { id: { in: linhas.map((linha) => linha.causaId!).filter(Boolean) } },
      select: { id: true, descricao: true },
    });
    const descricaoPorId = new Map(causas.map((causa) => [causa.id, causa.descricao]));

    return calcularPareto(
      linhas.map((linha) => ({
        causa: descricaoPorId.get(linha.causaId!) ?? 'Nao classificado',
        quantidade: linha._count._all,
      })),
      filtro.topCausas,
    );
  }

  const [paretoComportamentos, paretoCondicoes] = await Promise.all([
    paretoDoTipo('COMPORTAMENTO_INSEGURO'),
    paretoDoTipo('CONDICAO_INSEGURA'),
  ]);

  /* --- 3. Tendencia mensal ------------------------------------------------ */
  const inicio = filtro.de ?? inicioDaJanela(filtro.meses);
  const desviosNoPeriodo = await prisma.observacao.findMany({
    where: {
      ...where,
      tipo: { in: ['COMPORTAMENTO_INSEGURO', 'CONDICAO_INSEGURA'] },
      dataHora: { gte: inicio, ...(filtro.ate ? { lte: filtro.ate } : {}) },
    },
    select: { tipo: true, dataHora: true },
  });

  const baldes = new Map<string, { periodo: string; comportamentosInseguros: number; condicoesInseguras: number }>();
  const fim = filtro.ate ?? new Date();
  for (let cursor = new Date(inicio); cursor <= fim; cursor.setMonth(cursor.getMonth() + 1)) {
    const chave = `${cursor.getFullYear()}-${cursor.getMonth()}`;
    baldes.set(chave, { periodo: rotuloDoMes(cursor), comportamentosInseguros: 0, condicoesInseguras: 0 });
  }

  for (const desvio of desviosNoPeriodo) {
    const chave = `${desvio.dataHora.getFullYear()}-${desvio.dataHora.getMonth()}`;
    const balde = baldes.get(chave);
    if (!balde) continue;
    if (desvio.tipo === 'COMPORTAMENTO_INSEGURO') balde.comportamentosInseguros += 1;
    else balde.condicoesInseguras += 1;
  }

  const tendencia = calcularTendencia([...baldes.values()]);

  /* --- 4. Mapa de calor por area ----------------------------------------- */
  const porArea = await prisma.observacao.groupBy({
    by: ['areaId', 'tipo'],
    where: { ...where, tipo: { in: ['COMPORTAMENTO_INSEGURO', 'CONDICAO_INSEGURA'] } },
    orderBy: { areaId: 'asc' },
    _count: { _all: true },
  });

  const areas = await prisma.area.findMany({
    where: { id: { in: [...new Set(porArea.map((linha) => linha.areaId))] } },
    select: { id: true, nome: true, codigo: true },
  });
  const nomePorArea = new Map(areas.map((area) => [area.id, `${area.nome} (${area.codigo})`]));

  const acumuladoPorArea = new Map<string, { comportamentosInseguros: number; condicoesInseguras: number }>();
  for (const linha of porArea) {
    const atual = acumuladoPorArea.get(linha.areaId) ?? { comportamentosInseguros: 0, condicoesInseguras: 0 };
    if (linha.tipo === 'COMPORTAMENTO_INSEGURO') atual.comportamentosInseguros += linha._count._all;
    else atual.condicoesInseguras += linha._count._all;
    acumuladoPorArea.set(linha.areaId, atual);
  }

  const mapaCalor = calcularMapaCalor(
    [...acumuladoPorArea.entries()].map(([areaId, valores]) => ({
      area: nomePorArea.get(areaId) ?? 'Area removida',
      ...valores,
    })),
  );

  /* --- 5. Piramide de Bird ------------------------------------------------ */
  const porBird = await prisma.observacao.groupBy({
    by: ['classificacaoBird'],
    where: { ...where, classificacaoBird: { not: null } },
    orderBy: { classificacaoBird: 'asc' },
    _count: { _all: true },
  });

  const contagemBird: Record<string, number> = { ATOS_E_CONDICOES: bbs.comportamentosInseguros + bbs.condicoesInseguras };
  for (const linha of porBird) {
    if (linha.classificacaoBird) contagemBird[linha.classificacaoBird] = linha._count._all;
  }

  const piramide = montarPiramideBird(contagemBird);

  /* --- 6. Indice de Cultura de Seguranca ---------------------------------- */
  // O pilar de plano de acao vem da Etapa 7. Inspecoes programadas e
  // treinamentos ainda nao tem fonte: o motor ignora os ausentes e
  // renormaliza os pesos restantes.
  const planos = await resumoPlanos({
    clienteId: filtro.clienteId,
    centroNegocioId: filtro.centroNegocioId,
    areaId: filtro.areaId,
    terceiroId: filtro.terceiroId,
  });

  const icsg = calcularIcsg({
    COMPORTAMENTOS_SEGUROS: bbs.totalBbs > 0 ? bbs.ics : null,
    CONDICOES_INSEGURAS: bbs.totalBbs > 0 ? bbs.ici : null,
    PLANO_ACAO_CONCLUIDO: planos.percentualConcluido,
  });

  return {
    periodo: {
      de: filtro.de ?? inicio,
      ate: filtro.ate ?? fim,
      meses: filtro.meses,
    },
    bbs,
    icsg,
    planos,
    pareto: { comportamentosInseguros: paretoComportamentos, condicoesInseguras: paretoCondicoes },
    tendencia,
    mapaCalor,
    piramideBird: piramide,
  };
}

/** Cards da listagem de observacoes. */
export async function resumoObservacoes(filtro: Partial<IndicadoresFiltro>) {
  const empresa = await obterEmpresaOuFalhar();
  const where: Prisma.ObservacaoWhereInput = montarWhere(empresa.id, filtro);
  const agora = new Date();

  const [total, registradas, emTratativa, concluidas, vencidas] = await prisma.$transaction([
    prisma.observacao.count({ where }),
    prisma.observacao.count({ where: { ...where, situacao: 'REGISTRADA' } }),
    prisma.observacao.count({ where: { ...where, situacao: 'EM_TRATATIVA' } }),
    prisma.observacao.count({ where: { ...where, situacao: 'CONCLUIDA' } }),
    prisma.observacao.count({
      where: {
        ...where,
        situacao: { in: ['REGISTRADA', 'EM_TRATATIVA'] },
        prazoLimite: { lt: agora },
      },
    }),
  ]);

  return { total, registradas, emTratativa, concluidas, prazoVencido: vencidas };
}
