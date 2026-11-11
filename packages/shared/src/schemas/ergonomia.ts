import { z } from 'zod';
import { dataNaoFutura, opcional, texto } from './comuns.js';

/**
 * Etapa 24 — Ergonomia (NR-17, redacao de 2022).
 *
 * A avaliacao ergonomica e um checklist respondido no posto de trabalho:
 * cada item e uma afirmacao verificavel (conforme / nao conforme / nao se
 * aplica). A pontuacao e o nivel de risco sao DERIVADOS das respostas —
 * calculados aqui, no shared, para a tela mostrar ao vivo e o servidor gravar
 * o mesmo numero. O cliente nunca envia pontuacao ou nivel.
 */

export const MODULO_ERGONOMIA = 'ergonomia';

/* -------------------------------------------------------------------------- */
/* Tipos de avaliacao                                                         */
/* -------------------------------------------------------------------------- */

export const TIPOS_AVALIACAO_ERGONOMICA = ['CHECKLIST', 'AEP', 'AET'] as const;
export type TipoAvaliacaoErgonomica = (typeof TIPOS_AVALIACAO_ERGONOMICA)[number];

export const ROTULO_TIPO_AVALIACAO_ERGONOMICA: Record<TipoAvaliacaoErgonomica, string> = {
  CHECKLIST: 'Checklist preliminar',
  AEP: 'Avaliacao Ergonomica Preliminar',
  AET: 'Analise Ergonomica do Trabalho',
};

/* -------------------------------------------------------------------------- */
/* Nivel de risco                                                             */
/* -------------------------------------------------------------------------- */

export const NIVEIS_RISCO_ERGONOMICO = ['BAIXO', 'MEDIO', 'ALTO'] as const;
export type NivelRiscoErgonomico = (typeof NIVEIS_RISCO_ERGONOMICO)[number];

export const ROTULO_NIVEL_RISCO_ERGONOMICO: Record<NivelRiscoErgonomico, string> = {
  BAIXO: 'Baixo',
  MEDIO: 'Medio',
  ALTO: 'Alto',
};

/* -------------------------------------------------------------------------- */
/* Checklist padrao (NR-17)                                                   */
/* -------------------------------------------------------------------------- */

export const CATEGORIAS_ERGONOMIA = [
  'Posto de trabalho e mobiliario',
  'Postura e movimento',
  'Levantamento e transporte de cargas',
  'Equipamentos e ferramentas',
  'Ambiente (iluminacao, ruido, temperatura)',
  'Organizacao do trabalho (pausas, ritmo, jornada)',
  'Trabalho com telas e computador',
] as const;
export type CategoriaErgonomia = (typeof CATEGORIAS_ERGONOMIA)[number];

export interface ItemChecklistErgonomiaPadrao {
  categoria: CategoriaErgonomia;
  item: string;
}

/**
 * Itens afirmativos e verificaveis no posto, agrupados por categoria.
 * Base: NR-17 (2022) — itens 17.4 (mobiliario), 17.5 (equipamentos),
 * 17.6 (condicoes ambientais), 17.7 (organizacao do trabalho),
 * 17.8 (teleatendimento/telas) e levantamento de cargas (17.4.3 e anexos).
 */
export const CHECKLIST_ERGONOMIA_PADRAO: readonly ItemChecklistErgonomiaPadrao[] = [
  // Posto de trabalho e mobiliario (17.4)
  { categoria: 'Posto de trabalho e mobiliario', item: 'A altura da superficie de trabalho e ajustavel ou compativel com a tarefa e com a estatura do trabalhador.' },
  { categoria: 'Posto de trabalho e mobiliario', item: 'O assento tem altura ajustavel, encosto com apoio lombar e borda frontal arredondada.' },
  { categoria: 'Posto de trabalho e mobiliario', item: 'Ha espaco suficiente para as pernas e para a movimentacao do corpo no posto.' },
  { categoria: 'Posto de trabalho e mobiliario', item: 'Para trabalho em pe, ha assento para descanso disponivel nas pausas permitidas pelo servico.' },
  // Postura e movimento
  { categoria: 'Postura e movimento', item: 'A tarefa permite alternancia de postura (sentado/em pe) ao longo da jornada.' },
  { categoria: 'Postura e movimento', item: 'Os materiais e comandos mais usados estao ao alcance sem torcao do tronco ou elevacao dos ombros.' },
  { categoria: 'Postura e movimento', item: 'A tarefa nao exige flexao, extensao ou torcao prolongada do pescoco, tronco ou punhos.' },
  { categoria: 'Postura e movimento', item: 'Nao ha movimentos repetitivos de alta frequencia sem variacao de tarefa ou pausa.' },
  // Levantamento e transporte de cargas (17.4.3)
  { categoria: 'Levantamento e transporte de cargas', item: 'As cargas manuseadas tem peso compativel com a capacidade do trabalhador, sem comprometer a saude ou a seguranca.' },
  { categoria: 'Levantamento e transporte de cargas', item: 'Ha meios tecnicos (carrinhos, talhas, paleteiras) para o transporte de cargas pesadas ou frequentes.' },
  { categoria: 'Levantamento e transporte de cargas', item: 'As cargas tem pegas adequadas e sao levantadas entre a altura dos joelhos e dos ombros.' },
  { categoria: 'Levantamento e transporte de cargas', item: 'O trabalhador foi orientado sobre tecnica segura de levantamento e transporte manual.' },
  // Equipamentos e ferramentas (17.5)
  { categoria: 'Equipamentos e ferramentas', item: 'As ferramentas manuais tem cabo compativel com a mao e nao exigem forca excessiva ou desvio do punho.' },
  { categoria: 'Equipamentos e ferramentas', item: 'Os equipamentos tem comandos e mostradores posicionados e legiveis sem postura forcada.' },
  { categoria: 'Equipamentos e ferramentas', item: 'As ferramentas e equipamentos vibratorios tem controle de vibracao ou limitacao do tempo de uso.' },
  // Ambiente (17.6)
  { categoria: 'Ambiente (iluminacao, ruido, temperatura)', item: 'A iluminacao e uniforme e adequada a tarefa, sem ofuscamento, reflexos ou sombras incomodas.' },
  { categoria: 'Ambiente (iluminacao, ruido, temperatura)', item: 'O nivel de ruido nao prejudica a atencao e a comunicacao exigidas pela tarefa.' },
  { categoria: 'Ambiente (iluminacao, ruido, temperatura)', item: 'A temperatura, a umidade e a velocidade do ar sao compativeis com o conforto na atividade.' },
  // Organizacao do trabalho (17.7)
  { categoria: 'Organizacao do trabalho (pausas, ritmo, jornada)', item: 'Ha pausas regulares durante a jornada, incluidas no tempo de trabalho, compativeis com a exigencia da tarefa.' },
  { categoria: 'Organizacao do trabalho (pausas, ritmo, jornada)', item: 'O ritmo de trabalho e as metas nao impoem exigencia de tempo incompativel com a saude do trabalhador.' },
  { categoria: 'Organizacao do trabalho (pausas, ritmo, jornada)', item: 'A jornada e os turnos sao organizados sem acumulo excessivo de horas extras ou carga de trabalho.' },
  // Trabalho com telas e computador (17.8)
  { categoria: 'Trabalho com telas e computador', item: 'O monitor esta a distancia e altura que permitem olhar a tela sem flexionar o pescoco e com ajuste de brilho e contraste.' },
  { categoria: 'Trabalho com telas e computador', item: 'Teclado e mouse estao na mesma altura, com apoio para os antebracos e punhos em posicao neutra.' },
  { categoria: 'Trabalho com telas e computador', item: 'Ha suporte para documentos quando a tarefa exige consulta frequente a papeis durante a digitacao.' },
];

/* -------------------------------------------------------------------------- */
/* Schemas                                                                    */
/* -------------------------------------------------------------------------- */

/** Resposta de um item: true conforme, false nao conforme, null nao se aplica. */
export const itemErgonomiaSchema = z.object({
  categoria: texto(1, 80, 'Categoria'),
  item: texto(1, 300, 'Item'),
  conforme: z.boolean({ invalid_type_error: 'Resposta invalida.' }).nullable(),
  observacao: opcional(z.string().trim().max(500, 'Observacao deve ter no maximo 500 caracteres.')).optional(),
});
export type ItemErgonomia = z.output<typeof itemErgonomiaSchema>;
export type ItemErgonomiaInput = z.input<typeof itemErgonomiaSchema>;

const avaliacaoErgonomicaBase = z.object({
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente invalido.'),
  areaId: opcional(z.string().uuid('Area invalida.')).optional(),
  funcao: opcional(z.string().trim().max(80, 'Funcao deve ter no maximo 80 caracteres.')).optional(),
  data: dataNaoFutura('Data da avaliacao'),
  avaliador: texto(1, 120, 'Avaliador'),
  tipo: z.enum(TIPOS_AVALIACAO_ERGONOMICA, { errorMap: () => ({ message: 'Tipo de avaliacao invalido.' }) }).default('CHECKLIST'),
  itens: z.array(itemErgonomiaSchema).min(1, 'Responda ao menos um item do checklist.').max(120, 'O checklist aceita no maximo 120 itens.'),
  conclusao: opcional(z.string().trim().max(4000, 'Conclusao deve ter no maximo 4000 caracteres.')).optional(),
  recomendacoes: opcional(z.string().trim().max(4000, 'Recomendacoes devem ter no maximo 4000 caracteres.')).optional(),
});

export const avaliacaoErgonomicaCreateSchema = avaliacaoErgonomicaBase;
export const avaliacaoErgonomicaUpdateSchema = avaliacaoErgonomicaBase.partial();
export type AvaliacaoErgonomicaCreate = z.output<typeof avaliacaoErgonomicaCreateSchema>;
export type AvaliacaoErgonomicaCreateInput = z.input<typeof avaliacaoErgonomicaCreateSchema>;
export type AvaliacaoErgonomicaUpdate = z.output<typeof avaliacaoErgonomicaUpdateSchema>;

export const avaliacaoErgonomicaFiltroSchema = z.object({
  clienteId: z.string().uuid().optional(),
  areaId: z.string().uuid().optional(),
  nivelRisco: z.enum(NIVEIS_RISCO_ERGONOMICO).optional(),
  tipo: z.enum(TIPOS_AVALIACAO_ERGONOMICA).optional(),
  busca: z.string().trim().max(120).optional(),
});
export type AvaliacaoErgonomicaFiltro = z.output<typeof avaliacaoErgonomicaFiltroSchema>;

/* -------------------------------------------------------------------------- */
/* Funcoes puras                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Percentual de itens conformes entre os aplicaveis (conforme !== null),
 * arredondado. Null quando nenhum item se aplica — nao ha o que pontuar.
 */
export function pontuacaoErgonomica(itens: ReadonlyArray<Pick<ItemErgonomia, 'conforme'>>): number | null {
  const aplicaveis = itens.filter((i) => i.conforme !== null);
  if (aplicaveis.length === 0) return null;
  const conformes = aplicaveis.filter((i) => i.conforme === true).length;
  return Math.round((conformes / aplicaveis.length) * 100);
}

/** >= 80 BAIXO, 50-79 MEDIO, < 50 ALTO. Null quando nao ha pontuacao. */
export function nivelRiscoErgonomico(pontuacao: number | null | undefined): NivelRiscoErgonomico | null {
  if (pontuacao === null || pontuacao === undefined || Number.isNaN(pontuacao)) return null;
  if (pontuacao >= 80) return 'BAIXO';
  if (pontuacao >= 50) return 'MEDIO';
  return 'ALTO';
}

/** Agrupa os itens por categoria preservando a ordem em que aparecem. */
export function agruparItensErgonomia<T extends { categoria: string }>(itens: readonly T[]): Array<{ categoria: string; itens: T[] }> {
  const grupos: Array<{ categoria: string; itens: T[] }> = [];
  for (const item of itens) {
    const grupo = grupos.find((g) => g.categoria === item.categoria);
    if (grupo) grupo.itens.push(item);
    else grupos.push({ categoria: item.categoria, itens: [item] });
  }
  return grupos;
}
