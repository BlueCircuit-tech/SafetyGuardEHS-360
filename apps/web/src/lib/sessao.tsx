import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Permissao, UsuarioSessao } from '@safetyguard/shared';
import { api, definirToken, lerTokenSalvo, registrarAoExpirar } from './api';

/**
 * Sessão do usuário.
 *
 * O token fica no `localStorage` e é reenviado a cada requisição pelo cliente
 * HTTP. Perfil e permissões vêm do servidor a cada carregamento — o front usa
 * a permissão só para esconder o que não interessa; **quem decide é a API**.
 */

interface ContextoSessao {
  usuario: UsuarioSessao | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => void;
  pode: (permissao: Permissao) => boolean;
}

const Contexto = createContext<ContextoSessao | null>(null);

interface RespostaLogin {
  token: string;
  usuario: UsuarioSessao;
}

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(null);
  const [carregando, setCarregando] = useState(true);

  const sair = useCallback(() => {
    definirToken(null);
    setUsuario(null);
  }, []);

  // Token expirado ou revogado durante o uso derruba a sessão na hora.
  useEffect(() => registrarAoExpirar(() => setUsuario(null)), []);

  // Retoma a sessão de um token já salvo, se ainda for válido.
  useEffect(() => {
    let ativo = true;

    async function retomar() {
      if (!lerTokenSalvo()) {
        setCarregando(false);
        return;
      }

      try {
        const atual = await api.get<UsuarioSessao>('/auth/eu');
        if (ativo) setUsuario(atual);
      } catch {
        definirToken(null);
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    void retomar();
    return () => {
      ativo = false;
    };
  }, []);

  const entrar = useCallback(async (email: string, senha: string) => {
    const resposta = await api.post<RespostaLogin>('/auth/login', { email, senha });
    definirToken(resposta.token);
    setUsuario(resposta.usuario);
  }, []);

  const valor = useMemo<ContextoSessao>(
    () => ({
      usuario,
      carregando,
      entrar,
      sair,
      pode: (permissao) => Boolean(usuario?.permissoes.includes(permissao)),
    }),
    [usuario, carregando, entrar, sair],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): ContextoSessao {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSessao precisa estar dentro de <ProvedorSessao>.');
  return contexto;
}
