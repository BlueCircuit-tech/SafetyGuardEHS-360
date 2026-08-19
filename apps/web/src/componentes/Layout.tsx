import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icone, type NomeIcone } from './Icone';
import { Marca } from './Marca';
import { APP_NOME, type Permissao } from '@safetyguard/shared';
import { useSessao } from '../lib/sessao';

interface ItemNav {
  titulo: string;
  descricao: string;
  rota: string;
  icone: NomeIcone;
  permissao?: Permissao;
}

interface GrupoNav {
  secao: string;
  itens: ItemNav[];
}

const GRUPOS: GrupoNav[] = [
  {
    secao: 'Campo',
    itens: [
      { titulo: 'Observações BBS', descricao: 'Registro seguro de comportamentos', rota: '/observacoes', icone: 'olho', permissao: 'observacoes:ler' },
      { titulo: 'Planos de Ação', descricao: 'Tratativas, prazos e evidências', rota: '/planos-acao', icone: 'ok', permissao: 'planos:ler' },
      { titulo: 'DDS Digital', descricao: 'Diálogo diário de segurança', rota: '/dds', icone: 'mensagem', permissao: 'observacoes:ler' },
      { titulo: 'Acidentes e CAT', descricao: 'S-2210 e investigação de causas', rota: '/acidentes', icone: 'alerta', permissao: 'planos:ler' },
      { titulo: 'Consequências', descricao: 'Medidas disciplinares e reincidência', rota: '/consequencias', icone: 'escudo', permissao: 'planos:ler' },
    ],
  },
  {
    secao: 'Saúde Ocupacional',
    itens: [
      { titulo: 'Colaboradores', descricao: 'Cadastro, ASO e PPP', rota: '/colaboradores', icone: 'capacete', permissao: 'saude:ler' },
      { titulo: 'Absenteísmo', descricao: 'Afastamentos e taxa de absenteísmo', rota: '/absenteismo', icone: 'saude', permissao: 'saude:ler' },
      { titulo: 'EPI e Estoque', descricao: 'Entregas NR-06 e reposição', rota: '/epis', icone: 'capacete', permissao: 'cadastros:ler' },
      { titulo: 'Treinamentos', descricao: 'Matriz de capacitação e NRs', rota: '/treinamentos', icone: 'premio', permissao: 'saude:ler' },
      { titulo: 'Documentos Legais', descricao: 'PGR, PCMSO, LTCAT, PPRA', rota: '/documentos', icone: 'documento', permissao: 'saude:ler' },
    ],
  },
  {
    secao: 'Conformidade e Riscos',
    itens: [
      { titulo: 'Inventário de Riscos', descricao: 'GRO/PGR e central de risco', rota: '/riscos', icone: 'escudo', permissao: 'cadastros:ler' },
      { titulo: 'Auditorias', descricao: 'ISO 45001, 14001 e internas', rota: '/auditorias', icone: 'lupa', permissao: 'cadastros:ler' },
      { titulo: 'Conformidade Legal', descricao: 'ASO e documentos vigentes', rota: '/conformidade', icone: 'ok', permissao: 'indicadores:ler' },
      { titulo: 'Meio Ambiente e ESG', descricao: 'Ocorrências e indicadores ESG', rota: '/meio-ambiente', icone: 'mapa', permissao: 'observacoes:ler' },
    ],
  },
  {
    secao: 'Indicadores',
    itens: [
      { titulo: 'Executivo', descricao: 'Índice Global, maturidade e ranking', rota: '/dashboard-executivo', icone: 'alvo', permissao: 'indicadores:ler' },
      { titulo: 'Gerencial', descricao: 'Causa raiz e área crítica', rota: '/dashboard-gerencial', icone: 'grafico', permissao: 'indicadores:ler' },
      { titulo: 'Operacional', descricao: 'Fila do dia', rota: '/dashboard-operacional', icone: 'bussola', permissao: 'planos:ler' },
      { titulo: 'Dashboard BBS', descricao: 'Comportamento × condição', rota: '/dashboard-bbs', icone: 'painel', permissao: 'indicadores:ler' },
      { titulo: 'Mapa de calor', descricao: 'Áreas por coordenada de planta', rota: '/mapa-planta', icone: 'local', permissao: 'indicadores:ler' },
      { titulo: 'Benchmark', descricao: 'Desempenho por supervisor', rota: '/benchmark-supervisores', icone: 'pessoas', permissao: 'indicadores:ler' },
      { titulo: 'Intelligence', descricao: 'Leituras automáticas dos dados', rota: '/inteligencia', icone: 'raio', permissao: 'indicadores:ler' },
      { titulo: 'Comunicação', descricao: 'Alertas e escalonamento automático', rota: '/comunicacao', icone: 'envelope', permissao: 'planos:ler' },
    ],
  },
  {
    secao: 'Configurações',
    itens: [
      { titulo: 'Clientes', descricao: 'Empresas atendidas e contratos', rota: '/clientes', icone: 'fabrica', permissao: 'cadastros:ler' },
      { titulo: 'Terceiros', descricao: 'Contratadas e ranking SSMA', rota: '/terceiros', icone: 'parceria', permissao: 'cadastros:ler' },
      { titulo: 'Centros de Negócio', descricao: 'Regionais, unidades e contratos', rota: '/centros-negocio', icone: 'pasta', permissao: 'cadastros:ler' },
      { titulo: 'Áreas e QR Code', descricao: 'Locais de inspeção', rota: '/areas', icone: 'local', permissao: 'cadastros:ler' },
      { titulo: 'Usuários e Acessos', descricao: 'Perfis e permissões', rota: '/usuarios', icone: 'pessoas', permissao: 'usuarios:gerenciar' },
      { titulo: 'Empresa', descricao: 'Dados da consultoria', rota: '/empresa', icone: 'predio', permissao: 'cadastros:ler' },
    ],
  },
];

/** Mapa rota → { secao, titulo } para a topbar. */
const TITULOS_ROTA: Array<{ prefixo: string; secao: string; titulo: string }> = [
  { prefixo: '/empresa', secao: 'Configurações', titulo: 'Empresa de Consultoria' },
  { prefixo: '/clientes', secao: 'Configurações', titulo: 'Clientes e Contratantes' },
  { prefixo: '/terceiros', secao: 'Configurações', titulo: 'Empresas Contratadas' },
  { prefixo: '/centros-negocio', secao: 'Configurações', titulo: 'Centros de Negócio' },
  { prefixo: '/areas', secao: 'Configurações', titulo: 'Áreas e QR Code' },
  { prefixo: '/usuarios', secao: 'Configurações', titulo: 'Usuários e Acessos' },
  { prefixo: '/observacoes', secao: 'Campo', titulo: 'Observações BBS' },
  { prefixo: '/planos-acao', secao: 'Campo', titulo: 'Planos de Ação' },
  { prefixo: '/dds', secao: 'Campo', titulo: 'DDS — Diálogo Diário de Segurança' },
  { prefixo: '/acidentes', secao: 'Campo', titulo: 'Acidentes, CAT e Investigação' },
  { prefixo: '/consequencias', secao: 'Campo', titulo: 'Gestão de Consequências' },
  { prefixo: '/colaboradores', secao: 'Saúde Ocupacional', titulo: 'Colaboradores e ASO' },
  { prefixo: '/absenteismo', secao: 'Saúde Ocupacional', titulo: 'Absenteísmo e Afastamentos' },
  { prefixo: '/epis', secao: 'Saúde Ocupacional', titulo: 'EPI e Estoque' },
  { prefixo: '/treinamentos', secao: 'Saúde Ocupacional', titulo: 'Treinamentos e Capacitação' },
  { prefixo: '/documentos', secao: 'Saúde Ocupacional', titulo: 'Documentos Legais SSMA' },
  { prefixo: '/riscos', secao: 'Conformidade e Riscos', titulo: 'Inventário de Riscos e GRO' },
  { prefixo: '/auditorias', secao: 'Conformidade e Riscos', titulo: 'Auditorias' },
  { prefixo: '/conformidade', secao: 'Conformidade e Riscos', titulo: 'Conformidade Legal' },
  { prefixo: '/meio-ambiente', secao: 'Conformidade e Riscos', titulo: 'Meio Ambiente e ESG' },
  { prefixo: '/dashboard-executivo', secao: 'Indicadores', titulo: 'Dashboard Executivo' },
  { prefixo: '/dashboard-gerencial', secao: 'Indicadores', titulo: 'Dashboard Gerencial' },
  { prefixo: '/dashboard-operacional', secao: 'Indicadores', titulo: 'Dashboard Operacional' },
  { prefixo: '/dashboard-bbs', secao: 'Indicadores', titulo: 'Dashboard BBS' },
  { prefixo: '/mapa-planta', secao: 'Indicadores', titulo: 'Mapa de Calor por Planta' },
  { prefixo: '/benchmark-supervisores', secao: 'Indicadores', titulo: 'Benchmark de Supervisores' },
  { prefixo: '/inteligencia', secao: 'Indicadores', titulo: 'SafetyGuard Intelligence' },
  { prefixo: '/comunicacao', secao: 'Indicadores', titulo: 'Comunicação Automática' },
];

export function Layout() {
  const { pathname } = useLocation();
  const { usuario, pode, sair } = useSessao();

  const atual = TITULOS_ROTA.find((item) => pathname.startsWith(item.prefixo));
  const secaoAtual = atual?.secao ?? '';
  const tituloAtual = atual?.titulo ?? 'SafetyGuard EHS 360';

  const visivel = (item: ItemNav) => !item.permissao || pode(item.permissao);
  const grupoVisivel = (g: GrupoNav) => g.itens.some(visivel);

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
            <small>EHS 360 · SSMA</small>
          </div>
        </div>

        <nav aria-label="Navegação principal">
          {GRUPOS.filter(grupoVisivel).map((grupo) => (
            <div key={grupo.secao}>
              <div className="sec">{grupo.secao}</div>
              {grupo.itens.filter(visivel).map((item) => (
                <NavLink
                  key={item.rota}
                  to={item.rota}
                  className={({ isActive }) => `etapa-item ${isActive ? 'ativa' : ''}`}
                >
                  <Icone nome={item.icone} tamanho={15} />
                  <span>
                    {item.titulo}
                    <small>{item.descricao}</small>
                  </span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="foot">
          {APP_NOME}
          <br />
          Fastify · Prisma · PostgreSQL
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          {secaoAtual && <span className="lbl">{secaoAtual}</span>}
          <strong style={{ fontSize: 14 }}>{tituloAtual}</strong>
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
