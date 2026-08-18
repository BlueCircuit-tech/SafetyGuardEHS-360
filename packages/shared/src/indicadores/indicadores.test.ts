import { describe, expect, it } from 'vitest';
import { classificarDesempenho, percentual } from './classificacao.js';
import {
  avaliarIci,
  calcularIndicadoresBbs,
  calcularMapaCalor,
  calcularPareto,
  calcularTendencia,
} from './observacoes.js';
import {
  PESOS_ICSG,
  PESOS_INDICE_GLOBAL,
  PESOS_MATURIDADE,
  calcularIcsg,
  calcularIndiceGlobalSsma,
  calcularScoreMaturidade,
  somaDosPesos,
} from './indices.js';
import { calcularIir, classificarIir, grauRiscoPeloIir, montarPiramideBird } from './risco.js';
import {
  calcularEscalonamento,
  destinatariosDoDesvio,
  planoDeComunicacao,
  resolverComunicacao,
} from './comunicacao.js';

/* -------------------------------------------------------------------------- */

describe('faixas de desempenho', () => {
  it('classifica na escala do plano diretor', () => {
    expect(classificarDesempenho(96.4).nivel).toBe('EXCELENTE');
    expect(classificarDesempenho(95).nivel).toBe('EXCELENTE');
    expect(classificarDesempenho(94.9).nivel).toBe('MUITO_BOM');
    expect(classificarDesempenho(90).nivel).toBe('MUITO_BOM');
    expect(classificarDesempenho(89.9).nivel).toBe('BOM');
    expect(classificarDesempenho(80).nivel).toBe('BOM');
    expect(classificarDesempenho(79.9).nivel).toBe('ATENCAO');
    expect(classificarDesempenho(70).nivel).toBe('ATENCAO');
    expect(classificarDesempenho(69.9).nivel).toBe('CRITICO');
  });

  it('nao explode com denominador zero', () => {
    expect(percentual(0, 0)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe('indicadores BBS (ICS e ICI)', () => {
  // Exemplo do plano: 425 seguros + 72 inseguros + 18 condicoes = 515 -> ICS 82,5%
  const exemploDoPlano = {
    COMPORTAMENTO_SEGURO: 425,
    COMPORTAMENTO_INSEGURO: 72,
    CONDICAO_INSEGURA: 18,
  };

  it('reproduz o exemplo do plano diretor', () => {
    const bbs = calcularIndicadoresBbs(exemploDoPlano);

    expect(bbs.totalBbs).toBe(515);
    expect(bbs.ics).toBe(82.5);
    expect(bbs.ici).toBe(3.5);
    expect(bbs.ici_comportamental).toBe(14);
    expect(bbs.classificacaoIcs.nivel).toBe('BOM');
  });

  it('mantem melhorias e nao conformidades fora do denominador do ICS', () => {
    const bbs = calcularIndicadoresBbs({
      ...exemploDoPlano,
      MELHORIA_IDENTIFICADA: 40,
      NAO_CONFORMIDADE: 10,
    });

    expect(bbs.totalBbs).toBe(515);
    expect(bbs.totalRegistros).toBe(565);
    expect(bbs.ics).toBe(82.5);
  });

  it('reproduz o segundo exemplo (615 observacoes, 89/8/3)', () => {
    const bbs = calcularIndicadoresBbs({
      COMPORTAMENTO_SEGURO: 547,
      COMPORTAMENTO_INSEGURO: 49,
      CONDICAO_INSEGURA: 19,
    });

    expect(bbs.totalBbs).toBe(615);
    expect(Math.round(bbs.ics)).toBe(89);
    expect(Math.round(bbs.ici)).toBe(3);
  });

  it('devolve zeros quando nao ha observacoes no periodo', () => {
    const bbs = calcularIndicadoresBbs({});

    expect(bbs.totalBbs).toBe(0);
    expect(bbs.ics).toBe(0);
    expect(bbs.classificacaoIcs.nivel).toBe('CRITICO');
  });

  it('monta a distribuicao das barras somando 100%', () => {
    const bbs = calcularIndicadoresBbs(exemploDoPlano);
    const soma = bbs.distribuicao.reduce((total, linha) => total + linha.percentual, 0);

    expect(bbs.distribuicao).toHaveLength(3);
    expect(Math.round(soma)).toBe(100);
  });

  it('avalia o ICI contra a meta em vez de inventar faixas', () => {
    expect(avaliarIci(3.5)).toEqual({ ici: 3.5, meta: 10, dentroDaMeta: true, desvio: -6.5 });
    expect(avaliarIci(14).dentroDaMeta).toBe(false);
    expect(avaliarIci(14).desvio).toBe(4);
  });
});

/* -------------------------------------------------------------------------- */

describe('Pareto dos desvios', () => {
  const comportamentos = [
    { causa: 'Nao utilizacao de EPI', quantidade: 28 },
    { causa: 'Trabalho sem autorizacao', quantidade: 18 },
    { causa: 'Uso inadequado de ferramentas', quantidade: 11 },
    { causa: 'Uso de celular em area operacional', quantidade: 8 },
    { causa: 'Nao cumprimento de procedimentos', quantidade: 7 },
  ];

  it('ordena da maior causa para a menor com acumulado crescente', () => {
    const pareto = calcularPareto(comportamentos);

    expect(pareto[0]?.causa).toBe('Nao utilizacao de EPI');
    expect(pareto[0]?.quantidade).toBe(28);
    expect(pareto[pareto.length - 1]?.acumulado).toBe(100);

    const acumulados = pareto.map((item) => item.acumulado);
    expect([...acumulados].sort((a, b) => a - b)).toEqual(acumulados);
  });

  it('marca as causas que compoem os primeiros 80%', () => {
    const pareto = calcularPareto(comportamentos);
    const vitais = pareto.filter((item) => item.dentroDos80);

    expect(vitais.length).toBeGreaterThan(0);
    expect(vitais[0]?.causa).toBe('Nao utilizacao de EPI');
  });

  it('respeita o limite de itens e lida com lista vazia', () => {
    expect(calcularPareto(comportamentos, 3)).toHaveLength(3);
    expect(calcularPareto([])).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */

describe('mapa de calor por area', () => {
  const areas = [
    { area: 'Soldagem', comportamentosInseguros: 18, condicoesInseguras: 6 },
    { area: 'Montagem', comportamentosInseguros: 10, condicoesInseguras: 3 },
    { area: 'Pintura', comportamentosInseguros: 5, condicoesInseguras: 1 },
    { area: 'Logistica', comportamentosInseguros: 14, condicoesInseguras: 4 },
  ];

  it('reproduz a criticidade do exemplo do plano', () => {
    const mapa = calcularMapaCalor(areas);
    const por = Object.fromEntries(mapa.map((celula) => [celula.area, celula.criticidade]));

    expect(mapa[0]?.area).toBe('Soldagem');
    expect(por.Soldagem).toBe('ALTA');
    expect(por.Logistica).toBe('MEDIA_ALTA');
    expect(por.Montagem).toBe('MEDIA');
    expect(por.Pintura).toBe('BAIXA');
  });

  it('trata area sem desvio como baixa', () => {
    const mapa = calcularMapaCalor([{ area: 'Escritorio', comportamentosInseguros: 0, condicoesInseguras: 0 }]);
    expect(mapa[0]?.criticidade).toBe('BAIXA');
  });
});

/* -------------------------------------------------------------------------- */

describe('tendencia mensal', () => {
  it('identifica queda dos desvios como melhora', () => {
    const tendencia = calcularTendencia([
      { periodo: 'Janeiro', comportamentosInseguros: 35, condicoesInseguras: 12 },
      { periodo: 'Fevereiro', comportamentosInseguros: 28, condicoesInseguras: 10 },
      { periodo: 'Marco', comportamentosInseguros: 24, condicoesInseguras: 8 },
      { periodo: 'Abril', comportamentosInseguros: 20, condicoesInseguras: 6 },
      { periodo: 'Maio', comportamentosInseguros: 18, condicoesInseguras: 5 },
    ]);

    expect(tendencia.direcao).toBe('MELHORANDO');
    expect(tendencia.simbolo).toBe('↓');
    expect(tendencia.variacao).toBeLessThan(0);
    expect(tendencia.pontos[0]?.total).toBe(47);
  });

  it('identifica aumento como piora', () => {
    const tendencia = calcularTendencia([
      { periodo: 'Janeiro', comportamentosInseguros: 10, condicoesInseguras: 2 },
      { periodo: 'Fevereiro', comportamentosInseguros: 20, condicoesInseguras: 5 },
    ]);

    expect(tendencia.direcao).toBe('PIORANDO');
    expect(tendencia.simbolo).toBe('↑');
  });

  it('lida com serie curta ou vazia', () => {
    expect(calcularTendencia([]).direcao).toBe('ESTAVEL');
    expect(calcularTendencia([{ periodo: 'Jan', comportamentosInseguros: 1, condicoesInseguras: 1 }]).direcao).toBe(
      'ESTAVEL',
    );
  });
});

/* -------------------------------------------------------------------------- */

describe('indices compostos', () => {
  it('todas as tabelas de peso fecham 100%', () => {
    expect(somaDosPesos(PESOS_INDICE_GLOBAL)).toBe(100);
    expect(somaDosPesos(PESOS_ICSG)).toBe(100);
    expect(somaDosPesos(PESOS_MATURIDADE)).toBe(100);
  });

  it('calcula o Indice Global SSMA pela soma ponderada', () => {
    const resultado = calcularIndiceGlobalSsma({
      SEGURANCA: 100,
      CULTURA_SEGURANCA: 100,
      GESTAO_RISCOS: 100,
      PLANO_ACAO: 100,
      AUDITORIAS: 100,
      MEIO_AMBIENTE: 100,
      TREINAMENTOS: 100,
    });

    expect(resultado.valor).toBe(100);
    expect(resultado.classificacao.nivel).toBe('EXCELENTE');
    expect(resultado.pesoConsiderado).toBe(100);
  });

  it('renormaliza quando um pilar nao tem dados', () => {
    // Sem auditoria: o contrato nao pode ser penalizado como se tivesse tirado zero.
    const resultado = calcularIndiceGlobalSsma({
      SEGURANCA: 90,
      CULTURA_SEGURANCA: 90,
      GESTAO_RISCOS: 90,
      PLANO_ACAO: 90,
      MEIO_AMBIENTE: 90,
      TREINAMENTOS: 90,
    });

    expect(resultado.valor).toBe(90);
    expect(resultado.pesoConsiderado).toBe(90);
    expect(resultado.pilaresSemDados).toEqual(['AUDITORIAS']);
  });

  it('inverte o pilar de condicoes inseguras no ICSG', () => {
    const resultado = calcularIcsg({
      COMPORTAMENTOS_SEGUROS: 82.5,
      CONDICOES_INSEGURAS: 3.5, // ICI: menos e melhor
      PLANO_ACAO_CONCLUIDO: 95,
      INSPECOES_REALIZADAS: 100,
      TREINAMENTOS: 90,
    });

    const condicoes = resultado.pilares.find((pilar) => pilar.pilar === 'CONDICOES_INSEGURAS');
    expect(condicoes?.nota).toBe(3.5);
    expect(condicoes?.notaEfetiva).toBe(96.5);

    // 82,5*0,4 + 96,5*0,2 + 95*0,2 + 100*0,1 + 90*0,1 = 90,3
    expect(resultado.valor).toBe(90.3);
    expect(resultado.classificacao.nivel).toBe('MUITO_BOM');
  });

  it('limita notas fora da faixa 0–100', () => {
    const resultado = calcularScoreMaturidade({ LIDERANCA: 150, CULTURA_SEGURANCA: -20 });
    const lideranca = resultado.pilares.find((pilar) => pilar.pilar === 'LIDERANCA');
    const cultura = resultado.pilares.find((pilar) => pilar.pilar === 'CULTURA_SEGURANCA');

    expect(lideranca?.nota).toBe(100);
    expect(cultura?.nota).toBe(0);
  });

  it('devolve zero quando nenhum pilar tem dados', () => {
    const resultado = calcularIndiceGlobalSsma({});
    expect(resultado.valor).toBe(0);
    expect(resultado.pesoConsiderado).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe('Indice Inteligente de Risco', () => {
  it('reproduz o exemplo do plano (5 x 4 x 3 x 2 = 120, critico)', () => {
    const resultado = calcularIir({ severidade: 5, probabilidade: 4, exposicao: 3, frequencia: 2 });

    expect(resultado.valor).toBe(120);
    expect(resultado.faixa.nivel).toBe('CRITICO');
  });

  it('classifica as demais faixas', () => {
    expect(classificarIir(20).nivel).toBe('BAIXO');
    expect(classificarIir(21).nivel).toBe('MODERADO');
    expect(classificarIir(50).nivel).toBe('MODERADO');
    expect(classificarIir(51).nivel).toBe('ALTO');
    expect(classificarIir(100).nivel).toBe('ALTO');
    expect(classificarIir(101).nivel).toBe('CRITICO');
  });

  it('rejeita fator fora de 1..5', () => {
    expect(() => calcularIir({ severidade: 6, probabilidade: 1, exposicao: 1, frequencia: 1 })).toThrow(RangeError);
    expect(() => calcularIir({ severidade: 0, probabilidade: 1, exposicao: 1, frequencia: 1 })).toThrow(RangeError);
  });

  it('deriva o grau de risco da ocorrencia a partir do IIR', () => {
    expect(grauRiscoPeloIir(120)).toBe('I');
    expect(grauRiscoPeloIir(60)).toBe('I');
    expect(grauRiscoPeloIir(30)).toBe('II');
    expect(grauRiscoPeloIir(10)).toBe('III');
  });
});

/* -------------------------------------------------------------------------- */

describe('Piramide de Bird', () => {
  it('monta a piramide do exemplo do plano', () => {
    const piramide = montarPiramideBird({
      A_MAJOR: 0,
      B_SERIOUS: 1,
      C_MINOR: 3,
      D_MAJOR_NEAR_MISS: 1,
      E_NEAR_MISS: 2,
      F_FIRST_AID: 6,
      ATOS_E_CONDICOES: 351,
    });

    expect(piramide.base).toBe(351);
    expect(piramide.totalOcorrencias).toBe(13);
    expect(piramide.niveis[0]?.codigo).toBe('A');
    expect(piramide.niveis[0]?.quantidade).toBe(0);
  });

  it('calcula a razao entre a base e cada nivel', () => {
    const piramide = montarPiramideBird({ B_SERIOUS: 1, ATOS_E_CONDICOES: 351 });
    const serious = piramide.niveis.find((nivel) => nivel.codigo === 'B');

    expect(serious?.razaoParaBase).toBe(351);
  });

  it('nao divide por zero quando nao ha ocorrencias', () => {
    const piramide = montarPiramideBird({});
    expect(piramide.totalOcorrencias).toBe(0);
    expect(piramide.niveis.every((nivel) => nivel.razaoParaBase === null)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe('matriz de comunicacao', () => {
  it('trata A-MAJOR grau I como paralisacao imediata com e-mail e WhatsApp', () => {
    const regra = resolverComunicacao('A_MAJOR', 'I');

    expect(regra.acao).toBe('Paralisacao da atividade');
    expect(regra.email).toBe(true);
    expect(regra.whatsapp).toBe('OBRIGATORIO');
    expect(regra.prazoHoras).toBe(0);
    expect(regra.destinatarios).toContain('DIRETORIA');
  });

  it('diferencia condicao insegura grau I de grau II', () => {
    const grauI = resolverComunicacao('CONDICAO_INSEGURA', 'I');
    const grauII = resolverComunicacao('CONDICAO_INSEGURA', 'II');

    expect(grauI.acao).toBe('Isolar area');
    expect(grauI.prazoHoras).toBe(0);
    expect(grauI.whatsapp).toBe('OBRIGATORIO');

    expect(grauII.acao).toBe('Programar manutencao');
    expect(grauII.prazoHoras).toBe(72);
    expect(grauII.whatsapp).toBe('NAO');
  });

  it('marca comportamento inseguro como prazo ate o fim do dia', () => {
    const regra = resolverComunicacao('COMPORTAMENTO_INSEGURO', 'II');

    expect(regra.prazoRotulo).toBe('Mesmo dia');
    expect(regra.ateFimDoDia).toBe(true);
    expect(regra.whatsapp).toBe('OPCIONAL');
  });

  it('cai na regra mais severa do evento quando o grau nao esta na matriz', () => {
    const regra = resolverComunicacao('A_MAJOR', 'III');

    expect(regra.acao).toBe('Paralisacao da atividade');
    expect(regra.grau).toBe('III');
  });

  it('roteia o desvio para o setor responsavel', () => {
    expect(destinatariosDoDesvio('Vazamento de oleo')).toEqual(['MEIO_AMBIENTE', 'MANUTENCAO']);
    expect(destinatariosDoDesvio('vazamento de óleo')).toEqual(['MEIO_AMBIENTE', 'MANUTENCAO']);
    expect(destinatariosDoDesvio('Trabalho em altura sem cinto')).toContain('COORDENADOR');
    expect(destinatariosDoDesvio('desvio inexistente')).toEqual([]);
  });

  it('soma os destinatarios da matriz com os do roteamento, sem duplicar', () => {
    const plano = planoDeComunicacao('CONDICAO_INSEGURA', 'I', 'Vazamento de oleo');

    expect(plano.destinatarios).toContain('MEIO_AMBIENTE');
    expect(plano.destinatarios).toContain('SSMA');
    expect(new Set(plano.destinatarios).size).toBe(plano.destinatarios.length);
  });
});

/* -------------------------------------------------------------------------- */

describe('escalonamento automatico', () => {
  it('mantem no supervisor enquanto esta dentro do prazo', () => {
    const situacao = calcularEscalonamento(10, 24);

    expect(situacao.vencida).toBe(false);
    expect(situacao.nivel).toBe('SUPERVISOR');
    expect(situacao.horasDeAtraso).toBe(-14);
  });

  it('sobe de nivel conforme o atraso', () => {
    expect(calcularEscalonamento(25, 24).nivel).toBe('SUPERVISOR');
    expect(calcularEscalonamento(48, 24).nivel).toBe('COORDENADOR');
    expect(calcularEscalonamento(72, 24).nivel).toBe('GERENTE');
    expect(calcularEscalonamento(96, 24).nivel).toBe('GERENCIA_CORPORATIVA');
    expect(calcularEscalonamento(500, 24).nivel).toBe('GERENCIA_CORPORATIVA');
  });

  it('indica o proximo degrau ate chegar ao topo', () => {
    expect(calcularEscalonamento(48, 24).proximo?.nivel).toBe('GERENTE');
    expect(calcularEscalonamento(500, 24).proximo).toBeNull();
  });

  it('escalona imediatamente quando o prazo e zero', () => {
    const situacao = calcularEscalonamento(1, 0);

    expect(situacao.vencida).toBe(true);
    expect(situacao.horasDeAtraso).toBe(1);
  });
});
