import { describe, expect, it } from 'vitest';
import {
  PERFIS,
  PERMISSOES,
  PERMISSOES_POR_PERFIL,
  SENHA_TAMANHO_MINIMO,
  exigeCliente,
  loginSchema,
  permissoesDoPerfil,
  podeFazer,
  senhaSchema,
  trocarSenhaSchema,
  usuarioCreateSchema,
  usuarioUpdateSchema,
} from './usuario.js';

const CLIENTE_ID = '3f1b7c2a-9d4e-4a1b-8c5d-0e2f6a7b8c9d';

const base = {
  nome: 'Marina Duarte',
  email: 'Marina.Duarte@SafetyGuard.com.br',
  senha: 'Campo2026',
  perfil: 'TECNICO' as const,
};

describe('matriz de permissoes', () => {
  it('todo perfil tem uma lista declarada', () => {
    for (const perfil of PERFIS) {
      expect(PERMISSOES_POR_PERFIL[perfil]).toBeDefined();
    }
  });

  it('so usa permissoes que existem no catalogo', () => {
    for (const perfil of PERFIS) {
      for (const permissao of permissoesDoPerfil(perfil)) {
        expect(PERMISSOES).toContain(permissao);
      }
    }
  });

  it('ADMIN tem todas as permissoes', () => {
    expect(permissoesDoPerfil('ADMIN')).toHaveLength(PERMISSOES.length);
  });

  it('so o ADMIN gerencia usuarios', () => {
    for (const perfil of PERFIS) {
      expect(podeFazer(perfil, 'usuarios:gerenciar')).toBe(perfil === 'ADMIN');
    }
  });

  it('DIRETORIA e CLIENTE nao escrevem nada', () => {
    for (const perfil of ['DIRETORIA', 'CLIENTE'] as const) {
      expect(podeFazer(perfil, 'cadastros:escrever')).toBe(false);
      expect(podeFazer(perfil, 'observacoes:escrever')).toBe(false);
      expect(podeFazer(perfil, 'planos:escrever')).toBe(false);
    }
  });

  it('TECNICO registra observacoes mas nao mexe em cadastro nem ve indicadores', () => {
    expect(podeFazer('TECNICO', 'observacoes:escrever')).toBe(true);
    expect(podeFazer('TECNICO', 'cadastros:escrever')).toBe(false);
    expect(podeFazer('TECNICO', 'indicadores:ler')).toBe(false);
  });

  it('quem escala planos tambem os le', () => {
    for (const perfil of PERFIS) {
      if (podeFazer(perfil, 'planos:escalonar')) {
        expect(podeFazer(perfil, 'planos:ler')).toBe(true);
      }
    }
  });

  it('quem escreve tambem le, em cada recurso', () => {
    const pares = [
      ['cadastros:escrever', 'cadastros:ler'],
      ['observacoes:escrever', 'observacoes:ler'],
      ['planos:escrever', 'planos:ler'],
      ['saude:escrever', 'saude:ler'],
    ] as const;

    for (const perfil of PERFIS) {
      for (const [escrita, leitura] of pares) {
        if (podeFazer(perfil, escrita)) expect(podeFazer(perfil, leitura)).toBe(true);
      }
    }
  });

  it('so o perfil CLIENTE e restrito a um cliente', () => {
    for (const perfil of PERFIS) {
      expect(exigeCliente(perfil)).toBe(perfil === 'CLIENTE');
    }
  });
});

describe('senhaSchema', () => {
  it('exige tamanho minimo, letra e numero', () => {
    expect(senhaSchema.safeParse('Campo2026').success).toBe(true);
    expect(senhaSchema.safeParse('curta1').success).toBe(false);
    expect(senhaSchema.safeParse('somenteletras').success).toBe(false);
    expect(senhaSchema.safeParse('12345678').success).toBe(false);
  });

  it('o minimo declarado bate com a regra', () => {
    // Um caractere abaixo do minimo reprova; exatamente no minimo aprova.
    const abaixo = 'a'.repeat(SENHA_TAMANHO_MINIMO - 2) + '1';
    const noLimite = 'a'.repeat(SENHA_TAMANHO_MINIMO - 1) + '1';

    expect(abaixo).toHaveLength(SENHA_TAMANHO_MINIMO - 1);
    expect(senhaSchema.safeParse(abaixo).success).toBe(false);
    expect(senhaSchema.safeParse(noLimite).success).toBe(true);
  });
});

describe('loginSchema', () => {
  it('normaliza o e-mail', () => {
    expect(loginSchema.parse({ email: '  ADMIN@Empresa.com ', senha: 'x' }).email).toBe('admin@empresa.com');
  });

  it('exige e-mail valido e senha preenchida', () => {
    expect(loginSchema.safeParse({ email: 'nao-e-email', senha: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.com', senha: '' }).success).toBe(false);
  });
});

describe('usuarioCreateSchema', () => {
  it('normaliza o e-mail e aplica o padrao de ativo', () => {
    const usuario = usuarioCreateSchema.parse(base);

    expect(usuario.email).toBe('marina.duarte@safetyguard.com.br');
    expect(usuario.ativo).toBe(true);
    expect(usuario.clienteId).toBeNull();
  });

  it('exige cliente no perfil CLIENTE', () => {
    const resultado = usuarioCreateSchema.safeParse({ ...base, perfil: 'CLIENTE' });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues.some((issue) => issue.path[0] === 'clienteId')).toBe(true);
    }
  });

  it('aceita perfil CLIENTE com o vinculo', () => {
    expect(usuarioCreateSchema.safeParse({ ...base, perfil: 'CLIENTE', clienteId: CLIENTE_ID }).success).toBe(true);
  });

  it('rejeita senha fraca e perfil inexistente', () => {
    expect(usuarioCreateSchema.safeParse({ ...base, senha: '123' }).success).toBe(false);
    expect(usuarioCreateSchema.safeParse({ ...base, perfil: 'CHEFAO' }).success).toBe(false);
  });

  it('exige os campos obrigatorios', () => {
    const resultado = usuarioCreateSchema.safeParse({});
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      const campos = resultado.error.issues.map((issue) => issue.path[0]);
      expect(campos).toEqual(expect.arrayContaining(['nome', 'email', 'perfil', 'senha']));
    }
  });
});

describe('usuarioUpdateSchema', () => {
  it('aceita atualizacao parcial sem senha', () => {
    expect(usuarioUpdateSchema.safeParse({ cargo: 'Coordenadora' }).success).toBe(true);
  });

  it('valida a senha quando ela e enviada', () => {
    expect(usuarioUpdateSchema.safeParse({ senha: 'fraca' }).success).toBe(false);
    expect(usuarioUpdateSchema.safeParse({ senha: 'NovaSenha2026' }).success).toBe(true);
  });
});

describe('trocarSenhaSchema', () => {
  it('exige que a confirmacao confira', () => {
    const resultado = trocarSenhaSchema.safeParse({
      senhaAtual: 'Antiga2026',
      novaSenha: 'Nova2026x',
      confirmacao: 'Outra2026x',
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues.some((issue) => issue.path[0] === 'confirmacao')).toBe(true);
    }
  });

  it('nao deixa repetir a senha atual', () => {
    const resultado = trocarSenhaSchema.safeParse({
      senhaAtual: 'Mesma2026',
      novaSenha: 'Mesma2026',
      confirmacao: 'Mesma2026',
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues.some((issue) => issue.path[0] === 'novaSenha')).toBe(true);
    }
  });

  it('aceita a troca valida', () => {
    expect(
      trocarSenhaSchema.safeParse({ senhaAtual: 'Antiga2026', novaSenha: 'Nova2026x', confirmacao: 'Nova2026x' })
        .success,
    ).toBe(true);
  });
});
