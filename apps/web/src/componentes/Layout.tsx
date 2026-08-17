import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { APP_NOME } from '@safetyguard/shared';

/**
 * Roteiro de implantacao. Cada etapa liberada vira link; as futuras ficam
 * visiveis para dar contexto de onde o cadastro atual se encaixa.
 */
const ETAPAS = [
  { id: '1.1', titulo: 'Empresa de Consultoria', descricao: 'Matriz do sistema', rota: '/empresa' },
  { id: '2', titulo: 'Clientes / Contratantes', descricao: 'Empresas atendidas', rota: '/clientes' },
  { id: '3', titulo: 'Empresas Contratadas', descricao: 'Terceiros e ranking SSMA', rota: '/terceiros' },
  { id: '4', titulo: 'Unidades e Areas', descricao: 'Locais com QR Code', rota: null },
  { id: '5', titulo: 'Pessoas e Acessos', descricao: 'Usuarios, perfis e funcionarios', rota: null },
  { id: '6', titulo: 'Inspecoes e Planos', descricao: 'Campo, criticidade e escalonamento', rota: null },
  { id: '7', titulo: 'Saude e Documentos', descricao: 'ASO, PGR, PCA, LTCAT, PPP', rota: null },
  { id: '8', titulo: 'Dashboards', descricao: 'Executivo, gerencial e operacional', rota: null },
] as const;

const TITULOS: Array<{ prefixo: string; etapa: string; titulo: string }> = [
  { prefixo: '/empresa', etapa: 'Etapa 1.1', titulo: 'Empresa de Consultoria — matriz do sistema' },
  { prefixo: '/clientes', etapa: 'Etapa 2', titulo: 'Clientes / Contratantes' },
  { prefixo: '/terceiros', etapa: 'Etapa 3', titulo: 'Empresas Contratadas / Terceiros' },
];

export function Layout({ usuario = 'Console Web' }: { usuario?: string }) {
  const { pathname } = useLocation();
  const atual = TITULOS.find((item) => pathname.startsWith(item.prefixo)) ?? TITULOS[0]!;

  const iniciais = usuario
    .split(' ')
    .slice(0, 2)
    .map((parte) => parte[0] ?? '')
    .join('')
    .toUpperCase();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark" aria-hidden="true">
            🦺
          </div>
          <div>
            <div className="t">SafetyGuard</div>
            <small>EHS 360 · SSMA INTEGRADO</small>
          </div>
        </div>

        <nav aria-label="Etapas de implantacao">
          <div className="sec">Cadastro base</div>
          {ETAPAS.map((etapa) =>
            etapa.rota ? (
              <NavLink
                key={etapa.id}
                to={etapa.rota}
                className={({ isActive }) => `etapa-item ${isActive ? 'ativa' : ''}`}
              >
                <span aria-hidden="true">●</span>
                <span>
                  {etapa.id} {etapa.titulo}
                  <small>{etapa.descricao}</small>
                </span>
              </NavLink>
            ) : (
              <div key={etapa.id} className="etapa-item futura">
                <span aria-hidden="true">○</span>
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
            <div>
              <div>{usuario}</div>
              <small style={{ display: 'block', fontWeight: 400, color: 'var(--gray)', fontSize: 11 }}>
                Administrador
              </small>
            </div>
            <div className="av" aria-hidden="true">
              {iniciais}
            </div>
          </div>
        </div>

        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
