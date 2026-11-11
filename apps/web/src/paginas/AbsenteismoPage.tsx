import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { api } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import {
  ROTULO_PROVIDENCIA_AFASTAMENTO,
  TIPOS_AFASTAMENTO,
  type ProvidenciaAfastamento,
  type TipoAfastamento,
} from '@safetyguard/shared';

interface OpcaoCliente { id: string; nomeFantasia: string }

interface PorTipo { rotulo: string; quantidade: number; dias: number }

interface TopColaborador { nome: string; funcao: string; dias: number }

interface PorFuncao { funcao: string; afastamentos: number; dias: number; colaboradores: number }
interface PorAno { ano: number; afastamentos: number; dias: number }
interface PorMes { mes: string; afastamentos: number; dias: number }

interface Painel {
  periodo: { inicio: string; fim: string; meses: number; diasUteis: number };
  totalAfastamentos: number;
  totalDias: number;
  taxaAbsenteismo: number;
  colaboradoresAtivos: number;
  emAfastamento: number;
  porTipo: Record<TipoAfastamento, PorTipo>;
  topColaboradores: TopColaborador[];
  diasDebitados?: number;
  acidentesComLesaoPermanente?: number;
  diasComputados?: number;
  porFuncao?: PorFuncao[];
  porAno?: PorAno[];
  porMes?: PorMes[];
}

interface Afastamento {
  id: string;
  tipo: TipoAfastamento;
  dataInicio: string;
  dataFim: string | null;
  diasAfastamento: number;
  cid: string | null;
  funcao?: string | null;
  setor?: string | null;
  liderNome?: string | null;
  providencias?: ProvidenciaAfastamento[] | null;
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

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-03" -> "mar/2026". */
function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split('-');
  const indice = Number(mes) - 1;
  return MESES_ABREV[indice] ? `${MESES_ABREV[indice]}/${ano}` : chave;
}

/** Barra proporcional (mesma leitura das barras do Dashboard BBS). */
function Barra({ rotulo, valor, maximo, detalhe }: { rotulo: string; valor: number; maximo: number; detalhe?: string }) {
  const pct = maximo > 0 ? Math.round((valor / maximo) * 100) : 0;
  return (
    <div className="barra-bbs">
      <div className="barra-rotulo">{rotulo}</div>
      <div className="barra-trilho">
        <span style={{ width: `${pct}%`, background: 'var(--primary)' }} />
      </div>
      <div className="barra-valor">
        {valor}
        <small>{detalhe ?? 'dias'}</small>
      </div>
    </div>
  );
}

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

  if (carregando && !painel) {
    return <div className="centro-tela"><div className="spinner" /></div>;
  }

  const maxDiasTipo = painel ? Math.max(1, ...TIPOS_AFASTAMENTO.map((t) => painel.porTipo[t]?.dias ?? 0)) : 1;
  const porFuncao = painel?.porFuncao ?? [];
  const porAno = painel?.porAno ?? [];
  const porMes = painel?.porMes ?? [];
  const maxDiasFuncao = Math.max(1, ...porFuncao.map((f) => f.dias));
  const maxDiasAno = Math.max(1, ...porAno.map((a) => a.dias));
  const maxDiasMes = Math.max(1, ...porMes.map((m) => m.dias));

  return (
    <>
      <div className="barra-acoes">
        <h1>Absenteísmo</h1>
        <Link className="btn btn-primary" to="/absenteismo/novo">
          <Icone nome="mais" /> Registrar afastamento
        </Link>
      </div>

      <div className="painel">
        <div className="filtros">
          <Campo label="Cliente" htmlFor="abs-cliente">
            <select id="abs-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos os clientes</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
            </select>
          </Campo>
          <Campo label="Período" htmlFor="abs-meses">
            <select id="abs-meses" value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
              {[3, 6, 12, 24].map((m) => <option key={m} value={m}>Últimos {m} meses</option>)}
            </select>
          </Campo>
        </div>
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
              <span>Dias perdidos (afastamento)</span>
            </div>
            {painel.diasDebitados !== undefined ? (
              <div className="stat">
                <b style={{ color: painel.diasDebitados > 0 ? 'var(--red)' : undefined }}>{painel.diasDebitados}</b>
                <span>
                  Dias debitados (NBR 14280)
                  {painel.acidentesComLesaoPermanente ? ` · ${painel.acidentesComLesaoPermanente} acidente(s) com lesão permanente` : ''}
                </span>
              </div>
            ) : null}
            {painel.diasComputados !== undefined ? (
              <div className="stat">
                <b>{painel.diasComputados}</b>
                <span>Dias computados (perdidos + debitados)</span>
              </div>
            ) : null}
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

          <div className="grid2" style={{ gap: 24 }}>
            <div>
              <h3>Por tipo</h3>
              <div className="barras-bbs">
                {TIPOS_AFASTAMENTO.map((tipo) => {
                  const t = painel.porTipo[tipo];
                  if (!t?.quantidade) return null;
                  return <Barra key={tipo} rotulo={t.rotulo} valor={t.dias} maximo={maxDiasTipo} detalhe={`dias · ${t.quantidade} ocorr.`} />;
                })}
                {painel.totalAfastamentos === 0 ? <p className="hint">Nenhum afastamento no período.</p> : null}
              </div>
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

      {painel && (
        <div className="painel">
          <h3>Por função</h3>
          <p className="desc">Colaborador × função × tempo: quantos afastamentos, quantos dias e quantas pessoas de cada função.</p>
          {porFuncao.length === 0 ? (
            <p className="hint">Nenhum afastamento no período.</p>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Função</th>
                    <th className="num-col">Afastamentos</th>
                    <th className="num-col">Colaboradores</th>
                    <th className="num-col">Dias</th>
                    <th style={{ width: '35%' }}>Proporção de dias</th>
                  </tr>
                </thead>
                <tbody>
                  {porFuncao.map((f) => (
                    <tr key={f.funcao}>
                      <td><b>{f.funcao || '—'}</b></td>
                      <td className="num-col">{f.afastamentos}</td>
                      <td className="num-col">{f.colaboradores}</td>
                      <td className="num-col"><b>{f.dias}</b></td>
                      <td>
                        <div className="barra-trilho" title={`${f.dias} dia(s)`}>
                          <span style={{ width: `${Math.round((f.dias / maxDiasFuncao) * 100)}%`, background: 'var(--primary)' }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid2" style={{ gap: 24, marginTop: 16 }}>
            <div>
              <h3>Por ano</h3>
              <div className="barras-bbs">
                {porAno.length === 0 ? <p className="hint">—</p> : null}
                {porAno.map((a) => (
                  <Barra key={a.ano} rotulo={String(a.ano)} valor={a.dias} maximo={maxDiasAno} detalhe={`dias · ${a.afastamentos} afast.`} />
                ))}
              </div>
            </div>
            <div>
              <h3>Por mês</h3>
              <div className="barras-bbs">
                {porMes.length === 0 ? <p className="hint">—</p> : null}
                {porMes.map((m) => (
                  <Barra key={m.mes} rotulo={rotuloMes(m.mes)} valor={m.dias} maximo={maxDiasMes} detalhe={`dias · ${m.afastamentos} afast.`} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="painel">
        <h3>Registro de afastamentos</h3>
        {itens.length === 0 ? (
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="saude" tamanho={22} />
            </div>
            <h4>Nenhum afastamento no período</h4>
            <p>Use “Registrar afastamento” para lançar o primeiro.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Setor / liderança</th>
                  <th>Tipo</th>
                  <th>Início</th>
                  <th>Retorno</th>
                  <th style={{ textAlign: 'right' }}>Dias</th>
                  <th>CID</th>
                  <th>Providências</th>
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
                      <div className="hint">{a.funcao || a.colaborador.funcao}</div>
                    </td>
                    <td>
                      {a.setor || <span className="hint">—</span>}
                      {a.liderNome ? <div className="hint">Líder: {a.liderNome}</div> : null}
                    </td>
                    <td>
                      <span className={`pill ${COR_TIPO[a.tipo] ?? 'gray'}`}>{a.rotulos.tipo}</span>
                    </td>
                    <td>{formatarDataIso(a.dataInicio)}</td>
                    <td>{a.dataFim ? formatarDataIso(a.dataFim) : <span className="hint">em curso</span>}</td>
                    <td style={{ textAlign: 'right' }}>{a.diasAfastamento}</td>
                    <td className="mono">{a.cid ?? '—'}</td>
                    <td>
                      {a.providencias && a.providencias.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {a.providencias.map((p) => (
                            <span key={p} className="pill info">{ROTULO_PROVIDENCIA_AFASTAMENTO[p] ?? p}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="hint">—</span>
                      )}
                    </td>
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
