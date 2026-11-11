import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  conteudo?: string | null;
  geradoPorIa?: boolean;
  observacoes?: string | null;
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

interface PainelDds {
  total: number;
  participantesTotal: number;
  minutosTotal: number;
  porMes: Array<{ mes: string; dds: number; participantes: number }>;
  porCategoria: Array<{ chave: string; total: number }>;
  porArea: Array<{ chave: string; total: number }>;
  porLider: Array<{ chave: string; dds: number; participantes: number }>;
  temasMaisUsados: Array<{ chave: string; total: number }>;
}

interface RoteiroGerado {
  titulo: string;
  categoria: string;
  texto: string;
  origem: 'IA' | 'MODELO';
  assistenteConfigurada: boolean;
}

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

type Area = { id: string; nome: string; codigo: string };

/** Dados exibidos na folha imprimivel do DDS (formulario + lista de presenca). */
interface FolhaDds {
  clienteId: string;
  cliente: string;
  tema: string;
  categoria: string;
  data: string;
  area: string;
  lider: string;
  duracaoMinutos: string;
  participantes: string;
  conteudo: string;
}

type Aba = 'registrar' | 'historico' | 'painel';

const NOVO_VAZIO = {
  clienteId: '',
  areaId: '',
  temaId: '',
  temaLivre: '',
  data: '',
  lider: '',
  participantes: '',
  duracaoMinutos: '',
  conteudo: '',
  geradoPorIa: false,
};

const FILTRO_VAZIO = { clienteId: '', areaId: '', lider: '', temaId: '', de: '', ate: '', busca: '' };
const POR_PAGINA = 40;
const LINHAS_PRESENCA = 25;
const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Atrasa um valor digitado para nao recarregar a lista a cada tecla. */
function useAtrasado<T>(valor: T, ms = 400): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const t = window.setTimeout(() => setAtrasado(valor), ms);
    return () => window.clearTimeout(t);
  }, [valor, ms]);
  return atrasado;
}

/** Negrito (**x**) e italico (_x_) dentro de uma linha. */
function renderizarInline(texto: string): ReactNode[] {
  const partes = texto.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return partes.map((parte, i) => {
    if (parte.startsWith('**') && parte.endsWith('**') && parte.length > 4) return <b key={i}>{parte.slice(2, -2)}</b>;
    if (parte.startsWith('_') && parte.endsWith('_') && parte.length > 2) return <i key={i}>{parte.slice(1, -1)}</i>;
    return <Fragment key={i}>{parte}</Fragment>;
  });
}

/**
 * Markdown simples, sem biblioteca: #/##/### viram titulos, "- " ou "* "
 * vira lista, "1. " vira lista numerada e o resto vira paragrafo.
 */
function renderizarMarkdown(texto: string): ReactNode[] {
  const blocos: ReactNode[] = [];
  let paragrafo: string[] = [];
  let lista: { tipo: 'ul' | 'ol'; itens: string[] } | null = null;

  const fecharParagrafo = () => {
    if (paragrafo.length > 0) {
      blocos.push(
        <p key={`p${blocos.length}`} style={{ margin: '0 0 8px' }}>
          {renderizarInline(paragrafo.join(' '))}
        </p>,
      );
      paragrafo = [];
    }
  };
  const fecharLista = () => {
    if (lista) {
      const itens = lista.itens.map((item, i) => <li key={i}>{renderizarInline(item)}</li>);
      blocos.push(
        lista.tipo === 'ul' ? (
          <ul key={`l${blocos.length}`} style={{ margin: '0 0 8px', paddingLeft: 20 }}>
            {itens}
          </ul>
        ) : (
          <ol key={`l${blocos.length}`} style={{ margin: '0 0 8px', paddingLeft: 20 }}>
            {itens}
          </ol>
        ),
      );
      lista = null;
    }
  };

  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) {
      fecharParagrafo();
      fecharLista();
      continue;
    }
    const titulo = /^(#{1,3})\s+(.*)$/.exec(linha);
    if (titulo) {
      fecharParagrafo();
      fecharLista();
      const nivel = titulo[1]!.length;
      const conteudo = renderizarInline(titulo[2] ?? '');
      const estilo = { margin: nivel === 1 ? '4px 0 8px' : '10px 0 6px' };
      blocos.push(
        nivel === 1 ? (
          <h3 key={`h${blocos.length}`} style={estilo}>
            {conteudo}
          </h3>
        ) : nivel === 2 ? (
          <h4 key={`h${blocos.length}`} style={estilo}>
            {conteudo}
          </h4>
        ) : (
          <h5 key={`h${blocos.length}`} style={estilo}>
            {conteudo}
          </h5>
        ),
      );
      continue;
    }
    const itemLista = /^[-*]\s+(.*)$/.exec(linha);
    const itemNumerado = /^\d+[.)]\s+(.*)$/.exec(linha);
    if (itemLista || itemNumerado) {
      fecharParagrafo();
      const tipo = itemLista ? 'ul' : 'ol';
      if (lista && lista.tipo !== tipo) fecharLista();
      if (!lista) lista = { tipo, itens: [] };
      lista.itens.push((itemLista ?? itemNumerado)![1] ?? '');
      continue;
    }
    fecharLista();
    paragrafo.push(linha);
  }
  fecharParagrafo();
  fecharLista();
  return blocos;
}

/** Valor da folha ou linha em branco para preencher a mao. */
function valorOuLinha(valor: string): ReactNode {
  return valor ? valor : <span style={{ display: 'inline-block', minWidth: 140, borderBottom: '1px solid currentColor' }}>&nbsp;</span>;
}

function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split('-');
  return `${NOMES_MES[Number(mes) - 1] ?? mes}/${(ano ?? '').slice(2)}`;
}

function BarrasContagem({ itens, sufixo }: { itens: Array<{ chave: string; total: number; extra?: string }>; sufixo: string }) {
  if (itens.length === 0) return <p className="hint">Sem registros no período.</p>;
  const maximo = Math.max(1, ...itens.map((i) => i.total));
  return (
    <>
      {itens.map((item) => (
        <div key={item.chave} className="barra-bbs">
          <div className="barra-rotulo">{item.chave}</div>
          <div className="barra-trilho">
            <span style={{ width: `${Math.round((item.total / maximo) * 100)}%` }} />
          </div>
          <div className="barra-valor">
            {item.total}
            <small>
              {' '}
              {sufixo}
              {item.extra ? ` · ${item.extra}` : ''}
            </small>
          </div>
        </div>
      ))}
    </>
  );
}

export function DdsPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('observacoes:escrever');

  const [aba, setAba] = useState<Aba>(podeEscrever ? 'registrar' : 'historico');
  const [carregando, setCarregando] = useState(true);
  const [itens, setItens] = useState<RegistroDdsApi[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [resumo, setResumo] = useState<ResumoDds | null>(null);
  const [temas, setTemas] = useState<TemaApi[]>([]);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [areasFiltro, setAreasFiltro] = useState<Area[]>([]);

  const [filtro, setFiltro] = useState(FILTRO_VAZIO);
  const liderAtrasado = useAtrasado(filtro.lider);
  const buscaAtrasada = useAtrasado(filtro.busca);
  const [roteiroAberto, setRoteiroAberto] = useState<string | null>(null);

  const [novo, setNovo] = useState(NOVO_VAZIO);
  const [contexto, setContexto] = useState('');
  const [gerando, setGerando] = useState(false);
  const [origemRoteiro, setOrigemRoteiro] = useState<'IA' | 'MODELO' | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});

  const [painelClienteId, setPainelClienteId] = useState('');
  const [meses, setMeses] = useState(6);
  const [painel, setPainel] = useState<PainelDds | null>(null);
  const [carregandoPainel, setCarregandoPainel] = useState(false);

  const [folha, setFolha] = useState<FolhaDds | null>(null);
  const [logos, setLogos] = useState<{ empresa: string | null; cliente: string | null; empresaNome: string | null }>({
    empresa: null,
    cliente: null,
    empresaNome: null,
  });

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
      const parametros = new URLSearchParams({ porPagina: String(POR_PAGINA), pagina: String(pagina) });
      if (filtro.clienteId) parametros.set('clienteId', filtro.clienteId);
      if (filtro.areaId) parametros.set('areaId', filtro.areaId);
      if (filtro.temaId) parametros.set('temaId', filtro.temaId);
      if (filtro.de) parametros.set('de', filtro.de);
      if (filtro.ate) parametros.set('ate', `${filtro.ate}T23:59:59`);
      if (liderAtrasado.trim()) parametros.set('lider', liderAtrasado.trim());
      if (buscaAtrasada.trim()) parametros.set('busca', buscaAtrasada.trim());
      const escopo = filtro.clienteId ? `?clienteId=${filtro.clienteId}` : '';

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
  }, [filtro.clienteId, filtro.areaId, filtro.temaId, filtro.de, filtro.ate, liderAtrasado, buscaAtrasada, pagina, mostrar]);

  const carregarPainel = useCallback(async () => {
    setCarregandoPainel(true);
    try {
      const p = new URLSearchParams({ meses: String(meses) });
      if (painelClienteId) p.set('clienteId', painelClienteId);
      setPainel(await api.get<PainelDds>(`/dds/painel?${p.toString()}`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar o painel.', 'erro');
    } finally {
      setCarregandoPainel(false);
    }
  }, [meses, painelClienteId, mostrar]);

  useEffect(() => {
    void api.get<TemaApi[]>('/dds/temas').then(setTemas).catch(() => setTemas([]));
    void api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (aba === 'painel') void carregarPainel();
  }, [aba, carregarPainel]);

  // Áreas do cliente escolhido no formulário.
  useEffect(() => {
    if (!novo.clienteId) {
      setAreas([]);
      return;
    }
    void api
      .get<{ itens: Area[] }>(`/areas?clienteId=${novo.clienteId}&porPagina=200`)
      .then((resposta) => setAreas(resposta.itens))
      .catch(() => setAreas([]));
  }, [novo.clienteId]);

  // Áreas do cliente escolhido no filtro do histórico.
  useEffect(() => {
    if (!filtro.clienteId) {
      setAreasFiltro([]);
      return;
    }
    void api
      .get<{ itens: Area[] }>(`/areas?clienteId=${filtro.clienteId}&porPagina=200`)
      .then((resposta) => setAreasFiltro(resposta.itens))
      .catch(() => setAreasFiltro([]));
  }, [filtro.clienteId]);

  // Logos da consultoria e do cliente para o cabeçalho da folha.
  useEffect(() => {
    if (!folha) return;
    let ativo = true;
    void Promise.all([
      api.get<{ logoUrl: string | null; nomeFantasia: string | null }>('/empresa').catch(() => null),
      folha.clienteId ? api.get<{ logoUrl: string | null }>(`/clientes/${folha.clienteId}`).catch(() => null) : Promise.resolve(null),
    ]).then(([empresa, cliente]) => {
      if (!ativo) return;
      setLogos({
        empresa: urlAbsoluta(empresa?.logoUrl),
        empresaNome: empresa?.nomeFantasia ?? null,
        cliente: urlAbsoluta(cliente?.logoUrl),
      });
    });
    return () => {
      ativo = false;
    };
  }, [folha]);

  function alterarFiltro(parcial: Partial<typeof FILTRO_VAZIO>) {
    setFiltro((atual) => ({ ...atual, ...parcial }));
    setPagina(1);
  }

  /** Validacao local, com a mesma mensagem que o servidor daria — o botao nunca fica "mudo". */
  function validarLocal(): Record<string, string> {
    const falta: Record<string, string> = {};
    if (!novo.clienteId) falta.clienteId = 'Informe o cliente.';
    if (!novo.data) falta.data = 'Informe a data do DDS.';
    else if (new Date(`${novo.data}T23:59:59`).getTime() < Date.now() - 366 * 24 * 60 * 60 * 1000) falta.data = 'Data muito antiga.';
    if (!novo.lider || novo.lider.trim().length < 3) falta.lider = 'Informe quem conduziu (ao menos 3 letras).';
    if (!novo.participantes || Number(novo.participantes) < 1) falta.participantes = 'Informe o numero de participantes (ao menos 1).';
    if (!novo.temaId && !novo.temaLivre.trim()) falta.temaId = 'Escolha um tema do banco ou descreva o tema livre.';
    return falta;
  }

  async function gerarRoteiro() {
    if (!novo.temaId && !novo.temaLivre.trim()) {
      setErros({ ...erros, temaId: 'Escolha um tema do banco ou descreva o tema livre para gerar o roteiro.' });
      mostrar('Escolha um tema do banco ou descreva o tema livre para gerar o roteiro.', 'erro');
      return;
    }
    if (novo.conteudo.trim() && !window.confirm('Substituir o roteiro atual pelo novo texto gerado?')) return;
    const duracao = Math.min(30, Math.max(5, Number(novo.duracaoMinutos) || 10));
    setGerando(true);
    try {
      const resposta = await api.post<RoteiroGerado>('/dds/gerar', {
        temaId: novo.temaId || undefined,
        temaLivre: novo.temaId ? undefined : novo.temaLivre.trim() || undefined,
        contexto: contexto.trim() || undefined,
        duracaoMinutos: duracao,
      });
      setNovo((atual) => ({ ...atual, conteudo: resposta.texto, geradoPorIa: true }));
      setOrigemRoteiro(resposta.origem);
      setErros((atuais) => {
        const copia = { ...atuais };
        delete copia.temaId;
        return copia;
      });
      mostrar(resposta.origem === 'IA' ? 'Roteiro gerado pela IA. Revise antes de usar.' : 'Roteiro-modelo preenchido. Revise antes de usar.', 'sucesso');
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao gerar o roteiro.', 'erro');
    } finally {
      setGerando(false);
    }
  }

  async function registrar() {
    const falta = validarLocal();
    setErros(falta);
    if (Object.keys(falta).length > 0) {
      mostrar(Object.values(falta).join(' '), 'erro');
      return;
    }
    setSalvando(true);
    try {
      const conteudo = novo.conteudo.trim();
      await api.post('/dds', {
        ...novo,
        areaId: novo.areaId || undefined,
        temaId: novo.temaId || undefined,
        temaLivre: novo.temaLivre || undefined,
        duracaoMinutos: novo.duracaoMinutos || undefined,
        conteudo: conteudo || undefined,
        geradoPorIa: conteudo ? novo.geradoPorIa : false,
      });
      mostrar('DDS registrado.', 'sucesso');
      setNovo({ ...NOVO_VAZIO, clienteId: novo.clienteId, lider: novo.lider });
      setContexto('');
      setOrigemRoteiro(null);
      setErros({});
      void carregar();
    } catch (erro) {
      if (erro instanceof ErroApi) {
        const porCampo: Record<string, string> = {};
        for (const [campo, mensagens] of Object.entries(erro.campos)) porCampo[campo] = mensagens[0] ?? 'Valor invalido.';
        setErros(porCampo);
        const lista = Object.values(porCampo);
        mostrar(lista.length > 0 ? lista.join(' ') : erro.mensagemAmigavel(), 'erro');
      } else {
        mostrar('Falha ao registrar.', 'erro');
      }
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

  /** Folha a partir do formulário (pode estar em branco, para levar a campo). */
  function imprimirFormulario() {
    const tema = temas.find((t) => t.id === novo.temaId);
    const area = areas.find((a) => a.id === novo.areaId);
    setFolha({
      clienteId: novo.clienteId,
      cliente: clientes.find((c) => c.id === novo.clienteId)?.nomeFantasia ?? '',
      tema: tema ? `${tema.numero}. ${tema.titulo}` : novo.temaLivre.trim(),
      categoria: tema?.categoria ?? '',
      data: novo.data,
      area: area ? `${area.codigo} — ${area.nome}` : '',
      lider: novo.lider.trim(),
      duracaoMinutos: novo.duracaoMinutos,
      participantes: novo.participantes,
      conteudo: novo.conteudo,
    });
  }

  function imprimirRegistro(registro: RegistroDdsApi) {
    setFolha({
      clienteId: registro.cliente?.id ?? '',
      cliente: registro.cliente?.nomeFantasia ?? '',
      tema: registro.tema ? `${registro.tema.numero}. ${registro.tema.titulo}` : registro.temaLivre ?? '',
      categoria: registro.tema?.categoria ?? '',
      data: registro.data.slice(0, 10),
      area: registro.area ? `${registro.area.codigo} — ${registro.area.nome}` : '',
      lider: registro.lider,
      duracaoMinutos: registro.duracaoMinutos ? String(registro.duracaoMinutos) : '',
      participantes: String(registro.participantes),
      conteudo: registro.conteudo ?? '',
    });
  }

  const mesesDoPainel = useMemo(() => {
    if (!painel) return [];
    const porChave = new Map(painel.porMes.map((m) => [m.mes, m]));
    const lista: Array<{ mes: string; dds: number; participantes: number }> = [];
    const cursor = new Date();
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() - meses);
    const hoje = new Date();
    while (cursor.getFullYear() < hoje.getFullYear() || (cursor.getFullYear() === hoje.getFullYear() && cursor.getMonth() <= hoje.getMonth())) {
      const chave = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      lista.push(porChave.get(chave) ?? { mes: chave, dds: 0, participantes: 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return lista;
  }, [painel, meses]);

  if (folha) {
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
          <p className="hint">Campos vazios saem como linha em branco para preencher à mão.</p>
        </div>

        <div className="painel folha">
          <div className="folha-cabecalho">
            <div>
              {logos.empresa || logos.cliente ? (
                <div className="folha-logos" style={{ marginBottom: 8 }}>
                  {logos.empresa ? <img src={logos.empresa} alt={logos.empresaNome ?? 'Consultoria'} /> : null}
                  {logos.cliente ? <img src={logos.cliente} alt={folha.cliente || 'Cliente'} /> : null}
                </div>
              ) : null}
              <h2>DDS — Diálogo Diário de Segurança</h2>
              <div className="hint">{folha.cliente || logos.empresaNome || ''}</div>
            </div>
            <div className="meta">
              <div>Data: {folha.data ? formatarDataIso(folha.data) : '____/____/______'}</div>
              <div>Horário: ____:____</div>
            </div>
          </div>

          <dl className="folha-dados" style={{ marginBottom: 16 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <dt>Tema</dt>
              <dd>{valorOuLinha(folha.tema)}</dd>
            </div>
            {folha.categoria ? (
              <div>
                <dt>Categoria</dt>
                <dd>{folha.categoria}</dd>
              </div>
            ) : null}
            <div>
              <dt>Cliente</dt>
              <dd>{valorOuLinha(folha.cliente)}</dd>
            </div>
            <div>
              <dt>Área / local</dt>
              <dd>{valorOuLinha(folha.area)}</dd>
            </div>
            <div>
              <dt>Líder (quem conduziu)</dt>
              <dd>{valorOuLinha(folha.lider)}</dd>
            </div>
            <div>
              <dt>Duração</dt>
              <dd>{folha.duracaoMinutos ? `${folha.duracaoMinutos} min` : valorOuLinha('')}</dd>
            </div>
            <div>
              <dt>Participantes</dt>
              <dd>{valorOuLinha(folha.participantes)}</dd>
            </div>
          </dl>

          <div className="folha-secao">
            <h4>Roteiro do DDS</h4>
            {folha.conteudo.trim() ? (
              <div style={{ fontSize: 13 }}>{renderizarMarkdown(folha.conteudo)}</div>
            ) : (
              <div>
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} style={{ borderBottom: '1px solid var(--border)', height: 26 }} />
                ))}
              </div>
            )}
          </div>

          <div className="folha-secao" style={{ breakInside: 'auto' }}>
            <h4>Lista de presença</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 36, border: '1px solid var(--border)', padding: 4 }}>Nº</th>
                  <th style={{ border: '1px solid var(--border)', padding: 4 }}>Nome</th>
                  <th style={{ width: '24%', border: '1px solid var(--border)', padding: 4 }}>Matrícula / função</th>
                  <th style={{ width: '30%', border: '1px solid var(--border)', padding: 4 }}>Assinatura</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: LINHAS_PRESENCA }, (_, i) => (
                  <tr key={i} style={{ height: 28, breakInside: 'avoid' }}>
                    <td style={{ border: '1px solid var(--border)', textAlign: 'center' }}>{i + 1}</td>
                    <td style={{ border: '1px solid var(--border)' }} />
                    <td style={{ border: '1px solid var(--border)' }} />
                    <td style={{ border: '1px solid var(--border)' }} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="folha-assinatura">
            <div>
              <div style={{ height: 40 }} />
              Líder do DDS{folha.lider ? ` — ${folha.lider}` : ''}
            </div>
            <div>
              <div style={{ height: 40 }} />
              Responsável SST
            </div>
          </div>
        </div>
      </>
    );
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

      <div className="abas">
        <button type="button" className={aba === 'registrar' ? 'ativa' : ''} onClick={() => setAba('registrar')}>
          Registrar
        </button>
        <button type="button" className={aba === 'historico' ? 'ativa' : ''} onClick={() => setAba('historico')}>
          Histórico
        </button>
        <button type="button" className={aba === 'painel' ? 'ativa' : ''} onClick={() => setAba('painel')}>
          Painel
        </button>
      </div>

      {aba === 'registrar' ? (
        <div className="painel">
          <h3>Registrar DDS</h3>
          {!podeEscrever ? (
            <p className="hint alerta">
              Sem permissão para registrar DDS. Você ainda pode imprimir o formulário em branco para levar a campo.
            </p>
          ) : null}
          <div className="filtros">
            <Campo label="Cliente" htmlFor="dds-cliente" obrigatorio erro={erros.clienteId}>
              <select id="dds-cliente" value={novo.clienteId} onChange={(e) => setNovo({ ...novo, clienteId: e.target.value, areaId: '' })}>
                <option value="">Selecione...</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nomeFantasia}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Área" htmlFor="dds-area" erro={erros.areaId}>
              <select id="dds-area" value={novo.areaId} onChange={(e) => setNovo({ ...novo, areaId: e.target.value })}>
                <option value="">Geral / sem área</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.codigo} — {area.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Data" htmlFor="dds-data" obrigatorio erro={erros.data}>
              <input id="dds-data" type="date" value={novo.data} onChange={(e) => setNovo({ ...novo, data: e.target.value })} />
            </Campo>
            <Campo label="Líder" htmlFor="dds-lider" obrigatorio erro={erros.lider}>
              <input id="dds-lider" value={novo.lider} onChange={(e) => setNovo({ ...novo, lider: e.target.value })} />
            </Campo>
            <Campo label="Participantes" htmlFor="dds-part" obrigatorio erro={erros.participantes}>
              <input
                id="dds-part"
                type="number"
                min={1}
                className="estreito"
                value={novo.participantes}
                onChange={(e) => setNovo({ ...novo, participantes: e.target.value })}
              />
            </Campo>
            <Campo label="Duração (min)" htmlFor="dds-dur" erro={erros.duracaoMinutos}>
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
            <Campo label="Tema do banco" htmlFor="dds-tema" ajuda="Ou descreva um tema livre ao lado." erro={erros.temaId}>
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
            <Campo label="Tema livre" htmlFor="dds-livre" erro={erros.temaLivre}>
              <input
                id="dds-livre"
                value={novo.temaLivre}
                onChange={(e) => setNovo({ ...novo, temaLivre: e.target.value, temaId: '' })}
                placeholder="Assunto do dia, se não estiver no banco"
              />
            </Campo>
          </div>

          <h4 style={{ marginTop: 12 }}>Roteiro do DDS</h4>
          {podeEscrever ? (
            <>
              <Campo
                label="Contexto para a IA (opcional)"
                htmlFor="dds-contexto"
                ajuda="Atividade do dia, área, ocorrências recentes — ajuda a IA a trazer exemplos da operação. A duração acima (5 a 30 min; padrão 10) também é usada."
              >
                <textarea id="dds-contexto" rows={2} value={contexto} onChange={(e) => setContexto(e.target.value)} maxLength={2000} />
              </Campo>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0 8px' }}>
                <button type="button" className="btn btn-outline btn-sm" disabled={gerando} onClick={() => void gerarRoteiro()}>
                  <Icone nome="raio" /> {gerando ? 'Gerando roteiro...' : 'Gerar roteiro com IA'}
                </button>
                {novo.geradoPorIa && novo.conteudo ? <span className="pill info">gerado com IA · editável</span> : null}
              </div>
              {origemRoteiro === 'MODELO' ? (
                <p className="hint alerta">IA não configurada no servidor (ANTHROPIC_API_KEY) — foi usado um roteiro-modelo.</p>
              ) : null}
            </>
          ) : null}
          <Campo
            label="Roteiro"
            htmlFor="dds-conteudo"
            erro={erros.conteudo}
            ajuda="Texto que o líder vai conduzir. Aceita títulos (#, ##) e listas (- item). Sai impresso no formulário."
          >
            <textarea
              id="dds-conteudo"
              rows={14}
              value={novo.conteudo}
              maxLength={20000}
              onChange={(e) => setNovo({ ...novo, conteudo: e.target.value, geradoPorIa: e.target.value.trim() ? novo.geradoPorIa : false })}
              placeholder={'# Tema do dia\n\n## 1. Abertura\nTexto...\n\n## 2. Boas práticas\n- item\n- item'}
            />
          </Campo>

          <div className="barra-acoes">
            {podeEscrever ? (
              <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void registrar()}>
                {salvando ? 'Registrando...' : 'Registrar DDS'}
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost" onClick={imprimirFormulario}>
              <Icone nome="impressora" /> Imprimir formulário
            </button>
            <span className="hint">
              Campos com * são obrigatórios. Se faltar algo, o campo é destacado ao clicar. O formulário pode ser impresso em branco,
              com a lista de presença.
            </span>
          </div>
        </div>
      ) : null}

      {aba === 'historico' ? (
        <div className="painel">
          <div className="filtros">
            <Campo label="Cliente" htmlFor="fd-cliente">
              <select id="fd-cliente" value={filtro.clienteId} onChange={(e) => alterarFiltro({ clienteId: e.target.value, areaId: '' })}>
                <option value="">Todos</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nomeFantasia}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Área" htmlFor="fd-area" ajuda={filtro.clienteId ? undefined : 'Escolha o cliente para filtrar por área.'}>
              <select id="fd-area" value={filtro.areaId} disabled={!filtro.clienteId} onChange={(e) => alterarFiltro({ areaId: e.target.value })}>
                <option value="">Todas</option>
                {areasFiltro.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.codigo} — {area.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Líder" htmlFor="fd-lider">
              <input id="fd-lider" value={filtro.lider} onChange={(e) => alterarFiltro({ lider: e.target.value })} placeholder="Nome do líder" />
            </Campo>
            <Campo label="Tema" htmlFor="fd-tema">
              <select id="fd-tema" value={filtro.temaId} onChange={(e) => alterarFiltro({ temaId: e.target.value })}>
                <option value="">Todos</option>
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
            <Campo label="De" htmlFor="fd-de">
              <input id="fd-de" type="date" value={filtro.de} onChange={(e) => alterarFiltro({ de: e.target.value })} />
            </Campo>
            <Campo label="Até" htmlFor="fd-ate">
              <input id="fd-ate" type="date" value={filtro.ate} onChange={(e) => alterarFiltro({ ate: e.target.value })} />
            </Campo>
            <Campo label="Busca" htmlFor="fd-busca">
              <input id="fd-busca" value={filtro.busca} onChange={(e) => alterarFiltro({ busca: e.target.value })} placeholder="Tema ou líder" />
            </Campo>
          </div>
          {Object.values(filtro).some(Boolean) ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => alterarFiltro(FILTRO_VAZIO)}>
              Limpar filtros
            </button>
          ) : null}

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
              <h4>Nenhum DDS encontrado</h4>
              <p>Ajuste os filtros ou registre o diálogo diário na aba Registrar.</p>
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
                      <th>Roteiro</th>
                      <th>Lista</th>
                      {podeEscrever ? <th aria-label="Ações" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((registro) => (
                      <Fragment key={registro.id}>
                        <tr>
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
                            {registro.conteudo ? (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => setRoteiroAberto(roteiroAberto === registro.id ? null : registro.id)}
                                >
                                  <Icone nome="olho" /> {roteiroAberto === registro.id ? 'Fechar' : 'Ver'}
                                </button>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => imprimirRegistro(registro)}>
                                  <Icone nome="impressora" /> Imprimir
                                </button>
                                {registro.geradoPorIa ? <span className="pill info">IA</span> : null}
                              </div>
                            ) : (
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => imprimirRegistro(registro)} title="Imprimir o formulário com a lista de presença">
                                <Icone nome="impressora" /> Formulário
                              </button>
                            )}
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
                        {roteiroAberto === registro.id && registro.conteudo ? (
                          <tr>
                            <td colSpan={podeEscrever ? 8 : 7}>
                              <div style={{ fontSize: 13, maxWidth: 820 }}>{renderizarMarkdown(registro.conteudo)}</div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="paginacao">
                <span>
                  Exibindo {itens.length} de {total} registro(s)
                </span>
                {total > POR_PAGINA ? (
                  <span style={{ display: 'inline-flex', gap: 6, marginLeft: 12 }}>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
                      Anterior
                    </button>
                    <span className="hint">
                      Página {pagina} de {Math.ceil(total / POR_PAGINA)}
                    </span>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={pagina * POR_PAGINA >= total} onClick={() => setPagina(pagina + 1)}>
                      Próxima
                    </button>
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}

      {aba === 'painel' ? (
        <div className="painel">
          <div className="filtros">
            <Campo label="Cliente" htmlFor="pd-cliente">
              <select id="pd-cliente" value={painelClienteId} onChange={(e) => setPainelClienteId(e.target.value)}>
                <option value="">Todos</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nomeFantasia}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Período" htmlFor="pd-meses">
              <select id="pd-meses" value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
                <option value={3}>Últimos 3 meses</option>
                <option value={6}>Últimos 6 meses</option>
                <option value={12}>Últimos 12 meses</option>
              </select>
            </Campo>
          </div>

          {carregandoPainel && !painel ? (
            <div className="centro-tela">
              <div className="spinner" />
              Carregando...
            </div>
          ) : painel ? (
            <>
              <div className="stat-grid">
                <div className="stat">
                  <b>{painel.total}</b>
                  <span>DDS realizados</span>
                </div>
                <div className="stat">
                  <b>{painel.participantesTotal}</b>
                  <span>participações</span>
                </div>
                <div className="stat">
                  <b>{(painel.minutosTotal / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</b>
                  <span>horas de DDS (duração informada)</span>
                </div>
                <div className="stat">
                  <b>{painel.total > 0 ? (painel.participantesTotal / painel.total).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}</b>
                  <span>participantes por DDS</span>
                </div>
              </div>

              <h4 style={{ marginTop: 16 }}>DDS por mês</h4>
              {mesesDoPainel.length === 0 ? (
                <p className="hint">Sem registros no período.</p>
              ) : (
                (() => {
                  const maximo = Math.max(1, ...mesesDoPainel.map((m) => m.dds));
                  return mesesDoPainel.map((m) => (
                    <div key={m.mes} className="barra-bbs">
                      <div className="barra-rotulo">{rotuloMes(m.mes)}</div>
                      <div className="barra-trilho">
                        <span style={{ width: `${Math.round((m.dds / maximo) * 100)}%` }} />
                      </div>
                      <div className="barra-valor">
                        {m.dds}
                        <small> DDS · {m.participantes} particip.</small>
                      </div>
                    </div>
                  ));
                })()
              )}

              <div className="grid2" style={{ marginTop: 16 }}>
                <div>
                  <h4>Por categoria</h4>
                  <BarrasContagem itens={painel.porCategoria} sufixo="DDS" />
                </div>
                <div>
                  <h4>Por área</h4>
                  <BarrasContagem itens={painel.porArea} sufixo="DDS" />
                </div>
              </div>

              <div className="grid2" style={{ marginTop: 16 }}>
                <div>
                  <h4>Por líder</h4>
                  <BarrasContagem
                    itens={painel.porLider.slice(0, 15).map((l) => ({ chave: l.chave, total: l.dds, extra: `${l.participantes} particip.` }))}
                    sufixo="DDS"
                  />
                </div>
                <div>
                  <h4>Temas mais usados</h4>
                  <BarrasContagem itens={painel.temasMaisUsados} sufixo="vez(es)" />
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
