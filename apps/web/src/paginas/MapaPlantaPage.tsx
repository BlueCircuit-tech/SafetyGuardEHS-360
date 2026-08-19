import { useEffect, useRef, useState } from 'react';
import { useToast } from '../componentes/Toast';
import { api } from '../lib/api';

/**
 * Mapa de calor por planta (§22).
 *
 * Mostra a imagem de planta baixa do cliente com um ponto colorido por área.
 * A cor vai de cinza (sem desvios) a vermelho (IIR crítico).
 * As coordenadas X/Y são cadastradas no form de área (0–100%).
 */

interface OpcaoCliente { id: string; nomeFantasia: string }

interface PontoMapa {
  areaId: string;
  nome: string;
  codigo: string;
  criticidade: string;
  responsavel: string | null;
  coordPlantaX: number | null;
  coordPlantaY: number | null;
  totalObs: number;
  iirMedio: number;
  nivel: number;
  corHeatmap: string;
  temCoordenada: boolean;
}

interface MapaPlanta {
  clienteId: string;
  cliente: string;
  imagemPlantaUrl: string | null;
  periodo: { inicio: string; meses: number };
  totalAreas: number;
  areasSemCoordenada: number;
  pontos: PontoMapa[];
}

const RAIO = 18;

const LEGENDA = [
  { nivel: 0, cor: '#6b7280', rotulo: 'Sem desvios' },
  { nivel: 1, cor: '#f59e0b', rotulo: 'IIR baixo (< 300)' },
  { nivel: 2, cor: '#f97316', rotulo: 'IIR médio (300–750)' },
  { nivel: 3, cor: '#dc2626', rotulo: 'IIR crítico (≥ 750)' },
];

function PontoSvg({ ponto, selecionado, onSelect }: { ponto: PontoMapa; selecionado: boolean; onSelect: () => void }) {
  if (!ponto.temCoordenada) return null;
  const x = `${ponto.coordPlantaX ?? 0}%`;
  const y = `${ponto.coordPlantaY ?? 0}%`;
  return (
    <g
      transform={`translate(${x}, ${y})`}
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
      role="button"
      aria-label={ponto.nome}
    >
      <circle
        cx={0}
        cy={0}
        r={selecionado ? RAIO + 4 : RAIO}
        fill={ponto.corHeatmap}
        fillOpacity={0.8}
        stroke={selecionado ? 'var(--texto)' : 'rgba(255,255,255,0.6)'}
        strokeWidth={selecionado ? 2.5 : 1.5}
        style={{ transition: 'r 0.15s, stroke 0.15s' }}
      />
      <text
        textAnchor="middle"
        dy="0.35em"
        fill="#fff"
        fontSize={10}
        fontWeight={700}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {ponto.codigo}
      </text>
    </g>
  );
}

export function MapaPlantaPage() {
  const { mostrar } = useToast();

  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [meses, setMeses] = useState(3);
  const [carregando, setCarregando] = useState(false);
  const [mapa, setMapa] = useState<MapaPlanta | null>(null);
  const [selecionado, setSelecionado] = useState<PontoMapa | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => {});
  }, []);

  useEffect(() => {
    if (!clienteId) return;
    setCarregando(true);
    api
      .get<MapaPlanta>(`/dashboards/mapa-planta?clienteId=${clienteId}&meses=${meses}`)
      .then(setMapa)
      .catch((erro: unknown) => mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar.', 'erro'))
      .finally(() => setCarregando(false));
  }, [clienteId, meses, mostrar]);

  const pontosSemCoord = mapa?.pontos.filter((p) => !p.temCoordenada) ?? [];
  const pontosComCoord = mapa?.pontos.filter((p) => p.temCoordenada) ?? [];

  return (
    <>
      <div className="barra-acoes">
        <h1>Mapa de calor por planta</h1>
      </div>

      <div className="filtros">
        <select value={clienteId} onChange={(e) => { setClienteId(e.target.value); setSelecionado(null); }}>
          <option value="">Selecione um cliente…</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
        </select>
        <select value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
          {[1, 3, 6, 12].map((m) => <option key={m} value={m}>Últimos {m} {m === 1 ? 'mês' : 'meses'}</option>)}
        </select>
      </div>

      {!clienteId && (
        <div className="painel">
          <p className="vazio">Selecione um cliente para exibir o mapa.</p>
        </div>
      )}

      {carregando && <div className="centro-tela"><div className="spinner" /></div>}

      {mapa && !carregando && (
        <>
          {mapa.areasSemCoordenada > 0 && (
            <div className="hint alerta">
              <b>{mapa.areasSemCoordenada} {mapa.areasSemCoordenada === 1 ? 'área sem' : 'áreas sem'} coordenada de planta.</b>{' '}
              Cadastre as coordenadas X/Y no formulário de área para que apareçam no mapa.
            </div>
          )}

          {!mapa.imagemPlantaUrl && (
            <div className="hint">
              Nenhuma imagem de planta cadastrada para {mapa.cliente}. Cadastre em <b>Clientes → Editar</b> o campo "Imagem de planta".
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }}>
            <div className="painel" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
              {mapa.imagemPlantaUrl ? (
                <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                  <img
                    ref={imgRef}
                    src={mapa.imagemPlantaUrl}
                    alt={`Planta baixa — ${mapa.cliente}`}
                    style={{ width: '100%', display: 'block', opacity: 0.85 }}
                  />
                  <svg
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    {pontosComCoord.map((p) => (
                      <PontoSvg
                        key={p.areaId}
                        ponto={p}
                        selecionado={selecionado?.areaId === p.areaId}
                        onSelect={() => setSelecionado(selecionado?.areaId === p.areaId ? null : p)}
                      />
                    ))}
                  </svg>
                </div>
              ) : (
                <div style={{ background: 'var(--fundo)', position: 'relative', minHeight: 400 }}>
                  <svg
                    style={{ width: '100%', height: 400 }}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    <rect width={100} height={100} fill="var(--fundo)" />
                    {pontosComCoord.map((p) => (
                      <PontoSvg
                        key={p.areaId}
                        ponto={p}
                        selecionado={selecionado?.areaId === p.areaId}
                        onSelect={() => setSelecionado(selecionado?.areaId === p.areaId ? null : p)}
                      />
                    ))}
                    {pontosComCoord.length === 0 && (
                      <text x={50} y={50} textAnchor="middle" fill="var(--texto-fraco)" fontSize={4}>
                        Nenhuma área com coordenada de planta cadastrada
                      </text>
                    )}
                  </svg>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {selecionado ? (
                <div className="painel">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>{selecionado.nome}</h3>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelecionado(null)}>
                      ✕
                    </button>
                  </div>
                  <div className="hint">{selecionado.codigo} · {selecionado.criticidade}</div>
                  {selecionado.responsavel && <div style={{ marginTop: 8 }}>Resp.: {selecionado.responsavel}</div>}
                  <div className="stat-grid" style={{ marginTop: 12 }}>
                    <div className="stat">
                      <b>{selecionado.totalObs}</b>
                      <span>observações</span>
                    </div>
                    <div className="stat">
                      <b>{selecionado.iirMedio}</b>
                      <span>IIR médio</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="painel">
                  <div className="hint" style={{ marginBottom: 8 }}>Clique numa área para ver os detalhes.</div>
                  <div className="stat-grid">
                    <div className="stat">
                      <b>{mapa.totalAreas}</b>
                      <span>áreas ativas</span>
                    </div>
                    <div className="stat">
                      <b>{pontosComCoord.length}</b>
                      <span>no mapa</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="painel">
                <h3>Legenda</h3>
                {LEGENDA.map((l) => (
                  <div key={l.nivel} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 16, height: 16, borderRadius: '50%', background: l.cor, flexShrink: 0 }} />
                    <span className="hint">{l.rotulo}</span>
                  </div>
                ))}
              </div>

              {pontosSemCoord.length > 0 && (
                <div className="painel">
                  <h3>Áreas sem coordenada</h3>
                  <div className="tbl-wrap">
                    <table>
                      <tbody>
                        {pontosSemCoord.map((p) => (
                          <tr key={p.areaId}>
                            <td className="mono">{p.codigo}</td>
                            <td>{p.nome}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
