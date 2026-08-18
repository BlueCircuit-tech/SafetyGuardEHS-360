import { describe, expect, it } from 'vitest';
import {
  MESES_TENDENCIA_PADRAO,
  causaDesvioCreateSchema,
  exigeFoto,
  indicadoresFiltroSchema,
  isDesvio,
  observacaoCreateSchema,
  observacaoFiltroSchema,
  observacaoUpdateSchema,
} from './observacao.js';

const AREA_ID = '3f1b7c2a-9d4e-4a1b-8c5d-0e2f6a7b8c9d';
const CAUSA_ID = '9c8d7e6f-5a4b-4c3d-2e1f-0a9b8c7d6e5f';
const TOKEN = 'WUHM47E7NT';

const base = {
  areaId: AREA_ID,
  descricao: 'Colaborador operando a britadeira sem protetor auricular.',
  observador: 'Rafael Martini',
};

describe('classificacao dos tipos', () => {
  it('separa desvio de registro positivo', () => {
    expect(isDesvio('COMPORTAMENTO_INSEGURO')).toBe(true);
    expect(isDesvio('CONDICAO_INSEGURA')).toBe(true);
    expect(isDesvio('NAO_CONFORMIDADE')).toBe(true);
    expect(isDesvio('COMPORTAMENTO_SEGURO')).toBe(false);
    expect(isDesvio('MELHORIA_IDENTIFICADA')).toBe(false);
  });

  it('exige foto onde a evidencia sustenta o plano de acao', () => {
    expect(exigeFoto('CONDICAO_INSEGURA')).toBe(true);
    expect(exigeFoto('NAO_CONFORMIDADE')).toBe(true);
    expect(exigeFoto('COMPORTAMENTO_INSEGURO')).toBe(false);
    expect(exigeFoto('COMPORTAMENTO_SEGURO')).toBe(false);
  });
});

describe('observacaoCreateSchema', () => {
  it('aceita comportamento seguro sem causa nem risco', () => {
    const resultado = observacaoCreateSchema.safeParse({ ...base, tipo: 'COMPORTAMENTO_SEGURO' });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.causaId).toBeNull();
      expect(resultado.data.severidade).toBeNull();
      expect(resultado.data.situacao).toBe('REGISTRADA');
    }
  });

  it('preenche a data e hora com o momento do registro', () => {
    const resultado = observacaoCreateSchema.parse({ ...base, tipo: 'COMPORTAMENTO_SEGURO' });
    expect(resultado.dataHora).toBeInstanceOf(Date);
    expect(Math.abs(resultado.dataHora.getTime() - Date.now())).toBeLessThan(5000);
  });

  it('rejeita registro no futuro', () => {
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const resultado = observacaoCreateSchema.safeParse({ ...base, tipo: 'COMPORTAMENTO_SEGURO', dataHora: amanha });
    expect(resultado.success).toBe(false);
  });

  it('aceita a area vinda pelo token do QR Code', () => {
    const resultado = observacaoCreateSchema.safeParse({
      tokenQr: TOKEN,
      tipo: 'COMPORTAMENTO_SEGURO',
      descricao: base.descricao,
      observador: base.observador,
    });
    expect(resultado.success).toBe(true);
  });

  it('exige area ou token', () => {
    const resultado = observacaoCreateSchema.safeParse({
      tipo: 'COMPORTAMENTO_SEGURO',
      descricao: base.descricao,
      observador: base.observador,
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues.some((issue) => issue.path[0] === 'areaId')).toBe(true);
    }
  });

  it('rejeita token de QR malformado', () => {
    const resultado = observacaoCreateSchema.safeParse({
      tokenQr: 'ABC',
      tipo: 'COMPORTAMENTO_SEGURO',
      descricao: base.descricao,
      observador: base.observador,
    });
    expect(resultado.success).toBe(false);
  });

  it('exige causa nos desvios — e o que monta o Pareto', () => {
    const resultado = observacaoCreateSchema.safeParse({ ...base, tipo: 'COMPORTAMENTO_INSEGURO' });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      const issue = resultado.error.issues.find((item) => item.path[0] === 'causaId');
      expect(issue?.message).toContain('Pareto');
    }
  });

  it('exige foto em condicao insegura e nao conformidade', () => {
    for (const tipo of ['CONDICAO_INSEGURA', 'NAO_CONFORMIDADE'] as const) {
      const resultado = observacaoCreateSchema.safeParse({ ...base, tipo, causaId: CAUSA_ID });
      expect(resultado.success).toBe(false);
      if (!resultado.success) {
        expect(resultado.error.issues.some((issue) => issue.path[0] === 'fotoUrl')).toBe(true);
      }
    }
  });

  it('aceita condicao insegura com foto e causa', () => {
    const resultado = observacaoCreateSchema.safeParse({
      ...base,
      tipo: 'CONDICAO_INSEGURA',
      causaId: CAUSA_ID,
      fotoUrl: '/arquivos/evidencia.png',
    });
    expect(resultado.success).toBe(true);
  });

  it('exige os quatro fatores de risco ou nenhum', () => {
    const parcial = observacaoCreateSchema.safeParse({
      ...base,
      tipo: 'COMPORTAMENTO_INSEGURO',
      causaId: CAUSA_ID,
      severidade: 4,
    });

    expect(parcial.success).toBe(false);
    if (!parcial.success) {
      const campos = parcial.error.issues.map((issue) => issue.path[0]);
      expect(campos).toEqual(expect.arrayContaining(['probabilidade', 'exposicao', 'frequencia']));
      expect(campos).not.toContain('severidade');
    }

    const completo = observacaoCreateSchema.safeParse({
      ...base,
      tipo: 'COMPORTAMENTO_INSEGURO',
      causaId: CAUSA_ID,
      severidade: 5,
      probabilidade: 4,
      exposicao: 3,
      frequencia: 2,
    });
    expect(completo.success).toBe(true);

    const nenhum = observacaoCreateSchema.safeParse({
      ...base,
      tipo: 'COMPORTAMENTO_INSEGURO',
      causaId: CAUSA_ID,
    });
    expect(nenhum.success).toBe(true);
  });

  it('rejeita fator de risco fora de 1..5', () => {
    const resultado = observacaoCreateSchema.safeParse({
      ...base,
      tipo: 'COMPORTAMENTO_INSEGURO',
      causaId: CAUSA_ID,
      severidade: 6,
      probabilidade: 4,
      exposicao: 3,
      frequencia: 2,
    });
    expect(resultado.success).toBe(false);
  });

  it('rejeita meia coordenada de GPS', () => {
    const resultado = observacaoCreateSchema.safeParse({
      ...base,
      tipo: 'COMPORTAMENTO_SEGURO',
      latitude: -16.6864,
    });
    expect(resultado.success).toBe(false);
  });

  it('nao aceita ATOS_E_CONDICOES como classificacao da ocorrencia', () => {
    const resultado = observacaoCreateSchema.safeParse({
      ...base,
      tipo: 'COMPORTAMENTO_SEGURO',
      classificacaoBird: 'ATOS_E_CONDICOES',
    });
    expect(resultado.success).toBe(false);
  });

  it('exige descricao com conteudo util', () => {
    const resultado = observacaoCreateSchema.safeParse({ ...base, descricao: 'curto', tipo: 'COMPORTAMENTO_SEGURO' });
    expect(resultado.success).toBe(false);
  });
});

describe('observacaoUpdateSchema', () => {
  it('aceita atualizacao parcial sem exigir area', () => {
    expect(observacaoUpdateSchema.safeParse({ situacao: 'CONCLUIDA' }).success).toBe(true);
  });

  it('mantem a regra da foto quando o tipo e enviado', () => {
    expect(observacaoUpdateSchema.safeParse({ tipo: 'CONDICAO_INSEGURA', causaId: CAUSA_ID }).success).toBe(false);
  });
});

describe('causaDesvioCreateSchema', () => {
  it('normaliza o codigo', () => {
    const causa = causaDesvioCreateSchema.parse({
      codigo: 'epi nao uso',
      descricao: 'Nao utilizacao de EPI',
      tipo: 'COMPORTAMENTO_INSEGURO',
    });

    expect(causa.codigo).toBe('EPI-NAO-USO');
    expect(causa.ativa).toBe(true);
  });

  it('exige tipo valido', () => {
    expect(
      causaDesvioCreateSchema.safeParse({ codigo: 'X', descricao: 'Teste', tipo: 'INEXISTENTE' }).success,
    ).toBe(false);
  });
});

describe('filtros', () => {
  it('aplica paginacao e ordenacao padrao', () => {
    const filtro = observacaoFiltroSchema.parse({});

    expect(filtro.ordenarPor).toBe('dataHora');
    expect(filtro.direcao).toBe('desc');
    expect(filtro.porPagina).toBe(20);
  });

  it('aceita recorte de periodo', () => {
    const filtro = observacaoFiltroSchema.parse({ de: '2026-01-01', ate: '2026-06-30' });

    expect(filtro.de).toBeInstanceOf(Date);
    expect(filtro.ate).toBeInstanceOf(Date);
  });

  it('usa a janela padrao de meses nos indicadores', () => {
    const filtro = indicadoresFiltroSchema.parse({});

    expect(filtro.meses).toBe(MESES_TENDENCIA_PADRAO);
    expect(filtro.topCausas).toBe(8);
  });

  it('limita a janela e o top de causas', () => {
    expect(indicadoresFiltroSchema.safeParse({ meses: '36' }).success).toBe(false);
    expect(indicadoresFiltroSchema.safeParse({ topCausas: '50' }).success).toBe(false);
  });
});
