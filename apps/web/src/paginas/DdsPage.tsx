import { useCallback, useEffect, useMemo, useState } from 'react';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import { useSessao } from '../lib/sessao';

interface TemaApi {
  id: string;
  numero: number;
  titulo: string;
  categoria: string | null;
}

interface RegistroDdsApi {
  id: string;
  data: string;
  lider: string;
  participantes: number;
  duracaoMinutos: number | null;
  temaLivre: string | null;
  listaPresencaUrl: string | null;
  tema?: { numero: number; titulo: string; categoria: string | null } | null;
  cliente?: { id: string; nomeFantasia: string };
  area?: { id: string; nome: string; codigo: string } | null;
}

interface ResumoDds {
  total: number;
  ultimos30Dias: number;
  participacaoMedia: number | null;
  ultimoRegistro: string | null;
}

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

const NOVO_VAZIO = { clienteId: '', areaId: '', temaId: '', temaLivre: '', data: '', lider: '', participantes: '', duracaoMinutos: '' };

export function DdsPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('observacoes:escrever');

  const [carregando, setCarregando] = useState(true);
  const [itens, setItens] = useState<RegistroDdsApi[]>([]);
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState<ResumoDds | null>(null);
  const [temas, setTemas] = useState<TemaApi[]>([]);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [areas, setAreas] = useState<Array<{ id: string; nome: string; codigo: string }>>([]);

  const [clienteId, setClienteId] = useState('');
  const [novo, setNovo] = useState(NOVO_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const categorias = useMemo(() => {
    const mapa = new Map<string, TemaApi[]>();
    for (const tema of temas) {
      const chave = tema.categoria ?? 'Outros';
      mapa.set(chave, [...(mapa.get(chave) ?? []), tema]);
    }
    return [...mapa.entries()];
  }, [temas]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const parametros = new URLSearchParams({ porPagina: '40' });
      if (clienteId) parametros.set('clienteId', clienteId);
      const escopo = clienteId ? `?clienteId=${clienteId}` : '';

      const [lista, cards] = await Promise.all([
        api.get<{ itens: RegistroDdsApi[]; total: number }>(`/dds?${parametros.toString()}`),
        api.get<ResumoDds>(`/dds/resumo${escopo}`),
      ]);
      setItens(lista.itens);
      setTotal(lista.total);
      setResumo(cards);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os DDS.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [clienteId, mostrar]);

  useEffect(() => {
    void api.get<TemaApi[]>('/dds/temas').then(setTemas).catch(() => setTemas([]));
    void api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Áreas do cliente escolhido no formulário.
  useEffect(() => {
    if (!novo.clienteId) {
      setAreas([]);
      return;
    }
    void api
      .get<{ itens: Array<{ id: string; nome: string; codigo: string }> }>(`/areas?clienteId=${novo.clienteId}&porPagina=200`)
      .then((resposta) => setAreas(resposta.itens))
      .catch(() => setAreas([]));
  }, [novo.clienteId]);

  async function registrar() {
    setSalvando(true);
    try {
      await api.post('/dds', {
        ...novo,
        areaId: novo.areaId || undefined,
        temaId: novo.temaId || undefined,
        temaLivre: novo.temaLivre || undefined,
        duracaoMinutos: novo.duracaoMinutos || undefined,
      });
      mostrar('DDS registrado.', 'sucesso');
      setNovo({ ...NOVO_VAZIO, clienteId: novo.clienteId, lider: novo.lider });
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao registrar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function anexarLista(id: string, arquivo: File) {
    try {
      await api.upload(`/dds/${id}/lista-presenca`, arquivo);
      mostrar('Lista de presença anexada.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao anexar.', 'erro');
    }
  }

  async function excluir(registro: RegistroDdsApi) {
    if (!window.confirm(`Excluir o DDS de ${formatarDataIso(registro.data)}?`)) return;
    try {
      await api.delete(`/dds/${registro.id}`);
      mostrar('Registro excluído.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao excluir.', 'erro');
    }
  }

  return (
    <>
      <div className="painel">
        <h3>DDS — Diálogo Diário de Segurança</h3>
        <p className="desc">
          Banco de {temas.length} temas do acervo da consultoria e o registro diário com líder, área e participantes.
          O indicador é a constância: DDS realizados e participação média.
        </p>

        {resumo ? (
          <div className="stat-grid">
            <div className="stat">
              <b>{resumo.ultimos30Dias}</b>
              <span>DDS nos últimos 30 dias</span>
            </div>
            <div className="stat">
              <b>{resumo.participacaoMedia ?? '—'}</b>
              <span>participantes por DDS (média 30d)</span>
            </div>
            <div className="stat">
              <b>{resumo.ultimoRegistro ? formatarDataIso(resumo.ultimoRegistro) : '—'}</b>
              <span>último registro</span>
            </div>
            <div className="stat">
              <b>{resumo.total}</b>
              <span>registros no histórico</span>
            </div>
          </div>
        ) : null}
      </div>

      {podeEscrever ? (
        <div className="painel">
          <h3>Registrar DDS</h3>
          <div className="filtros">
            <Campo label="Cliente" htmlFor="dds-cliente" obrigatorio>
              <select id="dds-cliente" value={novo.clienteId} onChange={(e) => setNovo({ ...novo, clienteId: e.target.value })}>
                <option value="">Selecione...</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nomeFantasia}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Área" htmlFor="dds-area">
              <select id="dds-area" value={novo.areaId} onChange={(e) => setNovo({ ...novo, areaId: e.target.value })}>
                <option value="">Geral / sem área</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.codigo} — {area.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Data" htmlFor="dds-data" obrigatorio>
              <input id="dds-data" type="date" value={novo.data} onChange={(e) => setNovo({ ...novo, data: e.target.value })} />
            </Campo>
            <Campo label="Líder" htmlFor="dds-lider" obrigatorio>
              <input id="dds-lider" value={novo.lider} onChange={(e) => setNovo({ ...novo, lider: e.target.value })} />
            </Campo>
            <Campo label="Participantes" htmlFor="dds-part" obrigatorio>
              <input
                id="dds-part"
                type="number"
                min={1}
                className="estreito"
                value={novo.participantes}
                onChange={(e) => setNovo({ ...novo, participantes: e.target.value })}
              />
            </Campo>
            <Campo label="Duração (min)" htmlFor="dds-dur">
              <input
                id="dds-dur"
                type="number"
                min={1}
                className="estreito"
                value={novo.duracaoMinutos}
                onChange={(e) => setNovo({ ...novo, duracaoMinutos: e.target.value })}
              />
            </Campo>
          </div>

          <div className="grid2">
            <Campo label="Tema do banco" htmlFor="dds-tema" ajuda="Ou descreva um tema livre ao lado.">
              <select id="dds-tema" value={novo.temaId} onChange={(e) => setNovo({ ...novo, temaId: e.target.value, temaLivre: '' })}>
                <option value="">Selecione...</option>
                {categorias.map(([categoria, lista]) => (
                  <optgroup key={categoria} label={categoria}>
                    {lista.map((tema) => (
                      <option key={tema.id} value={tema.id}>
                        {tema.numero}. {tema.titulo}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Campo>
            <Campo label="Tema livre" htmlFor="dds-livre">
              <input
                id="dds-livre"
                value={novo.temaLivre}
                onChange={(e) => setNovo({ ...novo, temaLivre: e.target.value, temaId: '' })}
                placeholder="Assunto do dia, se não estiver no banco"
              />
            </Campo>
          </div>

          <div className="barra-acoes">
            <button
              type="button"
              className="btn btn-primary"
              disabled={salvando || !novo.clienteId || !novo.data || !novo.lider || !novo.participantes || (!novo.temaId && !novo.temaLivre)}
              onClick={() => void registrar()}
            >
              {salvando ? 'Registrando...' : 'Registrar DDS'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="painel">
        <div className="filtros">
          <Campo label="Cliente" htmlFor="fd-cliente">
            <select id="fd-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        {carregando ? (
          <div className="centro-tela">
            <div className="spinner" />
            Carregando...
          </div>
        ) : itens.length === 0 ? (
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="mensagem" tamanho={22} />
            </div>
            <h4>Nenhum DDS registrado</h4>
            <p>Registre o primeiro diálogo diário para o indicador de constância nascer.</p>
          </div>
        ) : (
          <>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Tema</th>
                    <th>Onde</th>
                    <th>Líder</th>
                    <th className="num-col">Participantes</th>
                    <th>Lista</th>
                    {podeEscrever ? <th aria-label="Ações" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {itens.map((registro) => (
                    <tr key={registro.id}>
                      <td>{formatarDataIso(registro.data)}</td>
                      <td>
                        <b>{registro.tema ? `${registro.tema.numero}. ${registro.tema.titulo}` : registro.temaLivre}</b>
                        {registro.tema?.categoria ? <div className="hint">{registro.tema.categoria}</div> : null}
                      </td>
                      <td>
                        {registro.cliente?.nomeFantasia ?? '—'}
                        {registro.area ? <div className="hint">{registro.area.nome}</div> : null}
                      </td>
                      <td>{registro.lider}</td>
                      <td className="num-col">
                        {registro.participantes}
                        {registro.duracaoMinutos ? <div className="hint">{registro.duracaoMinutos} min</div> : null}
                      </td>
                      <td>
                        {registro.listaPresencaUrl ? (
                          <a href={urlAbsoluta(registro.listaPresencaUrl) ?? '#'} target="_blank" rel="noreferrer">
                            Ver lista
                          </a>
                        ) : podeEscrever ? (
                          <label className="btn btn-ghost btn-sm">
                            Anexar
                            <input
                              type="file"
                              hidden
                              accept="application/pdf,image/*"
                              onChange={(evento) => {
                                const arquivo = evento.target.files?.[0];
                                if (arquivo) void anexarLista(registro.id, arquivo);
                              }}
                            />
                          </label>
                        ) : (
                          <span className="hint">—</span>
                        )}
                      </td>
                      {podeEscrever ? (
                        <td>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluir(registro)}>
                            Excluir
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="paginacao">
              <span>
                Exibindo {itens.length} de {total} registro(s)
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
