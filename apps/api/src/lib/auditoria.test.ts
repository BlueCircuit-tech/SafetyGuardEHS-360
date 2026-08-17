import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { calcularDiferenca } from './auditoria.js';
import { camposDoZodError } from './tratador-erros.js';

describe('calcularDiferenca', () => {
  it('registra apenas os campos que mudaram', () => {
    const diferenca = calcularDiferenca(
      { nomeFantasia: 'SafetyGuard', cidade: 'Goiania' },
      { nomeFantasia: 'SafetyGuard EHS', cidade: 'Goiania' },
    );

    expect(diferenca).toEqual({ nomeFantasia: { de: 'SafetyGuard', para: 'SafetyGuard EHS' } });
  });

  it('ignora campos ausentes no payload parcial', () => {
    const diferenca = calcularDiferenca({ nomeFantasia: 'A', email: 'a@b.com' }, { nomeFantasia: 'B' });

    expect(Object.keys(diferenca)).toEqual(['nomeFantasia']);
  });

  it('ignora carimbos de tempo', () => {
    const diferenca = calcularDiferenca(
      { criadoEm: new Date('2026-01-01'), atualizadoEm: new Date('2026-01-01'), uf: 'GO' },
      { criadoEm: new Date('2026-01-01'), atualizadoEm: new Date('2026-08-17'), uf: 'GO' },
    );

    expect(diferenca).toEqual({});
  });

  it('trata null e undefined como o mesmo valor vazio', () => {
    const diferenca = calcularDiferenca({ site: null }, { site: undefined });
    expect(diferenca).toEqual({});
  });

  it('normaliza datas para ISO na comparacao', () => {
    const diferenca = calcularDiferenca(
      { dataFundacao: new Date('2016-03-14T00:00:00.000Z') },
      { dataFundacao: new Date('2020-05-01T00:00:00.000Z') },
    );

    expect(diferenca.dataFundacao).toEqual({
      de: '2016-03-14T00:00:00.000Z',
      para: '2020-05-01T00:00:00.000Z',
    });
  });
});

describe('camposDoZodError', () => {
  it('agrupa as mensagens por caminho do campo', () => {
    const schema = z.object({ cnpj: z.string().min(14), email: z.string().email() });
    const resultado = schema.safeParse({ cnpj: '123', email: 'nao-e-email' });

    expect(resultado.success).toBe(false);
    if (resultado.success) return;

    const campos = camposDoZodError(resultado.error);
    expect(Object.keys(campos).sort()).toEqual(['cnpj', 'email']);
    expect(campos.cnpj).toHaveLength(1);
  });

  it('usa a chave "_" para erros sem campo', () => {
    const schema = z.object({}).refine(() => false, 'payload invalido');
    const resultado = schema.safeParse({});

    expect(resultado.success).toBe(false);
    if (resultado.success) return;

    expect(camposDoZodError(resultado.error)._).toEqual(['payload invalido']);
  });
});
