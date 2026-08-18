import type { ClassificacaoBird, GrauRiscoOcorrencia } from './risco.js';

/**
 * Matriz de Comunicacao Automatica — SGI SSMA 360.
 *
 * Reproduz a planilha `Matriz_Comunicacao_Automatica_SGI_360.xlsx` (Matriz
 * Mestre + Destinatarios Tecnicos + Parametros e Regras). Alterar prazo,
 * canal, prioridade ou escada de escalonamento e alterar ESTA tabela — nao ha
 * regra espalhada pelo codigo.
 *
 * Precedencia (regra da propria planilha): a Matriz Mestre, indexada pela
 * classificacao, sempre prevalece. As tabelas de roteamento por desvio apenas
 * ADICIONAM um destinatario tecnico — nunca alteram prazo, canal ou escada.
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
  'RESPONSAVEL_TECNICO',
  'BRIGADA',
  'PRODUCAO',
  'UTILIDADES',
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
  RESPONSAVEL_TECNICO: 'Responsavel tecnico da area',
  BRIGADA: 'Brigada',
  PRODUCAO: 'Producao',
  UTILIDADES: 'Utilidades',
};

/** O WhatsApp nem sempre e obrigatorio — a matriz distingue os tres casos. */
export const MODOS_WHATSAPP = ['OBRIGATORIO', 'OPCIONAL', 'NAO'] as const;
export type ModoWhatsapp = (typeof MODOS_WHATSAPP)[number];

/* -------------------------------------------------------------------------- */
/* Prioridade, fallback e modo de disparo                                      */
/* -------------------------------------------------------------------------- */

export const PRIORIDADES_DISPARO = ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'] as const;
export type PrioridadeDisparo = (typeof PRIORIDADES_DISPARO)[number];

export const ROTULO_PRIORIDADE: Record<PrioridadeDisparo, string> = {
  CRITICA: 'Critica',
  ALTA: 'Alta',
  MEDIA: 'Media',
  BAIXA: 'Baixa',
};

/**
 * Canal acionado quando o primario nao tem confirmacao de entrega:
 * ligacao de voz para Risco I, e-mail de reforco para Risco II.
 * Disparar o fallback exige provedor com confirmacao de entrega — ate la,
 * ele fica declarado na regra e registrado junto da notificacao.
 */
export type CanalFallback = 'VOZ' | 'EMAIL_REFORCO';

export const ROTULO_CANAL_FALLBACK: Record<CanalFallback, string> = {
  VOZ: 'Ligacao de voz',
  EMAIL_REFORCO: 'E-mail de reforco',
};

/**
 * Como a notificacao e disparada:
 * - `INDIVIDUAL`: sempre uma mensagem por ocorrencia (Risco I, sem excecao);
 * - `AGRUPAVEL`: vira resumo agrupado quando estoura o limite por area/tipo;
 * - `RESUMO_DIARIO`: nunca dispara individual — entra no resumo do dia.
 */
export const MODOS_DISPARO = ['INDIVIDUAL', 'AGRUPAVEL', 'RESUMO_DIARIO'] as const;
export type ModoDisparo = (typeof MODOS_DISPARO)[number];

export const ROTULO_DISPARO: Record<ModoDisparo, string> = {
  INDIVIDUAL: 'Individual — sempre',
  AGRUPAVEL: 'Agrupavel',
  RESUMO_DIARIO: 'Sempre agrupado (resumo diario)',
};

/* -------------------------------------------------------------------------- */
/* Parametros operacionais (aba "Parametros e Regras")                         */
/* -------------------------------------------------------------------------- */

/**
 * Horario comercial: 07:00 as 18:00, segunda a sexta.
 * Fora desse intervalo, ocorrencia de Risco I aciona o canal de voz
 * automaticamente, alem do canal primario.
 */
export const HORARIO_COMERCIAL = { inicioHora: 7, fimHora: 18 } as const;

export function dentroDoHorarioComercial(data: Date): boolean {
  const dia = data.getDay(); // 0 = domingo, 6 = sabado
  if (dia === 0 || dia === 6) return false;
  const hora = data.getHours();
  return hora >= HORARIO_COMERCIAL.inicioHora && hora < HORARIO_COMERCIAL.fimHora;
}

/**
 * Agrupamento: acima de 5 ocorrencias na mesma area/tipo dentro de 1 hora, o
 * disparo individual vira resumo agrupado — exceto Risco I, que e sempre
 * individual (na matriz, todo Risco I ja e `INDIVIDUAL`).
 *
 * A Matriz Mestre menciona "> 5/dia"; a aba de Parametros define
 * "> 5 na mesma area/tipo em 1 hora". Adotamos a aba de Parametros, que e a
 * regra operacional detalhada — divergencia registrada na documentacao.
 */
export const LIMITE_AGRUPAMENTO = 5;
export const JANELA_AGRUPAMENTO_HORAS = 1;

/** `true` quando o disparo deve sair como resumo agrupado, nao individual. */
export function deveAgrupar(disparo: ModoDisparo, ocorrenciasNaJanela: number): boolean {
  if (disparo === 'INDIVIDUAL') return false;
  if (disparo === 'RESUMO_DIARIO') return true;
  return ocorrenciasNaJanela > LIMITE_AGRUPAMENTO;
}

/* -------------------------------------------------------------------------- */
/* Regra de comunicacao                                                        */
/* -------------------------------------------------------------------------- */

export interface DegrauEscalonamento {
  /** Horas desde o REGISTRO da ocorrencia (o degrau 0h e o aviso inicial). */
  aposHoras: number;
  nivel: NivelHierarquia;
  rotulo: string;
}

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
  /** Quem recebe o aviso inicial (o degrau 0h da escada). */
  destinatarios: NivelHierarquia[];
  prioridade: PrioridadeDisparo;
  /** Canal acionado sem confirmacao de entrega do primario. */
  canalFallback: CanalFallback | null;
  disparo: ModoDisparo;
  /**
   * Escada de escalonamento DESTA classificacao, em horas desde o registro.
   * Um A-MAJor escala para o coordenador em 2 horas; um C-MINOR, em 24.
   */
  escalonamento: DegrauEscalonamento[];
}

function degrau(aposHoras: number, nivel: NivelHierarquia): DegrauEscalonamento {
  return {
    aposHoras,
    nivel,
    rotulo: aposHoras === 0 ? 'Registro' : `+${aposHoras} horas`,
  };
}

/** Matriz Mestre — linha a linha da planilha. */
export const MATRIZ_COMUNICACAO: readonly RegraComunicacao[] = [
  {
    evento: 'A_MAJOR',
    grau: 'I',
    acao: 'Paralisacao da atividade',
    email: true,
    whatsapp: 'OBRIGATORIO',
    prazoHoras: 0,
    prazoRotulo: 'Imediato',
    destinatarios: ['SUPERVISOR'],
    prioridade: 'CRITICA',
    canalFallback: 'VOZ',
    disparo: 'INDIVIDUAL',
    escalonamento: [
      degrau(0, 'SUPERVISOR'),
      degrau(2, 'COORDENADOR'),
      degrau(4, 'GERENTE'),
      degrau(8, 'DIRETORIA'),
    ],
  },
  {
    evento: 'B_SERIOUS',
    grau: 'I',
    acao: 'Correcao imediata',
    email: true,
    whatsapp: 'OBRIGATORIO',
    prazoHoras: 2,
    prazoRotulo: '2 horas',
    destinatarios: ['SUPERVISOR'],
    prioridade: 'ALTA',
    canalFallback: 'VOZ',
    disparo: 'INDIVIDUAL',
    escalonamento: [degrau(0, 'SUPERVISOR'), degrau(4, 'COORDENADOR'), degrau(8, 'GERENTE')],
  },
  {
    evento: 'D_MAJOR_NEAR_MISS',
    grau: 'I',
    acao: 'Investigar ocorrencia',
    email: true,
    whatsapp: 'OBRIGATORIO',
    prazoHoras: 0,
    prazoRotulo: 'Imediato',
    destinatarios: ['SUPERVISOR'],
    prioridade: 'ALTA',
    canalFallback: 'VOZ',
    disparo: 'INDIVIDUAL',
    escalonamento: [degrau(0, 'SUPERVISOR'), degrau(2, 'COORDENADOR'), degrau(4, 'GERENTE')],
  },
  {
    evento: 'CONDICAO_INSEGURA',
    grau: 'I',
    acao: 'Isolar area',
    email: true,
    whatsapp: 'OBRIGATORIO',
    prazoHoras: 0,
    prazoRotulo: 'Imediato',
    destinatarios: ['RESPONSAVEL_TECNICO'],
    prioridade: 'CRITICA',
    canalFallback: 'VOZ',
    disparo: 'INDIVIDUAL',
    escalonamento: [degrau(0, 'RESPONSAVEL_TECNICO'), degrau(2, 'SSMA'), degrau(4, 'GERENTE')],
  },
  {
    evento: 'OCORRENCIA_AMBIENTAL',
    grau: 'I',
    acao: 'Acionar Meio Ambiente',
    email: true,
    whatsapp: 'OBRIGATORIO',
    prazoHoras: 0,
    prazoRotulo: 'Imediato',
    destinatarios: ['MEIO_AMBIENTE'],
    prioridade: 'CRITICA',
    canalFallback: 'VOZ',
    disparo: 'INDIVIDUAL',
    escalonamento: [degrau(0, 'MEIO_AMBIENTE'), degrau(2, 'GERENTE'), degrau(4, 'DIRETORIA')],
  },
  {
    evento: 'C_MINOR',
    grau: 'II',
    acao: 'Abrir plano de acao',
    email: true,
    whatsapp: 'OPCIONAL',
    prazoHoras: 24,
    prazoRotulo: '24 horas',
    destinatarios: ['SUPERVISOR'],
    prioridade: 'MEDIA',
    canalFallback: 'EMAIL_REFORCO',
    disparo: 'AGRUPAVEL',
    escalonamento: [degrau(0, 'SUPERVISOR'), degrau(24, 'COORDENADOR')],
  },
  {
    evento: 'E_NEAR_MISS',
    grau: 'II',
    acao: 'Registrar e acompanhar',
    email: true,
    whatsapp: 'OPCIONAL',
    prazoHoras: 48,
    prazoRotulo: '48 horas',
    destinatarios: ['SUPERVISOR'],
    prioridade: 'MEDIA',
    canalFallback: 'EMAIL_REFORCO',
    disparo: 'AGRUPAVEL',
    escalonamento: [degrau(0, 'SUPERVISOR'), degrau(48, 'COORDENADOR')],
  },
  {
    evento: 'CONDICAO_INSEGURA',
    grau: 'II',
    acao: 'Programar manutencao',
    email: true,
    whatsapp: 'NAO',
    prazoHoras: 72,
    prazoRotulo: '72 horas',
    destinatarios: ['RESPONSAVEL_TECNICO'],
    prioridade: 'MEDIA',
    canalFallback: 'EMAIL_REFORCO',
    disparo: 'AGRUPAVEL',
    escalonamento: [degrau(0, 'RESPONSAVEL_TECNICO'), degrau(72, 'COORDENADOR')],
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
    prioridade: 'MEDIA',
    canalFallback: 'EMAIL_REFORCO',
    disparo: 'AGRUPAVEL',
    escalonamento: [degrau(0, 'SUPERVISOR'), degrau(24, 'COORDENADOR')],
  },
  {
    evento: 'F_FIRST_AID',
    grau: 'III',
    acao: 'Registrar atendimento',
    email: true,
    whatsapp: 'NAO',
    prazoHoras: 24,
    prazoRotulo: '24 horas',
    destinatarios: ['SUPERVISOR'],
    prioridade: 'BAIXA',
    canalFallback: null,
    disparo: 'RESUMO_DIARIO',
    escalonamento: [degrau(0, 'SUPERVISOR')],
  },
];

/** Aplicada quando o evento nao esta na matriz — nunca deixa a ocorrencia sem tratativa. */
export const REGRA_PADRAO: Omit<RegraComunicacao, 'evento' | 'grau'> = {
  acao: 'Registrar e acompanhar',
  email: true,
  whatsapp: 'NAO',
  prazoHoras: 72,
  prazoRotulo: '72 horas',
  destinatarios: ['SUPERVISOR'],
  prioridade: 'MEDIA',
  canalFallback: 'EMAIL_REFORCO',
  disparo: 'AGRUPAVEL',
  escalonamento: [degrau(0, 'SUPERVISOR'), degrau(72, 'COORDENADOR')],
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

/**
 * Canais do disparo inicial, ja com a regra de horario comercial aplicada:
 * fora de 07:00-18:00/seg-sex, Risco I aciona o canal de voz alem do primario.
 */
export function canaisDoDisparo(regra: RegraComunicacao, momento: Date): Array<'EMAIL' | 'WHATSAPP' | 'VOZ'> {
  const canais: Array<'EMAIL' | 'WHATSAPP' | 'VOZ'> = [];

  if (regra.email) canais.push('EMAIL');
  if (regra.whatsapp !== 'NAO') canais.push('WHATSAPP');
  if (regra.grau === 'I' && !dentroDoHorarioComercial(momento)) canais.push('VOZ');

  return canais;
}

/* -------------------------------------------------------------------------- */
/* Escalonamento automatico                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Escada generica do plano diretor, para planos SEM classificacao de origem
 * (abertos manualmente): supervisor no registro e, a partir do vencimento do
 * prazo, coordenador (+24h), gerente (+48h) e corporativa (+72h).
 *
 * Os degraus saem em horas desde o registro — a mesma unidade das escadas da
 * matriz — ancorados no prazo do proprio plano.
 */
export function montarEscalonamentoPadrao(prazoHoras: number): DegrauEscalonamento[] {
  const base = Math.max(0, prazoHoras);
  return [
    { aposHoras: 0, nivel: 'SUPERVISOR', rotulo: 'Registro' },
    { aposHoras: base + 24, nivel: 'COORDENADOR', rotulo: '+24 horas' },
    { aposHoras: base + 48, nivel: 'GERENTE', rotulo: '+48 horas' },
    { aposHoras: base + 72, nivel: 'GERENCIA_CORPORATIVA', rotulo: '+72 horas' },
  ];
}

/** Escada de um plano: a da classificacao quando ha regra, a generica sem ela. */
export function escalonamentoDaRegra(
  regra: Pick<RegraComunicacao, 'escalonamento'> | null | undefined,
  prazoHoras: number,
): DegrauEscalonamento[] {
  return regra?.escalonamento && regra.escalonamento.length > 0
    ? [...regra.escalonamento]
    : montarEscalonamentoPadrao(prazoHoras);
}

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
 * Calcula em que degrau da escada a acao esta.
 *
 * Os degraus contam horas desde o REGISTRO. Sem escada explicita, usa a
 * generica ancorada no prazo — que reproduz o comportamento anterior
 * (+24/+48/+72 apos o vencimento).
 */
export function calcularEscalonamento(
  horasDesdeORegistro: number,
  prazoHoras: number,
  degraus: readonly DegrauEscalonamento[] = montarEscalonamentoPadrao(prazoHoras),
): SituacaoEscalonamento {
  const horasDeAtraso = horasDesdeORegistro - prazoHoras;

  let indice = 0;
  for (let i = 0; i < degraus.length; i += 1) {
    if (horasDesdeORegistro >= degraus[i]!.aposHoras) indice = i;
  }

  const atual = degraus[indice]!;

  return {
    nivel: atual.nivel,
    rotuloNivel: ROTULO_HIERARQUIA[atual.nivel],
    degrau: indice,
    horasDeAtraso,
    vencida: horasDeAtraso >= 0,
    proximo: degraus[indice + 1] ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Roteamento por tipo de desvio (aba "Destinatarios Tecnicos")                */
/* -------------------------------------------------------------------------- */

export interface RegraRoteamento {
  desvio: string;
  destinatarios: NivelHierarquia[];
}

/** Condicao insegura vai para quem resolve o ambiente. */
export const ROTEAMENTO_CONDICAO: readonly RegraRoteamento[] = [
  { desvio: 'Piso irregular', destinatarios: ['MANUTENCAO'] },
  { desvio: 'Vazamento de oleo', destinatarios: ['MEIO_AMBIENTE', 'MANUTENCAO'] },
  { desvio: 'Extintor vencido', destinatarios: ['BRIGADA', 'SSMA'] },
  { desvio: 'Protecao de maquina removida', destinatarios: ['PRODUCAO', 'MANUTENCAO'] },
  { desvio: 'Iluminacao inadequada', destinatarios: ['UTILIDADES'] },
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

/**
 * Regra final da ocorrencia: matriz + roteamento especifico, sem duplicar.
 * O roteamento so soma destinatario — prazo, canal, prioridade e escada
 * permanecem os da Matriz Mestre (regra de precedencia da planilha).
 */
export function planoDeComunicacao(
  evento: EventoComunicacao,
  grau: GrauRiscoOcorrencia,
  desvio?: string,
): RegraComunicacao {
  const regra = resolverComunicacao(evento, grau);
  const extras = desvio ? destinatariosDoDesvio(desvio) : [];

  return { ...regra, destinatarios: [...new Set([...regra.destinatarios, ...extras])] };
}
