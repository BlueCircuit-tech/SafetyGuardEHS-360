import type {
  CanalNotificacao,
  CriticidadePlano,
  OrigemPlano,
  PlanoAcaoFormValues,
  StatusNotificacao,
  StatusPlano,
} from '@safetyguard/shared';

export interface PlanoApi {
  id: string;
  codigo: string;
  origem: OrigemPlano;
  observacaoId: string | null;
  clienteId: string;
  areaId: string | null;
  terceiroId: string | null;
  observacao?: {
    id: string;
    tipo: string;
    descricao: string;
    dataHora: string;
    iir: number | null;
    grauRisco: string | null;
    causa: { descricao: string } | null;
  } | null;
  cliente?: {
    id: string;
    nomeFantasia: string;
    numeroContrato: string;
    centroNegocio: { id: string; nome: string; codigo: string } | null;
  };
  area?: { id: string; nome: string; codigo: string; setor: string | null } | null;
  terceiro?: { id: string; nomeFantasia: string } | null;
  acao: string;
  descricao: string | null;
  responsavelNome: string;
  responsavelCargo: string | null;
  responsavelEmail: string | null;
  criticidade: CriticidadePlano;
  prazo: string;
  status: StatusPlano;
  dataConclusao: string | null;
  evidenciaUrl: string | null;
  comentarioConclusao: string | null;
  observacoes: string | null;
  nivelEscalonamento: number;
  dataUltimoEscalonamento: string | null;
  criadoEm: string;
  atualizadoEm: string;
  /* derivados */
  rotulos: { status: string; criticidade: string; origem: string };
  diasParaPrazo: number;
  atrasado: boolean;
  nivelAtual: string;
  nivelDevido: string | null;
  escalonamentoPendente: boolean;
  tempoFechamentoDias: number | null;
  concluidoNoPrazo: boolean | null;
}

export interface PaginaPlanos {
  itens: PlanoApi[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

export interface ResumoPlanos {
  total: number;
  abertos: number;
  emAndamento: number;
  concluidos: number;
  cancelados: number;
  atrasados: number;
  escalonados: number;
  tempoMedioFechamentoDias: number | null;
  aderenciaAoPrazo: number | null;
  percentualConcluido: number | null;
}

export interface LinhaCriticidade {
  criticidade: CriticidadePlano;
  total: number;
  emAberto: number;
  atrasados: number;
  concluidos: number;
  prazoPadraoHoras: number;
}

export interface NotificacaoApi {
  id: string;
  planoAcaoId: string | null;
  observacaoId: string | null;
  clienteId: string;
  canal: CanalNotificacao;
  destinatarios: string;
  assunto: string | null;
  corpo: string;
  nivelEscalonamento: number;
  status: StatusNotificacao;
  erro: string | null;
  criadoEm: string;
  planoAcao?: { id: string; codigo: string; acao: string; status: string } | null;
  cliente?: { id: string; nomeFantasia: string } | null;
}

export interface ResumoNotificacoes {
  total: number;
  email: number;
  whatsapp: number;
  simuladas: number;
  enviadas: number;
  falhas: number;
  porEscalonamento: number;
}

export const VALORES_INICIAIS_PLANO: PlanoAcaoFormValues = {
  origem: 'MANUAL',
  observacaoId: '',
  areaId: '',
  terceiroId: '',
  acao: '',
  descricao: '',
  responsavelNome: '',
  responsavelCargo: '',
  responsavelEmail: '',
  criticidade: '',
  prazo: '',
  status: 'ABERTO',
  dataConclusao: '',
  evidenciaUrl: '',
  comentarioConclusao: '',
  observacoes: '',
};

export const PILL_STATUS_PLANO: Record<StatusPlano, string> = {
  ABERTO: 'info',
  EM_ANDAMENTO: 'warn',
  CONCLUIDO: 'ok',
  CANCELADO: 'gray',
};

export const PILL_CRITICIDADE_PLANO: Record<CriticidadePlano, string> = {
  BAIXA: 'ok',
  MEDIA: 'warn',
  ALTA: 'orange',
  CRITICA: 'bad',
};

/** `datetime-local` no fuso do dispositivo. */
export function paraDatetimeLocal(data: Date): string {
  const ajustada = new Date(data.getTime() - data.getTimezoneOffset() * 60_000);
  return ajustada.toISOString().slice(0, 16);
}
