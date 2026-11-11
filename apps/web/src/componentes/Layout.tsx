import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icone } from './Icone';
import { Marca } from './Marca';
import { useNavegacaoVisivel } from './MapaNavegacao';
import { APP_NOME } from '@safetyguard/shared';
import { useSessao } from '../lib/sessao';
import { api } from '../lib/api';
import { BARRA, tituloDaRota } from '../lib/navegacao';

/**
 * Casca da aplicação.
 *
 * Barra lateral enxuta com sete entradas; "Módulos" abre um painel lateral
 * com todas as telas agrupadas nos nove temas, para que nenhuma fique a mais
 * de dois cliques. A topbar mostra o tema da tela atual, na cor do tema.
 */

const INTERVALO_NOTIFICACOES_MS = 5 * 60 * 1000;

function useContadorNotificacoes() {
  const { usuario, pode } = useSessao();
  const [criticas, setCriticas] = useState(0);
  const autorizado = Boolean(usuario) && pode('planos:ler');

  useEffect(() => {
    if (!autorizado) {
      setCriticas(0);
      return;
    }

    let ativo = true;
    const carregar = () => {
      api
        .get<{ criticas: number }>('/notificacoes/resumo')
        .then((resumo) => {
          if (ativo) setCriticas(resumo.criticas);
        })
        .catch(() => {
          /* O contador é conveniência: sem resposta, fica em zero. */
        });
    };

    carregar();
    const timer = window.setInterval(carregar, INTERVALO_NOTIFICACOES_MS);
    return () => {
      ativo = false;
      window.clearInterval(timer);
    };
  }, [autorizado]);

  return criticas;
}

function PainelModulos({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const { temasVisiveis, blocosVisiveis } = useNavegacaoVisivel();
  const painelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar();
    };
    const aoClicarFora = (evento: MouseEvent) => {
      const alvo = evento.target as Node;
      if (painelRef.current && !painelRef.current.contains(alvo) && !(alvo as Element).closest?.('.rail-item.modulos')) {
        aoFechar();
      }
    };

    document.addEventListener('keydown', aoTeclar);
    document.addEventListener('mousedown', aoClicarFora);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('mousedown', aoClicarFora);
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div className="painel-modulos" ref={painelRef} role="dialog" aria-label="Módulos do sistema">
      <div className="painel-modulos-cabeca">
        <strong>Módulos</strong>
        <Link to="/modulos" onClick={aoFechar}>
          Ver mapa completo <Icone nome="seta" tamanho={13} />
        </Link>
        <button type="button" className="btn btn-ghost btn-sm" onClick={aoFechar} aria-label="Fechar">
          ✕
        </button>
      </div>

      <div className="painel-modulos-grade">
        {temasVisiveis.map((tema) => (
          <div key={tema.slug} className="painel-modulos-tema" style={{ '--tema': tema.cor } as CSSProperties}>
            <Link to={`/modulos/${tema.slug}`} className="painel-modulos-titulo" onClick={aoFechar}>
              <span className="mapa-tema-numero">{tema.numero}</span>
              {tema.titulo}
            </Link>
            <ul>
              {blocosVisiveis(tema)
                .flatMap((bloco) => bloco.itens)
                .filter((item) => item.rota)
                .filter((item, indice, lista) => lista.findIndex((outro) => outro.rota === item.rota) === indice)
                .map((item) => (
                  <li key={item.rota}>
                    <NavLink to={item.rota!} onClick={aoFechar} className={({ isActive }) => (isActive ? 'ativa' : '')}>
                      {item.titulo}
                    </NavLink>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Barra de retorno, sempre visivel sob a topbar.
 *
 * Pedido recorrente da operacao: um botao de "voltar" bem destacado em todas
 * as telas, mais um atalho para a pagina inicial. "Voltar" usa o historico do
 * navegador; quando nao ha para onde voltar (tela aberta por link direto),
 * leva ao Inicio.
 */
function BarraVoltar({ pathname }: { pathname: string }) {
  const navegar = useNavigate();
  const atual = tituloDaRota(pathname);
  const naTelaInicial = pathname === '/inicio';

  const voltar = () => {
    if (window.history.length > 1) navegar(-1);
    else navegar('/inicio');
  };

  if (naTelaInicial) return null;

  return (
    <div className="barra-voltar" role="navigation" aria-label="Voltar">
      <button type="button" className="btn btn-voltar" onClick={voltar}>
        <Icone nome="voltar" tamanho={16} /> Voltar
      </button>
      <Link to="/inicio" className="btn btn-outline btn-sm btn-inicio">
        <Icone nome="bussola" tamanho={14} /> Página inicial
      </Link>
      {atual?.tema ? (
        <Link to={`/modulos/${atual.tema.slug}`} className="btn btn-ghost btn-sm">
          {atual.tema.numero}. {atual.tema.titulo}
        </Link>
      ) : null}
    </div>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const { usuario, sair } = useSessao();
  const [painelAberto, setPainelAberto] = useState(false);
  const criticas = useContadorNotificacoes();

  useEffect(() => {
    setPainelAberto(false);
  }, [pathname]);

  const atual = tituloDaRota(pathname);
  const secaoAtual = atual?.secao ?? '';
  const tituloAtual = atual?.titulo ?? 'SafetyGuard EHS 360';
  const corAtual = atual?.cor ?? 'var(--primary)';

  const iniciais = (usuario?.nome ?? '')
    .split(' ')
    .slice(0, 2)
    .map((parte) => parte[0] ?? '')
    .join('')
    .toUpperCase();

  return (
    <div className="shell">
      <aside className="rail">
        <Link to="/inicio" className="rail-brand">
          <Marca tamanho={36} />
          <span>
            <span className="t">SafetyGuard</span>
            <small>EHS 360 · SSMA</small>
          </span>
        </Link>

        <nav aria-label="Navegação principal">
          {BARRA.map((item) => {
            if (item.painel) {
              const ativo = painelAberto || pathname.startsWith('/modulos');
              return (
                <button
                  key={item.rota}
                  type="button"
                  className={`rail-item modulos ${ativo ? 'ativa' : ''}`}
                  onClick={() => setPainelAberto((aberto) => !aberto)}
                  aria-expanded={painelAberto}
                >
                  <Icone nome={item.icone} tamanho={18} />
                  <span>{item.titulo}</span>
                </button>
              );
            }

            return (
              <NavLink key={item.rota} to={item.rota} className={({ isActive }) => `rail-item ${isActive ? 'ativa' : ''}`}>
                <Icone nome={item.icone} tamanho={18} />
                <span>{item.titulo}</span>
                {item.rota === '/comunicacao' && criticas > 0 && (
                  <span className="rail-badge" aria-label={`${criticas} alertas críticos`}>
                    {criticas > 99 ? '99+' : criticas}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="rail-foot">
          {APP_NOME}
          <br />
          SST é um compromisso de todos.
        </div>
      </aside>

      <PainelModulos aberto={painelAberto} aoFechar={() => setPainelAberto(false)} />

      <div className="main">
        <div className="topbar" style={{ '--tema': corAtual } as CSSProperties}>
          {secaoAtual && <span className="lbl tema">{secaoAtual}</span>}
          <strong className="titulo-doc">{tituloAtual}</strong>
          <div className="user">
            <div style={{ textAlign: 'right' }}>
              <div>{usuario?.nome ?? '—'}</div>
              <small style={{ display: 'block', fontWeight: 400, color: 'var(--gray)', fontSize: 11 }}>
                {usuario?.cargo || usuario?.perfil}
              </small>
            </div>
            <div className="av" aria-hidden="true">
              {iniciais}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={sair}>
              Sair
            </button>
          </div>
        </div>

        <div className="content">
          <BarraVoltar pathname={pathname} />
          <Outlet />
        </div>
      </div>
    </div>
  );
}
