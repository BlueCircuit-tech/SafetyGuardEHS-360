import type { ReactNode } from 'react';
import { APP_NOME } from '@safetyguard/shared';

/**
 * Roteiro de implantacao. A Etapa 1 e a unica navegavel por enquanto — as
 * demais ficam visiveis para dar contexto de onde o cadastro se encaixa.
 */
const ETAPAS = [
  { id: '1.1', titulo: 'Empresa de Consultoria', descricao: 'Matriz do sistema', estado: 'ativa' },
  { id: '1.2', titulo: 'Clientes / Contratos', descricao: 'Empresas atendidas', estado: 'futura' },
  { id: '1.3', titulo: 'Unidades e Areas', descricao: 'Locais com QR Code', estado: 'futura' },
  { id: '2', titulo: 'Pessoas e Acessos', descricao: 'Usuarios, perfis e funcionarios', estado: 'futura' },
  { id: '3', titulo: 'Inspecoes e Planos', descricao: 'Campo, criticidade e escalonamento', estado: 'futura' },
  { id: '4', titulo: 'Saude e Documentos', descricao: 'ASO, PGR, PCA, LTCAT, PPP', estado: 'futura' },
  { id: '5', titulo: 'Dashboards', descricao: 'Executivo, gerencial e operacional', estado: 'futura' },
] as const;

interface LayoutProps {
  usuario?: string;
  children: ReactNode;
}

export function Layout({ usuario = 'Console Web', children }: LayoutProps) {
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
          <div className="sec">Etapa 1 — Cadastro base</div>
          {ETAPAS.map((etapa) => (
            <div
              key={etapa.id}
              className={`etapa-item ${etapa.estado === 'ativa' ? 'ativa' : 'futura'}`}
              aria-current={etapa.estado === 'ativa' ? 'step' : undefined}
            >
              <span aria-hidden="true">{etapa.estado === 'ativa' ? '●' : '○'}</span>
              <span>
                {etapa.id} {etapa.titulo}
                <small>{etapa.descricao}</small>
              </span>
            </div>
          ))}
        </nav>

        <div className="foot">
          {APP_NOME}
          <br />
          API Fastify · Prisma · PostgreSQL
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <span className="lbl">Etapa 1.1</span>
          <strong style={{ fontSize: 14 }}>Empresa de Consultoria — matriz do sistema</strong>
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

        <div className="content">{children}</div>
      </div>
    </div>
  );
}
