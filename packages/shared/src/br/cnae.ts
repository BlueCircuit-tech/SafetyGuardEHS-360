/** Utilitarios de CNAE (Classificacao Nacional de Atividades Economicas). */

export function limparCnae(valor: string): string {
  return (valor ?? '').replace(/\D/g, '');
}

/** CNAE valido: 7 digitos (subclasse). Ex.: 7120-1/00 vira 7120100. */
export function isCnaeValido(valor: string): boolean {
  return limparCnae(valor).length === 7;
}

/** Aplica a mascara 0000-0/00. */
export function formatarCnae(valor: string): string {
  const cnae = limparCnae(valor);
  if (cnae.length !== 7) return valor;
  return `${cnae.slice(0, 4)}-${cnae.slice(4, 5)}/${cnae.slice(5)}`;
}

/**
 * CNAEs tipicos de consultoria em SST / Meio Ambiente — usados como sugestao
 * no formulario de cadastro da empresa de consultoria.
 */
export const CNAES_SUGERIDOS = [
  { codigo: '7120100', descricao: 'Testes e analises tecnicas' },
  { codigo: '7112000', descricao: 'Servicos de engenharia' },
  { codigo: '7020400', descricao: 'Consultoria em gestao empresarial' },
  { codigo: '8630501', descricao: 'Atividade medica ambulatorial (medicina do trabalho)' },
  { codigo: '8599604', descricao: 'Treinamento em desenvolvimento profissional e gerencial' },
  { codigo: '3900500', descricao: 'Descontaminacao e outros servicos de gestao de residuos' },
  { codigo: '7490104', descricao: 'Atividades de intermediacao e agenciamento de servicos' },
] as const;
