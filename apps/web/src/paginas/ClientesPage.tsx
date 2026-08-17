import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROTULO_PORTE, ROTULO_SITUACAO, SITUACOES_CONTRATO, type PorteEmpresa, type SituacaoContrato } from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import type { ClienteApi, PaginaClientes, ResumoClientes } from '../lib/cliente-form';

const POR_PAGINA = 20;

const PILL_SITUACAO: Record<SituacaoContrato, string> = {
  ATIVO: 'ok',
  SUSPENSO: 'warn',
  ENCERRADO: 'gray',
};

const PILL_GRAU: Record<number, string> = { 1: 'ok', 2: 'warn', 3: 'orange', 4: 'bad' };

const RESUMO_VAZIO: ResumoClientes = {
  total: 0,
  ativos: 0,
  suspensos: 0,
  encerrados: 0,
  funcionariosCobertos: 0,
};

function vigenciaTexto(cliente: ClienteApi): string {
  const inicio = formatarDataIso(cliente.dataInicioContrato);
  if (!cliente.dataFimContrato) return `desde ${inicio}`;
  return `${inicio} → ${formatarDataIso(cliente.dataFimContrato)}`;
}

export function ClientesPage() {
  const { mostrar } = useToast();
  const navegar = useNavigate();

  const [carregando, setCarregando] = useState(true);
  const [semMatriz, setSemMatriz] = useState(false);
  const [pagina, setPagina] = useState<PaginaClientes | null>(null);
  const [resumo, setResumo] = useState<ResumoClientes>(RESUMO_VAZIO);

  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [situacao, setSituacao] = useState<SituacaoContrato | ''>('');
  const [grauRisco, setGrauRisco] = useState('');
  const [numeroPagina, setNumeroPagina] = useState(1);

  // Debounce da busca para não disparar uma requisição por tecla.
  useEffect(() => {
    const timer = setTimeout(() => {
      setBuscaAplicada(busca.trim());
      setNumeroPagina(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [busca]);

  const consulta = useMemo(() => {
    const parametros = new URLSearchParams({
      pagina: String(numeroPagina),
      porPagina: String(POR_PAGINA),
    });
    if (buscaAplicada) parametros.set('busca', buscaAplicada);
    if (situacao) parametros.set('situacao', situacao);
    if (grauRisco) parametros.set('grauRisco', grauRisco);
    return parametros.toString();
  }, [buscaAplicada, situacao, grauRisco, numeroPagina]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [lista, contagens] = await Promise.all([
        api.get<PaginaClientes>(`/clientes?${consulta}`),
        api.get<ResumoClientes>('/clientes/resumo'),
      ]);
      setPagina(lista);
      setResumo(contagens);
      setSemMatriz(false);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.codigo === 'MATRIZ_NAO_CADASTRADA') {
        setSemMatriz(true);
      } else {
        mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os clientes.', 'erro');
      }
    } finally {
      setCarregando(false);
    }
  }, [consulta, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function excluir(cliente: ClienteApi) {
    const confirmado = window.confirm(
      `Excluir definitivamente "${cliente.nomeFantasia}" (contrato ${cliente.numeroContrato})?\n\n` +
        'Para preservar o histórico, o normal é mudar a situação para Encerrado. ' +
        'A exclusão só deve ser usada em cadastros criados por engano.',
    );
    if (!confirmado) return;

    try {
      await api.delete(`/clientes/${cliente.id}`);
      mostrar(`${cliente.nomeFantasia} excluído.`, 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao excluir o cliente.', 'erro');
    }
  }

  if (semMatriz) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>Clientes / Contratantes</h2>
          </div>
        </div>
        <div className="painel">
          <div className="vazio">
            <div className="icone" aria-hidden="true">
              🏢
            </div>
            <h4>Conclua a Etapa 1.1 primeiro</h4>
            <p>
              Os clientes pertencem à empresa de consultoria (matriz do sistema). Cadastre a matriz para liberar este
              cadastro.
            </p>
            <Link className="btn btn-primary" to="/empresa">
              Ir para o cadastro da matriz
            </Link>
          </div>
        </div>
      </>
    );
  }

  const itens = pagina?.itens ?? [];
  const temFiltro = Boolean(buscaAplicada || situacao || grauRisco);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Clientes / Contratantes</h2>
          <p>
            Cada empresa atendida pela consultoria. É a chave de segmentação da plataforma: ranking por cliente, filtro
            dos dashboards e escopo das inspeções, planos de ação e documentos.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => navegar('/clientes/novo')}>
          ＋ Novo cliente
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="lbl">Clientes cadastrados</div>
          <div className="num">{resumo.total}</div>
        </div>
        <div className="stat">
          <div className="lbl">Contratos ativos</div>
          <div className="num" style={{ color: 'var(--green)' }}>
            {resumo.ativos}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Suspensos</div>
          <div className="num" style={{ color: 'var(--yellow)' }}>
            {resumo.suspensos}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Encerrados</div>
          <div className="num" style={{ color: 'var(--gray)' }}>
            {resumo.encerrados}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Trabalhadores cobertos</div>
          <div className="num">{resumo.funcionariosCobertos.toLocaleString('pt-BR')}</div>
          <div className="sub">contratos ativos</div>
        </div>
      </div>

      <div className="painel">
        <div className="filtros">
          <div className="campo busca">
            <label htmlFor="busca-cliente">Buscar</label>
            <input
              id="busca-cliente"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Nome, razão social, CNPJ, contrato ou cidade"
            />
          </div>
          <Campo label="Situação" htmlFor="filtro-situacao">
            <select
              id="filtro-situacao"
              className="estreito"
              value={situacao}
              onChange={(evento) => {
                setSituacao(evento.target.value as SituacaoContrato | '');
                setNumeroPagina(1);
              }}
              style={{ width: 165 }}
            >
              <option value="">Todas</option>
              {SITUACOES_CONTRATO.map((valor) => (
                <option key={valor} value={valor}>
                  {ROTULO_SITUACAO[valor]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Grau de risco" htmlFor="filtro-grau">
            <select
              id="filtro-grau"
              value={grauRisco}
              onChange={(evento) => {
                setGrauRisco(evento.target.value);
                setNumeroPagina(1);
              }}
              style={{ width: 165 }}
            >
              <option value="">Todos</option>
              {[1, 2, 3, 4].map((grau) => (
                <option key={grau} value={grau}>
                  Grau {grau}
                </option>
              ))}
            </select>
          </Campo>
          {temFiltro ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginBottom: 1 }}
              onClick={() => {
                setBusca('');
                setSituacao('');
                setGrauRisco('');
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
            Carregando clientes...
          </div>
        ) : itens.length === 0 ? (
          <div className="vazio">
            <div className="icone" aria-hidden="true">
              {temFiltro ? '🔍' : '🤝'}
            </div>
            <h4>{temFiltro ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado ainda'}</h4>
            <p>
              {temFiltro
                ? 'Ajuste a busca ou os filtros para ver outros resultados.'
                : 'Cadastre o primeiro contratante para habilitar o ranking por cliente e o filtro dos dashboards.'}
            </p>
            {!temFiltro ? (
              <button type="button" className="btn btn-primary" onClick={() => navegar('/clientes/novo')}>
                ＋ Cadastrar cliente
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>CNPJ</th>
                    <th>Contrato</th>
                    <th>Segmento</th>
                    <th>Risco</th>
                    <th>Funcionários</th>
                    <th>Meta IG</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {itens.map((cliente) => (
                    <tr key={cliente.id}>
                      <td>
                        <div className="principal">
                          <span className="marca-cor" style={{ background: cliente.corDestaque }} aria-hidden="true" />
                          {cliente.nomeFantasia}
                        </div>
                        <div className="secundario">{cliente.razaoSocial}</div>
                        <div className="secundario">
                          {cliente.cidade}/{cliente.uf}
                        </div>
                      </td>
                      <td>{cliente.formatado.cnpj}</td>
                      <td>
                        <b>{cliente.numeroContrato}</b>
                        <div className="secundario">{vigenciaTexto(cliente)}</div>
                        {cliente.contratoVencido ? <span className="pill bad">vigência vencida</span> : null}
                      </td>
                      <td>
                        {cliente.segmento ?? '—'}
                        {cliente.porte ? (
                          <div className="secundario">{ROTULO_PORTE[cliente.porte as PorteEmpresa]}</div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`pill ${PILL_GRAU[cliente.grauRisco] ?? 'gray'}`}>
                          Grau {cliente.grauRisco}
                        </span>
                      </td>
                      <td>{cliente.quantidadeFuncionarios.toLocaleString('pt-BR')}</td>
                      <td>{cliente.metaIndiceGlobal}</td>
                      <td>
                        <span className={`pill ${PILL_SITUACAO[cliente.situacao]}`}>
                          {ROTULO_SITUACAO[cliente.situacao]}
                        </span>
                      </td>
                      <td>
                        <div className="acoes-linha">
                          <Link className="btn btn-outline btn-sm" to={`/clientes/${cliente.id}`}>
                            Editar
                          </Link>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluir(cliente)}>
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagina && pagina.totalPaginas > 1 ? (
              <div className="paginacao">
                <span>
                  Página {pagina.pagina} de {pagina.totalPaginas} · {pagina.total} clientes
                </span>
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
              </div>
            ) : (
              <div className="paginacao">
                <span>{pagina?.total ?? 0} cliente(s)</span>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
