/**
 * Validacao de CNPJ.
 *
 * Suporta os dois formatos aceitos pela Receita Federal:
 *  - numerico classico ......  12 digitos + 2 digitos verificadores
 *  - alfanumerico (2026+) ...  12 caracteres [0-9A-Z] + 2 digitos verificadores
 *
 * Em ambos os casos o digito verificador usa o valor ASCII do caractere
 * subtraido de 48 (zero = 0 ... nove = 9, A = 17 ... Z = 42).
 */

const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/** Remove tudo que nao for digito ou letra e normaliza para maiusculas. */
export function limparCnpj(valor: string): string {
  return (valor ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function valorCaractere(caractere: string): number {
  return caractere.charCodeAt(0) - 48;
}

function calcularDigito(base: string, pesos: readonly number[]): number {
  const soma = base
    .split('')
    .reduce((acc, caractere, indice) => acc + valorCaractere(caractere) * (pesos[indice] ?? 0), 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Retorna true quando o CNPJ (com ou sem mascara) e estruturalmente valido. */
export function isCnpjValido(valor: string): boolean {
  const cnpj = limparCnpj(valor);

  if (cnpj.length !== 14) return false;
  // Os dois ultimos caracteres sao sempre numericos.
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj)) return false;
  // Sequencias repetidas (00000000000000, AAAAAAAAAAAA00, ...) nao existem.
  if (/^(.)\1{13}$/.test(cnpj)) return false;

  const base = cnpj.slice(0, 12);
  const dv1 = calcularDigito(base, PESOS_DV1);
  const dv2 = calcularDigito(base + String(dv1), PESOS_DV2);

  return cnpj.slice(12) === `${dv1}${dv2}`;
}

/** Retorna true quando o CNPJ usa o novo formato alfanumerico. */
export function isCnpjAlfanumerico(valor: string): boolean {
  return /[A-Z]/.test(limparCnpj(valor));
}

/** Aplica a mascara 00.000.000/0000-00 (vale tambem para o formato alfanumerico). */
export function formatarCnpj(valor: string): string {
  const cnpj = limparCnpj(valor);
  if (cnpj.length !== 14) return valor;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

/** Gera os 2 digitos verificadores de uma base de 12 caracteres. Util em testes/seed. */
export function digitosVerificadoresCnpj(base12: string): string {
  const base = limparCnpj(base12).slice(0, 12).padStart(12, '0');
  const dv1 = calcularDigito(base, PESOS_DV1);
  const dv2 = calcularDigito(base + String(dv1), PESOS_DV2);
  return `${dv1}${dv2}`;
}
