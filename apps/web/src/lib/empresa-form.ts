import {
  COR_PRIMARIA_PADRAO,
  COR_SECUNDARIA_PADRAO,
  TIMEZONE_PADRAO,
  formatarCep,
  formatarCnae,
  formatarCnpj,
  formatarTelefone,
  type EmpresaFormValues,
} from '@safetyguard/shared';

/** Empresa como a API devolve (datas em ISO + bloco `formatado`). */
export interface EmpresaApi extends Record<string, unknown> {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoEstadual: string | null;
  inscricaoMunicipal: string | null;
  cnaePrincipal: string | null;
  naturezaJuridica: string | null;
  regimeTributario: string | null;
  dataFundacao: string | null;
  email: string;
  emailFinanceiro: string | null;
  telefone: string;
  whatsapp: string | null;
  site: string | null;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  responsavelTecnicoNome: string;
  responsavelTecnicoCargo: string | null;
  responsavelTecnicoTipoRegistro: string;
  responsavelTecnicoRegistro: string;
  responsavelTecnicoUfRegistro: string | null;
  responsavelTecnicoEmail: string | null;
  responsavelTecnicoTelefone: string | null;
  logoUrl: string | null;
  corPrimaria: string;
  corSecundaria: string;
  assinaturaEmail: string | null;
  rodapeRelatorio: string | null;
  cabecalhoWhatsapp: string | null;
  timezone: string;
  ativa: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export const VALORES_INICIAIS: EmpresaFormValues = {
  razaoSocial: '',
  nomeFantasia: '',
  cnpj: '',
  inscricaoEstadual: '',
  inscricaoMunicipal: '',
  cnaePrincipal: '',
  naturezaJuridica: '',
  regimeTributario: '',
  dataFundacao: '',
  email: '',
  emailFinanceiro: '',
  telefone: '',
  whatsapp: '',
  site: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  responsavelTecnicoNome: '',
  responsavelTecnicoCargo: '',
  responsavelTecnicoTipoRegistro: '',
  responsavelTecnicoRegistro: '',
  responsavelTecnicoUfRegistro: '',
  responsavelTecnicoEmail: '',
  responsavelTecnicoTelefone: '',
  logoUrl: '',
  corPrimaria: COR_PRIMARIA_PADRAO,
  corSecundaria: COR_SECUNDARIA_PADRAO,
  assinaturaEmail: '',
  rodapeRelatorio: '',
  cabecalhoWhatsapp: '',
  timezone: TIMEZONE_PADRAO,
  ativa: true,
};

const texto = (valor: string | null | undefined): string => valor ?? '';

/** Converte o registro da API nos valores mascarados do formulario. */
export function empresaParaFormulario(empresa: EmpresaApi): EmpresaFormValues {
  return {
    razaoSocial: empresa.razaoSocial,
    nomeFantasia: empresa.nomeFantasia,
    cnpj: formatarCnpj(empresa.cnpj),
    inscricaoEstadual: texto(empresa.inscricaoEstadual),
    inscricaoMunicipal: texto(empresa.inscricaoMunicipal),
    cnaePrincipal: empresa.cnaePrincipal ? formatarCnae(empresa.cnaePrincipal) : '',
    naturezaJuridica: texto(empresa.naturezaJuridica),
    regimeTributario: texto(empresa.regimeTributario),
    dataFundacao: empresa.dataFundacao ? empresa.dataFundacao.slice(0, 10) : '',
    email: empresa.email,
    emailFinanceiro: texto(empresa.emailFinanceiro),
    telefone: formatarTelefone(empresa.telefone),
    whatsapp: empresa.whatsapp ? formatarTelefone(empresa.whatsapp) : '',
    site: texto(empresa.site),
    cep: formatarCep(empresa.cep),
    logradouro: empresa.logradouro,
    numero: empresa.numero,
    complemento: texto(empresa.complemento),
    bairro: empresa.bairro,
    cidade: empresa.cidade,
    uf: empresa.uf,
    responsavelTecnicoNome: empresa.responsavelTecnicoNome,
    responsavelTecnicoCargo: texto(empresa.responsavelTecnicoCargo),
    responsavelTecnicoTipoRegistro: empresa.responsavelTecnicoTipoRegistro,
    responsavelTecnicoRegistro: empresa.responsavelTecnicoRegistro,
    responsavelTecnicoUfRegistro: texto(empresa.responsavelTecnicoUfRegistro),
    responsavelTecnicoEmail: texto(empresa.responsavelTecnicoEmail),
    responsavelTecnicoTelefone: empresa.responsavelTecnicoTelefone
      ? formatarTelefone(empresa.responsavelTecnicoTelefone)
      : '',
    logoUrl: texto(empresa.logoUrl),
    corPrimaria: empresa.corPrimaria,
    corSecundaria: empresa.corSecundaria,
    assinaturaEmail: texto(empresa.assinaturaEmail),
    rodapeRelatorio: texto(empresa.rodapeRelatorio),
    cabecalhoWhatsapp: texto(empresa.cabecalhoWhatsapp),
    timezone: empresa.timezone,
    ativa: empresa.ativa,
  };
}

/**
 * O payload enviado a API e o proprio estado do formulario: as mascaras e as
 * strings vazias sao normalizadas pelo schema Zod compartilhado, no servidor.
 * O campo `logoUrl` fica de fora — ele so muda pelo endpoint de upload.
 */
export function formularioParaPayload(valores: EmpresaFormValues): Record<string, unknown> {
  const { logoUrl: _logoUrl, ...resto } = valores;
  return resto;
}
