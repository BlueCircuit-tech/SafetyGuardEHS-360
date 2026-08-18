import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icone } from '../componentes/Icone';
import { Link, useNavigate } from 'react-router-dom';
import {
  ABRANGENCIAS_DOCUMENTO,
  CATALOGO_DOCUMENTOS,
  ROTULO_ABRANGENCIA_DOCUMENTO,
  ROTULO_SITUACAO_DOCUMENTO,
  ROTULO_SITUACAO_VENCIMENTO,
  ROTULO_TIPO_DOCUMENTO,
  SITUACOES_DOCUMENTO,
  SITUACOES_VENCIMENTO,
  type AbrangenciaDocumento,
  type SituacaoDocumento,
  type SituacaoVencimento,
  type TipoDocumento,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { api, urlAbsoluta } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import {
  PILL_SITUACAO_DOCUMENTO,
  PILL_VENCIMENTO,
  textoPrazo,
  type DocumentoApi,
  type Paginado,
} from '../lib/saude';
import { useSessao } from '../lib/sessao';

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

const POR_PAGINA = 20;

/** A quem o documento se refere, conforme a abrangência. */
function alvoDoDocumento(documento: DocumentoApi): string {
  if (documento.abrangencia === 'AREA') return documento.area ? `${documento.area.codigo} — ${documento.area.nome}` : '—';
  if (documento.abrangencia === 'TERCEIRO') return documento.terceiro?.nomeFantasia ?? '—';
  if (documento.abrangencia === 'COLABORADOR') return documento.colaborador?.nome ?? '—';
  return documento.cliente?.nomeFantasia ?? 'Todo o cliente';
}

export function DocumentosPage() {
  const { mostrar } = useToast();
  const navegar = useNavigate();
  const { pode } = useSessao();
  const podeEscrever = pode('saude:escrever');

  const [carregando, setCarregando] = useState(true);
  const [pagina, setPagina] = useState<Paginado<DocumentoApi> | null>(null);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);

  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [tipo, setTipo] = useState<TipoDocumento | ''>('');
  const [abrangencia, setAbrangencia] = useState<AbrangenciaDocumento | ''>('');
  const [vencimento, setVencimento] = useState<SituacaoVencimento | ''>('');
  const [situacao, setSituacao] = useState<SituacaoDocumento | ''>('ATIVO');
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
    if (tipo) parametros.set('tipo', tipo);
    if (abrangencia) parametros.set('abrangencia', abrangencia);
    if (vencimento) parametros.set('vencimento', vencimento);
    if (situacao) parametros.set('situacao', situacao);
    return parametros.toString();
  }, [buscaAplicada, clienteId, tipo, abrangencia, vencimento, situacao, numeroPagina]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setPagina(await api.get<Paginado<DocumentoApi>>(`/documentos?${consulta}`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os documentos.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [consulta, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function excluir(documento: DocumentoApi) {
    if (!window.confirm(`Excluir "${documento.titulo}"?\n\nPara manter o histórico, prefira registrar uma revisão.`)) {
      return;
    }

    try {
      await api.delete(`/documentos/${documento.id}`);
      mostrar('Documento excluído.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao excluir.', 'erro');
    }
  }

  const itens = pagina?.itens ?? [];
  const vencidos = itens.filter((item) => item.situacaoVencimento === 'VENCIDO').length;

  return (
    <>
      <div className="painel">
        <h3>Documentos legais</h3>
        <p className="desc">
          Programas, laudos, licenças e certificados: PGR, PCMSO, LTCAT, PCA, PPR, AVCB e licença ambiental. O catálogo
          traz o prazo típico de cada um e quem exige responsável técnico.
        </p>

        <div className="barra-acoes">
          {podeEscrever ? (
            <button type="button" className="btn btn-primary" onClick={() => navegar('/documentos/novo')}>
              + Novo documento
            </button>
          ) : null}
          <Link className="btn btn-outline" to="/conformidade">
            Painel de conformidade
          </Link>
          {vencidos > 0 ? <span className="aviso"><Icone nome="alerta" /> {vencidos} vencido(s) nesta página</span> : null}
        </div>

        <div className="filtros">
          <Campo label="Buscar" htmlFor="busca">
            <input
              id="busca"
              className="busca"
              placeholder="Título, número, ART ou responsável"
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

          <Campo label="Tipo" htmlFor="tipo">
            <select
              id="tipo"
              value={tipo}
              onChange={(evento) => {
                setTipo(evento.target.value as TipoDocumento | '');
                setNumeroPagina(1);
              }}
            >
              <option value="">Todos</option>
              {CATALOGO_DOCUMENTOS.map((definicao) => (
                <option key={definicao.tipo} value={definicao.tipo}>
                  {definicao.rotulo}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Abrangência" htmlFor="abrangencia">
            <select
              id="abrangencia"
              className="estreito"
              value={abrangencia}
              onChange={(evento) => {
                setAbrangencia(evento.target.value as AbrangenciaDocumento | '');
                setNumeroPagina(1);
              }}
            >
              <option value="">Todas</option>
              {ABRANGENCIAS_DOCUMENTO.map((item) => (
                <option key={item} value={item}>
                  {ROTULO_ABRANGENCIA_DOCUMENTO[item]}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Vigência" htmlFor="vencimento">
            <select
              id="vencimento"
              className="estreito"
              value={vencimento}
              onChange={(evento) => {
                setVencimento(evento.target.value as SituacaoVencimento | '');
                setNumeroPagina(1);
              }}
            >
              <option value="">Todas</option>
              {SITUACOES_VENCIMENTO.map((item) => (
                <option key={item} value={item}>
                  {ROTULO_SITUACAO_VENCIMENTO[item]}
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
                setSituacao(evento.target.value as SituacaoDocumento | '');
                setNumeroPagina(1);
              }}
            >
              <option value="">Todas</option>
              {SITUACOES_DOCUMENTO.map((item) => (
                <option key={item} value={item}>
                  {ROTULO_SITUACAO_DOCUMENTO[item]}
                </option>
              ))}
            </select>
          </Campo>
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
              <Icone nome="documento" tamanho={22} />
            </div>
            <h4>Nenhum documento encontrado</h4>
            <p>Ajuste os filtros ou cadastre o primeiro programa deste cliente.</p>
          </div>
        ) : (
          <>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th>Referente a</th>
                    <th>Emissão</th>
                    <th>Validade</th>
                    <th>Responsável técnico</th>
                    <th>Situação</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {itens.map((documento) => (
                    <tr key={documento.id}>
                      <td>
                        <Link to={`/documentos/${documento.id}`}>
                          <b>{documento.titulo}</b>
                        </Link>
                        <div className="hint">
                          {ROTULO_TIPO_DOCUMENTO[documento.tipo]}
                          {documento.numero ? <span className="mono"> · {documento.numero}</span> : null}
                          {documento.revisao ? ` · rev. ${documento.revisao}` : ''}
                        </div>
                      </td>
                      <td>
                        {alvoDoDocumento(documento)}
                        <div className="hint">{ROTULO_ABRANGENCIA_DOCUMENTO[documento.abrangencia]}</div>
                      </td>
                      <td>{formatarDataIso(documento.dataEmissao)}</td>
                      <td>
                        <span className={`pill ${PILL_VENCIMENTO[documento.situacaoVencimento]}`}>
                          {documento.validade ? formatarDataIso(documento.validade) : 'sem prazo'}
                        </span>
                        <div className="hint">{textoPrazo(documento.diasParaVencer)}</div>
                      </td>
                      <td>
                        {documento.responsavelNome ?? <span className="hint">—</span>}
                        {documento.numeroArt ? <div className="hint">ART {documento.numeroArt}</div> : null}
                      </td>
                      <td>
                        <span className={`pill ${PILL_SITUACAO_DOCUMENTO[documento.situacao]}`}>
                          {ROTULO_SITUACAO_DOCUMENTO[documento.situacao]}
                        </span>
                      </td>
                      <td>
                        <div className="acoes-linha">
                          {documento.arquivoUrl ? (
                            <a
                              className="btn btn-ghost btn-sm"
                              href={urlAbsoluta(documento.arquivoUrl) ?? '#'}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Arquivo
                            </a>
                          ) : null}
                          <Link className="btn btn-ghost btn-sm" to={`/documentos/${documento.id}`}>
                            Abrir
                          </Link>
                          {podeEscrever ? (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluir(documento)}>
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
                  Página {pagina.pagina} de {pagina.totalPaginas} — {pagina.total} documento(s)
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
