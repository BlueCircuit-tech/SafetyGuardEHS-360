import type {
  CriticidadePlano,
  FaixaDesempenho,
  GrauRiscoOcorrencia,
  PiramideBird,
  ResultadoIndice,
  StatusPlano,
  Tendencia,
  TipoObservacao,
} from '@safetyguard/shared';
import type { ItemRenovacaoApi, SituacaoAso } from './saude';

/** Respostas dos três dashboards da Etapa 10. */

export interface ResumoPlanosApi {
  total: number;
  abertos: number;
  emAndamento: number;
  concluidos: number;
  cancelados: number;
  atrasados: number;
  escalonados: number;
  tempoMedioFechamentoDias: number | null;
  aderenciaAoPrazo: number;
  percentualConcluido: number;
}

export interface LinhaInspecao {
  areaId: string;
  area: string;
  codigo: string;
  cliente: string;
  criticidade: string;
  frequenciaInspecaoDias: number;
  ultimaInspecao: string | null;
  diasSemInspecao: number | null;
  emDia: boolean;
}

export interface PainelExecutivo {
  geradoEm: string;
  indiceGlobal: ResultadoIndice;
  cobertura: { pesoConsiderado: number; pilaresSemDados: { pilar: string; motivo: string }[] };
  maturidade: ResultadoIndice;
  seguranca: { nota: number | null; acidentes: number; quaseAcidentes: number; registros: number; observacao: string };
  cultura: { ics: number; ici: number; icsg: number; totalBbs: number };
  riscos: { nota: number | null; totalAreas: number; emDia: number; atrasadas: number; nuncaInspecionadas: number };
  planos: ResumoPlanosApi;
  conformidade: {
    icl: number;
    classificacao: FaixaDesempenho;
    impedidos: number;
    documentosVencidos: number;
    renovacoesPendentes: number;
  };
  tendencia: Tendencia;
  piramideBird: PiramideBird;
  carteira: { clientesAtivos: number; colaboradores: number; terceirosAtivos: number; areasAtivas: number };
  ranking: {
    clienteId: string;
    cliente: string;
    centroNegocio: string | null;
    indiceGlobal: number;
    classificacao: FaixaDesempenho;
    ics: number;
    ici: number;
    observacoes: number;
    planosAtrasados: number;
    aderenciaAoPrazo: number;
    areasAtrasadas: number;
    acidentes: number;
  }[];
  centros: {
    centroId: string;
    centro: string;
    codigo: string;
    cor: string;
    indiceGlobal: number;
    classificacao: FaixaDesempenho;
    meta: number;
    desvioDaMeta: number;
    atingiuMeta: boolean;
  }[];
}

export interface PainelGerencial {
  geradoEm: string;
  scoreAreas: Array<{
    areaId: string;
    area: string;
    codigo: string;
    cliente: string;
    desvios30Dias: number;
    inspecaoEmDia: boolean;
    planosAbertos: number;
    score: number;
  }>;
  icsg: ResultadoIndice;
  bbs: {
    totalBbs: number;
    totalRegistros: number;
    comportamentosSeguros: number;
    comportamentosInseguros: number;
    condicoesInseguras: number;
    melhoriasIdentificadas: number;
    naoConformidades: number;
    ics: number;
    ici: number;
    classificacaoIcs: FaixaDesempenho;
  };
  pareto: {
    comportamentosInseguros: { causa: string; quantidade: number; percentual: number; acumulado: number }[];
    condicoesInseguras: { causa: string; quantidade: number; percentual: number; acumulado: number }[];
  };
  mapaCalor: {
    area: string;
    comportamentosInseguros: number;
    condicoesInseguras: number;
    total: number;
    criticidade: string;
    cor: string;
  }[];
  tendencia: Tendencia;
  piramideBird: PiramideBird;
  planos: ResumoPlanosApi;
  inspecoes: {
    nota: number | null;
    totalAreas: number;
    emDia: number;
    atrasadas: number;
    nuncaInspecionadas: number;
    linhas: LinhaInspecao[];
  };
  conformidade: {
    icl: { valor: number; classificacao: FaixaDesempenho; saude: number | null; documentos: number | null };
    saude: { colaboradoresAtivos: number; impedidos: number; semAso: number; percentualConformidade: number };
    documentos: { total: number; vencidos: number; aVencer: number; percentualConformidade: number };
  };
  terceiros: {
    terceiroId: string;
    terceiro: string;
    cliente: string;
    colaboradores: number;
    observacoes: number;
    desvios: number;
    planos: number;
    planosAtrasados: number;
    nota: number | null;
    classificacao: FaixaDesempenho | null;
  }[];
}

export interface PainelOperacional {
  geradoEm: string;
  fila: {
    planosAtrasados: number;
    planosVencendo: number;
    escalonamentosPendentes: number;
    observacoesSemTratativa: number;
    areasSemInspecao: number;
    colaboradoresImpedidos: number;
    renovacoesEm30Dias: number;
  };
  planos: {
    id: string;
    codigo: string;
    acao: string;
    criticidade: CriticidadePlano;
    status: StatusPlano;
    prazo: string;
    responsavelNome: string;
    nivelEscalonamento: number;
    cliente: { nomeFantasia: string };
    area: { nome: string; codigo: string } | null;
    diasParaPrazo: number;
    atrasado: boolean;
    venceEmBreve: boolean;
    nivelDevido: string;
    escalonamentoPendente: boolean;
  }[];
  observacoes: {
    id: string;
    descricao: string;
    tipo: TipoObservacao;
    grauRisco: GrauRiscoOcorrencia | null;
    dataHora: string;
    prazoLimite: string | null;
    observador: string;
    cliente: { nomeFantasia: string };
    area: { nome: string; codigo: string };
  }[];
  areasAtrasadas: LinhaInspecao[];
  renovacoes: ItemRenovacaoApi[];
  impedidos: {
    colaboradorId: string;
    nome: string;
    funcao: string;
    cliente: string;
    situacao: SituacaoAso;
    validade: string | null;
    diasParaVencer: number | null;
  }[];
}
