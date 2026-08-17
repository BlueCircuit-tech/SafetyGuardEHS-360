import { z } from 'zod';

/**
 * Blocos reutilizados pelos schemas de cadastro (empresa de consultoria,
 * clientes, futuras unidades). Mantem as mensagens de erro em pt-BR
 * consistentes em toda a plataforma.
 */

/** Torna o campo opcional tratando string vazia (ou so espacos) como null. */
export function opcional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (valor) => (typeof valor === 'string' && valor.trim() === '' ? null : valor ?? null),
    schema.nullable(),
  );
}

/** Campo de texto obrigatorio com limites e mensagens padronizadas. */
export function texto(min: number, max: number, campo: string) {
  return z
    .string({ required_error: `${campo} e obrigatorio.`, invalid_type_error: `${campo} deve ser um texto.` })
    .trim()
    .min(min, min <= 1 ? `${campo} e obrigatorio.` : `${campo} deve ter ao menos ${min} caracteres.`)
    .max(max, `${campo} deve ter no maximo ${max} caracteres.`);
}

export const HEX_COR = /^#([0-9a-fA-F]{6})$/;

export const TIMEZONE_PADRAO = 'America/Sao_Paulo';
export const COR_PRIMARIA_PADRAO = '#059669';
export const COR_SECUNDARIA_PADRAO = '#0e1a2b';

/**
 * Mensagens em pt-BR para campos de data. Sem isso o Zod devolve o texto
 * generico "Invalid date" quando a coercao falha.
 */
function mapaDeErroDeData(campo: string): z.ZodErrorMap {
  return (issue, ctx) => {
    if (issue.code === z.ZodIssueCode.invalid_date) return { message: `${campo} invalida.` };
    if (issue.code === z.ZodIssueCode.invalid_type) return { message: `${campo} e obrigatoria.` };
    return { message: ctx.defaultError };
  };
}

/**
 * Converte para Date preservando a diferenca entre "nao informado"
 * (`undefined`, que vira erro de obrigatoriedade) e "informado errado"
 * (Invalid Date, que vira erro de formato). `z.coerce.date()` nao faz essa
 * distincao: `new Date(undefined)` tambem resulta em Invalid Date.
 */
function paraData(valor: unknown): unknown {
  if (valor === null || valor === undefined) return undefined;
  if (valor instanceof Date) return valor;
  if (typeof valor === 'string') return valor.trim() === '' ? undefined : new Date(valor);
  if (typeof valor === 'number') return new Date(valor);
  return valor;
}

/** Data obrigatoria: string vazia vira "campo obrigatorio", nao "Invalid date". */
export function dataObrigatoria(campo: string) {
  return z.preprocess(paraData, z.date({ errorMap: mapaDeErroDeData(campo) }));
}

/** Data opcional com mensagem em pt-BR quando o valor informado e invalido. */
export function dataOpcional(campo: string) {
  return z.preprocess(
    (valor) => (paraData(valor) ?? null),
    z.date({ errorMap: mapaDeErroDeData(campo) }).nullable(),
  );
}

/** Data que nao pode estar no futuro (fundacao, emissao, ...). */
export function dataNaoFutura(campo: string) {
  return z.preprocess(
    paraData,
    z.date({ errorMap: mapaDeErroDeData(campo) }).refine(
      (data) => data.getTime() <= Date.now(),
      `${campo} nao pode estar no futuro.`,
    ),
  );
}
