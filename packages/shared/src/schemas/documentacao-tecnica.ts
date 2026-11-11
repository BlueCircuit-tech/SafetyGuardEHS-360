import { z } from 'zod';
import { dataObrigatoria, dataOpcional, opcional, texto } from './comuns.js';

/**
 * Etapa 23 — Documentacao Tecnica: Ordem de Servico, APR e checklist de pre-uso.
 *
 * Os tres compartilham um principio: o documento e uma FOTOGRAFIA do momento.
 * A OS guarda os riscos que o trabalhador foi informado naquele dia; a APR,
 * as etapas aprovadas; a execucao do checklist, os itens exatamente como
 * foram respondidos. Se a fonte mudar depois (inventario, modelo), o
 * documento ja emitido nao muda junto — gera-se uma versao nova.
 */

/* -------------------------------------------------------------------------- */
/* Ordem de Servico (NR-1, 1.4.4)                                             */
/* -------------------------------------------------------------------------- */

export const SITUACOES_OS = ['EMITIDA', 'ASSINADA', 'SUBSTITUIDA'] as const;
export type SituacaoOs = (typeof SITUACOES_OS)[number];

export const ROTULO_SITUACAO_OS: Record<SituacaoOs, string> = {
  EMITIDA: 'Emitida — aguardando ciencia',
  ASSINADA: 'Assinada pelo trabalhador',
  SUBSTITUIDA: 'Substituida por versao mais nova',
};

/** Gerar uma OS: o servidor monta o conteudo a partir dos cadastros. */
export const osGerarSchema = z.object({
  colaboradorId: z.string({ required_error: 'Informe o colaborador.' }).uuid('Colaborador invalido.'),
  /** Texto complementar do tecnico de seguranca (procedimentos, restricoes). */
  medidasPreventivas: opcional(z.string().trim().max(2000)),
});
export type OsGerarInput = z.input<typeof osGerarSchema>;

/** Edicao da OS emitida (antes da ciencia): texto complementar e observacoes. */
export const osUpdateSchema = z.object({
  medidasPreventivas: opcional(z.string().trim().max(2000)),
});

export const osFiltroSchema = z.object({
  clienteId: z.string().uuid().optional(),
  colaboradorId: z.string().uuid().optional(),
  situacao: z.enum(SITUACOES_OS).optional(),
  busca: z.string().trim().max(120).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(25),
});
export type OsFiltro = z.output<typeof osFiltroSchema>;

/** Item do snapshot de riscos gravado na OS. */
export interface OsRisco {
  tipo: string;
  perigo: string;
  danosPossiveis: string;
  grauRisco: string;
  iir: number;
  controlesExistentes: string | null;
  medidasPropostas: string | null;
}

export interface OsEpi {
  nome: string;
  ca: string;
  dataEntrega: string;
}

export interface OsTreinamento {
  nome: string;
  norma: string | null;
  situacao: 'EM_DIA' | 'A_VENCER' | 'VENCIDO' | 'NAO_REALIZADO';
}

/* -------------------------------------------------------------------------- */
/* APR — Analise Preliminar de Risco                                          */
/* -------------------------------------------------------------------------- */

export const SITUACOES_APR = ['RASCUNHO', 'APROVADA', 'ENCERRADA'] as const;
export type SituacaoApr = (typeof SITUACOES_APR)[number];

export const ROTULO_SITUACAO_APR: Record<SituacaoApr, string> = {
  RASCUNHO: 'Rascunho',
  APROVADA: 'Aprovada',
  ENCERRADA: 'Encerrada',
};

/** Modelo do documento: APR (padrao) ou AST — Analise de Seguranca da Tarefa (COMAU). */
export const MODELOS_APR = ['APR', 'AST'] as const;
export type ModeloApr = (typeof MODELOS_APR)[number];

export const ROTULO_MODELO_APR: Record<ModeloApr, string> = {
  APR: 'APR — Analise Preliminar de Risco',
  AST: 'AST — Analise de Seguranca da Tarefa (COMAU)',
};

/** Tipos de servico especiais que exigem permissao/controle proprio. */
export const TIPOS_SERVICO_APR = [
  'ESPACO_CONFINADO',
  'TRABALHO_A_QUENTE',
  'TRABALHO_EM_ALTURA',
  'ICAMENTO_DE_CARGA',
  'ESCAVACAO',
  'REQUER_BLOQUEIO',
] as const;
export type TipoServicoApr = (typeof TIPOS_SERVICO_APR)[number];

export const ROTULO_TIPO_SERVICO_APR: Record<TipoServicoApr, string> = {
  ESPACO_CONFINADO: 'Ambiente confinado (NR-33)',
  TRABALHO_A_QUENTE: 'Trabalho a quente (NR-34)',
  TRABALHO_EM_ALTURA: 'Trabalho em altura (NR-35)',
  ICAMENTO_DE_CARGA: 'Icamento de carga (NR-11)',
  ESCAVACAO: 'Escavacao (NR-18)',
  REQUER_BLOQUEIO: 'Requer bloqueio e etiquetagem (LOTO)',
};

export const aprEtapaSchema = z.object({
  etapa: texto(3, 200, 'Etapa'),
  perigos: texto(3, 500, 'Perigos'),
  riscos: texto(3, 500, 'Riscos'),
  medidasControle: texto(3, 800, 'Medidas de controle'),
  epis: opcional(z.string().trim().max(300)),
});
export type AprEtapa = z.output<typeof aprEtapaSchema>;

const aprBaseSchema = z.object({
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente invalido.'),
  areaId: opcional(z.string().uuid('Area invalida.')),
  terceiroId: opcional(z.string().uuid('Terceiro invalido.')),
  modelo: z.enum(MODELOS_APR).default('APR'),
  atividade: texto(3, 200, 'Atividade'),
  local: opcional(z.string().trim().max(200)),
  dataInicio: dataObrigatoria('Data de inicio'),
  dataFim: opcional(dataOpcional('Data de fim')),
  responsavel: texto(3, 120, 'Responsavel'),
  tiposServico: z.array(z.enum(TIPOS_SERVICO_APR)).max(6).default([]),
  etapas: z.array(aprEtapaSchema).min(1, 'Decomponha a atividade em ao menos uma etapa.').max(40),
});

export const aprCreateSchema = aprBaseSchema;
/** Aprovada ou encerrada, a APR nao se edita: nova versao. */
export const aprUpdateSchema = aprBaseSchema.partial();

export const aprAprovarSchema = z.object({
  aprovadaPor: texto(3, 120, 'Aprovador'),
});

export const aprFiltroSchema = z.object({
  clienteId: z.string().uuid().optional(),
  areaId: z.string().uuid().optional(),
  situacao: z.enum(SITUACOES_APR).optional(),
  modelo: z.enum(MODELOS_APR).optional(),
  busca: z.string().trim().max(120).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(25),
});
export type AprFiltro = z.output<typeof aprFiltroSchema>;
export type AprCreateInput = z.input<typeof aprCreateSchema>;

/* -------------------------------------------------------------------------- */
/* Checklist de pre-uso                                                       */
/* -------------------------------------------------------------------------- */

export const RESULTADOS_CHECKLIST = ['APTO', 'NAO_APTO'] as const;
export type ResultadoChecklist = (typeof RESULTADOS_CHECKLIST)[number];

export const checklistItemSchema = z.object({
  descricao: texto(3, 200, 'Item'),
  /** Nao conforme em item impeditivo reprova o equipamento. */
  impeditivo: z.boolean().default(false),
});
export type ChecklistItem = z.output<typeof checklistItemSchema>;

const modeloChecklistBase = z.object({
  clienteId: z.string({ required_error: 'Informe o cliente.' }).uuid('Cliente invalido.'),
  nome: texto(3, 120, 'Nome do checklist'),
  tipoEquipamento: texto(2, 80, 'Tipo de equipamento'),
  itens: z.array(checklistItemSchema).min(1, 'Inclua ao menos um item.').max(60),
  ativo: z.boolean().default(true),
});
export const modeloChecklistCreateSchema = modeloChecklistBase;
export const modeloChecklistUpdateSchema = modeloChecklistBase.partial();
export type ModeloChecklistCreateInput = z.input<typeof modeloChecklistCreateSchema>;

export const checklistRespostaSchema = z.object({
  descricao: z.string().trim().min(1).max(200),
  impeditivo: z.boolean(),
  conforme: z.boolean(),
  observacao: opcional(z.string().trim().max(300)),
});
export type ChecklistResposta = z.output<typeof checklistRespostaSchema>;

export const execucaoChecklistCreateSchema = z.object({
  modeloId: z.string({ required_error: 'Informe o modelo.' }).uuid('Modelo invalido.'),
  areaId: opcional(z.string().uuid('Area invalida.')),
  colaboradorId: opcional(z.string().uuid('Colaborador invalido.')),
  equipamentoIdentificacao: texto(1, 120, 'Identificacao do equipamento'),
  executadoPor: texto(3, 120, 'Executado por'),
  respostas: z.array(checklistRespostaSchema).min(1, 'Responda os itens.'),
});
export type ExecucaoChecklistCreateInput = z.input<typeof execucaoChecklistCreateSchema>;

export const execucaoChecklistFiltroSchema = z.object({
  clienteId: z.string().uuid().optional(),
  modeloId: z.string().uuid().optional(),
  resultado: z.enum(RESULTADOS_CHECKLIST).optional(),
  de: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(25),
});

/** APTO so quando nenhum item impeditivo esta nao conforme. */
export function resultadoDoChecklist(respostas: ChecklistResposta[]): ResultadoChecklist {
  return respostas.some((r) => r.impeditivo && !r.conforme) ? 'NAO_APTO' : 'APTO';
}

/* -------------------------------------------------------------------------- */
/* Modelos de checklist padrao (ferramentas e equipamentos)                   */
/* -------------------------------------------------------------------------- */

export interface ModeloChecklistPadrao {
  nome: string;
  tipoEquipamento: string;
  itens: Array<{ descricao: string; impeditivo: boolean }>;
}

/**
 * Biblioteca inicial de checklists de pre-uso. Sao SUGESTAO editavel: o
 * modelo e copiado para o cliente e pode ser alterado item a item. A
 * consultoria completara com os modelos proprios enviados pela operacao.
 */
export const MODELOS_CHECKLIST_PADRAO: readonly ModeloChecklistPadrao[] = [
  {
    nome: 'Pre-uso diario',
    tipoEquipamento: 'Empilhadeira',
    itens: [
      { descricao: 'Freio de servico e de estacionamento funcionando', impeditivo: true },
      { descricao: 'Garfos sem trincas, travas e deformacoes', impeditivo: true },
      { descricao: 'Correntes e mangueiras hidraulicas sem vazamento ou desgaste', impeditivo: true },
      { descricao: 'Cinto de seguranca presente e funcional', impeditivo: true },
      { descricao: 'Buzina, sinal sonoro de re e luzes operando', impeditivo: false },
      { descricao: 'Pneus/rodas em bom estado e calibrados', impeditivo: false },
      { descricao: 'Extintor presente, carregado e dentro da validade', impeditivo: false },
      { descricao: 'Nivel de combustivel/carga da bateria adequado', impeditivo: false },
      { descricao: 'Espelhos e protecao do operador integros', impeditivo: false },
    ],
  },
  {
    nome: 'Inspecao antes do uso',
    tipoEquipamento: 'Escada portatil',
    itens: [
      { descricao: 'Montantes sem trincas, amassados ou corrosao', impeditivo: true },
      { descricao: 'Degraus firmes, sem folga ou deformacao', impeditivo: true },
      { descricao: 'Sapatas antiderrapantes presentes e integras', impeditivo: true },
      { descricao: 'Travas/dispositivo de abertura funcionando (escada de abrir)', impeditivo: true },
      { descricao: 'Sem reparo improvisado (arame, fita, pregos)', impeditivo: true },
      { descricao: 'Identificacao e capacidade de carga legiveis', impeditivo: false },
    ],
  },
  {
    nome: 'Pre-uso',
    tipoEquipamento: 'Esmerilhadeira / lixadeira',
    itens: [
      { descricao: 'Protecao do disco instalada e ajustada', impeditivo: true },
      { descricao: 'Disco adequado ao equipamento, sem trincas e dentro da validade', impeditivo: true },
      { descricao: 'Cabo eletrico e plugue sem danos; aterramento', impeditivo: true },
      { descricao: 'Gatilho sem travamento em posicao ligada', impeditivo: true },
      { descricao: 'Empunhadura auxiliar presente', impeditivo: false },
      { descricao: 'Porca do disco apertada com a chave adequada', impeditivo: false },
    ],
  },
  {
    nome: 'Pre-uso',
    tipoEquipamento: 'Furadeira / parafusadeira',
    itens: [
      { descricao: 'Cabo e plugue sem danos (ou bateria integra)', impeditivo: true },
      { descricao: 'Mandril/trava da broca em bom estado', impeditivo: true },
      { descricao: 'Gatilho e botao de reversao funcionando', impeditivo: false },
      { descricao: 'Brocas afiadas e adequadas ao material', impeditivo: false },
      { descricao: 'Carcaca sem trincas; ventilacao desobstruida', impeditivo: false },
    ],
  },
  {
    nome: 'Pre-uso',
    tipoEquipamento: 'Talha / moitao / cinta de icamento',
    itens: [
      { descricao: 'Gancho com trava de seguranca funcional, sem abertura excessiva', impeditivo: true },
      { descricao: 'Corrente/cabo/cinta sem elos deformados, fios rompidos ou cortes', impeditivo: true },
      { descricao: 'Capacidade de carga (SWL) legivel e compativel com a carga', impeditivo: true },
      { descricao: 'Freio de carga retem a carga suspensa', impeditivo: true },
      { descricao: 'Etiqueta de inspecao periodica dentro do prazo', impeditivo: false },
      { descricao: 'Area de icamento isolada e sinalizada', impeditivo: false },
    ],
  },
  {
    nome: 'Inspecao do cinto e talabarte',
    tipoEquipamento: 'EPI para trabalho em altura',
    itens: [
      { descricao: 'Fitas sem cortes, desfiamento, queimaduras ou mofo', impeditivo: true },
      { descricao: 'Costuras integras, sem fios soltos', impeditivo: true },
      { descricao: 'Fivelas e argolas sem deformacao ou corrosao; mosquetoes com trava', impeditivo: true },
      { descricao: 'Absorvedor de energia intacto (sem acionamento)', impeditivo: true },
      { descricao: 'CA valido e etiqueta legivel', impeditivo: true },
      { descricao: 'Ponto de ancoragem definido e capaz', impeditivo: false },
    ],
  },
  {
    nome: 'Inspecao mensal',
    tipoEquipamento: 'Extintor de incendio',
    itens: [
      { descricao: 'Lacre e pino de seguranca intactos', impeditivo: true },
      { descricao: 'Manometro na faixa verde (quando houver)', impeditivo: true },
      { descricao: 'Carga e teste hidrostatico dentro da validade', impeditivo: true },
      { descricao: 'Mangueira e difusor sem obstrucao ou rachadura', impeditivo: false },
      { descricao: 'Sinalizacao de piso e parede visiveis; acesso desobstruido', impeditivo: false },
      { descricao: 'Suporte/abrigo em bom estado', impeditivo: false },
    ],
  },
  {
    nome: 'Pre-uso diario',
    tipoEquipamento: 'Veiculo leve / caminhonete',
    itens: [
      { descricao: 'Freios e freio de mao funcionando', impeditivo: true },
      { descricao: 'Pneus com sulco adequado e calibrados; estepe', impeditivo: true },
      { descricao: 'Cintos de seguranca de todos os bancos funcionais', impeditivo: true },
      { descricao: 'Farois, lanternas, setas e luz de freio', impeditivo: false },
      { descricao: 'Niveis de oleo, agua e combustivel', impeditivo: false },
      { descricao: 'Documentacao do veiculo e habilitacao do condutor', impeditivo: false },
      { descricao: 'Triangulo, macaco e chave de roda', impeditivo: false },
    ],
  },
  {
    nome: 'Liberacao para uso',
    tipoEquipamento: 'Andaime',
    itens: [
      { descricao: 'Base nivelada sobre sapatas/apoios adequados', impeditivo: true },
      { descricao: 'Pisos completos, travados e sem frestas', impeditivo: true },
      { descricao: 'Guarda-corpo e rodape em todas as faces abertas', impeditivo: true },
      { descricao: 'Travamentos (diagonais e horizontais) e amarracoes a estrutura', impeditivo: true },
      { descricao: 'Acesso por escada interna ou externa fixada', impeditivo: true },
      { descricao: 'Placa de liberacao (verde/vermelho) atualizada', impeditivo: false },
    ],
  },
  {
    nome: 'Pre-uso',
    tipoEquipamento: 'Betoneira',
    itens: [
      { descricao: 'Protecoes das engrenagens e correias instaladas', impeditivo: true },
      { descricao: 'Cabo eletrico, plugue e aterramento integros', impeditivo: true },
      { descricao: 'Chave de partida/parada funcionando', impeditivo: true },
      { descricao: 'Tambor sem trincas; pas internas fixas', impeditivo: false },
      { descricao: 'Equipamento nivelado e estavel', impeditivo: false },
    ],
  },
  {
    nome: 'Pre-uso',
    tipoEquipamento: 'Serra circular de bancada',
    itens: [
      { descricao: 'Coifa protetora do disco instalada', impeditivo: true },
      { descricao: 'Cutelo divisor alinhado ao disco', impeditivo: true },
      { descricao: 'Disco afiado, sem dentes quebrados, adequado ao material', impeditivo: true },
      { descricao: 'Chave de parada de emergencia acessivel', impeditivo: true },
      { descricao: 'Empurrador disponivel; bancada estavel', impeditivo: false },
      { descricao: 'Coletor de po/area limpa', impeditivo: false },
    ],
  },
  {
    nome: 'Inspecao visual',
    tipoEquipamento: 'Ferramentas manuais',
    itens: [
      { descricao: 'Cabos firmes, sem trincas ou lascas (martelo, marreta, chave de fenda)', impeditivo: true },
      { descricao: 'Sem cabecas "cogumelo" em talhadeiras e puncoes', impeditivo: true },
      { descricao: 'Chaves sem bocas desgastadas ou abertas', impeditivo: false },
      { descricao: 'Ferramentas isoladas para trabalho eletrico com isolamento integro', impeditivo: true },
      { descricao: 'Guardadas em local adequado, limpas e identificadas', impeditivo: false },
    ],
  },
  {
    nome: 'Pre-uso',
    tipoEquipamento: 'Maquina de solda',
    itens: [
      { descricao: 'Cabos de solda e obra sem emendas expostas ou isolamento danificado', impeditivo: true },
      { descricao: 'Garra de terra firme e proxima a peca', impeditivo: true },
      { descricao: 'Porta-eletrodo com isolamento integro', impeditivo: true },
      { descricao: 'Aterramento do equipamento conectado', impeditivo: true },
      { descricao: 'Biombo/cortina de protecao e exaustao disponiveis', impeditivo: false },
      { descricao: 'Extintor proximo; area livre de inflamaveis (PT de trabalho a quente)', impeditivo: false },
    ],
  },
  {
    nome: 'Pre-uso',
    tipoEquipamento: 'Compressor de ar',
    itens: [
      { descricao: 'Valvula de seguranca e manometro funcionando', impeditivo: true },
      { descricao: 'Mangueiras e engates sem vazamento ou danos', impeditivo: true },
      { descricao: 'Protecao da correia/polia instalada', impeditivo: true },
      { descricao: 'Dreno do reservatorio realizado', impeditivo: false },
      { descricao: 'Nivel de oleo; filtro de ar limpo', impeditivo: false },
    ],
  },
];
