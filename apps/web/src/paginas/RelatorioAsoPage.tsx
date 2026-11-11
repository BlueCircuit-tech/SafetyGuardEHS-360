import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, baixarArquivo } from '../lib/api';
import { formatarDataIso, formatarDataHora } from '../lib/datas';
import { PILL_VENCIMENTO, textoPrazo, type RelatorioAsoApi } from '../lib/saude';

/**
 * Etapa 24 — Relatório de ASO.
 *
 * Pedido da operação: lista por funcionário com admissão, admissional,
 * periódico, demissional e afastamentos, com filtro de vencido/válido e
 * exportação para Excel. A situação usa o alerta de 35 dias do servidor.
 */

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

type FiltroSituacao = '' | 'VALIDO' | 'VENCIDO' | 'VIGENTE' | 'A_VENCER' | 'SEM_ASO';

const SITUACOES_FILTRO: FiltroSituacao[] = ['', 'VALIDO', 'VENCIDO', 'VIGENTE', 'A_VENCER', 'SEM_ASO'];

function ehFiltroSituacao(valor: string | null): valor is FiltroSituacao {
  return valor !== null && (SITUACOES_FILTRO as string[]).includes(valor);
}

export function RelatorioAsoPage() {
  const { mostrar } = useToast();
  const [parametrosUrl, setParametrosUrl] = useSearchParams();

  const situacaoInicial = parametrosUrl.get('situacao');
  const [clienteId, setClienteId] = useState(parametrosUrl.get('clienteId') ?? '');
  const [situacao, setSituacao] = useState<FiltroSituacao>(ehFiltroSituacao(situacaoInicial) ? situacaoInicial : '');
  const [busca, setBusca] = useState(parametrosUrl.get('busca') ?? '');
  const [buscaAplicada, setBuscaAplicada] = useState(busca.trim());

  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [relatorio, setRelatorio] = useState<RelatorioAsoApi | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    api
      .get<OpcaoCliente[]>('/clientes/opcoes?incluirInativos=true')
      .then(setClientes)
      .catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setBuscaAplicada(busca.trim()), 350);
    return () => clearTimeout(timer);
  }, [busca]);

  const consulta = useMemo(() => {
    const parametros = new URLSearchParams();
    if (clienteId) parametros.set('clienteId', clienteId);
    if (situacao) parametros.set('situacao', situacao);
    if (buscaAplicada) parametros.set('busca', buscaAplicada);
    return parametros.toString();
  }, [clienteId, situacao, buscaAplicada]);

  // Mantém os filtros na URL: o link "ver no relatório" dos alertas cai aqui.
  useEffect(() => {
    setParametrosUrl(new URLSearchParams(consulta), { replace: true });
  }, [consulta, setParametrosUrl]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setRelatorio(await api.get<RelatorioAsoApi>(`/asos/relatorio${consulta ? `?${consulta}` : ''}`));
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao carregar o relatório.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [consulta, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function baixarExcel() {
    setBaixando(true);
    try {
      await baixarArquivo(
        `/asos/relatorio.xlsx${consulta ? `?${consulta}` : ''}`,
        `relatorio-aso-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao gerar o Excel.', 'erro');
    } finally {
      setBaixando(false);
    }
  }

  const resumo = relatorio?.resumo;
  const diasAlerta = relatorio?.diasAlerta ?? 35;
  const nomeCliente = clientes.find((cliente) => cliente.id === clienteId)?.nomeFantasia;

  return (
    <>
      <div className="painel">
        <h3>Relatório de ASO</h3>
        <p className="desc">
          Situação do atestado de saúde ocupacional de cada colaborador: admissão, exames admissional, periódico, de retorno
          e demissional, validade e afastamentos. “A vencer” começa {diasAlerta} dias antes do vencimento.
        </p>

        <div className="filtros">
          <Campo label="Cliente" htmlFor="ra-cliente">
            <select id="ra-cliente" value={clienteId} onChange={(evento) => setClienteId(evento.target.value)}>
              <option value="">Todos</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Situação do ASO" htmlFor="ra-situacao">
            <select
              id="ra-situacao"
              value={situacao}
              onChange={(evento) => setSituacao(evento.target.value as FiltroSituacao)}
            >
              <option value="">Todas</option>
              <option value="VALIDO">Válidos (vigente + a vencer)</option>
              <option value="VENCIDO">Vencidos e sem ASO</option>
              <option value="VIGENTE">Vigente</option>
              <option value="A_VENCER">A vencer ({diasAlerta} dias)</option>
              <option value="SEM_ASO">Sem ASO</option>
            </select>
          </Campo>

          <Campo label="Buscar" htmlFor="ra-busca">
            <input
              id="ra-busca"
              className="busca"
              placeholder="Nome ou função"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
            />
          </Campo>
        </div>

        <div className="barra-acoes">
          <button type="button" className="btn btn-primary" disabled={baixando} onClick={() => void baixarExcel()}>
            <Icone nome="documento" /> {baixando ? 'Gerando...' : 'Baixar Excel'}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => window.print()}>
            <Icone nome="impressora" /> Imprimir
          </button>
          <Link className="btn btn-ghost" to="/colaboradores">
            Colaboradores
          </Link>
        </div>

        {resumo ? (
          <div className="stat-grid">
            <div className="stat">
              <b>{resumo.vigentes}</b>
              <span>vigentes</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.aVencer > 0 ? 'var(--orange, #d97706)' : undefined }}>{resumo.aVencer}</b>
              <span>a vencer em {diasAlerta} dias</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.vencidos > 0 ? 'var(--red)' : undefined }}>{resumo.vencidos}</b>
              <span>vencidos</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.semAso > 0 ? 'var(--red)' : undefined }}>{resumo.semAso}</b>
              <span>sem ASO</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="painel">
        {relatorio ? (
          <p className="hint">
            {relatorio.total} colaborador(es){nomeCliente ? ` · ${nomeCliente}` : ''} · gerado em{' '}
            {formatarDataHora(relatorio.geradoEm)}
          </p>
        ) : null}

        {carregando ? (
          <div className="centro-tela">
            <div className="spinner" />
            Montando o relatório...
          </div>
        ) : !relatorio || relatorio.itens.length === 0 ? (
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="saude" tamanho={22} />
            </div>
            <h4>Nenhum colaborador encontrado</h4>
            <p>Ajuste os filtros de cliente, situação ou busca.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Função</th>
                  <th>Cliente / contratada</th>
                  <th>Admissão</th>
                  <th>Admissional</th>
                  <th>Periódico</th>
                  <th>Retorno</th>
                  <th>Demissional</th>
                  <th>Validade</th>
                  <th>Resultado</th>
                  <th>Situação</th>
                  <th className="num-col">Afastamentos</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.itens.map((linha) => (
                  <tr key={linha.id}>
                    <td>
                      <Link to={`/colaboradores/${linha.id}`}>
                        <b>{linha.nome}</b>
                      </Link>
                      <div className="hint">
                        <span className="mono">{linha.cpf}</span>
                        {linha.matricula ? ` · mat. ${linha.matricula}` : ''} · {linha.situacaoColaborador}
                      </div>
                      {linha.bloqueado ? <span className="pill bad">Bloqueado</span> : null}
                    </td>
                    <td>
                      {linha.funcao}
                      {linha.setor ? <div className="hint">{linha.setor}</div> : null}
                    </td>
                    <td>
                      {linha.cliente}
                      {linha.terceiro ? <div className="hint">{linha.terceiro}</div> : null}
                    </td>
                    <td>{formatarDataIso(linha.admissao)}</td>
                    <td>{formatarDataIso(linha.admissional)}</td>
                    <td>{formatarDataIso(linha.periodico)}</td>
                    <td>{formatarDataIso(linha.retornoAoTrabalho)}</td>
                    <td>{formatarDataIso(linha.demissional)}</td>
                    <td>
                      {linha.validade ? formatarDataIso(linha.validade) : '—'}
                      {linha.validade ? <div className="hint">{textoPrazo(linha.diasParaVencer)}</div> : null}
                    </td>
                    <td>{linha.resultado ?? '—'}</td>
                    <td>
                      <span className={`pill ${PILL_VENCIMENTO[linha.situacaoAso]}`}>{linha.rotuloSituacaoAso}</span>
                    </td>
                    <td className="num-col">
                      {linha.afastamentos}
                      {linha.ultimoAfastamento ? (
                        <div className="hint">último {formatarDataIso(linha.ultimoAfastamento)}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
