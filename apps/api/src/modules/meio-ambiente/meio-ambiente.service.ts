import type { Prisma } from '@prisma/client';
import {
  CONDICOES_ASPECTO,
  ROTULO_TIPO_DOCUMENTO,
  TIPOS_DOCUMENTO_AMBIENTAL,
  situacaoDaValidade,
  type CondicaoAspecto,
  type SituacaoVencimento,
  type TipoDocumento,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';

/**
 * Etapa 24 — Dashboard de Meio Ambiente.
 *
 * Agrega, por cliente (ou todos) e janela de N meses:
 * - ocorrencias ambientais por mes (total, contidas, grau I);
 * - leituras ESG por mes (agua, energia, residuos, % reciclagem, tCO2);
 * - aspectos ambientais (total, significativos, por condicao);
 * - documentos ambientais do acervo legal: um por tipo, com a situacao da
 *   validade do documento vigente — ou AUSENTE quando o cliente nao tem.
 *
 * Tudo calculado em memoria a partir de consultas enxutas: a janela maxima
 * e de 36 meses e os volumes sao pequenos (uma leitura por mes por cliente).
 */

export interface OcorrenciasDoMes {
  competencia: string;
  total: number;
  contidas: number;
  grauI: number;
}

export interface LeituraEsgDoMes {
  competencia: string;
  aguaM3: number | null;
  energiaKwh: number | null;
  residuosKg: number | null;
  residuosRecicladosKg: number | null;
  /** Reciclados / gerados, em %. `null` sem residuos informados. */
  percentualReciclagem: number | null;
  emissoesTco2: number | null;
}

/** Situacao de cobertura: a de validade do documento vigente, ou AUSENTE. */
export type SituacaoDocumentoAmbiental = SituacaoVencimento | 'AUSENTE';

export interface DocumentoAmbientalDoDashboard {
  tipo: TipoDocumento;
  rotulo: string;
  situacao: SituacaoDocumentoAmbiental;
  documentoId: string | null;
  titulo: string | null;
  versao: number | null;
  validade: Date | null;
  arquivoUrl: string | null;
}

export interface DashboardMeioAmbiente {
  periodo: { inicio: string; fim: string; meses: number };
  ocorrenciasPorMes: OcorrenciasDoMes[];
  esgPorMes: LeituraEsgDoMes[];
  aspectos: {
    total: number;
    significativos: number;
    porCondicao: Record<CondicaoAspecto, number>;
  };
  documentos: DocumentoAmbientalDoDashboard[];
  resumoDocumentos: Record<SituacaoDocumentoAmbiental, number>;
}

/** Chave "AAAA-MM" em UTC — colunas `@db.Date` chegam como meia-noite UTC. */
function chaveDoMes(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Lista das competencias da janela, da mais antiga a atual. */
function competenciasDaJanela(inicio: Date, meses: number): string[] {
  const chaves: string[] = [];
  for (let i = 0; i < meses; i += 1) {
    chaves.push(chaveDoMes(new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + i, 1))));
  }
  return chaves;
}

function numeroOuNulo(valor: Prisma.Decimal | null): number | null {
  return valor === null ? null : Number(valor);
}

function somar(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

export async function montarDashboardMeioAmbiente(filtro: {
  clienteId?: string;
  meses: number;
}): Promise<DashboardMeioAmbiente> {
  const agora = new Date();
  // Primeiro dia do mes mais antigo da janela (a janela inclui o mes atual).
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - (filtro.meses - 1), 1));
  const base = filtro.clienteId ? { clienteId: filtro.clienteId } : {};

  const [ocorrencias, leituras, aspectos, documentos] = await Promise.all([
    prisma.ocorrenciaAmbiental.findMany({
      where: { ...base, data: { gte: inicio } },
      select: { data: true, contida: true, grauRisco: true },
    }),
    prisma.indicadorAmbiental.findMany({
      where: { ...base, competencia: { gte: inicio } },
      select: {
        competencia: true,
        aguaM3: true,
        energiaKwh: true,
        residuosKg: true,
        residuosRecicladosKg: true,
        emissoesTco2: true,
      },
    }),
    prisma.aspectoAmbiental.findMany({
      where: base,
      select: { condicao: true, significativo: true },
    }),
    prisma.documentoSsma.findMany({
      where: {
        ...base,
        vigente: true,
        situacao: 'ATIVO',
        tipo: { in: [...TIPOS_DOCUMENTO_AMBIENTAL] },
      },
      // Validade mais distante primeiro; sem validade (CTR) desempata pela emissao.
      orderBy: [{ validade: { sort: 'desc', nulls: 'last' } }, { dataEmissao: 'desc' }],
      select: {
        id: true,
        tipo: true,
        titulo: true,
        versao: true,
        validade: true,
        arquivoUrl: true,
      },
    }),
  ]);

  /* ------------------------------------------------------ ocorrencias --- */
  const ocorrenciasPorChave = new Map<string, OcorrenciasDoMes>();
  for (const ocorrencia of ocorrencias) {
    const chave = chaveDoMes(ocorrencia.data);
    const mes = ocorrenciasPorChave.get(chave) ?? { competencia: chave, total: 0, contidas: 0, grauI: 0 };
    mes.total += 1;
    if (ocorrencia.contida) mes.contidas += 1;
    if (ocorrencia.grauRisco === 'I') mes.grauI += 1;
    ocorrenciasPorChave.set(chave, mes);
  }

  /* -------------------------------------------------------------- ESG --- */
  // Sem cliente, as leituras de todos os clientes do mes sao somadas.
  const esgPorChave = new Map<string, LeituraEsgDoMes>();
  for (const leitura of leituras) {
    const chave = chaveDoMes(leitura.competencia);
    const mes = esgPorChave.get(chave) ?? {
      competencia: chave,
      aguaM3: null,
      energiaKwh: null,
      residuosKg: null,
      residuosRecicladosKg: null,
      percentualReciclagem: null,
      emissoesTco2: null,
    };
    mes.aguaM3 = somar(mes.aguaM3, numeroOuNulo(leitura.aguaM3));
    mes.energiaKwh = somar(mes.energiaKwh, numeroOuNulo(leitura.energiaKwh));
    mes.residuosKg = somar(mes.residuosKg, numeroOuNulo(leitura.residuosKg));
    mes.residuosRecicladosKg = somar(mes.residuosRecicladosKg, numeroOuNulo(leitura.residuosRecicladosKg));
    mes.emissoesTco2 = somar(mes.emissoesTco2, numeroOuNulo(leitura.emissoesTco2));
    esgPorChave.set(chave, mes);
  }
  for (const mes of esgPorChave.values()) {
    mes.percentualReciclagem =
      mes.residuosKg && mes.residuosRecicladosKg !== null
        ? Math.round((mes.residuosRecicladosKg / mes.residuosKg) * 100)
        : null;
  }

  const competencias = competenciasDaJanela(inicio, filtro.meses);

  /* --------------------------------------------------------- aspectos --- */
  const porCondicao = Object.fromEntries(CONDICOES_ASPECTO.map((condicao) => [condicao, 0])) as Record<
    CondicaoAspecto,
    number
  >;
  let significativos = 0;
  for (const aspecto of aspectos) {
    if (aspecto.significativo) significativos += 1;
    const condicao = aspecto.condicao as CondicaoAspecto;
    if (condicao in porCondicao) porCondicao[condicao] += 1;
  }

  /* ------------------------------------------------------- documentos --- */
  // A consulta ja vem ordenada: o primeiro de cada tipo e o melhor candidato.
  const melhorPorTipo = new Map<TipoDocumento, (typeof documentos)[number]>();
  for (const documento of documentos) {
    const tipo = documento.tipo as TipoDocumento;
    if (!melhorPorTipo.has(tipo)) melhorPorTipo.set(tipo, documento);
  }

  const resumoDocumentos: Record<SituacaoDocumentoAmbiental, number> = {
    VIGENTE: 0,
    A_VENCER: 0,
    VENCIDO: 0,
    SEM_VALIDADE: 0,
    AUSENTE: 0,
  };

  const listaDocumentos = TIPOS_DOCUMENTO_AMBIENTAL.map((tipo): DocumentoAmbientalDoDashboard => {
    const documento = melhorPorTipo.get(tipo);
    const situacao: SituacaoDocumentoAmbiental = documento ? situacaoDaValidade(documento.validade, agora) : 'AUSENTE';
    resumoDocumentos[situacao] += 1;
    return {
      tipo,
      rotulo: ROTULO_TIPO_DOCUMENTO[tipo],
      situacao,
      documentoId: documento?.id ?? null,
      titulo: documento?.titulo ?? null,
      versao: documento?.versao ?? null,
      validade: documento?.validade ?? null,
      arquivoUrl: documento?.arquivoUrl ?? null,
    };
  });

  return {
    periodo: { inicio: inicio.toISOString(), fim: agora.toISOString(), meses: filtro.meses },
    ocorrenciasPorMes: competencias.map(
      (chave) => ocorrenciasPorChave.get(chave) ?? { competencia: chave, total: 0, contidas: 0, grauI: 0 },
    ),
    esgPorMes: competencias.map(
      (chave) =>
        esgPorChave.get(chave) ?? {
          competencia: chave,
          aguaM3: null,
          energiaKwh: null,
          residuosKg: null,
          residuosRecicladosKg: null,
          percentualReciclagem: null,
          emissoesTco2: null,
        },
    ),
    aspectos: { total: aspectos.length, significativos, porCondicao },
    documentos: listaDocumentos,
    resumoDocumentos,
  };
}
