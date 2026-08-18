import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icone } from '../componentes/Icone';
import { Link, useNavigate } from 'react-router-dom';
import {
  CRITICIDADES_AREA_CADASTRO,
  ROTULO_CRITICIDADE_AREA,
  ROTULO_SITUACAO_AREA,
  ROTULO_TIPO_AREA,
  SITUACOES_AREA,
  TIPOS_AREA,
  type CriticidadeAreaCadastro,
  type SituacaoArea,
  type TipoArea,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import { PILL_CRITICIDADE_AREA, PILL_SITUACAO_AREA, type AreaApi, type PaginaAreas, type ResumoAreas } from '../lib/area-form';

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
  numeroContrato: string;
}

const POR_PAGINA = 20;

const RESUMO_VAZIO: ResumoAreas = { total: 0, ativas: 0, inativas: 0, criticas: 0, altas: 0, comPermissaoTrabalho: 0 };

export function AreasPage() {
  const { mostrar } = useToast();
  const navegar = useNavigate();

  const [carregando, setCarregando] = useState(true);
  const [semMatriz, setSemMatriz] = useState(false);
  const [aba, setAba] = useState<'lista' | 'placas'>('lista');

  const [pagina, setPagina] = useState<PaginaAreas | null>(null);
  const [resumo, setResumo] = useState<ResumoAreas>(RESUMO_VAZIO);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);

  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [tipo, setTipo] = useState<TipoArea | ''>('');
  const [criticidade, setCriticidade] = useState<CriticidadeAreaCadastro | ''>('');
  const [situacao, setSituacao] = useState<SituacaoArea | ''>('');
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
    // Na aba de placas queremos todas as áreas do filtro, não só a página atual.
    const parametros = new URLSearchParams({
      pagina: aba === 'placas' ? '1' : String(numeroPagina),
      porPagina: aba === 'placas' ? '200' : String(POR_PAGINA),
    });
    if (buscaAplicada) parametros.set('busca', buscaAplicada);
    if (clienteId) parametros.set('clienteId', clienteId);
    if (tipo) parametros.set('tipo', tipo);
    if (criticidade) parametros.set('criticidade', criticidade);
    if (situacao) parametros.set('situacao', situacao);
    return parametros.toString();
  }, [aba, buscaAplicada, clienteId, tipo, criticidade, situacao, numeroPagina]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const escopo = clienteId ? `?clienteId=${clienteId}` : '';
      const [lista, contagens] = await Promise.all([
        api.get<PaginaAreas>(`/areas?${consulta}`),
        api.get<ResumoAreas>(`/areas/resumo${escopo}`),
      ]);
      setPagina(lista);
      setResumo(contagens);
      setSemMatriz(false);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.codigo === 'MATRIZ_NAO_CADASTRADA') {
        setSemMatriz(true);
      } else {
        mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar as areas.', 'erro');
      }
    } finally {
      setCarregando(false);
    }
  }, [consulta, clienteId, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function excluir(area: AreaApi) {
    if (!window.confirm(`Excluir a área "${area.nome}"?\n\nO QR Code impresso deixa de funcionar.`)) return;

    try {
      await api.delete(`/areas/${area.id}`);
      mostrar(`${area.nome} excluída.`, 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao excluir a área.', 'erro');
    }
  }

  if (semMatriz) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>Áreas e QR Code</h2>
          </div>
        </div>
        <div className="painel">
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="predio" tamanho={22} />
            </div>
            <h4>Conclua as etapas anteriores</h4>
            <p>As áreas pertencem a um cliente — é preciso ter a matriz e ao menos um cliente cadastrado.</p>
            <Link className="btn btn-primary" to="/empresa">
              Ir para o cadastro da matriz
            </Link>
          </div>
        </div>
      </>
    );
  }

  const itens = pagina?.itens ?? [];
  const temFiltro = Boolean(buscaAplicada || clienteId || tipo || criticidade || situacao);
  const semClientes = clientes.length === 0;

  return (
    <>
      <div className="page-head sem-impressao">
        <div>
          <h2>Áreas e QR Code</h2>
          <p>
            A área é o ponto de leitura da inspeção de campo. Cada uma tem um QR Code próprio que abre o formulário de
            observação já identificado com cliente, área e riscos esperados.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={semClientes}
          title={semClientes ? 'Cadastre um cliente primeiro' : undefined}
          onClick={() => navegar('/areas/nova')}
        >
          ＋ Nova área
        </button>
      </div>

      {semClientes ? (
        <div className="hint alerta sem-impressao">
          <Icone nome="alerta" /> Nenhum cliente cadastrado. A área sempre pertence a um cliente —{' '}
          <Link to="/clientes/novo">cadastre um cliente</Link> antes.
        </div>
      ) : null}

      <div className="stat-grid sem-impressao">
        <div className="stat">
          <div className="lbl">Áreas</div>
          <div className="num">{resumo.total}</div>
          <div className="sub">{resumo.ativas} ativas</div>
        </div>
        <div className="stat">
          <div className="lbl">Criticidade crítica</div>
          <div className="num" style={{ color: 'var(--red)' }}>
            {resumo.criticas}
          </div>
          <div className="sub">inspeção a cada 7 dias</div>
        </div>
        <div className="stat">
          <div className="lbl">Criticidade alta</div>
          <div className="num" style={{ color: 'var(--orange)' }}>
            {resumo.altas}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Exigem permissão de trabalho</div>
          <div className="num">{resumo.comPermissaoTrabalho}</div>
        </div>
        <div className="stat">
          <div className="lbl">Inativas</div>
          <div className="num" style={{ color: 'var(--gray)' }}>
            {resumo.inativas}
          </div>
          <div className="sub">QR recusa leitura</div>
        </div>
      </div>

      <div className="abas sem-impressao" role="tablist">
        <button type="button" role="tab" className={aba === 'lista' ? 'on' : ''} onClick={() => setAba('lista')}>
          Cadastro
        </button>
        <button type="button" role="tab" className={aba === 'placas' ? 'on' : ''} onClick={() => setAba('placas')}>
          Folha de placas (impressão)
        </button>
      </div>

      <div className="painel">
        <div className="filtros sem-impressao">
          <div className="campo busca">
            <label htmlFor="busca-area">Buscar</label>
            <input
              id="busca-area"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Nome, código, setor, risco ou token do QR"
            />
          </div>
          <Campo label="Cliente" htmlFor="filtro-cliente-area">
            <select
              id="filtro-cliente-area"
              value={clienteId}
              onChange={(evento) => {
                setClienteId(evento.target.value);
                setNumeroPagina(1);
              }}
              style={{ width: 200 }}
            >
              <option value="">Todos</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Tipo" htmlFor="filtro-tipo-area">
            <select
              id="filtro-tipo-area"
              value={tipo}
              onChange={(evento) => {
                setTipo(evento.target.value as TipoArea | '');
                setNumeroPagina(1);
              }}
              style={{ width: 160 }}
            >
              <option value="">Todos</option>
              {TIPOS_AREA.map((valor) => (
                <option key={valor} value={valor}>
                  {ROTULO_TIPO_AREA[valor]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Criticidade" htmlFor="filtro-criticidade">
            <select
              id="filtro-criticidade"
              value={criticidade}
              onChange={(evento) => {
                setCriticidade(evento.target.value as CriticidadeAreaCadastro | '');
                setNumeroPagina(1);
              }}
              style={{ width: 140 }}
            >
              <option value="">Todas</option>
              {CRITICIDADES_AREA_CADASTRO.map((valor) => (
                <option key={valor} value={valor}>
                  {ROTULO_CRITICIDADE_AREA[valor]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Situação" htmlFor="filtro-situacao-area">
            <select
              id="filtro-situacao-area"
              value={situacao}
              onChange={(evento) => {
                setSituacao(evento.target.value as SituacaoArea | '');
                setNumeroPagina(1);
              }}
              style={{ width: 130 }}
            >
              <option value="">Todas</option>
              {SITUACOES_AREA.map((valor) => (
                <option key={valor} value={valor}>
                  {ROTULO_SITUACAO_AREA[valor]}
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
                setCriticidade('');
                setSituacao('');
                setNumeroPagina(1);
              }}
            >
              Limpar filtros
            </button>
          ) : null}
          {aba === 'placas' && itens.length > 0 ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => window.print()}>
              <Icone nome="impressora" /> Imprimir {itens.length} placa(s)
            </button>
          ) : null}
        </div>

        {carregando && !pagina ? (
          <div className="vazio">
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            Carregando áreas...
          </div>
        ) : itens.length === 0 ? (
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="lupa" tamanho={22} />
            </div>
            <h4>{temFiltro ? 'Nenhuma área encontrada' : 'Nenhuma área cadastrada ainda'}</h4>
            <p>
              {temFiltro
                ? 'Ajuste a busca ou os filtros para ver outros resultados.'
                : 'Cadastre as áreas de inspeção de cada cliente. Cada uma ganha um QR Code para a placa em campo.'}
            </p>
            {!temFiltro && !semClientes ? (
              <button type="button" className="btn btn-primary" onClick={() => navegar('/areas/nova')}>
                ＋ Cadastrar área
              </button>
            ) : null}
          </div>
        ) : aba === 'placas' ? (
          <div className="folha-placas">
            {itens.map((area) => (
              <div className="placa-qr" key={area.id}>
                <div className="placa-cab">
                  <div className="placa-cliente">{area.cliente?.nomeFantasia ?? ''}</div>
                  <div className="placa-nome">{area.nome}</div>
                  <div className="placa-codigo">{area.codigo}</div>
                </div>
                <img src={area.urlQrCode} alt={`QR Code da área ${area.nome}`} className="placa-img" />
                <div className="placa-rodape">
                  <b>Aponte a câmera para registrar uma observação</b>
                  <div>
                    {area.rotulos.criticidade}
                    {area.exigePermissaoTrabalho ? ' · exige PT' : ''}
                    {area.exigeAutorizacaoEntrada ? ' · acesso controlado' : ''}
                  </div>
                  <div className="placa-token">{area.tokenQr}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Área</th>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th>Criticidade</th>
                    <th>Riscos</th>
                    <th>Inspeção</th>
                    <th>QR</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {itens.map((area) => (
                    <tr key={area.id}>
                      <td>
                        <div className="principal">{area.nome}</div>
                        <div className="secundario">
                          <code>{area.codigo}</code>
                          {area.setor ? ` · ${area.setor}` : ''}
                        </div>
                        {area.pontoReferencia ? <div className="secundario">{area.pontoReferencia}</div> : null}
                      </td>
                      <td>
                        {area.cliente?.nomeFantasia ?? '—'}
                        {area.cliente?.centroNegocio ? (
                          <div className="secundario">
                            <code>{area.cliente.centroNegocio.codigo}</code>
                          </div>
                        ) : null}
                      </td>
                      <td>{area.rotulos.tipo}</td>
                      <td>
                        <span className={`pill ${PILL_CRITICIDADE_AREA[area.criticidade]}`}>
                          {area.rotulos.criticidade}
                        </span>
                        {area.exigePermissaoTrabalho ? <div className="secundario">exige PT</div> : null}
                      </td>
                      <td>
                        {area.riscos.length === 0 ? (
                          <span style={{ color: 'var(--gray)' }}>—</span>
                        ) : (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {area.riscos.slice(0, 3).map((risco) => (
                              <span className="pill gray" key={risco}>
                                {risco}
                              </span>
                            ))}
                            {area.riscos.length > 3 ? (
                              <span className="secundario">+{area.riscos.length - 3}</span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td>
                        a cada {area.frequenciaInspecaoDias}d
                        {area.frequenciaInspecaoDias > area.frequenciaSugeridaDias ? (
                          <div className="secundario" style={{ color: 'var(--orange)' }}>
                            sugerido {area.frequenciaSugeridaDias}d
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <img src={area.urlQrCode} alt="" className="qr-mini" />
                        <div className="secundario">
                          <code>{area.tokenQr}</code>
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${PILL_SITUACAO_AREA[area.situacao]}`}>
                          {ROTULO_SITUACAO_AREA[area.situacao]}
                        </span>
                      </td>
                      <td>
                        <div className="acoes-linha">
                          <Link className="btn btn-outline btn-sm" to={`/areas/${area.id}`}>
                            Editar
                          </Link>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluir(area)}>
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
                  ? `Página ${pagina.pagina} de ${pagina.totalPaginas} · ${pagina.total} áreas`
                  : `${pagina?.total ?? 0} área(s)`}
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
