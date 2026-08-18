import { useRef, useState, type FormEvent } from 'react';
import { APP_NOME } from '@safetyguard/shared';
import { Icone } from '../componentes/Icone';
import { Marca } from '../componentes/Marca';
import { ErroApi } from '../lib/api';
import { useSessao } from '../lib/sessao';

/**
 * Tela de entrada.
 *
 * Metade esquerda: fotografia da operação sob um véu escuro, com a marca e uma
 * única linha. Metade direita: o formulário, sozinho. Nada de lista de
 * funcionalidades — quem chega aqui já sabe o que veio fazer, e material de
 * venda numa tela de acesso é o que mais faz um produto parecer amador.
 *
 * A foto vem de `public/login.jpg`. Sem ela, o espaço cai para um fundo
 * grafite neutro e a tela continua íntegra (veja `public/LEIA-ME.md`).
 *
 * Abaixo de 900px a metade da foto sai: em campo, o que importa é entrar.
 */
export function LoginPage() {
  const { entrar } = useSessao();
  const campoEmail = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      await entrar(email, senha);
    } catch (falha) {
      setErro(
        falha instanceof ErroApi
          ? falha.message
          : 'Não foi possível falar com o servidor. Verifique se a API está no ar.',
      );
      // Credencial recusada devolve o foco ao começo, sem apagar o e-mail.
      campoEmail.current?.focus();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tela-login">
      {/* --------------------------------------------------------- fotografia */}
      <section className="login-imagem" aria-hidden="true">
        <div className="login-imagem-conteudo">
          <div className="login-marca">
            <Marca tamanho={42} />
            <div>
              <div className="login-produto">{APP_NOME}</div>
              <div className="login-assinatura">Segurança · Saúde · Meio Ambiente</div>
            </div>
          </div>

          <p className="login-frase">
            O que é observado em campo vira <b>indicador, plano de ação e prova de auditoria</b>.
          </p>

          <p className="login-imagem-rodape">
            Toda alteração fica registrada em trilha de auditoria, com autor, data e valor anterior.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------- acesso */}
      <section className="login-acesso">
        <form className="login-form" onSubmit={aoEnviar} noValidate>
          {/* No celular a foto sai, então a marca reaparece aqui. */}
          <div className="login-marca login-marca-compacta">
            <Marca tamanho={40} />
            <div>
              <div className="login-produto">{APP_NOME}</div>
              <div className="login-assinatura">Segurança · Saúde · Meio Ambiente</div>
            </div>
          </div>

          <h1 className="login-titulo">Entrar</h1>
          <p className="login-subtitulo">Use as credenciais fornecidas pelo administrador da plataforma.</p>

          {erro ? (
            <div className="login-erro" role="alert">
              <Icone nome="alerta" tamanho={15} />
              <span>{erro}</span>
            </div>
          ) : null}

          <div className="campo">
            <label htmlFor="login-email">E-mail</label>
            <input
              id="login-email"
              ref={campoEmail}
              type="email"
              inputMode="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              aria-invalid={erro ? true : undefined}
              placeholder="voce@empresa.com.br"
              required
            />
          </div>

          <div className="campo">
            <label htmlFor="login-senha">Senha</label>
            <div className="campo-senha">
              <input
                id="login-senha"
                type={mostrarSenha ? 'text' : 'password'}
                autoComplete="current-password"
                value={senha}
                onChange={(evento) => setSenha(evento.target.value)}
                aria-invalid={erro ? true : undefined}
                required
              />
              <button
                type="button"
                className="botao-olho"
                onClick={() => setMostrarSenha((atual) => !atual)}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={mostrarSenha}
                tabIndex={-1}
              >
                <Icone nome={mostrarSenha ? 'bloqueado' : 'olho'} tamanho={17} />
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-entrar" disabled={enviando}>
            {enviando ? (
              <>
                <span className="spinner spinner-botao" aria-hidden="true" />
                Entrando...
              </>
            ) : (
              'Entrar'
            )}
          </button>

          <p className="login-nota">
            Esqueceu a senha? Um administrador redefine em <b>Pessoas e Acessos</b>.
          </p>
        </form>
      </section>
    </div>
  );
}
