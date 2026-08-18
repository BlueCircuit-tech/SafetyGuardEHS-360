/** Mascaras progressivas — aplicadas enquanto o usuario digita. */

import { limparCep, limparCnae, limparCnpj, limparCpf, limparTelefone } from '@safetyguard/shared';

/** 00.000.000/0000-00 — aceita letras nas 12 primeiras posicoes (CNPJ alfanumerico). */
export function mascaraCnpj(valor: string): string {
  const base = limparCnpj(valor).slice(0, 14);
  let saida = base.slice(0, 2);
  if (base.length > 2) saida += `.${base.slice(2, 5)}`;
  if (base.length > 5) saida += `.${base.slice(5, 8)}`;
  if (base.length > 8) saida += `/${base.slice(8, 12)}`;
  if (base.length > 12) saida += `-${base.slice(12, 14)}`;
  return saida;
}

/** 00000-000 */
export function mascaraCep(valor: string): string {
  const base = limparCep(valor).slice(0, 8);
  return base.length > 5 ? `${base.slice(0, 5)}-${base.slice(5)}` : base;
}

/** (00) 0000-0000 / (00) 00000-0000 */
export function mascaraTelefone(valor: string): string {
  const base = limparTelefone(valor).slice(0, 11);
  if (base.length <= 2) return base.length ? `(${base}` : '';
  const corte = base.length > 10 ? 7 : 6;
  const parte1 = base.slice(2, corte);
  const parte2 = base.slice(corte);
  return `(${base.slice(0, 2)}) ${parte1}${parte2 ? `-${parte2}` : ''}`;
}

/** 000.000.000-00 */
export function mascaraCpf(valor: string): string {
  const base = limparCpf(valor).slice(0, 11);
  let saida = base.slice(0, 3);
  if (base.length > 3) saida += `.${base.slice(3, 6)}`;
  if (base.length > 6) saida += `.${base.slice(6, 9)}`;
  if (base.length > 9) saida += `-${base.slice(9, 11)}`;
  return saida;
}

/** 0000-0/00 */
export function mascaraCnae(valor: string): string {
  const base = limparCnae(valor).slice(0, 7);
  let saida = base.slice(0, 4);
  if (base.length > 4) saida += `-${base.slice(4, 5)}`;
  if (base.length > 5) saida += `/${base.slice(5, 7)}`;
  return saida;
}

export const MASCARAS = {
  cnpj: mascaraCnpj,
  cep: mascaraCep,
  telefone: mascaraTelefone,
  cnae: mascaraCnae,
  cpf: mascaraCpf,
} as const;

export type NomeMascara = keyof typeof MASCARAS;
