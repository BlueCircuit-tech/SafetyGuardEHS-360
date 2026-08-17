import {
  COR_DESTAQUE_TERCEIRO_PADRAO,
  META_NOTA_SSMA_PADRAO,
  formatarCep,
  formatarCnae,
  formatarCnpj,
  formatarTelefone,
  type ClassificacaoSsma,
  type SituacaoTerceiro,
  type TerceiroFormValues,
} from '@safetyguard/shared';

/** Terceiro como a API devolve (Decimal já convertido, derivados incluídos). */
export interface TerceiroApi {
  id: string;
  clienteId: string;
  cliente?: { id: string; nomeFantasia: string; numeroContrato: string };
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoEstadual: string | null;
  cnaePrincipal: string | null;
  porte: string | null;
  atividadePrincipal: string;
  tipoVinculo: string;
  numeroContrato: string | null;
  dataInicioAtuacao: string;
  dataFimAtuacao: string | null;
  situacao: SituacaoTerceiro;
  escopoServicos: string | null;
  areasAtuacao: string | null;
  quantidadeFuncionarios: number;
  grauRisco: number;
  notaSsma: number | null;
  dataUltimaAvaliacao: string | null;
  metaNotaSsma: number;
  possuiPgr: boolean;
  possuiPcmso: boolean;
  documentacaoValidaAte: string | null;
  responsavelNome: string;
  responsavelCargo: string | null;
  responsavelEmail: string;
  responsavelTelefone: string;
  responsavelWhatsapp: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  logoUrl: string | null;
  corDestaque: string;
  observacoes: string | null;
  criadoEm: string;
  atualizadoEm: string;
  /* derivados */
  classificacao: ClassificacaoSsma | null;
  classificacaoRotulo: string;
  abaixoDaMeta: boolean;
  diasParaFimAtuacao: number | null;
  atuacaoVencida: boolean;
  diasParaVencimentoDocumentacao: number | null;
  documentacaoVencida: boolean;
  pendenciaDocumental: boolean;
  formatado: {
    cnpj: string;
    cep: string | null;
    responsavelTelefone: string;
    responsavelWhatsapp: string | null;
    cnaePrincipal: string | null;
  };
}

export interface PaginaTerceiros {
  itens: TerceiroApi[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

export interface ResumoTerceiros {
  total: number;
  ativos: number;
  bloqueados: number;
  documentacaoVencida: number;
  semAvaliacao: number;
  funcionariosAlocados: number;
  notaMedia: number | null;
}

export interface ItemRanking {
  posicao: number;
  id: string;
  nomeFantasia: string;
  cnpjFormatado: string;
  atividadePrincipal: string;
  cliente: { id: string; nomeFantasia: string };
  notaSsma: number;
  metaNotaSsma: number;
  abaixoDaMeta: boolean;
  classificacao: ClassificacaoSsma | null;
  classificacaoRotulo: string;
  grauRisco: number;
  situacao: SituacaoTerceiro;
  corDestaque: string;
  quantidadeFuncionarios: number;
  dataUltimaAvaliacao: string | null;
}

export const VALORES_INICIAIS_TERCEIRO: TerceiroFormValues = {
  clienteId: '',
  razaoSocial: '',
  nomeFantasia: '',
  cnpj: '',
  inscricaoEstadual: '',
  cnaePrincipal: '',
  porte: '',
  atividadePrincipal: '',
  tipoVinculo: 'CONTRATO',
  numeroContrato: '',
  dataInicioAtuacao: '',
  dataFimAtuacao: '',
  situacao: 'ATIVO',
  escopoServicos: '',
  areasAtuacao: '',
  quantidadeFuncionarios: '',
  grauRisco: '',
  notaSsma: '',
  dataUltimaAvaliacao: '',
  metaNotaSsma: String(META_NOTA_SSMA_PADRAO),
  possuiPgr: false,
  possuiPcmso: false,
  documentacaoValidaAte: '',
  responsavelNome: '',
  responsavelCargo: '',
  responsavelEmail: '',
  responsavelTelefone: '',
  responsavelWhatsapp: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  logoUrl: '',
  corDestaque: COR_DESTAQUE_TERCEIRO_PADRAO,
  observacoes: '',
};

const texto = (valor: string | number | null | undefined): string =>
  valor === null || valor === undefined ? '' : String(valor);

const dataForm = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');

/** Converte o registro da API nos valores mascarados do formulário. */
export function terceiroParaFormulario(terceiro: TerceiroApi): TerceiroFormValues {
  return {
    clienteId: terceiro.clienteId,
    razaoSocial: terceiro.razaoSocial,
    nomeFantasia: terceiro.nomeFantasia,
    cnpj: formatarCnpj(terceiro.cnpj),
    inscricaoEstadual: texto(terceiro.inscricaoEstadual),
    cnaePrincipal: terceiro.cnaePrincipal ? formatarCnae(terceiro.cnaePrincipal) : '',
    porte: texto(terceiro.porte),
    atividadePrincipal: terceiro.atividadePrincipal,
    tipoVinculo: terceiro.tipoVinculo,
    numeroContrato: texto(terceiro.numeroContrato),
    dataInicioAtuacao: dataForm(terceiro.dataInicioAtuacao),
    dataFimAtuacao: dataForm(terceiro.dataFimAtuacao),
    situacao: terceiro.situacao,
    escopoServicos: texto(terceiro.escopoServicos),
    areasAtuacao: texto(terceiro.areasAtuacao),
    quantidadeFuncionarios: texto(terceiro.quantidadeFuncionarios),
    grauRisco: texto(terceiro.grauRisco),
    notaSsma: texto(terceiro.notaSsma),
    dataUltimaAvaliacao: dataForm(terceiro.dataUltimaAvaliacao),
    metaNotaSsma: texto(terceiro.metaNotaSsma),
    possuiPgr: terceiro.possuiPgr,
    possuiPcmso: terceiro.possuiPcmso,
    documentacaoValidaAte: dataForm(terceiro.documentacaoValidaAte),
    responsavelNome: terceiro.responsavelNome,
    responsavelCargo: texto(terceiro.responsavelCargo),
    responsavelEmail: terceiro.responsavelEmail,
    responsavelTelefone: formatarTelefone(terceiro.responsavelTelefone),
    responsavelWhatsapp: terceiro.responsavelWhatsapp ? formatarTelefone(terceiro.responsavelWhatsapp) : '',
    cep: terceiro.cep ? formatarCep(terceiro.cep) : '',
    logradouro: texto(terceiro.logradouro),
    numero: texto(terceiro.numero),
    complemento: texto(terceiro.complemento),
    bairro: texto(terceiro.bairro),
    cidade: texto(terceiro.cidade),
    uf: texto(terceiro.uf),
    logoUrl: texto(terceiro.logoUrl),
    corDestaque: terceiro.corDestaque,
    observacoes: texto(terceiro.observacoes),
  };
}

/** `logoUrl` sai do payload — só muda pelo endpoint de upload. */
export function terceiroParaPayload(valores: TerceiroFormValues): Record<string, unknown> {
  const { logoUrl: _logoUrl, ...resto } = valores;
  return resto;
}

/** Cor da pill de cada classificação do ranking. */
export const PILL_CLASSIFICACAO: Record<ClassificacaoSsma, string> = {
  A: 'ok',
  B: 'info',
  C: 'warn',
  D: 'bad',
};

export const PILL_SITUACAO_TERCEIRO: Record<SituacaoTerceiro, string> = {
  ATIVO: 'ok',
  SUSPENSO: 'warn',
  BLOQUEADO: 'bad',
  ENCERRADO: 'gray',
};
