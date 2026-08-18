import { arredondar, classificarDesempenho, percentual, type FaixaDesempenho } from './classificacao.js';

/**
 * Conformidade de saude ocupacional e documentacao legal (Etapa 9).
 *
 * ASO, PGR, PCMSO, LTCAT e licencas tem uma coisa em comum: **valem ate uma
 * data**. O que a plataforma precisa responder e sempre a mesma pergunta —
 * o que esta vencido, o que vence agora e qual e o percentual em dia.
 *
 * Toda a regra de vencimento mora aqui, e nao espalhada pelos servicos, para
 * que o alerta do painel, o e-mail e o relatorio digam exatamente a mesma coisa.
 */

/* -------------------------------------------------------------------------- */
/* Situacao de vencimento                                                      */
/* -------------------------------------------------------------------------- */

export const SITUACOES_VENCIMENTO = ['VIGENTE', 'A_VENCER', 'VENCIDO', 'SEM_VALIDADE'] as const;
export type SituacaoVencimento = (typeof SITUACOES_VENCIMENTO)[number];

export const ROTULO_SITUACAO_VENCIMENTO: Record<SituacaoVencimento, string> = {
  VIGENTE: 'Vigente',
  A_VENCER: 'A vencer',
  VENCIDO: 'Vencido',
  SEM_VALIDADE: 'Sem validade',
};

/**
 * Janela padrao de alerta, em dias.
 *
 * 30 dias e o que a maioria dos programas legais exige para renovacao sem
 * interrupcao; as faixas de 60 e 90 servem ao planejamento anual.
 */
export const DIAS_ALERTA_PADRAO = 30;
export const FAIXAS_ALERTA_DIAS = [30, 60, 90] as const;

/** Meia-noite local — comparacao de validade e por dia, nao por hora. */
function inicioDoDia(data: Date): number {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate()).getTime();
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Dias ate a validade. Negativo = ja venceu; `null` = sem validade definida.
 *
 * Um documento que vence hoje devolve 0 e ainda conta como vigente — a
 * validade cobre o dia inteiro.
 */
export function diasAteVencer(validade: Date | string | null | undefined, hoje: Date = new Date()): number | null {
  if (validade === null || validade === undefined) return null;

  const alvo = validade instanceof Date ? validade : new Date(validade);
  if (Number.isNaN(alvo.getTime())) return null;

  return Math.round((inicioDoDia(alvo) - inicioDoDia(hoje)) / UM_DIA_MS);
}

/**
 * Classifica um item pela validade.
 *
 * `SEM_VALIDADE` e uma situacao propria, e nao um sinonimo de vigente: um PGR
 * sem data de validade cadastrada e um cadastro incompleto, nao um documento
 * eterno — quem olha o painel precisa ver a diferenca.
 */
export function situacaoDaValidade(
  validade: Date | string | null | undefined,
  hoje: Date = new Date(),
  diasAlerta: number = DIAS_ALERTA_PADRAO,
): SituacaoVencimento {
  const dias = diasAteVencer(validade, hoje);

  if (dias === null) return 'SEM_VALIDADE';
  if (dias < 0) return 'VENCIDO';
  if (dias <= diasAlerta) return 'A_VENCER';
  return 'VIGENTE';
}

/** Data de validade a partir da emissao e de um prazo em meses. */
export function calcularValidade(emissao: Date, meses: number): Date {
  const validade = new Date(emissao.getTime());
  const diaOriginal = validade.getDate();

  validade.setMonth(validade.getMonth() + meses);
  // 31/01 + 1 mes viraria 03/03 — recua para o ultimo dia do mes de destino.
  if (validade.getDate() !== diaOriginal) validade.setDate(0);

  return validade;
}

/* -------------------------------------------------------------------------- */
/* Resumo de conformidade                                                      */
/* -------------------------------------------------------------------------- */

export interface ItemComValidade {
  validade?: Date | string | null;
}

export interface ResumoConformidade {
  total: number;
  vigentes: number;
  aVencer: number;
  vencidos: number;
  semValidade: number;
  /** % de itens em dia (vigentes + a vencer) sobre o total. */
  percentualConformidade: number;
  classificacao: FaixaDesempenho;
  /** Quantos vencem dentro de cada faixa de alerta (30 / 60 / 90 dias). */
  porFaixa: { dias: number; quantidade: number }[];
}

/**
 * Consolida uma carteira de itens com validade.
 *
 * "Em dia" inclui o que esta a vencer: o documento ainda vale. O que esta a
 * vencer aparece separado porque e a fila de trabalho da renovacao.
 *
 * Itens **sem validade** contam no denominador e nao entram como conformes —
 * caso contrario, deixar a data em branco viraria a forma mais facil de
 * "melhorar" o indicador.
 */
export function calcularConformidade(
  itens: readonly ItemComValidade[],
  hoje: Date = new Date(),
  diasAlerta: number = DIAS_ALERTA_PADRAO,
): ResumoConformidade {
  let vigentes = 0;
  let aVencer = 0;
  let vencidos = 0;
  let semValidade = 0;

  const porFaixa = FAIXAS_ALERTA_DIAS.map((dias) => ({ dias, quantidade: 0 }));

  for (const item of itens) {
    const situacao = situacaoDaValidade(item.validade, hoje, diasAlerta);

    if (situacao === 'VIGENTE') vigentes += 1;
    else if (situacao === 'A_VENCER') aVencer += 1;
    else if (situacao === 'VENCIDO') vencidos += 1;
    else semValidade += 1;

    const dias = diasAteVencer(item.validade, hoje);
    if (dias !== null && dias >= 0) {
      for (const faixa of porFaixa) {
        if (dias <= faixa.dias) faixa.quantidade += 1;
      }
    }
  }

  const total = itens.length;
  const percentualConformidade = percentual(vigentes + aVencer, total);

  return {
    total,
    vigentes,
    aVencer,
    vencidos,
    semValidade,
    percentualConformidade,
    classificacao: classificarDesempenho(percentualConformidade),
    porFaixa,
  };
}

/* -------------------------------------------------------------------------- */
/* Indice de Conformidade Legal (ICL)                                          */
/* -------------------------------------------------------------------------- */

/**
 * Pesos do ICL.
 *
 * A saude ocupacional pesa mais: ASO vencido impede o colaborador de
 * trabalhar, enquanto um laudo vencido e uma nao conformidade documental.
 */
export const PESO_ICL_SAUDE = 60;
export const PESO_ICL_DOCUMENTOS = 40;

export interface ResultadoIcl {
  valor: number;
  classificacao: FaixaDesempenho;
  saude: number | null;
  documentos: number | null;
  /** Peso efetivamente usado — reponderado quando falta uma das metades. */
  pesoConsiderado: number;
}

/**
 * Indice de Conformidade Legal — nota unica de 0 a 100.
 *
 * Se um dos lados nao tem nenhum registro, ele fica de fora e o outro
 * responde por 100% do indice: um contrato que ainda nao cadastrou documentos
 * nao deve ser tratado como se tivesse tirado zero neles.
 *
 * Este indice **nao entra** no Indice Global SSMA. Os pesos daquele indice sao
 * definidos pelo plano diretor e fecham 100% sem um pilar de conformidade
 * legal; incluir a conformidade exigiria redistribuir os pesos, o que e uma
 * decisao de negocio.
 */
export function calcularIcl(
  saude: ResumoConformidade | null,
  documentos: ResumoConformidade | null,
): ResultadoIcl {
  const notaSaude = saude && saude.total > 0 ? saude.percentualConformidade : null;
  const notaDocumentos = documentos && documentos.total > 0 ? documentos.percentualConformidade : null;

  let soma = 0;
  let pesoConsiderado = 0;

  if (notaSaude !== null) {
    soma += notaSaude * PESO_ICL_SAUDE;
    pesoConsiderado += PESO_ICL_SAUDE;
  }
  if (notaDocumentos !== null) {
    soma += notaDocumentos * PESO_ICL_DOCUMENTOS;
    pesoConsiderado += PESO_ICL_DOCUMENTOS;
  }

  const valor = pesoConsiderado > 0 ? arredondar(soma / pesoConsiderado) : 0;

  return {
    valor,
    classificacao: classificarDesempenho(valor),
    saude: notaSaude,
    documentos: notaDocumentos,
    pesoConsiderado,
  };
}

/* -------------------------------------------------------------------------- */
/* Prioridade da fila de renovacao                                             */
/* -------------------------------------------------------------------------- */

export const URGENCIAS_RENOVACAO = ['VENCIDO', 'CRITICO', 'ATENCAO', 'PROGRAMADO'] as const;
export type UrgenciaRenovacao = (typeof URGENCIAS_RENOVACAO)[number];

export const ROTULO_URGENCIA_RENOVACAO: Record<UrgenciaRenovacao, string> = {
  VENCIDO: 'Vencido',
  CRITICO: 'Vence em ate 7 dias',
  ATENCAO: 'Vence em ate 30 dias',
  PROGRAMADO: 'Vence em ate 90 dias',
};

/**
 * Ordena a fila de renovacao pelo que aperta primeiro.
 *
 * Devolve `null` para o que ainda esta longe (ou sem validade): a fila mostra
 * o que exige acao, nao o cadastro inteiro.
 */
export function urgenciaDaRenovacao(
  validade: Date | string | null | undefined,
  hoje: Date = new Date(),
): UrgenciaRenovacao | null {
  const dias = diasAteVencer(validade, hoje);

  if (dias === null) return null;
  if (dias < 0) return 'VENCIDO';
  if (dias <= 7) return 'CRITICO';
  if (dias <= 30) return 'ATENCAO';
  if (dias <= 90) return 'PROGRAMADO';
  return null;
}
