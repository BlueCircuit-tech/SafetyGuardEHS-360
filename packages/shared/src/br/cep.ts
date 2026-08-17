/** Utilitarios de CEP (Codigo de Enderecamento Postal). */

export function limparCep(valor: string): string {
  return (valor ?? '').replace(/\D/g, '');
}

/** CEP valido: 8 digitos e diferente de 00000000. */
export function isCepValido(valor: string): boolean {
  const cep = limparCep(valor);
  return cep.length === 8 && cep !== '00000000';
}

/** Aplica a mascara 00000-000. */
export function formatarCep(valor: string): string {
  const cep = limparCep(valor);
  if (cep.length !== 8) return valor;
  return `${cep.slice(0, 5)}-${cep.slice(5)}`;
}
