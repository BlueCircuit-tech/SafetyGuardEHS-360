import { describe, expect, it } from 'vitest';
import { formatarCpf, isCpfValido, limparCpf, mascararCpf } from '../br/cpf.js';
import { asoCreateSchema, validadeSugeridaDoAso } from './aso.js';
import { colaboradorCreateSchema, colaboradorUpdateSchema } from './colaborador.js';
import { CATALOGO_DOCUMENTOS, TIPOS_DOCUMENTO, definicaoDoDocumento, documentoCreateSchema } from './documento.js';

const CLIENTE_ID = '3f1b7c2a-9d4e-4a1b-8c5d-0e2f6a7b8c9d';
const TERCEIRO_ID = '8a2c4d6e-1f3b-4a5c-9d7e-2b4f6a8c0d1e';
const COLABORADOR_ID = '5c7e9a1b-3d5f-4b7a-8c9d-1e3f5a7b9c0d';
const AREA_ID = '7e9a1b3d-5f7a-4c9d-8b1e-3f5a7b9c0d1e';

/** CPF valido de teste — digitos verificadores conferem. */
const CPF = '52998224725';

describe('CPF', () => {
  it('valida os digitos verificadores', () => {
    expect(isCpfValido(CPF)).toBe(true);
    expect(isCpfValido('529.982.247-25')).toBe(true);
    expect(isCpfValido('52998224726')).toBe(false);
  });

  it('rejeita tamanho errado e digitos repetidos', () => {
    expect(isCpfValido('123')).toBe(false);
    expect(isCpfValido('529982247250')).toBe(false);
    // Passa no calculo do verificador, mas nao e CPF.
    expect(isCpfValido('11111111111')).toBe(false);
    expect(isCpfValido('00000000000')).toBe(false);
  });

  it('formata, limpa e mascara', () => {
    expect(formatarCpf(CPF)).toBe('529.982.247-25');
    expect(limparCpf('529.982.247-25')).toBe(CPF);
    expect(mascararCpf(CPF)).toBe('***.982.247-**');
  });
});

describe('colaboradorCreateSchema', () => {
  const base = {
    clienteId: CLIENTE_ID,
    vinculo: 'CLIENTE' as const,
    nome: 'Joana Ribeiro',
    cpf: '529.982.247-25',
    funcao: 'Operadora de empilhadeira',
  };

  it('normaliza o CPF e aplica os padroes', () => {
    const colaborador = colaboradorCreateSchema.parse(base);

    expect(colaborador.cpf).toBe(CPF);
    expect(colaborador.grauRisco).toBe('MEDIO');
    expect(colaborador.situacao).toBe('ATIVO');
  });

  it('exige a empresa contratada no vinculo de terceiro', () => {
    const semTerceiro = colaboradorCreateSchema.safeParse({ ...base, vinculo: 'TERCEIRO' });

    expect(semTerceiro.success).toBe(false);
    expect(colaboradorCreateSchema.safeParse({ ...base, vinculo: 'TERCEIRO', terceiroId: TERCEIRO_ID }).success).toBe(
      true,
    );
  });

  it('nao aceita empresa contratada em colaborador proprio', () => {
    expect(colaboradorCreateSchema.safeParse({ ...base, terceiroId: TERCEIRO_ID }).success).toBe(false);
  });

  it('rejeita desligamento anterior a admissao', () => {
    const resultado = colaboradorCreateSchema.safeParse({
      ...base,
      dataAdmissao: '2024-05-10',
      dataDesligamento: '2024-01-10',
      situacao: 'DESLIGADO',
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues.some((i) => i.path[0] === 'dataDesligamento')).toBe(true);
    }
  });

  it('exige a data ao marcar como desligado', () => {
    expect(colaboradorCreateSchema.safeParse({ ...base, situacao: 'DESLIGADO' }).success).toBe(false);
  });

  it('rejeita CPF invalido e admissao no futuro', () => {
    expect(colaboradorCreateSchema.safeParse({ ...base, cpf: '11111111111' }).success).toBe(false);
    expect(colaboradorCreateSchema.safeParse({ ...base, dataAdmissao: '2099-01-01' }).success).toBe(false);
  });

  it('aceita atualizacao parcial', () => {
    expect(colaboradorUpdateSchema.safeParse({ setor: 'Expedicao' }).success).toBe(true);
  });
});

describe('asoCreateSchema', () => {
  const base = {
    colaboradorId: COLABORADOR_ID,
    tipo: 'PERIODICO' as const,
    dataExame: '2026-01-15',
    resultado: 'APTO' as const,
    medicoNome: 'Dr. Paulo Menezes',
    medicoCrm: 'crm-sp 123456',
  };

  it('normaliza o CRM', () => {
    expect(asoCreateSchema.parse(base).medicoCrm).toBe('CRM-SP 123456');
  });

  it('exige validade posterior ao exame', () => {
    expect(asoCreateSchema.safeParse({ ...base, validade: '2025-12-01' }).success).toBe(false);
    expect(asoCreateSchema.safeParse({ ...base, validade: '2027-01-15' }).success).toBe(true);
  });

  it('exige descricao quando ha restricao ou inaptidao', () => {
    expect(asoCreateSchema.safeParse({ ...base, resultado: 'APTO_COM_RESTRICAO' }).success).toBe(false);
    expect(asoCreateSchema.safeParse({ ...base, resultado: 'INAPTO' }).success).toBe(false);
    expect(
      asoCreateSchema.safeParse({ ...base, resultado: 'INAPTO', restricoes: 'Perda auditiva bilateral.' }).success,
    ).toBe(true);
  });

  it('demissional nao tem validade', () => {
    expect(asoCreateSchema.safeParse({ ...base, tipo: 'DEMISSIONAL', validade: '2027-01-15' }).success).toBe(false);
    expect(asoCreateSchema.safeParse({ ...base, tipo: 'DEMISSIONAL' }).success).toBe(true);
  });

  it('rejeita exame no futuro', () => {
    expect(asoCreateSchema.safeParse({ ...base, dataExame: '2099-01-01' }).success).toBe(false);
  });
});

describe('validadeSugeridaDoAso', () => {
  const exame = new Date(2026, 0, 15);

  it('funcao de risco alto vence em 12 meses; as demais, em 24', () => {
    expect(validadeSugeridaDoAso(exame, 'ALTO', 'PERIODICO')).toEqual(new Date(2027, 0, 15));
    expect(validadeSugeridaDoAso(exame, 'MEDIO', 'PERIODICO')).toEqual(new Date(2028, 0, 15));
    expect(validadeSugeridaDoAso(exame, 'BAIXO', 'PERIODICO')).toEqual(new Date(2028, 0, 15));
  });

  it('demissional nao gera validade', () => {
    expect(validadeSugeridaDoAso(exame, 'ALTO', 'DEMISSIONAL')).toBeNull();
  });
});

describe('catalogo de documentos', () => {
  it('cobre todos os tipos, sem duplicar', () => {
    expect(CATALOGO_DOCUMENTOS).toHaveLength(TIPOS_DOCUMENTO.length);
    expect(new Set(CATALOGO_DOCUMENTOS.map((d) => d.tipo)).size).toBe(TIPOS_DOCUMENTO.length);
  });

  it('so tem validade positiva ou nula', () => {
    for (const definicao of CATALOGO_DOCUMENTOS) {
      if (definicao.validadeMeses !== null) expect(definicao.validadeMeses).toBeGreaterThan(0);
    }
  });

  it('traz os prazos legais conhecidos', () => {
    expect(definicaoDoDocumento('PCMSO').validadeMeses).toBe(12);
    expect(definicaoDoDocumento('PGR').validadeMeses).toBe(24);
    // O PPP acompanha o colaborador e nao tem prazo proprio.
    expect(definicaoDoDocumento('PPP').validadeMeses).toBeNull();
  });
});

describe('documentoCreateSchema', () => {
  const base = {
    clienteId: CLIENTE_ID,
    abrangencia: 'CLIENTE' as const,
    tipo: 'PGR' as const,
    titulo: 'PGR 2026 — Planta Industrial',
    dataEmissao: '2026-02-01',
    responsavelNome: 'Eng. Carla Nunes',
  };

  it('aceita o documento completo', () => {
    const documento = documentoCreateSchema.parse({ ...base, validade: '2028-02-01' });

    expect(documento.situacao).toBe('ATIVO');
    expect(documento.validade).toEqual(new Date('2028-02-01'));
  });

  it('exige o alvo correspondente a abrangencia', () => {
    expect(documentoCreateSchema.safeParse({ ...base, abrangencia: 'AREA' }).success).toBe(false);
    expect(documentoCreateSchema.safeParse({ ...base, abrangencia: 'AREA', areaId: AREA_ID }).success).toBe(true);

    expect(documentoCreateSchema.safeParse({ ...base, abrangencia: 'TERCEIRO' }).success).toBe(false);
    expect(documentoCreateSchema.safeParse({ ...base, abrangencia: 'TERCEIRO', terceiroId: TERCEIRO_ID }).success).toBe(
      true,
    );

    expect(documentoCreateSchema.safeParse({ ...base, abrangencia: 'COLABORADOR' }).success).toBe(false);
    expect(
      documentoCreateSchema.safeParse({ ...base, abrangencia: 'COLABORADOR', colaboradorId: COLABORADOR_ID }).success,
    ).toBe(true);
  });

  it('exige responsavel tecnico onde a lei exige', () => {
    const semResponsavel = { ...base, responsavelNome: undefined };

    expect(documentoCreateSchema.safeParse(semResponsavel).success).toBe(false);
    // AVCB nao exige responsavel tecnico no cadastro.
    expect(documentoCreateSchema.safeParse({ ...semResponsavel, tipo: 'AVCB' }).success).toBe(true);
  });

  it('rejeita validade anterior a emissao', () => {
    expect(documentoCreateSchema.safeParse({ ...base, validade: '2025-01-01' }).success).toBe(false);
  });

  it('aceita documento sem validade', () => {
    expect(documentoCreateSchema.safeParse({ ...base, tipo: 'PROCEDIMENTO', validade: '' }).success).toBe(true);
  });
});
