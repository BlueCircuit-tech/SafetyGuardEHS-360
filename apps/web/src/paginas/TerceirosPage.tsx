import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icone } from '../componentes/Icone';
import { Link, useNavigate } from 'react-router-dom';
import {
  CLASSIFICACOES_SSMA,
  ROTULO_SITUACAO_TERCEIRO,
  SITUACOES_TERCEIRO,
  type SituacaoTerceiro,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import {
  PILL_CLASSIFICACAO,
  PILL_SITUACAO_TERCEIRO,
  type ItemRanking,
  type PaginaTerceiros,
  type ResumoTerceiros,
  type TerceiroApi,
} from '../lib/terceiro-form';

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
  numeroContrato: string;
}

const POR_PAGINA = 20;

const PILL_GRAU: Record<number, string> = { 1: 'ok', 2: 'warn', 3: 'orange', 4: 'bad' };

const RESUMO_VAZIO: ResumoTerceiros = {
  total: 0,
  ativos: 0,
  bloqueados: 0,
  documentacaoVencida: 0,
  semAvaliacao: 0,
  funcionariosAlocados: 0,
  notaMedia: null,
};

export function TerceirosPage() {
  const { mostrar } = useToast();
  const navegar = useNavigate();

  const [carregando, setCarregando] = useState(true);
  const [semMatriz, setSemMatriz] = useState(false);
  const [aba, setAba] = useState<'lista' | 'ranking'>('lista');

  const [pagina, setPagina] = useState<PaginaTerceiros | null>(null);
  const [resumo, setResumo] = useState<ResumoTerceiros>(RESUMO_VAZIO);
  const [ranking, setRanking] = useState<ItemRanking[]>([]);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);

  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [situacao, setSituacao] = useState<SituacaoTerceiro | ''>('');
  const [classificacao, setClassificacao] = useState('');
  const [soPendencias, setSoPendencias] = useState(false);
  const [numeroPagina, setNumeroPagina] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setBuscaAplicada(busca.trim());
      setNumeroPagina(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [busca]);

  useEffect(() => {
    api
      .get<OpcaoCliente[]>('/clientes/opcoes?incluirInativos=true')
      .then(setClientes)
      .catch(() => setClientes([]));
  }, []);

  const consulta = useMemo(() => {
    const parametros = new URLSearchParams({ pagina: String(numeroPagina), porPagina: String(POR_PAGINA) });
    if (buscaAplicada) parametros.set('busca', buscaAplicada);
    if (clienteId) parametros.set('clienteId', clienteId);
    if (situacao) parametros.set('situacao', situacao);
    if (classificacao) parametros.set('classificacao', classificacao);
    if (soPendencias) parametros.set('documentacaoVencida', 'true');
    return parametros.toString();
  }, [buscaAplicada, clienteId, situacao, classificacao, soPendencias, numeroPagina]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const escopo = clienteId ? `?clienteId=${clienteId}` : '';
      const [lista, contagens, top] = await Promise.all([
        api.get<PaginaTerceiros>(`/terceiros?${consulta}`),
        api.get<ResumoTerceiros>(`/terceiros/resumo${escopo}`),
        api.get<ItemRanking[]>(`/terceiros/ranking${escopo}`),
      ]);
      setPagina(lista);
      setResumo(contagens);
      setRanking(top);
      setSemMatriz(false);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.codigo === 'MATRIZ_NAO_CADASTRADA') {
        setSemMatriz(true);
      } else {
        mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os terceiros.', 'erro');
      }
    } finally {
      setCarregando(false);
    }
  }, [consulta, clienteId, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function excluir(terceiro: TerceiroApi) {
    const confirmado = window.confirm(
      `Excluir definitivamente "${terceiro.nomeFantasia}"?\n\n` +
        'Para preservar o histórico de desempenho, o normal é mudar a situação para Encerrado.',
    );
    if (!confirmado) return;

    try {
      await api.delete(`/terceiros/${terceiro.id}`);
      mostrar(`${terceiro.nomeFantasia} excluído.`, 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao excluir o terceiro.', 'erro');
    }
  }

  if (semMatriz) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>Empresas Contratadas / Terceiros</h2>
          </div>
        </div>
        <div className="painel">
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="predio" tamanho={22} />
            </div>
            <h4>Conclua as etapas anteriores</h4>
            <p>Terceiros atuam dentro da operação de um cliente — é preciso ter a matriz e ao menos um cliente.</p>
            <Link className="btn btn-primary" to="/empresa">
              Ir para o cadastro da matriz
            </Link>
          </div>
        </div>
      </>
    );
  }

  const itens = pagina?.itens ?? [];
  const temFiltro = Boolean(buscaAplicada || clienteId || situacao || classificacao || soPendencias);
  const semClientes = clientes.length === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Empresas Contratadas / Terceiros</h2>
          <p>
            Empresas terceirizadas que atuam dentro da operação do cliente. Cada uma recebe nota e posição no ranking
            de desempenho SSMA.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={semClientes}
          title={semClientes ? 'Cadastre um cliente primeiro' : undefined}
          onClick={() => navegar('/terceiros/novo')}
        >
          ＋ Novo terceiro
        </button>
      </div>

      {semClientes ? (
        <div className="hint alerta">
          <Icone nome="alerta" /> Nenhum cliente cadastrado. Um terceiro sempre atua dentro da operação de um cliente —{' '}
          <Link to="/clientes/novo">cadastre um cliente</Link> antes.
        </div>
      ) : null}

      <div className="stat-grid">
        <div className="stat">
          <div className="lbl">Terceiros</div>
          <div className="num">{resumo.total}</div>
          <div className="sub">{resumo.ativos} ativos</div>
        </div>
        <div className="stat">
          <div className="lbl">Bloqueados</div>
          <div className="num" style={{ color: 'var(--red)' }}>
            {resumo.bloqueados}
          </div>
          <div className="sub">sem liberação de acesso</div>
        </div>
        <div className="stat">
          <div className="lbl">Documentação vencida</div>
          <div className="num" style={{ color: 'var(--orange)' }}>
            {resumo.documentacaoVencida}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Nota média SSMA</div>
          <div className="num" style={{ color: 'var(--primary)' }}>
            {resumo.notaMedia === null ? '—' : resumo.notaMedia.toFixed(1).replace('.', ',')}
          </div>
          <div className="sub">{resumo.semAvaliacao} sem avaliação</div>
        </div>
        <div className="stat">
          <div className="lbl">Trabalhadores alocados</div>
          <div className="num">{resumo.funcionariosAlocados.toLocaleString('pt-BR')}</div>
          <div className="sub">terceiros ativos</div>
        </div>
      </div>

      <div className="abas" role="tablist">
        <button type="button" role="tab" className={aba === 'lista' ? 'on' : ''} onClick={() => setAba('lista')}>
          Cadastro
        </button>
        <button type="button" role="tab" className={aba === 'ranking' ? 'on' : ''} onClick={() => setAba('ranking')}>
          Ranking de desempenho
        </button>
      </div>

      {aba === 'ranking' ? (
        <div className="painel">
          <h3><Icone nome="premio" /> Ranking de desempenho SSMA</h3>
          <p className="desc">
            Ordenado pela nota de desempenho. Terceiros ainda não avaliados não ocupam posição — aparecem como “sem
            avaliação” na aba de cadastro.
          </p>

          <div className="filtros">
            <Campo label="Cliente" htmlFor="ranking-cliente">
              <select
                id="ranking-cliente"
                value={clienteId}
                onChange={(evento) => setClienteId(evento.target.value)}
                style={{ width: 260 }}
              >
                <option value="">Todos os clientes</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nomeFantasia}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          {ranking.length === 0 ? (
            <div className="vazio">
              <div className="icone-vazio" aria-hidden="true">
              <Icone nome="grafico" tamanho={22} />
            </div>
              <h4>Nenhum terceiro avaliado ainda</h4>
              <p>
                Lance a nota SSMA no cadastro do terceiro para montar o ranking. Quando as inspeções entrarem, a nota
                passa a ser calculada automaticamente.
              </p>
            </div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Terceiro</th>
                    <th>Cliente</th>
                    <th>Nota SSMA</th>
                    <th>Classe</th>
                    <th>Meta</th>
                    <th>Risco</th>
                    <th>Última avaliação</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <b>{item.posicao}º</b>
                      </td>
                      <td>
                        <div className="principal">
                          <span className="marca-cor" style={{ background: item.corDestaque }} aria-hidden="true" />
                          <Link to={`/terceiros/${item.id}`}>{item.nomeFantasia}</Link>
                        </div>
                        <div className="secundario">{item.atividadePrincipal}</div>
                      </td>
                      <td>{item.cliente.nomeFantasia}</td>
                      <td>
                        <b style={{ fontSize: 15, color: item.abaixoDaMeta ? 'var(--red)' : 'var(--green)' }}>
                          {item.notaSsma.toFixed(1).replace('.', ',')}
                        </b>
                        <div className="barra-nota" aria-hidden="true">
                          <span
                            style={{
                              width: `${Math.min(100, item.notaSsma)}%`,
                              background: item.abaixoDaMeta ? 'var(--red)' : 'var(--green)',
                            }}
                          />
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${item.classificacao ? PILL_CLASSIFICACAO[item.classificacao] : 'gray'}`}>
                          {item.classificacao} · {item.classificacaoRotulo}
                        </span>
                      </td>
                      <td>{item.metaNotaSsma}</td>
                      <td>
                        <span className={`pill ${PILL_GRAU[item.grauRisco] ?? 'gray'}`}>Grau {item.grauRisco}</span>
                      </td>
                      <td>{formatarDataIso(item.dataUltimaAvaliacao)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="painel">
          <div className="filtros">
            <div className="campo busca">
              <label htmlFor="busca-terceiro">Buscar</label>
              <input
                id="busca-terceiro"
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                placeholder="Nome, razão social, CNPJ, contrato ou atividade"
              />
            </div>
            <Campo label="Cliente" htmlFor="filtro-cliente">
              <select
                id="filtro-cliente"
                value={clienteId}
                onChange={(evento) => {
                  setClienteId(evento.target.value);
                  setNumeroPagina(1);
                }}
                style={{ width: 210 }}
              >
                <option value="">Todos</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nomeFantasia}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Situação" htmlFor="filtro-situacao-terceiro">
              <select
                id="filtro-situacao-terceiro"
                value={situacao}
                onChange={(evento) => {
                  setSituacao(evento.target.value as SituacaoTerceiro | '');
                  setNumeroPagina(1);
                }}
                style={{ width: 150 }}
              >
                <option value="">Todas</option>
                {SITUACOES_TERCEIRO.map((valor) => (
                  <option key={valor} value={valor}>
                    {ROTULO_SITUACAO_TERCEIRO[valor]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Classe" htmlFor="filtro-classe">
              <select
                id="filtro-classe"
                value={classificacao}
                onChange={(evento) => {
                  setClassificacao(evento.target.value);
                  setNumeroPagina(1);
                }}
                style={{ width: 110 }}
              >
                <option value="">Todas</option>
                {CLASSIFICACOES_SSMA.map((letra) => (
                  <option key={letra} value={letra}>
                    {letra}
                  </option>
                ))}
              </select>
            </Campo>
            <label className="check-linha" style={{ marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={soPendencias}
                onChange={(evento) => {
                  setSoPendencias(evento.target.checked);
                  setNumeroPagina(1);
                }}
              />
              Só documentação vencida
            </label>
            {temFiltro ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setBusca('');
                  setClienteId('');
                  setSituacao('');
                  setClassificacao('');
                  setSoPendencias(false);
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
              Carregando terceiros...
            </div>
          ) : itens.length === 0 ? (
            <div className="vazio">
              <div className="icone-vazio" aria-hidden="true">
              <Icone nome="ferramenta" tamanho={22} />
            </div>
              <h4>{temFiltro ? 'Nenhum terceiro encontrado' : 'Nenhum terceiro cadastrado ainda'}</h4>
              <p>
                {temFiltro
                  ? 'Ajuste a busca ou os filtros para ver outros resultados.'
                  : 'Cadastre as empresas terceirizadas que atuam dentro da operação dos seus clientes.'}
              </p>
              {!temFiltro && !semClientes ? (
                <button type="button" className="btn btn-primary" onClick={() => navegar('/terceiros/novo')}>
                  ＋ Cadastrar terceiro
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Terceiro</th>
                      <th>Cliente</th>
                      <th>Atividade</th>
                      <th>Nota / classe</th>
                      <th>Risco</th>
                      <th>Alocados</th>
                      <th>Documentação</th>
                      <th>Situação</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((terceiro) => (
                      <tr key={terceiro.id}>
                        <td>
                          <div className="principal">
                            <span className="marca-cor" style={{ background: terceiro.corDestaque }} aria-hidden="true" />
                            {terceiro.nomeFantasia}
                          </div>
                          <div className="secundario">{terceiro.razaoSocial}</div>
                          <div className="secundario">{terceiro.formatado.cnpj}</div>
                        </td>
                        <td>
                          {terceiro.cliente?.nomeFantasia ?? '—'}
                          {terceiro.numeroContrato ? (
                            <div className="secundario">{terceiro.numeroContrato}</div>
                          ) : null}
                        </td>
                        <td>
                          {terceiro.atividadePrincipal}
                          {terceiro.areasAtuacao ? <div className="secundario">{terceiro.areasAtuacao}</div> : null}
                        </td>
                        <td>
                          {terceiro.notaSsma === null ? (
                            <span className="pill gray">sem avaliação</span>
                          ) : (
                            <>
                              <b style={{ color: terceiro.abaixoDaMeta ? 'var(--red)' : 'var(--green)' }}>
                                {terceiro.notaSsma.toFixed(1).replace('.', ',')}
                              </b>{' '}
                              <span
                                className={`pill ${
                                  terceiro.classificacao ? PILL_CLASSIFICACAO[terceiro.classificacao] : 'gray'
                                }`}
                              >
                                {terceiro.classificacao}
                              </span>
                              {terceiro.abaixoDaMeta ? (
                                <div className="secundario" style={{ color: 'var(--red)' }}>
                                  abaixo da meta ({terceiro.metaNotaSsma})
                                </div>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td>
                          <span className={`pill ${PILL_GRAU[terceiro.grauRisco] ?? 'gray'}`}>
                            Grau {terceiro.grauRisco}
                          </span>
                        </td>
                        <td>{terceiro.quantidadeFuncionarios}</td>
                        <td>
                          {terceiro.pendenciaDocumental ? (
                            <>
                              <span className="pill bad">pendência</span>
                              <div className="secundario">
                                {!terceiro.possuiPgr ? 'sem PGR · ' : ''}
                                {!terceiro.possuiPcmso ? 'sem PCMSO · ' : ''}
                                {terceiro.documentacaoVencida ? 'pasta vencida' : ''}
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="pill ok">em dia</span>
                              {terceiro.documentacaoValidaAte ? (
                                <div className="secundario">até {formatarDataIso(terceiro.documentacaoValidaAte)}</div>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td>
                          <span className={`pill ${PILL_SITUACAO_TERCEIRO[terceiro.situacao]}`}>
                            {ROTULO_SITUACAO_TERCEIRO[terceiro.situacao]}
                          </span>
                          {terceiro.atuacaoVencida ? (
                            <div className="secundario" style={{ color: 'var(--red)' }}>
                              atuação vencida
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <div className="acoes-linha">
                            <Link className="btn btn-outline btn-sm" to={`/terceiros/${terceiro.id}`}>
                              Editar
                            </Link>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => void excluir(terceiro)}
                            >
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
                    ? `Página ${pagina.pagina} de ${pagina.totalPaginas} · ${pagina.total} terceiros`
                    : `${pagina?.total ?? 0} terceiro(s)`}
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
