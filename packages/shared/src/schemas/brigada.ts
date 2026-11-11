import { z } from 'zod';
import { diasAteVencer } from '../indicadores/conformidade.js';
import { dataNaoFutura, dataOpcional, opcional, texto } from './comuns.js';

/**
 * Etapa 24 — Brigada de Incendio e Extintores.
 *
 * O brigadista e um colaborador do cliente com uma funcao na brigada, o
 * treinamento (com validade, para a reciclagem) e, opcionalmente, foto e
 * certificado. O organograma e gerado a partir dos brigadistas ativos. O
 * extintor tem carga, teste hidrostatico e inspecao; a situacao VENCIDO e
 * derivada das datas, para a lista nunca mostrar "OK" num extintor vencido.
 */

/* -------------------------------------------------------------------------- */
/* Brigada                                                                     */
/* -------------------------------------------------------------------------- */

export const FUNCOES_BRIGADA = ['COORDENADOR', 'CHEFE', 'LIDER', 'BRIGADISTA'] as const;
export type FuncaoBrigada = (typeof FUNCOES_BRIGADA)[number];

export const ROTULO_FUNCAO_BRIGADA: Record<FuncaoBrigada, string> = {
  COORDENADOR: 'Coordenador geral',
  CHEFE: 'Chefe de brigada',
  LIDER: 'Lider de brigada',
  BRIGADISTA: 'Brigadista',
};

/** Ordem hierarquica — usada no organograma e na ordenacao das listas. */
export const ORDEM_FUNCAO_BRIGADA: Record<FuncaoBrigada, number> = {
  COORDENADOR: 0,
  CHEFE: 1,
  LIDER: 2,
  BRIGADISTA: 3,
};

export const SITUACOES_TREINAMENTO_BRIGADA = ['VIGENTE', 'A_VENCER', 'VENCIDO', 'SEM_TREINAMENTO'] as const;
export type SituacaoTreinamentoBrigada = (typeof SITUACOES_TREINAMENTO_BRIGADA)[number];

export const ROTULO_SITUACAO_TREINAMENTO_BRIGADA: Record<SituacaoTreinamentoBrigada, string> = {
  VIGENTE: 'Treinamento vigente',
  A_VENCER: 'Reciclagem a vencer',
  VENCIDO: 'Reciclagem vencida',
  SEM_TREINAMENTO: 'Sem treinamento',
};

export const DIAS_ALERTA_TREINAMENTO_BRIGADA = 30;

/** Situacao do treinamento do brigadista pela validade (reciclagem anual, NBR 14276). */
export function situacaoTreinamentoBrigada(
  validade: Date | string | null | undefined,
  hoje: Date = new Date(),
): SituacaoTreinamentoBrigada {
  const dias = diasAteVencer(validade, hoje);
  if (dias === null) return 'SEM_TREINAMENTO';
  if (dias < 0) return 'VENCIDO';
  if (dias <= DIAS_ALERTA_TREINAMENTO_BRIGADA) return 'A_VENCER';
  return 'VIGENTE';
}

const brigadistaBaseSchema = z.object({
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente invalido.'),
  colaboradorId: z.string({ required_error: 'Informe o colaborador.' }).uuid('Colaborador invalido.'),
  areaId: opcional(z.string().uuid('Area invalida.')),
  funcaoBrigada: z
    .enum(FUNCOES_BRIGADA, { errorMap: () => ({ message: 'Funcao na brigada invalida.' }) })
    .default('BRIGADISTA'),
  turno: opcional(z.string().trim().max(40, 'Turno deve ter no maximo 40 caracteres.')),
  dataTreinamento: dataOpcional('Data do treinamento'),
  validadeTreinamento: dataOpcional('Validade do treinamento'),
  ativo: z.boolean().default(true),
  observacoes: opcional(z.string().trim().max(300, 'Observacoes devem ter no maximo 300 caracteres.')),
});

export const brigadistaCreateSchema = brigadistaBaseSchema;
export const brigadistaUpdateSchema = brigadistaBaseSchema.partial();

export type BrigadistaCreateInput = z.input<typeof brigadistaCreateSchema>;
export type BrigadistaCreateData = z.output<typeof brigadistaCreateSchema>;
export type BrigadistaUpdateData = z.output<typeof brigadistaUpdateSchema>;

export const brigadistaFiltroSchema = z.object({
  clienteId: z.string().uuid().optional(),
  areaId: z.string().uuid().optional(),
  inativos: z.preprocess((v) => v === true || v === 'true', z.boolean()).default(false),
});

/* -------------------------------------------------------------------------- */
/* Extintores                                                                  */
/* -------------------------------------------------------------------------- */

export const TIPOS_EXTINTOR = ['AGUA', 'PO_ABC', 'PO_BC', 'CO2', 'ESPUMA', 'CLASSE_K', 'OUTRO'] as const;
export type TipoExtintor = (typeof TIPOS_EXTINTOR)[number];

export const ROTULO_TIPO_EXTINTOR: Record<TipoExtintor, string> = {
  AGUA: 'Agua pressurizada',
  PO_ABC: 'Po quimico ABC',
  PO_BC: 'Po quimico BC',
  CO2: 'Gas carbonico (CO2)',
  ESPUMA: 'Espuma mecanica',
  CLASSE_K: 'Classe K (cozinhas)',
  OUTRO: 'Outro',
};

/** Classes de fogo que cada agente combate (ABNT NBR 12693). */
export const CLASSE_FOGO_EXTINTOR: Record<TipoExtintor, string> = {
  AGUA: 'A',
  PO_ABC: 'A, B e C',
  PO_BC: 'B e C',
  CO2: 'B e C',
  ESPUMA: 'A e B',
  CLASSE_K: 'K (oleos e gorduras)',
  OUTRO: '—',
};

export const SITUACOES_EXTINTOR = ['OK', 'VENCIDO', 'EM_MANUTENCAO', 'OBSTRUIDO'] as const;
export type SituacaoExtintor = (typeof SITUACOES_EXTINTOR)[number];

export const ROTULO_SITUACAO_EXTINTOR: Record<SituacaoExtintor, string> = {
  OK: 'OK',
  VENCIDO: 'Vencido',
  EM_MANUTENCAO: 'Em manutencao',
  OBSTRUIDO: 'Obstruido',
};

export interface ExtintorComValidades {
  situacao: SituacaoExtintor | string;
  validadeCarga?: Date | string | null;
  validadeTesteHidrostatico?: Date | string | null;
}

/**
 * Situacao efetiva do extintor.
 *
 * `EM_MANUTENCAO` e `OBSTRUIDO` sao marcacoes da inspecao e prevalecem. Fora
 * delas, a situacao vem das datas: carga ou teste hidrostatico vencidos =>
 * `VENCIDO`; ambos vigentes => `OK`. Sem nenhuma data cadastrada, vale o que
 * esta gravado.
 */
export function situacaoDoExtintor(extintor: ExtintorComValidades, hoje: Date = new Date()): SituacaoExtintor {
  if (extintor.situacao === 'EM_MANUTENCAO' || extintor.situacao === 'OBSTRUIDO') return extintor.situacao;

  const diasCarga = diasAteVencer(extintor.validadeCarga, hoje);
  const diasTeste = diasAteVencer(extintor.validadeTesteHidrostatico, hoje);

  if ((diasCarga !== null && diasCarga < 0) || (diasTeste !== null && diasTeste < 0)) return 'VENCIDO';
  if (diasCarga === null && diasTeste === null) {
    return extintor.situacao === 'VENCIDO' ? 'VENCIDO' : 'OK';
  }
  return 'OK';
}

const extintorBaseSchema = z.object({
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente invalido.'),
  areaId: opcional(z.string().uuid('Area invalida.')),
  numero: texto(1, 30, 'Numero do extintor'),
  tipo: z.enum(TIPOS_EXTINTOR, { errorMap: () => ({ message: 'Tipo de extintor invalido.' }) }),
  capacidade: opcional(z.string().trim().max(20, 'Capacidade deve ter no maximo 20 caracteres.')),
  localizacao: texto(2, 150, 'Localizacao'),
  validadeCarga: dataOpcional('Validade da carga'),
  validadeTesteHidrostatico: dataOpcional('Validade do teste hidrostatico'),
  ultimaInspecao: dataOpcional('Ultima inspecao'),
  situacao: z.enum(SITUACOES_EXTINTOR, { errorMap: () => ({ message: 'Situacao invalida.' }) }).default('OK'),
  observacoes: opcional(z.string().trim().max(300, 'Observacoes devem ter no maximo 300 caracteres.')),
});

export const extintorCreateSchema = extintorBaseSchema;
export const extintorUpdateSchema = extintorBaseSchema.partial();

export type ExtintorCreateInput = z.input<typeof extintorCreateSchema>;
export type ExtintorCreateData = z.output<typeof extintorCreateSchema>;
export type ExtintorUpdateData = z.output<typeof extintorUpdateSchema>;

export const extintorFiltroSchema = z.object({
  clienteId: z.string().uuid().optional(),
  areaId: z.string().uuid().optional(),
  situacao: z.enum(SITUACOES_EXTINTOR).optional(),
});

/** Inspecao mensal: atualiza a ultima inspecao e a situacao observada. */
export const inspecaoExtintorSchema = z.object({
  data: dataNaoFutura('Data da inspecao'),
  situacao: z.enum(SITUACOES_EXTINTOR, { errorMap: () => ({ message: 'Situacao invalida.' }) }).default('OK'),
  observacoes: opcional(z.string().trim().max(300, 'Observacoes devem ter no maximo 300 caracteres.')),
});

export type InspecaoExtintorData = z.output<typeof inspecaoExtintorSchema>;
