import { useCallback, useEffect, useState } from 'react';
import {
  ESTADOS_FISICOS,
  PALAVRAS_ADVERTENCIA,
  PICTOGRAMAS_GHS,
  ROTULO_ESTADO_FISICO,
  ROTULO_PALAVRA_ADVERTENCIA,
  ROTULO_PICTOGRAMA_GHS,
  ROTULO_SITUACAO_FDS,
  UNIDADES_ESTOQUE_QUIMICO,
  type CodigoPictogramaGhs,
  type EstadoFisico,
  type PalavraAdvertencia,
  type SituacaoFds,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import { textoPrazo } from '../lib/saude';
import { useSessao } from '../lib/sessao';

/* -------------------------------------------------------------------------- */
/* Tipos da API                                                                */
/* -------------------------------------------------------------------------- */

interface ProdutoApi {
  id: string;
  clienteId: string;
  areaId: string | null;
  nome: string;
  fabricante: string | null;
  numeroCas: string | null;
  estadoFisico: EstadoFisico | null;
  pictogramas: CodigoPictogramaGhs[];
  palavraAdvertencia: PalavraAdvertencia | null;
  frasesPerigo: string | null;
  classificacao: string | null;
  localArmazenamento: string | null;
  quantidadeEstoque: number | null;
  unidade: string | null;
  episNecessarios: string | null;
  medidasControle: string | null;
  fdsUrl: string | null;
  fdsValidade: string | null;
  observacoes: string | null;
  ativo: boolean;
  atualizadoEm: string;
  situacaoFds: SituacaoFds;
  diasParaVencerFds: number | null;
  cliente?: { id: string; nomeFantasia: string };
  area?: { id: string; nome: string; codigo: string } | null;
  rotulos?: { situacaoFds: string; estadoFisico: string | null; palavraAdvertencia: string | null; pictogramas: string[] };
}

interface ResumoQuimicos {
  total: number;
  semFds: number;
  fdsVencidas: number;
  fdsAVencer: number;
  comPalavraPerigo: number;
  porPictograma: { codigo: CodigoPictogramaGhs; nome: string; total: number }[];
}

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

interface OpcaoArea {
  id: string;
  nome: string;
  codigo: string;
}

/** Primeira mensagem de cada campo invalido, para o `erro=` do Campo. */
function primeirasMensagens(campos: Record<string, string[]>): Record<string, string> {
  return Object.fromEntries(Object.entries(campos).map(([campo, mensagens]) => [campo, mensagens[0] ?? 'Valor inválido.']));
}

const PILL_FDS: Record<SituacaoFds, string> = {
  VIGENTE: 'ok',
  A_VENCER: 'warn',
  VENCIDA: 'bad',
  SEM_FDS: 'gray',
};

const FORM_VAZIO = {
  clienteId: '',
  areaId: '',
  nome: '',
  fabricante: '',
  numeroCas: '',
  estadoFisico: '' as '' | EstadoFisico,
  pictogramas: [] as CodigoPictogramaGhs[],
  palavraAdvertencia: '' as '' | PalavraAdvertencia,
  frasesPerigo: '',
  classificacao: '',
  localArmazenamento: '',
  quantidadeEstoque: '',
  unidade: '',
  episNecessarios: '',
  medidasControle: '',
  fdsValidade: '',
  observacoes: '',
};

type Formulario = typeof FORM_VAZIO;

/* -------------------------------------------------------------------------- */
/* Pictograma GHS                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Losango GHS desenhado em SVG com o codigo dentro.
 *
 * TODO (imagens oficiais): quando as imagens dos pictogramas chegarem (Valmir),
 * salve-as em `apps/web/public/pictogramas/GHS01.png` ... `GHS09.png` e troque
 * o SVG abaixo por `<img src={`/pictogramas/${codigo}.png`} alt={nome} />`,
 * mantendo `tamanho` como largura/altura. Nada mais na tela precisa mudar.
 */
function PictogramaGhs({ codigo, tamanho = 44, titulo }: { codigo: CodigoPictogramaGhs; tamanho?: number; titulo?: string }) {
  const nome = titulo ?? ROTULO_PICTOGRAMA_GHS[codigo];
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${codigo} — ${nome}`}
      style={{ display: 'inline-block', verticalAlign: 'middle', flex: '0 0 auto' }}
    >
      <title>{`${codigo} — ${nome}`}</title>
      <polygon points="50,2 98,50 50,98 2,50" fill="#fff" stroke="#d0021b" strokeWidth="7" strokeLinejoin="round" />
      <text x="50" y="47" textAnchor="middle" fontSize="19" fontWeight="700" fill="#111" fontFamily="system-ui, sans-serif">
        {codigo.slice(0, 3)}
      </text>
      <text x="50" y="68" textAnchor="middle" fontSize="19" fontWeight="700" fill="#111" fontFamily="system-ui, sans-serif">
        {codigo.slice(3)}
      </text>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Pagina                                                                      */
/* -------------------------------------------------------------------------- */

export function QuimicosPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('cadastros:escrever');

  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [areasFiltro, setAreasFiltro] = useState<OpcaoArea[]>([]);
  const [areasForm, setAreasForm] = useState<OpcaoArea[]>([]);

  const [filtro, setFiltro] = useState({ clienteId: '', areaId: '', busca: '', pictograma: '' as '' | CodigoPictogramaGhs });
  const [buscaDigitada, setBuscaDigitada] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [produtos, setProdutos] = useState<ProdutoApi[]>([]);
  const [resumo, setResumo] = useState<ResumoQuimicos | null>(null);

  const [form, setForm] = useState<Formulario>(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [arquivoFds, setArquivoFds] = useState<File | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [formAberto, setFormAberto] = useState(false);

  const [fichaId, setFichaId] = useState<string | null>(null);

  /* ---------------------------------------------------------- carga --- */

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const qs = new URLSearchParams();
      if (filtro.clienteId) qs.set('clienteId', filtro.clienteId);
      if (filtro.areaId) qs.set('areaId', filtro.areaId);
      if (filtro.busca) qs.set('busca', filtro.busca);
      if (filtro.pictograma) qs.set('pictograma', filtro.pictograma);
      const sufixo = qs.toString() ? `?${qs.toString()}` : '';
      const [lista, cards] = await Promise.all([
        api.get<ProdutoApi[]>(`/quimicos${sufixo}`),
        api.get<ResumoQuimicos>(`/quimicos/resumo${filtro.clienteId ? `?clienteId=${filtro.clienteId}` : ''}`),
      ]);
      setProdutos(lista);
      setResumo(cards);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os produtos químicos.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [filtro, mostrar]);

  useEffect(() => {
    void api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!filtro.clienteId) {
      setAreasFiltro([]);
      return;
    }
    void api
      .get<{ itens: OpcaoArea[] }>(`/areas?clienteId=${filtro.clienteId}&porPagina=200`)
      .then((r) => setAreasFiltro(r.itens))
      .catch(() => setAreasFiltro([]));
  }, [filtro.clienteId]);

  useEffect(() => {
    if (!form.clienteId) {
      setAreasForm([]);
      return;
    }
    void api
      .get<{ itens: OpcaoArea[] }>(`/areas?clienteId=${form.clienteId}&porPagina=200`)
      .then((r) => setAreasForm(r.itens))
      .catch(() => setAreasForm([]));
  }, [form.clienteId]);

  /* ----------------------------------------------------------- acoes --- */

  function aplicarBusca() {
    setFiltro((f) => ({ ...f, busca: buscaDigitada.trim() }));
  }

  function alternarPictograma(codigo: CodigoPictogramaGhs) {
    setForm((f) => ({
      ...f,
      pictogramas: f.pictogramas.includes(codigo) ? f.pictogramas.filter((c) => c !== codigo) : [...f.pictogramas, codigo],
    }));
  }

  function novo() {
    setEditandoId(null);
    setForm({ ...FORM_VAZIO, clienteId: filtro.clienteId });
    setArquivoFds(null);
    setErros({});
    setFormAberto(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function editar(produto: ProdutoApi) {
    setEditandoId(produto.id);
    setForm({
      clienteId: produto.clienteId,
      areaId: produto.areaId ?? '',
      nome: produto.nome,
      fabricante: produto.fabricante ?? '',
      numeroCas: produto.numeroCas ?? '',
      estadoFisico: produto.estadoFisico ?? '',
      pictogramas: produto.pictogramas,
      palavraAdvertencia: produto.palavraAdvertencia ?? '',
      frasesPerigo: produto.frasesPerigo ?? '',
      classificacao: produto.classificacao ?? '',
      localArmazenamento: produto.localArmazenamento ?? '',
      quantidadeEstoque: produto.quantidadeEstoque === null ? '' : String(produto.quantidadeEstoque),
      unidade: produto.unidade ?? '',
      episNecessarios: produto.episNecessarios ?? '',
      medidasControle: produto.medidasControle ?? '',
      fdsValidade: produto.fdsValidade ? produto.fdsValidade.slice(0, 10) : '',
      observacoes: produto.observacoes ?? '',
    });
    setArquivoFds(null);
    setErros({});
    setFormAberto(true);
    setFichaId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelar() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setArquivoFds(null);
    setErros({});
    setFormAberto(false);
  }

  async function salvar() {
    setSalvando(true);
    setErros({});
    try {
      const corpo = {
        ...form,
        areaId: form.areaId || null,
        estadoFisico: form.estadoFisico || null,
        palavraAdvertencia: form.palavraAdvertencia || null,
        quantidadeEstoque: form.quantidadeEstoque === '' ? null : form.quantidadeEstoque,
        fdsValidade: form.fdsValidade || null,
      };
      const salvo = editandoId
        ? await api.put<ProdutoApi>(`/quimicos/${editandoId}`, corpo)
        : await api.post<ProdutoApi>('/quimicos', corpo);

      if (arquivoFds) {
        const qs = form.fdsValidade ? `?validade=${form.fdsValidade}` : '';
        await api.upload(`/quimicos/${salvo.id}/fds${qs}`, arquivoFds);
      }

      mostrar(editandoId ? 'Produto atualizado.' : 'Produto cadastrado.', 'sucesso');
      cancelar();
      void carregar();
    } catch (erro) {
      if (erro instanceof ErroApi) {
        setErros(primeirasMensagens(erro.campos));
        mostrar(erro.mensagemAmigavel(), 'erro');
      } else {
        mostrar('Falha ao salvar o produto.', 'erro');
      }
    } finally {
      setSalvando(false);
    }
  }

  async function anexarFds(produto: ProdutoApi, arquivo: File) {
    try {
      const qs = produto.fdsValidade ? `?validade=${produto.fdsValidade.slice(0, 10)}` : '';
      await api.upload(`/quimicos/${produto.id}/fds${qs}`, arquivo);
      mostrar('FDS anexada.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao anexar a FDS.', 'erro');
    }
  }

  async function remover(produto: ProdutoApi) {
    if (!window.confirm(`Remover o produto "${produto.nome}"? A FDS anexada também será apagada.`)) return;
    try {
      await api.delete(`/quimicos/${produto.id}`);
      mostrar('Produto removido.', 'sucesso');
      if (fichaId === produto.id) setFichaId(null);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao remover.', 'erro');
    }
  }

  /* ----------------------------------------------------------- ficha --- */

  const ficha = fichaId ? produtos.find((p) => p.id === fichaId) ?? null : null;

  if (ficha) {
    return <FichaProduto produto={ficha} aoVoltar={() => setFichaId(null)} />;
  }

  /* ---------------------------------------------------------- render --- */

  return (
    <>
      <div className="painel">
        <h3>Produtos químicos (GHS / FDS)</h3>
        <p className="desc">
          Inventário de produtos químicos com a classificação GHS — pictogramas, palavra de advertência e frases de perigo —,
          local de armazenamento, EPIs exigidos e a Ficha de Dados de Segurança (FDS) anexada com validade. A ficha resumo
          imprimível serve como rótulo e ficha de emergência da área.
        </p>

        {resumo ? (
          <div className="stat-grid">
            <div className="stat">
              <b>{resumo.total}</b>
              <span>produtos ativos</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.semFds > 0 ? 'var(--red)' : undefined }}>{resumo.semFds}</b>
              <span>sem FDS</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.fdsVencidas > 0 ? 'var(--red)' : undefined }}>{resumo.fdsVencidas}</b>
              <span>FDS vencidas</span>
            </div>
            <div className="stat">
              <b>{resumo.fdsAVencer}</b>
              <span>FDS a vencer (30d)</span>
            </div>
            <div className="stat">
              <b>{resumo.comPalavraPerigo}</b>
              <span>com palavra “Perigo”</span>
            </div>
          </div>
        ) : null}

        {resumo && resumo.porPictograma.some((p) => p.total > 0) ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {resumo.porPictograma
              .filter((p) => p.total > 0)
              .map((p) => (
                <button
                  key={p.codigo}
                  type="button"
                  className={`btn btn-sm ${filtro.pictograma === p.codigo ? 'btn-primary' : 'btn-outline'}`}
                  title={`Filtrar por ${p.nome}`}
                  onClick={() => setFiltro((f) => ({ ...f, pictograma: f.pictograma === p.codigo ? '' : p.codigo }))}
                >
                  <PictogramaGhs codigo={p.codigo} tamanho={18} /> {p.nome}: {p.total}
                </button>
              ))}
          </div>
        ) : null}
      </div>

      {podeEscrever && formAberto ? (
        <div className="painel">
          <h3>{editandoId ? 'Editar produto' : 'Novo produto químico'}</h3>

          <div className="filtros">
            <Campo label="Cliente" htmlFor="pq-cliente" obrigatorio erro={erros.clienteId}>
              <select id="pq-cliente" value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value, areaId: '' })}>
                <option value="">Selecione...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nomeFantasia}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Área" htmlFor="pq-area" erro={erros.areaId} ajuda={!form.clienteId ? 'Escolha o cliente primeiro.' : undefined}>
              <select id="pq-area" value={form.areaId} disabled={!form.clienteId} onChange={(e) => setForm({ ...form, areaId: e.target.value })}>
                <option value="">Sem área específica</option>
                {areasForm.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo} — {a.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Nome do produto" htmlFor="pq-nome" obrigatorio erro={erros.nome}>
              <input id="pq-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Acetona P.A." />
            </Campo>
            <Campo label="Fabricante" htmlFor="pq-fabricante" erro={erros.fabricante}>
              <input id="pq-fabricante" value={form.fabricante} onChange={(e) => setForm({ ...form, fabricante: e.target.value })} />
            </Campo>
            <Campo label="Nº CAS" htmlFor="pq-cas" erro={erros.numeroCas} ajuda="Formato 0000-00-0">
              <input id="pq-cas" className="estreito mono" value={form.numeroCas} onChange={(e) => setForm({ ...form, numeroCas: e.target.value })} placeholder="67-64-1" />
            </Campo>
            <Campo label="Estado físico" htmlFor="pq-estado" erro={erros.estadoFisico}>
              <select id="pq-estado" value={form.estadoFisico} onChange={(e) => setForm({ ...form, estadoFisico: e.target.value as '' | EstadoFisico })}>
                <option value="">—</option>
                {ESTADOS_FISICOS.map((e) => (
                  <option key={e} value={e}>
                    {ROTULO_ESTADO_FISICO[e]}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <h4 style={{ margin: '16px 0 6px' }}>Classificação GHS</h4>
          <p className="hint" style={{ marginBottom: 8 }}>
            Marque os pictogramas que aparecem no rótulo ou na seção 2 da FDS.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {PICTOGRAMAS_GHS.map((p) => {
              const marcado = form.pictogramas.includes(p.codigo);
              return (
                <button
                  key={p.codigo}
                  type="button"
                  aria-pressed={marcado}
                  title={p.descricao}
                  onClick={() => alternarPictograma(p.codigo)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    border: marcado ? '2px solid #d0021b' : '1px solid var(--border, #d9dee5)',
                    background: marcado ? 'rgba(208,2,27,.08)' : 'transparent',
                    color: 'inherit',
                    font: 'inherit',
                  }}
                >
                  <PictogramaGhs codigo={p.codigo} tamanho={34} />
                  <span style={{ textAlign: 'left', lineHeight: 1.15 }}>
                    <b style={{ display: 'block', fontSize: 13 }}>{p.nome}</b>
                    <span className="hint mono">{p.codigo}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {erros.pictogramas ? (
            <div className="erro" role="alert">
              {erros.pictogramas}
            </div>
          ) : null}

          <div className="filtros" style={{ marginTop: 12 }}>
            <Campo label="Palavra de advertência" htmlFor="pq-palavra" erro={erros.palavraAdvertencia}>
              <select
                id="pq-palavra"
                value={form.palavraAdvertencia}
                onChange={(e) => setForm({ ...form, palavraAdvertencia: e.target.value as '' | PalavraAdvertencia })}
              >
                <option value="">—</option>
                {PALAVRAS_ADVERTENCIA.map((p) => (
                  <option key={p} value={p}>
                    {ROTULO_PALAVRA_ADVERTENCIA[p]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Classificação de perigo" htmlFor="pq-classif" erro={erros.classificacao} ajuda="Ex.: Líquido inflamável cat. 2; Irritação ocular cat. 2A">
              <input id="pq-classif" value={form.classificacao} onChange={(e) => setForm({ ...form, classificacao: e.target.value })} />
            </Campo>
          </div>
          <Campo label="Frases de perigo (H)" htmlFor="pq-frases" erro={erros.frasesPerigo} ajuda="Ex.: H225 Líquido e vapores altamente inflamáveis; H319 Provoca irritação ocular grave">
            <textarea id="pq-frases" rows={2} value={form.frasesPerigo} onChange={(e) => setForm({ ...form, frasesPerigo: e.target.value })} />
          </Campo>

          <h4 style={{ margin: '16px 0 6px' }}>Armazenamento e controle</h4>
          <div className="filtros">
            <Campo label="Local de armazenamento" htmlFor="pq-local" erro={erros.localArmazenamento}>
              <input id="pq-local" value={form.localArmazenamento} onChange={(e) => setForm({ ...form, localArmazenamento: e.target.value })} placeholder="Ex.: Almoxarifado B, armário de inflamáveis" />
            </Campo>
            <Campo label="Quantidade em estoque" htmlFor="pq-qtd" erro={erros.quantidadeEstoque}>
              <input id="pq-qtd" type="number" min={0} step="0.01" className="estreito" value={form.quantidadeEstoque} onChange={(e) => setForm({ ...form, quantidadeEstoque: e.target.value })} />
            </Campo>
            <Campo label="Unidade" htmlFor="pq-unidade" erro={erros.unidade}>
              <input id="pq-unidade" className="estreito" list="pq-unidades" value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} />
              <datalist id="pq-unidades">
                {UNIDADES_ESTOQUE_QUIMICO.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </Campo>
          </div>
          <Campo label="EPIs necessários" htmlFor="pq-epis" erro={erros.episNecessarios} ajuda="Ex.: Luva nitrílica, óculos de ampla visão, respirador com filtro VO">
            <input id="pq-epis" value={form.episNecessarios} onChange={(e) => setForm({ ...form, episNecessarios: e.target.value })} />
          </Campo>
          <Campo label="Medidas de controle e emergência" htmlFor="pq-medidas" erro={erros.medidasControle} ajuda="Ventilação, aterramento, kit de contenção, o que fazer em derramamento ou contato">
            <textarea id="pq-medidas" rows={3} value={form.medidasControle} onChange={(e) => setForm({ ...form, medidasControle: e.target.value })} />
          </Campo>

          <h4 style={{ margin: '16px 0 6px' }}>Ficha de Dados de Segurança (FDS)</h4>
          <div className="filtros">
            <Campo label="Arquivo da FDS" htmlFor="pq-fds" ajuda="PDF ou imagem. Substitui a FDS anterior.">
              <input id="pq-fds" type="file" accept="application/pdf,image/*" onChange={(e) => setArquivoFds(e.target.files?.[0] ?? null)} />
            </Campo>
            <Campo label="Validade / revisão da FDS" htmlFor="pq-fds-validade" erro={erros.fdsValidade}>
              <input id="pq-fds-validade" type="date" value={form.fdsValidade} onChange={(e) => setForm({ ...form, fdsValidade: e.target.value })} />
            </Campo>
          </div>
          <Campo label="Observações" htmlFor="pq-obs" erro={erros.observacoes}>
            <textarea id="pq-obs" rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </Campo>

          {!form.clienteId || !form.nome.trim() ? <p className="hint alerta">Informe o cliente e o nome do produto para salvar.</p> : null}
          <div className="barra-acoes">
            <button type="button" className="btn btn-primary" disabled={salvando || !form.clienteId || !form.nome.trim()} onClick={() => void salvar()}>
              {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Cadastrar produto'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={cancelar}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div className="painel">
        <div className="filtros">
          <Campo label="Cliente" htmlFor="fq-cliente">
            <select id="fq-cliente" value={filtro.clienteId} onChange={(e) => setFiltro({ ...filtro, clienteId: e.target.value, areaId: '' })}>
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Área" htmlFor="fq-area">
            <select id="fq-area" value={filtro.areaId} disabled={!filtro.clienteId} onChange={(e) => setFiltro({ ...filtro, areaId: e.target.value })}>
              <option value="">Todas</option>
              {areasFiltro.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo} — {a.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Pictograma" htmlFor="fq-picto">
            <select id="fq-picto" value={filtro.pictograma} onChange={(e) => setFiltro({ ...filtro, pictograma: e.target.value as '' | CodigoPictogramaGhs })}>
              <option value="">Todos</option>
              {PICTOGRAMAS_GHS.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.codigo} — {p.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Buscar" htmlFor="fq-busca" ajuda="Nome, fabricante, CAS, classificação ou local">
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                id="fq-busca"
                className="busca"
                value={buscaDigitada}
                onChange={(e) => setBuscaDigitada(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') aplicarBusca();
                }}
                placeholder="Buscar produto..."
              />
              <button type="button" className="btn btn-outline btn-sm" aria-label="Buscar" onClick={aplicarBusca}>
                <Icone nome="lupa" />
              </button>
            </div>
          </Campo>
        </div>

        {podeEscrever && !formAberto ? (
          <div className="barra-acoes">
            <button type="button" className="btn btn-primary" onClick={novo}>
              <Icone nome="mais" /> Novo produto
            </button>
          </div>
        ) : null}

        {carregando ? (
          <div className="centro-tela">
            <div className="spinner" />
            Carregando...
          </div>
        ) : produtos.length === 0 ? (
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="alerta" tamanho={22} />
            </div>
            <h4>Nenhum produto químico encontrado</h4>
            <p>{filtro.busca || filtro.pictograma || filtro.clienteId ? 'Ajuste os filtros ou a busca.' : 'Cadastre os produtos com a classificação GHS e anexe a FDS.'}</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Pictogramas</th>
                  <th>Advertência</th>
                  <th>Armazenamento</th>
                  <th>FDS</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {produtos.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <b>{p.nome}</b>
                      <div className="hint">
                        {[p.fabricante, p.numeroCas ? `CAS ${p.numeroCas}` : null, p.rotulos?.estadoFisico].filter(Boolean).join(' · ') || '—'}
                      </div>
                      <div className="hint">
                        {p.cliente?.nomeFantasia}
                        {p.area ? ` · ${p.area.codigo} ${p.area.nome}` : ''}
                      </div>
                    </td>
                    <td>
                      {p.pictogramas.length === 0 ? (
                        <span className="hint">nenhum</span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {p.pictogramas.map((codigo) => (
                            <PictogramaGhs key={codigo} codigo={codigo} tamanho={30} />
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      {p.palavraAdvertencia ? (
                        <span className={`pill ${p.palavraAdvertencia === 'PERIGO' ? 'bad' : 'warn'}`}>{p.rotulos?.palavraAdvertencia}</span>
                      ) : (
                        <span className="hint">—</span>
                      )}
                      {p.classificacao ? <div className="hint">{p.classificacao}</div> : null}
                    </td>
                    <td>
                      {p.localArmazenamento ?? <span className="hint">—</span>}
                      {p.quantidadeEstoque !== null ? (
                        <div className="hint">
                          {p.quantidadeEstoque} {p.unidade ?? ''}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span className={`pill ${PILL_FDS[p.situacaoFds]}`}>{ROTULO_SITUACAO_FDS[p.situacaoFds]}</span>
                      {p.fdsValidade ? <div className="hint">{formatarDataIso(p.fdsValidade)} · {textoPrazo(p.diasParaVencerFds)}</div> : null}
                      {p.fdsUrl ? (
                        <div>
                          <a href={urlAbsoluta(p.fdsUrl) ?? '#'} target="_blank" rel="noreferrer">
                            <Icone nome="documento" /> Abrir FDS
                          </a>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        <button type="button" className="btn btn-ghost btn-sm" title="Ficha resumo imprimível" onClick={() => setFichaId(p.id)}>
                          <Icone nome="imprimir" /> Ficha
                        </button>
                        {podeEscrever ? (
                          <>
                            <label className="btn btn-ghost btn-sm" title="Anexar FDS">
                              <Icone nome="anexo" /> FDS
                              <input
                                type="file"
                                hidden
                                accept="application/pdf,image/*"
                                onChange={(e) => {
                                  const arquivo = e.target.files?.[0];
                                  if (arquivo) void anexarFds(p, arquivo);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => editar(p)}>
                              Editar
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remover(p)}>
                              Remover
                            </button>
                          </>
                        ) : null}
                      </div>
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

/* -------------------------------------------------------------------------- */
/* Ficha resumo imprimivel                                                     */
/* -------------------------------------------------------------------------- */

function FichaProduto({ produto, aoVoltar }: { produto: ProdutoApi; aoVoltar: () => void }) {
  const pictogramas = PICTOGRAMAS_GHS.filter((p) => produto.pictogramas.includes(p.codigo));
  const perigo = produto.palavraAdvertencia === 'PERIGO';

  return (
    <>
      <div className="painel sem-impressao">
        <div className="barra-acoes" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="btn btn-ghost" onClick={aoVoltar}>
            <Icone nome="voltar" /> Voltar à lista
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {produto.fdsUrl ? (
              <a className="btn btn-outline" href={urlAbsoluta(produto.fdsUrl) ?? '#'} target="_blank" rel="noreferrer">
                <Icone nome="documento" /> Abrir FDS completa
              </a>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              <Icone nome="impressora" /> Imprimir ficha
            </button>
          </div>
        </div>
        <p className="hint">
          Ficha resumo para afixar na área de armazenamento ou de uso — não substitui a FDS completa.
        </p>
      </div>

      <div className="painel folha">
        <div className="folha-cabecalho">
          <div>
            <h2>{produto.nome}</h2>
            <div className="hint">
              {[produto.fabricante, produto.numeroCas ? `CAS ${produto.numeroCas}` : null, produto.rotulos?.estadoFisico].filter(Boolean).join(' · ')}
            </div>
            <div className="hint">
              {produto.cliente?.nomeFantasia}
              {produto.area ? ` · ${produto.area.codigo} ${produto.area.nome}` : ''}
            </div>
          </div>
          <div className="meta">
            {produto.palavraAdvertencia ? (
              <div
                style={{
                  border: `3px solid ${perigo ? '#d0021b' : '#e08a00'}`,
                  color: perigo ? '#d0021b' : '#9a5b00',
                  padding: '6px 18px',
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  borderRadius: 6,
                  textAlign: 'center',
                }}
              >
                {produto.rotulos?.palavraAdvertencia}
              </div>
            ) : null}
          </div>
        </div>

        <div className="folha-secao">
          <h4>Pictogramas de perigo (GHS)</h4>
          {pictogramas.length === 0 ? (
            <p className="hint">Nenhum pictograma atribuído — produto não classificado como perigoso ou cadastro incompleto.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
              {pictogramas.map((p) => (
                <div key={p.codigo} style={{ width: 120, textAlign: 'center' }}>
                  <PictogramaGhs codigo={p.codigo} tamanho={96} />
                  <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>{p.nome}</div>
                  <div className="hint" style={{ fontSize: 11 }}>
                    {p.codigo}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <dl className="folha-dados" style={{ marginBottom: 16 }}>
          <div>
            <dt>Classificação de perigo</dt>
            <dd>{produto.classificacao ?? '—'}</dd>
          </div>
          <div>
            <dt>Frases de perigo (H)</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{produto.frasesPerigo ?? '—'}</dd>
          </div>
          <div>
            <dt>Local de armazenamento</dt>
            <dd>
              {produto.localArmazenamento ?? '—'}
              {produto.quantidadeEstoque !== null ? ` · ${produto.quantidadeEstoque} ${produto.unidade ?? ''}` : ''}
            </dd>
          </div>
          <div>
            <dt>FDS</dt>
            <dd>
              {ROTULO_SITUACAO_FDS[produto.situacaoFds]}
              {produto.fdsValidade ? ` · validade ${formatarDataIso(produto.fdsValidade)}` : ''}
            </dd>
          </div>
        </dl>

        <div className="folha-secao">
          <h4>EPIs obrigatórios para manuseio</h4>
          <p style={{ fontSize: 15, fontWeight: 600 }}>{produto.episNecessarios ?? 'Não informado — consulte a seção 8 da FDS.'}</p>
        </div>

        <div className="folha-secao">
          <h4>Medidas de controle e emergência</h4>
          <p style={{ whiteSpace: 'pre-wrap' }}>{produto.medidasControle ?? 'Não informado — consulte as seções 4, 5 e 6 da FDS.'}</p>
        </div>

        {produto.observacoes ? (
          <div className="folha-secao">
            <h4>Observações</h4>
            <p style={{ whiteSpace: 'pre-wrap' }}>{produto.observacoes}</p>
          </div>
        ) : null}

        <div className="folha-secao">
          <h4>Em caso de emergência</h4>
          <p>
            Afaste-se da área, acione o responsável pela segurança e a brigada de incêndio. Em contato com pele ou olhos, lave
            com água corrente em abundância e procure atendimento médico levando esta ficha e a FDS. Corpo de Bombeiros: 193 ·
            SAMU: 192 · Intoxicações (CIATox): 0800 722 6001.
          </p>
        </div>

        <div className="folha-assinatura">
          <div>
            <div style={{ height: 50 }} />
            Responsável pela segurança do trabalho
          </div>
          <div>
            <div style={{ height: 50 }} />
            Responsável pela área
            <div className="hint">Ficha gerada em {formatarDataIso(new Date().toISOString())}</div>
          </div>
        </div>
      </div>
    </>
  );
}
