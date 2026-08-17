/** Erros de aplicacao com status HTTP e codigo estavel para o front-end. */

export interface OpcoesErro {
  status?: number;
  codigo?: string;
  /** Mensagens por campo — o formulario do front destaca o campo correspondente. */
  campos?: Record<string, string[]>;
  detalhes?: unknown;
}

export class ErroApp extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly campos?: Record<string, string[]>;
  readonly detalhes?: unknown;

  constructor(mensagem: string, opcoes: OpcoesErro = {}) {
    super(mensagem);
    this.name = 'ErroApp';
    this.status = opcoes.status ?? 400;
    this.codigo = opcoes.codigo ?? 'ERRO_APP';
    this.campos = opcoes.campos;
    this.detalhes = opcoes.detalhes;
  }
}

export class NaoEncontrado extends ErroApp {
  constructor(mensagem = 'Recurso nao encontrado.', codigo = 'NAO_ENCONTRADO') {
    super(mensagem, { status: 404, codigo });
  }
}

export class Conflito extends ErroApp {
  constructor(mensagem: string, codigo = 'CONFLITO', opcoes: Omit<OpcoesErro, 'status' | 'codigo'> = {}) {
    super(mensagem, { ...opcoes, status: 409, codigo });
  }
}

export class RequisicaoInvalida extends ErroApp {
  constructor(mensagem: string, codigo = 'REQUISICAO_INVALIDA', opcoes: Omit<OpcoesErro, 'status' | 'codigo'> = {}) {
    super(mensagem, { ...opcoes, status: 400, codigo });
  }
}
