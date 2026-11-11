import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CHECKLIST_ERGONOMIA_PADRAO,
  NIVEIS_RISCO_ERGONOMICO,
  ROTULO_NIVEL_RISCO_ERGONOMICO,
  ROTULO_TIPO_AVALIACAO_ERGONOMICA,
  TIPOS_AVALIACAO_ERGONOMICA,
  agruparItensErgonomia,
  nivelRiscoErgonomico,
  pontuacaoErgonomica,
  type ItemErgonomia,
  type NivelRiscoErgonomico,
  type TipoAvaliacaoErgonomica,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import { useSessao } from '../lib/sessao';

interface AvaliacaoApi {
  id: string;
  clienteId: string;
  areaId: string | null;
  funcao: string | null;
  data: string;
  avaliador: string;
  tipo: TipoAvaliacaoErgonomica;
  itens: ItemErgonomia[];
  pontuacao: number | null;
  nivelRisco: NivelRiscoErgonomico | null;
  conclusao: string | null;
  recomendacoes: string | null;
  arquivoUrl: string | null;
  criadoEm: string;
  cliente?: { id: string; nomeFantasia: string };
  area?: { id: string; nome: string; codigo: string } | null;
  rotulos?: { tipo: string; nivelRisco: string | null };
}

interface ResumoErgonomia {
  total: number;
  porNivel: Record<NivelRiscoErgonomico, number>;
  semPontuacao: number;
  ultima: AvaliacaoApi | null;
  categoriasCriticas: Array<{ categoria: string; naoConformes: number }>;
}

interface ItemPadrao {
  categoria: string;
  item: string;
}

type Aba = 'avaliar' | 'historico' | 'relatorio';

const PILL_NIVEL: Record<NivelRiscoErgonomico, string> = { BAIXO: 'ok', MEDIO: 'warn', ALTO: 'bad' };

const FORM_VAZIO = {
  clienteId: '',
  areaId: '',
  funcao: '',
  data: new Date().toISOString().slice(0, 10),
  avaliador: '',
  tipo: 'CHECKLIST' as TipoAvaliacaoErgonomica,
  conclusao: '',
  recomendacoes: '',
};

/** Checklist em branco: todo item comeca "conforme" e o avaliador marca o que desvia — mesmo fluxo do checklist de pre-uso. */
function itensEmBranco(padrao: readonly ItemPadrao[]): ItemErgonomia[] {
  return padrao.map((p) => ({ categoria: p.categoria, item: p.item, conforme: true, observacao: '' }));
}

function rotuloResposta(conforme: boolean | null): string {
  if (conforme === true) return 'Conforme';
  if (conforme === false) return 'Não conforme';
  return 'Não se aplica';
}

/**
 * Ergonomia (NR-17) — avaliacao do posto de trabalho por checklist.
 * Pontuacao e nivel de risco sao derivados das respostas (shared), nunca
 * escolhidos: a tela mostra ao vivo e o servidor grava o mesmo numero.
 */
export function ErgonomiaPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('cadastros:escrever');

  const [aba, setAba] = useState<Aba>('avaliar');
  const [clientes, setClientes] = useState<Array<{ id: string; nomeFantasia: string }>>([]);
  const [areasForm, setAreasForm] = useState<Array<{ id: string; nome: string; codigo: string }>>([]);
  const [areasFiltro, setAreasFiltro] = useState<Array<{ id: string; nome: string; codigo: string }>>([]);
  const [padrao, setPadrao] = useState<readonly ItemPadrao[]>(CHECKLIST_ERGONOMIA_PADRAO);

  const [form, setForm] = useState(FORM_VAZIO);
  const [itens, setItens] = useState<ItemErgonomia[]>(() => itensEmBranco(CHECKLIST_ERGONOMIA_PADRAO));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [filtro, setFiltro] = useState({ clienteId: '', areaId: '', nivelRisco: '', busca: '' });
  const [carregando, setCarregando] = useState(true);
  const [lista, setLista] = useState<AvaliacaoApi[]>([]);
  const [resumo, setResumo] = useState<ResumoErgonomia | null>(null);
  const [aberta, setAberta] = useState<AvaliacaoApi | null>(null);

  const pontuacao = useMemo(() => pontuacaoErgonomica(itens), [itens]);
  const nivel = nivelRiscoErgonomico(pontuacao);
  const grupos = useMemo(() => agruparItensErgonomia(itens.map((item, indice) => ({ ...item, indice }))), [itens]);
  const naoConformes = itens.filter((i) => i.conforme === false).length;
  const naoAplicaveis = itens.filter((i) => i.conforme === null).length;

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const p = new URLSearchParams();
      if (filtro.clienteId) p.set('clienteId', filtro.clienteId);
      if (filtro.areaId) p.set('areaId', filtro.areaId);
      if (filtro.nivelRisco) p.set('nivelRisco', filtro.nivelRisco);
      if (filtro.busca.trim()) p.set('busca', filtro.busca.trim());
      const consulta = p.toString();
      const [avaliacoes, cards] = await Promise.all([
        api.get<AvaliacaoApi[]>(`/ergonomia/avaliacoes${consulta ? `?${consulta}` : ''}`),
        api.get<ResumoErgonomia>(`/ergonomia/resumo${filtro.clienteId ? `?clienteId=${filtro.clienteId}` : ''}`),
      ]);
      setLista(avaliacoes);
      setResumo(cards);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar as avaliações.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [filtro, mostrar]);

  useEffect(() => {
    void api.get<Array<{ id: string; nomeFantasia: string }>>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
    void api
      .get<ItemPadrao[]>('/ergonomia/checklist-padrao')
      .then((p) => {
        if (p.length > 0) setPadrao(p);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!form.clienteId) {
      setAreasForm([]);
      return;
    }
    void api
      .get<{ itens: Array<{ id: string; nome: string; codigo: string }> }>(`/areas?clienteId=${form.clienteId}&porPagina=200`)
      .then((r) => setAreasForm(r.itens))
      .catch(() => setAreasForm([]));
  }, [form.clienteId]);

  useEffect(() => {
    if (!filtro.clienteId) {
      setAreasFiltro([]);
      return;
    }
    void api
      .get<{ itens: Array<{ id: string; nome: string; codigo: string }> }>(`/areas?clienteId=${filtro.clienteId}&porPagina=200`)
      .then((r) => setAreasFiltro(r.itens))
      .catch(() => setAreasFiltro([]));
  }, [filtro.clienteId]);

  function responder(indice: number, conforme: boolean | null) {
    setItens(itens.map((x, j) => (j === indice ? { ...x, conforme, observacao: conforme === false ? x.observacao : '' } : x)));
  }

  function observar(indice: number, observacao: string) {
    setItens(itens.map((x, j) => (j === indice ? { ...x, observacao } : x)));
  }

  function limparFormulario() {
    setForm(FORM_VAZIO);
    setItens(itensEmBranco(padrao));
    setErros({});
    setEditandoId(null);
  }

  function validarLocalmente(): Record<string, string> {
    const pendentes: Record<string, string> = {};
    if (!form.clienteId) pendentes.clienteId = 'Informe o cliente.';
    if (!form.data) pendentes.data = 'Informe a data da avaliação.';
    if (!form.avaliador.trim()) pendentes.avaliador = 'Informe quem avaliou.';
    if (itens.length === 0) pendentes.itens = 'Responda ao menos um item do checklist.';
    return pendentes;
  }

  async function salvar() {
    const pendentes = validarLocalmente();
    setErros(pendentes);
    if (Object.keys(pendentes).length > 0) {
      mostrar('Preencha os campos destacados.', 'erro');
      return;
    }
    setSalvando(true);
    try {
      const corpo = {
        clienteId: form.clienteId,
        areaId: form.areaId || null,
        funcao: form.funcao || null,
        data: form.data,
        avaliador: form.avaliador,
        tipo: form.tipo,
        itens: itens.map((i) => ({ ...i, observacao: i.observacao || null })),
        conclusao: form.conclusao || null,
        recomendacoes: form.recomendacoes || null,
      };
      let salva: AvaliacaoApi;
      if (editandoId) {
        salva = await api.put<AvaliacaoApi>(`/ergonomia/avaliacoes/${editandoId}`, corpo);
        mostrar('Avaliação atualizada.', 'sucesso');
      } else {
        salva = await api.post<AvaliacaoApi>('/ergonomia/avaliacoes', corpo);
        mostrar(
          salva.nivelRisco ? `Avaliação registrada — risco ${ROTULO_NIVEL_RISCO_ERGONOMICO[salva.nivelRisco].toLowerCase()} (${salva.pontuacao}%).` : 'Avaliação registrada.',
          salva.nivelRisco === 'ALTO' ? 'erro' : 'sucesso',
        );
      }
      limparFormulario();
      setAberta(salva);
      setAba('relatorio');
      void carregar();
    } catch (erro) {
      if (erro instanceof ErroApi) {
        const porCampo: Record<string, string> = {};
        for (const [campo, mensagens] of Object.entries(erro.campos)) porCampo[campo.split('.')[0] ?? campo] = mensagens[0] ?? 'Valor inválido.';
        setErros(porCampo);
        const textos = Object.values(porCampo);
        mostrar(textos.length > 0 ? textos.join(' ') : erro.mensagemAmigavel(), 'erro');
      } else {
        mostrar('Falha ao salvar a avaliação.', 'erro');
      }
    } finally {
      setSalvando(false);
    }
  }

  function editar(avaliacao: AvaliacaoApi) {
    setEditandoId(avaliacao.id);
    setErros({});
    setForm({
      clienteId: avaliacao.clienteId,
      areaId: avaliacao.areaId ?? '',
      funcao: avaliacao.funcao ?? '',
      data: avaliacao.data.slice(0, 10),
      avaliador: avaliacao.avaliador,
      tipo: avaliacao.tipo,
      conclusao: avaliacao.conclusao ?? '',
      recomendacoes: avaliacao.recomendacoes ?? '',
    });
    setItens(avaliacao.itens.map((i) => ({ ...i, observacao: i.observacao ?? '' })));
    setAba('avaliar');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function excluir(avaliacao: AvaliacaoApi) {
    if (!window.confirm(`Excluir a avaliação de ${formatarDataIso(avaliacao.data)} (${avaliacao.cliente?.nomeFantasia ?? 'cliente'})?`)) return;
    try {
      await api.delete(`/ergonomia/avaliacoes/${avaliacao.id}`);
      mostrar('Avaliação excluída.', 'sucesso');
      if (aberta?.id === avaliacao.id) setAberta(null);
      if (editandoId === avaliacao.id) limparFormulario();
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao excluir.', 'erro');
    }
  }

  async function anexar(avaliacao: AvaliacaoApi, arquivo: File) {
    try {
      const atualizada = await api.upload<AvaliacaoApi>(`/ergonomia/avaliacoes/${avaliacao.id}/arquivo`, arquivo);
      mostrar('Laudo anexado.', 'sucesso');
      setAberta(atualizada);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao anexar o arquivo.', 'erro');
    }
  }

  function abrir(avaliacao: AvaliacaoApi) {
    setAberta(avaliacao);
    setAba('relatorio');
  }

  return (
    <>
      <div className="painel sem-impressao">
        <h3>Ergonomia — NR-17</h3>
        <p className="desc">
          Avaliação do posto de trabalho por checklist: cada item é uma afirmação verificável, respondida como conforme,
          não conforme ou não se aplica. A pontuação é o percentual de itens conformes entre os aplicáveis e o nível de
          risco deriva dela (80% ou mais: baixo; 50 a 79%: médio; abaixo de 50%: alto). Nada disso é escolhido à mão.
        </p>

        {resumo ? (
          <div className="stat-grid">
            <div className="stat">
              <b>{resumo.total}</b>
              <span>avaliações registradas</span>
            </div>
            <div className="stat">
              <b>{resumo.porNivel.BAIXO}</b>
              <span>risco baixo</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.porNivel.MEDIO > 0 ? 'var(--orange, #d97706)' : undefined }}>{resumo.porNivel.MEDIO}</b>
              <span>risco médio</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.porNivel.ALTO > 0 ? 'var(--red)' : undefined }}>{resumo.porNivel.ALTO}</b>
              <span>risco alto</span>
            </div>
            <div className="stat">
              <b>{resumo.ultima ? formatarDataIso(resumo.ultima.data) : '—'}</b>
              <span>última avaliação</span>
            </div>
          </div>
        ) : null}

        {resumo && resumo.categoriasCriticas.length > 0 ? (
          <div className="hint" style={{ marginTop: 8 }}>
            Categorias com mais não conformidades:{' '}
            {resumo.categoriasCriticas.map((c, i) => (
              <span key={c.categoria}>
                {i > 0 ? ' · ' : ''}
                <b>{c.categoria}</b> ({c.naoConformes})
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="abas sem-impressao">
        <button type="button" className={aba === 'avaliar' ? 'ativa' : ''} onClick={() => setAba('avaliar')}>
          Avaliar
        </button>
        <button type="button" className={aba === 'historico' ? 'ativa' : ''} onClick={() => setAba('historico')}>
          Histórico
        </button>
        <button type="button" className={aba === 'relatorio' ? 'ativa' : ''} onClick={() => setAba('relatorio')}>
          Relatório
        </button>
      </div>

      {aba === 'avaliar' ? (
        podeEscrever ? (
          <div className="painel sem-impressao">
            <h3>{editandoId ? 'Editar avaliação' : 'Nova avaliação ergonômica'}</h3>
            <div className="filtros">
              <Campo label="Cliente" htmlFor="erg-cliente" obrigatorio erro={erros.clienteId}>
                <select id="erg-cliente" value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value, areaId: '' })}>
                  <option value="">Selecione...</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nomeFantasia}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Área" htmlFor="erg-area" erro={erros.areaId}>
                <select id="erg-area" value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })}>
                  <option value="">Sem área</option>
                  {areasForm.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.codigo} — {a.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Função avaliada" htmlFor="erg-funcao" erro={erros.funcao}>
                <input id="erg-funcao" value={form.funcao} onChange={(e) => setForm({ ...form, funcao: e.target.value })} placeholder="Operador de caixa" maxLength={80} />
              </Campo>
              <Campo label="Data" htmlFor="erg-data" obrigatorio erro={erros.data}>
                <input id="erg-data" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              </Campo>
              <Campo label="Avaliador" htmlFor="erg-avaliador" obrigatorio erro={erros.avaliador}>
                <input id="erg-avaliador" value={form.avaliador} onChange={(e) => setForm({ ...form, avaliador: e.target.value })} maxLength={120} />
              </Campo>
              <Campo label="Tipo" htmlFor="erg-tipo" erro={erros.tipo}>
                <select id="erg-tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoAvaliacaoErgonomica })}>
                  {TIPOS_AVALIACAO_ERGONOMICA.map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_TIPO_AVALIACAO_ERGONOMICA[t]}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>

            <div className="barra-acoes" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <h4 style={{ margin: 0 }}>Checklist NR-17</h4>
              <span className={`pill ${nivel ? PILL_NIVEL[nivel] : 'gray'}`}>
                {pontuacao === null ? 'Sem itens aplicáveis' : `${pontuacao}% conforme · risco ${ROTULO_NIVEL_RISCO_ERGONOMICO[nivel!].toLowerCase()}`}
              </span>
              <span className="hint">
                {naoConformes} não conforme(s) · {naoAplicaveis} não se aplica(m) · {itens.length} itens
              </span>
            </div>
            {erros.itens ? (
              <div className="hint alerta" role="alert">
                {erros.itens}
              </div>
            ) : null}

            {grupos.map((grupo) => (
              <div key={grupo.categoria} className="ishikawa-categoria" style={{ marginBottom: 10 }}>
                <h5>{grupo.categoria}</h5>
                {grupo.itens.map((r) => (
                  <div key={r.indice} className="checklist-item">
                    <div>{r.item}</div>
                    <div className="escolha">
                      <button type="button" className={`btn btn-sm ${r.conforme === true ? 'ativo-ok' : 'btn-ghost'}`} onClick={() => responder(r.indice, true)}>
                        Conforme
                      </button>
                      <button type="button" className={`btn btn-sm ${r.conforme === false ? 'ativo-bad' : 'btn-ghost'}`} onClick={() => responder(r.indice, false)}>
                        Não conforme
                      </button>
                      <button type="button" className={`btn btn-sm ${r.conforme === null ? 'btn-outline' : 'btn-ghost'}`} onClick={() => responder(r.indice, null)}>
                        Não se aplica
                      </button>
                    </div>
                    {r.conforme === false ? (
                      <input placeholder="O que foi encontrado?" value={r.observacao ?? ''} maxLength={500} onChange={(e) => observar(r.indice, e.target.value)} />
                    ) : null}
                  </div>
                ))}
              </div>
            ))}

            <div className="grid2">
              <Campo label="Conclusão" htmlFor="erg-conclusao" erro={erros.conclusao}>
                <textarea id="erg-conclusao" rows={3} value={form.conclusao} onChange={(e) => setForm({ ...form, conclusao: e.target.value })} />
              </Campo>
              <Campo label="Recomendações" htmlFor="erg-recomendacoes" erro={erros.recomendacoes}>
                <textarea id="erg-recomendacoes" rows={3} value={form.recomendacoes} onChange={(e) => setForm({ ...form, recomendacoes: e.target.value })} />
              </Campo>
            </div>

            <div className="barra-acoes">
              <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void salvar()}>
                {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Registrar avaliação'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={limparFormulario}>
                {editandoId ? 'Cancelar edição' : 'Limpar'}
              </button>
            </div>
          </div>
        ) : (
          <div className="painel sem-impressao">
            <div className="vazio">
              <div className="icone-vazio" aria-hidden="true">
                <Icone nome="cadeado" tamanho={22} />
              </div>
              <h4>Sem permissão para avaliar</h4>
              <p>Seu perfil só consulta. Veja o histórico e os relatórios nas outras abas.</p>
            </div>
          </div>
        )
      ) : null}

      {aba === 'historico' ? (
        <div className="painel sem-impressao">
          <div className="filtros">
            <Campo label="Cliente" htmlFor="ferg-cliente">
              <select id="ferg-cliente" value={filtro.clienteId} onChange={(e) => setFiltro({ ...filtro, clienteId: e.target.value, areaId: '' })}>
                <option value="">Todos</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nomeFantasia}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Área" htmlFor="ferg-area">
              <select id="ferg-area" value={filtro.areaId} onChange={(e) => setFiltro({ ...filtro, areaId: e.target.value })} disabled={!filtro.clienteId}>
                <option value="">{filtro.clienteId ? 'Todas' : 'Escolha um cliente'}</option>
                {areasFiltro.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo} — {a.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Nível de risco" htmlFor="ferg-nivel">
              <select id="ferg-nivel" value={filtro.nivelRisco} onChange={(e) => setFiltro({ ...filtro, nivelRisco: e.target.value })}>
                <option value="">Todos</option>
                {NIVEIS_RISCO_ERGONOMICO.map((n) => (
                  <option key={n} value={n}>
                    {ROTULO_NIVEL_RISCO_ERGONOMICO[n]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Buscar" htmlFor="ferg-busca">
              <input id="ferg-busca" className="busca" value={filtro.busca} onChange={(e) => setFiltro({ ...filtro, busca: e.target.value })} placeholder="Função, avaliador, área..." />
            </Campo>
          </div>

          {carregando ? (
            <div className="centro-tela">
              <div className="spinner" />
              Carregando...
            </div>
          ) : lista.length === 0 ? (
            <div className="vazio">
              <div className="icone-vazio" aria-hidden="true">
                <Icone nome="pessoa" tamanho={22} />
              </div>
              <h4>Nenhuma avaliação</h4>
              <p>Registre a primeira na aba Avaliar.</p>
            </div>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Cliente / área</th>
                    <th>Função</th>
                    <th>Tipo</th>
                    <th>Avaliador</th>
                    <th className="num-col">Pontuação</th>
                    <th>Nível</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {lista.map((a) => (
                    <tr key={a.id}>
                      <td>{formatarDataIso(a.data)}</td>
                      <td>
                        <b>{a.cliente?.nomeFantasia}</b>
                        {a.area ? <div className="hint">{a.area.nome}</div> : null}
                      </td>
                      <td>{a.funcao ?? '—'}</td>
                      <td>{a.rotulos?.tipo ?? ROTULO_TIPO_AVALIACAO_ERGONOMICA[a.tipo]}</td>
                      <td>{a.avaliador}</td>
                      <td className="num-col">{a.pontuacao === null ? '—' : `${a.pontuacao}%`}</td>
                      <td>
                        {a.nivelRisco ? (
                          <span className={`pill ${PILL_NIVEL[a.nivelRisco]}`}>{a.rotulos?.nivelRisco ?? ROTULO_NIVEL_RISCO_ERGONOMICO[a.nivelRisco]}</span>
                        ) : (
                          <span className="pill gray">Sem pontuação</span>
                        )}
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrir(a)}>
                          Abrir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {aba === 'relatorio' ? (
        aberta ? (
          <RelatorioAvaliacao avaliacao={aberta} podeEscrever={podeEscrever} aoEditar={editar} aoExcluir={excluir} aoAnexar={anexar} />
        ) : (
          <div className="painel sem-impressao">
            <div className="vazio">
              <div className="icone-vazio" aria-hidden="true">
                <Icone nome="documento" tamanho={22} />
              </div>
              <h4>Nenhuma avaliação aberta</h4>
              <p>Abra uma avaliação pelo histórico ou registre uma nova para ver o relatório.</p>
            </div>
          </div>
        )
      ) : null}
    </>
  );
}

interface RelatorioProps {
  avaliacao: AvaliacaoApi;
  podeEscrever: boolean;
  aoEditar: (a: AvaliacaoApi) => void;
  aoExcluir: (a: AvaliacaoApi) => void | Promise<void>;
  aoAnexar: (a: AvaliacaoApi, arquivo: File) => void | Promise<void>;
}

/** Folha imprimivel da avaliacao: cabecalho, itens por categoria, resultado, conclusao e assinatura. */
function RelatorioAvaliacao({ avaliacao, podeEscrever, aoEditar, aoExcluir, aoAnexar }: RelatorioProps) {
  const a = avaliacao;
  const grupos = agruparItensErgonomia(a.itens);
  const aplicaveis = a.itens.filter((i) => i.conforme !== null).length;
  const conformes = a.itens.filter((i) => i.conforme === true).length;

  return (
    <>
      <div className="painel sem-impressao">
        <div className="barra-acoes" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span className="hint">Avaliação de {formatarDataIso(a.data)} — {a.cliente?.nomeFantasia}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {podeEscrever ? (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => aoEditar(a)}>
                  Editar
                </button>
                <label className="btn btn-ghost">
                  <Icone nome="anexo" /> {a.arquivoUrl ? 'Substituir laudo' : 'Anexar laudo'}
                  <input type="file" hidden accept="application/pdf,image/*" onChange={(e) => e.target.files?.[0] && void aoAnexar(a, e.target.files[0])} />
                </label>
                <button type="button" className="btn btn-ghost" onClick={() => void aoExcluir(a)}>
                  Excluir
                </button>
              </>
            ) : null}
            <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
              <Icone nome="impressora" /> Imprimir
            </button>
          </div>
        </div>
      </div>

      <div className="painel folha">
        <div className="folha-cabecalho">
          <div>
            <h2>Avaliação Ergonômica — NR-17</h2>
            <div className="hint">
              {a.rotulos?.tipo ?? ROTULO_TIPO_AVALIACAO_ERGONOMICA[a.tipo]}
            </div>
          </div>
          <div className="meta">
            {a.nivelRisco ? (
              <span className={`pill ${PILL_NIVEL[a.nivelRisco]}`}>Risco {(a.rotulos?.nivelRisco ?? ROTULO_NIVEL_RISCO_ERGONOMICO[a.nivelRisco]).toLowerCase()}</span>
            ) : (
              <span className="pill gray">Sem pontuação</span>
            )}
            {a.arquivoUrl ? (
              <div>
                <a href={urlAbsoluta(a.arquivoUrl) ?? '#'} target="_blank" rel="noreferrer">
                  Ver laudo anexado
                </a>
              </div>
            ) : null}
          </div>
        </div>

        <dl className="folha-dados" style={{ marginBottom: 16 }}>
          <div>
            <dt>Cliente</dt>
            <dd>{a.cliente?.nomeFantasia ?? '—'}</dd>
          </div>
          <div>
            <dt>Área / função</dt>
            <dd>
              {a.area ? `${a.area.codigo} ${a.area.nome}` : 'Sem área'}
              {a.funcao ? ` · ${a.funcao}` : ''}
            </dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>{formatarDataIso(a.data)}</dd>
          </div>
          <div>
            <dt>Avaliador</dt>
            <dd>{a.avaliador}</dd>
          </div>
        </dl>

        {grupos.map((grupo) => (
          <div key={grupo.categoria} className="folha-secao">
            <h4>{grupo.categoria}</h4>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Resultado</th>
                    <th>Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.itens.map((item, i) => (
                    <tr key={i}>
                      <td>{item.item}</td>
                      <td>
                        <span className={`pill ${item.conforme === true ? 'ok' : item.conforme === false ? 'bad' : 'gray'}`}>{rotuloResposta(item.conforme)}</span>
                      </td>
                      <td>{item.observacao || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <div className="folha-secao">
          <h4>Resultado</h4>
          <dl className="folha-dados">
            <div>
              <dt>Pontuação</dt>
              <dd>
                {a.pontuacao === null ? 'Sem itens aplicáveis' : `${a.pontuacao}% conforme`}
                <span className="hint"> ({conformes} de {aplicaveis} aplicáveis)</span>
              </dd>
            </div>
            <div>
              <dt>Nível de risco</dt>
              <dd>{a.nivelRisco ? (a.rotulos?.nivelRisco ?? ROTULO_NIVEL_RISCO_ERGONOMICO[a.nivelRisco]) : '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="folha-secao">
          <h4>Conclusão</h4>
          <p style={{ whiteSpace: 'pre-wrap' }}>{a.conclusao || '—'}</p>
        </div>
        <div className="folha-secao">
          <h4>Recomendações</h4>
          <p style={{ whiteSpace: 'pre-wrap' }}>{a.recomendacoes || '—'}</p>
        </div>

        <div className="folha-assinatura">
          <div>
            <div style={{ height: 50 }} />
            Avaliador — {a.avaliador}
          </div>
          <div>
            <div style={{ height: 50 }} />
            Responsável pelo cliente
          </div>
        </div>
      </div>
    </>
  );
}
