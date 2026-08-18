import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icone } from '../componentes/Icone';
import { Link, useNavigate } from 'react-router-dom';
import {
  CRITICIDADES_PLANO,
  ROTULO_CRITICIDADE_PLANO,
  ROTULO_STATUS_PLANO,
  STATUS_PLANO,
  type CriticidadePlano,
  type StatusPlano,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import { formatarDataHora } from '../lib/datas';
import {
  PILL_CRITICIDADE_PLANO,
  PILL_STATUS_PLANO,
  type LinhaCriticidade,
  type PaginaPlanos,
  type ResumoPlanos,
} from '../lib/plano-form';

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

const POR_PAGINA = 20;

const RESUMO_VAZIO: ResumoPlanos = {
  total: 0,
  abertos: 0,
  emAndamento: 0,
  concluidos: 0,
  cancelados: 0,
  atrasados: 0,
  escalonados: 0,
  tempoMedioFechamentoDias: null,
  aderenciaAoPrazo: null,
  percentualConcluido: null,
};

function numero(valor: number | null, sufixo = ''): string {
  if (valor === null) return '—';
  return `${String(valor).replace('.', ',')}${sufixo}`;
}

export function PlanosAcaoPage() {
  const { mostrar } = useToast();
  const navegar = useNavigate();

  const [carregando, setCarregando] = useState(true);
  const [semMatriz, setSemMatriz] = useState(false);
  const [pagina, setPagina] = useState<PaginaPlanos | null>(null);
  const [resumo, setResumo] = useState<ResumoPlanos>(RESUMO_VAZIO);
  const [criticidades, setCriticidades] = useState<LinhaCriticidade[]>([]);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [escalonando, setEscalonando] = useState(false);

  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [status, setStatus] = useState<StatusPlano | ''>('');
  const [criticidade, setCriticidade] = useState<CriticidadePlano | ''>('');
  const [soAtrasados, setSoAtrasados] = useState(false);
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
    if (criticidade) parametros.set('criticidade', criticidade);
    if (soAtrasados) parametros.set('atrasados', 'true');
    else if (status) parametros.set('status', status);
    return parametros.toString();
  }, [buscaAplicada, clienteId, status, criticidade, soAtrasados, numeroPagina]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const escopo = clienteId ? `?clienteId=${clienteId}` : '';
      const [lista, kpis, porCriticidade] = await Promise.all([
        api.get<PaginaPlanos>(`/planos-acao?${consulta}`),
        api.get<ResumoPlanos>(`/planos-acao/resumo${escopo}`),
        api.get<LinhaCriticidade[]>(`/planos-acao/por-criticidade${escopo}`),
      ]);
      setPagina(lista);
      setResumo(kpis);
      setCriticidades(porCriticidade);
      setSemMatriz(false);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.codigo === 'MATRIZ_NAO_CADASTRADA') {
        setSemMatriz(true);
      } else {
        mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os planos.', 'erro');
      }
    } finally {
      setCarregando(false);
    }
  }, [consulta, clienteId, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function escalonar() {
    setEscalonando(true);
    try {
      const resultado = await api.post<{ avaliados: number; escalonados: Array<{ codigo: string; nivel: string }> }>(
        '/planos-acao/escalonar',
        {},
      );
      mostrar(
        resultado.escalonados.length === 0
          ? `Nenhum plano precisou escalonar (${resultado.avaliados} vencido(s) avaliado(s)).`
          : `${resultado.escalonados.length} plano(s) escalonado(s): ${resultado.escalonados
              .map((item) => `${item.codigo} → ${item.nivel}`)
              .join(', ')}`,
        'sucesso',
      );
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao processar o escalonamento.', 'erro');
    } finally {
      setEscalonando(false);
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
          <Link className="btn btn-primary" to="/empresa">
            Ir para o cadastro da matriz
          </Link>
        </div>
      </div>
    );
  }

  const itens = pagina?.itens ?? [];
  const temFiltro = Boolean(buscaAplicada || clienteId || status || criticidade || soAtrasados);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Planos de ação</h2>
          <p>
            A tratativa das ocorrências. Prazo e destinatários vêm da matriz de comunicação; o escalonamento sobe de
            nível sozinho quando o prazo estoura.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn btn-outline" to="/comunicacao">
            <Icone nome="envelope" /> Comunicação
          </Link>
          <button type="button" className="btn btn-outline" disabled={escalonando} onClick={() => void escalonar()}>
            {escalonando ? 'Processando...' : 'Rodar escalonamento'}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => navegar('/planos-acao/novo')}>
            ＋ Novo plano
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="lbl">Em aberto</div>
          <div className="num">{resumo.abertos + resumo.emAndamento}</div>
          <div className="sub">
            {resumo.abertos} abertos · {resumo.emAndamento} em andamento
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Atrasados</div>
          <div className="num" style={{ color: resumo.atrasados > 0 ? 'var(--red)' : 'var(--green)' }}>
            {resumo.atrasados}
          </div>
          <div className="sub">{resumo.escalonados} já escalonados</div>
        </div>
        <div className="stat">
          <div className="lbl">Concluídos</div>
          <div className="num" style={{ color: 'var(--green)' }}>
            {resumo.concluidos}
          </div>
          <div className="sub">{numero(resumo.percentualConcluido, '%')} do total</div>
        </div>
        <div className="stat">
          <div className="lbl">Tempo médio de fechamento</div>
          <div className="num">{numero(resumo.tempoMedioFechamentoDias)}</div>
          <div className="sub">dias</div>
        </div>
        <div className="stat">
          <div className="lbl">Aderência ao prazo</div>
          <div className="num" style={{ color: (resumo.aderenciaAoPrazo ?? 0) >= 90 ? 'var(--green)' : 'var(--yellow)' }}>
            {numero(resumo.aderenciaAoPrazo, '%')}
          </div>
          <div className="sub">concluídos dentro do prazo</div>
        </div>
      </div>

      <div className="painel">
        <h3><Icone nome="alvo" /> Matriz de criticidade</h3>
        <p className="desc">Prazo padrão de cada criticidade e como está a carteira em cada faixa.</p>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Criticidade</th>
                <th>Prazo padrão</th>
                <th>Total</th>
                <th>Em aberto</th>
                <th>Atrasados</th>
                <th>Concluídos</th>
              </tr>
            </thead>
            <tbody>
              {criticidades.map((linha) => (
                <tr key={linha.criticidade}>
                  <td>
                    <span className={`pill ${PILL_CRITICIDADE_PLANO[linha.criticidade]}`}>
                      {ROTULO_CRITICIDADE_PLANO[linha.criticidade]}
                    </span>
                  </td>
                  <td>{linha.prazoPadraoHoras === 0 ? 'Imediato' : `${linha.prazoPadraoHoras}h`}</td>
                  <td>{linha.total}</td>
                  <td>{linha.emAberto}</td>
                  <td style={{ color: linha.atrasados > 0 ? 'var(--red)' : undefined, fontWeight: linha.atrasados > 0 ? 700 : 400 }}>
                    {linha.atrasados}
                  </td>
                  <td>{linha.concluidos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="painel">
        <div className="filtros">
          <div className="campo busca">
            <label htmlFor="busca-plano">Buscar</label>
            <input
              id="busca-plano"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Código, ação, responsável ou descrição"
            />
          </div>
          <Campo label="Cliente" htmlFor="filtro-cliente-plano">
            <select
              id="filtro-cliente-plano"
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
          <Campo label="Status" htmlFor="filtro-status-plano">
            <select
              id="filtro-status-plano"
              value={status}
              disabled={soAtrasados}
              onChange={(e) => {
                setStatus(e.target.value as StatusPlano | '');
                setNumeroPagina(1);
              }}
              style={{ width: 150 }}
            >
              <option value="">Todos</option>
              {STATUS_PLANO.map((valor) => (
                <option key={valor} value={valor}>
                  {ROTULO_STATUS_PLANO[valor]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Criticidade" htmlFor="filtro-criticidade-plano">
            <select
              id="filtro-criticidade-plano"
              value={criticidade}
              onChange={(e) => {
                setCriticidade(e.target.value as CriticidadePlano | '');
                setNumeroPagina(1);
              }}
              style={{ width: 140 }}
            >
              <option value="">Todas</option>
              {CRITICIDADES_PLANO.map((valor) => (
                <option key={valor} value={valor}>
                  {ROTULO_CRITICIDADE_PLANO[valor]}
                </option>
              ))}
            </select>
          </Campo>
          <label className="check-linha" style={{ marginBottom: 0 }}>
            <input
              type="checkbox"
              checked={soAtrasados}
              onChange={(e) => {
                setSoAtrasados(e.target.checked);
                setNumeroPagina(1);
              }}
            />
            Só atrasados
          </label>
          {temFiltro ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setBusca('');
                setClienteId('');
                setStatus('');
                setCriticidade('');
                setSoAtrasados(false);
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
            Carregando planos...
          </div>
        ) : itens.length === 0 ? (
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="alvo" tamanho={22} />
            </div>
            <h4>{temFiltro ? 'Nenhum plano encontrado' : 'Nenhum plano de ação'}</h4>
            <p>
              {temFiltro
                ? 'Ajuste a busca ou os filtros.'
                : 'Planos nascem das observações de campo ou podem ser abertos manualmente.'}
            </p>
          </div>
        ) : (
          <>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Plano</th>
                    <th>Ação</th>
                    <th>Onde</th>
                    <th>Responsável</th>
                    <th>Criticidade</th>
                    <th>Prazo</th>
                    <th>Escalonamento</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {itens.map((plano) => (
                    <tr key={plano.id}>
                      <td>
                        <b>{plano.codigo}</b>
                        <div className="secundario">{plano.rotulos.origem}</div>
                      </td>
                      <td style={{ maxWidth: 240 }}>{plano.acao}</td>
                      <td>
                        {plano.area?.nome ?? '—'}
                        <div className="secundario">{plano.cliente?.nomeFantasia}</div>
                        {plano.terceiro ? <div className="secundario">terceiro: {plano.terceiro.nomeFantasia}</div> : null}
                      </td>
                      <td>
                        {plano.responsavelNome}
                        {plano.responsavelCargo ? <div className="secundario">{plano.responsavelCargo}</div> : null}
                      </td>
                      <td>
                        <span className={`pill ${PILL_CRITICIDADE_PLANO[plano.criticidade]}`}>
                          {plano.rotulos.criticidade}
                        </span>
                      </td>
                      <td>
                        {formatarDataHora(plano.prazo)}
                        {plano.atrasado ? (
                          <div className="secundario" style={{ color: 'var(--red)' }}>
                            atrasado {Math.abs(plano.diasParaPrazo)}d
                          </div>
                        ) : plano.status === 'CONCLUIDO' ? (
                          <div className="secundario" style={{ color: plano.concluidoNoPrazo ? 'var(--green)' : 'var(--orange)' }}>
                            {plano.concluidoNoPrazo ? 'no prazo' : 'fora do prazo'} · {plano.tempoFechamentoDias}d
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`pill ${plano.nivelEscalonamento > 0 ? 'bad' : 'gray'}`}>
                          {plano.nivelAtual}
                        </span>
                        {plano.escalonamentoPendente ? (
                          <div className="secundario" style={{ color: 'var(--orange)' }}>
                            devido: {plano.nivelDevido}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`pill ${PILL_STATUS_PLANO[plano.status]}`}>{plano.rotulos.status}</span>
                      </td>
                      <td>
                        <div className="acoes-linha">
                          <Link className="btn btn-outline btn-sm" to={`/planos-acao/${plano.id}`}>
                            Tratar
                          </Link>
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
                  ? `Página ${pagina.pagina} de ${pagina.totalPaginas} · ${pagina.total} planos`
                  : `${pagina?.total ?? 0} plano(s)`}
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
