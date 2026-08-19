import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { api } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import { TIPOS_AFASTAMENTO, type TipoAfastamento } from '@safetyguard/shared';

interface OpcaoCliente { id: string; nomeFantasia: string }

interface PorTipo { rotulo: string; quantidade: number; dias: number }

interface TopColaborador { nome: string; funcao: string; dias: number }

interface Painel {
  periodo: { inicio: string; fim: string; meses: number; diasUteis: number };
  totalAfastamentos: number;
  totalDias: number;
  taxaAbsenteismo: number;
  colaboradoresAtivos: number;
  emAfastamento: number;
  porTipo: Record<TipoAfastamento, PorTipo>;
  topColaboradores: TopColaborador[];
}

interface Afastamento {
  id: string;
  tipo: TipoAfastamento;
  dataInicio: string;
  dataFim: string | null;
  diasAfastamento: number;
  cid: string | null;
  colaborador: { id: string; nome: string; funcao: string };
  rotulos: { tipo: string };
}

const COR_TIPO: Record<TipoAfastamento, string> = {
  ACIDENTE_TRABALHO: 'bad',
  ACIDENTE_TRAJETO: 'warn',
  DOENCA_OCUPACIONAL: 'warn',
  DOENCA_COMUM: 'gray',
  LICENCA_TRATAMENTO: 'gray',
  MATERNIDADE: 'ok',
  PATERNIDADE: 'ok',
  OUTRO: 'gray',
};

export function AbsenteismoPage() {
  const { mostrar } = useToast();

  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [meses, setMeses] = useState(12);
  const [carregando, setCarregando] = useState(true);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [itens, setItens] = useState<Afastamento[]>([]);

  useEffect(() => {
    api.get<OpcaoCliente[]>('/clientes/opcoes?incluirInativos=true').then(setClientes).catch(() => {});
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const q = new URLSearchParams({ meses: String(meses) });
      if (clienteId) q.set('clienteId', clienteId);
      const [p, lista] = await Promise.all([
        api.get<Painel>(`/absenteismo/painel?${q}`),
        api.get<Afastamento[]>(`/absenteismo?${q}`),
      ]);
      setPainel(p);
      setItens(lista);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [clienteId, meses, mostrar]);

  useEffect(() => { void carregar(); }, [carregar]);

  const maxDias = painel
    ? Math.max(1, ...TIPOS_AFASTAMENTO.map((t) => painel.porTipo[t]?.dias ?? 0))
    : 1;

  if (carregando && !painel) {
    return <div className="centro-tela"><div className="spinner" /></div>;
  }

  return (
    <>
      <div className="barra-acoes">
        <h1>Absenteísmo</h1>
        <Link className="btn btn-primario" to="/absenteismo/novo">
          <Icone nome="mais" /> Registrar afastamento
        </Link>
      </div>

      <div className="filtros">
        <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">Todos os clientes</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
        </select>
        <select value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
          {[3, 6, 12, 24].map((m) => <option key={m} value={m}>Últimos {m} meses</option>)}
        </select>
      </div>

      {painel && (
        <div className="painel">
          <h3>Resumo do período ({painel.periodo.meses} meses · {painel.periodo.diasUteis} dias úteis)</h3>
          <div className="stat-grid">
            <div className="stat">
              <b>{painel.taxaAbsenteismo.toFixed(2)}%</b>
              <span>Taxa de absenteísmo</span>
            </div>
            <div className="stat">
              <b>{painel.totalDias}</b>
              <span>Dias perdidos</span>
            </div>
            <div className="stat">
              <b>{painel.totalAfastamentos}</b>
              <span>Afastamentos</span>
            </div>
            <div className="stat">
              <b>{painel.emAfastamento}</b>
              <span>Em afastamento hoje</span>
            </div>
            <div className="stat">
              <b>{painel.colaboradoresAtivos}</b>
              <span>Colaboradores ativos</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
            <div>
              <h3>Por tipo</h3>
              {TIPOS_AFASTAMENTO.map((tipo) => {
                const t = painel.porTipo[tipo];
                if (!t?.quantidade) return null;
                const pct = Math.round((t.dias / maxDias) * 100);
                return (
                  <div key={tipo} className="barra-bbs">
                    <div className="barra-rotulo">{t.rotulo}</div>
                    <div className="barra-trilho">
                      <span style={{ width: `${pct}%` }} />
                    </div>
                    <div className="barra-valor">{t.dias}<small> dias · {t.quantidade} ocorr.</small></div>
                  </div>
                );
              })}
            </div>
            <div>
              <h3>Mais dias afastados</h3>
              {painel.topColaboradores.length === 0 ? (
                <p className="hint">—</p>
              ) : (
                <div className="tbl-wrap">
                  <table>
                    <tbody>
                      {painel.topColaboradores.map((c) => (
                        <tr key={c.nome + c.funcao}>
                          <td><b>{c.nome}</b><div className="hint">{c.funcao}</div></td>
                          <td style={{ textAlign: 'right' }}><b>{c.dias}</b><div className="hint">dias</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="painel">
        <h3>Registro de afastamentos</h3>
        {itens.length === 0 ? (
          <p className="vazio">Nenhum afastamento registrado no período.</p>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Tipo</th>
                  <th>Início</th>
                  <th>Retorno</th>
                  <th style={{ textAlign: 'right' }}>Dias</th>
                  <th>CID</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {itens.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link to={`/colaboradores/${a.colaborador.id}`}>
                        <b>{a.colaborador.nome}</b>
                      </Link>
                      <div className="hint">{a.colaborador.funcao}</div>
                    </td>
                    <td>
                      <span className={`pill ${COR_TIPO[a.tipo] ?? 'gray'}`}>{a.rotulos.tipo}</span>
                    </td>
                    <td>{formatarDataIso(a.dataInicio)}</td>
                    <td>{a.dataFim ? formatarDataIso(a.dataFim) : <span className="hint">em curso</span>}</td>
                    <td style={{ textAlign: 'right' }}>{a.diasAfastamento}</td>
                    <td className="mono">{a.cid ?? '—'}</td>
                    <td>
                      <Link className="btn btn-ghost btn-sm" to={`/absenteismo/${a.id}`}>
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
