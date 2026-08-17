import { formatarCnpj } from './br/cnpj.js';
import { formatarCep } from './br/cep.js';
import { formatarTelefone } from './br/telefone.js';
import type { CabecalhoInstitucional, TipoRegistroRt } from './schemas/empresa-consultoria.js';

/**
 * Subconjunto da empresa de consultoria necessario para montar cabecalhos.
 * Declarado de forma estrutural para aceitar tanto o modelo do Prisma quanto
 * o objeto validado pelo Zod.
 */
export interface FonteCabecalho {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  telefone: string;
  whatsapp?: string | null;
  email: string;
  site?: string | null;
  responsavelTecnicoNome: string;
  responsavelTecnicoTipoRegistro: TipoRegistroRt | string;
  responsavelTecnicoRegistro: string;
  responsavelTecnicoUfRegistro?: string | null;
  logoUrl?: string | null;
  corPrimaria: string;
  corSecundaria: string;
  rodapeRelatorio?: string | null;
  assinaturaEmail?: string | null;
  cabecalhoWhatsapp?: string | null;
}

function juntar(partes: Array<string | null | undefined>, separador = ' · '): string {
  return partes.filter((parte): parte is string => Boolean(parte && parte.trim())).join(separador);
}

/** Endereco em uma linha, do jeito que aparece sob o logo nos relatorios. */
export function enderecoEmLinha(empresa: FonteCabecalho): string {
  const rua = juntar([`${empresa.logradouro}, ${empresa.numero}`, empresa.complemento], ' — ');
  return `${rua} · ${empresa.bairro} · ${empresa.cidade}/${empresa.uf} · CEP ${formatarCep(empresa.cep)}`;
}

/** Linha de contato usada no cabecalho de e-mail e no rodape de relatorios. */
export function contatoEmLinha(empresa: FonteCabecalho): string {
  return juntar([
    formatarTelefone(empresa.telefone),
    empresa.whatsapp ? `WhatsApp ${formatarTelefone(empresa.whatsapp)}` : null,
    empresa.email,
    empresa.site,
  ]);
}

/** Identificacao do responsavel tecnico que assina laudos e auditorias. */
export function responsavelTecnicoEmLinha(empresa: FonteCabecalho): string {
  const registro = juntar(
    [
      `${empresa.responsavelTecnicoTipoRegistro} ${empresa.responsavelTecnicoRegistro}`,
      empresa.responsavelTecnicoUfRegistro,
    ],
    '/',
  );
  return `${empresa.responsavelTecnicoNome} — ${registro}`;
}

/** Rodape padrao de laudos e auditorias quando a empresa nao definiu um texto proprio. */
export function rodapePadrao(empresa: FonteCabecalho): string {
  return `${empresa.razaoSocial} · CNPJ ${formatarCnpj(empresa.cnpj)} · ${enderecoEmLinha(empresa)}`;
}

/**
 * Monta o bloco institucional consumido por relatorios (cabecalho e rodape),
 * assinatura de e-mail e cabecalho das mensagens de WhatsApp.
 */
export function montarCabecalhoInstitucional(
  empresa: FonteCabecalho,
  opcoes: { agora?: Date } = {},
): CabecalhoInstitucional {
  return {
    nomeExibicao: empresa.nomeFantasia || empresa.razaoSocial,
    razaoSocial: empresa.razaoSocial,
    cnpjFormatado: formatarCnpj(empresa.cnpj),
    enderecoLinha: enderecoEmLinha(empresa),
    contatoLinha: contatoEmLinha(empresa),
    responsavelTecnicoLinha: responsavelTecnicoEmLinha(empresa),
    logoUrl: empresa.logoUrl ?? null,
    corPrimaria: empresa.corPrimaria,
    corSecundaria: empresa.corSecundaria,
    rodapeRelatorio: empresa.rodapeRelatorio?.trim() || rodapePadrao(empresa),
    assinaturaEmail:
      empresa.assinaturaEmail?.trim() ||
      `${empresa.nomeFantasia || empresa.razaoSocial}\n${contatoEmLinha(empresa)}`,
    cabecalhoWhatsapp:
      empresa.cabecalhoWhatsapp?.trim() || `*${empresa.nomeFantasia || empresa.razaoSocial}* · SafetyGuard EHS 360`,
    geradoEm: opcoes.agora ?? new Date(),
  };
}
