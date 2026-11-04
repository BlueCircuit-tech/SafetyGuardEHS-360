import { Link, Navigate, useParams } from 'react-router-dom';
import { Icone } from '../componentes/Icone';
import { GradeTemas, TemaDetalhe, useNavegacaoVisivel } from '../componentes/MapaNavegacao';
import { temaPorSlug } from '../lib/navegacao';

/** Grade com os nove temas. */
export function ModulosPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h2>Módulos</h2>
          <p>Os nove temas do sistema. Abra um tema para ver tudo o que ele reúne, ou vá direto a uma tela pelo link.</p>
        </div>
      </div>
      <GradeTemas />
    </>
  );
}

/** Um tema aberto, com os seus blocos em painéis. */
export function ModuloPage() {
  const { slug } = useParams();
  const tema = temaPorSlug(slug);
  const { temasVisiveis } = useNavegacaoVisivel();

  if (!tema) return <Navigate to="/modulos" replace />;

  const indice = temasVisiveis.findIndex((t) => t.slug === tema.slug);
  const anterior = indice > 0 ? temasVisiveis[indice - 1] : null;
  const proximo = indice >= 0 && indice < temasVisiveis.length - 1 ? temasVisiveis[indice + 1] : null;

  return (
    <>
      <nav className="tema-navegacao" aria-label="Outros temas">
        <Link to="/modulos" className="btn btn-ghost btn-sm">
          <Icone nome="voltar" tamanho={14} /> Todos os módulos
        </Link>
        <span className="tema-navegacao-vizinhos">
          {anterior && (
            <Link to={`/modulos/${anterior.slug}`} className="btn btn-ghost btn-sm">
              <Icone nome="voltar" tamanho={13} /> {anterior.numero}. {anterior.titulo}
            </Link>
          )}
          {proximo && (
            <Link to={`/modulos/${proximo.slug}`} className="btn btn-ghost btn-sm">
              {proximo.numero}. {proximo.titulo} <Icone nome="seta" tamanho={13} />
            </Link>
          )}
        </span>
      </nav>
      <TemaDetalhe tema={tema} />
    </>
  );
}
