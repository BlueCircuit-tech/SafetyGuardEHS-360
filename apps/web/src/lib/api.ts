/** Cliente HTTP da API do SafetyGuard EHS 360. */

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3333').replace(/\/$/, '');
const BASE = `${API_URL}/api/v1`;

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
        // Sem modulo de autenticacao ainda: identifica o autor na auditoria.
        'x-usuario': 'console-web',
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
