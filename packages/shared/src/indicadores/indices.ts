import { arredondar, classificarDesempenho, limitar0a100, type FaixaDesempenho } from './classificacao.js';

/**
 * Indices compostos: cada pilar recebe uma nota de 0 a 100 e entra no
 * resultado com o seu peso. O resultado tambem e 0 a 100, classificado na
 * mesma escala (Excelente / Muito Bom / Bom / Atencao / Critico).
 */

export interface PesoPilar<Chave extends string = string> {
  pilar: Chave;
  rotulo: string;
  /** Peso em porcentagem (a soma dos pesos deve fechar 100). */
  peso: number;
  /**
   * `true` quando "menos e melhor" (ex.: condicoes inseguras): a nota do pilar
   * entra invertida, como 100 - valor.
   */
  invertido?: boolean;
}

export interface ContribuicaoPilar {
  pilar: string;
  rotulo: string;
  peso: number;
  /** Nota informada (0–100), ja limitada a faixa. */
  nota: number;
  /** Nota efetivamente usada — invertida quando o pilar e "menos e melhor". */
  notaEfetiva: number;
  /** nota efetiva x peso / 100. */
  contribuicao: number;
}

export interface ResultadoIndice {
  valor: number;
  classificacao: FaixaDesempenho;
  pilares: ContribuicaoPilar[];
  /** Soma dos pesos dos pilares que tinham nota informada. */
  pesoConsiderado: number;
  /** Pilares sem nota — ficam de fora e o resultado e reponderado. */
  pilaresSemDados: string[];
}

/**
 * Calcula um indice ponderado.
 *
 * Pilares sem nota (`null`/`undefined`) sao ignorados e os pesos restantes
 * sao renormalizados — um contrato que ainda nao tem auditoria nao deve ser
 * penalizado como se tivesse tirado zero nela.
 */
export function calcularIndicePonderado<Chave extends string>(
  pesos: readonly PesoPilar<Chave>[],
  notas: Partial<Record<Chave, number | null | undefined>>,
): ResultadoIndice {
  const pilares: ContribuicaoPilar[] = [];
  const pilaresSemDados: string[] = [];
  let pesoConsiderado = 0;
  let somaPonderada = 0;

  for (const peso of pesos) {
    const bruta = notas[peso.pilar];

    if (bruta === null || bruta === undefined || Number.isNaN(bruta)) {
      pilaresSemDados.push(peso.pilar);
      continue;
    }

    const nota = limitar0a100(bruta);
    const notaEfetiva = peso.invertido ? 100 - nota : nota;
    const contribuicao = (notaEfetiva * peso.peso) / 100;

    pilares.push({
      pilar: peso.pilar,
      rotulo: peso.rotulo,
      peso: peso.peso,
      nota,
      notaEfetiva: arredondar(notaEfetiva),
      contribuicao: arredondar(contribuicao, 2),
    });

    pesoConsiderado += peso.peso;
    somaPonderada += contribuicao;
  }

  // Renormaliza quando algum pilar ficou sem dado.
  const valor = pesoConsiderado > 0 ? arredondar((somaPonderada / pesoConsiderado) * 100) : 0;

  return {
    valor,
    classificacao: classificarDesempenho(valor),
    pilares,
    pesoConsiderado,
    pilaresSemDados,
  };
}

/* -------------------------------------------------------------------------- */
/* Indice Global SSMA                                                          */
/* -------------------------------------------------------------------------- */

export const PILARES_INDICE_GLOBAL = [
  'SEGURANCA',
  'CULTURA_SEGURANCA',
  'GESTAO_RISCOS',
  'PLANO_ACAO',
  'AUDITORIAS',
  'MEIO_AMBIENTE',
  'TREINAMENTOS',
] as const;
export type PilarIndiceGlobal = (typeof PILARES_INDICE_GLOBAL)[number];

/**
 * Pesos do Indice Global SSMA — versao consolidada do plano diretor.
 *
 * O plano trazia duas tabelas de pesos; adotamos a do "PLANO DIRETOR", que e a
 * versao final e inclui Gestao de Riscos e Auditorias como pilares proprios.
 * Os pesos ficam aqui para serem ajustados num lugar so.
 */
export const PESOS_INDICE_GLOBAL: readonly PesoPilar<PilarIndiceGlobal>[] = [
  { pilar: 'SEGURANCA', rotulo: 'Seguranca', peso: 30 },
  { pilar: 'CULTURA_SEGURANCA', rotulo: 'Cultura de Seguranca (BBS)', peso: 20 },
  { pilar: 'GESTAO_RISCOS', rotulo: 'Gestao de Riscos', peso: 15 },
  { pilar: 'PLANO_ACAO', rotulo: 'Plano de Acao', peso: 15 },
  { pilar: 'AUDITORIAS', rotulo: 'Auditorias', peso: 10 },
  { pilar: 'MEIO_AMBIENTE', rotulo: 'Meio Ambiente', peso: 5 },
  { pilar: 'TREINAMENTOS', rotulo: 'Treinamentos', peso: 5 },
];

/** Indice Global SSMA = Σ (Nota do Pilar × Peso). Escala 0–100. */
export function calcularIndiceGlobalSsma(
  notas: Partial<Record<PilarIndiceGlobal, number | null | undefined>>,
): ResultadoIndice {
  return calcularIndicePonderado(PESOS_INDICE_GLOBAL, notas);
}

/* -------------------------------------------------------------------------- */
/* Indice de Cultura de Seguranca (ICSG)                                       */
/* -------------------------------------------------------------------------- */

export const PILARES_ICSG = [
  'COMPORTAMENTOS_SEGUROS',
  'CONDICOES_INSEGURAS',
  'PLANO_ACAO_CONCLUIDO',
  'INSPECOES_REALIZADAS',
  'TREINAMENTOS',
] as const;
export type PilarIcsg = (typeof PILARES_ICSG)[number];

/**
 * Pesos do Indice de Cultura de Seguranca.
 *
 * `CONDICOES_INSEGURAS` entra invertido: recebe o proprio ICI (% de condicoes
 * inseguras) e o indice usa 100 - ICI, porque menos condicao insegura e melhor.
 */
export const PESOS_ICSG: readonly PesoPilar<PilarIcsg>[] = [
  { pilar: 'COMPORTAMENTOS_SEGUROS', rotulo: 'Comportamentos Seguros (ICS)', peso: 40 },
  { pilar: 'CONDICOES_INSEGURAS', rotulo: 'Condicoes Inseguras (ICI)', peso: 20, invertido: true },
  { pilar: 'PLANO_ACAO_CONCLUIDO', rotulo: 'Plano de Acao Concluido', peso: 20 },
  { pilar: 'INSPECOES_REALIZADAS', rotulo: 'Inspecoes Realizadas', peso: 10 },
  { pilar: 'TREINAMENTOS', rotulo: 'Treinamentos', peso: 10 },
];

/**
 * Indice de Cultura de Seguranca (ICSG) — nota unica de 0 a 100 que permite
 * comparar areas, contratos e empresas.
 */
export function calcularIcsg(notas: Partial<Record<PilarIcsg, number | null | undefined>>): ResultadoIndice {
  return calcularIndicePonderado(PESOS_ICSG, notas);
}

/* -------------------------------------------------------------------------- */
/* Score de Maturidade SSMA                                                    */
/* -------------------------------------------------------------------------- */

export const PILARES_MATURIDADE = [
  'LIDERANCA',
  'CULTURA_SEGURANCA',
  'BBS',
  'PLANO_ACAO',
  'AUDITORIAS',
  'TREINAMENTOS',
] as const;
export type PilarMaturidade = (typeof PILARES_MATURIDADE)[number];

export const PESOS_MATURIDADE: readonly PesoPilar<PilarMaturidade>[] = [
  { pilar: 'LIDERANCA', rotulo: 'Lideranca', peso: 20 },
  { pilar: 'CULTURA_SEGURANCA', rotulo: 'Cultura de Seguranca', peso: 20 },
  { pilar: 'BBS', rotulo: 'BBS', peso: 20 },
  { pilar: 'PLANO_ACAO', rotulo: 'Plano de Acao', peso: 15 },
  { pilar: 'AUDITORIAS', rotulo: 'Auditorias', peso: 15 },
  { pilar: 'TREINAMENTOS', rotulo: 'Treinamentos', peso: 10 },
];

/** Score de Maturidade SSMA por cliente, contrato, empresa ou unidade. */
export function calcularScoreMaturidade(
  notas: Partial<Record<PilarMaturidade, number | null | undefined>>,
): ResultadoIndice {
  return calcularIndicePonderado(PESOS_MATURIDADE, notas);
}

/** Confere se uma tabela de pesos fecha 100% — usado nos testes e na configuracao. */
export function somaDosPesos(pesos: readonly PesoPilar[]): number {
  return pesos.reduce((soma, peso) => soma + peso.peso, 0);
}
