import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  NORMAS_SUGERIDAS,
  ROTULO_SITUACAO_CAPACITACAO,
  SITUACOES_CAPACITACAO,
  type SituacaoCapacitacao,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import { textoPrazo } from '../lib/saude';
import { useSessao } from '../lib/sessao';

/* -------------------------------------------------------------------------- */
/* Tipos das respostas                                                         */
/* -------------------------------------------------------------------------- */

interface TreinamentoApi {
  id: string;
  nome: string;
  norma: string | null;
  descricao: string | null;
  cargaHorariaHoras: string;
  validadeMeses: number | null;
  ativo: boolean;
  _count?: { requisitos: number; realizacoes: number };
}

interface RequisitoApi {
  id: string;
  funcao: string;
  treinamento: { id: string; nome: string; norma: string | null; validadeMeses: number | null };
}

interface LinhaMatrizApi {
  colaboradorId: string;
  colaborador: string;
  funcao: string;
  cliente: string;
  terceiro: string | null;
  treinamentoId: string;
  treinamento: string;
  norma: string | null;
  dataRealizacao: string | null;
  validade: string | null;
  diasParaVencer: number | null;
  situacao: SituacaoCapacitacao;
  rotuloSituacao: string;
}

interface MatrizApi {
  resumo: {
    totalRequisitos: number;
    emDia: number;
    ok: number;
    aVencer: number;
    vencidos: number;
    semTreinamento: number;
    percentualEmDia: number | null;
    colaboradoresCobertos: number;
  };
  linhas: LinhaMatrizApi[];
}

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

interface OpcaoColaborador {
  id: string;
  nome: string;
  funcao: string;
  cpfFormatado: string;
}

const PILL_CAPACITACAO: Record<SituacaoCapacitacao, string> = {
  OK: 'ok',
  A_VENCER: 'warn',
  VENCIDO: 'bad',
  SEM_TREINAMENTO: 'bad',
};

const TREINAMENTO_VAZIO = { nome: '', norma: '', cargaHorariaHoras: '8', validadeMeses: '', descricao: '' };
const REALIZACAO_VAZIA = { colaboradorId: '', treinamentoId: '', dataRealizacao: '', validade: '', instrutor: '' };

export function TreinamentosPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('saude:escrever');

  const [aba, setAba] = useState<'matriz' | 'catalogo' | 'registro'>('matriz');
  const [carregando, setCarregando] = useState(true);

  const [matriz, setMatriz] = useState<MatrizApi | null>(null);
  const [catalogo, setCatalogo] = useState<TreinamentoApi[]>([]);
  const [requisitos, setRequisitos] = useState<RequisitoApi[]>([]);
  const [funcoes, setFuncoes] = useState<string[]>([]);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [colaboradores, setColaboradores] = useState<OpcaoColaborador[]>([]);

  const [clienteId, setClienteId] = useState('');
  const [situacao, setSituacao] = useState<SituacaoCapacitacao | ''>('');
  const [busca, setBusca] = useState('');

  const [novoTreinamento, setNovoTreinamento] = useState(TREINAMENTO_VAZIO);
  const [novoRequisito, setNovoRequisito] = useState<{ funcao: string; treinamentoIds: string[] }>({
    funcao: '',
    treinamentoIds: [],
  });
  const [novaRealizacao, setNovaRealizacao] = useState(REALIZACAO_VAZIA);
  const [salvando, setSalvando] = useState(false);
  /** Última realização registrada — permite anexar o certificado logo em seguida. */
  const [ultimaRealizacao, setUltimaRealizacao] = useState<
    { id: string; colaboradorId: string; descricao: string; certificadoEnviado: boolean } | null
  >(null);
  const [enviandoCertificado, setEnviandoCertificado] = useState(false);
  /** Link da plataforma de treinamentos (Configurações > Empresa). `undefined` = ainda carregando. */
  const [urlPlataforma, setUrlPlataforma] = useState<string | null | undefined>(undefined);

  const carregarMatriz = useCallback(async () => {
    setCarregando(true);
    try {
      const parametros = new URLSearchParams();
      if (clienteId) parametros.set('clienteId', clienteId);
      if (situacao) parametros.set('situacao', situacao);
      if (busca.trim()) parametros.set('busca', busca.trim());
      setMatriz(await api.get<MatrizApi>(`/capacitacao/matriz?${parametros.toString()}`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar a matriz.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [clienteId, situacao, busca, mostrar]);

  const carregarApoio = useCallback(async () => {
    const [treinamentos, listaRequisitos, listaFuncoes] = await Promise.all([
      api.get<TreinamentoApi[]>('/treinamentos?incluirInativos=true').catch(() => []),
      api.get<RequisitoApi[]>('/capacitacao/requisitos').catch(() => []),
      api.get<string[]>('/capacitacao/funcoes').catch(() => []),
    ]);
    setCatalogo(treinamentos);
    setRequisitos(listaRequisitos);
    setFuncoes(listaFuncoes);
  }, []);

  useEffect(() => {
    void api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
    void api.get<OpcaoColaborador[]>('/colaboradores/opcoes').then(setColaboradores).catch(() => setColaboradores([]));
    void carregarApoio();
    void api
      .get<{ urlPlataformaTreinamentos?: string | null }>('/empresa')
      .then((empresa) => setUrlPlataforma(empresa.urlPlataformaTreinamentos?.trim() || null))
      .catch(() => setUrlPlataforma(null));
  }, [carregarApoio]);

  useEffect(() => {
    const timer = setTimeout(() => void carregarMatriz(), busca ? 350 : 0);
    return () => clearTimeout(timer);
  }, [carregarMatriz, busca]);

  /* ------------------------------------------------------------- acoes --- */

  async function criarTreinamento() {
    setSalvando(true);
    try {
      await api.post('/treinamentos', {
        ...novoTreinamento,
        validadeMeses: novoTreinamento.validadeMeses || null,
      });
      mostrar('Treinamento cadastrado.', 'sucesso');
      setNovoTreinamento(TREINAMENTO_VAZIO);
      void carregarApoio();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao cadastrar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  function alternarTreinamentoDoRequisito(treinamentoId: string) {
    setNovoRequisito((atual) => ({
      ...atual,
      treinamentoIds: atual.treinamentoIds.includes(treinamentoId)
        ? atual.treinamentoIds.filter((idAtual) => idAtual !== treinamentoId)
        : [...atual.treinamentoIds, treinamentoId],
    }));
  }

  async function criarRequisito() {
    setSalvando(true);
    try {
      const resposta = await api.post<{ criados: number; ignorados: number }>('/capacitacao/requisitos/lote', {
        funcao: novoRequisito.funcao.trim(),
        treinamentoIds: novoRequisito.treinamentoIds,
      });
      mostrar(
        `${resposta.criados} treinamento(s) adicionado(s) à função ${novoRequisito.funcao.trim()}` +
          (resposta.ignorados > 0 ? ` · ${resposta.ignorados} já era(m) exigido(s)` : '') +
          '.',
        'sucesso',
      );
      setNovoRequisito({ funcao: '', treinamentoIds: [] });
      void carregarApoio();
      void carregarMatriz();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao adicionar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function excluirRequisito(id: string) {
    try {
      await api.delete(`/capacitacao/requisitos/${id}`);
      mostrar('Requisito removido.', 'sucesso');
      void carregarApoio();
      void carregarMatriz();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao remover.', 'erro');
    }
  }

  async function registrarRealizacao() {
    setSalvando(true);
    try {
      const criada = await api.post<{ id: string }>('/treinamentos-realizados', {
        ...novaRealizacao,
        validade: novaRealizacao.validade || undefined,
        instrutor: novaRealizacao.instrutor || undefined,
      });
      const colaborador = colaboradores.find((item) => item.id === novaRealizacao.colaboradorId);
      const treinamento = catalogo.find((item) => item.id === novaRealizacao.treinamentoId);
      setUltimaRealizacao({
        id: criada.id,
        colaboradorId: novaRealizacao.colaboradorId,
        descricao: `${treinamento?.nome ?? 'Treinamento'} — ${colaborador?.nome ?? 'colaborador'}`,
        certificadoEnviado: false,
      });
      mostrar('Treinamento registrado. Anexe o certificado abaixo, se já o tiver.', 'sucesso');
      setNovaRealizacao(REALIZACAO_VAZIA);
      void carregarMatriz();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao registrar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function anexarCertificado(arquivo: File) {
    if (!ultimaRealizacao) return;
    setEnviandoCertificado(true);
    try {
      await api.upload(`/treinamentos-realizados/${ultimaRealizacao.id}/certificado`, arquivo);
      mostrar('Certificado anexado.', 'sucesso');
      setUltimaRealizacao({ ...ultimaRealizacao, certificadoEnviado: true });
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao anexar o certificado.', 'erro');
    } finally {
      setEnviandoCertificado(false);
    }
  }

  /** Treinamentos que a função digitada já exige — evita marcar repetido. */
  const jaExigidos = new Set(
    requisitos
      .filter((requisito) => requisito.funcao.trim().toLowerCase() === novoRequisito.funcao.trim().toLowerCase())
      .map((requisito) => requisito.treinamento.id),
  );

  const resumo = matriz?.resumo;

  return (
    <>
      <div className="painel">
        <h3>Treinamentos e Matriz de Capacitação</h3>
        <p className="desc">
          Quais funções exigem quais treinamentos, quem está em dia e o que vence a seguir. O percentual de requisitos
          em dia é a nota do pilar <b>Treinamentos</b> no ICSG e no Índice Global SSMA.
        </p>

        <div className="barra-acoes">
          {urlPlataforma ? (
            <a className="btn btn-outline" href={urlPlataforma} target="_blank" rel="noreferrer">
              <Icone nome="link" /> Plataforma de treinamentos
            </a>
          ) : urlPlataforma === null ? (
            <span className="hint">
              <Icone nome="link" /> Plataforma de treinamentos: cadastre o link em{' '}
              <Link to="/empresa">Configurações &gt; Empresa</Link>.
            </span>
          ) : null}
        </div>

        {resumo ? (
          <div className="stat-grid">
            <div className="stat">
              <b>{resumo.percentualEmDia !== null ? `${resumo.percentualEmDia}%` : '—'}</b>
              <span>requisitos em dia (nota do pilar)</span>
            </div>
            <div className="stat">
              <b>{resumo.totalRequisitos}</b>
              <span>requisitos exigidos · {resumo.colaboradoresCobertos} colaborador(es)</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.vencidos > 0 ? 'var(--red)' : undefined }}>{resumo.vencidos}</b>
              <span>vencidos</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.semTreinamento > 0 ? 'var(--red)' : undefined }}>{resumo.semTreinamento}</b>
              <span>sem treinamento</span>
            </div>
            <div className="stat">
              <b>{resumo.aVencer}</b>
              <span>a vencer (30 dias)</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="abas">
        <button type="button" className={aba === 'matriz' ? 'ativa' : ''} onClick={() => setAba('matriz')}>
          Matriz de capacitação
        </button>
        <button type="button" className={aba === 'catalogo' ? 'ativa' : ''} onClick={() => setAba('catalogo')}>
          Catálogo e requisitos
        </button>
        {podeEscrever ? (
          <button type="button" className={aba === 'registro' ? 'ativa' : ''} onClick={() => setAba('registro')}>
            Registrar treinamento
          </button>
        ) : null}
      </div>

      {/* ------------------------------------------------------------ matriz */}
      {aba === 'matriz' ? (
        <div className="painel">
          <div className="filtros">
            <Campo label="Buscar" htmlFor="mt-busca">
              <input
                id="mt-busca"
                className="busca"
                placeholder="Colaborador ou treinamento"
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
              />
            </Campo>
            <Campo label="Cliente" htmlFor="mt-cliente">
              <select id="mt-cliente" value={clienteId} onChange={(evento) => setClienteId(evento.target.value)}>
                <option value="">Todos</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nomeFantasia}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Situação" htmlFor="mt-situacao">
              <select
                id="mt-situacao"
                className="estreito"
                value={situacao}
                onChange={(evento) => setSituacao(evento.target.value as SituacaoCapacitacao | '')}
              >
                <option value="">Todas</option>
                {SITUACOES_CAPACITACAO.map((item) => (
                  <option key={item} value={item}>
                    {ROTULO_SITUACAO_CAPACITACAO[item]}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          {carregando ? (
            <div className="centro-tela">
              <div className="spinner" />
              Cruzando a matriz...
            </div>
          ) : !matriz || matriz.linhas.length === 0 ? (
            <div className="vazio">
              <div className="icone-vazio" aria-hidden="true">
                <Icone nome="premio" tamanho={22} />
              </div>
              <h4>Nenhum requisito encontrado</h4>
              <p>
                A matriz nasce do cruzamento função × treinamento. Cadastre requisitos na aba “Catálogo e requisitos”.
              </p>
            </div>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    <th>Função</th>
                    <th>Treinamento exigido</th>
                    <th>Realizado</th>
                    <th>Validade</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {matriz.linhas.map((linha) => (
                    <tr key={`${linha.colaboradorId}-${linha.treinamentoId}`}>
                      <td>
                        <Link to={`/colaboradores/${linha.colaboradorId}`}>
                          <b>{linha.colaborador}</b>
                        </Link>
                        <div className="hint">
                          {linha.cliente}
                          {linha.terceiro ? ` · ${linha.terceiro}` : ''} ·{' '}
                          <Link to={`/colaboradores/${linha.colaboradorId}/carteirinha`}>carteirinha</Link>
                        </div>
                      </td>
                      <td>{linha.funcao}</td>
                      <td>
                        {linha.treinamento}
                        {linha.norma ? <div className="hint">{linha.norma}</div> : null}
                      </td>
                      <td>{linha.dataRealizacao ? formatarDataIso(linha.dataRealizacao) : '—'}</td>
                      <td>
                        {linha.validade ? formatarDataIso(linha.validade) : linha.dataRealizacao ? 'sem reciclagem' : '—'}
                        {linha.diasParaVencer !== null ? <div className="hint">{textoPrazo(linha.diasParaVencer)}</div> : null}
                      </td>
                      <td>
                        <span className={`pill ${PILL_CAPACITACAO[linha.situacao]}`}>{linha.rotuloSituacao}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* ---------------------------------------------------------- catalogo */}
      {aba === 'catalogo' ? (
        <>
          {podeEscrever ? (
            <div className="grid2">
              <div className="painel">
                <h3>Novo treinamento</h3>
                <Campo label="Nome" htmlFor="nt-nome" obrigatorio>
                  <input
                    id="nt-nome"
                    value={novoTreinamento.nome}
                    onChange={(evento) => setNovoTreinamento({ ...novoTreinamento, nome: evento.target.value })}
                  />
                </Campo>
                <div className="row3">
                  <Campo label="Norma" htmlFor="nt-norma" ajuda={`Ex.: ${NORMAS_SUGERIDAS.slice(0, 4).join(', ')}...`}>
                    <input
                      id="nt-norma"
                      list="normas"
                      value={novoTreinamento.norma}
                      onChange={(evento) => setNovoTreinamento({ ...novoTreinamento, norma: evento.target.value })}
                    />
                    <datalist id="normas">
                      {NORMAS_SUGERIDAS.map((norma) => (
                        <option key={norma} value={norma} />
                      ))}
                    </datalist>
                  </Campo>
                  <Campo label="Carga (h)" htmlFor="nt-carga" obrigatorio>
                    <input
                      id="nt-carga"
                      type="number"
                      min={1}
                      value={novoTreinamento.cargaHorariaHoras}
                      onChange={(evento) =>
                        setNovoTreinamento({ ...novoTreinamento, cargaHorariaHoras: evento.target.value })
                      }
                    />
                  </Campo>
                  <Campo label="Reciclagem (meses)" htmlFor="nt-validade" ajuda="Vazio = sem reciclagem.">
                    <input
                      id="nt-validade"
                      type="number"
                      min={1}
                      value={novoTreinamento.validadeMeses}
                      onChange={(evento) => setNovoTreinamento({ ...novoTreinamento, validadeMeses: evento.target.value })}
                    />
                  </Campo>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={salvando || !novoTreinamento.nome}
                  onClick={() => void criarTreinamento()}
                >
                  Cadastrar treinamento
                </button>
              </div>

              <div className="painel">
                <h3>Novo requisito da matriz</h3>
                <p className="desc">
                  A função (o mesmo texto do cadastro do colaborador) passa a exigir os treinamentos marcados — marque
                  quantos forem necessários.
                </p>
                <Campo label="Função" htmlFor="nr-funcao" obrigatorio>
                  <input
                    id="nr-funcao"
                    list="funcoes"
                    value={novoRequisito.funcao}
                    onChange={(evento) => setNovoRequisito({ ...novoRequisito, funcao: evento.target.value })}
                  />
                  <datalist id="funcoes">
                    {funcoes.map((funcao) => (
                      <option key={funcao} value={funcao} />
                    ))}
                  </datalist>
                </Campo>
                <Campo
                  label={`Treinamentos exigidos (${novoRequisito.treinamentoIds.length} marcado${novoRequisito.treinamentoIds.length === 1 ? '' : 's'})`}
                  obrigatorio
                  ajuda="Os que a função já exige aparecem marcados como “já exigido”."
                >
                  <div
                    style={{
                      maxHeight: 220,
                      overflowY: 'auto',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '6px 10px',
                    }}
                  >
                    {catalogo.filter((treinamento) => treinamento.ativo).length === 0 ? (
                      <span className="hint">Cadastre treinamentos no catálogo primeiro.</span>
                    ) : (
                      catalogo
                        .filter((treinamento) => treinamento.ativo)
                        .map((treinamento) => {
                          const exigido = jaExigidos.has(treinamento.id);
                          return (
                            <label key={treinamento.id} className="check-linha" style={{ display: 'flex', gap: 8, padding: '3px 0' }}>
                              <input
                                type="checkbox"
                                disabled={exigido}
                                checked={exigido || novoRequisito.treinamentoIds.includes(treinamento.id)}
                                onChange={() => alternarTreinamentoDoRequisito(treinamento.id)}
                              />
                              <span>
                                {treinamento.nome}
                                {treinamento.norma ? <span className="hint"> · {treinamento.norma}</span> : null}
                                {exigido ? <span className="pill gray"> já exigido</span> : null}
                              </span>
                            </label>
                          );
                        })
                    )}
                  </div>
                </Campo>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={salvando || !novoRequisito.funcao.trim() || novoRequisito.treinamentoIds.length === 0}
                  onClick={() => void criarRequisito()}
                >
                  Adicionar {novoRequisito.treinamentoIds.length > 1 ? `${novoRequisito.treinamentoIds.length} treinamentos` : ''} à
                  matriz
                </button>
                {!novoRequisito.funcao.trim() || novoRequisito.treinamentoIds.length === 0 ? (
                  <p className="hint">Informe a função e marque ao menos um treinamento.</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="painel">
            <h3>Catálogo ({catalogo.length})</h3>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Treinamento</th>
                    <th>Norma</th>
                    <th>Carga</th>
                    <th>Reciclagem</th>
                    <th>Uso</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogo.map((treinamento) => (
                    <tr key={treinamento.id}>
                      <td>
                        <b>{treinamento.nome}</b>
                        {!treinamento.ativo ? <span className="pill gray"> Inativo</span> : null}
                      </td>
                      <td>{treinamento.norma ?? '—'}</td>
                      <td>{Number(treinamento.cargaHorariaHoras)}h</td>
                      <td>{treinamento.validadeMeses ? `${treinamento.validadeMeses} meses` : 'sem reciclagem'}</td>
                      <td className="hint">
                        {treinamento._count?.requisitos ?? 0} função(ões) · {treinamento._count?.realizacoes ?? 0}{' '}
                        registro(s)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="painel">
            <h3>Requisitos por função ({requisitos.length})</h3>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Função</th>
                    <th>Treinamento exigido</th>
                    <th>Reciclagem</th>
                    {podeEscrever ? <th aria-label="Ações" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {requisitos.map((requisito) => (
                    <tr key={requisito.id}>
                      <td>
                        <b>{requisito.funcao}</b>
                      </td>
                      <td>
                        {requisito.treinamento.nome}
                        {requisito.treinamento.norma ? <span className="hint"> · {requisito.treinamento.norma}</span> : null}
                      </td>
                      <td>
                        {requisito.treinamento.validadeMeses
                          ? `${requisito.treinamento.validadeMeses} meses`
                          : 'sem reciclagem'}
                      </td>
                      {podeEscrever ? (
                        <td>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluirRequisito(requisito.id)}>
                            Remover
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {/* ---------------------------------------------------------- registro */}
      {aba === 'registro' && podeEscrever ? (
        <div className="painel">
          <h3>Registrar treinamento realizado</h3>
          <p className="desc">A validade é sugerida pela reciclagem do catálogo; ajuste se o contrato exigir prazo menor.</p>

          <div className="filtros">
            <Campo label="Colaborador" htmlFor="rr-colaborador" obrigatorio>
              <select
                id="rr-colaborador"
                value={novaRealizacao.colaboradorId}
                onChange={(evento) => setNovaRealizacao({ ...novaRealizacao, colaboradorId: evento.target.value })}
              >
                <option value="">Selecione...</option>
                {colaboradores.map((colaborador) => (
                  <option key={colaborador.id} value={colaborador.id}>
                    {colaborador.nome} — {colaborador.funcao}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Treinamento" htmlFor="rr-treinamento" obrigatorio>
              <select
                id="rr-treinamento"
                value={novaRealizacao.treinamentoId}
                onChange={(evento) => setNovaRealizacao({ ...novaRealizacao, treinamentoId: evento.target.value })}
              >
                <option value="">Selecione...</option>
                {catalogo
                  .filter((treinamento) => treinamento.ativo)
                  .map((treinamento) => (
                    <option key={treinamento.id} value={treinamento.id}>
                      {treinamento.nome}
                    </option>
                  ))}
              </select>
            </Campo>

            <Campo label="Data de realização" htmlFor="rr-data" obrigatorio>
              <input
                id="rr-data"
                type="date"
                value={novaRealizacao.dataRealizacao}
                onChange={(evento) => setNovaRealizacao({ ...novaRealizacao, dataRealizacao: evento.target.value })}
              />
            </Campo>

            <Campo label="Validade" htmlFor="rr-validade" ajuda="Vazio = reciclagem do catálogo.">
              <input
                id="rr-validade"
                type="date"
                value={novaRealizacao.validade}
                onChange={(evento) => setNovaRealizacao({ ...novaRealizacao, validade: evento.target.value })}
              />
            </Campo>

            <Campo label="Instrutor / entidade" htmlFor="rr-instrutor">
              <input
                id="rr-instrutor"
                value={novaRealizacao.instrutor}
                onChange={(evento) => setNovaRealizacao({ ...novaRealizacao, instrutor: evento.target.value })}
              />
            </Campo>
          </div>

          <div className="barra-acoes">
            <button
              type="button"
              className="btn btn-primary"
              disabled={salvando || !novaRealizacao.colaboradorId || !novaRealizacao.treinamentoId || !novaRealizacao.dataRealizacao}
              onClick={() => void registrarRealizacao()}
            >
              {salvando ? 'Registrando...' : 'Registrar'}
            </button>
            <span className="hint">
              Depois de registrar, você pode anexar o certificado aqui mesmo — ou depois, na aba Documentos do cadastro do
              colaborador.
            </span>
          </div>

          {ultimaRealizacao ? (
            <div className="campo-bloco" style={{ marginTop: 14 }}>
              <b>Último registro:</b> {ultimaRealizacao.descricao}
              <div className="barra-acoes" style={{ marginTop: 8 }}>
                {ultimaRealizacao.certificadoEnviado ? (
                  <span className="pill ok">
                    <Icone nome="ok" /> Certificado anexado
                  </span>
                ) : (
                  <label className="btn btn-outline btn-sm">
                    <Icone nome="anexo" /> {enviandoCertificado ? 'Enviando...' : 'Anexar certificado (PDF ou imagem)'}
                    <input
                      type="file"
                      hidden
                      accept="application/pdf,image/*"
                      disabled={enviandoCertificado}
                      onChange={(evento) => {
                        const arquivo = evento.target.files?.[0];
                        evento.target.value = '';
                        if (arquivo) void anexarCertificado(arquivo);
                      }}
                    />
                  </label>
                )}
                <Link className="btn btn-ghost btn-sm" to={`/colaboradores/${ultimaRealizacao.colaboradorId}/carteirinha`}>
                  Ver carteirinha
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
