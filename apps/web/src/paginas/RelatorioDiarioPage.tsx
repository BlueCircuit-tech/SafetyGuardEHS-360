import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { api, urlAbsoluta } from '../lib/api';
import { formatarDataIso } from '../lib/datas';

interface RelatorioDiario {
  data: string;
  cliente: { id: string; nomeFantasia: string; razaoSocial: string } | null;
  resumo: {
    acidentes: number;
    acidentesComAfastamento: number;
    desvios: number;
    desviosComFoto: number;
    planosAbertos: number;
    planosVencidos: number;
  };
  acidentes: Array<{
    id: string;
    data: string;
    descricao: string;
    comAfastamento: boolean;
    diasAfastamento: number;
    catNumero: string | null;
    catPendente: boolean;
    causaRaiz: string | null;
    colaborador?: { nome: string; funcao: string } | null;
    area?: { nome: string } | null;
    rotulos?: { tipo: string; investigacao: string };
  }>;
  desvios: Array<{
    id: string;
    dataHora: string;
    tipo: string;
    descricao: string;
    observador: string;
    grauRisco: string | null;
    iir: number | null;
    fotoUrl: string | null;
    acaoImediata: string | null;
    area?: { nome: string; codigo: string } | null;
    terceiro?: { razaoSocial: string } | null;
    causa?: { descricao: string } | null;
  }>;
  planosAbertos: PlanoResumo[];
  planosVencidos: PlanoResumo[];
}

interface PlanoResumo {
  id: string;
  codigo: string;
  acao: string;
  criticidade: string;
  prazo: string;
  status: string;
  responsavelNome: string;
  area?: { nome: string } | null;
}

const ROTULO_TIPO_OBS: Record<string, string> = {
  COMPORTAMENTO_INSEGURO: 'Comportamento inseguro',
  CONDICAO_INSEGURA: 'Condição insegura',
  MELHORIA_IDENTIFICADA: 'Melhoria identificada',
  NAO_CONFORMIDADE: 'Não conformidade',
};

function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Relatorio diario consolidado: o fechamento do dia da consultoria, com
 * evidencias fotograficas, pronto para imprimir ou salvar em PDF.
 */
export function RelatorioDiarioPage() {
  const { mostrar } = useToast();
  const [clientes, setClientes] = useState<Array<{ id: string; nomeFantasia: string }>>([]);
  const [clienteId, setClienteId] = useState('');
  const [data, setData] = useState(hoje());
  const [relatorio, setRelatorio] = useState<RelatorioDiario | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const parametros = new URLSearchParams({ data });
      if (clienteId) parametros.set('clienteId', clienteId);
      setRelatorio(await api.get<RelatorioDiario>(`/acidentes/relatorio-diario?${parametros.toString()}`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao montar o relatório.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [clienteId, data, mostrar]);

  useEffect(() => {
    void api.get<Array<{ id: string; nomeFantasia: string }>>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const r = relatorio;

  return (
    <>
      <div className="painel sem-impressao">
        <div className="filtros">
          <Campo label="Data" htmlFor="rd-data">
            <input id="rd-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </Campo>
          <Campo label="Cliente" htmlFor="rd-cliente">
            <select id="rd-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos os clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>
          <div style={{ alignSelf: 'end', display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={!r}>
              <Icone nome="impressora" /> Imprimir / PDF
            </button>
            <Link to="/acidentes" className="btn btn-ghost">
              <Icone nome="voltar" /> Acidentes
            </Link>
          </div>
        </div>
      </div>

      {carregando || !r ? (
        <div className="painel">
          <div className="centro-tela">
            <div className="spinner" />
            Montando o relatório...
          </div>
        </div>
      ) : (
        <div className="painel folha">
          <div className="folha-cabecalho">
            <div>
              <h2>Relatório diário de SSMA</h2>
              <div className="hint">{r.cliente ? `${r.cliente.nomeFantasia} · ${r.cliente.razaoSocial}` : 'Todos os clientes'}</div>
            </div>
            <div className="meta">
              <b>{formatarDataIso(r.data)}</b>
              <div>gerado em {new Date().toLocaleString('pt-BR')}</div>
            </div>
          </div>

          <div className="stat-grid">
            <div className="stat">
              <b style={{ color: r.resumo.acidentes > 0 ? 'var(--red)' : undefined }}>{r.resumo.acidentes}</b>
              <span>acidente(s) · {r.resumo.acidentesComAfastamento} com afastamento</span>
            </div>
            <div className="stat">
              <b>{r.resumo.desvios}</b>
              <span>desvio(s) observado(s) · {r.resumo.desviosComFoto} com foto</span>
            </div>
            <div className="stat">
              <b>{r.resumo.planosAbertos}</b>
              <span>plano(s) aberto(s) no dia</span>
            </div>
            <div className="stat">
              <b style={{ color: r.resumo.planosVencidos > 0 ? 'var(--red)' : undefined }}>{r.resumo.planosVencidos}</b>
              <span>plano(s) vencendo hoje sem conclusão</span>
            </div>
          </div>

          <div className="folha-secao">
            <h4>Acidentes</h4>
            {r.acidentes.length === 0 ? (
              <p className="hint">Nenhum acidente registrado na data.</p>
            ) : (
              r.acidentes.map((a) => (
                <div key={a.id} className="ishikawa-categoria" style={{ marginBottom: 10 }}>
                  <b>{a.rotulos?.tipo}</b> — {a.colaborador ? `${a.colaborador.nome} (${a.colaborador.funcao})` : 'não identificado'}
                  {a.area ? ` · ${a.area.nome}` : null}
                  <p style={{ margin: '6px 0' }}>{a.descricao}</p>
                  <div className="hint">
                    {a.comAfastamento ? `Com afastamento (${a.diasAfastamento} dia(s))` : 'Sem afastamento'} ·{' '}
                    {a.catNumero ? `CAT ${a.catNumero}` : a.catPendente ? 'CAT PENDENTE' : 'CAT dentro do prazo'} · {a.rotulos?.investigacao}
                    {a.causaRaiz ? ` · Causa raiz: ${a.causaRaiz}` : null}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="folha-secao">
            <h4>Desvios observados em campo</h4>
            {r.desvios.length === 0 ? (
              <p className="hint">Nenhum desvio registrado na data.</p>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Tipo</th>
                      <th>Onde</th>
                      <th>Descrição</th>
                      <th>Risco</th>
                      <th>Evidência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.desvios.map((d) => (
                      <tr key={d.id}>
                        <td>{new Date(d.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>{ROTULO_TIPO_OBS[d.tipo] ?? d.tipo}</td>
                        <td>
                          {d.area ? `${d.area.codigo} · ${d.area.nome}` : '—'}
                          {d.terceiro ? <div className="hint">{d.terceiro.razaoSocial}</div> : null}
                        </td>
                        <td>
                          {d.descricao}
                          {d.causa ? <div className="hint">Causa: {d.causa.descricao}</div> : null}
                          {d.acaoImediata ? <div className="hint">Ação imediata: {d.acaoImediata}</div> : null}
                          <div className="hint">por {d.observador}</div>
                        </td>
                        <td>
                          {d.grauRisco ? <span className={`pill ${d.grauRisco === 'I' ? 'bad' : d.grauRisco === 'II' ? 'warn' : 'gray'}`}>Grau {d.grauRisco}</span> : '—'}
                          {d.iir ? <div className="hint">IIR {d.iir}</div> : null}
                        </td>
                        <td>
                          {d.fotoUrl ? <img className="evidencia-thumb" src={urlAbsoluta(d.fotoUrl) ?? ''} alt="Evidência" /> : <span className="hint">sem foto</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {[
            { titulo: 'Planos de ação abertos no dia', lista: r.planosAbertos },
            { titulo: 'Planos vencendo hoje sem conclusão', lista: r.planosVencidos },
          ].map(({ titulo, lista }) => (
            <div key={titulo} className="folha-secao">
              <h4>{titulo}</h4>
              {lista.length === 0 ? (
                <p className="hint">Nenhum.</p>
              ) : (
                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Ação</th>
                        <th>Área</th>
                        <th>Responsável</th>
                        <th>Prazo</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((p) => (
                        <tr key={p.id}>
                          <td className="mono">{p.codigo}</td>
                          <td>{p.acao}</td>
                          <td>{p.area?.nome ?? '—'}</td>
                          <td>{p.responsavelNome}</td>
                          <td>{formatarDataIso(p.prazo)}</td>
                          <td>
                            <span className="pill gray">{p.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
