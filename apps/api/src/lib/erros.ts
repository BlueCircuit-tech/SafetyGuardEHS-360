/** Erros de aplicacao com status HTTP e codigo estavel para o front-end. */
export class ErroApp extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly detalhes?: unknown;

  constructor(mensagem: string, opcoes: { status?: number; codigo?: string; detalhes?: unknown } = {}) {
    super(mensagem);
    this.name = 'ErroApp';
    this.status = opcoes.status ?? 400;
    this.codigo = opcoes.codigo ?? 'ERRO_APP';
    this.detalhes = opcoes.detalhes;
  }
}

export class NaoEncontrado extends ErroApp {
  constructor(mensagem = 'Recurso nao encontrado.', codigo = 'NAO_ENCONTRADO') {
    super(mensagem, { status: 404, codigo });
  }
}

export class Conflito extends ErroApp {
  constructor(mensagem: string, codigo = 'CONFLITO', detalhes?: unknown) {
    super(mensagem, { status: 409, codigo, detalhes });
  }
}

export class RequisicaoInvalida extends ErroApp {
  constructor(mensagem: string, codigo = 'REQUISICAO_INVALIDA', detalhes?: unknown) {
    super(mensagem, { status: 400, codigo, detalhes });
  }
}
