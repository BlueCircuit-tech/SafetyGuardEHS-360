/**
 * Formatacao de datas.
 *
 * Campos de data pura (vigencia de contrato, fundacao) chegam da API como
 * `2024-02-01T00:00:00.000Z`. Passar isso por `new Date().toLocaleDateString()`
 * converte para o fuso local e, em UTC-3, joga a data para o dia anterior.
 * Por isso a formatacao aqui usa direto os componentes da string ISO.
 */

/** `2024-02-01T00:00:00.000Z` ou `2024-02-01` -> `01/02/2024`. */
export function formatarDataIso(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  if (!ano || !mes || !dia) return '—';
  return `${dia}/${mes}/${ano}`;
}

/** Timestamps (criacao, auditoria) — aqui o fuso local e o comportamento correto. */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR');
}
