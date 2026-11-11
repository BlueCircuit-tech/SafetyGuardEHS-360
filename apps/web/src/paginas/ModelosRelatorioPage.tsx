import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  CATEGORIAS_MODELO_RELATORIO,
  MARCADORES_RELATORIO,
  ROTULO_CATEGORIA_MODELO_RELATORIO,
  type CategoriaModeloRelatorio,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import { formatarDataHora } from '../lib/datas';
import { useSessao } from '../lib/sessao';

interface ModeloApi {
  id: string;
  titulo: string;
  categoria: string | null;
  descricao: string | null;
  conteudo: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
  marcadores: string[];
}

interface Previa {
  titulo: string;
  conteudo: string;
  origem: 'IA' | 'MODELO' | 'PREENCHIDO';
  pendentes?: string[];
}

type Aba = 'lista' | 'editor' | 'usar';

const ESTILO_PREVIA: CSSProperties = { fontSize: 14, lineHeight: 1.55 };

const FORM_VAZIO = { titulo: '', categoria: '' as '' | CategoriaModeloRelatorio, descricao: '', conteudo: '', ativo: true };
const GERAR_VAZIO = { tema: '', categoria: '' as '' | CategoriaModeloRelatorio, contexto: '' };

function rotuloCategoria(categoria: string | null): string {
  if (!categoria) return 'Sem categoria';
  return ROTULO_CATEGORIA_MODELO_RELATORIO[categoria as CategoriaModeloRelatorio] ?? categoria;
}

/* ----------------------------------------------------------- markdown --- */

/** Negrito e italico inline, sem biblioteca: **texto** e *texto*. */
function inline(texto: string): ReactNode[] {
  const partes: ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let ultimo = 0;
  let indice = 0;
  for (const m of texto.matchAll(regex)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) partes.push(texto.slice(ultimo, inicio));
    if (m[1] !== undefined) partes.push(<b key={indice++}>{m[1]}</b>);
    else if (m[2] !== undefined) partes.push(<i key={indice++}>{m[2]}</i>);
    else if (m[3] !== undefined) partes.push(<code key={indice++}>{m[3]}</code>);
    ultimo = inicio + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

/**
 * Renderizador minimo de Markdown: titulos (# ## ###), listas ("- " / "1. "),
 * tabelas com "|", linha horizontal e paragrafos. O suficiente para os
 * modelos de relatorio, sem dependencia externa.
 */
function renderizarMarkdown(markdown: string): ReactNode[] {
  const linhas = markdown.replace(/\r\n/g, '\n').split('\n');
  const saida: ReactNode[] = [];
  let paragrafo: string[] = [];
  let lista: { ordenada: boolean; itens: string[] } | null = null;
  let tabela: string[][] | null = null;
  let chave = 0;

  const fecharParagrafo = () => {
    if (paragrafo.length > 0) {
      saida.push(<p key={chave++}>{inline(paragrafo.join(' '))}</p>);
      paragrafo = [];
    }
  };
  const fecharLista = () => {
    if (lista) {
      const itens = lista.itens.map((item, i) => <li key={i}>{inline(item)}</li>);
      saida.push(lista.ordenada ? <ol key={chave++}>{itens}</ol> : <ul key={chave++}>{itens}</ul>);
      lista = null;
    }
  };
  const fecharTabela = () => {
    if (tabela && tabela.length > 0) {
      const [cabecalho, ...corpo] = tabela;
      saida.push(
        <div key={chave++} className="tbl-wrap">
          <table>
            <thead>
              <tr>
                {(cabecalho ?? []).map((celula, i) => (
                  <th key={i}>{inline(celula)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {corpo.map((linha, i) => (
                <tr key={i}>
                  {linha.map((celula, j) => (
                    <td key={j}>{celula ? inline(celula) : ' '}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    }
    tabela = null;
  };
  const fecharTudo = () => {
    fecharParagrafo();
    fecharLista();
    fecharTabela();
  };

  for (const bruta of linhas) {
    const linha = bruta.trimEnd();
    const semEspaco = linha.trim();

    if (semEspaco === '') {
      fecharTudo();
      continue;
    }

    const titulo = /^(#{1,3})\s+(.*)$/.exec(semEspaco);
    if (titulo) {
      fecharTudo();
      const nivel = titulo[1]!.length;
      const texto = inline(titulo[2]!);
      if (nivel === 1) saida.push(<h1 key={chave++}>{texto}</h1>);
      else if (nivel === 2) saida.push(<h2 key={chave++}>{texto}</h2>);
      else saida.push(<h3 key={chave++}>{texto}</h3>);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(semEspaco)) {
      fecharTudo();
      saida.push(<hr key={chave++} />);
      continue;
    }

    if (semEspaco.startsWith('|')) {
      fecharParagrafo();
      fecharLista();
      // Linha separadora do cabecalho (| --- | --- |) e ignorada.
      if (/^\|?\s*:?-{2,}/.test(semEspaco.replace(/^\|/, '').trim())) continue;
      const celulas = semEspaco.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      tabela = tabela ?? [];
      tabela.push(celulas);
      continue;
    }

    const item = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(semEspaco);
    if (item) {
      fecharParagrafo();
      fecharTabela();
      const ordenada = /^\d/.test(semEspaco);
      if (!lista || lista.ordenada !== ordenada) {
        fecharLista();
        lista = { ordenada, itens: [] };
      }
      lista.itens.push(item[1]!);
      continue;
    }

    fecharLista();
    fecharTabela();
    paragrafo.push(semEspaco);
  }
  fecharTudo();
  return saida;
}

/* ---------------------------------------------------------------- tela --- */

/**
 * Modelos de relatorio: textos-base da consultoria em Markdown com
 * marcadores. Podem ser escritos a mao, importados do conjunto padrao ou
 * gerados pelo assistente; na hora de usar, os marcadores sao preenchidos e o
 * assistente redige a versao final com as instrucoes do consultor.
 */
export function ModelosRelatorioPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('cadastros:escrever');

  const [aba, setAba] = useState<Aba>('lista');
  const [carregando, setCarregando] = useState(true);
  const [modelos, setModelos] = useState<ModeloApi[]>([]);
  const [busca, setBusca] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [importando, setImportando] = useState(false);
  const [clientes, setClientes] = useState<Array<{ id: string; nomeFantasia: string }>>([]);

  const [form, setForm] = useState(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  const [gerar, setGerar] = useState(GERAR_VAZIO);
  const [gerando, setGerando] = useState(false);
  const [avisoGeracao, setAvisoGeracao] = useState<string | null>(null);

  const [aberto, setAberto] = useState<ModeloApi | null>(null);
  const [usar, setUsar] = useState({ clienteId: '', periodo: '', responsavel: '', instrucoes: '' });
  const [preenchendo, setPreenchendo] = useState(false);
  const [redigindo, setRedigindo] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setModelos(await api.get<ModeloApi[]>(`/relatorios/modelos${mostrarInativos ? '?inativos=true' : ''}`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os modelos.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [mostrarInativos, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    void api.get<Array<{ id: string; nomeFantasia: string }>>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
  }, []);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return modelos;
    return modelos.filter((m) =>
      [m.titulo, m.descricao ?? '', rotuloCategoria(m.categoria)].some((campo) => campo.toLowerCase().includes(termo)),
    );
  }, [modelos, busca]);

  function tratarErro(erro: unknown, fallback: string) {
    if (erro instanceof ErroApi) {
      const porCampo: Record<string, string> = {};
      for (const [campo, mensagens] of Object.entries(erro.campos)) porCampo[campo] = mensagens[0] ?? '';
      setErros(porCampo);
      mostrar(erro.mensagemAmigavel(), 'erro');
      return;
    }
    mostrar(erro instanceof Error ? erro.message : fallback, 'erro');
  }

  /* ------------------------------------------------------------ editor --- */

  function novoModelo() {
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setErros({});
    setAvisoGeracao(null);
    setAba('editor');
  }

  function editarModelo(modelo: ModeloApi) {
    setForm({
      titulo: modelo.titulo,
      categoria: (modelo.categoria as CategoriaModeloRelatorio) ?? '',
      descricao: modelo.descricao ?? '',
      conteudo: modelo.conteudo,
      ativo: modelo.ativo,
    });
    setEditandoId(modelo.id);
    setErros({});
    setAvisoGeracao(null);
    setAba('editor');
  }

  async function salvar() {
    setSalvando(true);
    setErros({});
    try {
      const dados = { ...form, categoria: form.categoria || null, descricao: form.descricao || null };
      if (editandoId) {
        await api.put(`/relatorios/modelos/${editandoId}`, dados);
        mostrar('Modelo atualizado.', 'sucesso');
      } else {
        await api.post('/relatorios/modelos', dados);
        mostrar('Modelo criado.', 'sucesso');
      }
      await carregar();
      setAba('lista');
    } catch (erro) {
      tratarErro(erro, 'Falha ao salvar o modelo.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(modelo: ModeloApi) {
    if (!window.confirm(`Excluir o modelo "${modelo.titulo}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/relatorios/modelos/${modelo.id}`);
      mostrar('Modelo excluído.', 'sucesso');
      if (aberto?.id === modelo.id) {
        setAberto(null);
        setAba('lista');
      }
      await carregar();
    } catch (erro) {
      tratarErro(erro, 'Falha ao excluir o modelo.');
    }
  }

  async function importarPadrao() {
    setImportando(true);
    try {
      const r = await api.post<{ criados: number; jaExistiam: number }>('/relatorios/modelos/padrao', {});
      mostrar(
        r.criados > 0
          ? `${r.criados} modelo(s) padrão importado(s)${r.jaExistiam > 0 ? `; ${r.jaExistiam} já existia(m)` : ''}.`
          : 'Todos os modelos padrão já estavam cadastrados.',
        r.criados > 0 ? 'sucesso' : 'info',
      );
      await carregar();
    } catch (erro) {
      tratarErro(erro, 'Falha ao importar os modelos padrão.');
    } finally {
      setImportando(false);
    }
  }

  async function gerarComAssistente() {
    if (gerar.tema.trim().length < 3) {
      setErros({ tema: 'Informe o tema do relatório (ao menos 3 caracteres).' });
      return;
    }
    setGerando(true);
    setErros({});
    setAvisoGeracao(null);
    try {
      const r = await api.post<{ conteudo: string; origem: 'IA' | 'MODELO' }>('/relatorios/modelos/gerar', {
        tema: gerar.tema,
        categoria: gerar.categoria || null,
        contexto: gerar.contexto || null,
      });
      setForm((atual) => ({
        ...atual,
        conteudo: r.conteudo,
        titulo: atual.titulo || gerar.tema,
        categoria: atual.categoria || gerar.categoria,
      }));
      if (r.origem === 'MODELO') {
        setAvisoGeracao('O assistente de IA não está configurado (ou falhou); foi montado um esqueleto padrão a partir do tema. Edite à vontade.');
      } else {
        mostrar('Conteúdo gerado pelo assistente. Revise antes de salvar.', 'sucesso');
      }
    } catch (erro) {
      tratarErro(erro, 'Falha ao gerar o modelo.');
    } finally {
      setGerando(false);
    }
  }

  /* -------------------------------------------------------------- usar --- */

  function abrirModelo(modelo: ModeloApi) {
    setAberto(modelo);
    setPrevia(null);
    setErros({});
    setAba('usar');
  }

  async function preencher() {
    if (!aberto) return;
    setPreenchendo(true);
    setErros({});
    try {
      const r = await api.post<{ titulo: string; conteudo: string; pendentes: string[] }>(`/relatorios/modelos/${aberto.id}/preencher`, {
        clienteId: usar.clienteId || null,
        periodo: usar.periodo || null,
        responsavel: usar.responsavel || null,
      });
      setPrevia({ titulo: r.titulo, conteudo: r.conteudo, origem: 'PREENCHIDO', pendentes: r.pendentes });
    } catch (erro) {
      tratarErro(erro, 'Falha ao preencher o modelo.');
    } finally {
      setPreenchendo(false);
    }
  }

  async function redigir() {
    if (!aberto) return;
    if (usar.instrucoes.trim().length < 5) {
      setErros({ instrucoes: 'Descreva o que aconteceu no período, os dados e o que o relatório deve destacar.' });
      return;
    }
    setRedigindo(true);
    setErros({});
    try {
      const r = await api.post<{ titulo: string; conteudo: string; origem: 'IA' | 'MODELO' }>(`/relatorios/modelos/${aberto.id}/redigir`, {
        clienteId: usar.clienteId || null,
        periodo: usar.periodo || null,
        responsavel: usar.responsavel || null,
        instrucoes: usar.instrucoes,
      });
      setPrevia({ titulo: r.titulo, conteudo: r.conteudo, origem: r.origem });
      if (r.origem === 'MODELO') {
        mostrar('IA não configurada: o modelo foi preenchido e as instruções anexadas numa seção "Observações".', 'info');
      } else {
        mostrar('Relatório redigido pelo assistente. Revise antes de usar.', 'sucesso');
      }
    } catch (erro) {
      tratarErro(erro, 'Falha ao redigir o relatório.');
    } finally {
      setRedigindo(false);
    }
  }

  async function copiarTexto() {
    if (!previa) return;
    try {
      await navigator.clipboard.writeText(previa.conteudo);
      mostrar('Texto copiado para a área de transferência.', 'sucesso');
    } catch {
      mostrar('Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.', 'erro');
    }
  }

  /* ---------------------------------------------------------------- JSX --- */

  const listaMarcadores = (
    <div className="painel" style={{ marginTop: 0 }}>
      <h3>Marcadores suportados</h3>
      <p className="desc">Escreva no texto e eles são trocados pelos valores reais na hora de usar.</p>
      <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13 }}>
        {MARCADORES_RELATORIO.map((m) => (
          <li key={m.marcador} style={{ marginBottom: 6 }}>
            <code className="mono">{m.marcador}</code>
            <div className="hint">{m.descricao}</div>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <>
      <div className="painel sem-impressao">
        <h3>Modelos de relatório</h3>
        <p className="desc">
          Textos-base da consultoria em Markdown, com marcadores preenchidos na hora de usar. Gere o esqueleto com o
          assistente, ajuste, salve e, no fechamento, peça ao assistente que redija o relatório final com os dados do período.
        </p>
      </div>

      <div className="abas sem-impressao">
        <button type="button" className={aba === 'lista' ? 'ativa' : ''} onClick={() => setAba('lista')}>
          Modelos ({modelos.length})
        </button>
        {podeEscrever ? (
          <button type="button" className={aba === 'editor' ? 'ativa' : ''} onClick={() => (editandoId || form.conteudo ? setAba('editor') : novoModelo())}>
            {editandoId ? 'Editando modelo' : 'Novo modelo'}
          </button>
        ) : null}
        {aberto ? (
          <button type="button" className={aba === 'usar' ? 'ativa' : ''} onClick={() => setAba('usar')}>
            Usar: {aberto.titulo}
          </button>
        ) : null}
      </div>

      {aba === 'lista' ? (
        <div className="painel sem-impressao">
          <div className="filtros">
            <Campo label="Buscar" htmlFor="mr-busca">
              <input id="mr-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Título, categoria ou descrição" />
            </Campo>
            <div className="check-linha" style={{ alignSelf: 'end' }}>
              <label>
                <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
                Mostrar inativos
              </label>
            </div>
            {podeEscrever ? (
              <div style={{ alignSelf: 'end', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" onClick={novoModelo}>
                  <Icone nome="mais" /> Novo modelo
                </button>
                <button type="button" className="btn btn-outline" onClick={() => void importarPadrao()} disabled={importando}>
                  <Icone nome="documento" /> {importando ? 'Importando...' : 'Importar modelos padrão'}
                </button>
              </div>
            ) : null}
          </div>

          {carregando ? (
            <div className="centro-tela">
              <div className="spinner" />
              Carregando modelos...
            </div>
          ) : filtrados.length === 0 ? (
            <div className="vazio">
              <div className="icone-vazio" aria-hidden="true">
                <Icone nome="documento" tamanho={22} />
              </div>
              <h4>{modelos.length === 0 ? 'Nenhum modelo cadastrado' : 'Nenhum modelo encontrado'}</h4>
              <p>
                {modelos.length === 0
                  ? podeEscrever
                    ? 'Importe os modelos padrão da consultoria ou crie o primeiro com o assistente.'
                    : 'Peça a um usuário com permissão de cadastro para importar os modelos padrão.'
                  : 'Ajuste a busca ou inclua os inativos.'}
              </p>
            </div>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th>Título</th>
                    <th>Descrição</th>
                    <th>Marcadores</th>
                    <th>Situação</th>
                    <th>Atualizado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <span className="pill info">{rotuloCategoria(m.categoria)}</span>
                      </td>
                      <td>
                        <b>{m.titulo}</b>
                      </td>
                      <td>{m.descricao || <span className="hint">—</span>}</td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        {m.marcadores.length > 0 ? m.marcadores.join(' ') : <span className="hint">nenhum</span>}
                      </td>
                      <td>
                        <span className={`pill ${m.ativo ? 'ok' : 'gray'}`}>{m.ativo ? 'Ativo' : 'Inativo'}</span>
                      </td>
                      <td className="hint">{formatarDataHora(m.atualizadoEm)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => abrirModelo(m)}>
                          <Icone nome="documento" /> Usar
                        </button>{' '}
                        {podeEscrever ? (
                          <>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => editarModelo(m)}>
                              Editar
                            </button>{' '}
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluir(m)}>
                              Excluir
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
      ) : null}

      {aba === 'editor' && podeEscrever ? (
        <div className="grid2 sem-impressao" style={{ alignItems: 'start' }}>
          <div>
            <div className="painel">
              <h3>
                <Icone nome="raio" /> Gerar com assistente
              </h3>
              <p className="desc">Descreva o tema e o contexto; o assistente monta o modelo em Markdown com os marcadores. O texto fica editável abaixo.</p>
              <div className="row2">
                <Campo label="Tema" htmlFor="mr-tema" obrigatorio erro={erros.tema}>
                  <input id="mr-tema" value={gerar.tema} onChange={(e) => setGerar({ ...gerar, tema: e.target.value })} placeholder="Ex.: Relatório de auditoria de NR-35" />
                </Campo>
                <Campo label="Categoria" htmlFor="mr-gerar-categoria">
                  <select id="mr-gerar-categoria" value={gerar.categoria} onChange={(e) => setGerar({ ...gerar, categoria: e.target.value as '' | CategoriaModeloRelatorio })}>
                    <option value="">Escolha...</option>
                    {CATEGORIAS_MODELO_RELATORIO.map((c) => (
                      <option key={c} value={c}>
                        {ROTULO_CATEGORIA_MODELO_RELATORIO[c]}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
              <Campo label="Contexto (opcional)" htmlFor="mr-contexto" ajuda="Exigências do cliente, normas a citar, seções obrigatórias, público do relatório.">
                <textarea id="mr-contexto" rows={3} value={gerar.contexto} onChange={(e) => setGerar({ ...gerar, contexto: e.target.value })} />
              </Campo>
              <div className="barra-acoes">
                <button type="button" className="btn btn-outline" onClick={() => void gerarComAssistente()} disabled={gerando}>
                  <Icone nome="raio" /> {gerando ? 'Gerando...' : 'Gerar com assistente'}
                </button>
                {form.conteudo ? <span className="aviso hint">O conteúdo atual será substituído pelo texto gerado.</span> : null}
              </div>
              {avisoGeracao ? <div className="hint alerta">{avisoGeracao}</div> : null}
            </div>

            <div className="painel">
              <h3>{editandoId ? 'Editar modelo' : 'Novo modelo'}</h3>
              <div className="row2">
                <Campo label="Título" htmlFor="mr-titulo" obrigatorio erro={erros.titulo}>
                  <input id="mr-titulo" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} maxLength={150} />
                </Campo>
                <Campo label="Categoria" htmlFor="mr-categoria" erro={erros.categoria}>
                  <select id="mr-categoria" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as '' | CategoriaModeloRelatorio })}>
                    <option value="">Sem categoria</option>
                    {CATEGORIAS_MODELO_RELATORIO.map((c) => (
                      <option key={c} value={c}>
                        {ROTULO_CATEGORIA_MODELO_RELATORIO[c]}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
              <Campo label="Descrição" htmlFor="mr-descricao" erro={erros.descricao}>
                <input id="mr-descricao" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} maxLength={300} placeholder="Quando usar este modelo" />
              </Campo>
              <Campo label="Conteúdo (Markdown)" htmlFor="mr-conteudo" obrigatorio erro={erros.conteudo} ajuda="Use # para o título, ## para seções, - para listas e | para tabelas.">
                <textarea
                  id="mr-conteudo"
                  className="mono"
                  rows={22}
                  value={form.conteudo}
                  onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, lineHeight: 1.45, width: '100%' }}
                />
              </Campo>
              <div className="check-linha">
                <label>
                  <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
                  Modelo ativo (aparece na lista para uso)
                </label>
              </div>
              <div className="barra-acoes rodape-form">
                <button type="button" className="btn btn-primary" onClick={() => void salvar()} disabled={salvando}>
                  <Icone nome="ok" /> {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Criar modelo'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setAba('lista')}>
                  Voltar à lista
                </button>
                {editandoId ? (
                  <button type="button" className="btn btn-ghost" onClick={novoModelo}>
                    Começar outro
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div>
            {listaMarcadores}
            {form.conteudo ? (
              <div className="painel">
                <h3>Pré-visualização</h3>
                <div className="folha markdown-previa" style={ESTILO_PREVIA}>{renderizarMarkdown(form.conteudo)}</div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {aba === 'usar' && aberto ? (
        <>
          <div className="painel sem-impressao">
            <h3>
              Usar: {aberto.titulo} <span className="pill info">{rotuloCategoria(aberto.categoria)}</span>
            </h3>
            {aberto.descricao ? <p className="desc">{aberto.descricao}</p> : null}
            <div className="row3">
              <Campo label="Cliente" htmlFor="mr-usar-cliente" erro={erros.clienteId} ajuda="Preenche {{cliente}}.">
                <select id="mr-usar-cliente" value={usar.clienteId} onChange={(e) => setUsar({ ...usar, clienteId: e.target.value })}>
                  <option value="">Não informado</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nomeFantasia}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Período" htmlFor="mr-usar-periodo" erro={erros.periodo} ajuda="Preenche {{periodo}}; vazio usa o mês atual.">
                <input id="mr-usar-periodo" value={usar.periodo} onChange={(e) => setUsar({ ...usar, periodo: e.target.value })} placeholder="Ex.: outubro/2026" maxLength={80} />
              </Campo>
              <Campo label="Responsável" htmlFor="mr-usar-resp" erro={erros.responsavel} ajuda="Preenche {{responsavel}}; vazio usa o seu nome.">
                <input id="mr-usar-resp" value={usar.responsavel} onChange={(e) => setUsar({ ...usar, responsavel: e.target.value })} maxLength={120} />
              </Campo>
            </div>
            <div className="barra-acoes">
              <button type="button" className="btn btn-primary" onClick={() => void preencher()} disabled={preenchendo}>
                <Icone nome="documento" /> {preenchendo ? 'Preenchendo...' : 'Preencher'}
              </button>
              <span className="aviso hint">Troca os marcadores e mostra a pré-visualização para imprimir ou copiar.</span>
            </div>

            <details className="ajuda-expansivel" open>
              <summary>
                <Icone nome="raio" /> Redigir com assistente
              </summary>
              <Campo
                label="Instruções e dados do período"
                htmlFor="mr-instrucoes"
                obrigatorio
                erro={erros.instrucoes}
                ajuda="Conte o que aconteceu: atividades, números, desvios, treinamentos, pontos a destacar. O assistente preenche as seções do modelo com isso."
              >
                <textarea id="mr-instrucoes" rows={6} value={usar.instrucoes} onChange={(e) => setUsar({ ...usar, instrucoes: e.target.value })} />
              </Campo>
              <div className="barra-acoes">
                <button type="button" className="btn btn-outline" onClick={() => void redigir()} disabled={redigindo}>
                  <Icone nome="raio" /> {redigindo ? 'Redigindo...' : 'Redigir com assistente'}
                </button>
              </div>
            </details>
          </div>

          {previa ? (
            <>
              <div className="barra-acoes sem-impressao">
                <button type="button" className="btn btn-primary" onClick={() => window.print()}>
                  <Icone nome="impressora" /> Imprimir / PDF
                </button>
                <button type="button" className="btn btn-outline" onClick={() => void copiarTexto()}>
                  Copiar texto
                </button>
                {previa.origem === 'IA' ? <span className="pill ok">Redigido pelo assistente</span> : null}
                {previa.origem === 'MODELO' ? <span className="pill warn">IA não configurada — modelo preenchido + observações</span> : null}
                {previa.pendentes && previa.pendentes.length > 0 ? (
                  <span className="aviso hint">Marcadores sem valor: {previa.pendentes.join(', ')}</span>
                ) : null}
              </div>
              <div className="painel folha markdown-previa" style={ESTILO_PREVIA}>{renderizarMarkdown(previa.conteudo)}</div>
            </>
          ) : (
            <div className="painel sem-impressao">
              <div className="vazio">
                <div className="icone-vazio" aria-hidden="true">
                  <Icone nome="olho" tamanho={22} />
                </div>
                <h4>Sem pré-visualização ainda</h4>
                <p>Clique em "Preencher" para ver o modelo com os marcadores trocados, ou redija o relatório final com o assistente.</p>
              </div>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
