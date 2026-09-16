import { useCallback, useEffect, useState } from 'react';
import { resultadoDoChecklist, type ChecklistItem, type ChecklistResposta, type ResultadoChecklist } from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { ListaEditavel } from '../componentes/ListaEditavel';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { useSessao } from '../lib/sessao';

interface ModeloApi {
  id: string;
  nome: string;
  tipoEquipamento: string;
  itens: ChecklistItem[];
  ativo: boolean;
  clienteId: string;
  _count?: { execucoes: number };
}

interface ExecucaoApi {
  id: string;
  equipamentoIdentificacao: string;
  dataHora: string;
  executadoPor: string;
  respostas: ChecklistResposta[];
  resultado: ResultadoChecklist;
  fotoUrl: string | null;
  hash: string | null;
  modelo?: { id: string; nome: string; tipoEquipamento: string };
  cliente?: { id: string; nomeFantasia: string };
  area?: { id: string; nome: string } | null;
  colaborador?: { id: string; nome: string } | null;
}

interface Resumo {
  checklist: { ultimos30Dias: number; reprovados30Dias: number };
}

const MODELO_VAZIO = { clienteId: '', nome: '', tipoEquipamento: '', itens: [] as string[], impeditivos: new Set<number>() };

/**
 * Checklist de pre-uso: o modelo define os itens (alguns impeditivos); a
 * execucao registra as respostas com foto e carimbo. Impeditivo nao conforme
 * reprova o equipamento — o resultado nao e escolhido, e derivado.
 */
export function ChecklistsPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('observacoes:escrever');

  const [aba, setAba] = useState<'executar' | 'historico' | 'modelos'>('executar');
  const [clientes, setClientes] = useState<Array<{ id: string; nomeFantasia: string }>>([]);
  const [modelos, setModelos] = useState<ModeloApi[]>([]);
  const [execucoes, setExecucoes] = useState<ExecucaoApi[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Executar
  const [modeloId, setModeloId] = useState('');
  const [equipamento, setEquipamento] = useState('');
  const [executadoPor, setExecutadoPor] = useState('');
  const [respostas, setRespostas] = useState<ChecklistResposta[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [ultima, setUltima] = useState<ExecucaoApi | null>(null);

  // Modelos
  const [novoModelo, setNovoModelo] = useState(MODELO_VAZIO);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [m, e, r] = await Promise.all([
        api.get<ModeloApi[]>('/checklists/modelos'),
        api.get<{ itens: ExecucaoApi[] }>('/checklists/execucoes?porPagina=50'),
        api.get<Resumo>('/documentacao-tecnica/resumo'),
      ]);
      setModelos(m);
      setExecucoes(e.itens);
      setResumo(r);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [mostrar]);

  useEffect(() => {
    void api.get<Array<{ id: string; nomeFantasia: string }>>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
    void carregar();
  }, [carregar]);

  // Ao escolher o modelo, monta as respostas em branco a partir dos itens.
  useEffect(() => {
    const modelo = modelos.find((m) => m.id === modeloId);
    setRespostas(modelo ? modelo.itens.map((i) => ({ descricao: i.descricao, impeditivo: i.impeditivo, conforme: true, observacao: '' })) : []);
    setUltima(null);
  }, [modeloId, modelos]);

  const resultadoPrevisto = respostas.length > 0 ? resultadoDoChecklist(respostas) : null;

  async function executar() {
    setSalvando(true);
    try {
      const execucao = await api.post<ExecucaoApi>('/checklists/execucoes', {
        modeloId,
        equipamentoIdentificacao: equipamento,
        executadoPor,
        respostas: respostas.map((r) => ({ ...r, observacao: r.observacao || undefined })),
      });
      mostrar(execucao.resultado === 'APTO' ? 'Equipamento APTO para uso.' : 'Equipamento NÃO APTO — item impeditivo não conforme.', execucao.resultado === 'APTO' ? 'sucesso' : 'erro');
      setUltima(execucao);
      setEquipamento('');
      setRespostas(respostas.map((r) => ({ ...r, conforme: true, observacao: '' })));
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao registrar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function anexarFoto(id: string, arquivo: File) {
    try {
      const atualizada = await api.upload<ExecucaoApi>(`/checklists/execucoes/${id}/foto`, arquivo);
      mostrar('Foto anexada.', 'sucesso');
      if (ultima?.id === id) setUltima(atualizada);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao anexar.', 'erro');
    }
  }

  async function criarModelo() {
    setSalvando(true);
    try {
      await api.post('/checklists/modelos', {
        clienteId: novoModelo.clienteId,
        nome: novoModelo.nome,
        tipoEquipamento: novoModelo.tipoEquipamento,
        itens: novoModelo.itens.map((descricao, i) => ({ descricao, impeditivo: novoModelo.impeditivos.has(i) })),
      });
      mostrar('Modelo criado.', 'sucesso');
      setNovoModelo(MODELO_VAZIO);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao criar o modelo.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(modelo: ModeloApi) {
    try {
      await api.put(`/checklists/modelos/${modelo.id}`, { ativo: !modelo.ativo });
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao atualizar.', 'erro');
    }
  }

  return (
    <>
      <div className="painel">
        <h3>Checklists de pré-uso</h3>
        <p className="desc">
          Antes de operar, o equipamento é verificado item a item. Itens <b>impeditivos</b> não conformes reprovam o
          equipamento — o resultado é derivado das respostas, não escolhido. Cada execução recebe foto e carimbo.
        </p>
        {resumo ? (
          <div className="stat-grid">
            <div className="stat">
              <b>{resumo.checklist.ultimos30Dias}</b>
              <span>execuções nos últimos 30 dias</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.checklist.reprovados30Dias > 0 ? 'var(--red)' : undefined }}>{resumo.checklist.reprovados30Dias}</b>
              <span>equipamento(s) reprovado(s) (30d)</span>
            </div>
            <div className="stat">
              <b>{modelos.length}</b>
              <span>modelo(s) ativo(s)</span>
            </div>
          </div>
        ) : null}
        <div className="barra-acoes" style={{ marginTop: 8 }}>
          {(['executar', 'historico', 'modelos'] as const).map((a) => (
            <button key={a} type="button" className={`btn ${aba === a ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAba(a)}>
              {a === 'executar' ? 'Executar checklist' : a === 'historico' ? 'Histórico' : 'Modelos'}
            </button>
          ))}
        </div>
      </div>

      {aba === 'executar' ? (
        <div className="painel">
          {!podeEscrever ? (
            <p className="hint">Sem permissão para registrar execuções.</p>
          ) : (
            <>
              <div className="filtros">
                <Campo label="Modelo" htmlFor="ck-modelo" obrigatorio>
                  <select id="ck-modelo" value={modeloId} onChange={(e) => setModeloId(e.target.value)}>
                    <option value="">Selecione o equipamento...</option>
                    {modelos.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.tipoEquipamento} — {m.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Identificação do equipamento" htmlFor="ck-equip" obrigatorio ajuda="Placa, prefixo ou nº de patrimônio.">
                  <input id="ck-equip" value={equipamento} onChange={(e) => setEquipamento(e.target.value)} placeholder="EMP-07" />
                </Campo>
                <Campo label="Executado por" htmlFor="ck-por" obrigatorio>
                  <input id="ck-por" value={executadoPor} onChange={(e) => setExecutadoPor(e.target.value)} />
                </Campo>
              </div>

              {respostas.length > 0 ? (
                <>
                  {respostas.map((r, i) => (
                    <div key={i} className="checklist-item">
                      <div>
                        {r.descricao}
                        {r.impeditivo ? <span className="pill bad" style={{ marginLeft: 6 }}>impeditivo</span> : null}
                      </div>
                      <div className="escolha">
                        <button
                          type="button"
                          className={`btn btn-sm ${r.conforme ? 'ativo-ok' : 'btn-ghost'}`}
                          onClick={() => setRespostas(respostas.map((x, j) => (j === i ? { ...x, conforme: true } : x)))}
                        >
                          Conforme
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${!r.conforme ? 'ativo-bad' : 'btn-ghost'}`}
                          onClick={() => setRespostas(respostas.map((x, j) => (j === i ? { ...x, conforme: false } : x)))}
                        >
                          Não conforme
                        </button>
                      </div>
                      {!r.conforme ? (
                        <input
                          placeholder="O que foi encontrado?"
                          value={r.observacao ?? ''}
                          onChange={(e) => setRespostas(respostas.map((x, j) => (j === i ? { ...x, observacao: e.target.value } : x)))}
                        />
                      ) : null}
                    </div>
                  ))}
                  <div className="barra-acoes">
                    <button type="button" className="btn btn-primary" disabled={salvando || !equipamento || !executadoPor} onClick={() => void executar()}>
                      {salvando ? 'Registrando...' : 'Registrar execução'}
                    </button>
                    {resultadoPrevisto ? (
                      <span className={`pill ${resultadoPrevisto === 'APTO' ? 'ok' : 'bad'}`}>Resultado: {resultadoPrevisto === 'APTO' ? 'APTO' : 'NÃO APTO'}</span>
                    ) : null}
                  </div>
                </>
              ) : modeloId ? null : (
                <p className="hint">Escolha um modelo para ver os itens.</p>
              )}

              {ultima ? (
                <div className="ishikawa-categoria" style={{ marginTop: 12 }}>
                  <h5>
                    Última execução: {ultima.equipamentoIdentificacao} —{' '}
                    <span className={`pill ${ultima.resultado === 'APTO' ? 'ok' : 'bad'}`}>{ultima.resultado === 'APTO' ? 'APTO' : 'NÃO APTO'}</span>
                  </h5>
                  <div className="carimbo">carimbo {ultima.hash}</div>
                  <div style={{ marginTop: 8 }}>
                    {ultima.fotoUrl ? (
                      <img className="evidencia-thumb" src={urlAbsoluta(ultima.fotoUrl) ?? ''} alt="Foto" />
                    ) : (
                      <label className="btn btn-ghost btn-sm">
                        <Icone nome="camera" /> Anexar foto do equipamento
                        <input type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && void anexarFoto(ultima.id, e.target.files[0])} />
                      </label>
                    )}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {aba === 'historico' ? (
        <div className="painel">
          {carregando ? (
            <div className="centro-tela">
              <div className="spinner" />
              Carregando...
            </div>
          ) : execucoes.length === 0 ? (
            <div className="vazio">
              <div className="icone-vazio" aria-hidden="true">
                <Icone nome="ok" tamanho={22} />
              </div>
              <h4>Nenhuma execução</h4>
            </div>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Equipamento</th>
                    <th>Checklist</th>
                    <th>Por</th>
                    <th>Não conformes</th>
                    <th>Resultado</th>
                    <th>Foto</th>
                  </tr>
                </thead>
                <tbody>
                  {execucoes.map((e) => {
                    const naoConformes = e.respostas.filter((r) => !r.conforme);
                    return (
                      <tr key={e.id}>
                        <td>{new Date(e.dataHora).toLocaleString('pt-BR')}</td>
                        <td>
                          <b>{e.equipamentoIdentificacao}</b>
                          <div className="hint">{e.modelo?.tipoEquipamento}</div>
                        </td>
                        <td>{e.modelo?.nome}</td>
                        <td>{e.executadoPor}</td>
                        <td>
                          {naoConformes.length === 0 ? (
                            <span className="hint">nenhum</span>
                          ) : (
                            naoConformes.map((r, i) => (
                              <div key={i} className="hint">
                                {r.impeditivo ? '⚠ ' : ''}
                                {r.descricao}
                                {r.observacao ? ` — ${r.observacao}` : ''}
                              </div>
                            ))
                          )}
                        </td>
                        <td>
                          <span className={`pill ${e.resultado === 'APTO' ? 'ok' : 'bad'}`}>{e.resultado === 'APTO' ? 'APTO' : 'NÃO APTO'}</span>
                        </td>
                        <td>
                          {e.fotoUrl ? (
                            <a href={urlAbsoluta(e.fotoUrl) ?? '#'} target="_blank" rel="noreferrer">
                              Ver
                            </a>
                          ) : podeEscrever ? (
                            <label className="btn btn-ghost btn-sm">
                              Anexar
                              <input type="file" hidden accept="image/*" onChange={(ev) => ev.target.files?.[0] && void anexarFoto(e.id, ev.target.files[0])} />
                            </label>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {aba === 'modelos' ? (
        <>
          {podeEscrever ? (
            <div className="painel">
              <h3>Novo modelo</h3>
              <div className="filtros">
                <Campo label="Cliente" htmlFor="md-cliente" obrigatorio>
                  <select id="md-cliente" value={novoModelo.clienteId} onChange={(e) => setNovoModelo({ ...novoModelo, clienteId: e.target.value })}>
                    <option value="">Selecione...</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nomeFantasia}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Tipo de equipamento" htmlFor="md-tipo" obrigatorio>
                  <input id="md-tipo" value={novoModelo.tipoEquipamento} onChange={(e) => setNovoModelo({ ...novoModelo, tipoEquipamento: e.target.value })} placeholder="Empilhadeira" />
                </Campo>
                <Campo label="Nome do checklist" htmlFor="md-nome" obrigatorio>
                  <input id="md-nome" value={novoModelo.nome} onChange={(e) => setNovoModelo({ ...novoModelo, nome: e.target.value })} placeholder="Pré-uso diário" />
                </Campo>
              </div>
              <h4>Itens a verificar</h4>
              <p className="desc">Marque como impeditivo o que, se não conforme, impede o uso.</p>
              <ListaEditavel itens={novoModelo.itens} onChange={(itens) => setNovoModelo({ ...novoModelo, itens })} placeholder="Ex.: Freio de serviço" maximo={60} />
              {novoModelo.itens.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {novoModelo.itens.map((item, i) => (
                    <label key={i} className="check-linha" style={{ fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={novoModelo.impeditivos.has(i)}
                        onChange={(e) => {
                          const s = new Set(novoModelo.impeditivos);
                          if (e.target.checked) s.add(i);
                          else s.delete(i);
                          setNovoModelo({ ...novoModelo, impeditivos: s });
                        }}
                      />{' '}
                      {item} impeditivo
                    </label>
                  ))}
                </div>
              ) : null}
              <div className="barra-acoes">
                <button type="button" className="btn btn-primary" disabled={salvando || !novoModelo.clienteId || !novoModelo.nome || !novoModelo.tipoEquipamento || novoModelo.itens.length === 0} onClick={() => void criarModelo()}>
                  {salvando ? 'Salvando...' : 'Criar modelo'}
                </button>
              </div>
            </div>
          ) : null}
          <div className="painel">
            {modelos.length === 0 ? (
              <p className="hint">Nenhum modelo cadastrado.</p>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Equipamento</th>
                      <th>Checklist</th>
                      <th className="num-col">Itens</th>
                      <th className="num-col">Impeditivos</th>
                      <th className="num-col">Execuções</th>
                      {podeEscrever ? <th aria-label="Ações" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {modelos.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <b>{m.tipoEquipamento}</b>
                        </td>
                        <td>{m.nome}</td>
                        <td className="num-col">{m.itens.length}</td>
                        <td className="num-col">{m.itens.filter((i) => i.impeditivo).length}</td>
                        <td className="num-col">{m._count?.execucoes ?? 0}</td>
                        {podeEscrever ? (
                          <td>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void alternarAtivo(m)}>
                              Desativar
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </>
  );
}
