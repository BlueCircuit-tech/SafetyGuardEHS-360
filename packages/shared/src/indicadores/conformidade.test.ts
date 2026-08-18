import { describe, expect, it } from 'vitest';
import {
  DIAS_ALERTA_PADRAO,
  calcularConformidade,
  calcularIcl,
  calcularValidade,
  diasAteVencer,
  situacaoDaValidade,
  urgenciaDaRenovacao,
} from './conformidade.js';

/** Data fixa para os testes nao dependerem de quando rodam. */
const HOJE = new Date(2026, 7, 17); // 17/08/2026

function emDias(dias: number): Date {
  const data = new Date(HOJE.getTime());
  data.setDate(data.getDate() + dias);
  return data;
}

describe('diasAteVencer', () => {
  it('conta em dias, ignorando a hora', () => {
    expect(diasAteVencer(new Date(2026, 7, 20, 23, 59), HOJE)).toBe(3);
    expect(diasAteVencer(new Date(2026, 7, 17, 1, 0), HOJE)).toBe(0);
    expect(diasAteVencer(new Date(2026, 7, 10), HOJE)).toBe(-7);
  });

  it('devolve null sem validade ou com data invalida', () => {
    expect(diasAteVencer(null, HOJE)).toBeNull();
    expect(diasAteVencer(undefined, HOJE)).toBeNull();
    expect(diasAteVencer('nao-e-data', HOJE)).toBeNull();
  });

  it('aceita string ISO', () => {
    expect(diasAteVencer('2026-08-27T00:00:00', HOJE)).toBe(10);
  });
});

describe('situacaoDaValidade', () => {
  it('classifica pelas faixas', () => {
    expect(situacaoDaValidade(emDias(120), HOJE)).toBe('VIGENTE');
    expect(situacaoDaValidade(emDias(10), HOJE)).toBe('A_VENCER');
    expect(situacaoDaValidade(emDias(-1), HOJE)).toBe('VENCIDO');
    expect(situacaoDaValidade(null, HOJE)).toBe('SEM_VALIDADE');
  });

  it('o que vence hoje ainda esta valido', () => {
    expect(situacaoDaValidade(HOJE, HOJE)).toBe('A_VENCER');
  });

  it('respeita a janela de alerta informada', () => {
    expect(situacaoDaValidade(emDias(45), HOJE)).toBe('VIGENTE');
    expect(situacaoDaValidade(emDias(45), HOJE, 60)).toBe('A_VENCER');
    expect(situacaoDaValidade(emDias(DIAS_ALERTA_PADRAO), HOJE)).toBe('A_VENCER');
  });
});

describe('calcularValidade', () => {
  it('soma meses', () => {
    expect(calcularValidade(new Date(2026, 0, 15), 12)).toEqual(new Date(2027, 0, 15));
    expect(calcularValidade(new Date(2026, 0, 15), 24)).toEqual(new Date(2028, 0, 15));
  });

  it('nao pula o mes quando o dia nao existe no destino', () => {
    // 31/01 + 1 mes seria 03/03 com a soma ingenua.
    expect(calcularValidade(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 28));
  });
});

describe('calcularConformidade', () => {
  const carteira = [
    { validade: emDias(300) },
    { validade: emDias(200) },
    { validade: emDias(20) },
    { validade: emDias(5) },
    { validade: emDias(-3) },
    { validade: null },
  ];

  it('separa vigentes, a vencer, vencidos e sem validade', () => {
    const resumo = calcularConformidade(carteira, HOJE);

    expect(resumo.total).toBe(6);
    expect(resumo.vigentes).toBe(2);
    expect(resumo.aVencer).toBe(2);
    expect(resumo.vencidos).toBe(1);
    expect(resumo.semValidade).toBe(1);
  });

  it('conta o que esta a vencer como em dia', () => {
    // 4 de 6 em dia = 66,7%.
    expect(calcularConformidade(carteira, HOJE).percentualConformidade).toBeCloseTo(66.7, 1);
  });

  it('nao premia o cadastro incompleto', () => {
    const semValidade = calcularConformidade([{ validade: null }, { validade: null }], HOJE);

    expect(semValidade.percentualConformidade).toBe(0);
    expect(semValidade.classificacao.nivel).toBe('CRITICO');
  });

  it('acumula as faixas de 30, 60 e 90 dias', () => {
    const resumo = calcularConformidade(carteira, HOJE);
    const faixa = (dias: number) => resumo.porFaixa.find((f) => f.dias === dias)?.quantidade;

    // O vencido nao entra em nenhuma faixa futura.
    expect(faixa(30)).toBe(2);
    expect(faixa(60)).toBe(2);
    expect(faixa(90)).toBe(2);
  });

  it('carteira vazia nao quebra', () => {
    const resumo = calcularConformidade([], HOJE);

    expect(resumo.total).toBe(0);
    expect(resumo.percentualConformidade).toBe(0);
  });
});

describe('calcularIcl', () => {
  const cheia = calcularConformidade([{ validade: emDias(200) }], HOJE); // 100%
  const zerada = calcularConformidade([{ validade: emDias(-1) }], HOJE); // 0%

  it('pondera saude com peso maior que documentos', () => {
    // 100 x 60 + 0 x 40 = 60.
    expect(calcularIcl(cheia, zerada).valor).toBe(60);
    expect(calcularIcl(zerada, cheia).valor).toBe(40);
  });

  it('reponderar quando falta um dos lados — nao trata ausencia como zero', () => {
    const so = calcularIcl(cheia, null);

    expect(so.valor).toBe(100);
    expect(so.documentos).toBeNull();
    expect(so.pesoConsiderado).toBe(60);
  });

  it('carteira vazia conta como ausencia, nao como nota zero', () => {
    const vazia = calcularConformidade([], HOJE);

    expect(calcularIcl(cheia, vazia).valor).toBe(100);
  });

  it('sem nenhum dado devolve zero', () => {
    expect(calcularIcl(null, null).valor).toBe(0);
    expect(calcularIcl(null, null).pesoConsiderado).toBe(0);
  });
});

describe('urgenciaDaRenovacao', () => {
  it('ordena a fila pelo que aperta primeiro', () => {
    expect(urgenciaDaRenovacao(emDias(-1), HOJE)).toBe('VENCIDO');
    expect(urgenciaDaRenovacao(emDias(5), HOJE)).toBe('CRITICO');
    expect(urgenciaDaRenovacao(emDias(20), HOJE)).toBe('ATENCAO');
    expect(urgenciaDaRenovacao(emDias(80), HOJE)).toBe('PROGRAMADO');
  });

  it('fica de fora da fila o que ainda esta longe ou nao tem validade', () => {
    expect(urgenciaDaRenovacao(emDias(200), HOJE)).toBeNull();
    expect(urgenciaDaRenovacao(null, HOJE)).toBeNull();
  });
});
