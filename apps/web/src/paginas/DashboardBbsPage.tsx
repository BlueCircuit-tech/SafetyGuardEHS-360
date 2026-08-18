import { useCallback, useEffect, useMemo, useState } from 'react';
import { Farol, Icone } from '../componentes/Icone';
import { Link } from 'react-router-dom';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import type { ItemPareto, PainelBbs } from '../lib/observacao-form';

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

interface OpcaoCentro {
  id: string;
  nome: string;
  codigo: string;
}

const CORES_NIVEL: Record<string, string> = {
  EXCELENTE: 'var(--green)',
  MUITO_BOM: 'var(--blue)',
  BOM: 'var(--yellow)',
  ATENCAO: 'var(--orange)',
  CRITICO: 'var(--red)',
};

function numero(valor: number, casas = 1): string {
  return valor.toFixed(casas).replace('.', ',');
}

/** Gráfico de Pareto: barras por causa + curva acumulada. */
function Pareto({ titulo, itens, cor }: { titulo: string; itens: ItemPareto[]; cor: string }) {
  if (itens.length === 0) {
    return (
      <div className="painel">
        <h3>{titulo}</h3>
        <p className="desc">Nenhum desvio classificado no período.</p>
      </div>
    );
  }

  const maior = Math.max(...itens.map((item) => item.quantidade));

  return (
    <div className="painel">
      <h3>{titulo}</h3>
      <p className="desc">
        As causas em destaque somam os primeiros 80% — é onde concentrar campanha e manutenção.
      </p>
      <div className="pareto">
        {itens.map((item) => (
          <div className="pareto-linha" key={item.causa}>
            <div className="pareto-causa" title={item.causa}>
              {item.causa}
            </div>
            <div className="pareto-barra">
              <span
                style={{
                  width: `${(item.quantidade / maior) * 100}%`,
                  background: item.dentroDos80 ? cor : '#cbd5e1',
                }}
              />
            </div>
            <div className="pareto-valor">
              <b>{item.quantidade}</b>
              <small>{numero(item.acumulado)}%</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardBbsPage() {
  const { mostrar } = useToast();
  const [carregando, setCarregando] = useState(true);
  const [semDados, setSemDados] = useState(false);
  const [painel, setPainel] = useState<PainelBbs | null>(null);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [centros, setCentros] = useState<OpcaoCentro[]>([]);

  const [clienteId, setClienteId] = useState('');
  const [centroNegocioId, setCentroNegocioId] = useState('');
  const [meses, setMeses] = useState('6');

  useEffect(() => {
    void Promise.allSettled([
      api.get<OpcaoCliente[]>('/clientes/opcoes?incluirInativos=true'),
      api.get<OpcaoCentro[]>('/centros-negocio/opcoes?incluirInativos=true'),
    ]).then(([c, ce]) => {
      if (c.status === 'fulfilled') setClientes(c.value);
      if (ce.status === 'fulfilled') setCentros(ce.value);
    });
  }, []);

  const consulta = useMemo(() => {
    const parametros = new URLSearchParams({ meses });
    if (clienteId) parametros.set('clienteId', clienteId);
    if (centroNegocioId) parametros.set('centroNegocioId', centroNegocioId);
    return parametros.toString();
  }, [clienteId, centroNegocioId, meses]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setPainel(await api.get<PainelBbs>(`/indicadores/bbs?${consulta}`));
      setSemDados(false);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.codigo === 'MATRIZ_NAO_CADASTRADA') {
        setSemDados(true);
      } else {
        mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os indicadores.', 'erro');
      }
    } finally {
      setCarregando(false);
    }
  }, [consulta, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando && !painel) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
        Calculando indicadores...
      </div>
    );
  }

  if (semDados || !painel) {
    return (
      <div className="painel">
        <div className="vazio">
          <div className="icone-vazio" aria-hidden="true">
              <Icone nome="grafico" tamanho={22} />
            </div>
          <h4>Sem dados para calcular</h4>
          <p>Conclua o cadastro da matriz e registre observações de campo.</p>
          <Link className="btn btn-primary" to="/empresa">
            Ir para o cadastro da matriz
          </Link>
        </div>
      </div>
    );
  }

  const { bbs, icsg, tendencia, mapaCalor, piramideBird } = painel;
  const semObservacoes = bbs.totalRegistros === 0;
  const maiorTendencia = Math.max(1, ...tendencia.pontos.map((ponto) => ponto.total));

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Dashboard BBS — Comportamento × Condição Insegura</h2>
          <p>
            Mede a maturidade da cultura de segurança. A maioria dos acidentes nasce da combinação entre comportamento
            inseguro e condição insegura — este painel separa os dois.
          </p>
        </div>
      </div>

      <div className="painel">
        <div className="filtros">
          <Campo label="Cliente" htmlFor="bbs-cliente">
            <select id="bbs-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)} style={{ width: 210 }}>
              <option value="">Todos os clientes</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Centro de negócio" htmlFor="bbs-centro">
            <select
              id="bbs-centro"
              value={centroNegocioId}
              onChange={(e) => setCentroNegocioId(e.target.value)}
              style={{ width: 210 }}
            >
              <option value="">Todos</option>
              {centros.map((centro) => (
                <option key={centro.id} value={centro.id}>
                  {centro.nome} ({centro.codigo})
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Período" htmlFor="bbs-meses">
            <select id="bbs-meses" value={meses} onChange={(e) => setMeses(e.target.value)} style={{ width: 150 }}>
              <option value="3">Últimos 3 meses</option>
              <option value="6">Últimos 6 meses</option>
              <option value="12">Últimos 12 meses</option>
            </select>
          </Campo>
          <Link className="btn btn-outline btn-sm" to="/observacoes" style={{ marginBottom: 1 }}>
            Ver observações
          </Link>
        </div>
      </div>

      {semObservacoes ? (
        <div className="painel">
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="documento" tamanho={22} />
            </div>
            <h4>Nenhuma observação no período</h4>
            <p>Registre observações de campo — pelo QR Code da área ou pelo formulário — para os indicadores aparecerem.</p>
            <Link className="btn btn-primary" to="/observacoes/nova">
              ＋ Registrar observação
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* --------------------------------------------- indicadores --- */}
          <div className="grid-indices">
            <div className="painel indice-destaque">
              <h3>Índice de Comportamento Seguro (ICS)</h3>
              <div className="indice-valor" style={{ color: CORES_NIVEL[bbs.classificacaoIcs.nivel] }}>
                {numero(bbs.ics)}%
              </div>
              <div className="indice-nivel">
                <Farol cor={bbs.classificacaoIcs.cor} /> {bbs.classificacaoIcs.rotulo}
              </div>
              <p className="desc" style={{ marginTop: 8 }}>
                {bbs.comportamentosSeguros} comportamentos seguros em {bbs.totalBbs} observações.
              </p>
            </div>

            <div className="painel indice-destaque">
              <h3>Índice de Condições Inseguras (ICI)</h3>
              <div className="indice-valor" style={{ color: bbs.ici <= 10 ? 'var(--green)' : 'var(--red)' }}>
                {numero(bbs.ici)}%
              </div>
              <div className="indice-nivel"><Farol cor={bbs.ici <= 10 ? '#16a34a' : '#dc2626'} />{' '}
                {bbs.ici <= 10 ? 'dentro da meta (≤ 10%)' : 'acima da meta (≤ 10%)'}</div>
              <p className="desc" style={{ marginTop: 8 }}>
                {bbs.condicoesInseguras} condições inseguras — infraestrutura, equipamentos e organização.
              </p>
            </div>

            <div className="painel indice-destaque">
              <h3>Índice de Cultura de Segurança (ICSG)</h3>
              <div className="indice-valor" style={{ color: CORES_NIVEL[icsg.classificacao.nivel] }}>
                {numero(icsg.valor)}
              </div>
              <div className="indice-nivel">
                <Farol cor={icsg.classificacao.cor} /> {icsg.classificacao.rotulo}
              </div>
              {icsg.pilaresSemDados.length > 0 ? (
                <p className="desc" style={{ marginTop: 8 }}>
                  Calculado com {icsg.pesoConsiderado}% dos pesos. Sem dados ainda:{' '}
                  {icsg.pilaresSemDados.length} pilar(es) — plano de ação, inspeções e treinamentos.
                </p>
              ) : null}
            </div>
          </div>

          {/* -------------------------------------------- distribuição --- */}
          <div className="grid2">
            <div className="painel">
              <h3>Distribuição das observações</h3>
              <p className="desc">
                {bbs.totalRegistros} registros no período · {bbs.totalBbs} entram no cálculo do ICS/ICI.
              </p>
              <div className="barras-bbs">
                {bbs.distribuicao.map((linha) => (
                  <div className="barra-bbs" key={linha.tipo}>
                    <div className="barra-rotulo">
                      <Farol cor={linha.cor} /> {linha.rotulo}
                    </div>
                    <div className="barra-trilho">
                      <span style={{ width: `${linha.percentual}%`, background: linha.cor }} />
                    </div>
                    <div className="barra-valor">
                      <b>{numero(linha.percentual, 0)}%</b>
                      <small>{linha.quantidade}</small>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                <span className="pill info">{bbs.melhoriasIdentificadas} melhorias identificadas</span>
                <span className="pill bad">{bbs.naoConformidades} não conformidades</span>
              </div>
            </div>

            <div className="painel">
              <h3>
                Tendência dos desvios{' '}
                <span className={`pill ${tendencia.direcao === 'MELHORANDO' ? 'ok' : tendencia.direcao === 'PIORANDO' ? 'bad' : 'gray'}`}>
                  {tendencia.simbolo} {numero(tendencia.variacao)}%
                </span>
              </h3>
              <p className="desc">Comportamentos inseguros + condições inseguras por mês. Menos é melhor.</p>
              <div className="tendencia">
                {tendencia.pontos.map((ponto) => (
                  <div className="tendencia-col" key={ponto.periodo}>
                    <div className="tendencia-barra">
                      <span
                        className="parte-condicao"
                        style={{ height: `${(ponto.condicoesInseguras / maiorTendencia) * 100}%` }}
                        title={`${ponto.condicoesInseguras} condições inseguras`}
                      />
                      <span
                        className="parte-comportamento"
                        style={{ height: `${(ponto.comportamentosInseguros / maiorTendencia) * 100}%` }}
                        title={`${ponto.comportamentosInseguros} comportamentos inseguros`}
                      />
                    </div>
                    <div className="tendencia-total">{ponto.total}</div>
                    <div className="tendencia-mes">{ponto.periodo.split('/')[0]?.slice(0, 3)}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11.5, color: 'var(--gray)' }}>
                <span>
                  <span className="legenda-cor" style={{ background: '#ca8a04' }} /> comportamento
                </span>
                <span>
                  <span className="legenda-cor" style={{ background: '#ea580c' }} /> condição
                </span>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------- paretos --- */}
          <div className="grid2">
            <Pareto titulo="Pareto — comportamentos inseguros" itens={painel.pareto.comportamentosInseguros} cor="#ca8a04" />
            <Pareto titulo="Pareto — condições inseguras" itens={painel.pareto.condicoesInseguras} cor="#ea580c" />
          </div>

          {/* -------------------------------- mapa de calor e pirâmide --- */}
          <div className="grid2">
            <div className="painel">
              <h3><Icone nome="calor" /> Mapa de calor por área</h3>
              <p className="desc">Criticidade relativa ao pior caso do período — onde concentrar inspeção agora.</p>
              {mapaCalor.length === 0 ? (
                <p className="ajuda">Nenhum desvio por área no período.</p>
              ) : (
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Área</th>
                        <th>Comportamento</th>
                        <th>Condição</th>
                        <th>Criticidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mapaCalor.map((celula) => (
                        <tr key={celula.area}>
                          <td>{celula.area}</td>
                          <td>{celula.comportamentosInseguros}</td>
                          <td>{celula.condicoesInseguras}</td>
                          <td>
                            <span className="pill" style={{ background: `${celula.cor}22`, color: celula.cor }}>
                              <Farol cor={celula.cor} /> {celula.criticidade.replace('_', '/')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="painel">
              <h3><Icone nome="piramide" /> Pirâmide de Bird</h3>
              <p className="desc">
                {piramideBird.totalOcorrencias} ocorrências sobre uma base de {piramideBird.base} desvios observados.
                Base larga com topo estreito indica programa de observação funcionando.
              </p>
              <div className="piramide">
                {piramideBird.niveis.map((nivel, indice) => (
                  <div className="piramide-nivel" key={nivel.classificacao}>
                    <div
                      className="piramide-faixa"
                      style={{
                        background: nivel.cor,
                        width: `${34 + indice * 11}%`,
                        opacity: nivel.quantidade === 0 ? 0.3 : 1,
                      }}
                    >
                      <b>{nivel.codigo}</b> {nivel.quantidade}
                    </div>
                    <div className="piramide-rotulo">
                      {nivel.rotulo}
                      {nivel.razaoParaBase ? <small> · 1 para {nivel.razaoParaBase} desvios</small> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
