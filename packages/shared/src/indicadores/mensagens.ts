import type { CabecalhoInstitucional } from '../schemas/empresa-consultoria.js';
import type { RegraComunicacao } from './comunicacao.js';
import { ROTULO_HIERARQUIA, type NivelHierarquia } from './comunicacao.js';

/**
 * Montagem das mensagens de alerta.
 *
 * O conteudo fica aqui — puro e testavel — para que o disparo (e-mail, WhatsApp
 * ou qualquer outro canal) seja apenas transporte. Trocar de provedor nao muda
 * uma virgula do texto.
 */

export interface ContextoAlerta {
  /** Bloco institucional da matriz (Etapa 1.1). */
  cabecalho: CabecalhoInstitucional;
  cliente: string;
  /** Empresa contratada envolvida, quando houver. */
  terceiro?: string | null;
  area: string;
  local?: string | null;
  /** Rotulo da classificacao (ex.: "A - MAJOR" ou "Condicao Insegura"). */
  classificacao: string;
  grauRisco: string;
  /** Causa catalogada ou tipo do desvio. */
  tipo: string;
  descricao: string;
  responsavel: string;
  dataHora: Date;
  regra: RegraComunicacao;
  /** Prazo-limite ja calculado. */
  prazoLimite?: Date | null;
  /** Nivel acionado agora — muda o texto quando e escalonamento. */
  nivelAcionado?: NivelHierarquia | null;
  /** Identificador legivel do plano de acao, quando ja aberto. */
  codigoPlano?: string | null;
}

export interface MensagensAlerta {
  emailAssunto: string;
  emailCorpo: string;
  whatsapp: string;
}

const FORMATO_DATA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatar(data: Date): string {
  return FORMATO_DATA.format(data).replace(', ', ' – ');
}

/** Urgencia visual conforme o prazo da matriz. */
function emojiUrgencia(regra: RegraComunicacao): string {
  if (regra.prazoHoras === 0) return '🚨';
  if (regra.prazoHoras <= 24) return '⚠️';
  return '📋';
}

/**
 * Monta o assunto/corpo do e-mail e o texto do WhatsApp de uma ocorrencia.
 *
 * O rodape do e-mail usa a assinatura institucional da matriz, e o WhatsApp usa
 * o cabecalho configurado no cadastro da Etapa 1.1 — os mesmos textos que
 * aparecem nos relatorios.
 */
export function montarMensagensAlerta(contexto: ContextoAlerta): MensagensAlerta {
  const { cabecalho, regra } = contexto;
  const emoji = emojiUrgencia(regra);
  const escalonando = Boolean(contexto.nivelAcionado);

  const prefixo = escalonando ? 'ESCALONAMENTO SSMA' : 'ALERTA SSMA';
  const emailAssunto = `${emoji} ${prefixo} – ${contexto.classificacao} | ${contexto.tipo}`;

  const detalhes: Array<[string, string | null | undefined]> = [
    ['Cliente', contexto.cliente],
    ['Empresa', contexto.terceiro],
    ['Área', contexto.area],
    ['Local', contexto.local],
    ['Classificação', contexto.classificacao],
    ['Grau de Risco', contexto.grauRisco],
    ['Tipo', contexto.tipo],
    ['Responsável', contexto.responsavel],
    ['Data/Hora', formatar(contexto.dataHora)],
    ['Plano de ação', contexto.codigoPlano],
  ];

  const linhasDetalhe = detalhes
    .filter(([, valor]) => Boolean(valor))
    .map(([rotulo, valor]) => `• ${rotulo}: ${valor}`)
    .join('\n');

  const prazoTexto = contexto.prazoLimite
    ? `${regra.prazoRotulo} (até ${formatar(contexto.prazoLimite)})`
    : regra.prazoRotulo;

  const abertura = escalonando
    ? `A tratativa não foi concluída no prazo e foi escalonada para ${ROTULO_HIERARQUIA[contexto.nivelAcionado!]}.`
    : 'Foi registrada uma ocorrência durante inspeção de campo.';

  const emailCorpo = [
    abertura,
    '',
    'Detalhes:',
    linhasDetalhe,
    '',
    `Descrição: ${contexto.descricao}`,
    '',
    `Ação requerida: ${regra.acao}.`,
    `Prazo: ${prazoTexto}.`,
    '',
    `Destinatários: ${regra.destinatarios.map((nivel) => ROTULO_HIERARQUIA[nivel]).join(', ')}.`,
    '',
    '—',
    cabecalho.assinaturaEmail,
    cabecalho.rodapeRelatorio,
  ].join('\n');

  const whatsapp = [
    cabecalho.cabecalhoWhatsapp,
    '',
    `${emoji} *${prefixo}*`,
    `Cliente: ${contexto.cliente}`,
    contexto.terceiro ? `Empresa: ${contexto.terceiro}` : null,
    `Área: ${contexto.area}`,
    `Classificação: ${contexto.classificacao}`,
    `Grau de Risco: ${contexto.grauRisco}`,
    '',
    contexto.descricao,
    '',
    `Responsável: ${contexto.responsavel}`,
    `Ação: ${regra.acao}`,
    `Prazo: ${prazoTexto}`,
  ]
    .filter((linha) => linha !== null)
    .join('\n');

  return { emailAssunto, emailCorpo, whatsapp };
}
