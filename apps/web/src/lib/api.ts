/** Cliente HTTP da API do SafetyGuard EHS 360. */

const emLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname.startsWith('localhost') || window.location.hostname.startsWith('127.0.0.1'));

/*
 * Em producao o front e a API vivem no mesmo dominio, entao base vazia
 * (same-origin) e o valor correto.
 *
 * VITE_API_URL so e respeitada quando faz sentido: uma URL de localhost gravada
 * no ambiente de producao — copiada do .env de desenvolvimento, por exemplo — e
 * ignorada, senao o site publicado tentaria falar com a maquina de quem acessa.
 */
function resolverApiUrl(): string {
  const configurada = import.meta.env.VITE_API_URL?.trim();

  if (configurada) {
    const apontaParaLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(configurada);
    if (!apontaParaLocalhost || emLocalhost) return configurada;
  }

  return emLocalhost ? 'http://localhost:3333' : '';
}

export const API_URL = resolverApiUrl().replace(/\/$/, '');
const BASE = `${API_URL}/api/v1`;

/* -------------------------------------------------------------------------- */
/* Sessão                                                                      */
/* -------------------------------------------------------------------------- */

const CHAVE_TOKEN = 'safetyguard.token';

let token: string | null = null;
let aoExpirar: (() => void) | null = null;

/** Lê o token persistido — usado para retomar a sessão no carregamento. */
export function lerTokenSalvo(): string | null {
  if (token) return token;
  try {
    token = window.localStorage.getItem(CHAVE_TOKEN);
  } catch {
    token = null;
  }
  return token;
}

export function definirToken(novo: string | null): void {
  token = novo;
  try {
    if (novo) window.localStorage.setItem(CHAVE_TOKEN, novo);
    else window.localStorage.removeItem(CHAVE_TOKEN);
  } catch {
    // navegador sem storage (aba anônima restrita): a sessão vive só em memória
  }
}

/** Registra o que fazer quando a API devolver 401. Devolve o cancelador. */
export function registrarAoExpirar(callback: () => void): () => void {
  aoExpirar = callback;
  return () => {
    aoExpirar = null;
  };
}

export interface CorpoErro {
  erro: {
    codigo: string;
    mensagem: string;
    campos?: Record<string, string[]>;
    detalhes?: unknown;
  };
}

/** Erro tipado da API — carrega o codigo e as mensagens por campo. */
export class ErroApi extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly campos: Record<string, string[]>;

  constructor(status: number, corpo: CorpoErro | null, fallback = 'Falha na comunicacao com a API.') {
    super(corpo?.erro?.mensagem ?? fallback);
    this.name = 'ErroApi';
    this.status = status;
    this.codigo = corpo?.erro?.codigo ?? 'ERRO_REDE';
    this.campos = corpo?.erro?.campos ?? {};
  }

  /** Mensagem curta para o toast — em erro de validacao, o detalhe fica nos campos. */
  mensagemAmigavel(): string {
    if (this.codigo === 'VALIDACAO') {
      const total = Object.keys(this.campos).length;
      return `Corrija ${total} ${total === 1 ? 'campo destacado' : 'campos destacados'}.`;
    }
    return this.message;
  }
}

async function requisitar<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  let resposta: Response;

  try {
    resposta = await fetch(`${BASE}${caminho}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(lerTokenSalvo() ? { Authorization: `Bearer ${lerTokenSalvo()}` } : {}),
        ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
    });
  } catch {
    throw new ErroApi(0, null, `Nao foi possivel falar com a API em ${API_URL}. Ela esta rodando?`);
  }

  if (resposta.status === 204) return undefined as T;

  const texto = await resposta.text();
  const corpo = texto ? (JSON.parse(texto) as unknown) : null;

  if (!resposta.ok) {
    // Sessão caiu: limpa o token e avisa quem estiver ouvindo, para a
    // aplicação voltar ao login em vez de insistir com um token morto.
    if (resposta.status === 401) {
      definirToken(null);
      aoExpirar?.();
    }
    throw new ErroApi(resposta.status, corpo as CorpoErro | null);
  }

  return corpo as T;
}

export const api = {
  get: <T>(caminho: string) => requisitar<T>(caminho),
  post: <T>(caminho: string, dados: unknown) =>
    requisitar<T>(caminho, { method: 'POST', body: JSON.stringify(dados) }),
  put: <T>(caminho: string, dados: unknown) => requisitar<T>(caminho, { method: 'PUT', body: JSON.stringify(dados) }),
  delete: <T>(caminho: string) => requisitar<T>(caminho, { method: 'DELETE' }),
  upload: <T>(caminho: string, arquivo: File) => {
    const form = new FormData();
    form.append('arquivo', arquivo);
    return requisitar<T>(caminho, { method: 'POST', body: form });
  },
};

/** Resolve caminhos relativos servidos pela API (ex.: /arquivos/logo-x.png). */
export function urlAbsoluta(caminho: string | null | undefined): string | null {
  if (!caminho) return null;
  if (/^https?:\/\//i.test(caminho)) return caminho;
  return `${API_URL}${caminho}`;
}
