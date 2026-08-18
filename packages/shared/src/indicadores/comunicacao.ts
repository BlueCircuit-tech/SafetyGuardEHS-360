import type { ClassificacaoBird, GrauRiscoOcorrencia } from './risco.js';

/**
 * Matriz de Comunicacao Automatica.
 *
 * Define quem e avisado, por qual canal e em que prazo, conforme a
 * classificacao da ocorrencia e o grau de risco. Evita excesso de mensagens e
 * garante que o caso critico seja tratado imediatamente.
 */

/** Eventos que disparam comunicacao. */
export type EventoComunicacao =
  | Exclude<ClassificacaoBird, 'ATOS_E_CONDICOES'>
  | 'CONDICAO_INSEGURA'
  | 'COMPORTAMENTO_INSEGURO'
  | 'OCORRENCIA_AMBIENTAL';

export const NIVEIS_HIERARQUIA = [
  'SUPERVISOR',
  'COORDENADOR',
  'GERENTE',
  'GERENCIA_CORPORATIVA',
  'DIRETORIA',
  'SSMA',
  'MEIO_AMBIENTE',
  'MANUTENCAO',
] as const;
export type NivelHierarquia = (typeof NIVEIS_HIERARQUIA)[number];

export const ROTULO_HIERARQUIA: Record<NivelHierarquia, string> = {
  SUPERVISOR: 'Supervisor',
  COORDENADOR: 'Coordenador',
  GERENTE: 'Gerente',
  GERENCIA_CORPORATIVA: 'Gerencia Corporativa',
  DIRETORIA: 'Diretoria',
  SSMA: 'SSMA',
  MEIO_AMBIENTE: 'Meio Ambiente',
  MANUTENCAO: 'Manutencao',
};

/** O WhatsApp nem sempre e obrigatorio — a matriz distingue os tres casos. */
export const MODOS_WHATSAPP = ['OBRIGATORIO', 'OPCIONAL', 'NAO'] as const;
export type ModoWhatsapp = (typeof MODOS_WHATSAPP)[number];

export interface RegraComunicacao {
  evento: EventoComunicacao;
  grau: GrauRiscoOcorrencia;
  /** O que precisa ser feito. */
  acao: string;
  email: boolean;
  whatsapp: ModoWhatsapp;
  /** Prazo em horas. `0` = imediato. */
  prazoHoras: number;
  prazoRotulo: string;
  /** `true` quando o prazo e "ate o fim do dia" e nao um numero fixo de horas. */
  ateFimDoDia?: boolean;
  destinatarios: NivelHierarquia[];
}

/**
 * Matriz de Comunicacao Automatica, conforme o plano diretor.
 * Alterar prazos ou canais e alterar esta tabela — nao ha regra espalhada
 * pelo codigo.
 */
export const MATRIZ_COMUNICACAO: readonly RegraComunicacao[] = [
  {
    evento: 'A_MAJOR',
    grau: 'I',
    acao: 'Paralisacao da atividade',
    email: true,
    whatsapp: 'OBRIGATORIO',
    prazoHoras: 0,
    prazoRotulo: 'Imediato',
    destinatarios: ['SUPERVISOR', 'COORDENADOR', 'GERENTE', 'DIRETORIA', 'SSMA'],
  },
  {
    evento: 'B_SERIOUS',
    grau: 'I',
    acao: 'Correcao imediata',
    email: true,
    whatsapp: 'OBRIGATORIO',
    prazoHoras: 2,
    prazoRotulo: '2 horas',
    destinatarios: ['SUPERVISOR', 'COORDENADOR', 'GERENTE', 'SSMA'],
  },
  {
    evento: 'C_MINOR',
    grau: 'II',
    acao: 'Abrir plano de acao',
    email: true,
    whatsapp: 'OPCIONAL',
    prazoHoras: 24,
    prazoRotulo: '24 horas',
    destinatarios: ['SUPERVISOR', 'COORDENADOR'],
  },
  {
    evento: 'D_MAJOR_NEAR_MISS',
    grau: 'I',
    acao: 'Investigar ocorrencia',
    email: true,
    whatsapp: 'OBRIGATORIO',
    prazoHoras: 0,
    prazoRotulo: 'Imediato',
    destinatarios: ['SUPERVISOR', 'COORDENADOR', 'GERENTE', 'SSMA'],
  },
  {
    evento: 'E_NEAR_MISS',
    grau: 'II',
    acao: 'Registrar e acompanhar',
    email: true,
    whatsapp: 'OPCIONAL',
    prazoHoras: 48,
    prazoRotulo: '48 horas',
    destinatarios: ['SUPERVISOR', 'SSMA'],
  },
  {
    evento: 'F_FIRST_AID',
    grau: 'III',
    acao: 'Registrar atendimento',
    email: true,
    whatsapp: 'NAO',
    prazoHoras: 24,
    prazoRotulo: '24 horas',
    destinatarios: ['SUPERVISOR', 'SSMA'],
  },
  {
    evento: 'CONDICAO_INSEGURA',
    grau: 'I',
    acao: 'Isolar area',
    email: true,
    whatsapp: 'OBRIGATORIO',
    prazoHoras: 0,
    prazoRotulo: 'Imediato',
    destinatarios: ['SUPERVISOR', 'COORDENADOR', 'SSMA', 'MANUTENCAO'],
  },
  {
    evento: 'CONDICAO_INSEGURA',
    grau: 'II',
    acao: 'Programar manutencao',
    email: true,
    whatsapp: 'NAO',
    prazoHoras: 72,
    prazoRotulo: '72 horas',
    destinatarios: ['SUPERVISOR', 'MANUTENCAO'],
  },
  {
    evento: 'COMPORTAMENTO_INSEGURO',
    grau: 'II',
    acao: 'Orientacao imediata',
    email: true,
    whatsapp: 'OPCIONAL',
    prazoHoras: 8,
    prazoRotulo: 'Mesmo dia',
    ateFimDoDia: true,
    destinatarios: ['SUPERVISOR'],
  },
  {
    evento: 'OCORRENCIA_AMBIENTAL',
    grau: 'I',
    acao: 'Acionar Meio Ambiente',
    email: true,
    whatsapp: 'OBRIGATORIO',
    prazoHoras: 0,
    prazoRotulo: 'Imediato',
    destinatarios: ['SUPERVISOR', 'COORDENADOR', 'MEIO_AMBIENTE', 'SSMA'],
  },
];

/** Aplicada quando o evento nao esta na matriz — nunca deixa a ocorrencia sem tratativa. */
export const REGRA_PADRAO: Omit<RegraComunicacao, 'evento' | 'grau'> = {
  acao: 'Registrar e acompanhar',
  email: true,
  whatsapp: 'NAO',
  prazoHoras: 72,
  prazoRotulo: '72 horas',
  destinatarios: ['SUPERVISOR', 'SSMA'],
};

/**
 * Resolve a regra de comunicacao de uma ocorrencia.
 *
 * Procura a combinacao exata (evento + grau); se nao houver, usa a regra mais
 * severa cadastrada para aquele evento; em ultimo caso, a regra padrao.
 */
export function resolverComunicacao(evento: EventoComunicacao, grau: GrauRiscoOcorrencia): RegraComunicacao {
  const exata = MATRIZ_COMUNICACAO.find((regra) => regra.evento === evento && regra.grau === grau);
  if (exata) return exata;

  const doEvento = MATRIZ_COMUNICACAO.filter((regra) => regra.evento === evento).sort(
    (a, b) => a.prazoHoras - b.prazoHoras,
  );
  if (doEvento[0]) return { ...doEvento[0], grau };

  return { ...REGRA_PADRAO, evento, grau };
}

/* -------------------------------------------------------------------------- */
/* Escalonamento automatico                                                    */
/* -------------------------------------------------------------------------- */

export interface DegrauEscalonamento {
  /** Horas apos o vencimento do prazo. */
  aposHoras: number;
  nivel: NivelHierarquia;
  rotulo: string;
}

/**
 * Se a acao nao for tratada dentro do prazo, sobe de nivel automaticamente.
 * Registro → Supervisor · +24h → Coordenador · +48h → Gerente · +72h → Corporativa.
 */
export const ESCALONAMENTO: readonly DegrauEscalonamento[] = [
  { aposHoras: 0, nivel: 'SUPERVISOR', rotulo: 'Registro' },
  { aposHoras: 24, nivel: 'COORDENADOR', rotulo: '+24 horas' },
  { aposHoras: 48, nivel: 'GERENTE', rotulo: '+48 horas' },
  { aposHoras: 72, nivel: 'GERENCIA_CORPORATIVA', rotulo: '+72 horas' },
];

export interface SituacaoEscalonamento {
  /** Nivel que deve ser acionado agora. */
  nivel: NivelHierarquia;
  rotuloNivel: string;
  degrau: number;
  /** Horas de atraso em relacao ao prazo. Negativo = ainda dentro do prazo. */
  horasDeAtraso: number;
  vencida: boolean;
  /** Proximo degrau, se houver. */
  proximo: DegrauEscalonamento | null;
}

/**
 * Calcula em que degrau do escalonamento a acao esta.
 *
 * `horasDesdeORegistro` e `prazoHoras` vem do plano de acao; a funcao e pura
 * para poder ser testada e reutilizada tanto no backend quanto no dashboard.
 */
export function calcularEscalonamento(horasDesdeORegistro: number, prazoHoras: number): SituacaoEscalonamento {
  const horasDeAtraso = horasDesdeORegistro - prazoHoras;

  if (horasDeAtraso < 0) {
    const primeiro = ESCALONAMENTO[0]!;
    return {
      nivel: primeiro.nivel,
      rotuloNivel: ROTULO_HIERARQUIA[primeiro.nivel],
      degrau: 0,
      horasDeAtraso,
      vencida: false,
      proximo: ESCALONAMENTO[1] ?? null,
    };
  }

  let indice = 0;
  for (let i = 0; i < ESCALONAMENTO.length; i += 1) {
    if (horasDeAtraso >= ESCALONAMENTO[i]!.aposHoras) indice = i;
  }

  const degrau = ESCALONAMENTO[indice]!;

  return {
    nivel: degrau.nivel,
    rotuloNivel: ROTULO_HIERARQUIA[degrau.nivel],
    degrau: indice,
    horasDeAtraso,
    vencida: true,
    proximo: ESCALONAMENTO[indice + 1] ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Roteamento por tipo de desvio                                               */
/* -------------------------------------------------------------------------- */

export interface RegraRoteamento {
  desvio: string;
  destinatarios: NivelHierarquia[];
}

/** Condicao insegura vai para quem resolve o ambiente. */
export const ROTEAMENTO_CONDICAO: readonly RegraRoteamento[] = [
  { desvio: 'Piso irregular', destinatarios: ['MANUTENCAO'] },
  { desvio: 'Vazamento de oleo', destinatarios: ['MEIO_AMBIENTE', 'MANUTENCAO'] },
  { desvio: 'Extintor vencido', destinatarios: ['SSMA'] },
  { desvio: 'Protecao de maquina removida', destinatarios: ['SUPERVISOR', 'MANUTENCAO'] },
  { desvio: 'Iluminacao inadequada', destinatarios: ['MANUTENCAO'] },
  { desvio: 'Falta de sinalizacao', destinatarios: ['SSMA'] },
];

/** Comportamento inseguro vai para quem lidera a pessoa. */
export const ROTEAMENTO_COMPORTAMENTO: readonly RegraRoteamento[] = [
  { desvio: 'Nao uso de EPI', destinatarios: ['SUPERVISOR'] },
  { desvio: 'Trabalho sem APR/AST', destinatarios: ['SUPERVISOR', 'SSMA'] },
  { desvio: 'Uso de celular em area operacional', destinatarios: ['SUPERVISOR'] },
  { desvio: 'Trabalho em altura sem cinto', destinatarios: ['SUPERVISOR', 'COORDENADOR', 'SSMA'] },
  { desvio: 'Operacao sem autorizacao', destinatarios: ['COORDENADOR'] },
];

/**
 * Destinatarios adicionais conforme o desvio especifico, somados aos da matriz.
 * Comparacao sem acento e sem caixa para tolerar variacao de digitacao.
 */
export function destinatariosDoDesvio(desvio: string): NivelHierarquia[] {
  const normalizar = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();

  const alvo = normalizar(desvio);
  const regra = [...ROTEAMENTO_CONDICAO, ...ROTEAMENTO_COMPORTAMENTO].find(
    (item) => normalizar(item.desvio) === alvo,
  );

  return regra ? [...regra.destinatarios] : [];
}

/** Regra final da ocorrencia: matriz + roteamento especifico, sem duplicar. */
export function planoDeComunicacao(
  evento: EventoComunicacao,
  grau: GrauRiscoOcorrencia,
  desvio?: string,
): RegraComunicacao {
  const regra = resolverComunicacao(evento, grau);
  const extras = desvio ? destinatariosDoDesvio(desvio) : [];

  return { ...regra, destinatarios: [...new Set([...regra.destinatarios, ...extras])] };
}
