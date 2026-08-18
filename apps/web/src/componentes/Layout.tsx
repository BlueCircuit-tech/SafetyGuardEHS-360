import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icone, type NomeIcone } from './Icone';
import { Marca } from './Marca';
import { APP_NOME, type Permissao } from '@safetyguard/shared';
import { useSessao } from '../lib/sessao';

interface ItemNav {
  id: string;
  titulo: string;
  descricao: string;
  rota: string | null;
  /** Icone do item — cada area do produto tem o seu, para leitura rapida. */
  icone: NomeIcone;
  /** Sem esta permissao, o item nem aparece na navegacao. */
  permissao?: Permissao;
}

/**
 * Roteiro de implantacao. Cada etapa liberada vira link; as futuras ficam
 * visiveis para dar contexto de onde o cadastro atual se encaixa.
 */
const ETAPAS: ItemNav[] = [
  { id: '1.1', titulo: 'Empresa de Consultoria', descricao: 'Matriz do sistema', rota: '/empresa', icone: 'predio', permissao: 'cadastros:ler' },
  { id: '2', titulo: 'Clientes / Contratantes', descricao: 'Empresas atendidas', rota: '/clientes', icone: 'fabrica', permissao: 'cadastros:ler' },
  { id: '3', titulo: 'Empresas Contratadas', descricao: 'Terceiros e ranking SSMA', rota: '/terceiros', icone: 'parceria', permissao: 'cadastros:ler' },
  { id: '4', titulo: 'Centros de Negocio', descricao: 'Regionais, unidades e contratos', rota: '/centros-negocio', icone: 'pasta', permissao: 'cadastros:ler' },
  { id: '5', titulo: 'Areas e QR Code', descricao: 'Locais de inspecao', rota: '/areas', icone: 'local', permissao: 'cadastros:ler' },
  { id: '6', titulo: 'Observacoes (BBS)', descricao: 'Registro de campo', rota: '/observacoes', icone: 'olho', permissao: 'observacoes:ler' },
  { id: '7', titulo: 'Planos de Acao', descricao: 'Tratativa e escalonamento', rota: '/planos-acao', icone: 'ok', permissao: 'planos:ler' },
  { id: '8', titulo: 'Pessoas e Acessos', descricao: 'Usuarios e perfis', rota: '/usuarios', icone: 'pessoas', permissao: 'usuarios:gerenciar' },
  { id: '9a', titulo: 'Colaboradores', descricao: 'Pessoas e ASO', rota: '/colaboradores', icone: 'capacete', permissao: 'saude:ler' },
  { id: '9b', titulo: 'Documentos Legais', descricao: 'PGR, PCMSO, LTCAT, PCA, PPR', rota: '/documentos', icone: 'documento', permissao: 'saude:ler' },
  { id: '11', titulo: 'Treinamentos', descricao: 'Matriz de capacitacao e NRs', rota: '/treinamentos', icone: 'premio', permissao: 'saude:ler' },
  { id: '12', titulo: 'Auditorias', descricao: 'ISO 45001, 14001, internas e legais', rota: '/auditorias', icone: 'escudo', permissao: 'cadastros:ler' },
  { id: '13', titulo: 'DDS Digital', descricao: 'Dialogo diario com banco de temas', rota: '/dds', icone: 'mensagem', permissao: 'observacoes:ler' },
  { id: '14', titulo: 'EPI e Estoque', descricao: 'CA, entregas NR-06 e reposicao', rota: '/epis', icone: 'capacete', permissao: 'cadastros:ler' },
  { id: '15', titulo: 'Gestao de Consequencias', descricao: 'Medidas e reincidencia', rota: '/consequencias', icone: 'pessoas', permissao: 'planos:ler' },
  { id: '16', titulo: 'Meio Ambiente e ESG', descricao: 'Ocorrencias e indicadores mensais', rota: '/meio-ambiente', icone: 'mapa', permissao: 'observacoes:ler' },
  { id: '18', titulo: 'Acidentes e CAT', descricao: 'S-2210 e investigacao', rota: '/acidentes', icone: 'alerta', permissao: 'planos:ler' },
  { id: '19', titulo: 'Inventario de Riscos', descricao: 'GRO/PGR e central de risco', rota: '/riscos', icone: 'escudo', permissao: 'cadastros:ler' },
  { id: '10', titulo: 'Dashboards', descricao: 'Executivo, gerencial e operacional', rota: '/dashboard-executivo', icone: 'painel', permissao: 'indicadores:ler' },
];

const INDICADORES: ItemNav[] = [
  {
    id: 'inteligencia',
    titulo: 'Intelligence',
    descricao: 'Leituras automaticas dos dados',
    rota: '/inteligencia',
    icone: 'raio',
    permissao: 'indicadores:ler',
  },
  {
    id: 'executivo',
    icone: 'alvo',
    titulo: 'Executivo',
    descricao: 'Indice Global e ranking',
    rota: '/dashboard-executivo',
    permissao: 'indicadores:ler',
  },
  {
    id: 'gerencial',
    icone: 'lupa',
    titulo: 'Gerencial',
    descricao: 'Causa raiz e area critica',
    rota: '/dashboard-gerencial',
    permissao: 'indicadores:ler',
  },
  {
    id: 'operacional',
    icone: 'bussola',
    titulo: 'Operacional',
    descricao: 'A fila de hoje',
    rota: '/dashboard-operacional',
    permissao: 'planos:ler',
  },
  {
    id: 'bbs',
    icone: 'grafico',
    titulo: 'Dashboard BBS',
    descricao: 'Comportamento x condicao',
    rota: '/dashboard-bbs',
    permissao: 'indicadores:ler',
  },
  {
    id: 'conformidade',
    icone: 'saude',
    titulo: 'Conformidade Legal',
    descricao: 'ASO e documentos vigentes',
    rota: '/conformidade',
    permissao: 'indicadores:ler',
  },
  {
    id: 'comunicacao',
    icone: 'envelope',
    titulo: 'Comunicacao',
    descricao: 'Alertas e escalonamento',
    rota: '/comunicacao',
    permissao: 'planos:ler',
  },
];

const TITULOS: Array<{ prefixo: string; etapa: string; titulo: string }> = [
  { prefixo: '/empresa', etapa: 'Etapa 1.1', titulo: 'Empresa de Consultoria — matriz do sistema' },
  { prefixo: '/clientes', etapa: 'Etapa 2', titulo: 'Clientes / Contratantes' },
  { prefixo: '/terceiros', etapa: 'Etapa 3', titulo: 'Empresas Contratadas / Terceiros' },
  { prefixo: '/centros-negocio', etapa: 'Etapa 4', titulo: 'Centros de Negocio / Unidades' },
  { prefixo: '/areas', etapa: 'Etapa 5', titulo: 'Areas e QR Code' },
  { prefixo: '/observacoes', etapa: 'Etapa 6', titulo: 'Observacoes de campo (BBS)' },
  { prefixo: '/planos-acao', etapa: 'Etapa 7', titulo: 'Planos de Acao' },
  { prefixo: '/usuarios', etapa: 'Etapa 8', titulo: 'Pessoas e Acessos' },
  { prefixo: '/colaboradores', etapa: 'Etapa 9', titulo: 'Colaboradores e ASO' },
  { prefixo: '/documentos', etapa: 'Etapa 9', titulo: 'Documentos Legais SSMA' },
  { prefixo: '/conformidade', etapa: 'Indicadores', titulo: 'Conformidade Legal' },
  { prefixo: '/treinamentos', etapa: 'Etapa 11', titulo: 'Treinamentos e Matriz de Capacitacao' },
  { prefixo: '/auditorias', etapa: 'Etapa 12', titulo: 'Auditorias' },
  { prefixo: '/dds', etapa: 'Etapa 13', titulo: 'DDS — Dialogo Diario de Seguranca' },
  { prefixo: '/epis', etapa: 'Etapa 14', titulo: 'EPI e Estoque' },
  { prefixo: '/consequencias', etapa: 'Etapa 15', titulo: 'Gestao de Consequencias' },
  { prefixo: '/meio-ambiente', etapa: 'Etapa 16', titulo: 'Meio Ambiente e ESG' },
  { prefixo: '/inteligencia', etapa: 'Etapa 17', titulo: 'SafetyGuard Intelligence' },
  { prefixo: '/acidentes', etapa: 'Etapa 18', titulo: 'Acidentes, CAT e Investigacao' },
  { prefixo: '/riscos', etapa: 'Etapa 19', titulo: 'Inventario de Riscos e Central de Risco' },
  { prefixo: '/dashboard-executivo', etapa: 'Etapa 10', titulo: 'Dashboard Executivo' },
  { prefixo: '/dashboard-gerencial', etapa: 'Etapa 10', titulo: 'Dashboard Gerencial' },
  { prefixo: '/dashboard-operacional', etapa: 'Etapa 10', titulo: 'Dashboard Operacional' },
  { prefixo: '/dashboard-bbs', etapa: 'Indicadores', titulo: 'Dashboard BBS' },
  { prefixo: '/comunicacao', etapa: 'Indicadores', titulo: 'Comunicacao Automatica' },
];

export function Layout() {
  const { pathname } = useLocation();
  const { usuario, pode, sair } = useSessao();
  const atual = TITULOS.find((item) => pathname.startsWith(item.prefixo)) ?? TITULOS[0]!;

  const visivel = (item: ItemNav) => !item.permissao || pode(item.permissao);

  const iniciais = (usuario?.nome ?? '')
    .split(' ')
    .slice(0, 2)
    .map((parte) => parte[0] ?? '')
    .join('')
    .toUpperCase();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Marca tamanho={38} />
          <div>
            <div className="t">SafetyGuard</div>
            <small>EHS 360 · SSMA INTEGRADO</small>
          </div>
        </div>

        <nav aria-label="Navegacao principal">
          {INDICADORES.some(visivel) ? <div className="sec">Indicadores</div> : null}
          {INDICADORES.filter(visivel).map((item) => (
            <NavLink key={item.id} to={item.rota!} className={({ isActive }) => `etapa-item ${isActive ? 'ativa' : ''}`}>
              <Icone nome={item.icone} tamanho={15} />
              <span>
                {item.titulo}
                <small>{item.descricao}</small>
              </span>
            </NavLink>
          ))}

          <div className="sec">Cadastro base</div>
          {ETAPAS.filter(visivel).map((etapa) =>
            etapa.rota ? (
              <NavLink
                key={etapa.id}
                to={etapa.rota}
                className={({ isActive }) => `etapa-item ${isActive ? 'ativa' : ''}`}
              >
                <Icone nome={etapa.icone} tamanho={15} />
                <span>
                  {etapa.id} {etapa.titulo}
                  <small>{etapa.descricao}</small>
                </span>
              </NavLink>
            ) : (
              <div key={etapa.id} className="etapa-item futura">
                <Icone nome={etapa.icone} tamanho={15} />
                <span>
                  {etapa.id} {etapa.titulo}
                  <small>{etapa.descricao}</small>
                </span>
              </div>
            ),
          )}
        </nav>

        <div className="foot">
          {APP_NOME}
          <br />
          API Fastify · Prisma · PostgreSQL
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <span className="lbl">{atual.etapa}</span>
          <strong style={{ fontSize: 14 }}>{atual.titulo}</strong>
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
          <Outlet />
        </div>
      </div>
    </div>
  );
}
