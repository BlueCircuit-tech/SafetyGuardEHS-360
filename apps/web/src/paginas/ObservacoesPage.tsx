import { useCallback, useEffect, useMemo, useState } from 'react';
import { Farol, Icone } from '../componentes/Icone';
import { Link, useNavigate } from 'react-router-dom';
import { ROTULO_SITUACAO_OBSERVACAO, SITUACOES_OBSERVACAO, type SituacaoObservacao, type TipoObservacao } from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { formatarDataHora } from '../lib/datas';
import {
  PILL_SITUACAO_OBSERVACAO,
  type ObservacaoApi,
  type PaginaObservacoes,
  type ResumoObservacoes,
  type TipoObservacaoApi,
} from '../lib/observacao-form';

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

const POR_PAGINA = 20;

const RESUMO_VAZIO: ResumoObservacoes = { total: 0, registradas: 0, emTratativa: 0, concluidas: 0, prazoVencido: 0 };

export function ObservacoesPage() {
  const { mostrar } = useToast();
  const navegar = useNavigate();

  const [carregando, setCarregando] = useState(true);
  const [semMatriz, setSemMatriz] = useState(false);
  const [pagina, setPagina] = useState<PaginaObservacoes | null>(null);
  const [resumo, setResumo] = useState<ResumoObservacoes>(RESUMO_VAZIO);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [tipos, setTipos] = useState<TipoObservacaoApi[]>([]);

  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [tipo, setTipo] = useState<TipoObservacao | ''>('');
  const [situacao, setSituacao] = useState<SituacaoObservacao | ''>('');
  const [numeroPagina, setNumeroPagina] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setBuscaAplicada(busca.trim());
      setNumeroPagina(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [busca]);

  useEffect(() => {
    void Promise.allSettled([
      api.get<OpcaoCliente[]>('/clientes/opcoes?incluirInativos=true'),
      api.get<TipoObservacaoApi[]>('/observacoes/tipos'),
    ]).then(([c, t]) => {
      if (c.status === 'fulfilled') setClientes(c.value);
      if (t.status === 'fulfilled') setTipos(t.value);
    });
  }, []);

  const consulta = useMemo(() => {
    const parametros = new URLSearchParams({ pagina: String(numeroPagina), porPagina: String(POR_PAGINA) });
    if (buscaAplicada) parametros.set('busca', buscaAplicada);
    if (clienteId) parametros.set('clienteId', clienteId);
    if (tipo) parametros.set('tipo', tipo);
    if (situacao) parametros.set('situacao', situacao);
    return parametros.toString();
  }, [buscaAplicada, clienteId, tipo, situacao, numeroPagina]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const escopo = clienteId ? `?clienteId=${clienteId}` : '';
      const [lista, contagens] = await Promise.all([
        api.get<PaginaObservacoes>(`/observacoes?${consulta}`),
        api.get<ResumoObservacoes>(`/observacoes/resumo${escopo}`),
      ]);
      setPagina(lista);
      setResumo(contagens);
      setSemMatriz(false);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.codigo === 'MATRIZ_NAO_CADASTRADA') {
        setSemMatriz(true);
      } else {
        mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar as observacoes.', 'erro');
      }
    } finally {
      setCarregando(false);
    }
  }, [consulta, clienteId, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function excluir(observacao: ObservacaoApi) {
    if (!window.confirm('Excluir esta observação?\n\nEla sai dos indicadores e do histórico.')) return;

    try {
      await api.delete(`/observacoes/${observacao.id}`);
      mostrar('Observação excluída.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao excluir.', 'erro');
    }
  }

  if (semMatriz) {
    return (
      <div className="painel">
        <div className="vazio">
          <div className="icone-vazio" aria-hidden="true">
              <Icone nome="predio" tamanho={22} />
            </div>
          <h4>Conclua as etapas anteriores</h4>
          <p>As observações pertencem a uma área de um cliente.</p>
          <Link className="btn btn-primary" to="/empresa">
            Ir para o cadastro da matriz
          </Link>
        </div>
      </div>
    );
  }

  const itens = pagina?.itens ?? [];
  const temFiltro = Boolean(buscaAplicada || clienteId || tipo || situacao);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Observações de campo</h2>
          <p>
            O evento que alimenta todos os indicadores. Cada registro classifica o que foi visto e, nos desvios, avalia
            o risco e dispara a matriz de comunicação.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn btn-outline" to="/dashboard-bbs">
            <Icone nome="grafico" /> Dashboard BBS
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => navegar('/observacoes/nova')}>
            ＋ Nova observação
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="lbl">Observações</div>
          <div className="num">{resumo.total.toLocaleString('pt-BR')}</div>
        </div>
        <div className="stat">
          <div className="lbl">Registradas</div>
          <div className="num" style={{ color: 'var(--blue)' }}>
            {resumo.registradas}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Em tratativa</div>
          <div className="num" style={{ color: 'var(--yellow)' }}>
            {resumo.emTratativa}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Concluídas</div>
          <div className="num" style={{ color: 'var(--green)' }}>
            {resumo.concluidas}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Prazo vencido</div>
          <div className="num" style={{ color: resumo.prazoVencido > 0 ? 'var(--red)' : 'var(--gray)' }}>
            {resumo.prazoVencido}
          </div>
          <div className="sub">escalonamento ativo</div>
        </div>
      </div>

      <div className="painel">
        <div className="filtros">
          <div className="campo busca">
            <label htmlFor="busca-obs">Buscar</label>
            <input
              id="busca-obs"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Descrição, observador, área ou ação imediata"
            />
          </div>
          <Campo label="Cliente" htmlFor="filtro-cliente-obs">
            <select
              id="filtro-cliente-obs"
              value={clienteId}
              onChange={(e) => {
                setClienteId(e.target.value);
                setNumeroPagina(1);
              }}
              style={{ width: 190 }}
            >
              <option value="">Todos</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Tipo" htmlFor="filtro-tipo-obs">
            <select
              id="filtro-tipo-obs"
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as TipoObservacao | '');
                setNumeroPagina(1);
              }}
              style={{ width: 210 }}
            >
              <option value="">Todos</option>
              {tipos.map((item) => (
                <option key={item.tipo} value={item.tipo}>
                  <Farol cor={item.cor} /> {item.rotulo}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Situação" htmlFor="filtro-situacao-obs">
            <select
              id="filtro-situacao-obs"
              value={situacao}
              onChange={(e) => {
                setSituacao(e.target.value as SituacaoObservacao | '');
                setNumeroPagina(1);
              }}
              style={{ width: 150 }}
            >
              <option value="">Todas</option>
              {SITUACOES_OBSERVACAO.map((valor) => (
                <option key={valor} value={valor}>
                  {ROTULO_SITUACAO_OBSERVACAO[valor]}
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
                setClienteId('');
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
            Carregando observações...
          </div>
        ) : itens.length === 0 ? (
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="lupa" tamanho={22} />
            </div>
            <h4>{temFiltro ? 'Nenhuma observação encontrada' : 'Nenhuma observação registrada'}</h4>
            <p>
              {temFiltro
                ? 'Ajuste a busca ou os filtros.'
                : 'Registre pelo QR Code da área, em campo, ou pelo formulário aqui.'}
            </p>
            {!temFiltro ? (
              <button type="button" className="btn btn-primary" onClick={() => navegar('/observacoes/nova')}>
                ＋ Registrar observação
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Tipo</th>
                    <th>Onde</th>
                    <th>Descrição</th>
                    <th>Causa</th>
                    <th>Risco</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {itens.map((observacao) => (
                    <tr key={observacao.id}>
                      <td>
                        {formatarDataHora(observacao.dataHora)}
                        <div className="secundario">{observacao.observador}</div>
                      </td>
                      <td>
                        <span
                          className="pill"
                          style={{ background: `${observacao.rotulos.cor}22`, color: observacao.rotulos.cor }}
                        >
                          <Farol cor={observacao.rotulos.cor} /> {observacao.rotulos.tipo}
                        </span>
                      </td>
                      <td>
                        {observacao.area?.nome ?? '—'}
                        <div className="secundario">{observacao.cliente?.nomeFantasia}</div>
                        {observacao.terceiro ? (
                          <div className="secundario">terceiro: {observacao.terceiro.nomeFantasia}</div>
                        ) : null}
                      </td>
                      <td style={{ maxWidth: 260 }}>
                        {observacao.descricao}
                        {observacao.fotoUrl ? (
                          <div>
                            <a href={urlAbsoluta(observacao.fotoUrl) ?? '#'} target="_blank" rel="noreferrer">
                              <Icone nome="camera" /> evidência
                            </a>
                          </div>
                        ) : null}
                      </td>
                      <td>{observacao.causa?.descricao ?? <span style={{ color: 'var(--gray)' }}>—</span>}</td>
                      <td>
                        {observacao.iir === null ? (
                          <span style={{ color: 'var(--gray)' }}>—</span>
                        ) : (
                          <>
                            <span
                              className="pill"
                              style={{
                                background: `${observacao.faixaIir?.cor}22`,
                                color: observacao.faixaIir?.cor,
                              }}
                            >
                              IIR {observacao.iir} · {observacao.faixaIir?.rotulo}
                            </span>
                            <div className="secundario">grau {observacao.grauRisco}</div>
                          </>
                        )}
                      </td>
                      <td>
                        <span className={`pill ${PILL_SITUACAO_OBSERVACAO[observacao.situacao]}`}>
                          {ROTULO_SITUACAO_OBSERVACAO[observacao.situacao]}
                        </span>
                        {observacao.prazoVencido ? (
                          <div className="secundario" style={{ color: 'var(--red)' }}>
                            prazo vencido · {observacao.escalonamento?.rotuloNivel}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <div className="acoes-linha">
                          <Link className="btn btn-outline btn-sm" to={`/observacoes/${observacao.id}`}>
                            Abrir
                          </Link>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluir(observacao)}>
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
                  ? `Página ${pagina.pagina} de ${pagina.totalPaginas} · ${pagina.total} observações`
                  : `${pagina?.total ?? 0} observação(ões)`}
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
    </>
  );
}
