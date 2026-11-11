import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CATALOGO_DOCUMENTOS,
  CONDICOES_ASPECTO,
  ESCALA_ASPECTO,
  ROTULO_CONDICAO_ASPECTO,
  ROTULO_OCORRENCIA_AMBIENTAL,
  ROTULO_PROBABILIDADE_ASPECTO,
  ROTULO_SEVERIDADE_ASPECTO,
  ROTULO_TIPO_DOCUMENTO,
  SIGNIFICANCIA_MINIMA_SIGNIFICATIVO,
  TIPOS_DOCUMENTO_AMBIENTAL,
  TIPOS_OCORRENCIA_AMBIENTAL,
  aspectoSignificativo,
  significanciaAmbiental,
  type CondicaoAspecto,
  type TipoDocumento,
  type TipoOcorrenciaAmbiental,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import { useSessao } from '../lib/sessao';

interface OcorrenciaApi {
  id: string;
  tipo: TipoOcorrenciaAmbiental;
  rotuloTipo: string;
  data: string;
  descricao: string;
  grauRisco: string;
  volumeEstimado: string | null;
  contida: boolean;
  acaoImediata: string | null;
  responsavel: string;
  cliente?: { id: string; nomeFantasia: string };
  area?: { id: string; nome: string; codigo: string } | null;
}

interface LeituraApi {
  id: string;
  competencia: string;
  aguaM3: string | null;
  energiaKwh: string | null;
  residuosKg: string | null;
  residuosRecicladosKg: string | null;
  emissoesTco2: string | null;
  cliente?: { id: string; nomeFantasia: string };
}

interface ResumoAmbiental {
  ultimos12Meses: number;
  naoContidas: number;
  grauI: number;
  nota: number | null;
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

interface AspectoApi {
  id: string;
  clienteId: string;
  areaId: string | null;
  atividade: string;
  aspecto: string;
  impacto: string;
  condicao: CondicaoAspecto;
  rotuloCondicao: string;
  severidade: number;
  probabilidade: number;
  significancia: number;
  significativo: boolean;
  controles: string | null;
  requisitoLegal: string | null;
  responsavel: string | null;
  cliente?: { id: string; nomeFantasia: string };
  area?: OpcaoArea | null;
}

type SituacaoVencimentoApi = 'VIGENTE' | 'A_VENCER' | 'VENCIDO' | 'SEM_VALIDADE';
type SituacaoDocumentoAmbiental = SituacaoVencimentoApi | 'AUSENTE';

interface DocumentoApi {
  id: string;
  tipo: TipoDocumento;
  titulo: string;
  versao: number;
  vigente: boolean;
  situacao: 'ATIVO' | 'SUBSTITUIDO' | 'CANCELADO';
  dataEmissao: string;
  validade: string | null;
  arquivoUrl: string | null;
  responsavelNome: string | null;
  situacaoVencimento: SituacaoVencimentoApi;
  diasParaVencer: number | null;
}

interface DashboardApi {
  periodo: { inicio: string; fim: string; meses: number };
  ocorrenciasPorMes: Array<{ competencia: string; total: number; contidas: number; grauI: number }>;
  esgPorMes: Array<{
    competencia: string;
    aguaM3: number | null;
    energiaKwh: number | null;
    residuosKg: number | null;
    residuosRecicladosKg: number | null;
    percentualReciclagem: number | null;
    emissoesTco2: number | null;
  }>;
  aspectos: { total: number; significativos: number; porCondicao: Record<CondicaoAspecto, number> };
  documentos: Array<{
    tipo: TipoDocumento;
    rotulo: string;
    situacao: SituacaoDocumentoAmbiental;
    documentoId: string | null;
    titulo: string | null;
    versao: number | null;
    validade: string | null;
    arquivoUrl: string | null;
  }>;
  resumoDocumentos: Record<SituacaoDocumentoAmbiental, number>;
}

type Aba = 'ocorrencias' | 'esg' | 'aspectos' | 'documentos' | 'dashboard';

const OCORRENCIA_VAZIA = {
  clienteId: '',
  areaId: '',
  tipo: 'DERRAMAMENTO' as TipoOcorrenciaAmbiental,
  data: '',
  descricao: '',
  grauRisco: 'II',
  volumeEstimado: '',
  contida: false,
  acaoImediata: '',
  responsavel: '',
};

const LEITURA_VAZIA = { clienteId: '', competencia: '', aguaM3: '', energiaKwh: '', residuosKg: '', residuosRecicladosKg: '', emissoesTco2: '' };

const ASPECTO_VAZIO = {
  clienteId: '',
  areaId: '',
  atividade: '',
  aspecto: '',
  impacto: '',
  condicao: 'NORMAL' as CondicaoAspecto,
  severidade: '3',
  probabilidade: '3',
  controles: '',
  requisitoLegal: '',
  responsavel: '',
};

const DOCUMENTO_VAZIO = { titulo: '', numero: '', dataEmissao: '', validade: '', responsavelNome: '' };

const PILL_SITUACAO_DOCUMENTO: Record<SituacaoDocumentoAmbiental, { classe: string; rotulo: string }> = {
  VIGENTE: { classe: 'ok', rotulo: 'Vigente' },
  A_VENCER: { classe: 'warn', rotulo: 'A vencer (30 d)' },
  VENCIDO: { classe: 'bad', rotulo: 'Vencido' },
  SEM_VALIDADE: { classe: 'info', rotulo: 'Sem prazo' },
  AUSENTE: { classe: 'gray', rotulo: 'Ausente' },
};

const PILL_CONDICAO: Record<CondicaoAspecto, string> = { NORMAL: 'info', ANORMAL: 'warn', EMERGENCIA: 'bad' };

const DEFINICAO_POR_TIPO = new Map(CATALOGO_DOCUMENTOS.map((definicao) => [definicao.tipo, definicao]));

function numero(valor: string | null): string {
  return valor === null ? '—' : Number(valor).toLocaleString('pt-BR');
}

function numeroOuTraco(valor: number | null, casas = 0): string {
  return valor === null ? '—' : valor.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

/** "2026-03" -> "03/2026". */
function rotuloMes(competencia: string): string {
  const [ano, mes] = competencia.split('-');
  return `${mes}/${ano}`;
}

function hojeIso(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
}

/** Soma meses a uma data ISO (AAAA-MM-DD) mantendo o formato. */
function somarMeses(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  if (!ano || !mes || !dia) return '';
  const data = new Date(ano, mes - 1 + meses, dia);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

/** Cor da pill de significância: a régua é a mesma do servidor. */
function classeSignificancia(significancia: number): string {
  if (aspectoSignificativo(significancia)) return 'bad';
  if (significancia >= 6) return 'warn';
  return 'ok';
}

function primeiroErro(campos: Record<string, string[]>): Record<string, string> {
  return Object.fromEntries(Object.entries(campos).map(([campo, mensagens]) => [campo, mensagens[0] ?? '']));
}

/** Áreas do cliente — reutilizado por ocorrência, aspecto (filtro e formulário). */
function useAreas(clienteId: string): OpcaoArea[] {
  const [areas, setAreas] = useState<OpcaoArea[]>([]);
  useEffect(() => {
    if (!clienteId) {
      setAreas([]);
      return;
    }
    let ativo = true;
    void api
      .get<{ itens: OpcaoArea[] }>(`/areas?clienteId=${clienteId}&porPagina=200`)
      .then((resposta) => {
        if (ativo) setAreas(resposta.itens);
      })
      .catch(() => {
        if (ativo) setAreas([]);
      });
    return () => {
      ativo = false;
    };
  }, [clienteId]);
  return areas;
}

interface LinhaBarra {
  chave: string;
  rotulo: string;
  valor: number;
  texto?: string;
  detalhe?: string;
}

/** Barras horizontais simples em CSS (mesmas classes do painel de absenteísmo). */
function Barras({ linhas, cor }: { linhas: LinhaBarra[]; cor: string }) {
  const maximo = Math.max(1, ...linhas.map((linha) => linha.valor));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {linhas.map((linha) => (
        <div key={linha.chave} className="barra-bbs">
          <div className="barra-rotulo">{linha.rotulo}</div>
          <div className="barra-trilho">
            <span style={{ width: `${Math.round((linha.valor / maximo) * 100)}%`, background: cor }} />
          </div>
          <div className="barra-valor">
            {linha.texto ?? linha.valor.toLocaleString('pt-BR')}
            {linha.detalhe ? <small>{linha.detalhe}</small> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MeioAmbientePage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('observacoes:escrever');
  const podeLerDocumentos = pode('saude:ler');
  const podeEscreverDocumentos = pode('saude:escrever');

  const [aba, setAba] = useState<Aba>('ocorrencias');
  const [carregando, setCarregando] = useState(true);
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaApi[]>([]);
  const [leituras, setLeituras] = useState<LeituraApi[]>([]);
  const [resumo, setResumo] = useState<ResumoAmbiental | null>(null);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);

  const [nova, setNova] = useState(OCORRENCIA_VAZIA);
  const [leitura, setLeitura] = useState(LEITURA_VAZIA);
  const [salvando, setSalvando] = useState(false);
  const areas = useAreas(nova.clienteId);

  /* ------------------------------------------------------------ aspectos --- */
  const [aspectos, setAspectos] = useState<AspectoApi[]>([]);
  const [carregandoAspectos, setCarregandoAspectos] = useState(false);
  const [filtroAsp, setFiltroAsp] = useState({ clienteId: '', areaId: '', somenteSignificativos: false, busca: '' });
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [formAsp, setFormAsp] = useState(ASPECTO_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [errosAsp, setErrosAsp] = useState<Record<string, string>>({});
  const [salvandoAsp, setSalvandoAsp] = useState(false);
  const areasFiltroAsp = useAreas(filtroAsp.clienteId);
  const areasFormAsp = useAreas(formAsp.clienteId);

  /* ---------------------------------------------------------- documentos --- */
  const [docClienteId, setDocClienteId] = useState('');
  const [documentos, setDocumentos] = useState<DocumentoApi[]>([]);
  const [carregandoDocs, setCarregandoDocs] = useState(false);
  const [cadastrandoTipo, setCadastrandoTipo] = useState<TipoDocumento | null>(null);
  const [formDoc, setFormDoc] = useState(DOCUMENTO_VAZIO);
  const [arquivoDoc, setArquivoDoc] = useState<File | null>(null);
  const [errosDoc, setErrosDoc] = useState<Record<string, string>>({});
  const [salvandoDoc, setSalvandoDoc] = useState(false);
  const [anexandoId, setAnexandoId] = useState<string | null>(null);

  /* ----------------------------------------------------------- dashboard --- */
  const [dashClienteId, setDashClienteId] = useState('');
  const [dashMeses, setDashMeses] = useState<'6' | '12' | '24'>('12');
  const [dashboard, setDashboard] = useState<DashboardApi | null>(null);
  const [carregandoDash, setCarregandoDash] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [listaOcorrencias, cards, listaLeituras] = await Promise.all([
        api.get<OcorrenciaApi[]>('/meio-ambiente/ocorrencias'),
        api.get<ResumoAmbiental>('/meio-ambiente/resumo'),
        api.get<LeituraApi[]>('/meio-ambiente/indicadores'),
      ]);
      setOcorrencias(listaOcorrencias);
      setResumo(cards);
      setLeituras(listaLeituras);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [mostrar]);

  useEffect(() => {
    void api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
    void carregar();
  }, [carregar]);

  const carregarAspectos = useCallback(async () => {
    setCarregandoAspectos(true);
    try {
      const parametros = new URLSearchParams();
      if (filtroAsp.clienteId) parametros.set('clienteId', filtroAsp.clienteId);
      if (filtroAsp.areaId) parametros.set('areaId', filtroAsp.areaId);
      if (filtroAsp.somenteSignificativos) parametros.set('significativo', 'true');
      if (buscaAplicada) parametros.set('busca', buscaAplicada);
      const consulta = parametros.toString();
      setAspectos(await api.get<AspectoApi[]>(`/meio-ambiente/aspectos${consulta ? `?${consulta}` : ''}`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar aspectos.', 'erro');
    } finally {
      setCarregandoAspectos(false);
    }
  }, [filtroAsp.clienteId, filtroAsp.areaId, filtroAsp.somenteSignificativos, buscaAplicada, mostrar]);

  useEffect(() => {
    if (aba === 'aspectos') void carregarAspectos();
  }, [aba, carregarAspectos]);

  // Busca com pequeno atraso para não consultar a cada tecla.
  useEffect(() => {
    const temporizador = setTimeout(() => setBuscaAplicada(filtroAsp.busca.trim()), 350);
    return () => clearTimeout(temporizador);
  }, [filtroAsp.busca]);

  const carregarDocumentos = useCallback(async () => {
    if (!docClienteId) {
      setDocumentos([]);
      return;
    }
    setCarregandoDocs(true);
    try {
      const resposta = await api.get<{ itens: DocumentoApi[] }>(
        `/documentos?clienteId=${docClienteId}&situacao=ATIVO&porPagina=200`,
      );
      setDocumentos(resposta.itens);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar documentos.', 'erro');
    } finally {
      setCarregandoDocs(false);
    }
  }, [docClienteId, mostrar]);

  useEffect(() => {
    if (aba === 'documentos' && podeLerDocumentos) void carregarDocumentos();
  }, [aba, podeLerDocumentos, carregarDocumentos]);

  const carregarDashboard = useCallback(async () => {
    setCarregandoDash(true);
    try {
      const parametros = new URLSearchParams({ meses: dashMeses });
      if (dashClienteId) parametros.set('clienteId', dashClienteId);
      setDashboard(await api.get<DashboardApi>(`/meio-ambiente/dashboard?${parametros.toString()}`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar o dashboard.', 'erro');
    } finally {
      setCarregandoDash(false);
    }
  }, [dashClienteId, dashMeses, mostrar]);

  useEffect(() => {
    if (aba === 'dashboard') void carregarDashboard();
  }, [aba, carregarDashboard]);

  /** Um documento vigente por tipo ambiental: validade mais distante, depois emissão mais recente. */
  const documentoPorTipo = useMemo(() => {
    const mapa = new Map<TipoDocumento, DocumentoApi>();
    const vigentes = documentos
      .filter((documento) => documento.vigente && documento.situacao === 'ATIVO')
      .sort((a, b) => {
        if (a.validade && b.validade) return b.validade.localeCompare(a.validade);
        if (a.validade) return -1;
        if (b.validade) return 1;
        return b.dataEmissao.localeCompare(a.dataEmissao);
      });
    for (const documento of vigentes) {
      if (!mapa.has(documento.tipo)) mapa.set(documento.tipo, documento);
    }
    return mapa;
  }, [documentos]);

  const significanciaAtual = significanciaAmbiental(Number(formAsp.severidade), Number(formAsp.probabilidade));
  const significativoAtual = aspectoSignificativo(significanciaAtual);

  async function registrarOcorrencia() {
    setSalvando(true);
    try {
      await api.post('/meio-ambiente/ocorrencias', {
        ...nova,
        areaId: nova.areaId || undefined,
        volumeEstimado: nova.volumeEstimado || undefined,
        acaoImediata: nova.acaoImediata || undefined,
      });
      mostrar(
        nova.grauRisco === 'I'
          ? 'Ocorrência registrada — matriz de comunicação acionada (Meio Ambiente → Diretoria).'
          : 'Ocorrência registrada.',
        'sucesso',
      );
      setNova(OCORRENCIA_VAZIA);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao registrar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarLeitura() {
    setSalvando(true);
    try {
      await api.post('/meio-ambiente/indicadores', {
        ...leitura,
        aguaM3: leitura.aguaM3 || undefined,
        energiaKwh: leitura.energiaKwh || undefined,
        residuosKg: leitura.residuosKg || undefined,
        residuosRecicladosKg: leitura.residuosRecicladosKg || undefined,
        emissoesTco2: leitura.emissoesTco2 || undefined,
      });
      mostrar('Leitura do mês salva.', 'sucesso');
      setLeitura(LEITURA_VAZIA);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao salvar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  /* ------------------------------------------------------------ aspectos --- */

  function iniciarEdicao(aspecto: AspectoApi) {
    setEditandoId(aspecto.id);
    setErrosAsp({});
    setFormAsp({
      clienteId: aspecto.clienteId,
      areaId: aspecto.areaId ?? '',
      atividade: aspecto.atividade,
      aspecto: aspecto.aspecto,
      impacto: aspecto.impacto,
      condicao: aspecto.condicao,
      severidade: String(aspecto.severidade),
      probabilidade: String(aspecto.probabilidade),
      controles: aspecto.controles ?? '',
      requisitoLegal: aspecto.requisitoLegal ?? '',
      responsavel: aspecto.responsavel ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setFormAsp(ASPECTO_VAZIO);
    setErrosAsp({});
  }

  async function salvarAspecto() {
    setSalvandoAsp(true);
    setErrosAsp({});
    try {
      const corpo = {
        ...formAsp,
        areaId: formAsp.areaId || null,
        severidade: Number(formAsp.severidade),
        probabilidade: Number(formAsp.probabilidade),
        controles: formAsp.controles || null,
        requisitoLegal: formAsp.requisitoLegal || null,
        responsavel: formAsp.responsavel || null,
      };
      if (editandoId) {
        await api.put(`/meio-ambiente/aspectos/${editandoId}`, corpo);
        mostrar('Aspecto atualizado.', 'sucesso');
      } else {
        await api.post('/meio-ambiente/aspectos', corpo);
        mostrar(
          significativoAtual
            ? 'Aspecto registrado como SIGNIFICATIVO — exige controle operacional.'
            : 'Aspecto registrado.',
          'sucesso',
        );
      }
      cancelarEdicao();
      void carregarAspectos();
    } catch (erro) {
      if (erro instanceof ErroApi) {
        setErrosAsp(primeiroErro(erro.campos));
        mostrar(erro.mensagemAmigavel(), 'erro');
      } else {
        mostrar('Falha ao salvar o aspecto.', 'erro');
      }
    } finally {
      setSalvandoAsp(false);
    }
  }

  async function excluirAspecto(aspecto: AspectoApi) {
    if (!window.confirm(`Excluir o aspecto "${aspecto.aspecto}" da atividade "${aspecto.atividade}"?`)) return;
    try {
      await api.delete(`/meio-ambiente/aspectos/${aspecto.id}`);
      mostrar('Aspecto excluído.', 'sucesso');
      if (editandoId === aspecto.id) cancelarEdicao();
      void carregarAspectos();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao excluir.', 'erro');
    }
  }

  /* ---------------------------------------------------------- documentos --- */

  function abrirCadastro(tipo: TipoDocumento) {
    const definicao = DEFINICAO_POR_TIPO.get(tipo);
    const emissao = hojeIso();
    const cliente = clientes.find((item) => item.id === docClienteId);
    setCadastrandoTipo(tipo);
    setErrosDoc({});
    setArquivoDoc(null);
    setFormDoc({
      titulo: cliente ? `${ROTULO_TIPO_DOCUMENTO[tipo]} — ${cliente.nomeFantasia}` : ROTULO_TIPO_DOCUMENTO[tipo],
      numero: '',
      dataEmissao: emissao,
      validade: definicao?.validadeMeses ? somarMeses(emissao, definicao.validadeMeses) : '',
      responsavelNome: '',
    });
  }

  function alterarEmissao(emissao: string) {
    const definicao = cadastrandoTipo ? DEFINICAO_POR_TIPO.get(cadastrandoTipo) : undefined;
    setFormDoc((atual) => ({
      ...atual,
      dataEmissao: emissao,
      // Sugere a validade pelo prazo típico do catálogo; o usuário pode ajustar.
      validade: definicao?.validadeMeses && emissao ? somarMeses(emissao, definicao.validadeMeses) : atual.validade,
    }));
  }

  async function cadastrarDocumento() {
    if (!cadastrandoTipo) return;
    setSalvandoDoc(true);
    setErrosDoc({});
    try {
      const criado = await api.post<{ id: string }>('/documentos', {
        clienteId: docClienteId,
        abrangencia: 'CLIENTE',
        tipo: cadastrandoTipo,
        titulo: formDoc.titulo,
        numero: formDoc.numero || null,
        dataEmissao: formDoc.dataEmissao,
        validade: formDoc.validade || null,
        responsavelNome: formDoc.responsavelNome || null,
        situacao: 'ATIVO',
      });
      if (arquivoDoc) {
        try {
          await api.upload(`/documentos/${criado.id}/arquivo`, arquivoDoc);
          mostrar('Documento cadastrado e arquivo anexado.', 'sucesso');
        } catch (erroUpload) {
          // O documento já existe: avisa e deixa anexar de novo pela lista.
          mostrar(
            `Documento cadastrado, mas o arquivo não subiu: ${
              erroUpload instanceof ErroApi ? erroUpload.mensagemAmigavel() : 'falha no envio'
            }. Use "Anexar" na lista.`,
            'erro',
          );
        }
      } else {
        mostrar('Documento cadastrado. Anexe o arquivo quando tiver a versão assinada.', 'sucesso');
      }
      setCadastrandoTipo(null);
      setFormDoc(DOCUMENTO_VAZIO);
      setArquivoDoc(null);
      void carregarDocumentos();
    } catch (erro) {
      if (erro instanceof ErroApi) {
        setErrosDoc(primeiroErro(erro.campos));
        mostrar(erro.mensagemAmigavel(), 'erro');
      } else {
        mostrar('Falha ao cadastrar o documento.', 'erro');
      }
    } finally {
      setSalvandoDoc(false);
    }
  }

  async function anexarArquivo(documentoId: string, arquivo: File | undefined) {
    if (!arquivo) return;
    setAnexandoId(documentoId);
    try {
      await api.upload(`/documentos/${documentoId}/arquivo`, arquivo);
      mostrar('Arquivo anexado.', 'sucesso');
      void carregarDocumentos();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao anexar o arquivo.', 'erro');
    } finally {
      setAnexandoId(null);
    }
  }

  const definicaoCadastro = cadastrandoTipo ? DEFINICAO_POR_TIPO.get(cadastrandoTipo) : undefined;

  /* ------------------------------------------------------------ dashboard --- */

  const totaisDashboard = useMemo(() => {
    if (!dashboard) return null;
    const ocorrencias = dashboard.ocorrenciasPorMes.reduce((soma, mes) => soma + mes.total, 0);
    const grauI = dashboard.ocorrenciasPorMes.reduce((soma, mes) => soma + mes.grauI, 0);
    const residuos = dashboard.esgPorMes.reduce((soma, mes) => soma + (mes.residuosKg ?? 0), 0);
    const reciclados = dashboard.esgPorMes.reduce((soma, mes) => soma + (mes.residuosRecicladosKg ?? 0), 0);
    const pendencias =
      dashboard.resumoDocumentos.VENCIDO + dashboard.resumoDocumentos.A_VENCER + dashboard.resumoDocumentos.AUSENTE;
    return {
      ocorrencias,
      grauI,
      residuos,
      taxaReciclagem: residuos > 0 ? Math.round((reciclados / residuos) * 100) : null,
      pendencias,
    };
  }, [dashboard]);

  return (
    <>
      <div className="painel">
        <h3>Meio Ambiente e ESG</h3>
        <p className="desc">
          Meta do plano diretor: <b>zero ocorrência ambiental</b>. A nota do pilar parte de 100 e desconta por
          ocorrência nos últimos 12 meses (15 pontos por não contida, 5 por contida — convenção editável). Grau I aciona
          a matriz de comunicação: Meio Ambiente no registro, Diretoria em 4 horas.
        </p>

        {resumo ? (
          <div className="stat-grid">
            <div className="stat">
              <b>{resumo.nota !== null ? resumo.nota : '—'}</b>
              <span>nota do pilar Meio Ambiente</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.ultimos12Meses > 0 ? 'var(--orange)' : 'var(--green)' }}>{resumo.ultimos12Meses}</b>
              <span>ocorrências (12 meses) · meta zero</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.naoContidas > 0 ? 'var(--red)' : undefined }}>{resumo.naoContidas}</b>
              <span>não contidas</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.grauI > 0 ? 'var(--red)' : undefined }}>{resumo.grauI}</b>
              <span>grau I (críticas)</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="abas">
        <button type="button" className={aba === 'ocorrencias' ? 'ativa' : ''} onClick={() => setAba('ocorrencias')}>
          Ocorrências ambientais
        </button>
        <button type="button" className={aba === 'esg' ? 'ativa' : ''} onClick={() => setAba('esg')}>
          Indicadores ESG mensais
        </button>
        <button type="button" className={aba === 'aspectos' ? 'ativa' : ''} onClick={() => setAba('aspectos')}>
          Aspectos e impactos
        </button>
        <button type="button" className={aba === 'documentos' ? 'ativa' : ''} onClick={() => setAba('documentos')}>
          Documentos ambientais
        </button>
        <button type="button" className={aba === 'dashboard' ? 'ativa' : ''} onClick={() => setAba('dashboard')}>
          Dashboard
        </button>
      </div>

      {aba === 'ocorrencias' ? (
        <>
          {podeEscrever ? (
            <div className="painel">
              <h3>Registrar ocorrência</h3>
              <div className="filtros">
                <Campo label="Cliente" htmlFor="oa-cliente" obrigatorio>
                  <select id="oa-cliente" value={nova.clienteId} onChange={(e) => setNova({ ...nova, clienteId: e.target.value })}>
                    <option value="">Selecione...</option>
                    {clientes.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.nomeFantasia}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Área" htmlFor="oa-area">
                  <select id="oa-area" value={nova.areaId} onChange={(e) => setNova({ ...nova, areaId: e.target.value })}>
                    <option value="">Sem área</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.codigo} — {area.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Tipo" htmlFor="oa-tipo" obrigatorio>
                  <select id="oa-tipo" value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value as TipoOcorrenciaAmbiental })}>
                    {TIPOS_OCORRENCIA_AMBIENTAL.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {ROTULO_OCORRENCIA_AMBIENTAL[tipo]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Data" htmlFor="oa-data" obrigatorio>
                  <input id="oa-data" type="date" value={nova.data} onChange={(e) => setNova({ ...nova, data: e.target.value })} />
                </Campo>
                <Campo label="Grau" htmlFor="oa-grau" obrigatorio ajuda="Grau I dispara e-mail/WhatsApp imediato.">
                  <select id="oa-grau" className="estreito" value={nova.grauRisco} onChange={(e) => setNova({ ...nova, grauRisco: e.target.value })}>
                    <option value="I">I — Crítico</option>
                    <option value="II">II — Moderado</option>
                    <option value="III">III — Baixo</option>
                  </select>
                </Campo>
                <Campo label="Volume estimado" htmlFor="oa-volume" ajuda="Ex.: 20 L, 5 kg.">
                  <input id="oa-volume" className="estreito" value={nova.volumeEstimado} onChange={(e) => setNova({ ...nova, volumeEstimado: e.target.value })} />
                </Campo>
                <Campo label="Responsável" htmlFor="oa-resp" obrigatorio>
                  <input id="oa-resp" value={nova.responsavel} onChange={(e) => setNova({ ...nova, responsavel: e.target.value })} />
                </Campo>
              </div>

              <Campo label="Descrição" htmlFor="oa-desc" obrigatorio>
                <textarea id="oa-desc" rows={2} value={nova.descricao} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} />
              </Campo>
              <Campo label="Ação imediata tomada" htmlFor="oa-acao">
                <input id="oa-acao" className="busca" value={nova.acaoImediata} onChange={(e) => setNova({ ...nova, acaoImediata: e.target.value })} />
              </Campo>
              <div className="check-linha" style={{ maxWidth: 360, marginBottom: 16 }}>
                <label>
                  <input type="checkbox" checked={nova.contida} onChange={(e) => setNova({ ...nova, contida: e.target.checked })} />
                  Ocorrência contida (sem extravasamento)
                </label>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                disabled={salvando || !nova.clienteId || !nova.data || !nova.responsavel || nova.descricao.length < 10}
                onClick={() => void registrarOcorrencia()}
              >
                {salvando ? 'Registrando...' : 'Registrar ocorrência'}
              </button>
            </div>
          ) : null}

          <div className="painel">
            {carregando ? (
              <div className="centro-tela">
                <div className="spinner" />
                Carregando...
              </div>
            ) : ocorrencias.length === 0 ? (
              <div className="vazio">
                <div className="icone-vazio" aria-hidden="true">
                  <Icone nome="ok" tamanho={22} />
                </div>
                <h4>Zero ocorrência ambiental</h4>
                <p>É exatamente a meta. O pilar pontua 100 enquanto o histórico ficar limpo.</p>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Ocorrência</th>
                      <th>Onde</th>
                      <th>Grau</th>
                      <th>Contida</th>
                      <th>Responsável</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ocorrencias.map((ocorrencia) => (
                      <tr key={ocorrencia.id}>
                        <td>{formatarDataIso(ocorrencia.data)}</td>
                        <td>
                          <b>{ocorrencia.rotuloTipo}</b>
                          {ocorrencia.volumeEstimado ? <span className="hint"> · {ocorrencia.volumeEstimado}</span> : null}
                          <div className="hint">{ocorrencia.descricao.slice(0, 90)}</div>
                        </td>
                        <td>
                          {ocorrencia.cliente?.nomeFantasia}
                          {ocorrencia.area ? <div className="hint">{ocorrencia.area.nome}</div> : null}
                        </td>
                        <td>
                          <span className={`pill ${ocorrencia.grauRisco === 'I' ? 'bad' : ocorrencia.grauRisco === 'II' ? 'warn' : 'gray'}`}>
                            Grau {ocorrencia.grauRisco}
                          </span>
                        </td>
                        <td>
                          <span className={`pill ${ocorrencia.contida ? 'ok' : 'bad'}`}>{ocorrencia.contida ? 'Contida' : 'Não contida'}</span>
                        </td>
                        <td>{ocorrencia.responsavel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      {aba === 'esg' ? (
        <>
          {podeEscrever ? (
            <div className="painel">
              <h3>Leitura do mês</h3>
              <p className="desc">Reenviar a mesma competência corrige a leitura — não duplica.</p>
              <div className="filtros">
                <Campo label="Cliente" htmlFor="le-cliente" obrigatorio>
                  <select id="le-cliente" value={leitura.clienteId} onChange={(e) => setLeitura({ ...leitura, clienteId: e.target.value })}>
                    <option value="">Selecione...</option>
                    {clientes.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.nomeFantasia}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Competência" htmlFor="le-comp" obrigatorio>
                  <input id="le-comp" type="date" value={leitura.competencia} onChange={(e) => setLeitura({ ...leitura, competencia: e.target.value })} />
                </Campo>
                <Campo label="Água (m³)" htmlFor="le-agua">
                  <input id="le-agua" type="number" min={0} className="estreito" value={leitura.aguaM3} onChange={(e) => setLeitura({ ...leitura, aguaM3: e.target.value })} />
                </Campo>
                <Campo label="Energia (kWh)" htmlFor="le-energia">
                  <input id="le-energia" type="number" min={0} className="estreito" value={leitura.energiaKwh} onChange={(e) => setLeitura({ ...leitura, energiaKwh: e.target.value })} />
                </Campo>
                <Campo label="Resíduos (kg)" htmlFor="le-residuos">
                  <input id="le-residuos" type="number" min={0} className="estreito" value={leitura.residuosKg} onChange={(e) => setLeitura({ ...leitura, residuosKg: e.target.value })} />
                </Campo>
                <Campo label="Reciclados (kg)" htmlFor="le-reciclados">
                  <input id="le-reciclados" type="number" min={0} className="estreito" value={leitura.residuosRecicladosKg} onChange={(e) => setLeitura({ ...leitura, residuosRecicladosKg: e.target.value })} />
                </Campo>
                <Campo label="Emissões (tCO₂)" htmlFor="le-emissoes">
                  <input id="le-emissoes" type="number" min={0} step="0.001" className="estreito" value={leitura.emissoesTco2} onChange={(e) => setLeitura({ ...leitura, emissoesTco2: e.target.value })} />
                </Campo>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={salvando || !leitura.clienteId || !leitura.competencia}
                onClick={() => void salvarLeitura()}
              >
                Salvar leitura
              </button>
            </div>
          ) : null}

          <div className="painel">
            <h3>Histórico mensal</h3>
            {leituras.length === 0 ? (
              <p className="hint">Nenhuma leitura registrada.</p>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Competência</th>
                      <th>Cliente</th>
                      <th className="num-col">Água (m³)</th>
                      <th className="num-col">Energia (kWh)</th>
                      <th className="num-col">Resíduos (kg)</th>
                      <th className="num-col">Reciclagem</th>
                      <th className="num-col">tCO₂</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leituras.map((linha) => {
                      const residuos = linha.residuosKg ? Number(linha.residuosKg) : null;
                      const reciclados = linha.residuosRecicladosKg ? Number(linha.residuosRecicladosKg) : null;
                      const taxa = residuos && reciclados !== null ? Math.round((reciclados / residuos) * 100) : null;

                      return (
                        <tr key={linha.id}>
                          <td>{formatarDataIso(linha.competencia).slice(3)}</td>
                          <td>{linha.cliente?.nomeFantasia ?? '—'}</td>
                          <td className="num-col">{numero(linha.aguaM3)}</td>
                          <td className="num-col">{numero(linha.energiaKwh)}</td>
                          <td className="num-col">{numero(linha.residuosKg)}</td>
                          <td className="num-col">{taxa !== null ? `${taxa}%` : '—'}</td>
                          <td className="num-col">{numero(linha.emissoesTco2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      {aba === 'aspectos' ? (
        <>
          {podeEscrever ? (
            <div className="painel">
              <h3>{editandoId ? 'Editar aspecto ambiental' : 'Novo aspecto ambiental'}</h3>
              <p className="desc">
                Levantamento de aspectos e impactos (ISO 14001, 6.1.2): para cada atividade, o aspecto (o que a atividade
                faz com o ambiente) e o impacto (a consequência). A significância é severidade × probabilidade; a partir
                de <b>{SIGNIFICANCIA_MINIMA_SIGNIFICATIVO}</b> o aspecto é significativo e exige controle operacional.
              </p>
              <div className="filtros">
                <Campo label="Cliente" htmlFor="as-cliente" obrigatorio erro={errosAsp.clienteId}>
                  <select
                    id="as-cliente"
                    value={formAsp.clienteId}
                    onChange={(e) => setFormAsp({ ...formAsp, clienteId: e.target.value, areaId: '' })}
                  >
                    <option value="">Selecione...</option>
                    {clientes.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.nomeFantasia}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Área" htmlFor="as-area" erro={errosAsp.areaId}>
                  <select id="as-area" value={formAsp.areaId} onChange={(e) => setFormAsp({ ...formAsp, areaId: e.target.value })}>
                    <option value="">Todo o cliente</option>
                    {areasFormAsp.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.codigo} — {area.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Condição" htmlFor="as-condicao" obrigatorio erro={errosAsp.condicao} ajuda="Normal: rotina. Anormal: partida, parada, manutenção. Emergência: falha, incêndio.">
                  <select
                    id="as-condicao"
                    value={formAsp.condicao}
                    onChange={(e) => setFormAsp({ ...formAsp, condicao: e.target.value as CondicaoAspecto })}
                  >
                    {CONDICOES_ASPECTO.map((condicao) => (
                      <option key={condicao} value={condicao}>
                        {ROTULO_CONDICAO_ASPECTO[condicao]}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>

              <div className="row3">
                <Campo label="Atividade" htmlFor="as-atividade" obrigatorio erro={errosAsp.atividade} ajuda="Ex.: lavagem de peças, pintura, geração de energia.">
                  <input id="as-atividade" value={formAsp.atividade} onChange={(e) => setFormAsp({ ...formAsp, atividade: e.target.value })} />
                </Campo>
                <Campo label="Aspecto ambiental" htmlFor="as-aspecto" obrigatorio erro={errosAsp.aspecto} ajuda="Ex.: geração de efluente oleoso, emissão de COV.">
                  <input id="as-aspecto" value={formAsp.aspecto} onChange={(e) => setFormAsp({ ...formAsp, aspecto: e.target.value })} />
                </Campo>
                <Campo label="Impacto ambiental" htmlFor="as-impacto" obrigatorio erro={errosAsp.impacto} ajuda="Ex.: contaminação do solo, poluição do ar.">
                  <input id="as-impacto" value={formAsp.impacto} onChange={(e) => setFormAsp({ ...formAsp, impacto: e.target.value })} />
                </Campo>
              </div>

              <div className="row3">
                <Campo label="Severidade (1–5)" htmlFor="as-sev" obrigatorio erro={errosAsp.severidade}>
                  <select id="as-sev" value={formAsp.severidade} onChange={(e) => setFormAsp({ ...formAsp, severidade: e.target.value })}>
                    {ESCALA_ASPECTO.map((nivel) => (
                      <option key={nivel} value={nivel}>
                        {nivel} — {ROTULO_SEVERIDADE_ASPECTO[nivel]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Probabilidade (1–5)" htmlFor="as-prob" obrigatorio erro={errosAsp.probabilidade}>
                  <select id="as-prob" value={formAsp.probabilidade} onChange={(e) => setFormAsp({ ...formAsp, probabilidade: e.target.value })}>
                    {ESCALA_ASPECTO.map((nivel) => (
                      <option key={nivel} value={nivel}>
                        {nivel} — {ROTULO_PROBABILIDADE_ASPECTO[nivel]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Significância" htmlFor="as-sig" ajuda="Calculada ao vivo; o servidor recalcula ao salvar.">
                  <div id="as-sig" style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 38 }}>
                    <b className="num" style={{ fontSize: 22 }}>
                      {significanciaAtual}
                    </b>
                    <span className="hint">
                      {formAsp.severidade} × {formAsp.probabilidade}
                    </span>
                    <span className={`pill ${significativoAtual ? 'bad' : 'ok'}`}>
                      {significativoAtual ? 'Significativo' : 'Não significativo'}
                    </span>
                  </div>
                </Campo>
              </div>

              <div className="row3">
                <Campo label="Controles operacionais" htmlFor="as-controles" erro={errosAsp.controles} ajuda="Como o aspecto é controlado hoje (procedimento, contenção, monitoramento).">
                  <input id="as-controles" value={formAsp.controles} onChange={(e) => setFormAsp({ ...formAsp, controles: e.target.value })} />
                </Campo>
                <Campo label="Requisito legal" htmlFor="as-legal" erro={errosAsp.requisitoLegal} ajuda="Ex.: CONAMA 430, Lei 12.305, licença de operação.">
                  <input id="as-legal" value={formAsp.requisitoLegal} onChange={(e) => setFormAsp({ ...formAsp, requisitoLegal: e.target.value })} />
                </Campo>
                <Campo label="Responsável" htmlFor="as-resp" erro={errosAsp.responsavel}>
                  <input id="as-resp" value={formAsp.responsavel} onChange={(e) => setFormAsp({ ...formAsp, responsavel: e.target.value })} />
                </Campo>
              </div>

              <div className="barra-acoes">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={salvandoAsp || !formAsp.clienteId || formAsp.atividade.trim().length < 3 || formAsp.aspecto.trim().length < 3 || formAsp.impacto.trim().length < 3}
                  onClick={() => void salvarAspecto()}
                >
                  {salvandoAsp ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Registrar aspecto'}
                </button>
                {editandoId ? (
                  <button type="button" className="btn btn-ghost" onClick={cancelarEdicao}>
                    Cancelar edição
                  </button>
                ) : null}
                {!formAsp.clienteId || formAsp.atividade.trim().length < 3 || formAsp.aspecto.trim().length < 3 || formAsp.impacto.trim().length < 3 ? (
                  <span className="hint">Cliente, atividade, aspecto e impacto (3+ caracteres) são obrigatórios.</span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="painel">
            <h3>Levantamento de aspectos e impactos</h3>
            <div className="filtros">
              <Campo label="Cliente" htmlFor="af-cliente">
                <select
                  id="af-cliente"
                  value={filtroAsp.clienteId}
                  onChange={(e) => setFiltroAsp({ ...filtroAsp, clienteId: e.target.value, areaId: '' })}
                >
                  <option value="">Todos</option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nomeFantasia}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Área" htmlFor="af-area">
                <select id="af-area" value={filtroAsp.areaId} onChange={(e) => setFiltroAsp({ ...filtroAsp, areaId: e.target.value })} disabled={!filtroAsp.clienteId}>
                  <option value="">Todas</option>
                  {areasFiltroAsp.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.codigo} — {area.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Busca" htmlFor="af-busca">
                <input
                  id="af-busca"
                  className="busca"
                  placeholder="Atividade, aspecto ou impacto"
                  value={filtroAsp.busca}
                  onChange={(e) => setFiltroAsp({ ...filtroAsp, busca: e.target.value })}
                />
              </Campo>
              <div className="check-linha" style={{ alignSelf: 'end' }}>
                <label>
                  <input
                    type="checkbox"
                    checked={filtroAsp.somenteSignificativos}
                    onChange={(e) => setFiltroAsp({ ...filtroAsp, somenteSignificativos: e.target.checked })}
                  />
                  Somente significativos
                </label>
              </div>
            </div>

            {carregandoAspectos ? (
              <div className="centro-tela">
                <div className="spinner" />
                Carregando...
              </div>
            ) : aspectos.length === 0 ? (
              <div className="vazio">
                <div className="icone-vazio" aria-hidden="true">
                  <Icone nome="bussola" tamanho={22} />
                </div>
                <h4>Nenhum aspecto registrado</h4>
                <p>
                  {filtroAsp.somenteSignificativos || filtroAsp.clienteId || buscaAplicada
                    ? 'Nada com esses filtros. Limpe os filtros ou registre um novo aspecto.'
                    : 'Comece pelo levantamento: liste as atividades, o que cada uma gera e o impacto correspondente.'}
                </p>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Atividade</th>
                      <th>Aspecto → impacto</th>
                      <th>Onde</th>
                      <th>Condição</th>
                      <th className="num-col">S × P</th>
                      <th>Significância</th>
                      <th>Controles</th>
                      {podeEscrever ? <th /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {aspectos.map((aspecto) => (
                      <tr key={aspecto.id}>
                        <td>
                          <b>{aspecto.atividade}</b>
                          {aspecto.responsavel ? <div className="hint">{aspecto.responsavel}</div> : null}
                        </td>
                        <td>
                          {aspecto.aspecto}
                          <div className="hint">→ {aspecto.impacto}</div>
                          {aspecto.requisitoLegal ? <div className="hint">Lei: {aspecto.requisitoLegal}</div> : null}
                        </td>
                        <td>
                          {aspecto.cliente?.nomeFantasia ?? '—'}
                          {aspecto.area ? <div className="hint">{aspecto.area.nome}</div> : null}
                        </td>
                        <td>
                          <span className={`pill ${PILL_CONDICAO[aspecto.condicao] ?? 'gray'}`}>{aspecto.rotuloCondicao}</span>
                        </td>
                        <td className="num-col">
                          {aspecto.severidade} × {aspecto.probabilidade}
                        </td>
                        <td>
                          <span className={`pill ${classeSignificancia(aspecto.significancia)}`}>
                            {aspecto.significancia}
                            {aspecto.significativo ? ' · significativo' : ''}
                          </span>
                        </td>
                        <td>
                          {aspecto.controles ? (
                            <span className="hint">{aspecto.controles.slice(0, 80)}</span>
                          ) : aspecto.significativo ? (
                            <span className="pill warn">Sem controle registrado</span>
                          ) : (
                            <span className="hint">—</span>
                          )}
                        </td>
                        {podeEscrever ? (
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => iniciarEdicao(aspecto)}>
                              Editar
                            </button>{' '}
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluirAspecto(aspecto)}>
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
        </>
      ) : null}

      {aba === 'documentos' ? (
        <>
          <div className="painel">
            <h3>Documentos ambientais</h3>
            <p className="desc">
              Licença ambiental, PGRSS, PGRS, CTR/manifesto de resíduos e inventário de resíduos <b>vivem no acervo de
              documentos legais</b>, com controle de versão: uma nova revisão não apaga a anterior, e a validade entra no
              painel de conformidade. Esta aba é o checklist ambiental do cliente — mostra a versão vigente de cada tipo,
              deixa cadastrar o que falta e anexar o arquivo. Para revisar, cancelar ou ver o histórico, use o{' '}
              <Link to="/documentos">acervo de documentos</Link>.
            </p>

            {!podeLerDocumentos ? (
              <p className="hint alerta">Seu perfil não tem permissão para consultar o acervo de documentos (saude:ler).</p>
            ) : (
              <div className="filtros">
                <Campo label="Cliente" htmlFor="dc-cliente" obrigatorio>
                  <select
                    id="dc-cliente"
                    value={docClienteId}
                    onChange={(e) => {
                      setDocClienteId(e.target.value);
                      setCadastrandoTipo(null);
                    }}
                  >
                    <option value="">Selecione...</option>
                    {clientes.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.nomeFantasia}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
            )}

            {podeLerDocumentos && !docClienteId ? (
              <p className="hint">Selecione o cliente para ver o checklist.</p>
            ) : null}

            {podeLerDocumentos && docClienteId ? (
              carregandoDocs ? (
                <div className="centro-tela">
                  <div className="spinner" />
                  Carregando...
                </div>
              ) : (
                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Documento</th>
                        <th>Versão vigente</th>
                        <th>Validade</th>
                        <th>Situação</th>
                        <th>Arquivo</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {TIPOS_DOCUMENTO_AMBIENTAL.map((tipo) => {
                        const definicao = DEFINICAO_POR_TIPO.get(tipo);
                        const documento = documentoPorTipo.get(tipo);
                        const situacao: SituacaoDocumentoAmbiental = documento ? documento.situacaoVencimento : 'AUSENTE';
                        const pill = PILL_SITUACAO_DOCUMENTO[situacao];
                        const arquivo = urlAbsoluta(documento?.arquivoUrl);

                        return (
                          <tr key={tipo}>
                            <td>
                              <b>{ROTULO_TIPO_DOCUMENTO[tipo]}</b>
                              {definicao ? <div className="hint">{definicao.descricao}</div> : null}
                            </td>
                            <td>
                              {documento ? (
                                <>
                                  <Link to={`/documentos/${documento.id}`}>{documento.titulo}</Link>
                                  <div className="hint">
                                    v{documento.versao} · emitido em {formatarDataIso(documento.dataEmissao)}
                                    {documento.responsavelNome ? ` · ${documento.responsavelNome}` : ''}
                                  </div>
                                </>
                              ) : (
                                <span className="hint">Nenhum documento vigente</span>
                              )}
                            </td>
                            <td>
                              {documento ? (
                                documento.validade ? (
                                  <>
                                    {formatarDataIso(documento.validade)}
                                    {documento.diasParaVencer !== null ? (
                                      <div className="hint">
                                        {documento.diasParaVencer < 0
                                          ? `vencido há ${Math.abs(documento.diasParaVencer)} d`
                                          : `${documento.diasParaVencer} d`}
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  <span className="hint">sem prazo</span>
                                )
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>
                              <span className={`pill ${pill.classe}`}>{pill.rotulo}</span>
                            </td>
                            <td>
                              {arquivo ? (
                                <a href={arquivo} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                                  <Icone nome="anexo" tamanho={14} /> abrir
                                </a>
                              ) : documento && podeEscreverDocumentos ? (
                                <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                                  <Icone nome="anexo" tamanho={14} /> {anexandoId === documento.id ? 'Enviando...' : 'Anexar'}
                                  <input
                                    type="file"
                                    accept=".pdf,image/*"
                                    style={{ display: 'none' }}
                                    disabled={anexandoId === documento.id}
                                    onChange={(e) => {
                                      void anexarArquivo(documento.id, e.target.files?.[0]);
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                              ) : documento ? (
                                <span className="hint">sem arquivo</span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {podeEscreverDocumentos ? (
                                <button
                                  type="button"
                                  className={`btn btn-sm ${documento ? 'btn-ghost' : 'btn-primary'}`}
                                  onClick={() => abrirCadastro(tipo)}
                                >
                                  <Icone nome="mais" tamanho={14} /> {documento ? 'Cadastrar outro' : 'Cadastrar'}
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : null}

            {podeLerDocumentos && docClienteId && !podeEscreverDocumentos ? (
              <p className="hint">Cadastrar e anexar documentos exige a permissão saude:escrever.</p>
            ) : null}
          </div>

          {cadastrandoTipo && podeEscreverDocumentos ? (
            <div className="painel">
              <h3>Cadastrar {ROTULO_TIPO_DOCUMENTO[cadastrandoTipo]}</h3>
              <p className="desc">
                {definicaoCadastro?.descricao}. Abrangência: todo o cliente.{' '}
                {definicaoCadastro?.validadeMeses
                  ? `Validade típica de ${definicaoCadastro.validadeMeses} meses (sugerida a partir da emissão; ajuste se o contrato previr outro prazo).`
                  : 'Sem prazo padrão — deixe a validade vazia se não houver.'}
                {definicaoCadastro?.exigeResponsavelTecnico ? ' Este documento exige responsável técnico.' : ''}
              </p>
              <div className="row2">
                <Campo label="Título" htmlFor="dc-titulo" obrigatorio erro={errosDoc.titulo}>
                  <input id="dc-titulo" value={formDoc.titulo} onChange={(e) => setFormDoc({ ...formDoc, titulo: e.target.value })} />
                </Campo>
                <Campo label="Número / protocolo" htmlFor="dc-numero" erro={errosDoc.numero}>
                  <input id="dc-numero" value={formDoc.numero} onChange={(e) => setFormDoc({ ...formDoc, numero: e.target.value })} />
                </Campo>
              </div>
              <div className="row3">
                <Campo label="Data de emissão" htmlFor="dc-emissao" obrigatorio erro={errosDoc.dataEmissao}>
                  <input id="dc-emissao" type="date" value={formDoc.dataEmissao} onChange={(e) => alterarEmissao(e.target.value)} />
                </Campo>
                <Campo label="Validade" htmlFor="dc-validade" erro={errosDoc.validade} ajuda="Vazio = sem prazo.">
                  <input id="dc-validade" type="date" value={formDoc.validade} onChange={(e) => setFormDoc({ ...formDoc, validade: e.target.value })} />
                </Campo>
                <Campo
                  label="Responsável técnico"
                  htmlFor="dc-resp"
                  obrigatorio={definicaoCadastro?.exigeResponsavelTecnico}
                  erro={errosDoc.responsavelNome}
                >
                  <input id="dc-resp" value={formDoc.responsavelNome} onChange={(e) => setFormDoc({ ...formDoc, responsavelNome: e.target.value })} />
                </Campo>
              </div>
              <Campo label="Arquivo (PDF ou imagem)" htmlFor="dc-arquivo" ajuda="Opcional agora — dá para anexar depois pela lista.">
                <input
                  id="dc-arquivo"
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setArquivoDoc(e.target.files?.[0] ?? null)}
                />
              </Campo>
              <div className="barra-acoes">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={salvandoDoc || formDoc.titulo.trim().length < 3 || !formDoc.dataEmissao}
                  onClick={() => void cadastrarDocumento()}
                >
                  {salvandoDoc ? 'Salvando...' : arquivoDoc ? 'Cadastrar e anexar' : 'Cadastrar'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setCadastrandoTipo(null);
                    setErrosDoc({});
                  }}
                >
                  Cancelar
                </button>
                {formDoc.titulo.trim().length < 3 || !formDoc.dataEmissao ? (
                  <span className="hint">Título (3+ caracteres) e data de emissão são obrigatórios.</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {aba === 'dashboard' ? (
        <>
          <div className="painel">
            <h3>Dashboard ambiental</h3>
            <div className="filtros">
              <Campo label="Cliente" htmlFor="db-cliente">
                <select id="db-cliente" value={dashClienteId} onChange={(e) => setDashClienteId(e.target.value)}>
                  <option value="">Todos</option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nomeFantasia}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Período" htmlFor="db-meses">
                <select id="db-meses" className="estreito" value={dashMeses} onChange={(e) => setDashMeses(e.target.value as '6' | '12' | '24')}>
                  <option value="6">6 meses</option>
                  <option value="12">12 meses</option>
                  <option value="24">24 meses</option>
                </select>
              </Campo>
            </div>

            {carregandoDash || !dashboard || !totaisDashboard ? (
              <div className="centro-tela">
                <div className="spinner" />
                Carregando...
              </div>
            ) : (
              <div className="stat-grid">
                <div className="stat">
                  <b style={{ color: totaisDashboard.ocorrencias > 0 ? 'var(--orange)' : 'var(--green)' }}>{totaisDashboard.ocorrencias}</b>
                  <span>ocorrências no período</span>
                </div>
                <div className="stat">
                  <b style={{ color: totaisDashboard.grauI > 0 ? 'var(--red)' : undefined }}>{totaisDashboard.grauI}</b>
                  <span>grau I (críticas)</span>
                </div>
                <div className="stat">
                  <b style={{ color: dashboard.aspectos.significativos > 0 ? 'var(--orange)' : undefined }}>
                    {dashboard.aspectos.significativos}
                    <span style={{ fontSize: 14, fontWeight: 500 }}> / {dashboard.aspectos.total}</span>
                  </b>
                  <span>aspectos significativos / total</span>
                </div>
                <div className="stat">
                  <b>{totaisDashboard.taxaReciclagem !== null ? `${totaisDashboard.taxaReciclagem}%` : '—'}</b>
                  <span>reciclagem no período</span>
                </div>
                <div className="stat">
                  <b style={{ color: totaisDashboard.pendencias > 0 ? 'var(--red)' : 'var(--green)' }}>{totaisDashboard.pendencias}</b>
                  <span>documentos com pendência</span>
                </div>
              </div>
            )}
          </div>

          {dashboard && !carregandoDash ? (
            <>
              <div className="grid2">
                <div className="painel">
                  <h3>Ocorrências por mês</h3>
                  <p className="desc">Total do mês; o detalhe mostra contidas e grau I.</p>
                  <Barras
                    cor="var(--orange)"
                    linhas={dashboard.ocorrenciasPorMes.map((mes) => ({
                      chave: mes.competencia,
                      rotulo: rotuloMes(mes.competencia),
                      valor: mes.total,
                      detalhe: mes.total > 0 ? `${mes.contidas} contida(s) · ${mes.grauI} grau I` : 'meta zero',
                    }))}
                  />
                </div>
                <div className="painel">
                  <h3>Resíduos e reciclagem por mês</h3>
                  <p className="desc">Resíduos gerados (kg); o detalhe mostra a taxa de reciclagem e as emissões.</p>
                  {dashboard.esgPorMes.every((mes) => mes.residuosKg === null) ? (
                    <p className="hint">Nenhuma leitura de resíduos no período — registre na aba Indicadores ESG mensais.</p>
                  ) : (
                    <Barras
                      cor="var(--green)"
                      linhas={dashboard.esgPorMes.map((mes) => ({
                        chave: mes.competencia,
                        rotulo: rotuloMes(mes.competencia),
                        valor: mes.residuosKg ?? 0,
                        texto: mes.residuosKg === null ? '—' : `${numeroOuTraco(mes.residuosKg)} kg`,
                        detalhe:
                          mes.residuosKg === null
                            ? 'sem leitura'
                            : `${mes.percentualReciclagem !== null ? `${mes.percentualReciclagem}% recicl.` : 'recicl. —'} · ${numeroOuTraco(mes.emissoesTco2, 3)} tCO₂`,
                      }))}
                    />
                  )}
                </div>
              </div>

              <div className="grid2">
                <div className="painel">
                  <h3>Documentos ambientais</h3>
                  <p className="desc">Versão vigente de cada tipo no acervo legal — a vencer considera 30 dias.</p>
                  <div className="stat-grid">
                    {(['VIGENTE', 'A_VENCER', 'VENCIDO', 'AUSENTE', 'SEM_VALIDADE'] as const).map((situacao) => {
                      const quantidade = dashboard.resumoDocumentos[situacao];
                      const cor =
                        situacao === 'VENCIDO' || situacao === 'AUSENTE'
                          ? quantidade > 0
                            ? 'var(--red)'
                            : undefined
                          : situacao === 'A_VENCER'
                            ? quantidade > 0
                              ? 'var(--orange)'
                              : undefined
                            : situacao === 'VIGENTE'
                              ? 'var(--green)'
                              : undefined;
                      return (
                        <div className="stat" key={situacao}>
                          <b style={{ color: cor }}>{quantidade}</b>
                          <span>{PILL_SITUACAO_DOCUMENTO[situacao].rotulo.toLowerCase()}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="tbl-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Documento</th>
                          <th>Validade</th>
                          <th>Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.documentos.map((documento) => {
                          const pill = PILL_SITUACAO_DOCUMENTO[documento.situacao];
                          return (
                            <tr key={documento.tipo}>
                              <td>
                                <b>{documento.rotulo}</b>
                                {documento.titulo ? (
                                  <div className="hint">
                                    {documento.documentoId ? (
                                      <Link to={`/documentos/${documento.documentoId}`}>{documento.titulo}</Link>
                                    ) : (
                                      documento.titulo
                                    )}
                                    {documento.versao ? ` · v${documento.versao}` : ''}
                                    {!documento.arquivoUrl ? ' · sem arquivo' : ''}
                                  </div>
                                ) : null}
                              </td>
                              <td>{documento.validade ? formatarDataIso(documento.validade) : documento.documentoId ? 'sem prazo' : '—'}</td>
                              <td>
                                <span className={`pill ${pill.classe}`}>{pill.rotulo}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!dashClienteId ? (
                    <p className="hint">Sem cliente selecionado, o checklist considera o melhor documento de cada tipo entre todos os clientes.</p>
                  ) : null}
                </div>

                <div className="painel">
                  <h3>Aspectos por condição operacional</h3>
                  <p className="desc">
                    {dashboard.aspectos.total} aspecto(s) levantado(s), {dashboard.aspectos.significativos} significativo(s).
                  </p>
                  {dashboard.aspectos.total === 0 ? (
                    <p className="hint">Nenhum aspecto levantado — comece pela aba Aspectos e impactos.</p>
                  ) : (
                    <Barras
                      cor="var(--navy)"
                      linhas={CONDICOES_ASPECTO.map((condicao) => ({
                        chave: condicao,
                        rotulo: ROTULO_CONDICAO_ASPECTO[condicao],
                        valor: dashboard.aspectos.porCondicao[condicao] ?? 0,
                      }))}
                    />
                  )}
                </div>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
