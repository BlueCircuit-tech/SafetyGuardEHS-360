import { Link } from 'react-router-dom';
import { Icone } from '../componentes/Icone';
import { TemaDetalhe, useNavegacaoVisivel } from '../componentes/MapaNavegacao';
import { RELATORIOS, temaPorSlug, FLUXO, PERFIS_USO, BARRA } from '../lib/navegacao';

/**
 * Hubs da barra lateral: Indicadores, Relatórios, Configurações e Ajuda.
 *
 * Nenhum deles tem dado próprio — são portas de entrada que reorganizam as
 * telas existentes pela pergunta que o usuário tem em mente.
 */

export function IndicadoresHubPage() {
  const tema = temaPorSlug('indicadores');
  if (!tema) return null;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Indicadores e Dashboards</h2>
          <p>Do operacional ao estratégico. Cada painel responde a uma pergunta diferente sobre a mesma operação.</p>
        </div>
      </div>
      <TemaDetalhe tema={tema} />
    </>
  );
}

export function ConfiguracoesHubPage() {
  const empresas = temaPorSlug('empresas');
  const administracao = temaPorSlug('administracao');
  if (!empresas || !administracao) return null;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Configurações</h2>
          <p>A estrutura do negócio e a administração da plataforma: clientes, terceiros, áreas, usuários e parâmetros.</p>
        </div>
      </div>
      <TemaDetalhe tema={empresas} />
      <TemaDetalhe tema={administracao} />
    </>
  );
}

export function RelatoriosHubPage() {
  const { itemVisivel } = useNavegacaoVisivel();
  const itens = RELATORIOS.filter(itemVisivel);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Relatórios e documentos</h2>
          <p>
            O que o sistema gera pronto para apresentar, imprimir ou enviar. Cada item abre a tela de origem, onde o
            relatório é montado com os filtros do momento.
          </p>
        </div>
      </div>

      <div className="hub-lista">
        {itens.map((item) => (
          <Link key={item.titulo} to={item.rota ?? '#'} className="painel hub-item">
            <span className="hub-item-icone" aria-hidden="true">
              <Icone nome="documento" tamanho={18} />
            </span>
            <span>
              <strong>{item.titulo}</strong>
              <small>{item.descricao}</small>
            </span>
            <Icone nome="seta" tamanho={14} />
          </Link>
        ))}
      </div>
    </>
  );
}

export function AjudaPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h2>Como usar o sistema</h2>
          <p>Um guia curto: por onde começar, como a navegação está organizada e o que cada perfil costuma usar.</p>
        </div>
      </div>

      <div className="grid2">
        <div className="painel">
          <h3>
            <Icone nome="bussola" tamanho={16} /> Navegação
          </h3>
          <p className="ajuda-texto">
            A barra lateral tem sete entradas. Tudo o que o sistema faz está organizado em nove temas, acessíveis por
            Início ou por Módulos.
          </p>
          <ul className="ajuda-lista">
            {BARRA.map((item) => (
              <li key={item.rota}>
                <Icone nome={item.icone} tamanho={15} />
                <span>
                  <Link to={item.rota}>{item.titulo}</Link>
                  <small>{DESCRICAO_BARRA[item.titulo]}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="painel">
          <h3>
            <Icone nome="pessoas" tamanho={16} /> Acesso por perfil
          </h3>
          <p className="ajuda-texto">
            O que aparece no menu depende das permissões do seu perfil. Se uma tela que você precisa não está visível,
            fale com um administrador.
          </p>
          <ul className="ajuda-lista">
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
        </div>
      </div>

      <div className="painel">
        <h3>
          <Icone nome="raio" tamanho={16} /> Fluxo do sistema
        </h3>
        <p className="ajuda-texto">Do dia a dia à estratégia, com tudo conectado. Cada etapa alimenta a seguinte.</p>
        <ol className="fluxo-lista">
          {FLUXO.map((passo) => (
            <li key={passo.etapa} style={{ background: passo.cor }}>
              <Icone nome={passo.icone} tamanho={14} />
              {passo.etapa}
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

const DESCRICAO_BARRA: Record<string, string> = {
  Início: 'O mapa completo, com os nove temas e o fluxo do sistema.',
  Módulos: 'Abre o painel com todas as telas, agrupadas por tema.',
  Indicadores: 'Dashboards operacional, gerencial, executivo, inteligência e financeiro.',
  Relatórios: 'O que o sistema gera pronto para apresentar ou imprimir.',
  Notificações: 'Alertas enviados e regras de escalonamento automático.',
  Configurações: 'Clientes, terceiros, áreas, usuários e parâmetros.',
  Ajuda: 'Esta página.',
};
