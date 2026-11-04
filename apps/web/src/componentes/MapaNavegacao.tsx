import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Icone } from './Icone';
import { useSessao } from '../lib/sessao';
import { TEMAS, type BlocoNav, type LinkNav, type TemaNav } from '../lib/navegacao';

/**
 * Mapa de navegação por temas.
 *
 * `CartaoTema` é o bloco compacto da tela Início e da grade de módulos;
 * `TemaDetalhe` abre o mesmo tema em painéis maiores. Os dois lêem a sessão
 * para esconder o que o perfil não pode ver — e, quando um tema fica sem
 * nenhum link visível, ele some por inteiro.
 */

export function useNavegacaoVisivel() {
  const { pode } = useSessao();

  const itemVisivel = (item: LinkNav) => !item.permissao || pode(item.permissao);

  const blocosVisiveis = (tema: TemaNav): BlocoNav[] =>
    tema.blocos
      .map((bloco) => ({ ...bloco, itens: bloco.itens.filter(itemVisivel) }))
      .filter((bloco) => bloco.itens.length > 0);

  const temaVisivel = (tema: TemaNav) => blocosVisiveis(tema).some((bloco) => bloco.itens.some((item) => item.rota));

  return {
    itemVisivel,
    blocosVisiveis,
    temasVisiveis: TEMAS.filter(temaVisivel),
  };
}

function estiloTema(tema: TemaNav): CSSProperties {
  return { '--tema': tema.cor } as CSSProperties;
}

function LinkItem({ item, compacto }: { item: LinkNav; compacto?: boolean }) {
  if (!item.rota) {
    return (
      <li className="mapa-link em-breve" title="Recurso previsto, ainda sem tela própria">
        <span>{item.titulo}</span>
        <small>em breve</small>
      </li>
    );
  }

  return (
    <li className="mapa-link">
      <Link to={item.rota}>
        <span>{item.titulo}</span>
        {!compacto && item.descricao && <small>{item.descricao}</small>}
      </Link>
    </li>
  );
}

export function CartaoTema({ tema }: { tema: TemaNav }) {
  const { blocosVisiveis } = useNavegacaoVisivel();
  const blocos = blocosVisiveis(tema);

  return (
    <section className="mapa-tema" style={estiloTema(tema)} aria-labelledby={`tema-${tema.slug}`}>
      <Link to={`/modulos/${tema.slug}`} className="mapa-tema-cabeca">
        <span className="mapa-tema-numero">{tema.numero}</span>
        <span className="mapa-tema-icone" aria-hidden="true">
          <Icone nome={tema.icone} tamanho={20} />
        </span>
        <span className="mapa-tema-titulos">
          <strong id={`tema-${tema.slug}`}>{tema.titulo}</strong>
          <small>{tema.subtitulo}</small>
        </span>
        <Icone nome="seta" tamanho={14} />
      </Link>

      <div className="mapa-tema-corpo">
        {blocos.map((bloco) => (
          <div key={bloco.titulo} className="mapa-bloco">
            <div className="mapa-bloco-titulo">
              <Icone nome={bloco.icone} tamanho={15} />
              {bloco.titulo}
            </div>
            <ul>
              {bloco.itens.map((item) => (
                <LinkItem key={`${item.titulo}-${item.rota ?? ''}`} item={item} compacto />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export function TemaDetalhe({ tema }: { tema: TemaNav }) {
  const { blocosVisiveis } = useNavegacaoVisivel();
  const blocos = blocosVisiveis(tema);

  return (
    <div className="tema-detalhe" style={estiloTema(tema)}>
      <div className="tema-detalhe-cabeca">
        <span className="mapa-tema-numero">{tema.numero}</span>
        <span className="mapa-tema-icone" aria-hidden="true">
          <Icone nome={tema.icone} tamanho={24} />
        </span>
        <div>
          <h2>{tema.titulo}</h2>
          <p>{tema.subtitulo}</p>
        </div>
      </div>

      <div className="tema-detalhe-grade">
        {blocos.map((bloco) => (
          <div key={bloco.titulo} className="painel tema-detalhe-bloco">
            <h3>
              <Icone nome={bloco.icone} tamanho={16} />
              {bloco.titulo}
            </h3>
            <ul>
              {bloco.itens.map((item) => (
                <LinkItem key={`${item.titulo}-${item.rota ?? ''}`} item={item} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Grade com todos os temas visíveis para o perfil. */
export function GradeTemas() {
  const { temasVisiveis } = useNavegacaoVisivel();

  return (
    <div className="mapa-grade">
      {temasVisiveis.map((tema) => (
        <CartaoTema key={tema.slug} tema={tema} />
      ))}
    </div>
  );
}
