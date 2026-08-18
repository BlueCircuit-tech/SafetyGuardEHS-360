import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Permissao } from '@safetyguard/shared';
import { aplicarEscopoNaConsulta } from './autenticacao.js';

/**
 * Guarda de rota por metodo HTTP.
 *
 * Aplicada uma vez por modulo: `GET` exige a permissao de leitura, os demais
 * verbos exigem a de escrita. Rotas que fogem a regra (um POST que so consulta,
 * ou um endpoint publico) sao declaradas em `excecoes`, o que deixa a excecao
 * visivel em vez de escondida no meio dos handlers.
 */
export interface OpcoesGuarda {
  leitura: Permissao;
  escrita: Permissao;
  /**
   * Sobrescreve a permissao de rotas especificas.
   * A chave e a URL registrada (ex.: `/api/v1/planos-acao/escalonar`);
   * `null` libera a rota sem exigir autenticacao.
   */
  excecoes?: Record<string, Permissao | null>;
}

export function guardaPorMetodo(app: FastifyInstance, opcoes: OpcoesGuarda) {
  return async function guarda(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const url = request.routeOptions?.url ?? '';

    if (opcoes.excecoes && url in opcoes.excecoes) {
      const permissao = opcoes.excecoes[url];
      // `null` = rota publica (a tela de campo do QR Code, por exemplo).
      if (permissao === null) return;
      await app.exigirPermissao(permissao!)(request, reply);
      aplicarEscopoNaConsulta(request);
      return;
    }

    const permissao = request.method === 'GET' ? opcoes.leitura : opcoes.escrita;
    await app.exigirPermissao(permissao)(request, reply);
    aplicarEscopoNaConsulta(request);
  };
}
