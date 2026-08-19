import { useEffect, useState } from 'react';
import { useToast } from '../componentes/Toast';
import { api } from '../lib/api';

/**
 * Benchmark supervisor×supervisor (§27).
 *
 * Compara os responsáveis de área por volume de desvios, IIR médio e
 * planos de ação abertos no período selecionado.
 */

interface OpcaoCliente { id: string; nomeFantasia: string }

interface Supervisor {
  supervisor: string;
  areas: number;
  desvios: number;
  iirMedio: number;
  planosAbertos: number;
}

interface Benchmark {
  supervisores: Supervisor[];
  periodo: { inicio: string; meses: number };
}

function classifIir(iir: number): string {
  if (iir === 0) return 'gray';
  if (iir >= 750) return 'bad';
  if (iir >= 300) return 'warn';
  return 'ok';
}

function BarraNormal({ valor, max }: { valor: number; max: number }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  return (
    <div className="barra-trilho" style={{ flexGrow: 1, margin: '0 8px' }}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function BenchmarkSupervisoresPage() {
  const { mostrar } = useToast();

  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [meses, setMeses] = useState(3);
  const [carregando, setCarregando] = useState(false);
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [ordenarPor, setOrdenarPor] = useState<keyof Supervisor>('desvios');

  useEffect(() => {
    api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => {});
  }, []);

  useEffect(() => {
    setCarregando(true);
    const q = new URLSearchParams({ meses: String(meses) });
    if (clienteId) q.set('clienteId', clienteId);
    api
      .get<Benchmark>(`/dashboards/supervisores?${q}`)
      .then(setBenchmark)
      .catch((erro: unknown) => mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar.', 'erro'))
      .finally(() => setCarregando(false));
  }, [clienteId, meses, mostrar]);

  const supervisores = [...(benchmark?.supervisores ?? [])].sort((a, b) => {
    const va = a[ordenarPor] as number;
    const vb = b[ordenarPor] as number;
    return vb - va;
  });

  const maxDesvios = Math.max(1, ...supervisores.map((s) => s.desvios));
  const maxIir = Math.max(1, ...supervisores.map((s) => s.iirMedio));

  return (
    <>
      <div className="barra-acoes">
        <h1>Benchmark de supervisores</h1>
      </div>

      <div className="filtros">
        <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">Todos os clientes</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
        </select>
        <select value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
          {[1, 3, 6, 12].map((m) => <option key={m} value={m}>Últimos {m} {m === 1 ? 'mês' : 'meses'}</option>)}
        </select>
        <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value as keyof Supervisor)}>
          <option value="desvios">Ordenar por desvios</option>
          <option value="iirMedio">Ordenar por IIR médio</option>
          <option value="planosAbertos">Ordenar por planos abertos</option>
          <option value="areas">Ordenar por áreas</option>
        </select>
      </div>

      {carregando && <div className="centro-tela"><div className="spinner" /></div>}

      {!carregando && benchmark && (
        <>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="stat">
              <b>{supervisores.length}</b>
              <span>supervisores avaliados</span>
            </div>
            <div className="stat">
              <b>{supervisores.reduce((s, x) => s + x.desvios, 0)}</b>
              <span>desvios no período</span>
            </div>
            <div className="stat">
              <b>{supervisores.reduce((s, x) => s + x.planosAbertos, 0)}</b>
              <span>planos em aberto</span>
            </div>
          </div>

          {supervisores.length === 0 ? (
            <div className="painel">
              <p className="vazio">Nenhum dado encontrado para o período selecionado.</p>
            </div>
          ) : (
            <div className="painel" style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th>Supervisor / Responsável</th>
                    <th style={{ textAlign: 'right' }}>Áreas</th>
                    <th style={{ width: 240 }}>Desvios</th>
                    <th style={{ textAlign: 'right' }}>IIR médio</th>
                    <th style={{ width: 240 }}>Calor</th>
                    <th style={{ textAlign: 'right' }}>Planos abertos</th>
                  </tr>
                </thead>
                <tbody>
                  {supervisores.map((s, idx) => (
                    <tr key={s.supervisor}>
                      <td className="mono" style={{ color: 'var(--texto-fraco)' }}>{idx + 1}</td>
                      <td>
                        <b>{s.supervisor}</b>
                      </td>
                      <td style={{ textAlign: 'right' }}>{s.areas}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                          <span style={{ minWidth: 32, textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{s.desvios}</span>
                          <BarraNormal valor={s.desvios} max={maxDesvios} />
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`pill ${classifIir(s.iirMedio)}`}>{s.iirMedio}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                          <span style={{ minWidth: 32, textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{s.iirMedio}</span>
                          <BarraNormal valor={s.iirMedio} max={maxIir} />
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {s.planosAbertos > 0 ? (
                          <span className="pill warn">{s.planosAbertos}</span>
                        ) : (
                          <span className="hint">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
