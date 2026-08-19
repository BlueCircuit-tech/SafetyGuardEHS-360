import {
  COR_DESTAQUE_PADRAO,
  META_INDICE_GLOBAL_PADRAO,
  formatarCep,
  formatarCnae,
  formatarCnpj,
  formatarTelefone,
  type ClienteFormValues,
} from '@safetyguard/shared';

/** Cliente como a API devolve (Decimal já convertido, datas em ISO). */
export interface ClienteApi {
  id: string;
  empresaId: string;
  centroNegocioId: string | null;
  centroNegocio?: { id: string; nome: string; codigo: string; corDestaque: string } | null;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoEstadual: string | null;
  inscricaoMunicipal: string | null;
  cnaePrincipal: string | null;
  porte: string | null;
  segmento: string | null;
  site: string | null;
  numeroContrato: string;
  dataInicioContrato: string;
  dataFimContrato: string | null;
  situacao: 'ATIVO' | 'SUSPENSO' | 'ENCERRADO';
  escopoServicos: string | null;
  valorMensal: number | null;
  diaVencimento: number | null;
  consultorResponsavel: string | null;
  grauRisco: number;
  quantidadeFuncionarios: number;
  metaIndiceGlobal: number;
  possuiCipa: boolean;
  possuiSesmt: boolean;
  contatoNome: string;
  contatoCargo: string | null;
  contatoEmail: string;
  contatoTelefone: string;
  contatoWhatsapp: string | null;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  logoUrl: string | null;
  imagemPlantaUrl: string | null;
  corDestaque: string;
  observacoes: string | null;
  criadoEm: string;
  atualizadoEm: string;
  diasParaFimContrato: number | null;
  contratoVencido: boolean;
  formatado: {
    cnpj: string;
    cep: string;
    contatoTelefone: string;
    contatoWhatsapp: string | null;
    cnaePrincipal: string | null;
    valorMensal: string | null;
  };
}

export interface PaginaClientes {
  itens: ClienteApi[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

export interface ResumoClientes {
  total: number;
  ativos: number;
  suspensos: number;
  encerrados: number;
  funcionariosCobertos: number;
}

export const VALORES_INICIAIS_CLIENTE: ClienteFormValues = {
  centroNegocioId: '',
  razaoSocial: '',
  nomeFantasia: '',
  cnpj: '',
  inscricaoEstadual: '',
  inscricaoMunicipal: '',
  cnaePrincipal: '',
  porte: '',
  segmento: '',
  site: '',
  numeroContrato: '',
  dataInicioContrato: '',
  dataFimContrato: '',
  situacao: 'ATIVO',
  escopoServicos: '',
  valorMensal: '',
  diaVencimento: '',
  consultorResponsavel: '',
  grauRisco: '',
  quantidadeFuncionarios: '',
  metaIndiceGlobal: String(META_INDICE_GLOBAL_PADRAO),
  possuiCipa: false,
  possuiSesmt: false,
  contatoNome: '',
  contatoCargo: '',
  contatoEmail: '',
  contatoTelefone: '',
  contatoWhatsapp: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  logoUrl: '',
  imagemPlantaUrl: '',
  corDestaque: COR_DESTAQUE_PADRAO,
  observacoes: '',
};

const texto = (valor: string | number | null | undefined): string =>
  valor === null || valor === undefined ? '' : String(valor);

/** Converte o registro da API nos valores mascarados do formulario. */
export function clienteParaFormulario(cliente: ClienteApi): ClienteFormValues {
  return {
    centroNegocioId: texto(cliente.centroNegocioId),
    razaoSocial: cliente.razaoSocial,
    nomeFantasia: cliente.nomeFantasia,
    cnpj: formatarCnpj(cliente.cnpj),
    inscricaoEstadual: texto(cliente.inscricaoEstadual),
    inscricaoMunicipal: texto(cliente.inscricaoMunicipal),
    cnaePrincipal: cliente.cnaePrincipal ? formatarCnae(cliente.cnaePrincipal) : '',
    porte: texto(cliente.porte),
    segmento: texto(cliente.segmento),
    site: texto(cliente.site),
    numeroContrato: cliente.numeroContrato,
    dataInicioContrato: cliente.dataInicioContrato.slice(0, 10),
    dataFimContrato: cliente.dataFimContrato ? cliente.dataFimContrato.slice(0, 10) : '',
    situacao: cliente.situacao,
    escopoServicos: texto(cliente.escopoServicos),
    valorMensal: texto(cliente.valorMensal),
    diaVencimento: texto(cliente.diaVencimento),
    consultorResponsavel: texto(cliente.consultorResponsavel),
    grauRisco: texto(cliente.grauRisco),
    quantidadeFuncionarios: texto(cliente.quantidadeFuncionarios),
    metaIndiceGlobal: texto(cliente.metaIndiceGlobal),
    possuiCipa: cliente.possuiCipa,
    possuiSesmt: cliente.possuiSesmt,
    contatoNome: cliente.contatoNome,
    contatoCargo: texto(cliente.contatoCargo),
    contatoEmail: cliente.contatoEmail,
    contatoTelefone: formatarTelefone(cliente.contatoTelefone),
    contatoWhatsapp: cliente.contatoWhatsapp ? formatarTelefone(cliente.contatoWhatsapp) : '',
    cep: formatarCep(cliente.cep),
    logradouro: cliente.logradouro,
    numero: cliente.numero,
    complemento: texto(cliente.complemento),
    bairro: cliente.bairro,
    cidade: cliente.cidade,
    uf: cliente.uf,
    logoUrl: texto(cliente.logoUrl),
    imagemPlantaUrl: texto(cliente.imagemPlantaUrl),
    corDestaque: cliente.corDestaque,
    observacoes: texto(cliente.observacoes),
  };
}

/**
 * O payload é o próprio estado do formulário — máscaras e vazios são
 * normalizados pelo schema Zod no servidor. `logoUrl` sai porque só muda
 * pelo endpoint de upload.
 */
export function clienteParaPayload(valores: ClienteFormValues): Record<string, unknown> {
  const { logoUrl: _logoUrl, ...resto } = valores;
  return resto;
}
