import { describe, expect, it } from 'vitest';
import { digitosVerificadoresCnpj, formatarCnpj, isCnpjAlfanumerico, isCnpjValido, limparCnpj } from './cnpj.js';
import { formatarCep, isCepValido } from './cep.js';
import { formatarTelefone, isCelular, isTelefoneValido, paraE164 } from './telefone.js';
import { formatarCnae, isCnaeValido } from './cnae.js';
import { isUfValida, SIGLAS_UF } from './uf.js';

describe('CNPJ', () => {
  it('aceita CNPJ numerico valido com e sem mascara', () => {
    expect(isCnpjValido('11222333000181')).toBe(true);
    expect(isCnpjValido('11.222.333/0001-81')).toBe(true);
  });

  it('rejeita digito verificador incorreto', () => {
    expect(isCnpjValido('11222333000182')).toBe(false);
  });

  it('rejeita tamanho invalido e sequencias repetidas', () => {
    expect(isCnpjValido('1122233300018')).toBe(false);
    expect(isCnpjValido('00000000000000')).toBe(false);
    expect(isCnpjValido('11111111111111')).toBe(false);
  });

  it('aceita o formato alfanumerico publicado pela Receita Federal', () => {
    // Exemplo oficial: 12.ABC.345/01DE-35
    expect(isCnpjValido('12ABC34501DE35')).toBe(true);
    expect(isCnpjValido('12.ABC.345/01DE-35')).toBe(true);
    expect(isCnpjAlfanumerico('12ABC34501DE35')).toBe(true);
    expect(isCnpjAlfanumerico('11222333000181')).toBe(false);
  });

  it('rejeita alfanumerico com digito verificador nao numerico', () => {
    expect(isCnpjValido('12ABC34501DEA5')).toBe(false);
  });

  it('gera digitos verificadores consistentes com a validacao', () => {
    const base = '12ABC34501DE';
    expect(digitosVerificadoresCnpj(base)).toBe('35');
    expect(isCnpjValido(base + digitosVerificadoresCnpj(base))).toBe(true);
  });

  it('normaliza e formata', () => {
    expect(limparCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(limparCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35');
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarCnpj('12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
    expect(formatarCnpj('123')).toBe('123');
  });
});

describe('CEP', () => {
  it('valida 8 digitos', () => {
    expect(isCepValido('74000-000')).toBe(true);
    expect(isCepValido('74000000')).toBe(true);
    expect(isCepValido('7400000')).toBe(false);
    expect(isCepValido('00000000')).toBe(false);
  });

  it('formata', () => {
    expect(formatarCep('74000000')).toBe('74000-000');
    expect(formatarCep('740')).toBe('740');
  });
});

describe('Telefone', () => {
  it('aceita fixo e celular com DDD valido', () => {
    expect(isTelefoneValido('(62) 3333-4444')).toBe(true);
    expect(isTelefoneValido('62999887766')).toBe(true);
  });

  it('rejeita DDD inexistente e celular sem o 9', () => {
    expect(isTelefoneValido('(20) 99988-7766')).toBe(false);
    expect(isTelefoneValido('62899887766')).toBe(false);
  });

  it('distingue celular de fixo', () => {
    expect(isCelular('62999887766')).toBe(true);
    expect(isCelular('6233334444')).toBe(false);
  });

  it('formata e converte para E.164', () => {
    expect(formatarTelefone('6233334444')).toBe('(62) 3333-4444');
    expect(formatarTelefone('62999887766')).toBe('(62) 99988-7766');
    expect(paraE164('62999887766')).toBe('+5562999887766');
    expect(paraE164('')).toBe('');
  });
});

describe('CNAE', () => {
  it('valida e formata subclasse de 7 digitos', () => {
    expect(isCnaeValido('7120-1/00')).toBe(true);
    expect(isCnaeValido('712010')).toBe(false);
    expect(formatarCnae('7120100')).toBe('7120-1/00');
  });
});

describe('UF', () => {
  it('reconhece as 27 unidades federativas', () => {
    expect(SIGLAS_UF).toHaveLength(27);
    expect(isUfValida('go')).toBe(true);
    expect(isUfValida('XX')).toBe(false);
  });
});
