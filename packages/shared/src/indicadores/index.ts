/**
 * Motor de indicadores SSMA.
 *
 * Funcoes puras, sem dependencia de banco ou de framework: as mesmas formulas
 * servem a API (para persistir e notificar) e ao dashboard (para exibir).
 *
 * Cobre indicadores comportamentais (BBS), indices compostos, risco, matriz de
 * comunicacao e conformidade legal (validade de ASO e documentos).
 */

export * from './classificacao.js';
export * from './observacoes.js';
export * from './indices.js';
export * from './risco.js';
export * from './comunicacao.js';
export * from './mensagens.js';
export * from './conformidade.js';
