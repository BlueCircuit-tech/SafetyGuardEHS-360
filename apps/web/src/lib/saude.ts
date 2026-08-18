import type {
  AbrangenciaDocumento,
  DefinicaoDocumento,
  GrauRiscoFuncao,
  ResultadoAso,
  SituacaoColaborador,
  SituacaoDocumento,
  SituacaoVencimento,
  TipoAso,
  TipoDocumento,
  UrgenciaRenovacao,
  VinculoColaborador,
} from '@safetyguard/shared';

/**
 * Tipos e cores da Etapa 9 — saude ocupacional e documentacao legal.
 *
 * Os rotulos vem do pacote compartilhado; aqui ficam apenas as cores da
 * interface e o formato das respostas da API.
 */

/** `SEM_ASO` nao e vencimento: e a ausencia total de exame. */
export type SituacaoAso = SituacaoVencimento | 'SEM_ASO';

export const PILL_VENCIMENTO: Record<SituacaoAso, string> = {
  VIGENTE: 'ok',
  A_VENCER: 'warn',
  VENCIDO: 'bad',
  SEM_VALIDADE: 'gray',
  SEM_ASO: 'bad',
};

export const PILL_RESULTADO_ASO: Record<ResultadoAso, string> = {
  APTO: 'ok',
  APTO_COM_RESTRICAO: 'warn',
  INAPTO: 'bad',
};

export const PILL_URGENCIA: Record<UrgenciaRenovacao, string> = {
  VENCIDO: 'bad',
  CRITICO: 'orange',
  ATENCAO: 'warn',
  PROGRAMADO: 'info',
};

export const PILL_SITUACAO_COLABORADOR: Record<SituacaoColaborador, string> = {
  ATIVO: 'ok',
  AFASTADO: 'warn',
  DESLIGADO: 'gray',
};

export const PILL_GRAU_RISCO: Record<GrauRiscoFuncao, string> = {
  BAIXO: 'ok',
  MEDIO: 'warn',
  ALTO: 'bad',
};

export const PILL_SITUACAO_DOCUMENTO: Record<SituacaoDocumento, string> = {
  ATIVO: 'ok',
  SUBSTITUIDO: 'gray',
  CANCELADO: 'gray',
};

/* -------------------------------------------------------------------------- */
/* Respostas da API                                                            */
/* -------------------------------------------------------------------------- */

export interface AsoResumido {
  id: string;
  tipo: TipoAso;
  dataExame: string;
  validade: string | null;
  resultado: ResultadoAso;
  restricoes: string | null;
  medicoNome?: string;
  medicoCrm?: string;
  arquivoUrl?: string | null;
}

export interface ColaboradorApi {
  id: string;
  clienteId: string;
  vinculo: VinculoColaborador;
  terceiroId: string | null;
  areaId: string | null;
  nome: string;
  cpf: string;
  cpfFormatado: string;
  matricula: string | null;
  dataNascimento: string | null;
  funcao: string;
  setor: string | null;
  grauRisco: GrauRiscoFuncao;
  riscosOcupacionais: string | null;
  dataAdmissao: string | null;
  dataDesligamento: string | null;
  email: string | null;
  telefone: string | null;
  situacao: SituacaoColaborador;
  observacoes: string | null;
  cliente?: { id: string; nomeFantasia: string };
  terceiro?: { id: string; nomeFantasia: string } | null;
  area?: { id: string; nome: string; codigo: string } | null;
  asoAtual: AsoResumido | null;
  situacaoAso: SituacaoAso;
  diasParaVencerAso: number | null;
  impedido: boolean;
  rotulos?: { vinculo: string; situacao: string; grauRisco: string; situacaoAso: string };
}

export interface ColaboradorDetalhe extends ColaboradorApi {
  asos: AsoResumido[];
  documentos: { id: string; tipo: TipoDocumento; titulo: string; validade: string | null; situacao: SituacaoDocumento }[];
}

export interface DocumentoApi {
  id: string;
  clienteId: string;
  abrangencia: AbrangenciaDocumento;
  areaId: string | null;
  terceiroId: string | null;
  colaboradorId: string | null;
  tipo: TipoDocumento;
  titulo: string;
  numero: string | null;
  revisao: string | null;
  descricao: string | null;
  dataEmissao: string;
  validade: string | null;
  responsavelNome: string | null;
  responsavelRegistro: string | null;
  numeroArt: string | null;
  situacao: SituacaoDocumento;
  observacoes: string | null;
  arquivoUrl: string | null;
  situacaoVencimento: SituacaoVencimento;
  diasParaVencer: number | null;
  cliente?: { id: string; nomeFantasia: string };
  area?: { id: string; nome: string; codigo: string } | null;
  terceiro?: { id: string; nomeFantasia: string } | null;
  colaborador?: { id: string; nome: string; cpf: string } | null;
  rotulos?: { abrangencia: string; situacao: string; vencimento: string };
}

export interface Paginado<T> {
  itens: T[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

export interface ItemRenovacaoApi {
  origem: 'ASO' | 'DOCUMENTO';
  id: string;
  descricao: string;
  referente: string;
  clienteId: string;
  validade: string | null;
  diasParaVencer: number | null;
  urgencia: UrgenciaRenovacao;
  rotuloUrgencia?: string;
}

export interface PainelConformidade {
  geradoEm: string;
  icl: {
    valor: number;
    classificacao: { nivel: string; rotulo: string; cor: string; emoji: string };
    saude: number | null;
    documentos: number | null;
    pesoConsiderado: number;
  };
  saude: {
    total: number;
    vigentes: number;
    aVencer: number;
    vencidos: number;
    semValidade: number;
    percentualConformidade: number;
    colaboradoresAtivos: number;
    semAso: number;
    inaptos: number;
    comRestricao: number;
    impedidos: number;
    pendencias: {
      colaboradorId: string;
      nome: string;
      funcao: string;
      cliente: string;
      terceiro: string | null;
      validade: string | null;
      situacao: SituacaoAso;
      resultado: ResultadoAso | null;
      diasParaVencer: number | null;
    }[];
  };
  documentos: {
    total: number;
    vigentes: number;
    aVencer: number;
    vencidos: number;
    semValidade: number;
    percentualConformidade: number;
    porTipo: {
      tipo: TipoDocumento;
      rotulo: string;
      categoria: string;
      total: number;
      vigentes: number;
      aVencer: number;
      vencidos: number;
      semValidade: number;
      percentualConformidade: number;
    }[];
  };
  renovacao: { janelaDias: number; total: number; vencidos: number; criticos: number; itens: ItemRenovacaoApi[] };
  porCliente: { clienteId: string; cliente: string; total: number; emDia: number; impedidos: number; percentualAsoEmDia: number }[];
}

export type CatalogoDocumentos = DefinicaoDocumento[];

/** Texto curto de prazo: "vence em 12 dias", "vencido ha 3 dias". */
export function textoPrazo(dias: number | null): string {
  if (dias === null) return 'sem validade';
  if (dias < 0) return `vencido ha ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'dia' : 'dias'}`;
  if (dias === 0) return 'vence hoje';
  return `vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}
