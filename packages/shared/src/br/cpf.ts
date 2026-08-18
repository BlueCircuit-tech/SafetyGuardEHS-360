/**
 * CPF — Cadastro de Pessoas Fisicas.
 *
 * Identifica o colaborador em ASO, PPP e no eSocial. Diferente do CNPJ, nao
 * ha versao alfanumerica: sao sempre 11 digitos com dois verificadores.
 */

/** Remove tudo que nao for digito. */
export function limparCpf(valor: string): string {
  return (valor ?? '').replace(/\D/g, '');
}

/** `123.456.789-09` — formato de exibicao. */
export function formatarCpf(valor: string): string {
  const limpo = limparCpf(valor);
  if (limpo.length !== 11) return valor;
  return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-${limpo.slice(9)}`;
}

/** Mascara para exibicao publica: `***.456.789-**`. */
export function mascararCpf(valor: string): string {
  const limpo = limparCpf(valor);
  if (limpo.length !== 11) return valor;
  return `***.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-**`;
}

function digitoVerificador(base: string, pesoInicial: number): number {
  let soma = 0;
  for (let i = 0; i < base.length; i += 1) {
    soma += Number(base[i]) * (pesoInicial - i);
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

/**
 * Valida os dois digitos verificadores.
 *
 * Sequencias de digito repetido (`111.111.111-11`) passam no calculo, mas nao
 * sao CPF valido — sao rejeitadas explicitamente.
 */
export function isCpfValido(valor: string): boolean {
  const cpf = limparCpf(valor);

  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const primeiro = digitoVerificador(cpf.slice(0, 9), 10);
  if (primeiro !== Number(cpf[9])) return false;

  const segundo = digitoVerificador(cpf.slice(0, 10), 11);
  return segundo === Number(cpf[10]);
}
