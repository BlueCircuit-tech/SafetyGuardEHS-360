import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icone } from '../componentes/Icone';
import { Link, useNavigate } from 'react-router-dom';
import {
  GRAUS_RISCO_FUNCAO,
  ROTULO_GRAU_RISCO_FUNCAO,
  ROTULO_SITUACAO_COLABORADOR,
  ROTULO_VINCULO_COLABORADOR,
  SITUACOES_COLABORADOR,
  VINCULOS_COLABORADOR,
  type GrauRiscoFuncao,
  type SituacaoColaborador,
  type VinculoColaborador,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { api } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import {
  PILL_GRAU_RISCO,
  PILL_SITUACAO_COLABORADOR,
  PILL_VENCIMENTO,
  textoPrazo,
  type ColaboradorApi,
  type Paginado,
} from '../lib/saude';
import { useSessao } from '../lib/sessao';

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

const POR_PAGINA = 20;

export function ColaboradoresPage() {
  const { mostrar } = useToast();
  const navegar = useNavigate();
  const { pode } = useSessao();
  const podeEscrever = pode('saude:escrever');

  const [carregando, setCarregando] = useState(true);
  const [pagina, setPagina] = useState<Paginado<ColaboradorApi> | null>(null);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);

  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [vinculo, setVinculo] = useState<VinculoColaborador | ''>('');
  const [grauRisco, setGrauRisco] = useState<GrauRiscoFuncao | ''>('');
  const [situacao, setSituacao] = useState<SituacaoColaborador | ''>('ATIVO');
  const [somenteIrregulares, setSomenteIrregulares] = useState(false);
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
    if (vinculo) parametros.set('vinculo', vinculo);
    if (grauRisco) parametros.set('grauRisco', grauRisco);
    if (situacao) parametros.set('situacao', situacao);
    if (somenteIrregulares) parametros.set('asoIrregular', 'true');
    return parametros.toString();
  }, [buscaAplicada, clienteId, vinculo, grauRisco, situacao, somenteIrregulares, numeroPagina]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setPagina(await api.get<Paginado<ColaboradorApi>>(`/colaboradores?${consulta}`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os colaboradores.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [consulta, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function excluir(colaborador: ColaboradorApi) {
    if (!window.confirm(`Excluir "${colaborador.nome}"?\n\nSó é possível quando não há ASO nem documento no histórico.`)) {
      return;
    }

    try {
      await api.delete(`/colaboradores/${colaborador.id}`);
      mostrar(`${colaborador.nome} excluído.`, 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao excluir.', 'erro');
    }
  }

  const itens = pagina?.itens ?? [];
  const impedidos = itens.filter((item) => item.impedido).length;

  return (
    <>
      <div className="painel">
        <h3>Colaboradores</h3>
        <p className="desc">
          Quem trabalha na operação — do cliente ou das empresas contratadas. É o cadastro que dá sujeito ao ASO: sem
          ele, “exame vencido” não tem a quem se referir.
        </p>

        <div className="barra-acoes">
          {podeEscrever ? (
            <button type="button" className="btn btn-primary" onClick={() => navegar('/colaboradores/novo')}>
              + Novo colaborador
            </button>
          ) : null}
          <Link className="btn btn-outline" to="/conformidade">
            Painel de conformidade
          </Link>
          {impedidos > 0 ? (
            <span className="aviso">
              <Icone nome="alerta" /> {impedidos} nesta página {impedidos === 1 ? 'está impedido' : 'estão impedidos'} de trabalhar
            </span>
          ) : null}
        </div>

        <div className="filtros">
          <Campo label="Buscar" htmlFor="busca">
            <input
              id="busca"
              className="busca"
              placeholder="Nome, CPF, matrícula, função ou setor"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
            />
          </Campo>

          <Campo label="Cliente" htmlFor="cliente">
            <select
              id="cliente"
              value={clienteId}
              onChange={(evento) => {
                setClienteId(evento.target.value);
                setNumeroPagina(1);
              }}
            >
              <option value="">Todos</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Vínculo" htmlFor="vinculo">
            <select
              id="vinculo"
              className="estreito"
              value={vinculo}
              onChange={(evento) => {
                setVinculo(evento.target.value as VinculoColaborador | '');
                setNumeroPagina(1);
              }}
            >
              <option value="">Todos</option>
              {VINCULOS_COLABORADOR.map((item) => (
                <option key={item} value={item}>
                  {ROTULO_VINCULO_COLABORADOR[item]}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Grau de risco" htmlFor="grau">
            <select
              id="grau"
              className="estreito"
              value={grauRisco}
              onChange={(evento) => {
                setGrauRisco(evento.target.value as GrauRiscoFuncao | '');
                setNumeroPagina(1);
              }}
            >
              <option value="">Todos</option>
              {GRAUS_RISCO_FUNCAO.map((item) => (
                <option key={item} value={item}>
                  {ROTULO_GRAU_RISCO_FUNCAO[item]}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Situação" htmlFor="situacao">
            <select
              id="situacao"
              className="estreito"
              value={situacao}
              onChange={(evento) => {
                setSituacao(evento.target.value as SituacaoColaborador | '');
                setNumeroPagina(1);
              }}
            >
              <option value="">Todas</option>
              {SITUACOES_COLABORADOR.map((item) => (
                <option key={item} value={item}>
                  {ROTULO_SITUACAO_COLABORADOR[item]}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <div className="check-linha">
          <label>
            <input
              type="checkbox"
              checked={somenteIrregulares}
              onChange={(evento) => {
                setSomenteIrregulares(evento.target.checked);
                setNumeroPagina(1);
              }}
            />
            Somente quem está impedido (ASO vencido, inapto ou sem exame)
          </label>
        </div>
      </div>

      <div className="painel">
        {carregando ? (
          <div className="centro-tela">
            <div className="spinner" />
            Carregando...
          </div>
        ) : itens.length === 0 ? (
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="capacete" tamanho={22} />
            </div>
            <h4>Nenhum colaborador encontrado</h4>
            <p>Ajuste os filtros ou cadastre o primeiro colaborador deste cliente.</p>
          </div>
        ) : (
          <>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    <th>Função</th>
                    <th>Vínculo</th>
                    <th>Risco</th>
                    <th>ASO</th>
                    <th>Situação</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {itens.map((colaborador) => (
                    <tr key={colaborador.id}>
                      <td>
                        <Link to={`/colaboradores/${colaborador.id}`}>
                          <b>{colaborador.nome}</b>
                        </Link>
                        <div className="hint">
                          <span className="mono">{colaborador.cpfFormatado}</span>
                          {colaborador.matricula ? ` · mat. ${colaborador.matricula}` : ''}
                        </div>
                      </td>
                      <td>
                        {colaborador.funcao}
                        <div className="hint">{colaborador.cliente?.nomeFantasia ?? '—'}</div>
                      </td>
                      <td>
                        {colaborador.rotulos?.vinculo ?? ROTULO_VINCULO_COLABORADOR[colaborador.vinculo]}
                        {colaborador.terceiro ? <div className="hint">{colaborador.terceiro.nomeFantasia}</div> : null}
                      </td>
                      <td>
                        <span className={`pill ${PILL_GRAU_RISCO[colaborador.grauRisco]}`}>
                          {ROTULO_GRAU_RISCO_FUNCAO[colaborador.grauRisco]}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${PILL_VENCIMENTO[colaborador.situacaoAso]}`}>
                          {colaborador.situacaoAso === 'SEM_ASO' ? 'Sem ASO' : (colaborador.rotulos?.situacaoAso ?? '')}
                        </span>
                        <div className="hint">
                          {colaborador.asoAtual?.validade
                            ? `${formatarDataIso(colaborador.asoAtual.validade)} — ${textoPrazo(colaborador.diasParaVencerAso)}`
                            : 'nenhum exame com validade'}
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${PILL_SITUACAO_COLABORADOR[colaborador.situacao]}`}>
                          {ROTULO_SITUACAO_COLABORADOR[colaborador.situacao]}
                        </span>
                      </td>
                      <td>
                        <div className="acoes-linha">
                          <Link className="btn btn-ghost btn-sm" to={`/colaboradores/${colaborador.id}`}>
                            Abrir
                          </Link>
                          <Link className="btn btn-ghost btn-sm" to={`/colaboradores/${colaborador.id}/ppp`}>
                            PPP
                          </Link>
                          {podeEscrever ? (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluir(colaborador)}>
                              Excluir
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagina && pagina.totalPaginas > 1 ? (
              <div className="paginacao">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={numeroPagina <= 1}
                  onClick={() => setNumeroPagina((atual) => atual - 1)}
                >
                  Anterior
                </button>
                <span>
                  Página {pagina.pagina} de {pagina.totalPaginas} — {pagina.total} colaborador(es)
                </span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={numeroPagina >= pagina.totalPaginas}
                  onClick={() => setNumeroPagina((atual) => atual + 1)}
                >
                  Próxima
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
