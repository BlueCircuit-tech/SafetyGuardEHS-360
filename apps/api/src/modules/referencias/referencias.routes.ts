import type { FastifyInstance } from 'fastify';
import {
  ATIVIDADES_TERCEIRO_SUGERIDAS,
  CNAES_SUGERIDOS,
  FAIXAS_CLASSIFICACAO,
  DESCRICAO_GRAU_RISCO,
  GRAUS_RISCO,
  PORTES_EMPRESA,
  REGIMES_TRIBUTARIOS,
  ROTULO_PORTE,
  ROTULO_REGIME_TRIBUTARIO,
  ROTULO_SITUACAO,
  ROTULO_SITUACAO_TERCEIRO,
  ROTULO_VINCULO_TERCEIRO,
  SEGMENTOS_SUGERIDOS,
  SITUACOES_CONTRATO,
  SITUACOES_TERCEIRO,
  TIPOS_VINCULO_TERCEIRO,
  TIPOS_REGISTRO_RT,
  UFS,
  formatarCnae,
  isCepValido,
  limparCep,
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
    portes: PORTES_EMPRESA.map((valor) => ({ valor, rotulo: ROTULO_PORTE[valor] })),
    situacoesContrato: SITUACOES_CONTRATO.map((valor) => ({ valor, rotulo: ROTULO_SITUACAO[valor] })),
    grausRisco: GRAUS_RISCO.map((valor) => ({ valor, descricao: DESCRICAO_GRAU_RISCO[valor] })),
    segmentos: SEGMENTOS_SUGERIDOS,
    situacoesTerceiro: SITUACOES_TERCEIRO.map((valor) => ({ valor, rotulo: ROTULO_SITUACAO_TERCEIRO[valor] })),
    tiposVinculoTerceiro: TIPOS_VINCULO_TERCEIRO.map((valor) => ({ valor, rotulo: ROTULO_VINCULO_TERCEIRO[valor] })),
    atividadesTerceiro: ATIVIDADES_TERCEIRO_SUGERIDAS,
    faixasClassificacao: FAIXAS_CLASSIFICACAO,
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
