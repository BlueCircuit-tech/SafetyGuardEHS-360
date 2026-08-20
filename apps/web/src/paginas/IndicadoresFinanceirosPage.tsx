import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../componentes/Toast';
import { api } from '../lib/api';

/**
 * Indicadores financeiros (§29) — custo evitado e ROI com parâmetros configuráveis.
 */

interface OpcaoCliente { id: string; nomeFantasia: string }

interface Parametros {
  clienteId?: string | null;
  custoAcidenteComAfastamento: number;
  custoAcidenteSemAfastamento: number;
  custoDiaAfastamento: number;
  custoHoraParadaProducao: number;
  custoMultaNrMedia: number;
  fatorPreventivoBbs: number;
  valorContratoMensal?: number | null;
}

interface Indicadores {
  periodo: { inicio: string; meses: number };
  parametros: Parametros;
  incorrido: {
    acidentesComAfastamento: number;
    acidentesSemAfastamento: number;
    totalAcidentes: number;
    totalDiasAfastamento: number;
    custoAcidentes: number;
    custoAfastamentos: number;
    total: number;
  };
  evitado: {
    conformidadeBbs: number;
    totalObservacoes: number;
    acidentesEvitadosEstimados: number;
    custoEvitadoEstimado: number;
  };
  roi: {
    custoContrato: number | null;
    percentual: number | null;
    semContratoCadastrado: boolean;
  };
}

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function Campo({ label, children, ajuda }: { label: string; children: React.ReactNode; ajuda?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--texto-fraco)' }}>{label}</label>
      {children}
      {ajuda && <span style={{ fontSize: 11, color: 'var(--texto-fraco)' }}>{ajuda}</span>}
    </div>
  );
}

export function IndicadoresFinanceirosPage() {
  const { mostrar } = useToast();

  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [meses, setMeses] = useState(12);
  const [dados, setDados] = useState<Indicadores | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [editandoParams, setEditandoParams] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [params, setParams] = useState<Parametros>({
    custoAcidenteComAfastamento: 50000,
    custoAcidenteSemAfastamento: 5000,
    custoDiaAfastamento: 300,
    custoHoraParadaProducao: 2000,
    custoMultaNrMedia: 20000,
    fatorPreventivoBbs: 0.3,
    valorContratoMensal: null,
  });

  useEffect(() => {
    api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => {});
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const q = new URLSearchParams({ meses: String(meses) });
      if (clienteId) q.set('clienteId', clienteId);
      const ind = await api.get<Indicadores>(`/financeiro/indicadores?${q}`);
      setDados(ind);
      setParams(ind.parametros);
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao carregar.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [clienteId, meses, mostrar]);

  useEffect(() => { void carregar(); }, [carregar]);

  const salvar = async () => {
    setSalvando(true);
    try {
      await api.put('/financeiro/parametros', {
        ...params,
        clienteId: clienteId || null,
        valorContratoMensal: params.valorContratoMensal || null,
      });
      mostrar('Parâmetros salvos.', 'sucesso');
      setEditandoParams(false);
      void carregar();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falha ao salvar.', 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const num = (campo: keyof Parametros) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setParams((p) => ({ ...p, [campo]: Number(e.target.value) }));

  return (
    <>
      <div className="barra-acoes">
        <h1>Indicadores Financeiros</h1>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setEditandoParams((v) => !v)}
        >
          {editandoParams ? 'Cancelar' : 'Editar parâmetros'}
        </button>
      </div>

      <div className="filtros">
        <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">Todos os clientes</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
        </select>
        <select value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
          {[3, 6, 12, 24, 36].map((m) => <option key={m} value={m}>Últimos {m} meses</option>)}
        </select>
      </div>

      {editandoParams && (
        <div className="painel">
          <h3>Parâmetros de custo — {clienteId ? (clientes.find((c) => c.id === clienteId)?.nomeFantasia ?? 'cliente') : 'padrão global'}</h3>
          <p className="hint">
            Estes valores são usados para estimar o custo incorrido e o custo evitado com o programa BBS.
            Ajuste de acordo com o histórico real da empresa.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 16 }}>
            <Campo label="Acidente com afastamento (R$)" ajuda="Indenização + hora parada + reabilitação">
              <input type="number" min={0} value={params.custoAcidenteComAfastamento} onChange={num('custoAcidenteComAfastamento')} />
            </Campo>
            <Campo label="Acidente sem afastamento (R$)" ajuda="Médico, primeiros socorros, hora parada">
              <input type="number" min={0} value={params.custoAcidenteSemAfastamento} onChange={num('custoAcidenteSemAfastamento')} />
            </Campo>
            <Campo label="Dia de afastamento (R$)" ajuda="Benefício INSS + perda de produtividade">
              <input type="number" min={0} value={params.custoDiaAfastamento} onChange={num('custoDiaAfastamento')} />
            </Campo>
            <Campo label="Hora de parada de produção (R$)" ajuda="Equipamento + mão de obra parada">
              <input type="number" min={0} value={params.custoHoraParadaProducao} onChange={num('custoHoraParadaProducao')} />
            </Campo>
            <Campo label="Multa NR média (R$)" ajuda="Base: tabela NR-28">
              <input type="number" min={0} value={params.custoMultaNrMedia} onChange={num('custoMultaNrMedia')} />
            </Campo>
            <Campo label="Fator preventivo BBS (0–1)" ajuda="Ex.: 0,30 = 30% de redução estimada com BBS ativo">
              <input type="number" min={0} max={1} step={0.01} value={params.fatorPreventivoBbs} onChange={num('fatorPreventivoBbs')} />
            </Campo>
            <Campo label="Valor do contrato mensal (R$)" ajuda="Opcional — usado para calcular o ROI da consultoria">
              <input type="number" min={0} value={params.valorContratoMensal ?? ''} onChange={num('valorContratoMensal')} placeholder="Não informado" />
            </Campo>
          </div>

          <div className="barra-acoes" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-primario" disabled={salvando} onClick={() => void salvar()}>
              {salvando ? 'Salvando…' : 'Salvar parâmetros'}
            </button>
          </div>
        </div>
      )}

      {carregando && <div className="centro-tela"><div className="spinner" /></div>}

      {dados && !carregando && (
        <>
          <div className="stat-grid">
            <div className="stat">
              <b style={{ color: dados.incorrido.total > 0 ? 'var(--red)' : undefined }}>
                {moeda(dados.incorrido.total)}
              </b>
              <span>Custo incorrido no período</span>
            </div>
            <div className="stat">
              <b style={{ color: 'var(--green)' }}>
                {moeda(dados.evitado.custoEvitadoEstimado)}
              </b>
              <span>Custo evitado estimado</span>
            </div>
            {dados.roi.percentual !== null ? (
              <div className="stat">
                <b style={{ color: dados.roi.percentual >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {dados.roi.percentual >= 0 ? '+' : ''}{dados.roi.percentual}%
                </b>
                <span>ROI da consultoria</span>
              </div>
            ) : (
              <div className="stat">
                <b className="hint">—</b>
                <span>ROI (cadastre o valor do contrato)</span>
              </div>
            )}
            <div className="stat">
              <b>{dados.evitado.conformidadeBbs}%</b>
              <span>Conformidade BBS no período</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="painel">
              <h3>Custo incorrido</h3>
              <div className="hint" style={{ marginBottom: 12 }}>
                Custos reais com base nos acidentes e afastamentos registrados.
              </div>
              <table>
                <tbody>
                  <tr>
                    <td>Acidentes com afastamento</td>
                    <td style={{ textAlign: 'right' }}><b>{dados.incorrido.acidentesComAfastamento}</b></td>
                    <td style={{ textAlign: 'right' }}>{moeda(dados.incorrido.acidentesComAfastamento * dados.parametros.custoAcidenteComAfastamento)}</td>
                  </tr>
                  <tr>
                    <td>Acidentes sem afastamento</td>
                    <td style={{ textAlign: 'right' }}><b>{dados.incorrido.acidentesSemAfastamento}</b></td>
                    <td style={{ textAlign: 'right' }}>{moeda(dados.incorrido.acidentesSemAfastamento * dados.parametros.custoAcidenteSemAfastamento)}</td>
                  </tr>
                  <tr>
                    <td>Dias de afastamento</td>
                    <td style={{ textAlign: 'right' }}><b>{dados.incorrido.totalDiasAfastamento}</b></td>
                    <td style={{ textAlign: 'right' }}>{moeda(dados.incorrido.custoAfastamentos)}</td>
                  </tr>
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={2}>Total estimado</td>
                    <td style={{ textAlign: 'right', color: 'var(--red)' }}>{moeda(dados.incorrido.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="painel">
              <h3>Custo evitado estimado</h3>
              <div className="hint" style={{ marginBottom: 12 }}>
                Estimativa de acidentes evitados pelo programa BBS com {dados.evitado.conformidadeBbs}% de conformidade.
                Fator preventivo configurado: {(dados.parametros.fatorPreventivoBbs * 100).toFixed(0)}%.
              </div>
              <table>
                <tbody>
                  <tr>
                    <td>Observações BBS registradas</td>
                    <td style={{ textAlign: 'right' }}><b>{dados.evitado.totalObservacoes}</b></td>
                  </tr>
                  <tr>
                    <td>Acidentes evitados estimados</td>
                    <td style={{ textAlign: 'right' }}><b>{dados.evitado.acidentesEvitadosEstimados}</b></td>
                  </tr>
                  <tr style={{ fontWeight: 700 }}>
                    <td>Custo evitado total</td>
                    <td style={{ textAlign: 'right', color: 'var(--green)' }}>{moeda(dados.evitado.custoEvitadoEstimado)}</td>
                  </tr>
                </tbody>
              </table>

              {dados.roi.custoContrato && (
                <div style={{ marginTop: 16, padding: '12px', background: 'var(--fundo)', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--texto-fraco)' }}>Custo da consultoria no período</div>
                  <div style={{ fontWeight: 700 }}>{moeda(dados.roi.custoContrato)}</div>
                  <div style={{ fontSize: 12, color: 'var(--texto-fraco)', marginTop: 4 }}>ROI</div>
                  <div style={{ fontWeight: 700, color: dados.roi.percentual! >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {dados.roi.percentual! >= 0 ? '+' : ''}{dados.roi.percentual}%
                  </div>
                </div>
              )}

              {dados.roi.semContratoCadastrado && (
                <div className="hint" style={{ marginTop: 12 }}>
                  Cadastre o valor mensal do contrato nos parâmetros para ver o ROI.
                </div>
              )}
            </div>
          </div>

          <div className="painel">
            <h3>Metodologia de cálculo</h3>
            <p className="hint">
              <b>Custo incorrido</b> = (acidentes com afastamento × R$ {dados.parametros.custoAcidenteComAfastamento.toLocaleString('pt-BR')}) +
              (acidentes sem afastamento × R$ {dados.parametros.custoAcidenteSemAfastamento.toLocaleString('pt-BR')}) +
              (dias afastamento × R$ {dados.parametros.custoDiaAfastamento.toLocaleString('pt-BR')}/dia).
            </p>
            <p className="hint">
              <b>Custo evitado</b> = estimativa dos acidentes que não ocorreram por causa do programa BBS ativo,
              usando o fator preventivo de {(dados.parametros.fatorPreventivoBbs * 100).toFixed(0)}% ponderado pela
              conformidade BBS real do período ({dados.evitado.conformidadeBbs}%).
            </p>
            <p className="hint">
              <b>ROI</b> = (custo evitado − custo da consultoria) ÷ custo da consultoria × 100. Um ROI de 200% significa que
              para cada R$1 investido na consultoria, R$2 foram recuperados em acidentes evitados.
            </p>
          </div>
        </>
      )}
    </>
  );
}
