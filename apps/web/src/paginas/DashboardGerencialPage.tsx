import { useCallback, useEffect, useState } from 'react';
import { Farol } from '../componentes/Icone';
import { Link } from 'react-router-dom';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { api } from '../lib/api';
import { formatarDataHora, formatarDataIso } from '../lib/datas';
import type { PainelGerencial } from '../lib/dashboards';

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

interface OpcaoCentro {
  id: string;
  nome: string;
}

/** Pareto: barra proporcional com a curva acumulada ao lado. */
function Pareto({ titulo, linhas }: { titulo: string; linhas: PainelGerencial['pareto']['comportamentosInseguros'] }) {
  if (linhas.length === 0) {
    return (
      <div>
        <h4>{titulo}</h4>
        <p className="hint">Sem registros no período.</p>
      </div>
    );
  }

  const maior = Math.max(...linhas.map((linha) => linha.quantidade));

  return (
    <div>
      <h4>{titulo}</h4>
      <div className="pareto">
        {linhas.map((linha) => (
          <div className="pareto-linha" key={linha.causa}>
            <div className="pareto-causa">{linha.causa}</div>
            <div className="pareto-barra">
              <span style={{ width: `${Math.round((linha.quantidade / maior) * 100)}%` }} />
            </div>
            <div className="pareto-valor">
              {linha.quantidade}
              <small>{linha.acumulado}% acum.</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardGerencialPage() {
  const { mostrar } = useToast();

  const [carregando, setCarregando] = useState(true);
  const [painel, setPainel] = useState<PainelGerencial | null>(null);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [centros, setCentros] = useState<OpcaoCentro[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [centroNegocioId, setCentroNegocioId] = useState('');

  useEffect(() => {
    void api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
    void api.get<OpcaoCentro[]>('/centros-negocio/opcoes').then(setCentros).catch(() => setCentros([]));
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const parametros = new URLSearchParams();
      if (clienteId) parametros.set('clienteId', clienteId);
      if (centroNegocioId) parametros.set('centroNegocioId', centroNegocioId);
      setPainel(await api.get<PainelGerencial>(`/dashboards/gerencial?${parametros.toString()}`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar o painel gerencial.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [clienteId, centroNegocioId, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando && !painel) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
        Carregando painel gerencial...
      </div>
    );
  }

  if (!painel) return null;

  const { icsg, bbs, pareto, mapaCalor, planos, inspecoes, conformidade, terceiros, piramideBird } = painel;

  return (
    <>
      <div className="painel">
        <h3>Painel gerencial</h3>
        <p className="desc">
          Onde está o problema: causa raiz, área crítica, carteira de planos e desempenho das contratadas. A nota
          consolidada fica no <Link to="/dashboard-executivo">painel executivo</Link>. Dados de{' '}
          {formatarDataHora(painel.geradoEm)}.
        </p>

        <div className="filtros">
          <Campo label="Cliente" htmlFor="cliente">
            <select id="cliente" value={clienteId} onChange={(evento) => setClienteId(evento.target.value)}>
              <option value="">Todos os clientes</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Centro de negócio" htmlFor="centro">
            <select id="centro" value={centroNegocioId} onChange={(evento) => setCentroNegocioId(evento.target.value)}>
              <option value="">Todos</option>
              {centros.map((centro) => (
                <option key={centro.id} value={centro.id}>
                  {centro.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </div>

      <div className="grid-indices">
        <div className="indice-destaque">
          <h4>Cultura de Segurança (ICSG)</h4>
          <div className="indice-valor" style={{ color: icsg.classificacao.cor }}>
            {icsg.valor}
          </div>
          <div className="indice-nivel">
            <Farol cor={icsg.classificacao.cor} /> {icsg.classificacao.rotulo}
          </div>
          <p className="hint">
            ICS {bbs.ics}% · ICI {bbs.ici}% · {icsg.pesoConsiderado}% dos pesos com dado.
          </p>
        </div>

        <div className="painel">
          <h3>Carteira de planos</h3>
          <div className="stat-grid">
            <div className="stat">
              <b>{planos.total}</b>
              <span>total</span>
            </div>
            <div className="stat">
              <b style={{ color: planos.atrasados > 0 ? '#dc2626' : undefined }}>{planos.atrasados}</b>
              <span>atrasados</span>
            </div>
            <div className="stat">
              <b>{planos.aderenciaAoPrazo}%</b>
              <span>aderência ao prazo</span>
            </div>
            <div className="stat">
              <b>{planos.tempoMedioFechamentoDias ?? '—'}</b>
              <span>dias médios de fechamento</span>
            </div>
          </div>
        </div>

        <div className="painel">
          <h3>Inspeção das áreas</h3>
          <div className="stat-grid">
            <div className="stat">
              <b>{inspecoes.nota ?? '—'}%</b>
              <span>áreas com inspeção em dia</span>
            </div>
            <div className="stat">
              <b style={{ color: inspecoes.atrasadas > 0 ? '#dc2626' : undefined }}>{inspecoes.atrasadas}</b>
              <span>fora do prazo</span>
            </div>
            <div className="stat">
              <b>{inspecoes.nuncaInspecionadas}</b>
              <span>nunca inspecionadas</span>
            </div>
            <div className="stat">
              <b>{conformidade.saude.impedidos}</b>
              <span>colaboradores impedidos</span>
            </div>
          </div>
          <p className="hint">A frequência mínima de cada área vem do próprio cadastro (Etapa 5).</p>
        </div>
      </div>

      <div className="painel">
        <h3>Pareto das causas</h3>
        <p className="desc">A regra 80/20: poucas causas concentram a maioria dos desvios. É por elas que se começa.</p>
        <Pareto titulo="Comportamentos inseguros" linhas={pareto.comportamentosInseguros} />
        <Pareto titulo="Condições inseguras" linhas={pareto.condicoesInseguras} />
      </div>

      {mapaCalor.length > 0 ? (
        <div className="painel">
          <h3>Mapa de calor por área</h3>
          <p className="desc">Criticidade realizada — o que a operação de fato registrou, e não o que o cadastro previu.</p>

          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Área</th>
                  <th>Comportamentos</th>
                  <th>Condições</th>
                  <th>Total</th>
                  <th>Criticidade</th>
                </tr>
              </thead>
              <tbody>
                {mapaCalor.map((linha) => (
                  <tr key={linha.area}>
                    <td>
                      <b>{linha.area}</b>
                    </td>
                    <td>{linha.comportamentosInseguros}</td>
                    <td>{linha.condicoesInseguras}</td>
                    <td>{linha.total}</td>
                    <td>
                      <span className="pill" style={{ background: `${linha.cor}22`, color: linha.cor }}>
                        {linha.criticidade}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {inspecoes.atrasadas > 0 ? (
        <div className="painel">
          <h3>Áreas fora do prazo de inspeção</h3>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Área</th>
                  <th>Cliente</th>
                  <th>Frequência</th>
                  <th>Última inspeção</th>
                  <th>Dias sem inspeção</th>
                </tr>
              </thead>
              <tbody>
                {inspecoes.linhas
                  .filter((linha) => !linha.emDia)
                  .map((linha) => (
                    <tr key={linha.areaId}>
                      <td>
                        <b>{linha.area}</b>
                        <div className="hint">{linha.codigo}</div>
                      </td>
                      <td>{linha.cliente}</td>
                      <td>a cada {linha.frequenciaInspecaoDias} dias</td>
                      <td>{linha.ultimaInspecao ? formatarDataIso(linha.ultimaInspecao) : 'nunca'}</td>
                      <td>
                        <span className="pill bad">{linha.diasSemInspecao ?? 'nunca inspecionada'}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {piramideBird.niveis.length > 0 ? (
        <div className="painel">
          <h3>Pirâmide de Bird</h3>
          <p className="desc">
            {piramideBird.totalOcorrencias} ocorrência(s) sobre uma base de {piramideBird.base} desvios observados —
            base larga com topo estreito indica programa de observação funcionando.
          </p>
          <div className="piramide">
            {piramideBird.niveis.map((nivel, indice) => (
              <div className="piramide-nivel" key={nivel.classificacao}>
                <div
                  className="piramide-faixa"
                  style={{
                    background: nivel.cor,
                    width: `${30 + indice * (60 / Math.max(1, piramideBird.niveis.length - 1))}%`,
                  }}
                >
                  {nivel.quantidade}
                </div>
                <div className="piramide-rotulo">
                  <b>{nivel.codigo}</b> {nivel.rotulo}
                  {nivel.razaoParaBase !== null ? <span className="hint"> · 1 : {nivel.razaoParaBase}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {terceiros.length > 0 ? (
        <div className="painel">
          <h3>Desempenho das contratadas</h3>
          <p className="desc">
            A nota é o percentual de planos concluídos da contratada — o que ela gerou e o quanto já tratou.
          </p>

          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Contratada</th>
                  <th>Cliente</th>
                  <th>Colaboradores</th>
                  <th>Desvios</th>
                  <th>Planos</th>
                  <th>Atrasados</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {terceiros.map((linha) => (
                  <tr key={linha.terceiroId}>
                    <td>
                      <b>{linha.terceiro}</b>
                    </td>
                    <td>{linha.cliente}</td>
                    <td>{linha.colaboradores}</td>
                    <td>{linha.desvios}</td>
                    <td>{linha.planos}</td>
                    <td>{linha.planosAtrasados > 0 ? <span className="pill bad">{linha.planosAtrasados}</span> : 0}</td>
                    <td>
                      {linha.nota === null || !linha.classificacao ? (
                        <span className="hint">sem plano</span>
                      ) : (
                        <span
                          className="pill"
                          style={{ background: `${linha.classificacao.cor}22`, color: linha.classificacao.cor }}
                        >
                          {linha.nota} · {linha.classificacao.rotulo}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
