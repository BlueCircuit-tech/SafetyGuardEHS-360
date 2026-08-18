import type {
  ClassificacaoBirdOcorrencia,
  GrauRiscoOcorrencia,
  ObservacaoFormValues,
  SituacaoObservacao,
  TipoObservacao,
} from '@safetyguard/shared';

export interface CausaApi {
  id: string;
  codigo: string;
  descricao: string;
  tipo: TipoObservacao;
  destinatarioSugerido: string | null;
  ativa: boolean;
}

export interface TipoObservacaoApi {
  tipo: TipoObservacao;
  rotulo: string;
  cor: string;
  emoji: string;
  contaNoBbs: boolean;
  abrePlanoDeAcao: boolean;
  exigeFoto: boolean;
  exigeCausa: boolean;
}

export interface ObservacaoApi {
  id: string;
  areaId: string;
  clienteId: string;
  terceiroId: string | null;
  causaId: string | null;
  area?: { id: string; nome: string; codigo: string; setor: string | null; criticidade: string };
  cliente?: {
    id: string;
    nomeFantasia: string;
    numeroContrato: string;
    centroNegocio: { id: string; nome: string; codigo: string } | null;
  };
  terceiro?: { id: string; nomeFantasia: string } | null;
  causa?: { id: string; codigo: string; descricao: string; destinatarioSugerido: string | null } | null;
  dataHora: string;
  tipo: TipoObservacao;
  descricao: string;
  observador: string;
  severidade: number | null;
  probabilidade: number | null;
  exposicao: number | null;
  frequencia: number | null;
  iir: number | null;
  grauRisco: GrauRiscoOcorrencia | null;
  classificacaoBird: ClassificacaoBirdOcorrencia | null;
  fotoUrl: string | null;
  assinaturaUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  acaoImediata: string | null;
  situacao: SituacaoObservacao;
  observacoes: string | null;
  prazoLimite: string | null;
  criadoEm: string;
  atualizadoEm: string;
  /* derivados */
  rotulos: { tipo: string; cor: string; emoji: string };
  faixaIir: { nivel: string; rotulo: string; cor: string; emoji: string } | null;
  comunicacao: {
    acao: string;
    email: boolean;
    whatsapp: string;
    prazoHoras: number;
    prazoRotulo: string;
    destinatarios: string[];
  } | null;
  escalonamento: { nivel: string; rotuloNivel: string; degrau: number; vencida: boolean } | null;
  prazoVencido: boolean;
  formatado: { coordenadas: string | null };
}

export interface PaginaObservacoes {
  itens: ObservacaoApi[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

export interface ResumoObservacoes {
  total: number;
  registradas: number;
  emTratativa: number;
  concluidas: number;
  prazoVencido: number;
}

/* -------------------------------------------------------------------------- */
/* Painel BBS                                                                  */
/* -------------------------------------------------------------------------- */

export interface LinhaDistribuicao {
  tipo: TipoObservacao;
  rotulo: string;
  cor: string;
  emoji: string;
  quantidade: number;
  percentual: number;
}

export interface ItemPareto {
  causa: string;
  quantidade: number;
  percentual: number;
  acumulado: number;
  dentroDos80: boolean;
}

export interface PainelBbs {
  periodo: { de: string; ate: string; meses: number };
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
    ici_comportamental: number;
    classificacaoIcs: { nivel: string; rotulo: string; cor: string; emoji: string };
    distribuicao: LinhaDistribuicao[];
  };
  icsg: {
    valor: number;
    classificacao: { nivel: string; rotulo: string; cor: string; emoji: string };
    pilares: Array<{ pilar: string; rotulo: string; peso: number; nota: number; notaEfetiva: number }>;
    pesoConsiderado: number;
    pilaresSemDados: string[];
  };
  pareto: { comportamentosInseguros: ItemPareto[]; condicoesInseguras: ItemPareto[] };
  tendencia: {
    pontos: Array<{ periodo: string; comportamentosInseguros: number; condicoesInseguras: number; total: number }>;
    direcao: string;
    variacao: number;
    simbolo: string;
  };
  mapaCalor: Array<{
    area: string;
    comportamentosInseguros: number;
    condicoesInseguras: number;
    desvios: number;
    criticidade: string;
    cor: string;
    emoji: string;
  }>;
  piramideBird: {
    niveis: Array<{
      classificacao: string;
      codigo: string;
      rotulo: string;
      descricao: string;
      quantidade: number;
      razaoParaBase: number | null;
      cor: string;
    }>;
    totalOcorrencias: number;
    base: number;
  };
}

/* -------------------------------------------------------------------------- */
/* Formulário                                                                  */
/* -------------------------------------------------------------------------- */

export const VALORES_INICIAIS_OBSERVACAO: ObservacaoFormValues = {
  areaId: '',
  tokenQr: '',
  terceiroId: '',
  dataHora: '',
  tipo: '',
  causaId: '',
  descricao: '',
  observador: '',
  severidade: '',
  probabilidade: '',
  exposicao: '',
  frequencia: '',
  classificacaoBird: '',
  fotoUrl: '',
  assinaturaUrl: '',
  latitude: '',
  longitude: '',
  acaoImediata: '',
  situacao: 'REGISTRADA',
  observacoes: '',
};

export const PILL_SITUACAO_OBSERVACAO: Record<SituacaoObservacao, string> = {
  REGISTRADA: 'info',
  EM_TRATATIVA: 'warn',
  CONCLUIDA: 'ok',
  CANCELADA: 'gray',
};

/** Formato aceito por `<input type="datetime-local">`, no fuso local. */
export function paraDatetimeLocal(data: Date): string {
  const ajustada = new Date(data.getTime() - data.getTimezoneOffset() * 60_000);
  return ajustada.toISOString().slice(0, 16);
}
