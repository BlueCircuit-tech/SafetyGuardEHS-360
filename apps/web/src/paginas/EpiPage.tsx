import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CATEGORIAS_EPI_SUGERIDAS,
  MOTIVOS_ENTREGA_EPI,
  ROTULO_MOTIVO_ENTREGA,
  ROTULO_SITUACAO_VENCIMENTO,
  ROTULO_TIPO_ANEXO_EPI,
  TIPOS_ANEXO_EPI,
  type MotivoEntregaEpi,
  type SituacaoVencimento,
  type TipoAnexoEpi,
} from '@safetyguard/shared';
import { AssinaturaCanvas } from '../componentes/AssinaturaCanvas';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { formatarDataHora, formatarDataIso } from '../lib/datas';
import { PILL_VENCIMENTO, textoPrazo } from '../lib/saude';
import { useSessao } from '../lib/sessao';

interface EpiApi {
  id: string;
  nome: string;
  ca: string;
  categoria: string | null;
  validadeCa: string | null;
  fornecedor: string | null;
  custoUnitario: number | null;
  vidaUtilMeses: number | null;
  estoqueAtual: number;
  estoqueMinimo: number;
  estoqueReferencia: number | null;
  pontoReposicao: number;
  valorEmEstoque: number | null;
  urlConsultaCa: string;
  ativo: boolean;
  situacaoCa: SituacaoVencimento;
  diasParaVencerCa: number | null;
  abaixoDoMinimo: boolean;
  _count?: { entregas: number; anexos?: number };
}

interface AnexoEpiApi {
  id: string;
  titulo: string;
  tipo: TipoAnexoEpi;
  rotuloTipo: string;
  url: string;
  criadoEm: string;
}

interface EntradaEpiApi {
  id: string;
  data: string;
  quantidade: number;
  custoUnitario: number | null;
  notaFiscal: string | null;
  fornecedor: string | null;
  observacoes: string | null;
}

interface EpiDetalheApi extends EpiApi {
  anexos: AnexoEpiApi[];
  entradas: EntradaEpiApi[];
}

interface EntregaApi {
  id: string;
  data: string;
  quantidade: number;
  motivo: MotivoEntregaEpi;
  rotuloMotivo: string;
  validadeTroca: string | null;
  assinaturaUrl: string | null;
  assinaturaHash: string | null;
  assinaturaEm: string | null;
  epi?: { id: string; nome: string; ca: string };
  colaborador?: { id: string; nome: string; funcao: string };
}

interface TrocaApi {
  id: string;
  data: string;
  quantidade: number;
  validadeTroca: string | null;
  diasParaTroca: number | null;
  vencida: boolean;
  epi: { id: string; nome: string; ca: string };
  colaborador: { id: string; nome: string; funcao: string };
}

interface ResumoEpi {
  ativos: number;
  caVencidos: number;
  caAVencer: number;
  abaixoDoMinimo: number;
  entregues30Dias: number;
  trocasVencidas: number;
  valorEmEstoque: number;
}

interface ConsumoApi {
  totalEntregue: number;
  custoTotal: number;
  porMes: Array<{ mes: string; entregues: number; entradas: number; custoEntregue: number }>;
  ranking: Array<{
    epiId: string;
    nome: string;
    ca: string;
    entregues: number;
    custo: number;
    percentual: number;
    destaque: boolean;
    mediaMensal: number;
    cobertura: number | null;
    porMotivo: Record<string, number>;
  }>;
  estoque: Array<{ id: string; nome: string; ca: string; estoqueAtual: number; pontoReposicao: number; valorEmEstoque: number | null }>;
}

interface OpcaoColaborador {
  id: string;
  nome: string;
  funcao: string;
}

type Aba = 'estoque' | 'entregas' | 'trocas' | 'consumo';

const EPI_VAZIO = {
  nome: '',
  ca: '',
  validadeCa: '',
  fornecedor: '',
  categoria: '',
  custoUnitario: '',
  vidaUtilMeses: '',
  estoqueAtual: '0',
  estoqueMinimo: '0',
  estoqueReferencia: '',
  ativo: true,
};
const ENTREGA_VAZIA = { epiId: '', colaboradorId: '', data: '', quantidade: '1', motivo: 'PRIMEIRA_ENTREGA' as MotivoEntregaEpi };
const ENTRADA_VAZIA = { data: '', quantidade: '', custoUnitario: '', notaFiscal: '', fornecedor: '', observacoes: '' };
const ANEXO_VAZIO = { titulo: '', tipo: 'LAUDO' as TipoAnexoEpi };
const PERIODOS_CONSUMO = [3, 6, 9, 12] as const;

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatarMoeda(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? '—' : moeda.format(valor);
}

/** Primeira mensagem de cada campo do ErroApi de validacao. */
function errosPorCampo(erro: unknown): Record<string, string> {
  if (!(erro instanceof ErroApi)) return {};
  return Object.fromEntries(Object.entries(erro.campos).map(([campo, mensagens]) => [campo, mensagens[0] ?? '']));
}

function hojeIso(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

/** Meses do periodo (AAAA-MM), do mais antigo ao atual — preenche os meses sem movimento. */
function mesesDoPeriodo(meses: number): string[] {
  const agora = new Date();
  const lista: string[] = [];
  for (let i = meses; i >= 0; i -= 1) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    lista.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return lista;
}

function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split('-');
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${nomes[Number(mes) - 1] ?? mes}/${ano?.slice(2)}`;
}

export function EpiPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('cadastros:escrever');

  const [aba, setAba] = useState<Aba>('estoque');
  const [carregando, setCarregando] = useState(true);
  const [todosEpis, setTodosEpis] = useState<EpiApi[]>([]);
  const [catalogo, setCatalogo] = useState<EpiApi[]>([]);
  const [carregandoCatalogo, setCarregandoCatalogo] = useState(true);
  const [entregas, setEntregas] = useState<EntregaApi[]>([]);
  const [resumo, setResumo] = useState<ResumoEpi | null>(null);
  const [colaboradores, setColaboradores] = useState<OpcaoColaborador[]>([]);
  const [clientes, setClientes] = useState<Array<{ id: string; nomeFantasia: string }>>([]);

  // Filtros do catalogo (lupa com debounce).
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);

  // Formulario do EPI (novo ou edicao).
  const [formEpi, setFormEpi] = useState(EPI_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [errosEpi, setErrosEpi] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  // Detalhe do EPI: anexos e entradas.
  const [detalhe, setDetalhe] = useState<EpiDetalheApi | null>(null);
  const [novoAnexo, setNovoAnexo] = useState(ANEXO_VAZIO);
  const [arquivoAnexo, setArquivoAnexo] = useState<File | null>(null);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [novaEntrada, setNovaEntrada] = useState(ENTRADA_VAZIA);
  const [errosEntrada, setErrosEntrada] = useState<Record<string, string>>({});

  // Entregas.
  const [novaEntrega, setNovaEntrega] = useState(ENTREGA_VAZIA);
  const [errosEntrega, setErrosEntrega] = useState<Record<string, string>>({});
  const [assinandoId, setAssinandoId] = useState<string | null>(null);
  const [enviandoAssinatura, setEnviandoAssinatura] = useState(false);

  // Trocas e consumo.
  const [clienteFiltro, setClienteFiltro] = useState('');
  const [trocas, setTrocas] = useState<TrocaApi[] | null>(null);
  const [meses, setMeses] = useState<number>(6);
  const [consumo, setConsumo] = useState<ConsumoApi | null>(null);
  const [carregandoConsumo, setCarregandoConsumo] = useState(false);
  const [soMaiores, setSoMaiores] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [lista, cards, historico] = await Promise.all([
        api.get<EpiApi[]>('/epis'),
        api.get<ResumoEpi>('/epis/resumo'),
        api.get<EntregaApi[]>('/epis/entregas'),
      ]);
      setTodosEpis(lista);
      setResumo(cards);
      setEntregas(historico);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os EPIs.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [mostrar]);

  const carregarCatalogo = useCallback(async () => {
    setCarregandoCatalogo(true);
    try {
      const p = new URLSearchParams();
      if (buscaAplicada) p.set('busca', buscaAplicada);
      if (categoriaFiltro) p.set('categoria', categoriaFiltro);
      if (mostrarInativos) p.set('inativos', 'true');
      const sufixo = p.toString() ? `?${p.toString()}` : '';
      setCatalogo(await api.get<EpiApi[]>(`/epis${sufixo}`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao filtrar os EPIs.', 'erro');
    } finally {
      setCarregandoCatalogo(false);
    }
  }, [buscaAplicada, categoriaFiltro, mostrarInativos, mostrar]);

  const carregarDetalhe = useCallback(
    async (id: string) => {
      try {
        setDetalhe(await api.get<EpiDetalheApi>(`/epis/${id}`));
      } catch (erro) {
        mostrar(erro instanceof Error ? erro.message : 'Falha ao abrir o EPI.', 'erro');
      }
    },
    [mostrar],
  );

  const recarregarTudo = useCallback(() => {
    void carregar();
    void carregarCatalogo();
  }, [carregar, carregarCatalogo]);

  useEffect(() => {
    void api.get<OpcaoColaborador[]>('/colaboradores/opcoes').then(setColaboradores).catch(() => setColaboradores([]));
    void api.get<Array<{ id: string; nomeFantasia: string }>>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const timer = window.setTimeout(() => setBuscaAplicada(busca.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [busca]);

  useEffect(() => {
    void carregarCatalogo();
  }, [carregarCatalogo]);

  useEffect(() => {
    if (aba !== 'trocas') return;
    const sufixo = clienteFiltro ? `?clienteId=${clienteFiltro}` : '';
    setTrocas(null);
    api
      .get<TrocaApi[]>(`/epis/trocas${sufixo}`)
      .then(setTrocas)
      .catch((erro: unknown) => {
        setTrocas([]);
        mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar as trocas.', 'erro');
      });
  }, [aba, clienteFiltro, mostrar]);

  useEffect(() => {
    if (aba !== 'consumo') return;
    const p = new URLSearchParams({ meses: String(meses) });
    if (clienteFiltro) p.set('clienteId', clienteFiltro);
    setCarregandoConsumo(true);
    api
      .get<ConsumoApi>(`/epis/consumo?${p.toString()}`)
      .then(setConsumo)
      .catch((erro: unknown) => mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar o consumo.', 'erro'))
      .finally(() => setCarregandoConsumo(false));
  }, [aba, meses, clienteFiltro, mostrar]);

  const categorias = useMemo(() => {
    const conjunto = new Set<string>(CATEGORIAS_EPI_SUGERIDAS);
    for (const epi of todosEpis) if (epi.categoria) conjunto.add(epi.categoria);
    return [...conjunto].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [todosEpis]);

  /* ------------------------------------------------------------ EPI --- */

  function editarEpi(epi: EpiApi) {
    setEditandoId(epi.id);
    setErrosEpi({});
    setFormEpi({
      nome: epi.nome,
      ca: epi.ca,
      validadeCa: epi.validadeCa ? epi.validadeCa.slice(0, 10) : '',
      fornecedor: epi.fornecedor ?? '',
      categoria: epi.categoria ?? '',
      custoUnitario: epi.custoUnitario === null ? '' : String(epi.custoUnitario),
      vidaUtilMeses: epi.vidaUtilMeses === null ? '' : String(epi.vidaUtilMeses),
      estoqueAtual: String(epi.estoqueAtual),
      estoqueMinimo: String(epi.estoqueMinimo),
      estoqueReferencia: epi.estoqueReferencia === null ? '' : String(epi.estoqueReferencia),
      ativo: epi.ativo,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setFormEpi(EPI_VAZIO);
    setErrosEpi({});
  }

  async function salvarEpi() {
    setSalvando(true);
    setErrosEpi({});
    const corpo = {
      nome: formEpi.nome,
      ca: formEpi.ca,
      validadeCa: formEpi.validadeCa || null,
      fornecedor: formEpi.fornecedor || null,
      categoria: formEpi.categoria || null,
      custoUnitario: formEpi.custoUnitario === '' ? null : formEpi.custoUnitario.replace(',', '.'),
      vidaUtilMeses: formEpi.vidaUtilMeses || null,
      estoqueAtual: formEpi.estoqueAtual || '0',
      estoqueMinimo: formEpi.estoqueMinimo || '0',
      estoqueReferencia: formEpi.estoqueReferencia || null,
      ativo: formEpi.ativo,
    };
    try {
      if (editandoId) {
        await api.put(`/epis/${editandoId}`, corpo);
        mostrar('EPI atualizado.', 'sucesso');
        if (detalhe?.id === editandoId) void carregarDetalhe(editandoId);
      } else {
        await api.post('/epis', corpo);
        mostrar('EPI cadastrado.', 'sucesso');
      }
      cancelarEdicao();
      recarregarTudo();
    } catch (erro) {
      setErrosEpi(errosPorCampo(erro));
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao salvar o EPI.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  /* -------------------------------------------------- anexos / entradas --- */

  async function enviarAnexo() {
    if (!detalhe || !arquivoAnexo) return;
    setEnviandoAnexo(true);
    try {
      const p = new URLSearchParams({ titulo: novoAnexo.titulo.trim(), tipo: novoAnexo.tipo });
      await api.upload(`/epis/${detalhe.id}/anexos?${p.toString()}`, arquivoAnexo);
      mostrar('Anexo enviado.', 'sucesso');
      setNovoAnexo(ANEXO_VAZIO);
      setArquivoAnexo(null);
      void carregarDetalhe(detalhe.id);
      void carregarCatalogo();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao enviar o anexo.', 'erro');
    } finally {
      setEnviandoAnexo(false);
    }
  }

  async function excluirAnexo(anexo: AnexoEpiApi) {
    if (!detalhe || !window.confirm(`Excluir o anexo "${anexo.titulo}"?`)) return;
    try {
      await api.delete(`/epis/anexos/${anexo.id}`);
      mostrar('Anexo excluído.', 'sucesso');
      void carregarDetalhe(detalhe.id);
      void carregarCatalogo();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao excluir o anexo.', 'erro');
    }
  }

  async function registrarEntrada() {
    if (!detalhe) return;
    setSalvando(true);
    setErrosEntrada({});
    try {
      await api.post('/epis/entradas', {
        epiId: detalhe.id,
        data: novaEntrada.data,
        quantidade: novaEntrada.quantidade,
        custoUnitario: novaEntrada.custoUnitario === '' ? null : novaEntrada.custoUnitario.replace(',', '.'),
        notaFiscal: novaEntrada.notaFiscal || null,
        fornecedor: novaEntrada.fornecedor || null,
        observacoes: novaEntrada.observacoes || null,
      });
      mostrar('Entrada registrada e somada ao estoque.', 'sucesso');
      setNovaEntrada({ ...ENTRADA_VAZIA, data: novaEntrada.data });
      void carregarDetalhe(detalhe.id);
      recarregarTudo();
    } catch (erro) {
      setErrosEntrada(errosPorCampo(erro));
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao registrar a entrada.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  /* ---------------------------------------------------------- entregas --- */

  async function registrarEntrega() {
    setSalvando(true);
    setErrosEntrega({});
    try {
      await api.post('/epis/entregas', novaEntrega);
      mostrar('Entrega registrada e estoque baixado.', 'sucesso');
      setNovaEntrega({ ...ENTREGA_VAZIA, data: novaEntrega.data });
      recarregarTudo();
    } catch (erro) {
      setErrosEntrega(errosPorCampo(erro));
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao registrar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function estornar(entrega: EntregaApi) {
    if (!window.confirm('Estornar esta entrega? A quantidade volta ao estoque.')) return;
    try {
      await api.delete(`/epis/entregas/${entrega.id}`);
      mostrar('Entrega estornada.', 'sucesso');
      recarregarTudo();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao estornar.', 'erro');
    }
  }

  async function assinarEntrega(entregaId: string, arquivo: File) {
    setEnviandoAssinatura(true);
    try {
      const atualizada = await api.upload<EntregaApi>(`/epis/entregas/${entregaId}/assinatura`, arquivo);
      setEntregas((lista) => lista.map((e) => (e.id === entregaId ? { ...e, ...atualizada, epi: e.epi, colaborador: e.colaborador } : e)));
      setAssinandoId(null);
      mostrar('Recebimento assinado e carimbado.', 'sucesso');
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao enviar a assinatura.', 'erro');
    } finally {
      setEnviandoAssinatura(false);
    }
  }

  function prepararTroca(troca: TrocaApi) {
    setNovaEntrega({ epiId: troca.epi.id, colaboradorId: troca.colaborador.id, data: hojeIso(), quantidade: String(troca.quantidade), motivo: 'SUBSTITUICAO' });
    setErrosEntrega({});
    setAba('entregas');
  }

  /* ------------------------------------------------------------ render --- */

  const episCaAlerta = todosEpis
    .filter((epi) => epi.situacaoCa === 'VENCIDO' || epi.situacaoCa === 'A_VENCER')
    .sort((a, b) => (a.diasParaVencerCa ?? 0) - (b.diasParaVencerCa ?? 0));

  return (
    <>
      <div className="painel">
        <h3>EPI e Estoque</h3>
        <p className="desc">
          Catálogo com CA e validade (NR-06), estoque com ponto de reposição e a ficha de entrega por colaborador. A
          entrega dá baixa no estoque na mesma transação — nunca há ficha sem baixa.
        </p>

        {resumo ? (
          <div className="stat-grid">
            <div className="stat">
              <b>{resumo.ativos}</b>
              <span>EPIs ativos</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.caVencidos > 0 ? 'var(--red)' : undefined }}>{resumo.caVencidos}</b>
              <span>CA vencidos</span>
            </div>
            <div className="stat">
              <b>{resumo.caAVencer}</b>
              <span>CA a vencer (30d)</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.abaixoDoMinimo > 0 ? 'var(--red)' : undefined }}>{resumo.abaixoDoMinimo}</b>
              <span>abaixo do ponto de reposição</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.trocasVencidas > 0 ? 'var(--red)' : undefined }}>{resumo.trocasVencidas}</b>
              <span>trocas vencidas (vida útil)</span>
            </div>
            <div className="stat">
              <b>{resumo.entregues30Dias}</b>
              <span>unidades entregues (30d)</span>
            </div>
            <div className="stat">
              <b>{formatarMoeda(resumo.valorEmEstoque)}</b>
              <span>valor em estoque</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="abas">
        <button type="button" className={aba === 'estoque' ? 'ativa' : ''} onClick={() => setAba('estoque')}>
          Estoque e CA
        </button>
        <button type="button" className={aba === 'entregas' ? 'ativa' : ''} onClick={() => setAba('entregas')}>
          Entregas (NR-06)
        </button>
        <button type="button" className={aba === 'trocas' ? 'ativa' : ''} onClick={() => setAba('trocas')}>
          Trocas e vencimentos
        </button>
        <button type="button" className={aba === 'consumo' ? 'ativa' : ''} onClick={() => setAba('consumo')}>
          Consumo
        </button>
      </div>

      {aba === 'estoque' ? (
        <>
          {podeEscrever ? (
            <div className="painel">
              <h3>{editandoId ? `Editar EPI — ${formEpi.nome}` : 'Novo EPI'}</h3>
              <div className="filtros">
                <Campo label="Nome" htmlFor="ne-nome" obrigatorio erro={errosEpi.nome}>
                  <input id="ne-nome" className="busca" value={formEpi.nome} onChange={(e) => setFormEpi({ ...formEpi, nome: e.target.value })} />
                </Campo>
                <Campo label="CA" htmlFor="ne-ca" obrigatorio erro={errosEpi.ca}>
                  <input id="ne-ca" className="estreito" value={formEpi.ca} onChange={(e) => setFormEpi({ ...formEpi, ca: e.target.value })} />
                </Campo>
                <Campo label="Validade do CA" htmlFor="ne-validade" erro={errosEpi.validadeCa}>
                  <input id="ne-validade" type="date" value={formEpi.validadeCa} onChange={(e) => setFormEpi({ ...formEpi, validadeCa: e.target.value })} />
                </Campo>
                <Campo label="Categoria" htmlFor="ne-categoria" erro={errosEpi.categoria}>
                  <input
                    id="ne-categoria"
                    list="ne-categorias"
                    value={formEpi.categoria}
                    onChange={(e) => setFormEpi({ ...formEpi, categoria: e.target.value })}
                    placeholder="Escolha ou digite"
                  />
                  <datalist id="ne-categorias">
                    {categorias.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </Campo>
                <Campo label="Fornecedor" htmlFor="ne-fornecedor" erro={errosEpi.fornecedor}>
                  <input id="ne-fornecedor" value={formEpi.fornecedor} onChange={(e) => setFormEpi({ ...formEpi, fornecedor: e.target.value })} />
                </Campo>
                <Campo label="Custo unitário (R$)" htmlFor="ne-custo" erro={errosEpi.custoUnitario}>
                  <input
                    id="ne-custo"
                    type="number"
                    min={0}
                    step="0.01"
                    className="estreito"
                    value={formEpi.custoUnitario}
                    onChange={(e) => setFormEpi({ ...formEpi, custoUnitario: e.target.value })}
                  />
                </Campo>
                <Campo label="Vida útil (meses)" htmlFor="ne-vida" erro={errosEpi.vidaUtilMeses} ajuda="Vazio = troca por desgaste.">
                  <input
                    id="ne-vida"
                    type="number"
                    min={1}
                    max={120}
                    className="estreito"
                    value={formEpi.vidaUtilMeses}
                    onChange={(e) => setFormEpi({ ...formEpi, vidaUtilMeses: e.target.value })}
                  />
                </Campo>
                <Campo
                  label="Estoque atual"
                  htmlFor="ne-estoque"
                  erro={errosEpi.estoqueAtual}
                  ajuda={editandoId ? 'Ajuste manual; compras entram pelo detalhe (Entradas).' : undefined}
                >
                  <input id="ne-estoque" type="number" min={0} className="estreito" value={formEpi.estoqueAtual} onChange={(e) => setFormEpi({ ...formEpi, estoqueAtual: e.target.value })} />
                </Campo>
                <Campo label="Mínimo" htmlFor="ne-minimo" erro={errosEpi.estoqueMinimo}>
                  <input id="ne-minimo" type="number" min={0} className="estreito" value={formEpi.estoqueMinimo} onChange={(e) => setFormEpi({ ...formEpi, estoqueMinimo: e.target.value })} />
                </Campo>
                <Campo
                  label="Estoque de referência"
                  htmlFor="ne-referencia"
                  erro={errosEpi.estoqueReferencia}
                  ajuda="Sem mínimo, o alerta de compra dispara em 10% deste valor."
                >
                  <input
                    id="ne-referencia"
                    type="number"
                    min={1}
                    className="estreito"
                    value={formEpi.estoqueReferencia}
                    onChange={(e) => setFormEpi({ ...formEpi, estoqueReferencia: e.target.value })}
                  />
                </Campo>
                {editandoId ? (
                  <div className="check-linha" style={{ alignSelf: 'end' }}>
                    <label>
                      <input type="checkbox" checked={formEpi.ativo} onChange={(e) => setFormEpi({ ...formEpi, ativo: e.target.checked })} /> Ativo
                    </label>
                  </div>
                ) : null}
              </div>
              <div className="barra-acoes">
                <button type="button" className="btn btn-primary" disabled={salvando || !formEpi.nome || !formEpi.ca} onClick={() => void salvarEpi()}>
                  {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Cadastrar EPI'}
                </button>
                {editandoId ? (
                  <button type="button" className="btn btn-ghost" onClick={cancelarEdicao}>
                    Cancelar edição
                  </button>
                ) : null}
                {!formEpi.nome || !formEpi.ca ? <span className="hint">Informe nome e CA para salvar.</span> : null}
              </div>
            </div>
          ) : null}

          {detalhe ? (
            <div className="painel">
              <div className="barra-acoes" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>
                  {detalhe.nome} <span className="mono hint">CA {detalhe.ca}</span>
                </h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a className="btn btn-outline btn-sm" href={detalhe.urlConsultaCa} target="_blank" rel="noopener noreferrer">
                    <Icone nome="lupa" /> Consultar CA
                  </a>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetalhe(null)}>
                    Fechar
                  </button>
                </div>
              </div>
              <dl className="folha-dados">
                <div>
                  <dt>Categoria</dt>
                  <dd>{detalhe.categoria ?? '—'}</dd>
                </div>
                <div>
                  <dt>Validade do CA</dt>
                  <dd>
                    {formatarDataIso(detalhe.validadeCa)} <span className="hint">{detalhe.validadeCa ? textoPrazo(detalhe.diasParaVencerCa) : ''}</span>
                  </dd>
                </div>
                <div>
                  <dt>Estoque / ponto de reposição</dt>
                  <dd>
                    {detalhe.estoqueAtual} / {detalhe.pontoReposicao || '—'}
                  </dd>
                </div>
                <div>
                  <dt>Custo unitário / valor em estoque</dt>
                  <dd>
                    {formatarMoeda(detalhe.custoUnitario)} / {formatarMoeda(detalhe.valorEmEstoque)}
                  </dd>
                </div>
                <div>
                  <dt>Vida útil</dt>
                  <dd>{detalhe.vidaUtilMeses ? `${detalhe.vidaUtilMeses} meses` : 'por desgaste'}</dd>
                </div>
              </dl>

              <div className="grid2" style={{ marginTop: 18 }}>
                <div>
                  <h3>
                    <Icone nome="pasta" /> Anexos (laudos, CA, NF)
                  </h3>
                  {podeEscrever ? (
                    <div className="filtros">
                      <Campo label="Título" htmlFor="an-titulo" obrigatorio>
                        <input id="an-titulo" value={novoAnexo.titulo} onChange={(e) => setNovoAnexo({ ...novoAnexo, titulo: e.target.value })} placeholder="Ex.: Laudo de ensaio 2026" />
                      </Campo>
                      <Campo label="Tipo" htmlFor="an-tipo">
                        <select id="an-tipo" value={novoAnexo.tipo} onChange={(e) => setNovoAnexo({ ...novoAnexo, tipo: e.target.value as TipoAnexoEpi })}>
                          {TIPOS_ANEXO_EPI.map((t) => (
                            <option key={t} value={t}>
                              {ROTULO_TIPO_ANEXO_EPI[t]}
                            </option>
                          ))}
                        </select>
                      </Campo>
                      <Campo label="Arquivo" htmlFor="an-arquivo" obrigatorio ajuda="PDF ou imagem.">
                        <input id="an-arquivo" type="file" accept="application/pdf,image/*" onChange={(e) => setArquivoAnexo(e.target.files?.[0] ?? null)} />
                      </Campo>
                    </div>
                  ) : null}
                  {podeEscrever ? (
                    <div className="barra-acoes">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={enviandoAnexo || !arquivoAnexo || novoAnexo.titulo.trim().length < 2}
                        onClick={() => void enviarAnexo()}
                      >
                        <Icone nome="anexo" /> {enviandoAnexo ? 'Enviando...' : 'Enviar anexo'}
                      </button>
                      {!arquivoAnexo || novoAnexo.titulo.trim().length < 2 ? <span className="hint">Informe título e arquivo.</span> : null}
                    </div>
                  ) : null}
                  {detalhe.anexos.length === 0 ? (
                    <p className="hint">Nenhum anexo. Guarde aqui o laudo de ensaio, o CA, a ficha técnica e a nota fiscal.</p>
                  ) : (
                    <div className="tbl-wrap">
                      <table>
                        <tbody>
                          {detalhe.anexos.map((anexo) => (
                            <tr key={anexo.id}>
                              <td>
                                <a href={urlAbsoluta(anexo.url) ?? '#'} target="_blank" rel="noopener noreferrer">
                                  <Icone nome="documento" /> {anexo.titulo}
                                </a>
                                <div className="hint">
                                  {anexo.rotuloTipo} · {formatarDataHora(anexo.criadoEm)}
                                </div>
                              </td>
                              {podeEscrever ? (
                                <td style={{ textAlign: 'right' }}>
                                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluirAnexo(anexo)}>
                                    Excluir
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

                <div>
                  <h3>
                    <Icone nome="etiqueta" /> Entradas de estoque (compras)
                  </h3>
                  {podeEscrever ? (
                    <>
                      <div className="filtros">
                        <Campo label="Data" htmlFor="en-data" obrigatorio erro={errosEntrada.data}>
                          <input id="en-data" type="date" value={novaEntrada.data} onChange={(e) => setNovaEntrada({ ...novaEntrada, data: e.target.value })} />
                        </Campo>
                        <Campo label="Quantidade" htmlFor="en-qtd" obrigatorio erro={errosEntrada.quantidade}>
                          <input id="en-qtd" type="number" min={1} className="estreito" value={novaEntrada.quantidade} onChange={(e) => setNovaEntrada({ ...novaEntrada, quantidade: e.target.value })} />
                        </Campo>
                        <Campo label="Custo unitário (R$)" htmlFor="en-custo" erro={errosEntrada.custoUnitario} ajuda="Atualiza o custo do EPI.">
                          <input
                            id="en-custo"
                            type="number"
                            min={0}
                            step="0.01"
                            className="estreito"
                            value={novaEntrada.custoUnitario}
                            onChange={(e) => setNovaEntrada({ ...novaEntrada, custoUnitario: e.target.value })}
                          />
                        </Campo>
                        <Campo label="Nota fiscal" htmlFor="en-nf" erro={errosEntrada.notaFiscal}>
                          <input id="en-nf" value={novaEntrada.notaFiscal} onChange={(e) => setNovaEntrada({ ...novaEntrada, notaFiscal: e.target.value })} placeholder="Nº da NF" />
                        </Campo>
                        <Campo label="Fornecedor" htmlFor="en-fornecedor" erro={errosEntrada.fornecedor}>
                          <input id="en-fornecedor" value={novaEntrada.fornecedor} onChange={(e) => setNovaEntrada({ ...novaEntrada, fornecedor: e.target.value })} />
                        </Campo>
                        <Campo label="Observações" htmlFor="en-obs" erro={errosEntrada.observacoes}>
                          <input id="en-obs" value={novaEntrada.observacoes} onChange={(e) => setNovaEntrada({ ...novaEntrada, observacoes: e.target.value })} />
                        </Campo>
                      </div>
                      <div className="barra-acoes">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={salvando || !novaEntrada.data || !novaEntrada.quantidade}
                          onClick={() => void registrarEntrada()}
                        >
                          {salvando ? 'Registrando...' : 'Registrar entrada'}
                        </button>
                        {!novaEntrada.data || !novaEntrada.quantidade ? <span className="hint">Informe data e quantidade.</span> : null}
                      </div>
                    </>
                  ) : null}
                  {detalhe.entradas.length === 0 ? (
                    <p className="hint">Nenhuma entrada registrada.</p>
                  ) : (
                    <div className="tbl-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th className="num-col">Qtd.</th>
                            <th className="num-col">Unitário</th>
                            <th className="num-col">Total</th>
                            <th>NF / fornecedor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detalhe.entradas.map((entrada) => (
                            <tr key={entrada.id}>
                              <td>{formatarDataIso(entrada.data)}</td>
                              <td className="num-col">{entrada.quantidade}</td>
                              <td className="num-col">{formatarMoeda(entrada.custoUnitario)}</td>
                              <td className="num-col">{entrada.custoUnitario === null ? '—' : formatarMoeda(entrada.custoUnitario * entrada.quantidade)}</td>
                              <td>
                                {entrada.notaFiscal ? <span className="mono">NF {entrada.notaFiscal}</span> : <span className="hint">sem NF</span>}
                                {entrada.fornecedor ? <div className="hint">{entrada.fornecedor}</div> : null}
                                {entrada.observacoes ? <div className="hint">{entrada.observacoes}</div> : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="painel">
            <div className="filtros">
              <Campo label="Buscar" htmlFor="fe-busca">
                <div style={{ position: 'relative' }}>
                  <Icone nome="lupa" tamanho={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)' }} />
                  <input
                    id="fe-busca"
                    className="busca"
                    placeholder="Nome, CA ou fornecedor"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    style={{ paddingLeft: 30 }}
                  />
                </div>
              </Campo>
              <Campo label="Categoria" htmlFor="fe-categoria">
                <select id="fe-categoria" value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
                  <option value="">Todas</option>
                  {categorias.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Campo>
              <div className="check-linha" style={{ alignSelf: 'end' }}>
                <label>
                  <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} /> Incluir inativos
                </label>
              </div>
            </div>

            {carregandoCatalogo && catalogo.length === 0 ? (
              <div className="centro-tela">
                <div className="spinner" />
                Carregando...
              </div>
            ) : catalogo.length === 0 ? (
              <div className="vazio">
                <div className="icone-vazio" aria-hidden="true">
                  <Icone nome={buscaAplicada || categoriaFiltro ? 'lupa' : 'capacete'} tamanho={22} />
                </div>
                <h4>{buscaAplicada || categoriaFiltro ? 'Nenhum EPI encontrado' : 'Nenhum EPI cadastrado'}</h4>
                <p>{buscaAplicada || categoriaFiltro ? 'Ajuste a busca ou a categoria.' : 'Cadastre o catálogo com CA e estoque para as entregas começarem.'}</p>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>EPI</th>
                      <th>CA</th>
                      <th>Validade do CA</th>
                      <th className="num-col">Estoque</th>
                      <th className="num-col">Valor unit.</th>
                      <th className="num-col">Valor em estoque</th>
                      <th>Situação</th>
                      <th aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody>
                    {catalogo.map((epi) => (
                      <tr key={epi.id} style={epi.ativo ? undefined : { opacity: 0.6 }}>
                        <td>
                          <b>{epi.nome}</b>
                          {epi.categoria ? <div className="hint">{epi.categoria}</div> : null}
                          {epi.fornecedor ? <div className="hint">{epi.fornecedor}</div> : null}
                          {epi._count?.anexos ? (
                            <div className="hint">
                              <Icone nome="anexo" tamanho={12} /> {epi._count.anexos} anexo(s)
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <span className="mono">{epi.ca}</span>
                          <div>
                            <a href={epi.urlConsultaCa} target="_blank" rel="noopener noreferrer" className="hint">
                              Consultar CA
                            </a>
                          </div>
                        </td>
                        <td>
                          {epi.validadeCa ? (
                            <span className={`pill ${PILL_VENCIMENTO[epi.situacaoCa]}`}>{formatarDataIso(epi.validadeCa)}</span>
                          ) : (
                            <span className="hint">sem validade</span>
                          )}
                          {epi.diasParaVencerCa !== null ? <div className="hint">{textoPrazo(epi.diasParaVencerCa)}</div> : null}
                        </td>
                        <td className="num-col">
                          <b style={{ color: epi.abaixoDoMinimo ? 'var(--red)' : undefined }}>{epi.estoqueAtual}</b>
                          <div className="hint">repor em {epi.pontoReposicao || '—'}</div>
                        </td>
                        <td className="num-col">{formatarMoeda(epi.custoUnitario)}</td>
                        <td className="num-col">{formatarMoeda(epi.valorEmEstoque)}</td>
                        <td>
                          {epi.abaixoDoMinimo ? <span className="pill bad">Comprar</span> : null}{' '}
                          {epi.situacaoCa === 'VENCIDO' ? <span className="pill bad">CA vencido</span> : null}
                          {!epi.abaixoDoMinimo && epi.situacaoCa !== 'VENCIDO' ? (
                            <span className={`pill ${epi.situacaoCa === 'A_VENCER' ? 'warn' : 'ok'}`}>{ROTULO_SITUACAO_VENCIMENTO[epi.situacaoCa] ?? 'OK'}</span>
                          ) : null}
                          {!epi.ativo ? <span className="pill gray">Inativo</span> : null}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void carregarDetalhe(epi.id)}>
                            Abrir
                          </button>
                          {podeEscrever ? (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => editarEpi(epi)}>
                              Editar
                            </button>
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

      {aba === 'entregas' ? (
        <>
          {podeEscrever ? (
            <div className="painel">
              <h3>Registrar entrega</h3>
              <div className="filtros">
                <Campo label="EPI" htmlFor="re-epi" obrigatorio erro={errosEntrega.epiId}>
                  <select id="re-epi" value={novaEntrega.epiId} onChange={(e) => setNovaEntrega({ ...novaEntrega, epiId: e.target.value })}>
                    <option value="">Selecione...</option>
                    {todosEpis
                      .filter((epi) => epi.ativo)
                      .map((epi) => (
                        <option key={epi.id} value={epi.id}>
                          {epi.nome} (CA {epi.ca}) — {epi.estoqueAtual} em estoque
                        </option>
                      ))}
                  </select>
                </Campo>
                <Campo label="Colaborador" htmlFor="re-colab" obrigatorio erro={errosEntrega.colaboradorId}>
                  <select id="re-colab" value={novaEntrega.colaboradorId} onChange={(e) => setNovaEntrega({ ...novaEntrega, colaboradorId: e.target.value })}>
                    <option value="">Selecione...</option>
                    {colaboradores.map((colaborador) => (
                      <option key={colaborador.id} value={colaborador.id}>
                        {colaborador.nome} — {colaborador.funcao}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Data" htmlFor="re-data" obrigatorio erro={errosEntrega.data}>
                  <input id="re-data" type="date" value={novaEntrega.data} onChange={(e) => setNovaEntrega({ ...novaEntrega, data: e.target.value })} />
                </Campo>
                <Campo label="Qtd." htmlFor="re-qtd" erro={errosEntrega.quantidade}>
                  <input id="re-qtd" type="number" min={1} className="estreito" value={novaEntrega.quantidade} onChange={(e) => setNovaEntrega({ ...novaEntrega, quantidade: e.target.value })} />
                </Campo>
                <Campo label="Motivo" htmlFor="re-motivo">
                  <select id="re-motivo" value={novaEntrega.motivo} onChange={(e) => setNovaEntrega({ ...novaEntrega, motivo: e.target.value as MotivoEntregaEpi })}>
                    {MOTIVOS_ENTREGA_EPI.map((motivo) => (
                      <option key={motivo} value={motivo}>
                        {ROTULO_MOTIVO_ENTREGA[motivo]}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
              <div className="barra-acoes">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={salvando || !novaEntrega.epiId || !novaEntrega.colaboradorId || !novaEntrega.data}
                  onClick={() => void registrarEntrega()}
                >
                  {salvando ? 'Registrando...' : 'Registrar entrega'}
                </button>
                {!novaEntrega.epiId || !novaEntrega.colaboradorId || !novaEntrega.data ? <span className="hint">Escolha EPI, colaborador e data.</span> : null}
                {novaEntrega.colaboradorId ? (
                  <Link className="btn btn-ghost btn-sm" to={`/colaboradores/${novaEntrega.colaboradorId}/ficha-epi`}>
                    <Icone nome="documento" /> Ficha de EPI deste colaborador
                  </Link>
                ) : null}
              </div>
              <p className="hint">
                A próxima troca é calculada pela vida útil do EPI. Depois de registrar, colete a assinatura do trabalhador
                na linha da entrega (botão “Assinar”).
              </p>
            </div>
          ) : null}

          <div className="painel">
            <h3>Histórico de entregas</h3>
            <p className="hint">
              Reconhecimento facial, íris ou digital depende de leitor biométrico ou serviço dedicado, ainda não integrado.
              A evidência adotada é a assinatura feita na tela, carimbada (hash do conteúdo + signatário + momento) — trocar a
              imagem ou a entrega invalida o carimbo.
            </p>
            {carregando && entregas.length === 0 ? (
              <div className="centro-tela">
                <div className="spinner" />
                Carregando...
              </div>
            ) : entregas.length === 0 ? (
              <p className="hint">Nenhuma entrega registrada.</p>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Colaborador</th>
                      <th>EPI</th>
                      <th className="num-col">Qtd.</th>
                      <th>Motivo</th>
                      <th>Próxima troca</th>
                      <th>Assinatura</th>
                      {podeEscrever ? <th aria-label="Ações" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {entregas.map((entrega) => {
                      const trocaVencida = Boolean(entrega.validadeTroca && entrega.validadeTroca.slice(0, 10) < hojeIso());
                      return (
                        <Fragment key={entrega.id}>
                          <tr>
                            <td>{formatarDataIso(entrega.data)}</td>
                            <td>
                              <b>{entrega.colaborador?.nome}</b>
                              <div className="hint">{entrega.colaborador?.funcao}</div>
                              {entrega.colaborador ? (
                                <Link className="hint" to={`/colaboradores/${entrega.colaborador.id}/ficha-epi`}>
                                  Ficha de EPI
                                </Link>
                              ) : null}
                            </td>
                            <td>
                              {entrega.epi?.nome} <span className="mono hint">CA {entrega.epi?.ca}</span>
                            </td>
                            <td className="num-col">{entrega.quantidade}</td>
                            <td>{entrega.rotuloMotivo}</td>
                            <td>
                              {entrega.validadeTroca ? (
                                <span className={`pill ${trocaVencida ? 'bad' : 'gray'}`}>{formatarDataIso(entrega.validadeTroca)}</span>
                              ) : (
                                <span className="hint">por desgaste</span>
                              )}
                            </td>
                            <td>
                              {entrega.assinaturaEm ? (
                                <>
                                  <span className="pill ok">Assinado</span>
                                  <div className="hint">assinado em {formatarDataHora(entrega.assinaturaEm)}</div>
                                  {entrega.assinaturaHash ? (
                                    <div className="carimbo" title={entrega.assinaturaHash}>
                                      carimbo {entrega.assinaturaHash.slice(0, 12)}…
                                    </div>
                                  ) : null}
                                </>
                              ) : podeEscrever ? (
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  onClick={() => setAssinandoId(assinandoId === entrega.id ? null : entrega.id)}
                                >
                                  Assinar
                                </button>
                              ) : (
                                <span className="pill warn">Sem assinatura</span>
                              )}
                            </td>
                            {podeEscrever ? (
                              <td>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void estornar(entrega)}>
                                  Estornar
                                </button>
                              </td>
                            ) : null}
                          </tr>
                          {assinandoId === entrega.id ? (
                            <tr key={`${entrega.id}-assinatura`}>
                              <td colSpan={podeEscrever ? 8 : 7}>
                                <AssinaturaCanvas
                                  rotulo={`${entrega.colaborador?.nome ?? 'Trabalhador'}: assine para confirmar o recebimento de ${entrega.quantidade} × ${entrega.epi?.nome ?? 'EPI'}`}
                                  enviando={enviandoAssinatura}
                                  aoCancelar={() => setAssinandoId(null)}
                                  aoConfirmar={(arquivo) => assinarEntrega(entrega.id, arquivo)}
                                />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      {aba === 'trocas' ? (
        <>
          <div className="painel">
            <h3>Trocas por vida útil</h3>
            <p className="desc">Última entrega de cada colaborador × EPI cuja vida útil venceu ou vence nos próximos 30 dias.</p>
            <div className="filtros">
              <Campo label="Cliente" htmlFor="ft-cliente">
                <select id="ft-cliente" value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)}>
                  <option value="">Todos</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nomeFantasia}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            {trocas === null ? (
              <div className="centro-tela">
                <div className="spinner" />
                Carregando...
              </div>
            ) : trocas.length === 0 ? (
              <div className="vazio">
                <div className="icone-vazio" aria-hidden="true">
                  <Icone nome="ok" tamanho={22} />
                </div>
                <h4>Nenhuma troca pendente</h4>
                <p>Só entram aqui EPIs com vida útil cadastrada.</p>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Colaborador</th>
                      <th>EPI</th>
                      <th>Entregue em</th>
                      <th>Troca</th>
                      <th>Prazo</th>
                      {podeEscrever ? <th aria-label="Ações" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {trocas.map((troca) => (
                      <tr key={troca.id} style={troca.vencida ? { background: 'var(--red-light)' } : undefined}>
                        <td>
                          <b>{troca.colaborador.nome}</b>
                          <div className="hint">{troca.colaborador.funcao}</div>
                          <Link className="hint" to={`/colaboradores/${troca.colaborador.id}/ficha-epi`}>
                            Ficha de EPI
                          </Link>
                        </td>
                        <td>
                          {troca.epi.nome} <span className="mono hint">CA {troca.epi.ca}</span>
                        </td>
                        <td>{formatarDataIso(troca.data)}</td>
                        <td>
                          <span className={`pill ${troca.vencida ? 'bad' : 'warn'}`}>{formatarDataIso(troca.validadeTroca)}</span>
                        </td>
                        <td style={{ color: troca.vencida ? 'var(--red)' : undefined, fontWeight: troca.vencida ? 600 : undefined }}>
                          {troca.diasParaTroca === null
                            ? '—'
                            : troca.vencida
                              ? `vencida há ${Math.abs(troca.diasParaTroca)} dia(s)`
                              : `troca em ${troca.diasParaTroca} dia(s)`}
                        </td>
                        {podeEscrever ? (
                          <td>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => prepararTroca(troca)}>
                              Registrar troca
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

          <div className="painel">
            <h3>CA vencido ou a vencer (30 dias)</h3>
            {episCaAlerta.length === 0 ? (
              <p className="hint">Nenhum EPI ativo com CA vencido ou a vencer.</p>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>EPI</th>
                      <th>CA</th>
                      <th>Validade</th>
                      <th>Prazo</th>
                      <th className="num-col">Estoque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {episCaAlerta.map((epi) => (
                      <tr key={epi.id}>
                        <td>
                          <b>{epi.nome}</b>
                          {epi.fornecedor ? <div className="hint">{epi.fornecedor}</div> : null}
                        </td>
                        <td>
                          <span className="mono">{epi.ca}</span>{' '}
                          <a href={epi.urlConsultaCa} target="_blank" rel="noopener noreferrer" className="hint">
                            Consultar CA
                          </a>
                        </td>
                        <td>
                          <span className={`pill ${PILL_VENCIMENTO[epi.situacaoCa]}`}>{formatarDataIso(epi.validadeCa)}</span>
                        </td>
                        <td style={{ color: epi.situacaoCa === 'VENCIDO' ? 'var(--red)' : undefined }}>{textoPrazo(epi.diasParaVencerCa)}</td>
                        <td className="num-col">{epi.estoqueAtual}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      {aba === 'consumo' ? (
        <PainelConsumo
          consumo={consumo}
          carregando={carregandoConsumo}
          meses={meses}
          setMeses={setMeses}
          clientes={clientes}
          clienteId={clienteFiltro}
          setClienteId={setClienteFiltro}
          soMaiores={soMaiores}
          setSoMaiores={setSoMaiores}
        />
      ) : null}
    </>
  );
}

interface PainelConsumoProps {
  consumo: ConsumoApi | null;
  carregando: boolean;
  meses: number;
  setMeses: (m: number) => void;
  clientes: Array<{ id: string; nomeFantasia: string }>;
  clienteId: string;
  setClienteId: (id: string) => void;
  soMaiores: boolean;
  setSoMaiores: (v: boolean) => void;
}

/** Dashboard de consumo e estoque em 3/6/9/12 meses, com destaque dos maiores consumos. */
function PainelConsumo({ consumo, carregando, meses, setMeses, clientes, clienteId, setClienteId, soMaiores, setSoMaiores }: PainelConsumoProps) {
  const serie = useMemo(() => {
    const porChave = new Map((consumo?.porMes ?? []).map((m) => [m.mes, m]));
    return mesesDoPeriodo(meses).map((mes) => porChave.get(mes) ?? { mes, entregues: 0, entradas: 0, custoEntregue: 0 });
  }, [consumo, meses]);
  const maximo = Math.max(1, ...serie.map((m) => Math.max(m.entregues, m.entradas)));
  const ranking = (consumo?.ranking ?? []).filter((r) => !soMaiores || r.destaque);
  const abaixo = (consumo?.estoque ?? []).filter((e) => e.pontoReposicao > 0 && e.estoqueAtual <= e.pontoReposicao);
  const valorEstoque = (consumo?.estoque ?? []).reduce((soma, e) => soma + (e.valorEmEstoque ?? 0), 0);

  return (
    <>
      <div className="painel">
        <h3>Consumo e estoque</h3>
        <div className="filtros">
          <Campo label="Período" htmlFor="fc-meses">
            <select id="fc-meses" value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
              {PERIODOS_CONSUMO.map((m) => (
                <option key={m} value={m}>
                  Últimos {m} meses
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Cliente" htmlFor="fc-cliente" ajuda="Filtra as entregas; entradas e estoque são gerais.">
            <select id="fc-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        {carregando && !consumo ? (
          <div className="centro-tela">
            <div className="spinner" />
            Carregando...
          </div>
        ) : consumo ? (
          <div className="stat-grid">
            <div className="stat">
              <b>{consumo.totalEntregue}</b>
              <span>unidades entregues</span>
            </div>
            <div className="stat">
              <b>{Math.round((consumo.totalEntregue / meses) * 10) / 10}</b>
              <span>média mensal</span>
            </div>
            <div className="stat">
              <b>{formatarMoeda(consumo.custoTotal)}</b>
              <span>custo das entregas</span>
            </div>
            <div className="stat">
              <b>{formatarMoeda(valorEstoque)}</b>
              <span>valor em estoque</span>
            </div>
            <div className="stat">
              <b style={{ color: abaixo.length > 0 ? 'var(--red)' : undefined }}>{abaixo.length}</b>
              <span>no ponto de reposição</span>
            </div>
          </div>
        ) : null}
      </div>

      {consumo ? (
        <>
          <div className="painel">
            <h3>Movimento mensal</h3>
            <p className="hint">
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--primary)' }} /> entregues ·{' '}
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--blue)' }} /> entradas (compras)
            </p>
            <div className="barras-bbs">
              {serie.map((m) => (
                <div key={m.mes} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div className="barra-bbs">
                    <div className="barra-rotulo">{rotuloMes(m.mes)} · entregues</div>
                    <div className="barra-trilho">
                      <span style={{ width: `${Math.round((m.entregues / maximo) * 100)}%`, background: 'var(--primary)' }} />
                    </div>
                    <div className="barra-valor">
                      {m.entregues}
                      {m.custoEntregue > 0 ? <small>{formatarMoeda(m.custoEntregue)}</small> : null}
                    </div>
                  </div>
                  <div className="barra-bbs">
                    <div className="barra-rotulo" style={{ fontWeight: 500 }}>
                      entradas
                    </div>
                    <div className="barra-trilho">
                      <span style={{ width: `${Math.round((m.entradas / maximo) * 100)}%`, background: 'var(--blue)' }} />
                    </div>
                    <div className="barra-valor">{m.entradas}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="painel">
            <div className="barra-acoes" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>Ranking de consumo</h3>
              <div className="check-linha">
                <label>
                  <input type="checkbox" checked={soMaiores} onChange={(e) => setSoMaiores(e.target.checked)} /> Só maiores consumos
                </label>
              </div>
            </div>
            {ranking.length === 0 ? (
              <p className="hint">Nenhuma entrega no período.</p>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="num-col">#</th>
                      <th>EPI</th>
                      <th className="num-col">Entregues</th>
                      <th className="num-col">% do total</th>
                      <th className="num-col">Média mensal</th>
                      <th className="num-col">Cobertura do estoque</th>
                      <th className="num-col">Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((r, indice) => (
                      <tr key={r.epiId} style={r.destaque ? { background: 'var(--orange-light)' } : undefined}>
                        <td className="num-col">{indice + 1}</td>
                        <td>
                          <b>{r.nome}</b> <span className="mono hint">CA {r.ca}</span>
                          {r.destaque ? (
                            <>
                              {' '}
                              <span className="pill orange">Maior consumo</span>
                            </>
                          ) : null}
                          <div className="hint">
                            {Object.entries(r.porMotivo)
                              .map(([motivo, qtd]) => `${ROTULO_MOTIVO_ENTREGA[motivo as MotivoEntregaEpi] ?? motivo}: ${qtd}`)
                              .join(' · ')}
                          </div>
                        </td>
                        <td className="num-col">
                          <b>{r.entregues}</b>
                        </td>
                        <td className="num-col">{r.percentual}%</td>
                        <td className="num-col">{r.mediaMensal}</td>
                        <td className="num-col">
                          {r.cobertura === null ? (
                            '—'
                          ) : (
                            <span className={`pill ${r.cobertura < 1 ? 'bad' : r.cobertura < 2 ? 'warn' : 'ok'}`}>{r.cobertura} mês(es)</span>
                          )}
                        </td>
                        <td className="num-col">{formatarMoeda(r.custo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="hint">Cobertura = estoque atual ÷ média mensal de consumo. Abaixo de 1 mês, programe a compra.</p>
          </div>

          {abaixo.length > 0 ? (
            <div className="painel">
              <h3>Alerta de compra</h3>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>EPI</th>
                      <th className="num-col">Estoque</th>
                      <th className="num-col">Ponto de reposição</th>
                      <th className="num-col">Valor em estoque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abaixo.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <b>{e.nome}</b> <span className="mono hint">CA {e.ca}</span> <span className="pill bad">Comprar</span>
                        </td>
                        <td className="num-col">{e.estoqueAtual}</td>
                        <td className="num-col">{e.pontoReposicao}</td>
                        <td className="num-col">{formatarMoeda(e.valorEmEstoque)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
