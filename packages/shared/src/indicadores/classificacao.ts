/**
 * Faixas de classificacao usadas pelos indicadores de 0 a 100
 * (Indice Global SSMA, ICS, Score de Maturidade, nota de pilar).
 */

export const NIVEIS_DESEMPENHO = ['EXCELENTE', 'MUITO_BOM', 'BOM', 'ATENCAO', 'CRITICO'] as const;
export type NivelDesempenho = (typeof NIVEIS_DESEMPENHO)[number];

export interface FaixaDesempenho {
  nivel: NivelDesempenho;
  /** Limite inferior (inclusivo) da faixa. */
  minimo: number;
  rotulo: string;
  /** Cor do semaforo no dashboard. */
  cor: string;
  emoji: string;
}

/**
 * Escala oficial do plano diretor:
 * >= 95 Excelente · 90–94,9 Muito Bom · 80–89,9 Bom · 70–79,9 Atencao · < 70 Critico
 */
export const FAIXAS_DESEMPENHO: readonly FaixaDesempenho[] = [
  { nivel: 'EXCELENTE', minimo: 95, rotulo: 'Excelente', cor: '#16a34a', emoji: '🟢' },
  { nivel: 'MUITO_BOM', minimo: 90, rotulo: 'Muito Bom', cor: '#2563eb', emoji: '🔵' },
  { nivel: 'BOM', minimo: 80, rotulo: 'Bom', cor: '#ca8a04', emoji: '🟡' },
  { nivel: 'ATENCAO', minimo: 70, rotulo: 'Atencao', cor: '#ea580c', emoji: '🟠' },
  { nivel: 'CRITICO', minimo: 0, rotulo: 'Critico', cor: '#dc2626', emoji: '🔴' },
];

/** Classifica um indicador 0–100 na escala de desempenho. */
export function classificarDesempenho(valor: number): FaixaDesempenho {
  if (!Number.isFinite(valor)) return FAIXAS_DESEMPENHO[FAIXAS_DESEMPENHO.length - 1]!;
  return FAIXAS_DESEMPENHO.find((faixa) => valor >= faixa.minimo) ?? FAIXAS_DESEMPENHO[FAIXAS_DESEMPENHO.length - 1]!;
}

/** Arredonda para uma casa decimal — padrao de exibicao dos indicadores. */
export function arredondar(valor: number, casas = 1): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

/** Divisao protegida contra denominador zero (mes sem observacoes, por exemplo). */
export function percentual(parte: number, total: number, casas = 1): number {
  if (total <= 0) return 0;
  return arredondar((parte / total) * 100, casas);
}

/** Limita um valor a faixa 0–100. */
export function limitar0a100(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.min(100, Math.max(0, valor));
}
