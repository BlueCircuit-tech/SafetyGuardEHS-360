import { Link } from 'react-router-dom';
import { Icone } from '../componentes/Icone';
import { Marca } from '../componentes/Marca';
import { GradeTemas } from '../componentes/MapaNavegacao';
import { useSessao } from '../lib/sessao';
import { FLUXO, PERFIS_USO } from '../lib/navegacao';

/**
 * Início — o mapa de navegação.
 *
 * Tudo o que o sistema faz em uma tela: os nove temas com os seus sub-itens,
 * o fluxo do dia a dia à estratégia e os perfis de uso. É a porta de entrada
 * depois do login e o lugar para onde "Módulos" leva.
 */
export function InicioPage() {
  const { usuario } = useSessao();
  const primeiroNome = usuario?.nome.split(' ')[0] ?? '';

  return (
    <div className="inicio">
      <header className="inicio-hero">
        <div className="inicio-hero-marca">
          <Marca tamanho={56} />
          <div>
            <small>Sistema de Gestão de</small>
            <h1>Segurança e Saúde no Trabalho</h1>
            <div className="inicio-hero-mote">
              <span>Mais prevenção</span>
              <span>Mais pessoas seguras</span>
              <span>Mais resultados</span>
            </div>
          </div>
        </div>

        <div className="inicio-hero-texto">
          <h2>Mapa de navegação</h2>
          <p>
            {primeiroNome ? `${primeiroNome}, tudo` : 'Tudo'} o que você precisa, em um só lugar. Organizado por temas, fácil
            de encontrar, simples de usar.
          </p>
        </div>

        <div className="inicio-hero-selo" aria-hidden="true">
          Prevenir é sempre
          <br />a melhor decisão!
        </div>
      </header>

      <GradeTemas />

      <section className="inicio-rodape">
        <div className="inicio-fluxo" aria-label="Fluxo do sistema">
          <div className="inicio-fluxo-titulo">
            <Icone nome="bussola" tamanho={18} />
            <div>
              <strong>Fluxo do sistema</strong>
              <small>Do dia a dia à estratégia, com tudo conectado.</small>
            </div>
          </div>
          <ol className="fluxo-lista">
            {FLUXO.map((passo) => (
              <li key={passo.etapa} style={{ background: passo.cor }}>
                <Icone nome={passo.icone} tamanho={14} />
                {passo.etapa}
              </li>
            ))}
          </ol>
        </div>

        <div className="inicio-perfis">
          <strong>Acesso por perfil de usuário</strong>
          <ul>
            {PERFIS_USO.map((perfil) => (
              <li key={perfil.titulo}>
                <Icone nome="pessoa" tamanho={15} />
                <span>
                  {perfil.titulo}
                  <small>{perfil.descricao}</small>
                </span>
              </li>
            ))}
          </ul>
          <Link to="/ajuda" className="inicio-perfis-link">
            Como usar o sistema <Icone nome="seta" tamanho={13} />
          </Link>
        </div>
      </section>

      <p className="inicio-lema">SST é um compromisso de todos.</p>
    </div>
  );
}
