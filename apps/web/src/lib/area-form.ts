import {
  FREQUENCIA_INSPECAO_PADRAO,
  formatarTelefone,
  type AreaFormValues,
  type CriticidadeAreaCadastro,
  type SituacaoArea,
  type TipoArea,
} from '@safetyguard/shared';

/** Área como a API devolve, com os campos derivados. */
export interface AreaApi {
  id: string;
  clienteId: string;
  cliente?: {
    id: string;
    nomeFantasia: string;
    numeroContrato: string;
    corDestaque: string;
    centroNegocio: { id: string; nome: string; codigo: string } | null;
  };
  setor: string | null;
  nome: string;
  codigo: string;
  tipo: TipoArea;
  descricao: string | null;
  tokenQr: string;
  criticidade: CriticidadeAreaCadastro;
  riscosPresentes: string | null;
  exigeAutorizacaoEntrada: boolean;
  exigePermissaoTrabalho: boolean;
  responsavelNome: string | null;
  responsavelCargo: string | null;
  responsavelEmail: string | null;
  responsavelTelefone: string | null;
  latitude: number | null;
  longitude: number | null;
  pontoReferencia: string | null;
  frequenciaInspecaoDias: number;
  situacao: SituacaoArea;
  observacoes: string | null;
  criadoEm: string;
  atualizadoEm: string;
  /* derivados */
  riscos: string[];
  urlInspecao: string;
  urlQrCode: string;
  rotulos: { tipo: string; criticidade: string };
  frequenciaSugeridaDias: number;
  formatado: { responsavelTelefone: string | null; coordenadas: string | null };
}

export interface PaginaAreas {
  itens: AreaApi[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

export interface ResumoAreas {
  total: number;
  ativas: number;
  inativas: number;
  criticas: number;
  altas: number;
  comPermissaoTrabalho: number;
}

export const VALORES_INICIAIS_AREA: AreaFormValues = {
  clienteId: '',
  setor: '',
  nome: '',
  codigo: '',
  tipo: '',
  descricao: '',
  criticidade: '',
  riscosPresentes: '',
  exigeAutorizacaoEntrada: false,
  exigePermissaoTrabalho: false,
  responsavelNome: '',
  responsavelCargo: '',
  responsavelEmail: '',
  responsavelTelefone: '',
  latitude: '',
  longitude: '',
  pontoReferencia: '',
  frequenciaInspecaoDias: String(FREQUENCIA_INSPECAO_PADRAO),
  situacao: 'ATIVA',
  observacoes: '',
};

const texto = (valor: string | number | null | undefined): string =>
  valor === null || valor === undefined ? '' : String(valor);

export function areaParaFormulario(area: AreaApi): AreaFormValues {
  return {
    clienteId: area.clienteId,
    setor: texto(area.setor),
    nome: area.nome,
    codigo: area.codigo,
    tipo: area.tipo,
    descricao: texto(area.descricao),
    criticidade: area.criticidade,
    riscosPresentes: texto(area.riscosPresentes),
    exigeAutorizacaoEntrada: area.exigeAutorizacaoEntrada,
    exigePermissaoTrabalho: area.exigePermissaoTrabalho,
    responsavelNome: texto(area.responsavelNome),
    responsavelCargo: texto(area.responsavelCargo),
    responsavelEmail: texto(area.responsavelEmail),
    responsavelTelefone: area.responsavelTelefone ? formatarTelefone(area.responsavelTelefone) : '',
    latitude: texto(area.latitude),
    longitude: texto(area.longitude),
    pontoReferencia: texto(area.pontoReferencia),
    frequenciaInspecaoDias: texto(area.frequenciaInspecaoDias),
    situacao: area.situacao,
    observacoes: texto(area.observacoes),
  };
}

export const PILL_CRITICIDADE_AREA: Record<CriticidadeAreaCadastro, string> = {
  BAIXA: 'ok',
  MEDIA: 'warn',
  ALTA: 'orange',
  CRITICA: 'bad',
};

export const PILL_SITUACAO_AREA: Record<SituacaoArea, string> = {
  ATIVA: 'ok',
  INATIVA: 'gray',
};
