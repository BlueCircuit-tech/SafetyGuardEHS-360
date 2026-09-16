import { useCallback, useEffect, useState } from 'react';
import { ROTULO_SITUACAO_APR, SITUACOES_APR, type AprEtapa, type SituacaoApr } from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import { useSessao } from '../lib/sessao';

interface AprApi {
  id: string;
  codigo: string;
  versao: number;
  atividade: string;
  local: string | null;
  dataInicio: string;
  dataFim: string | null;
  responsavel: string;
  etapas: AprEtapa[];
  situacao: SituacaoApr;
  aprovadaPor: string | null;
  aprovadaEm: string | null;
  aprovacaoHash: string | null;
  arquivoUrl: string | null;
  cliente?: { id: string; nomeFantasia: string };
  area?: { id: string; nome: string; codigo: string } | null;
  terceiro?: { id: string; nomeFantasia: string } | null;
  rotulos?: { situacao: string };
}

const PILL_APR: Record<SituacaoApr, string> = { RASCUNHO: 'warn', APROVADA: 'ok', ENCERRADA: 'gray' };
const ETAPA_VAZIA: AprEtapa = { etapa: '', perigos: '', riscos: '', medidasControle: '', epis: '' };
const NOVA_VAZIA = { clienteId: '', areaId: '', terceiroId: '', atividade: '', local: '', dataInicio: '', dataFim: '', responsavel: '', etapas: [{ ...ETAPA_VAZIA }] };

/**
 * APR — a atividade decomposta em etapas, cada uma com perigos, riscos e
 * controles. Rascunho se edita; aprovada se congela e recebe carimbo; para
 * mudar, gera-se nova versao com o mesmo codigo.
 */
export function AprPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('observacoes:escrever');

  const [carregando, setCarregando] = useState(true);
  const [itens, setItens] = useState<AprApi[]>([]);
  const [total, setTotal] = useState(0);
  const [clientes, setClientes] = useState<Array<{ id: string; nomeFantasia: string }>>([]);
  const [areas, setAreas] = useState<Array<{ id: string; nome: string; codigo: string }>>([]);
  const [clienteId, setClienteId] = useState('');
  const [situacao, setSituacao] = useState('');

  const [form, setForm] = useState(NOVA_VAZIA);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aberta, setAberta] = useState<AprApi | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const p = new URLSearchParams({ porPagina: '50' });
      if (clienteId) p.set('clienteId', clienteId);
      if (situacao) p.set('situacao', situacao);
      const lista = await api.get<{ itens: AprApi[]; total: number }>(`/aprs?${p.toString()}`);
      setItens(lista.itens);
      setTotal(lista.total);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar as APRs.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [clienteId, situacao, mostrar]);

  useEffect(() => {
    void api.get<Array<{ id: string; nomeFantasia: string }>>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!form.clienteId) {
      setAreas([]);
      return;
    }
    void api
      .get<{ itens: Array<{ id: string; nome: string; codigo: string }> }>(`/areas?clienteId=${form.clienteId}&porPagina=200`)
      .then((r) => setAreas(r.itens))
      .catch(() => setAreas([]));
  }, [form.clienteId]);

  function definirEtapa(indice: number, campo: keyof AprEtapa, valor: string) {
    setForm({ ...form, etapas: form.etapas.map((e, i) => (i === indice ? { ...e, [campo]: valor } : e)) });
  }

  async function salvar() {
    setSalvando(true);
    try {
      const corpo = {
        ...form,
        areaId: form.areaId || undefined,
        terceiroId: form.terceiroId || undefined,
        local: form.local || undefined,
        dataFim: form.dataFim || undefined,
        etapas: form.etapas.map((e) => ({ ...e, epis: e.epis || undefined })),
      };
      if (editandoId) {
        await api.put(`/aprs/${editandoId}`, corpo);
        mostrar('APR atualizada.', 'sucesso');
      } else {
        const criada = await api.post<AprApi>('/aprs', corpo);
        mostrar(`${criada.codigo} criada como rascunho.`, 'sucesso');
      }
      setForm(NOVA_VAZIA);
      setEditandoId(null);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao salvar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  function editar(apr: AprApi) {
    setEditandoId(apr.id);
    setAberta(null);
    setForm({
      clienteId: apr.cliente?.id ?? '',
      areaId: apr.area?.id ?? '',
      terceiroId: apr.terceiro?.id ?? '',
      atividade: apr.atividade,
      local: apr.local ?? '',
      dataInicio: apr.dataInicio.slice(0, 10),
      dataFim: apr.dataFim?.slice(0, 10) ?? '',
      responsavel: apr.responsavel,
      etapas: apr.etapas.map((e) => ({ ...e, epis: e.epis ?? '' })),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function acao(apr: AprApi, caminho: 'aprovar' | 'nova-versao' | 'encerrar') {
    try {
      let corpo: unknown = {};
      if (caminho === 'aprovar') {
        const aprovadaPor = window.prompt('Nome de quem aprova a APR:');
        if (!aprovadaPor) return;
        corpo = { aprovadaPor };
      }
      if (caminho === 'encerrar' && !window.confirm(`Encerrar ${apr.codigo} v${apr.versao}?`)) return;
      const resultado = await api.post<AprApi>(`/aprs/${apr.id}/${caminho}`, corpo);
      mostrar(caminho === 'aprovar' ? 'APR aprovada e carimbada.' : caminho === 'nova-versao' ? `Versão ${resultado.versao} criada como rascunho.` : 'APR encerrada.', 'sucesso');
      setAberta(resultado);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha na operação.', 'erro');
    }
  }

  async function anexar(apr: AprApi, arquivo: File) {
    try {
      const atualizada = await api.upload<AprApi>(`/aprs/${apr.id}/arquivo`, arquivo);
      mostrar('Arquivo anexado.', 'sucesso');
      setAberta(atualizada);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao anexar.', 'erro');
    }
  }

  if (aberta) {
    const apr = aberta;
    return (
      <>
        <div className="painel sem-impressao">
          <div className="barra-acoes" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setAberta(null)}>
              <Icone nome="voltar" /> Voltar
            </button>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {podeEscrever && apr.situacao === 'RASCUNHO' ? (
                <>
                  <button type="button" className="btn btn-ghost" onClick={() => editar(apr)}>
                    Editar
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => void acao(apr, 'aprovar')}>
                    <Icone nome="ok" /> Aprovar
                  </button>
                </>
              ) : null}
              {podeEscrever && apr.situacao !== 'RASCUNHO' ? (
                <button type="button" className="btn btn-ghost" onClick={() => void acao(apr, 'nova-versao')}>
                  Nova versão
                </button>
              ) : null}
              {podeEscrever && apr.situacao === 'APROVADA' ? (
                <button type="button" className="btn btn-ghost" onClick={() => void acao(apr, 'encerrar')}>
                  Encerrar
                </button>
              ) : null}
              {podeEscrever ? (
                <label className="btn btn-ghost">
                  <Icone nome="anexo" /> Anexar assinada
                  <input type="file" hidden accept="application/pdf,image/*" onChange={(e) => e.target.files?.[0] && void anexar(apr, e.target.files[0])} />
                </label>
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
              <h2>
                APR {apr.codigo} <span className="hint">v{apr.versao}</span>
              </h2>
              <div className="hint">
                {apr.cliente?.nomeFantasia}
                {apr.area ? ` · ${apr.area.codigo} ${apr.area.nome}` : null}
                {apr.terceiro ? ` · ${apr.terceiro.nomeFantasia}` : null}
              </div>
            </div>
            <div className="meta">
              <span className={`pill ${PILL_APR[apr.situacao]}`}>{apr.rotulos?.situacao ?? apr.situacao}</span>
              {apr.arquivoUrl ? (
                <div>
                  <a href={urlAbsoluta(apr.arquivoUrl) ?? '#'} target="_blank" rel="noreferrer">
                    Ver arquivo assinado
                  </a>
                </div>
              ) : null}
            </div>
          </div>

          <dl className="folha-dados" style={{ marginBottom: 16 }}>
            <div>
              <dt>Atividade</dt>
              <dd>{apr.atividade}</dd>
            </div>
            <div>
              <dt>Local</dt>
              <dd>{apr.local ?? '—'}</dd>
            </div>
            <div>
              <dt>Período</dt>
              <dd>
                {formatarDataIso(apr.dataInicio)}
                {apr.dataFim ? ` a ${formatarDataIso(apr.dataFim)}` : ''}
              </dd>
            </div>
            <div>
              <dt>Responsável</dt>
              <dd>{apr.responsavel}</dd>
            </div>
          </dl>

          <div className="folha-secao">
            <h4>Etapas da atividade</h4>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Etapa</th>
                    <th>Perigos</th>
                    <th>Riscos</th>
                    <th>Medidas de controle</th>
                    <th>EPIs</th>
                  </tr>
                </thead>
                <tbody>
                  {apr.etapas.map((e, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>
                        <b>{e.etapa}</b>
                      </td>
                      <td>{e.perigos}</td>
                      <td>{e.riscos}</td>
                      <td>{e.medidasControle}</td>
                      <td>{e.epis ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="folha-assinatura">
            <div>
              <div style={{ height: 50 }} />
              Elaborado por — {apr.responsavel}
            </div>
            <div>
              <div style={{ height: 50 }} />
              {apr.aprovadaPor ? `Aprovado por — ${apr.aprovadaPor}` : 'Aprovação'}
              {apr.aprovadaEm ? <div className="hint">em {new Date(apr.aprovadaEm).toLocaleString('pt-BR')}</div> : null}
              {apr.aprovacaoHash ? <div className="carimbo">carimbo sha256 {apr.aprovacaoHash}</div> : null}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="painel">
        <h3>APR — Análise Preliminar de Risco</h3>
        <p className="desc">
          A atividade decomposta em etapas, cada uma com perigos, riscos e medidas de controle. Rascunho se edita;
          aprovada se congela e recebe carimbo. Para mudar uma APR aprovada, gera-se nova versão com o mesmo código.
        </p>
      </div>

      {podeEscrever ? (
        <div className="painel">
          <h3>{editandoId ? 'Editar APR (rascunho)' : 'Nova APR'}</h3>
          <div className="filtros">
            <Campo label="Cliente" htmlFor="apr-cliente" obrigatorio>
              <select id="apr-cliente" value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value, areaId: '' })}>
                <option value="">Selecione...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nomeFantasia}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Área" htmlFor="apr-area">
              <select id="apr-area" value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })}>
                <option value="">Sem área</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo} — {a.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Início" htmlFor="apr-ini" obrigatorio>
              <input id="apr-ini" type="date" value={form.dataInicio} onChange={(e) => setForm({ ...form, dataInicio: e.target.value })} />
            </Campo>
            <Campo label="Fim" htmlFor="apr-fim">
              <input id="apr-fim" type="date" value={form.dataFim} onChange={(e) => setForm({ ...form, dataFim: e.target.value })} />
            </Campo>
          </div>
          <div className="grid2">
            <Campo label="Atividade" htmlFor="apr-ativ" obrigatorio>
              <input id="apr-ativ" value={form.atividade} onChange={(e) => setForm({ ...form, atividade: e.target.value })} />
            </Campo>
            <Campo label="Local" htmlFor="apr-local">
              <input id="apr-local" value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} />
            </Campo>
          </div>
          <Campo label="Responsável pela elaboração" htmlFor="apr-resp" obrigatorio>
            <input id="apr-resp" value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} />
          </Campo>

          <h4>Etapas</h4>
          {form.etapas.map((e, i) => (
            <div key={i} className="ishikawa-categoria" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h5>Etapa {i + 1}</h5>
                {form.etapas.length > 1 ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, etapas: form.etapas.filter((_, j) => j !== i) })}>
                    Remover
                  </button>
                ) : null}
              </div>
              <div className="grid2">
                <Campo label="O que se faz" htmlFor={`et-${i}-etapa`} obrigatorio>
                  <input id={`et-${i}-etapa`} value={e.etapa} onChange={(ev) => definirEtapa(i, 'etapa', ev.target.value)} />
                </Campo>
                <Campo label="EPIs" htmlFor={`et-${i}-epis`}>
                  <input id={`et-${i}-epis`} value={e.epis ?? ''} onChange={(ev) => definirEtapa(i, 'epis', ev.target.value)} />
                </Campo>
              </div>
              <div className="grid2">
                <Campo label="Perigos" htmlFor={`et-${i}-perigos`} obrigatorio>
                  <textarea id={`et-${i}-perigos`} rows={2} value={e.perigos} onChange={(ev) => definirEtapa(i, 'perigos', ev.target.value)} />
                </Campo>
                <Campo label="Riscos" htmlFor={`et-${i}-riscos`} obrigatorio>
                  <textarea id={`et-${i}-riscos`} rows={2} value={e.riscos} onChange={(ev) => definirEtapa(i, 'riscos', ev.target.value)} />
                </Campo>
              </div>
              <Campo label="Medidas de controle" htmlFor={`et-${i}-medidas`} obrigatorio>
                <textarea id={`et-${i}-medidas`} rows={2} value={e.medidasControle} onChange={(ev) => definirEtapa(i, 'medidasControle', ev.target.value)} />
              </Campo>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, etapas: [...form.etapas, { ...ETAPA_VAZIA }] })}>
            <Icone nome="mais" /> Adicionar etapa
          </button>

          <div className="barra-acoes">
            <button
              type="button"
              className="btn btn-primary"
              disabled={salvando || !form.clienteId || !form.atividade || !form.dataInicio || !form.responsavel || form.etapas.some((e) => !e.etapa || !e.perigos || !e.riscos || !e.medidasControle)}
              onClick={() => void salvar()}
            >
              {salvando ? 'Salvando...' : editandoId ? 'Salvar rascunho' : 'Criar APR'}
            </button>
            {editandoId ? (
              <button type="button" className="btn btn-ghost" onClick={() => { setEditandoId(null); setForm(NOVA_VAZIA); }}>
                Cancelar
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="painel">
        <div className="filtros">
          <Campo label="Cliente" htmlFor="fapr-cliente">
            <select id="fapr-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Situação" htmlFor="fapr-sit">
            <select id="fapr-sit" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="">Todas</option>
              {SITUACOES_APR.map((s) => (
                <option key={s} value={s}>
                  {ROTULO_SITUACAO_APR[s]}
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
              <Icone nome="documento" tamanho={22} />
            </div>
            <h4>Nenhuma APR</h4>
            <p>Crie a primeira decompondo a atividade em etapas.</p>
          </div>
        ) : (
          <>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Atividade</th>
                    <th>Onde</th>
                    <th>Período</th>
                    <th className="num-col">Etapas</th>
                    <th>Situação</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {itens.map((apr) => (
                    <tr key={apr.id}>
                      <td className="mono">
                        {apr.codigo} <span className="hint">v{apr.versao}</span>
                      </td>
                      <td>
                        <b>{apr.atividade}</b>
                        <div className="hint">{apr.responsavel}</div>
                      </td>
                      <td>
                        {apr.cliente?.nomeFantasia}
                        {apr.area ? <div className="hint">{apr.area.nome}</div> : null}
                      </td>
                      <td>{formatarDataIso(apr.dataInicio)}</td>
                      <td className="num-col">{apr.etapas.length}</td>
                      <td>
                        <span className={`pill ${PILL_APR[apr.situacao]}`}>{apr.rotulos?.situacao ?? apr.situacao}</span>
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAberta(apr)}>
                          Abrir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="paginacao">
              <span>
                Exibindo {itens.length} de {total}
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
