import { describe, expect, it } from 'vitest';
import { conferirSenha, gerarHashSenha } from './senha.js';

describe('hash de senha', () => {
  it('confere a senha correta', async () => {
    const hash = await gerarHashSenha('SafetyGuard2026');
    expect(await conferirSenha('SafetyGuard2026', hash)).toBe(true);
  });

  it('rejeita a senha errada', async () => {
    const hash = await gerarHashSenha('SafetyGuard2026');
    expect(await conferirSenha('SafetyGuard2027', hash)).toBe(false);
  });

  it('gera hashes diferentes para a mesma senha — o sal e por usuario', async () => {
    const [a, b] = await Promise.all([gerarHashSenha('MesmaSenha1'), gerarHashSenha('MesmaSenha1')]);

    expect(a).not.toBe(b);
    expect(await conferirSenha('MesmaSenha1', a)).toBe(true);
    expect(await conferirSenha('MesmaSenha1', b)).toBe(true);
  });

  it('usa o formato scrypt$sal$hash', async () => {
    const hash = await gerarHashSenha('SafetyGuard2026');
    const partes = hash.split('$');

    expect(partes).toHaveLength(3);
    expect(partes[0]).toBe('scrypt');
    expect(partes[1]).toMatch(/^[0-9a-f]{32}$/);
    expect(partes[2]).toMatch(/^[0-9a-f]{128}$/);
  });

  it('nunca guarda a senha em texto puro', async () => {
    const hash = await gerarHashSenha('SenhaSecreta2026');
    expect(hash).not.toContain('SenhaSecreta2026');
  });

  it('devolve false para hash malformado em vez de estourar', async () => {
    for (const invalido of ['', 'texto-solto', 'scrypt$so-uma-parte', 'bcrypt$aa$bb', 'scrypt$zz$zz']) {
      await expect(conferirSenha('qualquer', invalido)).resolves.toBe(false);
    }
  });

  it('normaliza unicode — a mesma senha digitada de formas diferentes confere', async () => {
    // "senhaç" com cedilha composta vs. combinada
    const composta = 'senhaç1';
    const combinada = 'senhaç1';

    const hash = await gerarHashSenha(composta);
    expect(await conferirSenha(combinada, hash)).toBe(true);
  });
});
