import { prisma } from '../../db.js';
import { obterEmpresaOuFalhar } from '../empresa/empresa.service.js';

const PADRAO: ParametrosFinanceiros = {
  clienteId: null,
  custoAcidenteComAfastamento: 50000,
  custoAcidenteSemAfastamento: 5000,
  custoDiaAfastamento: 300,
  custoHoraParadaProducao: 2000,
  custoMultaNrMedia: 20000,
  fatorPreventivoBbs: 0.3,
  valorContratoMensal: null,
};

interface ParametrosFinanceiros {
  clienteId?: string | null;
  custoAcidenteComAfastamento: number;
  custoAcidenteSemAfastamento: number;
  custoDiaAfastamento: number;
  custoHoraParadaProducao: number;
  custoMultaNrMedia: number;
  fatorPreventivoBbs: number;
  valorContratoMensal: number | null;
}

type ParametrosFinanceirosInput = Partial<ParametrosFinanceiros> & {
  clienteId?: string | null;
};

/** Retorna os parâmetros de custo do cliente. Se não cadastrado, usa o padrão global ou os defaults. */
export async function obterParametros(clienteId?: string): Promise<ParametrosFinanceiros> {
  if (clienteId) {
    const especifico = await prisma.parametrosFinanceiros.findUnique({ where: { clienteId } });
    if (especifico) return { ...especifico, fatorPreventivoBbs: Number(especifico.fatorPreventivoBbs) };
  }

  const global = await prisma.parametrosFinanceiros.findFirst({ where: { clienteId: null } });
  if (global) return { ...global, fatorPreventivoBbs: Number(global.fatorPreventivoBbs) };

  return { ...PADRAO, clienteId: clienteId ?? null };
}

/** Cria ou atualiza os parâmetros de custo de um cliente (ou o padrão global). */
function normalizarParametros(dados: ParametrosFinanceirosInput): ParametrosFinanceiros {
  return {
    clienteId: dados.clienteId ?? null,
    custoAcidenteComAfastamento: dados.custoAcidenteComAfastamento ?? PADRAO.custoAcidenteComAfastamento,
    custoAcidenteSemAfastamento: dados.custoAcidenteSemAfastamento ?? PADRAO.custoAcidenteSemAfastamento,
    custoDiaAfastamento: dados.custoDiaAfastamento ?? PADRAO.custoDiaAfastamento,
    custoHoraParadaProducao: dados.custoHoraParadaProducao ?? PADRAO.custoHoraParadaProducao,
    custoMultaNrMedia: dados.custoMultaNrMedia ?? PADRAO.custoMultaNrMedia,
    fatorPreventivoBbs: dados.fatorPreventivoBbs ?? PADRAO.fatorPreventivoBbs,
    valorContratoMensal: dados.valorContratoMensal ?? PADRAO.valorContratoMensal,
  };
}

export async function salvarParametros(
  dados: ParametrosFinanceirosInput,
): Promise<ParametrosFinanceiros> {
  const normalizados = normalizarParametros(dados);
  const chave = normalizados.clienteId ?? null;
  const record = await prisma.parametrosFinanceiros.upsert({
    where: { clienteId: chave ?? undefined },
    create: {
      clienteId: chave,
      custoAcidenteComAfastamento: normalizados.custoAcidenteComAfastamento,
      custoAcidenteSemAfastamento: normalizados.custoAcidenteSemAfastamento,
      custoDiaAfastamento: normalizados.custoDiaAfastamento,
      custoHoraParadaProducao: normalizados.custoHoraParadaProducao,
      custoMultaNrMedia: normalizados.custoMultaNrMedia,
      fatorPreventivoBbs: normalizados.fatorPreventivoBbs,
      valorContratoMensal: normalizados.valorContratoMensal ?? null,
    },
    update: {
      custoAcidenteComAfastamento: normalizados.custoAcidenteComAfastamento,
      custoAcidenteSemAfastamento: normalizados.custoAcidenteSemAfastamento,
      custoDiaAfastamento: normalizados.custoDiaAfastamento,
      custoHoraParadaProducao: normalizados.custoHoraParadaProducao,
      custoMultaNrMedia: normalizados.custoMultaNrMedia,
      fatorPreventivoBbs: normalizados.fatorPreventivoBbs,
      valorContratoMensal: normalizados.valorContratoMensal ?? null,
    },
  });
  return {
    clienteId: record.clienteId ?? null,
    custoAcidenteComAfastamento: Number(record.custoAcidenteComAfastamento),
    custoAcidenteSemAfastamento: Number(record.custoAcidenteSemAfastamento),
    custoDiaAfastamento: Number(record.custoDiaAfastamento),
    custoHoraParadaProducao: Number(record.custoHoraParadaProducao),
    custoMultaNrMedia: Number(record.custoMultaNrMedia),
    fatorPreventivoBbs: Number(record.fatorPreventivoBbs),
    valorContratoMensal: record.valorContratoMensal ? Number(record.valorContratoMensal) : null,
  };
}

/** Calcula os indicadores financeiros do período. */
export async function calcularIndicadores(clienteId?: string, meses = 12) {
  const empresa = await obterEmpresaOuFalhar();
  const params = await obterParametros(clienteId);

  const inicio = new Date();
  inicio.setMonth(inicio.getMonth() - meses);

  const base: { empresaId?: string; clienteId?: string } = {};
  if (clienteId) {
    base.clienteId = clienteId;
  }

  // Busca acidentes do período
  const acidentes = await prisma.acidente.findMany({
    where: {
      cliente: { empresaId: empresa.id },
      ...(clienteId ? { clienteId } : {}),
      data: { gte: inicio },
    },
    select: { id: true, comAfastamento: true, diasAfastamento: true },
  });

  const acidentesComAfastamento = acidentes.filter((a) => a.comAfastamento).length;
  const acidentesSemAfastamento = acidentes.filter((a) => !a.comAfastamento).length;
  const totalDiasAfastamentoAcidente = acidentes.reduce((s, a) => s + a.diasAfastamento, 0);

  // Busca afastamentos de saúde do período (inclui doenças, etc.)
  const afastamentos = await prisma.afastamento.findMany({
    where: {
      cliente: { empresaId: empresa.id },
      ...(clienteId ? { clienteId } : {}),
      dataInicio: { gte: inicio },
    },
    select: { diasAfastamento: true },
  });
  const totalDiasAfastamentoSaude = afastamentos.reduce((s, a) => s + a.diasAfastamento, 0);

  // BBS: taxa de conformidade média (observações positivas / total)
  const [totalObs, obsPositivas] = await Promise.all([
    prisma.observacao.count({
      where: {
        cliente: { empresaId: empresa.id },
        ...(clienteId ? { clienteId } : {}),
        dataHora: { gte: inicio },
      },
    }),
    prisma.observacao.count({
      where: {
        cliente: { empresaId: empresa.id },
        ...(clienteId ? { clienteId } : {}),
        dataHora: { gte: inicio },
        tipo: 'COMPORTAMENTO_SEGURO',
      },
    }),
  ]);

  const conformidadeBbs = totalObs > 0 ? obsPositivas / totalObs : 0;

  // Custo incorrido: soma dos custos reais registrados
  const custoAcidentes =
    acidentesComAfastamento * params.custoAcidenteComAfastamento +
    acidentesSemAfastamento * params.custoAcidenteSemAfastamento;
  const custoAfastamentos =
    (totalDiasAfastamentoAcidente + totalDiasAfastamentoSaude) * params.custoDiaAfastamento;
  const custoTotalIncorrido = custoAcidentes + custoAfastamentos;

  // Custo evitado estimado:
  // Fórmula: acidentes_que_ocorreram × (fator_preventivo ÷ (1 - fator_preventivo)) × custo_médio
  // Isso estima quantos acidentes a mais teriam ocorrido sem o programa BBS.
  const fator = Math.min(0.9, Math.max(0, params.fatorPreventivoBbs * conformidadeBbs));
  const acidentesEvitadosEstimados =
    totalObs > 0 ? Math.round(acidentes.length * (fator / Math.max(0.01, 1 - fator))) : 0;
  const custoEvitadoEstimado =
    acidentesEvitadosEstimados *
    ((params.custoAcidenteComAfastamento * 0.6 + params.custoAcidenteSemAfastamento * 0.4));

  // ROI = (custo evitado - custo do contrato) / custo do contrato × 100
  const custoContratoNoPeriodo = params.valorContratoMensal ? params.valorContratoMensal * meses : null;
  const roi =
    custoContratoNoPeriodo && custoContratoNoPeriodo > 0
      ? Math.round(((custoEvitadoEstimado - custoContratoNoPeriodo) / custoContratoNoPeriodo) * 100)
      : null;

  return {
    periodo: { inicio, meses },
    parametros: params,
    incorrido: {
      acidentesComAfastamento,
      acidentesSemAfastamento,
      totalAcidentes: acidentes.length,
      totalDiasAfastamento: totalDiasAfastamentoAcidente + totalDiasAfastamentoSaude,
      custoAcidentes: Math.round(custoAcidentes),
      custoAfastamentos: Math.round(custoAfastamentos),
      total: Math.round(custoTotalIncorrido),
    },
    evitado: {
      conformidadeBbs: Math.round(conformidadeBbs * 100),
      totalObservacoes: totalObs,
      acidentesEvitadosEstimados,
      custoEvitadoEstimado: Math.round(custoEvitadoEstimado),
    },
    roi: {
      custoContrato: custoContratoNoPeriodo ? Math.round(custoContratoNoPeriodo) : null,
      percentual: roi,
      semContratoCadastrado: custoContratoNoPeriodo === null,
    },
  };
}
