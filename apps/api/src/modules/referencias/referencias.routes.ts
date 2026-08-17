import type { FastifyInstance } from 'fastify';
import {
  CNAES_SUGERIDOS,
  formatarCnae,
  isCepValido,
  limparCep,
  REGIMES_TRIBUTARIOS,
  ROTULO_REGIME_TRIBUTARIO,
  TIPOS_REGISTRO_RT,
  UFS,
} from '@safetyguard/shared';
import { z } from 'zod';
import { ErroApp, NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';

const TIMEOUT_CEP_MS = 5000;

interface RespostaViaCep {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean | string;
}

export async function rotasReferencias(app: FastifyInstance): Promise<void> {
  /** Listas fixas consumidas pelos selects do formulario. */
  app.get('/referencias', async () => ({
    ufs: UFS,
    tiposRegistroResponsavelTecnico: TIPOS_REGISTRO_RT,
    regimesTributarios: REGIMES_TRIBUTARIOS.map((valor) => ({
      valor,
      rotulo: ROTULO_REGIME_TRIBUTARIO[valor],
    })),
    cnaesSugeridos: CNAES_SUGERIDOS.map((cnae) => ({
      ...cnae,
      formatado: formatarCnae(cnae.codigo),
    })),
  }));

  /**
   * Consulta de CEP (ViaCEP) para preencher o bloco de endereco.
   * A API publica e apenas conveniencia: a validacao do endereco continua
   * sendo feita pelo schema no envio do formulario.
   */
  app.get('/referencias/cep/:cep', async (request) => {
    const { cep } = z.object({ cep: z.string() }).parse(request.params);
    const limpo = limparCep(cep);

    if (!isCepValido(limpo)) {
      throw new RequisicaoInvalida('CEP invalido — informe 8 digitos.', 'CEP_INVALIDO');
    }

    let resposta: Response;
    try {
      resposta = await fetch(`https://viacep.com.br/ws/${limpo}/json/`, {
        signal: AbortSignal.timeout(TIMEOUT_CEP_MS),
      });
    } catch {
      throw new ErroApp('Servico de CEP indisponivel. Preencha o endereco manualmente.', {
        status: 503,
        codigo: 'CEP_INDISPONIVEL',
      });
    }

    if (!resposta.ok) {
      throw new ErroApp('Servico de CEP indisponivel. Preencha o endereco manualmente.', {
        status: 503,
        codigo: 'CEP_INDISPONIVEL',
      });
    }

    const dados = (await resposta.json()) as RespostaViaCep;
    if (dados.erro) {
      throw new NaoEncontrado('CEP nao encontrado.', 'CEP_NAO_ENCONTRADO');
    }

    return {
      cep: limpo,
      logradouro: dados.logradouro ?? '',
      complemento: dados.complemento ?? '',
      bairro: dados.bairro ?? '',
      cidade: dados.localidade ?? '',
      uf: dados.uf ?? '',
    };
  });
}
