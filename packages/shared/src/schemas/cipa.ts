import { z } from 'zod';
import { dataObrigatoria, dataOpcional, opcional, texto } from './comuns.js';

/**
 * Etapa 24 — CIPA (NR-5).
 *
 * Uma CIPA e um MANDATO: tem gestao ("2026/2027"), inicio e fim, situacao,
 * cronograma do processo eleitoral, membros (eleitos pelos empregados e
 * designados pelo empregador) e os documentos do processo (edital, ficha de
 * inscricao, lista de presenca, cedula, atas, certificados). Cronograma e
 * membros vivem em Json no banco: sao listas curtas, editadas em bloco pela
 * tela, sem consulta cruzada que justificasse tabela propria.
 */

/* -------------------------------------------------------------------------- */
/* Constantes de dominio                                                      */
/* -------------------------------------------------------------------------- */

export const SITUACOES_CIPA = ['PLANEJAMENTO', 'PROCESSO_ELEITORAL', 'EM_MANDATO', 'ENCERRADA'] as const;
export type SituacaoCipa = (typeof SITUACOES_CIPA)[number];

export const ROTULO_SITUACAO_CIPA: Record<SituacaoCipa, string> = {
  PLANEJAMENTO: 'Planejamento',
  PROCESSO_ELEITORAL: 'Processo eleitoral',
  EM_MANDATO: 'Em mandato',
  ENCERRADA: 'Encerrada',
};

export const TIPOS_DOCUMENTO_CIPA = [
  'EDITAL',
  'FICHA_INSCRICAO',
  'LISTA_PRESENCA_VOTACAO',
  'CEDULA_VOTACAO',
  'ATA_ELEICAO',
  'ATA_POSSE',
  'ATA_REUNIAO',
  'CERTIFICADO_TREINAMENTO',
  'CALENDARIO',
  'OUTRO',
] as const;
export type TipoDocumentoCipa = (typeof TIPOS_DOCUMENTO_CIPA)[number];

export const ROTULO_TIPO_DOCUMENTO_CIPA: Record<TipoDocumentoCipa, string> = {
  EDITAL: 'Edital de convocacao',
  FICHA_INSCRICAO: 'Ficha de inscricao',
  LISTA_PRESENCA_VOTACAO: 'Lista de presenca da votacao',
  CEDULA_VOTACAO: 'Cedula de votacao',
  ATA_ELEICAO: 'Ata de eleicao / apuracao',
  ATA_POSSE: 'Ata de posse',
  ATA_REUNIAO: 'Ata de reuniao',
  CERTIFICADO_TREINAMENTO: 'Certificado de treinamento',
  CALENDARIO: 'Calendario anual de reunioes',
  OUTRO: 'Outro',
};

export const REPRESENTACOES = ['EMPREGADOR', 'EMPREGADOS'] as const;
export type RepresentacaoCipa = (typeof REPRESENTACOES)[number];

export const ROTULO_REPRESENTACAO_CIPA: Record<RepresentacaoCipa, string> = {
  EMPREGADOR: 'Empregador (designado)',
  EMPREGADOS: 'Empregados (eleito)',
};

export const TIPOS_MEMBRO = ['TITULAR', 'SUPLENTE'] as const;
export type TipoMembroCipa = (typeof TIPOS_MEMBRO)[number];

export const ROTULO_TIPO_MEMBRO_CIPA: Record<TipoMembroCipa, string> = {
  TITULAR: 'Titular',
  SUPLENTE: 'Suplente',
};

export const CARGOS_CIPA = ['PRESIDENTE', 'VICE_PRESIDENTE', 'SECRETARIO'] as const;
export type CargoCipa = (typeof CARGOS_CIPA)[number];

export const ROTULO_CARGO_CIPA: Record<CargoCipa, string> = {
  PRESIDENTE: 'Presidente',
  VICE_PRESIDENTE: 'Vice-presidente',
  SECRETARIO: 'Secretario(a)',
};

/** Carga horaria minima do treinamento de cipeiro (NR-5, item 5.7). */
export const CARGA_HORARIA_TREINAMENTO_CIPA = 20;

/* -------------------------------------------------------------------------- */
/* Schemas                                                                    */
/* -------------------------------------------------------------------------- */

const DATA_ISO_CURTA = /^\d{4}-\d{2}-\d{2}$/;

/** Membro da comissao (eleito ou designado). */
export const cipaMembroSchema = z.object({
  nome: texto(3, 120, 'Nome'),
  funcao: opcional(z.string().trim().max(80, 'Funcao deve ter no maximo 80 caracteres.')),
  setor: opcional(z.string().trim().max(80, 'Setor deve ter no maximo 80 caracteres.')),
  representacao: z.enum(REPRESENTACOES, { errorMap: () => ({ message: 'Representacao invalida.' }) }),
  tipo: z.enum(TIPOS_MEMBRO, { errorMap: () => ({ message: 'Tipo de membro invalido.' }) }),
  cargo: opcional(z.enum(CARGOS_CIPA, { errorMap: () => ({ message: 'Cargo invalido.' }) })),
  /** Votos recebidos na eleicao — so faz sentido para representantes dos empregados. */
  votos: opcional(z.coerce.number().int('Votos deve ser inteiro.').min(0, 'Votos nao pode ser negativo.')),
});
export type CipaMembro = z.output<typeof cipaMembroSchema>;

/** Etapa do cronograma do processo eleitoral. A data e `YYYY-MM-DD` (dia puro). */
export const cipaEtapaSchema = z.object({
  etapa: texto(3, 150, 'Etapa'),
  data: z
    .string({ required_error: 'Data da etapa e obrigatoria.' })
    .regex(DATA_ISO_CURTA, 'Data da etapa deve estar no formato AAAA-MM-DD.'),
  concluida: z.boolean().default(false),
});
export type CipaEtapa = z.output<typeof cipaEtapaSchema>;

const cipaBaseSchema = z.object({
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente invalido.'),
  /** Ex.: "2026/2027". */
  gestao: texto(4, 20, 'Gestao'),
  dataInicioMandato: dataObrigatoria('Data de inicio do mandato'),
  dataFimMandato: dataObrigatoria('Data de fim do mandato'),
  situacao: z.enum(SITUACOES_CIPA, { errorMap: () => ({ message: 'Situacao invalida.' }) }).default('PLANEJAMENTO'),
  cronograma: z.array(cipaEtapaSchema).max(40, 'Cronograma com no maximo 40 etapas.').optional(),
  membros: z.array(cipaMembroSchema).max(80, 'No maximo 80 membros.').optional(),
  observacoes: opcional(z.string().trim().max(5000, 'Observacoes devem ter no maximo 5000 caracteres.')),
});

function mandatoCoerente(dados: { dataInicioMandato?: Date; dataFimMandato?: Date }): boolean {
  if (!dados.dataInicioMandato || !dados.dataFimMandato) return true;
  return dados.dataFimMandato.getTime() > dados.dataInicioMandato.getTime();
}

const ERRO_MANDATO = { message: 'O fim do mandato deve ser posterior ao inicio.', path: ['dataFimMandato'] };

export const cipaCreateSchema = cipaBaseSchema.refine(mandatoCoerente, ERRO_MANDATO);
/** Atualizacao parcial; quando ambas as datas vierem, precisam ser coerentes. */
export const cipaUpdateSchema = cipaBaseSchema.partial().refine(mandatoCoerente, ERRO_MANDATO);

export type CipaCreateInput = z.input<typeof cipaCreateSchema>;
export type CipaCreate = z.output<typeof cipaCreateSchema>;
export type CipaUpdate = z.output<typeof cipaUpdateSchema>;

/** Metadados do anexo — o arquivo em si vai por multipart no campo `arquivo`. */
export const cipaDocumentoCreateSchema = z.object({
  tipo: z.enum(TIPOS_DOCUMENTO_CIPA, { errorMap: () => ({ message: 'Tipo de documento invalido.' }) }),
  titulo: texto(3, 150, 'Titulo'),
  data: opcional(dataOpcional('Data do documento')),
  observacoes: opcional(z.string().trim().max(300, 'Observacoes devem ter no maximo 300 caracteres.')),
});
export type CipaDocumentoCreate = z.output<typeof cipaDocumentoCreateSchema>;

export const cipaFiltroSchema = z.object({
  clienteId: z.string().uuid().optional(),
  situacao: z.enum(SITUACOES_CIPA).optional(),
});
export type CipaFiltro = z.output<typeof cipaFiltroSchema>;

/* -------------------------------------------------------------------------- */
/* Funcoes puras                                                              */
/* -------------------------------------------------------------------------- */

function dataIsoCurta(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** Soma dias em UTC — datas puras nao podem sofrer com horario de verao. */
function somarDiasUtc(data: Date, dias: number): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate() + dias));
}

/**
 * Cronograma tipico do processo eleitoral da CIPA, contado PARA TRAS a partir
 * da posse (= inicio do novo mandato).
 *
 * Prazos de referencia da NR-5 (Portaria MTP 422/2021), item 5.5:
 * - 5.5.1   convocacao do processo eleitoral pelo empregador com antecedencia
 *           minima de 60 dias do termino do mandato em curso (comunicacao ao
 *           sindicato);
 * - 5.5.1.1 constituicao da comissao eleitoral ate 55 dias antes do termino;
 * - 5.5.2 a publicacao e divulgacao do edital com antecedencia minima de 45
 *           dias do termino do mandato;
 * - 5.5.2 c periodo minimo de 15 dias para as inscricoes;
 * - 5.5.2 b inscricao e eleicao concluidas ate 30 dias antes do termino;
 * - 5.5.2 f apuracao dos votos em horario normal de trabalho;
 * - 5.7     treinamento dos membros antes da posse (primeiro mandato);
 * - 5.5.6   posse no primeiro dia util apos o termino do mandato anterior.
 *
 * O "termino do mandato anterior" e tomado como a vespera da posse. As datas
 * sao sugestao: a comissao eleitoral ajusta ao calendario real da empresa.
 */
export function cronogramaPadraoCipa(dataInicioMandato: Date): CipaEtapa[] {
  const fimAnterior = somarDiasUtc(dataInicioMandato, -1);
  const etapa = (nome: string, diasAntesDoFim: number): CipaEtapa => ({
    etapa: nome,
    data: dataIsoCurta(somarDiasUtc(fimAnterior, -diasAntesDoFim)),
    concluida: false,
  });

  return [
    etapa('Comunicacao do inicio do processo eleitoral ao sindicato (NR-5, 5.5.1)', 60),
    etapa('Constituicao da comissao eleitoral (NR-5, 5.5.1.1)', 55),
    etapa('Publicacao e divulgacao do edital de convocacao (NR-5, 5.5.2 a)', 45),
    etapa('Inicio das inscricoes de candidatos', 45),
    etapa('Encerramento das inscricoes (minimo 15 dias)', 31),
    etapa('Divulgacao da lista de candidatos inscritos', 31),
    etapa('Eleicao — votacao em dia normal de trabalho (NR-5, 5.5.2 b, e)', 30),
    etapa('Apuracao dos votos e lavratura da ata de eleicao (NR-5, 5.5.2 f)', 30),
    etapa('Designacao dos representantes do empregador', 20),
    etapa('Treinamento dos membros eleitos e designados — 20 h (NR-5, 5.7)', 15),
    {
      etapa: 'Posse dos membros e lavratura da ata de posse (NR-5, 5.5.6)',
      data: dataIsoCurta(somarDiasUtc(dataInicioMandato, 0)),
      concluida: false,
    },
  ];
}

export interface DimensionamentoCipa {
  efetivos: number;
  suplentes: number;
}

/**
 * Faixas de empregados do Quadro I da NR-5. A ultima faixa (acima de 10.000)
 * acrescenta membros por grupo de 2.500 ou fracao.
 */
const FAIXAS_QUADRO_I: ReadonlyArray<readonly [number, number]> = [
  [20, 29],
  [30, 50],
  [51, 80],
  [81, 100],
  [101, 120],
  [121, 140],
  [141, 300],
  [301, 500],
  [501, 1000],
  [1001, 2500],
  [2501, 5000],
  [5001, 10000],
];

/**
 * Tabela SIMPLIFICADA por grau de risco (NR-4). O Quadro I oficial e por
 * grupo de CNAE (C-1 a C-35), nao por grau de risco; aqui cada grau recebe
 * uma linha representativa de um grupo tipico daquele grau. `null` = a faixa
 * dispensa a constituicao da CIPA (a empresa designa um representante,
 * NR-5 item 5.6.4).
 */
const TABELA_SIMPLIFICADA: Record<1 | 2 | 3 | 4, ReadonlyArray<DimensionamentoCipa | null>> = {
  1: [null, null, { efetivos: 1, suplentes: 1 }, { efetivos: 1, suplentes: 1 }, { efetivos: 2, suplentes: 2 }, { efetivos: 2, suplentes: 2 }, { efetivos: 3, suplentes: 3 }, { efetivos: 4, suplentes: 3 }, { efetivos: 6, suplentes: 4 }, { efetivos: 9, suplentes: 7 }, { efetivos: 12, suplentes: 9 }, { efetivos: 15, suplentes: 12 }],
  2: [null, { efetivos: 1, suplentes: 1 }, { efetivos: 2, suplentes: 2 }, { efetivos: 2, suplentes: 2 }, { efetivos: 3, suplentes: 3 }, { efetivos: 3, suplentes: 3 }, { efetivos: 4, suplentes: 3 }, { efetivos: 6, suplentes: 4 }, { efetivos: 8, suplentes: 6 }, { efetivos: 10, suplentes: 8 }, { efetivos: 12, suplentes: 9 }, { efetivos: 15, suplentes: 12 }],
  3: [{ efetivos: 1, suplentes: 1 }, { efetivos: 1, suplentes: 1 }, { efetivos: 3, suplentes: 3 }, { efetivos: 3, suplentes: 3 }, { efetivos: 4, suplentes: 3 }, { efetivos: 4, suplentes: 3 }, { efetivos: 6, suplentes: 4 }, { efetivos: 8, suplentes: 6 }, { efetivos: 10, suplentes: 7 }, { efetivos: 12, suplentes: 9 }, { efetivos: 15, suplentes: 12 }, { efetivos: 18, suplentes: 15 }],
  4: [{ efetivos: 1, suplentes: 1 }, { efetivos: 2, suplentes: 2 }, { efetivos: 3, suplentes: 3 }, { efetivos: 4, suplentes: 3 }, { efetivos: 4, suplentes: 3 }, { efetivos: 5, suplentes: 4 }, { efetivos: 6, suplentes: 4 }, { efetivos: 9, suplentes: 7 }, { efetivos: 12, suplentes: 9 }, { efetivos: 15, suplentes: 12 }, { efetivos: 18, suplentes: 15 }, { efetivos: 21, suplentes: 18 }],
};

/**
 * Dimensionamento SUGERIDO da CIPA (representantes do empregador e dos
 * empregados tem o mesmo numero, NR-5 item 5.6.2).
 *
 * REFERENCIA, nao regra: a tabela e uma simplificacao por grau de risco. O
 * Quadro I da NR-5 (por grupo de CNAE) prevalece sempre — confira antes de
 * publicar o edital. Devolve `null` quando a faixa dispensa a CIPA (menos de
 * 20 empregados ou faixa isenta para o grau).
 */
export function dimensionamentoCipaSugerido(grauRisco: 1 | 2 | 3 | 4, quantidadeFuncionarios: number): DimensionamentoCipa | null {
  if (!Number.isFinite(quantidadeFuncionarios) || quantidadeFuncionarios < 20) return null;
  const linha = TABELA_SIMPLIFICADA[grauRisco];
  if (!linha) return null;

  const indice = FAIXAS_QUADRO_I.findIndex(([minimo, maximo]) => quantidadeFuncionarios >= minimo && quantidadeFuncionarios <= maximo);
  if (indice >= 0) return linha[indice] ?? null;

  // Acima de 10.000: ultima faixa + 2 efetivos e 2 suplentes por grupo de 2.500 ou fracao.
  const ultima = linha[linha.length - 1];
  if (!ultima) return null;
  const gruposExtras = Math.ceil((quantidadeFuncionarios - 10000) / 2500);
  return { efetivos: ultima.efetivos + 2 * gruposExtras, suplentes: ultima.suplentes + 2 * gruposExtras };
}

/** Dias ate o fim do mandato (negativo quando ja venceu). */
export function diasParaFimDoMandato(dataFimMandato: Date, hoje = new Date()): number {
  const fim = Date.UTC(dataFimMandato.getUTCFullYear(), dataFimMandato.getUTCMonth(), dataFimMandato.getUTCDate());
  const agora = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.round((fim - agora) / 86_400_000);
}
