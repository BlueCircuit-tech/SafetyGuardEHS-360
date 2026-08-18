import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icone } from '../componentes/Icone';
import { Link, useNavigate } from 'react-router-dom';
import {
  ROTULO_SITUACAO_CENTRO,
  ROTULO_TIPO_CENTRO,
  SITUACOES_CENTRO,
  TIPOS_CENTRO_NEGOCIO,
  type SituacaoCentro,
  type TipoCentroNegocio,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import {
  PILL_SITUACAO_CENTRO,
  PILL_TIPO_CENTRO,
  type CentroApi,
  type Consolidado,
  type PaginaCentros,
  type ResumoCentros,
} from '../lib/centro-form';

const POR_PAGINA = 20;

const RESUMO_VAZIO: ResumoCentros = {
  total: 0,
  ativos: 0,
  inativos: 0,
  clientesSemCentro: 0,
  centrosSemClientes: 0,
};

export function CentrosNegocioPage() {
  const { mostrar } = useToast();
  const navegar = useNavigate();

  const [carregando, setCarregando] = useState(true);
  const [semMatriz, setSemMatriz] = useState(false);
  const [aba, setAba] = useState<'lista' | 'consolidado'>('lista');

  const [pagina, setPagina] = useState<PaginaCentros | null>(null);
  const [resumo, setResumo] = useState<ResumoCentros>(RESUMO_VAZIO);
  const [consolidado, setConsolidado] = useState<Consolidado | null>(null);

  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [tipo, setTipo] = useState<TipoCentroNegocio | ''>('');
  const [situacao, setSituacao] = useState<SituacaoCentro | ''>('');
  const [numeroPagina, setNumeroPagina] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setBuscaAplicada(busca.trim());
      setNumeroPagina(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [busca]);

  const consulta = useMemo(() => {
    const parametros = new URLSearchParams({ pagina: String(numeroPagina), porPagina: String(POR_PAGINA) });
    if (buscaAplicada) parametros.set('busca', buscaAplicada);
    if (tipo) parametros.set('tipo', tipo);
    if (situacao) parametros.set('situacao', situacao);
    return parametros.toString();
  }, [buscaAplicada, tipo, situacao, numeroPagina]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [lista, contagens, consolidacao] = await Promise.all([
        api.get<PaginaCentros>(`/centros-negocio?${consulta}`),
        api.get<ResumoCentros>('/centros-negocio/resumo'),
        api.get<Consolidado>('/centros-negocio/consolidado'),
      ]);
      setPagina(lista);
      setResumo(contagens);
      setConsolidado(consolidacao);
      setSemMatriz(false);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.codigo === 'MATRIZ_NAO_CADASTRADA') {
        setSemMatriz(true);
      } else {
        mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os centros.', 'erro');
      }
    } finally {
      setCarregando(false);
    }
  }, [consulta, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function excluir(centro: CentroApi) {
    if (!window.confirm(`Excluir o centro de negócio "${centro.nome}"?`)) return;

    try {
      await api.delete(`/centros-negocio/${centro.id}`);
      mostrar(`${centro.nome} excluído.`, 'sucesso');
      void carregar();
    } catch (erro) {
      // O erro mais comum aqui é o bloqueio por clientes vinculados — a
      // mensagem da API já explica o que fazer.
      mostrar(erro instanceof Error ? erro.message : 'Falha ao excluir o centro.', 'erro');
    }
  }

  if (semMatriz) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>Centros de Negócio / Unidades</h2>
          </div>
        </div>
        <div className="painel">
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="predio" tamanho={22} />
            </div>
            <h4>Conclua a Etapa 1.1 primeiro</h4>
            <p>Os centros de negócio pertencem à empresa de consultoria (matriz do sistema).</p>
            <Link className="btn btn-primary" to="/empresa">
              Ir para o cadastro da matriz
            </Link>
          </div>
        </div>
      </>
    );
  }

  const itens = pagina?.itens ?? [];
  const temFiltro = Boolean(buscaAplicada || tipo || situacao);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Centros de Negócio / Unidades</h2>
          <p>
            Agrupamento intermediário entre a matriz e os clientes — por regional, por unidade ou por tipo de contrato.
            É um dos filtros transversais dos dashboards e desce em cascata para clientes e terceiros.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => navegar('/centros-negocio/novo')}>
          ＋ Novo centro
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="lbl">Centros cadastrados</div>
          <div className="num">{resumo.total}</div>
          <div className="sub">{resumo.ativos} ativos</div>
        </div>
        <div className="stat">
          <div className="lbl">Inativos</div>
          <div className="num" style={{ color: 'var(--gray)' }}>
            {resumo.inativos}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Clientes sem centro</div>
          <div className="num" style={{ color: resumo.clientesSemCentro > 0 ? 'var(--orange)' : 'var(--green)' }}>
            {resumo.clientesSemCentro}
          </div>
          <div className="sub">ficam fora do filtro por centro</div>
        </div>
        <div className="stat">
          <div className="lbl">Centros sem clientes</div>
          <div className="num" style={{ color: resumo.centrosSemClientes > 0 ? 'var(--yellow)' : 'var(--green)' }}>
            {resumo.centrosSemClientes}
          </div>
          <div className="sub">agrupamento ocioso</div>
        </div>
      </div>

      {resumo.clientesSemCentro > 0 ? (
        <div className="hint">
          <Icone nome="local" /> <b>{resumo.clientesSemCentro} cliente(s) sem centro de negócio.</b> Eles continuam funcionando
          normalmente, mas não aparecem quando o dashboard é filtrado por centro.{' '}
          <Link to="/clientes?semCentro=1">Ver quais são</Link>.
        </div>
      ) : null}

      <div className="abas" role="tablist">
        <button type="button" role="tab" className={aba === 'lista' ? 'on' : ''} onClick={() => setAba('lista')}>
          Cadastro
        </button>
        <button
          type="button"
          role="tab"
          className={aba === 'consolidado' ? 'on' : ''}
          onClick={() => setAba('consolidado')}
        >
          Consolidado por centro
        </button>
      </div>

      {aba === 'consolidado' ? (
        <div className="painel">
          <h3><Icone nome="grafico" /> Consolidado por centro</h3>
          <p className="desc">
            Quanta operação cada agrupamento carrega. É a base do comparativo entre centros no dashboard executivo.
          </p>

          {!consolidado || consolidado.centros.length === 0 ? (
            <div className="vazio">
              <div className="icone-vazio" aria-hidden="true">
              <Icone nome="grafico" tamanho={22} />
            </div>
              <h4>Nenhum centro cadastrado</h4>
              <p>Cadastre os centros e vincule os clientes para ver o comparativo.</p>
            </div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Centro</th>
                    <th>Tipo</th>
                    <th>Clientes</th>
                    <th>Terceiros</th>
                    <th>Trabalhadores</th>
                    <th>Meta IG</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {consolidado.centros.map((linha) => (
                    <tr key={linha.id}>
                      <td>
                        <div className="principal">
                          <span className="marca-cor" style={{ background: linha.corDestaque }} aria-hidden="true" />
                          <Link to={`/centros-negocio/${linha.id}`}>{linha.nome}</Link>
                        </div>
                        <div className="secundario">
                          <code>{linha.codigo}</code>
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${PILL_TIPO_CENTRO[linha.tipo]}`}>{ROTULO_TIPO_CENTRO[linha.tipo]}</span>
                      </td>
                      <td>
                        <b>{linha.clientes}</b>
                        {linha.clientes !== linha.clientesAtivos ? (
                          <div className="secundario">{linha.clientesAtivos} ativos</div>
                        ) : null}
                      </td>
                      <td>{linha.terceiros}</td>
                      <td>{linha.funcionariosCobertos.toLocaleString('pt-BR')}</td>
                      <td>{linha.metaIndiceGlobal}</td>
                      <td>
                        <span className={`pill ${PILL_SITUACAO_CENTRO[linha.situacao]}`}>
                          {ROTULO_SITUACAO_CENTRO[linha.situacao]}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {consolidado.clientesSemCentro > 0 ? (
                    <tr>
                      <td>
                        <div className="principal" style={{ color: 'var(--gray)' }}>
                          <span className="marca-cor" style={{ background: '#cbd5e1' }} aria-hidden="true" />
                          Sem centro de negócio
                        </div>
                      </td>
                      <td>—</td>
                      <td>
                        <b>{consolidado.clientesSemCentro}</b>
                      </td>
                      <td colSpan={4} style={{ color: 'var(--gray)' }}>
                        não entram no filtro por centro
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="painel">
          <div className="filtros">
            <div className="campo busca">
              <label htmlFor="busca-centro">Buscar</label>
              <input
                id="busca-centro"
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                placeholder="Nome, código, responsável ou cidade"
              />
            </div>
            <Campo label="Tipo" htmlFor="filtro-tipo-centro">
              <select
                id="filtro-tipo-centro"
                value={tipo}
                onChange={(evento) => {
                  setTipo(evento.target.value as TipoCentroNegocio | '');
                  setNumeroPagina(1);
                }}
                style={{ width: 180 }}
              >
                <option value="">Todos</option>
                {TIPOS_CENTRO_NEGOCIO.map((valor) => (
                  <option key={valor} value={valor}>
                    {ROTULO_TIPO_CENTRO[valor]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Situação" htmlFor="filtro-situacao-centro">
              <select
                id="filtro-situacao-centro"
                value={situacao}
                onChange={(evento) => {
                  setSituacao(evento.target.value as SituacaoCentro | '');
                  setNumeroPagina(1);
                }}
                style={{ width: 140 }}
              >
                <option value="">Todas</option>
                {SITUACOES_CENTRO.map((valor) => (
                  <option key={valor} value={valor}>
                    {ROTULO_SITUACAO_CENTRO[valor]}
                  </option>
                ))}
              </select>
            </Campo>
            {temFiltro ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setBusca('');
                  setTipo('');
                  setSituacao('');
                  setNumeroPagina(1);
                }}
              >
                Limpar filtros
              </button>
            ) : null}
          </div>

          {carregando && !pagina ? (
            <div className="vazio">
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              Carregando centros...
            </div>
          ) : itens.length === 0 ? (
            <div className="vazio">
              <div className="icone-vazio" aria-hidden="true">
              <Icone nome="pasta" tamanho={22} />
            </div>
              <h4>{temFiltro ? 'Nenhum centro encontrado' : 'Nenhum centro de negócio cadastrado'}</h4>
              <p>
                {temFiltro
                  ? 'Ajuste a busca ou os filtros para ver outros resultados.'
                  : 'Use centros de negócio quando a operação for organizada por regional, por unidade do cliente ou por tipo de contrato. O cadastro é opcional — clientes sem centro continuam funcionando.'}
              </p>
              {!temFiltro ? (
                <button type="button" className="btn btn-primary" onClick={() => navegar('/centros-negocio/novo')}>
                  ＋ Cadastrar centro
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Centro</th>
                      <th>Tipo</th>
                      <th>Responsável</th>
                      <th>Local</th>
                      <th>Clientes</th>
                      <th>Meta IG</th>
                      <th>Situação</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((centro) => (
                      <tr key={centro.id}>
                        <td>
                          <div className="principal">
                            <span className="marca-cor" style={{ background: centro.corDestaque }} aria-hidden="true" />
                            {centro.nome}
                          </div>
                          <div className="secundario">
                            <code>{centro.codigo}</code>
                          </div>
                          {centro.descricao ? <div className="secundario">{centro.descricao}</div> : null}
                        </td>
                        <td>
                          <span className={`pill ${PILL_TIPO_CENTRO[centro.tipo]}`}>
                            {ROTULO_TIPO_CENTRO[centro.tipo]}
                          </span>
                        </td>
                        <td>
                          {centro.responsavelNome}
                          {centro.responsavelCargo ? (
                            <div className="secundario">{centro.responsavelCargo}</div>
                          ) : null}
                          <div className="secundario">{centro.responsavelEmail}</div>
                        </td>
                        <td>{centro.cidade ? `${centro.cidade}/${centro.uf ?? ''}` : '—'}</td>
                        <td>
                          {centro.quantidadeClientes > 0 ? (
                            <Link to={`/clientes?centro=${centro.id}`}>{centro.quantidadeClientes}</Link>
                          ) : (
                            <span style={{ color: 'var(--gray)' }}>0</span>
                          )}
                        </td>
                        <td>{centro.metaIndiceGlobal}</td>
                        <td>
                          <span className={`pill ${PILL_SITUACAO_CENTRO[centro.situacao]}`}>
                            {ROTULO_SITUACAO_CENTRO[centro.situacao]}
                          </span>
                        </td>
                        <td>
                          <div className="acoes-linha">
                            <Link className="btn btn-outline btn-sm" to={`/centros-negocio/${centro.id}`}>
                              Editar
                            </Link>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluir(centro)}>
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="paginacao">
                <span>
                  {pagina && pagina.totalPaginas > 1
                    ? `Página ${pagina.pagina} de ${pagina.totalPaginas} · ${pagina.total} centros`
                    : `${pagina?.total ?? 0} centro(s)`}
                </span>
                {pagina && pagina.totalPaginas > 1 ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={pagina.pagina <= 1}
                      onClick={() => setNumeroPagina((atual) => atual - 1)}
                    >
                      ← Anterior
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={pagina.pagina >= pagina.totalPaginas}
                      onClick={() => setNumeroPagina((atual) => atual + 1)}
                    >
                      Próxima →
                    </button>
                  </>
                ) : null}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
