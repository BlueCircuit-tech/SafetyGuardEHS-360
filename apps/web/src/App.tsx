import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Icone } from './componentes/Icone';
import type { ReactNode } from 'react';
import type { Permissao } from '@safetyguard/shared';
import { Layout } from './componentes/Layout';
import { ProvedorToast } from './componentes/Toast';
import { ProvedorSessao, useSessao } from './lib/sessao';
import { LoginPage } from './paginas/LoginPage';
import { EmpresaPage } from './paginas/EmpresaPage';
import { ClientesPage } from './paginas/ClientesPage';
import { ClienteFormPage } from './paginas/ClienteFormPage';
import { TerceirosPage } from './paginas/TerceirosPage';
import { TerceiroFormPage } from './paginas/TerceiroFormPage';
import { CentrosNegocioPage } from './paginas/CentrosNegocioPage';
import { CentroNegocioFormPage } from './paginas/CentroNegocioFormPage';
import { AreasPage } from './paginas/AreasPage';
import { AreaFormPage } from './paginas/AreaFormPage';
import { LeituraQrPage } from './paginas/LeituraQrPage';
import { ObservacoesPage } from './paginas/ObservacoesPage';
import { ObservacaoFormPage } from './paginas/ObservacaoFormPage';
import { DashboardBbsPage } from './paginas/DashboardBbsPage';
import { PlanosAcaoPage } from './paginas/PlanosAcaoPage';
import { PlanoAcaoFormPage } from './paginas/PlanoAcaoFormPage';
import { ComunicacaoPage } from './paginas/ComunicacaoPage';
import { UsuariosPage } from './paginas/UsuariosPage';
import { ColaboradoresPage } from './paginas/ColaboradoresPage';
import { ColaboradorFormPage } from './paginas/ColaboradorFormPage';
import { DocumentosPage } from './paginas/DocumentosPage';
import { DocumentoFormPage } from './paginas/DocumentoFormPage';
import { ConformidadePage } from './paginas/ConformidadePage';
import { DashboardExecutivoPage } from './paginas/DashboardExecutivoPage';
import { DashboardGerencialPage } from './paginas/DashboardGerencialPage';
import { DashboardOperacionalPage } from './paginas/DashboardOperacionalPage';

/**
 * Exige sessão válida — e, opcionalmente, uma permissão.
 *
 * É conveniência de navegação, não segurança: quem decide é a API. Quem forçar
 * a URL vê a tela, mas as requisições voltam 403.
 */
function Protegido({ permissao, children }: { permissao?: Permissao; children: ReactNode }) {
  const { usuario, carregando, pode } = useSessao();
  const { pathname } = useLocation();

  if (carregando) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
        Verificando sessão...
      </div>
    );
  }

  if (!usuario) return <Navigate to="/entrar" replace state={{ de: pathname }} />;

  if (permissao && !pode(permissao)) {
    return (
      <div className="painel">
        <div className="vazio">
          <div className="icone-vazio" aria-hidden="true">
              <Icone nome="cadeado" tamanho={22} />
            </div>
          <h4>Sem permissão</h4>
          <p>
            O perfil <b>{usuario.perfil}</b> não tem acesso a esta tela. Fale com um administrador se precisar dela.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/** Já autenticado não fica preso na tela de login. */
function SomenteVisitante({ children }: { children: ReactNode }) {
  const { usuario, carregando } = useSessao();

  if (carregando) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
        Verificando sessão...
      </div>
    );
  }

  return usuario ? <Navigate to="/empresa" replace /> : <>{children}</>;
}

/** Reduz o ruído das rotas: `rota('clientes', 'cadastros:ler', <ClientesPage />)`. */
function rota(caminho: string, permissao: Permissao, elemento: ReactNode) {
  return <Route key={caminho} path={caminho} element={<Protegido permissao={permissao}>{elemento}</Protegido>} />;
}

export function App() {
  return (
    <ProvedorToast>
      <BrowserRouter>
        <ProvedorSessao>
          <Routes>
            <Route
              path="/entrar"
              element={
                <SomenteVisitante>
                  <LoginPage />
                </SomenteVisitante>
              }
            />

            {/* A tela de campo do QR Code é pública: o token é a credencial. */}
            <Route path="/inspecao/:token" element={<LeituraQrPage />} />

            <Route element={<Layout />}>
              <Route index element={<Navigate to="/empresa" replace />} />

              {rota('empresa', 'cadastros:ler', <EmpresaPage />)}

              {rota('clientes', 'cadastros:ler', <ClientesPage />)}
              {rota('clientes/novo', 'cadastros:escrever', <ClienteFormPage />)}
              {rota('clientes/:id', 'cadastros:ler', <ClienteFormPage />)}

              {rota('terceiros', 'cadastros:ler', <TerceirosPage />)}
              {rota('terceiros/novo', 'cadastros:escrever', <TerceiroFormPage />)}
              {rota('terceiros/:id', 'cadastros:ler', <TerceiroFormPage />)}

              {rota('centros-negocio', 'cadastros:ler', <CentrosNegocioPage />)}
              {rota('centros-negocio/novo', 'cadastros:escrever', <CentroNegocioFormPage />)}
              {rota('centros-negocio/:id', 'cadastros:ler', <CentroNegocioFormPage />)}

              {rota('areas', 'cadastros:ler', <AreasPage />)}
              {rota('areas/nova', 'cadastros:escrever', <AreaFormPage />)}
              {rota('areas/:id', 'cadastros:ler', <AreaFormPage />)}

              {rota('observacoes', 'observacoes:ler', <ObservacoesPage />)}
              {rota('observacoes/nova', 'observacoes:escrever', <ObservacaoFormPage />)}
              {rota('observacoes/:id', 'observacoes:ler', <ObservacaoFormPage />)}

              {rota('planos-acao', 'planos:ler', <PlanosAcaoPage />)}
              {rota('planos-acao/novo', 'planos:escrever', <PlanoAcaoFormPage />)}
              {rota('planos-acao/:id', 'planos:ler', <PlanoAcaoFormPage />)}

              {rota('colaboradores', 'saude:ler', <ColaboradoresPage />)}
              {rota('colaboradores/novo', 'saude:escrever', <ColaboradorFormPage />)}
              {rota('colaboradores/:id', 'saude:ler', <ColaboradorFormPage />)}

              {rota('documentos', 'saude:ler', <DocumentosPage />)}
              {rota('documentos/novo', 'saude:escrever', <DocumentoFormPage />)}
              {rota('documentos/:id', 'saude:ler', <DocumentoFormPage />)}

              {rota('conformidade', 'indicadores:ler', <ConformidadePage />)}

              {rota('dashboard-executivo', 'indicadores:ler', <DashboardExecutivoPage />)}
              {rota('dashboard-gerencial', 'indicadores:ler', <DashboardGerencialPage />)}
              {rota('dashboard-operacional', 'planos:ler', <DashboardOperacionalPage />)}

              {rota('dashboard-bbs', 'indicadores:ler', <DashboardBbsPage />)}
              {rota('comunicacao', 'planos:ler', <ComunicacaoPage />)}
              {rota('usuarios', 'usuarios:gerenciar', <UsuariosPage />)}

              <Route path="*" element={<Navigate to="/empresa" replace />} />
            </Route>
          </Routes>
        </ProvedorSessao>
      </BrowserRouter>
    </ProvedorToast>
  );
}
