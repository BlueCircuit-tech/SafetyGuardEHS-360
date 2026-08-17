/** Utilitarios de telefone brasileiro (fixo e celular). */

/** DDDs efetivamente em uso no Brasil. */
export const DDDS_VALIDOS: readonly number[] = [
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
];

export function limparTelefone(valor: string): string {
  return (valor ?? '').replace(/\D/g, '');
}

/**
 * Telefone valido: 10 digitos (fixo) ou 11 digitos (celular, sempre iniciando
 * com 9 depois do DDD), com DDD existente.
 */
export function isTelefoneValido(valor: string): boolean {
  const numero = limparTelefone(valor);
  if (numero.length !== 10 && numero.length !== 11) return false;

  const ddd = Number(numero.slice(0, 2));
  if (!DDDS_VALIDOS.includes(ddd)) return false;

  const assinante = numero.slice(2);
  if (assinante.length === 9) return assinante.startsWith('9');
  // Fixo: primeiro digito entre 2 e 5.
  return /^[2-5]/.test(assinante);
}

/** Retorna true quando o numero e um celular — exigido para WhatsApp. */
export function isCelular(valor: string): boolean {
  const numero = limparTelefone(valor);
  return numero.length === 11 && numero[2] === '9' && isTelefoneValido(numero);
}

/** Aplica (00) 0000-0000 ou (00) 00000-0000. */
export function formatarTelefone(valor: string): string {
  const numero = limparTelefone(valor);
  if (numero.length === 10) return `(${numero.slice(0, 2)}) ${numero.slice(2, 6)}-${numero.slice(6)}`;
  if (numero.length === 11) return `(${numero.slice(0, 2)}) ${numero.slice(2, 7)}-${numero.slice(7)}`;
  return valor;
}

/** Formato E.164 usado pelas APIs de WhatsApp: +55DDDNUMERO. */
export function paraE164(valor: string, ddi = '55'): string {
  const numero = limparTelefone(valor);
  return numero ? `+${ddi}${numero}` : '';
}
