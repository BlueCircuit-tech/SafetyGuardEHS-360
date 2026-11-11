import { useCallback, useEffect, useMemo, useState } from 'react';
import { resultadoDoChecklist, type ChecklistItem, type ChecklistResposta, type ResultadoChecklist } from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
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

interface ModeloPadrao {
  nome: string;
  tipoEquipamento: string;
  itens: ChecklistItem[];
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

/** Editor unico para criar, editar e duplicar modelos. */
interface EditorModelo {
  modo: 'novo' | 'editar' | 'duplicar';
  id: string | null;
  clienteId: string;
  nome: string;
  tipoEquipamento: string;
  itens: ChecklistItem[];
}

const EDITOR_VAZIO: EditorModelo = { modo: 'novo', id: null, clienteId: '', nome: '', tipoEquipamento: '', itens: [] };
const MAX_ITENS = 60;
const LINHAS_OBS_EXTRA = 3;

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
  const [todosModelos, setTodosModelos] = useState<ModeloApi[]>([]);
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
  const [editor, setEditor] = useState<EditorModelo>(EDITOR_VAZIO);
  const [novoItem, setNovoItem] = useState('');
  const [errosEditor, setErrosEditor] = useState<Record<string, string>>({});
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [filtroClienteModelos, setFiltroClienteModelos] = useState('');

  // Importar modelos padrao
  const [importando, setImportando] = useState(false);
  const [padroes, setPadroes] = useState<ModeloPadrao[]>([]);
  const [importClienteId, setImportClienteId] = useState('');
  const [importSelecionados, setImportSelecionados] = useState<Set<string>>(new Set());
  const [enviandoImport, setEnviandoImport] = useState(false);
  const [erroImport, setErroImport] = useState('');

  // Impressao em branco
  const [folha, setFolha] = useState<ModeloApi | null>(null);
  const [logos, setLogos] = useState<{ empresa: string | null; cliente: string | null }>({ empresa: null, cliente: null });

  const modelos = useMemo(() => todosModelos.filter((m) => m.ativo), [todosModelos]);
  const nomeCliente = useMemo(() => new Map(clientes.map((c) => [c.id, c.nomeFantasia])), [clientes]);
  const modelosListados = useMemo(
    () => todosModelos.filter((m) => (mostrarInativos || m.ativo) && (!filtroClienteModelos || m.clienteId === filtroClienteModelos)),
    [todosModelos, mostrarInativos, filtroClienteModelos],
  );
  const inativos = todosModelos.filter((m) => !m.ativo).length;

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [m, e, r] = await Promise.all([
        api.get<ModeloApi[]>('/checklists/modelos?inativos=true'),
        api.get<{ itens: ExecucaoApi[] }>('/checklists/execucoes?porPagina=50'),
        api.get<Resumo>('/documentacao-tecnica/resumo'),
      ]);
      setTodosModelos(m);
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

  // Logos para o cabecalho da folha em branco.
  const folhaClienteId = folha?.clienteId ?? null;
  useEffect(() => {
    if (!folhaClienteId) return;
    let ativo = true;
    void Promise.all([
      api.get<{ logoUrl: string | null }>('/empresa').catch(() => null),
      api.get<{ logoUrl: string | null }>(`/clientes/${folhaClienteId}`).catch(() => null),
    ]).then(([empresa, cliente]) => {
      if (ativo) setLogos({ empresa: urlAbsoluta(empresa?.logoUrl), cliente: urlAbsoluta(cliente?.logoUrl) });
    });
    return () => {
      ativo = false;
    };
  }, [folhaClienteId]);

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

  /* ----------------------------------------------------------- editor -- */

  function abrirEditor(modelo: ModeloApi, modo: 'editar' | 'duplicar') {
    setEditor({
      modo,
      id: modo === 'editar' ? modelo.id : null,
      clienteId: modelo.clienteId,
      nome: modo === 'duplicar' ? `${modelo.nome} (cópia)` : modelo.nome,
      tipoEquipamento: modelo.tipoEquipamento,
      itens: modelo.itens.map((i) => ({ descricao: i.descricao, impeditivo: i.impeditivo })),
    });
    setErrosEditor({});
    setNovoItem('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelarEditor() {
    setEditor(EDITOR_VAZIO);
    setErrosEditor({});
    setNovoItem('');
  }

  function definirItem(indice: number, parcial: Partial<ChecklistItem>) {
    setEditor({ ...editor, itens: editor.itens.map((item, i) => (i === indice ? { ...item, ...parcial } : item)) });
  }

  function moverItem(indice: number, delta: -1 | 1) {
    const destino = indice + delta;
    if (destino < 0 || destino >= editor.itens.length) return;
    const itens = [...editor.itens];
    const [item] = itens.splice(indice, 1);
    itens.splice(destino, 0, item!);
    setEditor({ ...editor, itens });
  }

  function adicionarItem() {
    const texto = novoItem.trim();
    if (!texto) return;
    if (editor.itens.length >= MAX_ITENS) {
      setErrosEditor({ ...errosEditor, itens: `No máximo ${MAX_ITENS} itens por modelo.` });
      return;
    }
    setEditor({ ...editor, itens: [...editor.itens, { descricao: texto, impeditivo: false }] });
    setNovoItem('');
  }

  function validarEditor(): Record<string, string> {
    const falta: Record<string, string> = {};
    if (!editor.clienteId) falta.clienteId = 'Informe o cliente.';
    if (editor.nome.trim().length < 3) falta.nome = 'Informe o nome do checklist (ao menos 3 letras).';
    if (editor.tipoEquipamento.trim().length < 2) falta.tipoEquipamento = 'Informe o tipo de equipamento.';
    if (editor.itens.length === 0) falta.itens = 'Inclua ao menos um item a verificar.';
    else if (editor.itens.length > MAX_ITENS) falta.itens = `No máximo ${MAX_ITENS} itens por modelo.`;
    editor.itens.forEach((item, i) => {
      if (item.descricao.trim().length < 3) falta[`itens.${i}.descricao`] = 'Descreva o item (ao menos 3 letras).';
    });
    return falta;
  }

  async function salvarModelo() {
    const falta = validarEditor();
    setErrosEditor(falta);
    if (Object.keys(falta).length > 0) {
      const n = Object.keys(falta).length;
      mostrar(`Corrija ${n} ${n === 1 ? 'campo destacado' : 'campos destacados'}.`, 'erro');
      return;
    }
    setSalvando(true);
    try {
      const itens = editor.itens.map((i) => ({ descricao: i.descricao.trim(), impeditivo: i.impeditivo }));
      if (editor.modo === 'editar' && editor.id) {
        await api.put(`/checklists/modelos/${editor.id}`, { nome: editor.nome.trim(), tipoEquipamento: editor.tipoEquipamento.trim(), itens });
        mostrar('Modelo atualizado. As execuções já registradas mantêm os itens da época.', 'sucesso');
      } else {
        await api.post('/checklists/modelos', {
          clienteId: editor.clienteId,
          nome: editor.nome.trim(),
          tipoEquipamento: editor.tipoEquipamento.trim(),
          itens,
        });
        mostrar(editor.modo === 'duplicar' ? 'Cópia do modelo criada.' : 'Modelo criado.', 'sucesso');
      }
      cancelarEditor();
      void carregar();
    } catch (erro) {
      if (erro instanceof ErroApi) {
        const porCampo: Record<string, string> = {};
        for (const [campo, mensagens] of Object.entries(erro.campos)) porCampo[campo] = mensagens[0] ?? 'Valor inválido.';
        setErrosEditor(porCampo);
        mostrar(erro.mensagemAmigavel(), 'erro');
      } else {
        mostrar('Falha ao salvar o modelo.', 'erro');
      }
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(modelo: ModeloApi) {
    if (modelo.ativo && !window.confirm(`Desativar "${modelo.tipoEquipamento} — ${modelo.nome}"? Ele deixa de aparecer em Executar, mas o histórico é mantido.`)) return;
    try {
      await api.put(`/checklists/modelos/${modelo.id}`, { ativo: !modelo.ativo });
      mostrar(modelo.ativo ? 'Modelo desativado.' : 'Modelo reativado.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao atualizar.', 'erro');
    }
  }

  /* ---------------------------------------------------------- importar -- */

  async function abrirImportacao() {
    setImportando(true);
    setErroImport('');
    if (padroes.length === 0) {
      try {
        const lista = await api.get<ModeloPadrao[]>('/checklists/modelos/padrao');
        setPadroes(lista);
        setImportSelecionados(new Set(lista.map((m) => m.tipoEquipamento)));
      } catch (erro) {
        mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os modelos padrão.', 'erro');
      }
    }
  }

  async function importarPadroes() {
    if (!importClienteId) {
      setErroImport('Escolha o cliente que vai receber os modelos.');
      return;
    }
    if (importSelecionados.size === 0) {
      setErroImport('Marque ao menos um equipamento.');
      return;
    }
    setErroImport('');
    setEnviandoImport(true);
    try {
      const todos = importSelecionados.size === new Set(padroes.map((p) => p.tipoEquipamento)).size;
      const resposta = await api.post<{ criados: number; ignorados: number }>('/checklists/modelos/padrao', {
        clienteId: importClienteId,
        ...(todos ? {} : { nomes: [...importSelecionados] }),
      });
      mostrar(
        resposta.criados > 0
          ? `${resposta.criados} modelo(s) importado(s). Os que já existiam no cliente ou não foram marcados ficaram de fora.`
          : 'Nenhum modelo novo — os marcados já existem nesse cliente.',
        resposta.criados > 0 ? 'sucesso' : 'info',
      );
      setImportando(false);
      setFiltroClienteModelos(importClienteId);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao importar.', 'erro');
    } finally {
      setEnviandoImport(false);
    }
  }

  /* ------------------------------------------------------------ folha -- */

  if (folha) {
    const celula = { border: '1px solid var(--border)', padding: '4px 6px' } as const;
    const marcar = { ...celula, width: 36, textAlign: 'center' as const };
    return (
      <>
        <div className="painel sem-impressao">
          <div className="barra-acoes" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setFolha(null)}>
              <Icone nome="voltar" /> Voltar
            </button>
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              <Icone nome="impressora" /> Imprimir
            </button>
          </div>
          <p className="hint">Folha em branco para preencher em campo: C = conforme, NC = não conforme, NA = não se aplica.</p>
        </div>

        <div className="painel folha">
          <div className="folha-cabecalho">
            <div>
              {logos.empresa || logos.cliente ? (
                <div className="folha-logos" style={{ marginBottom: 8 }}>
                  {logos.empresa ? <img src={logos.empresa} alt="Consultoria" /> : null}
                  {logos.cliente ? <img src={logos.cliente} alt={nomeCliente.get(folha.clienteId) ?? 'Cliente'} /> : null}
                </div>
              ) : null}
              <h2>Checklist de pré-uso — {folha.tipoEquipamento}</h2>
              <div className="hint">
                {folha.nome}
                {nomeCliente.get(folha.clienteId) ? ` · ${nomeCliente.get(folha.clienteId)}` : ''}
              </div>
            </div>
            <div className="meta">
              <div>Data: ____/____/______</div>
              <div>Hora: ____:____</div>
            </div>
          </div>

          <dl className="folha-dados" style={{ marginBottom: 14 }}>
            <div>
              <dt>Equipamento</dt>
              <dd>{folha.tipoEquipamento}</dd>
            </div>
            <div>
              <dt>Identificação (placa / prefixo / patrimônio)</dt>
              <dd style={{ borderBottom: '1px solid currentColor', minHeight: 18 }} />
            </div>
            <div>
              <dt>Executante</dt>
              <dd style={{ borderBottom: '1px solid currentColor', minHeight: 18 }} />
            </div>
            <div>
              <dt>Área / local</dt>
              <dd style={{ borderBottom: '1px solid currentColor', minHeight: 18 }} />
            </div>
          </dl>

          <div className="folha-secao" style={{ breakInside: 'auto' }}>
            <h4>Itens a verificar</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...celula, width: 30 }}>#</th>
                  <th style={celula}>Item</th>
                  <th style={marcar}>C</th>
                  <th style={marcar}>NC</th>
                  <th style={marcar}>NA</th>
                  <th style={{ ...celula, width: '30%' }}>Observação</th>
                </tr>
              </thead>
              <tbody>
                {folha.itens.map((item, i) => (
                  <tr key={i} style={{ height: 26, breakInside: 'avoid' }}>
                    <td style={{ ...celula, textAlign: 'center' }}>{i + 1}</td>
                    <td style={celula}>
                      {item.descricao}
                      {item.impeditivo ? <b style={{ marginLeft: 6 }}>(impeditivo)</b> : null}
                    </td>
                    <td style={marcar}>☐</td>
                    <td style={marcar}>☐</td>
                    <td style={marcar}>☐</td>
                    <td style={celula} />
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint" style={{ marginTop: 6 }}>
              Item <b>impeditivo</b> marcado NC reprova o equipamento: NÃO APTO para uso até a correção.
            </p>
          </div>

          <div className="folha-secao">
            <h4>Resultado e observações gerais</h4>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <span style={{ marginRight: 24 }}>☐ APTO para uso</span>
              <span>☐ NÃO APTO — equipamento bloqueado</span>
            </div>
            {Array.from({ length: LINHAS_OBS_EXTRA }, (_, i) => (
              <div key={i} style={{ borderBottom: '1px solid var(--border)', height: 24 }} />
            ))}
          </div>

          <div className="folha-assinatura">
            <div>
              <div style={{ height: 40 }} />
              Assinatura do executante
            </div>
            <div>
              <div style={{ height: 40 }} />
              Visto do responsável / supervisor
            </div>
          </div>
        </div>
      </>
    );
  }

  const tituloEditor = editor.modo === 'editar' ? 'Editar modelo' : editor.modo === 'duplicar' ? 'Duplicar modelo' : 'Novo modelo';

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
                    {!equipamento || !executadoPor ? <span className="hint">Informe a identificação do equipamento e quem executou.</span> : null}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>Modelos padrão de ferramentas e equipamentos</h3>
                {!importando ? (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => void abrirImportacao()}>
                    <Icone nome="ferramenta" /> Importar modelos padrão
                  </button>
                ) : null}
              </div>
              <p className="desc">
                Biblioteca inicial de checklists (empilhadeira, andaime, esmerilhadeira...). Os modelos são copiados para o
                cliente e podem ser alterados item a item depois. Modelos que o cliente já tem não são duplicados.
              </p>
              {importando ? (
                <>
                  <div className="filtros">
                    <Campo label="Cliente que recebe os modelos" htmlFor="imp-cliente" obrigatorio erro={erroImport && !importClienteId ? erroImport : undefined}>
                      <select id="imp-cliente" value={importClienteId} onChange={(e) => setImportClienteId(e.target.value)}>
                        <option value="">Selecione...</option>
                        {clientes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nomeFantasia}
                          </option>
                        ))}
                      </select>
                    </Campo>
                  </div>
                  {padroes.length === 0 ? (
                    <p className="hint">Carregando modelos padrão...</p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 8, margin: '4px 0 8px' }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImportSelecionados(new Set(padroes.map((p) => p.tipoEquipamento)))}>
                          Marcar todos
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImportSelecionados(new Set())}>
                          Desmarcar todos
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '4px 16px' }}>
                        {padroes.map((p) => (
                          <label key={`${p.tipoEquipamento}|${p.nome}`} className="check-linha">
                            <input
                              type="checkbox"
                              checked={importSelecionados.has(p.tipoEquipamento)}
                              onChange={(e) => {
                                const s = new Set(importSelecionados);
                                if (e.target.checked) s.add(p.tipoEquipamento);
                                else s.delete(p.tipoEquipamento);
                                setImportSelecionados(s);
                              }}
                            />
                            <span>
                              <b>{p.tipoEquipamento}</b> — {p.nome}{' '}
                              <span className="hint">
                                ({p.itens.length} itens, {p.itens.filter((i) => i.impeditivo).length} impeditivos)
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                  {erroImport && importClienteId ? <p className="hint alerta">{erroImport}</p> : null}
                  <div className="barra-acoes">
                    <button type="button" className="btn btn-primary" disabled={enviandoImport} onClick={() => void importarPadroes()}>
                      {enviandoImport ? 'Importando...' : `Importar ${importSelecionados.size} modelo(s)`}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setImportando(false)}>
                      Cancelar
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {podeEscrever ? (
            <div className="painel">
              <h3>{tituloEditor}</h3>
              {editor.modo === 'editar' ? (
                <p className="hint alerta">
                  Alterações valem para as próximas execuções. As execuções já registradas guardam os itens exatamente como foram
                  respondidos.
                </p>
              ) : null}
              <div className="filtros">
                <Campo
                  label="Cliente"
                  htmlFor="md-cliente"
                  obrigatorio
                  erro={errosEditor.clienteId}
                  ajuda={editor.modo === 'editar' ? 'O cliente não muda na edição — use Duplicar para copiar a outro cliente.' : undefined}
                >
                  <select
                    id="md-cliente"
                    value={editor.clienteId}
                    disabled={editor.modo === 'editar'}
                    onChange={(e) => setEditor({ ...editor, clienteId: e.target.value })}
                  >
                    <option value="">Selecione...</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nomeFantasia}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Tipo de equipamento" htmlFor="md-tipo" obrigatorio erro={errosEditor.tipoEquipamento}>
                  <input id="md-tipo" value={editor.tipoEquipamento} onChange={(e) => setEditor({ ...editor, tipoEquipamento: e.target.value })} placeholder="Empilhadeira" />
                </Campo>
                <Campo label="Nome do checklist" htmlFor="md-nome" obrigatorio erro={errosEditor.nome}>
                  <input id="md-nome" value={editor.nome} onChange={(e) => setEditor({ ...editor, nome: e.target.value })} placeholder="Pré-uso diário" />
                </Campo>
              </div>

              <h4>Itens a verificar ({editor.itens.length})</h4>
              <p className="desc">Edite o texto de cada item, marque como impeditivo o que, se não conforme, impede o uso, e reordene com as setas.</p>
              {errosEditor.itens ? <p className="hint alerta">{errosEditor.itens}</p> : null}
              {editor.itens.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 6, flexWrap: 'wrap' }}>
                  <span className="hint" style={{ width: 22, paddingTop: 8, textAlign: 'right' }}>
                    {i + 1}.
                  </span>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <input
                      aria-label={`Item ${i + 1}`}
                      value={item.descricao}
                      maxLength={200}
                      onChange={(e) => definirItem(i, { descricao: e.target.value })}
                      style={{ width: '100%' }}
                    />
                    {errosEditor[`itens.${i}.descricao`] ? (
                      <div className="erro" role="alert" style={{ color: 'var(--red)', fontSize: 12 }}>
                        {errosEditor[`itens.${i}.descricao`]}
                      </div>
                    ) : null}
                  </div>
                  <label className="check-linha" style={{ paddingTop: 6 }}>
                    <input type="checkbox" checked={item.impeditivo} onChange={(e) => definirItem(i, { impeditivo: e.target.checked })} /> impeditivo
                  </label>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => moverItem(i, -1)} aria-label="Mover para cima" title="Mover para cima">
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={i === editor.itens.length - 1}
                    onClick={() => moverItem(i, 1)}
                    aria-label="Mover para baixo"
                    title="Mover para baixo"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditor({ ...editor, itens: editor.itens.filter((_, j) => j !== i) })}
                    aria-label={`Remover item ${i + 1}`}
                  >
                    Remover
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                <input
                  aria-label="Novo item"
                  value={novoItem}
                  maxLength={200}
                  placeholder="Ex.: Freio de serviço funcionando (Enter adiciona)"
                  onChange={(e) => setNovoItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      adicionarItem();
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn btn-ghost btn-sm" onClick={adicionarItem} disabled={!novoItem.trim()}>
                  <Icone nome="mais" /> Adicionar item
                </button>
              </div>

              <div className="barra-acoes">
                <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void salvarModelo()}>
                  {salvando ? 'Salvando...' : editor.modo === 'editar' ? 'Salvar alterações' : editor.modo === 'duplicar' ? 'Criar cópia' : 'Criar modelo'}
                </button>
                {editor.modo !== 'novo' ? (
                  <button type="button" className="btn btn-ghost" onClick={cancelarEditor}>
                    Cancelar
                  </button>
                ) : null}
                <span className="hint">Campos com * são obrigatórios. Se faltar algo, o campo é destacado ao clicar.</span>
              </div>
            </div>
          ) : null}

          <div className="painel">
            <div className="filtros">
              <Campo label="Cliente" htmlFor="md-filtro-cliente">
                <select id="md-filtro-cliente" value={filtroClienteModelos} onChange={(e) => setFiltroClienteModelos(e.target.value)}>
                  <option value="">Todos</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nomeFantasia}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            <label className="check-linha" style={{ marginBottom: 8 }}>
              <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} /> Mostrar desativados ({inativos})
            </label>
            {modelosListados.length === 0 ? (
              <p className="hint">
                Nenhum modelo cadastrado{filtroClienteModelos ? ' para este cliente' : ''}. Use “Importar modelos padrão” para começar com a
                biblioteca de ferramentas e equipamentos.
              </p>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Equipamento</th>
                      <th>Checklist</th>
                      <th>Cliente</th>
                      <th className="num-col">Itens</th>
                      <th className="num-col">Impeditivos</th>
                      <th className="num-col">Execuções</th>
                      <th aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody>
                    {modelosListados.map((m) => (
                      <tr key={m.id} style={m.ativo ? undefined : { opacity: 0.7 }}>
                        <td>
                          <b>{m.tipoEquipamento}</b>
                          {!m.ativo ? (
                            <span className="pill gray" style={{ marginLeft: 6 }}>
                              desativado
                            </span>
                          ) : null}
                        </td>
                        <td>{m.nome}</td>
                        <td>{nomeCliente.get(m.clienteId) ?? '—'}</td>
                        <td className="num-col">{m.itens.length}</td>
                        <td className="num-col">{m.itens.filter((i) => i.impeditivo).length}</td>
                        <td className="num-col">{m._count?.execucoes ?? 0}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFolha(m)} title="Imprimir checklist em branco">
                            <Icone nome="impressora" /> Imprimir em branco
                          </button>
                          {podeEscrever ? (
                            <>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrirEditor(m, 'editar')}>
                                Editar
                              </button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrirEditor(m, 'duplicar')}>
                                Duplicar
                              </button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void alternarAtivo(m)}>
                                {m.ativo ? 'Desativar' : 'Reativar'}
                              </button>
                            </>
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
      ) : null}
    </>
  );
}
