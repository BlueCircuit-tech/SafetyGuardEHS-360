import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env.js';

/**
 * Assistente de redacao (IA) da plataforma.
 *
 * Um unico ponto de entrada para os recursos "gerar com IA" (roteiro de DDS,
 * sugestao de investigacao de acidente, modelos de relatorio). Usa a API da
 * Anthropic quando `ANTHROPIC_API_KEY` esta configurada; sem a chave, cada
 * recurso tem um gerador local (modelo de texto) para a tela nunca ficar
 * sem resposta — o resultado vem marcado com `origem: 'MODELO'`.
 *
 * O texto gerado e sempre uma SUGESTAO: fica editavel na tela e so e gravado
 * quando o usuario salva.
 */

export type OrigemTexto = 'IA' | 'MODELO';

export interface TextoGerado {
  texto: string;
  origem: OrigemTexto;
}

const MODELO = 'claude-opus-5-5';

let cliente: Anthropic | null = null;

export function assistenteDisponivel(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

function obterCliente(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  if (!cliente) cliente = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 90_000 });
  return cliente;
}

export interface PedidoTexto {
  /** Papel e regras fixas do redator (cacheavel). */
  sistema: string;
  /** O pedido desta chamada. */
  pedido: string;
  /** Gerador local usado sem chave ou em falha — nunca deixa a tela sem resposta. */
  reserva: () => string;
  maxTokens?: number;
}

/**
 * Gera um texto. Nunca lanca: em falha de rede, limite ou recusa, devolve o
 * texto do gerador local com `origem: 'MODELO'`.
 */
export async function gerarTexto(pedido: PedidoTexto): Promise<TextoGerado> {
  const api = obterCliente();
  if (!api) return { texto: pedido.reserva(), origem: 'MODELO' };

  try {
    const resposta = await api.messages.create({
      model: MODELO,
      max_tokens: pedido.maxTokens ?? 4000,
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: pedido.sistema, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: pedido.pedido }],
    });

    if (resposta.stop_reason === 'refusal') return { texto: pedido.reserva(), origem: 'MODELO' };

    const texto = resposta.content
      .filter((bloco): bloco is Anthropic.TextBlock => bloco.type === 'text')
      .map((bloco) => bloco.text)
      .join('\n')
      .trim();

    return texto ? { texto, origem: 'IA' } : { texto: pedido.reserva(), origem: 'MODELO' };
  } catch (erro) {
    // Falha de credencial, rede ou limite: registra e segue com o modelo local.
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.error(`[assistente] falha na geracao (${MODELO}): ${motivo}`);
    return { texto: pedido.reserva(), origem: 'MODELO' };
  }
}
