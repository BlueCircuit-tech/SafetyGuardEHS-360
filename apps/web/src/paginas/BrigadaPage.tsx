import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CLASSE_FOGO_EXTINTOR,
  FUNCOES_BRIGADA,
  ORDEM_FUNCAO_BRIGADA,
  ROTULO_FUNCAO_BRIGADA,
  ROTULO_SITUACAO_EXTINTOR,
  ROTULO_SITUACAO_TREINAMENTO_BRIGADA,
  ROTULO_TIPO_EXTINTOR,
  SITUACOES_EXTINTOR,
  TIPOS_EXTINTOR,
  type FuncaoBrigada,
  type SituacaoExtintor,
  type SituacaoTreinamentoBrigada,
  type TipoExtintor,
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

interface BrigadistaApi {
  id: string;
  clienteId: string;
  colaboradorId: string;
  areaId: string | null;
  funcaoBrigada: FuncaoBrigada;
  turno: string | null;
  dataTreinamento: string | null;
  validadeTreinamento: string | null;
  certificadoUrl: string | null;
  fotoUrl: string | null;
  ativo: boolean;
  observacoes: string | null;
  situacaoTreinamento: SituacaoTreinamentoBrigada;
  diasParaVencerTreinamento: number | null;
  colaborador: { id: string; nome: string; funcao: string; setor: string | null; telefone: string | null; fotoUrl: string | null };
  area: { id: string; nome: string; codigo: string } | null;
  rotulos?: { funcaoBrigada: string; situacaoTreinamento: string };
}

interface ExtintorApi {
  id: string;
  clienteId: string;
  areaId: string | null;
  numero: string;
  tipo: TipoExtintor;
  capacidade: string | null;
  localizacao: string;
  validadeCarga: string | null;
  validadeTesteHidrostatico: string | null;
  ultimaInspecao: string | null;
  situacao: SituacaoExtintor;
  observacoes: string | null;
  situacaoEfetiva: SituacaoExtintor;
  diasParaVencerCarga: number | null;
  diasParaVencerTeste: number | null;
  area: { id: string; nome: string; codigo: string } | null;
  rotulos?: { tipo: string; classeFogo: string; situacao: string };
}

interface ResumoBrigada {
  brigadistas: {
    ativos: number;
    porFuncao: { funcao: FuncaoBrigada; rotulo: string; total: number }[];
    treinamentosVencidos: number;
    treinamentosAVencer: number;
    semTreinamento: number;
  };
  extintores: {
    total: number;
    vencidos: number;
    emManutencao: number;
    obstruidos: number;
    semInspecao30Dias: number;
    porTipo: { tipo: TipoExtintor; rotulo: string; total: number }[];
  };
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

interface OpcaoColaborador {
  id: string;
  nome: string;
  funcao: string;
}

type Aba = 'brigadistas' | 'extintores' | 'organograma' | 'mapa';

const PILL_TREINAMENTO: Record<SituacaoTreinamentoBrigada, string> = {
  VIGENTE: 'ok',
  A_VENCER: 'warn',
  VENCIDO: 'bad',
  SEM_TREINAMENTO: 'gray',
};

const PILL_EXTINTOR: Record<SituacaoExtintor, string> = {
  OK: 'ok',
  VENCIDO: 'bad',
  EM_MANUTENCAO: 'warn',
  OBSTRUIDO: 'orange',
};

const COR_FUNCAO: Record<FuncaoBrigada, string> = {
  COORDENADOR: '#b91c1c',
  CHEFE: '#c2410c',
  LIDER: '#a16207',
  BRIGADISTA: '#1d4ed8',
};

const BRIGADISTA_VAZIO = {
  clienteId: '',
  colaboradorId: '',
  funcaoBrigada: 'BRIGADISTA' as FuncaoBrigada,
  areaId: '',
  turno: '',
  dataTreinamento: '',
  validadeTreinamento: '',
  observacoes: '',
};

const EXTINTOR_VAZIO = {
  clienteId: '',
  areaId: '',
  numero: '',
  tipo: 'PO_ABC' as TipoExtintor,
  capacidade: '',
  localizacao: '',
  validadeCarga: '',
  validadeTesteHidrostatico: '',
  ultimaInspecao: '',
  situacao: 'OK' as SituacaoExtintor,
  observacoes: '',
};

const INSPECAO_VAZIA = { data: '', situacao: 'OK' as SituacaoExtintor, observacoes: '' };

function primeirasMensagens(campos: Record<string, string[]>): Record<string, string> {
  return Object.fromEntries(Object.entries(campos).map(([campo, mensagens]) => [campo, mensagens[0] ?? 'Valor inválido.']));
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Validade padrao da reciclagem: 1 ano apos o treinamento (NBR 14276). */
function umAnoDepois(iso: string): string {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${Number(ano) + 1}-${mes}-${dia}`;
}

function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/* -------------------------------------------------------------------------- */
/* Foto do brigadista                                                          */
/* -------------------------------------------------------------------------- */

function FotoBrigadista({ brigadista, tamanho = 40 }: { brigadista: BrigadistaApi; tamanho?: number }) {
  const url = urlAbsoluta(brigadista.fotoUrl ?? brigadista.colaborador.fotoUrl);
  const estilo = {
    width: tamanho,
    height: tamanho,
    borderRadius: '50%',
    objectFit: 'cover' as const,
    flex: '0 0 auto',
    border: `2px solid ${COR_FUNCAO[brigadista.funcaoBrigada]}`,
  };
  if (url) return <img src={url} alt={brigadista.colaborador.nome} style={estilo} />;
  return (
    <div
      aria-hidden="true"
      style={{
        ...estilo,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#eef1f5',
        color: '#334155',
        fontWeight: 700,
        fontSize: Math.round(tamanho * 0.38),
      }}
    >
      {iniciais(brigadista.colaborador.nome)}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pagina                                                                      */
/* -------------------------------------------------------------------------- */

export function BrigadaPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('cadastros:escrever');

  const [aba, setAba] = useState<Aba>('brigadistas');
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [areas, setAreas] = useState<OpcaoArea[]>([]);
  const [colaboradores, setColaboradores] = useState<OpcaoColaborador[]>([]);

  const [carregando, setCarregando] = useState(true);
  const [brigadistas, setBrigadistas] = useState<BrigadistaApi[]>([]);
  const [extintores, setExtintores] = useState<ExtintorApi[]>([]);
  const [resumo, setResumo] = useState<ResumoBrigada | null>(null);

  const [formB, setFormB] = useState(BRIGADISTA_VAZIO);
  const [editandoB, setEditandoB] = useState<string | null>(null);
  const [errosB, setErrosB] = useState<Record<string, string>>({});
  const [formBAberto, setFormBAberto] = useState(false);

  const [formE, setFormE] = useState(EXTINTOR_VAZIO);
  const [editandoE, setEditandoE] = useState<string | null>(null);
  const [errosE, setErrosE] = useState<Record<string, string>>({});
  const [formEAberto, setFormEAberto] = useState(false);
  const [filtroSituacao, setFiltroSituacao] = useState<'' | SituacaoExtintor>('');

  const [inspecionando, setInspecionando] = useState<string | null>(null);
  const [inspecao, setInspecao] = useState(INSPECAO_VAZIA);

  const [salvando, setSalvando] = useState(false);

  /* ---------------------------------------------------------- carga --- */

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const escopo = clienteId ? `clienteId=${clienteId}` : '';
      const qsExt = [escopo, filtroSituacao ? `situacao=${filtroSituacao}` : ''].filter(Boolean).join('&');
      const [listaB, listaE, cards] = await Promise.all([
        api.get<BrigadistaApi[]>(`/brigada/brigadistas${escopo ? `?${escopo}` : ''}`),
        api.get<ExtintorApi[]>(`/brigada/extintores${qsExt ? `?${qsExt}` : ''}`),
        api.get<ResumoBrigada>(`/brigada/resumo${escopo ? `?${escopo}` : ''}`),
      ]);
      setBrigadistas(listaB);
      setExtintores(listaE);
      setResumo(cards);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar a brigada.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [clienteId, filtroSituacao, mostrar]);

  useEffect(() => {
    void api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Areas e colaboradores do cliente em edicao (formularios) — cai no cliente do filtro.
  const clienteDosFormularios = formB.clienteId || formE.clienteId || clienteId;
  useEffect(() => {
    if (!clienteDosFormularios) {
      setAreas([]);
      setColaboradores([]);
      return;
    }
    void api
      .get<{ itens: OpcaoArea[] }>(`/areas?clienteId=${clienteDosFormularios}&porPagina=200`)
      .then((r) => setAreas(r.itens))
      .catch(() => setAreas([]));
    void api
      .get<OpcaoColaborador[]>(`/colaboradores/opcoes?clienteId=${clienteDosFormularios}`)
      .then(setColaboradores)
      .catch(() => setColaboradores([]));
  }, [clienteDosFormularios]);

  /* ----------------------------------------------------- brigadistas --- */

  function novoBrigadista() {
    setEditandoB(null);
    setFormB({ ...BRIGADISTA_VAZIO, clienteId });
    setErrosB({});
    setFormBAberto(true);
  }

  function editarBrigadista(b: BrigadistaApi) {
    setEditandoB(b.id);
    setFormB({
      clienteId: b.clienteId,
      colaboradorId: b.colaboradorId,
      funcaoBrigada: b.funcaoBrigada,
      areaId: b.areaId ?? '',
      turno: b.turno ?? '',
      dataTreinamento: b.dataTreinamento?.slice(0, 10) ?? '',
      validadeTreinamento: b.validadeTreinamento?.slice(0, 10) ?? '',
      observacoes: b.observacoes ?? '',
    });
    setErrosB({});
    setFormBAberto(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelarBrigadista() {
    setEditandoB(null);
    setFormB(BRIGADISTA_VAZIO);
    setErrosB({});
    setFormBAberto(false);
  }

  async function salvarBrigadista() {
    setSalvando(true);
    setErrosB({});
    try {
      const corpo = {
        ...formB,
        areaId: formB.areaId || null,
        turno: formB.turno || null,
        dataTreinamento: formB.dataTreinamento || null,
        validadeTreinamento: formB.validadeTreinamento || null,
        observacoes: formB.observacoes || null,
      };
      if (editandoB) await api.put(`/brigada/brigadistas/${editandoB}`, corpo);
      else await api.post('/brigada/brigadistas', corpo);
      mostrar(editandoB ? 'Brigadista atualizado.' : 'Brigadista incluído na brigada.', 'sucesso');
      cancelarBrigadista();
      void carregar();
    } catch (erro) {
      if (erro instanceof ErroApi) {
        setErrosB(primeirasMensagens(erro.campos));
        mostrar(erro.mensagemAmigavel(), 'erro');
      } else {
        mostrar('Falha ao salvar o brigadista.', 'erro');
      }
    } finally {
      setSalvando(false);
    }
  }

  async function removerBrigadista(b: BrigadistaApi) {
    if (!window.confirm(`Remover ${b.colaborador.nome} da brigada?`)) return;
    try {
      await api.delete(`/brigada/brigadistas/${b.id}`);
      mostrar('Brigadista removido.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao remover.', 'erro');
    }
  }

  async function anexarBrigadista(b: BrigadistaApi, tipo: 'foto' | 'certificado', arquivo: File) {
    try {
      await api.upload(`/brigada/brigadistas/${b.id}/${tipo}`, arquivo);
      mostrar(tipo === 'foto' ? 'Foto atualizada.' : 'Certificado anexado.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao anexar.', 'erro');
    }
  }

  /* ------------------------------------------------------ extintores --- */

  function novoExtintor() {
    setEditandoE(null);
    setFormE({ ...EXTINTOR_VAZIO, clienteId });
    setErrosE({});
    setFormEAberto(true);
  }

  function editarExtintor(e: ExtintorApi) {
    setEditandoE(e.id);
    setFormE({
      clienteId: e.clienteId,
      areaId: e.areaId ?? '',
      numero: e.numero,
      tipo: e.tipo,
      capacidade: e.capacidade ?? '',
      localizacao: e.localizacao,
      validadeCarga: e.validadeCarga?.slice(0, 10) ?? '',
      validadeTesteHidrostatico: e.validadeTesteHidrostatico?.slice(0, 10) ?? '',
      ultimaInspecao: e.ultimaInspecao?.slice(0, 10) ?? '',
      situacao: e.situacao,
      observacoes: e.observacoes ?? '',
    });
    setErrosE({});
    setFormEAberto(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelarExtintor() {
    setEditandoE(null);
    setFormE(EXTINTOR_VAZIO);
    setErrosE({});
    setFormEAberto(false);
  }

  async function salvarExtintor() {
    setSalvando(true);
    setErrosE({});
    try {
      const corpo = {
        ...formE,
        areaId: formE.areaId || null,
        capacidade: formE.capacidade || null,
        validadeCarga: formE.validadeCarga || null,
        validadeTesteHidrostatico: formE.validadeTesteHidrostatico || null,
        ultimaInspecao: formE.ultimaInspecao || null,
        observacoes: formE.observacoes || null,
      };
      if (editandoE) await api.put(`/brigada/extintores/${editandoE}`, corpo);
      else await api.post('/brigada/extintores', corpo);
      mostrar(editandoE ? 'Extintor atualizado.' : 'Extintor cadastrado.', 'sucesso');
      cancelarExtintor();
      void carregar();
    } catch (erro) {
      if (erro instanceof ErroApi) {
        setErrosE(primeirasMensagens(erro.campos));
        mostrar(erro.mensagemAmigavel(), 'erro');
      } else {
        mostrar('Falha ao salvar o extintor.', 'erro');
      }
    } finally {
      setSalvando(false);
    }
  }

  async function removerExtintor(e: ExtintorApi) {
    if (!window.confirm(`Remover o extintor ${e.numero}?`)) return;
    try {
      await api.delete(`/brigada/extintores/${e.id}`);
      mostrar('Extintor removido.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao remover.', 'erro');
    }
  }

  function abrirInspecao(e: ExtintorApi) {
    setInspecionando(e.id);
    setInspecao({ data: hojeIso(), situacao: e.situacao === 'VENCIDO' ? 'OK' : e.situacao, observacoes: '' });
  }

  async function registrarInspecao() {
    if (!inspecionando) return;
    setSalvando(true);
    try {
      await api.post(`/brigada/extintores/${inspecionando}/inspecao`, {
        ...inspecao,
        observacoes: inspecao.observacoes || undefined,
      });
      mostrar('Inspeção registrada.', 'sucesso');
      setInspecionando(null);
      setInspecao(INSPECAO_VAZIA);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao registrar a inspeção.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  /* ----------------------------------------------------- organograma --- */

  const ativos = useMemo(() => brigadistas.filter((b) => b.ativo), [brigadistas]);
  const coordenadores = ativos.filter((b) => b.funcaoBrigada === 'COORDENADOR');
  const chefes = ativos.filter((b) => b.funcaoBrigada === 'CHEFE');
  const equipes = useMemo(() => {
    const grupos = new Map<string, { titulo: string; membros: BrigadistaApi[] }>();
    for (const b of ativos.filter((x) => x.funcaoBrigada === 'LIDER' || x.funcaoBrigada === 'BRIGADISTA')) {
      const chave = `${b.area?.id ?? 'sem-area'}|${b.turno ?? ''}`;
      const titulo = [b.area ? `${b.area.codigo} ${b.area.nome}` : 'Sem área definida', b.turno ? `Turno ${b.turno}` : null]
        .filter(Boolean)
        .join(' · ');
      const grupo = grupos.get(chave) ?? { titulo, membros: [] };
      grupo.membros.push(b);
      grupos.set(chave, grupo);
    }
    return Array.from(grupos.values())
      .map((g) => ({
        ...g,
        membros: [...g.membros].sort(
          (a, b) => ORDEM_FUNCAO_BRIGADA[a.funcaoBrigada] - ORDEM_FUNCAO_BRIGADA[b.funcaoBrigada] || a.colaborador.nome.localeCompare(b.colaborador.nome, 'pt-BR'),
        ),
      }))
      .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
  }, [ativos]);

  const extintoresPorArea = useMemo(() => {
    const grupos = new Map<string, { titulo: string; itens: ExtintorApi[] }>();
    for (const e of extintores) {
      const chave = e.area?.id ?? 'sem-area';
      const grupo = grupos.get(chave) ?? { titulo: e.area ? `${e.area.codigo} ${e.area.nome}` : 'Sem área definida', itens: [] };
      grupo.itens.push(e);
      grupos.set(chave, grupo);
    }
    return Array.from(grupos.values()).sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
  }, [extintores]);

  const nomeCliente = clientes.find((c) => c.id === clienteId)?.nomeFantasia;

  /* ---------------------------------------------------------- render --- */

  return (
    <>
      <div className="painel">
        <h3>Brigada de incêndio e extintores</h3>
        <p className="desc">
          Brigadistas por função (coordenador, chefe, líder e brigadista), com treinamento, validade da reciclagem, foto e
          certificado; controle de extintores com carga, teste hidrostático e inspeção mensal; organograma e mapa de extintores
          prontos para imprimir e afixar.
        </p>

        {resumo ? (
          <div className="stat-grid">
            <div className="stat">
              <b>{resumo.brigadistas.ativos}</b>
              <span>brigadistas ativos</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.brigadistas.treinamentosVencidos > 0 ? 'var(--red)' : undefined }}>{resumo.brigadistas.treinamentosVencidos}</b>
              <span>reciclagens vencidas</span>
            </div>
            <div className="stat">
              <b>{resumo.brigadistas.treinamentosAVencer}</b>
              <span>reciclagens a vencer (30d)</span>
            </div>
            <div className="stat">
              <b>{resumo.extintores.total}</b>
              <span>extintores</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.extintores.vencidos > 0 ? 'var(--red)' : undefined }}>{resumo.extintores.vencidos}</b>
              <span>extintores vencidos</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.extintores.semInspecao30Dias > 0 ? 'var(--red)' : undefined }}>{resumo.extintores.semInspecao30Dias}</b>
              <span>sem inspeção há 30d</span>
            </div>
          </div>
        ) : null}

        <div className="filtros sem-impressao" style={{ marginTop: 12 }}>
          <Campo label="Cliente" htmlFor="br-cliente" ajuda="Organograma e mapa são por cliente.">
            <select id="br-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos os clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </div>

      <div className="abas sem-impressao">
        <button type="button" className={aba === 'brigadistas' ? 'ativa' : ''} onClick={() => setAba('brigadistas')}>
          Brigadistas
        </button>
        <button type="button" className={aba === 'extintores' ? 'ativa' : ''} onClick={() => setAba('extintores')}>
          Extintores
        </button>
        <button type="button" className={aba === 'organograma' ? 'ativa' : ''} onClick={() => setAba('organograma')}>
          Organograma
        </button>
        <button type="button" className={aba === 'mapa' ? 'ativa' : ''} onClick={() => setAba('mapa')}>
          Mapa de extintores
        </button>
      </div>

      {/* ------------------------------------------------- Brigadistas --- */}
      {aba === 'brigadistas' ? (
        <>
          {podeEscrever && formBAberto ? (
            <div className="painel">
              <h3>{editandoB ? 'Editar brigadista' : 'Incluir brigadista'}</h3>
              <div className="filtros">
                <Campo label="Cliente" htmlFor="fb-cliente" obrigatorio erro={errosB.clienteId}>
                  <select id="fb-cliente" value={formB.clienteId} disabled={Boolean(editandoB)} onChange={(e) => setFormB({ ...formB, clienteId: e.target.value, colaboradorId: '', areaId: '' })}>
                    <option value="">Selecione...</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nomeFantasia}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Colaborador" htmlFor="fb-colab" obrigatorio erro={errosB.colaboradorId} ajuda={!formB.clienteId ? 'Escolha o cliente primeiro.' : undefined}>
                  <select id="fb-colab" value={formB.colaboradorId} disabled={!formB.clienteId || Boolean(editandoB)} onChange={(e) => setFormB({ ...formB, colaboradorId: e.target.value })}>
                    <option value="">Selecione...</option>
                    {colaboradores.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} — {c.funcao}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Função na brigada" htmlFor="fb-funcao" obrigatorio erro={errosB.funcaoBrigada}>
                  <select id="fb-funcao" value={formB.funcaoBrigada} onChange={(e) => setFormB({ ...formB, funcaoBrigada: e.target.value as FuncaoBrigada })}>
                    {FUNCOES_BRIGADA.map((f) => (
                      <option key={f} value={f}>
                        {ROTULO_FUNCAO_BRIGADA[f]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Área" htmlFor="fb-area" erro={errosB.areaId}>
                  <select id="fb-area" value={formB.areaId} disabled={!formB.clienteId} onChange={(e) => setFormB({ ...formB, areaId: e.target.value })}>
                    <option value="">Sem área específica</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.codigo} — {a.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Turno" htmlFor="fb-turno" erro={errosB.turno}>
                  <input id="fb-turno" className="estreito" value={formB.turno} onChange={(e) => setFormB({ ...formB, turno: e.target.value })} placeholder="Ex.: Manhã, A, 06h-14h" />
                </Campo>
                <Campo label="Data do treinamento" htmlFor="fb-trein" erro={errosB.dataTreinamento}>
                  <input
                    id="fb-trein"
                    type="date"
                    value={formB.dataTreinamento}
                    onChange={(e) =>
                      setFormB({
                        ...formB,
                        dataTreinamento: e.target.value,
                        validadeTreinamento: formB.validadeTreinamento || umAnoDepois(e.target.value),
                      })
                    }
                  />
                </Campo>
                <Campo label="Validade (reciclagem)" htmlFor="fb-validade" erro={errosB.validadeTreinamento} ajuda="Sugerido: 1 ano após o treinamento.">
                  <input id="fb-validade" type="date" value={formB.validadeTreinamento} onChange={(e) => setFormB({ ...formB, validadeTreinamento: e.target.value })} />
                </Campo>
              </div>
              <Campo label="Observações" htmlFor="fb-obs" erro={errosB.observacoes}>
                <input id="fb-obs" value={formB.observacoes} onChange={(e) => setFormB({ ...formB, observacoes: e.target.value })} />
              </Campo>
              {!editandoB ? <p className="hint">Foto e certificado são anexados pela lista, depois de incluir o brigadista.</p> : null}
              {!formB.clienteId || !formB.colaboradorId ? <p className="hint alerta">Informe o cliente e o colaborador para salvar.</p> : null}
              <div className="barra-acoes">
                <button type="button" className="btn btn-primary" disabled={salvando || !formB.clienteId || !formB.colaboradorId} onClick={() => void salvarBrigadista()}>
                  {salvando ? 'Salvando...' : editandoB ? 'Salvar alterações' : 'Incluir na brigada'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={cancelarBrigadista}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}

          <div className="painel">
            {podeEscrever && !formBAberto ? (
              <div className="barra-acoes">
                <button type="button" className="btn btn-primary" onClick={novoBrigadista}>
                  <Icone nome="mais" /> Incluir brigadista
                </button>
              </div>
            ) : null}

            {carregando ? (
              <div className="centro-tela">
                <div className="spinner" />
                Carregando...
              </div>
            ) : brigadistas.length === 0 ? (
              <div className="vazio">
                <div className="icone-vazio" aria-hidden="true">
                  <Icone nome="pessoas" tamanho={22} />
                </div>
                <h4>Nenhum brigadista cadastrado</h4>
                <p>Inclua os colaboradores que compõem a brigada e registre o treinamento de cada um.</p>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th aria-label="Foto" />
                      <th>Brigadista</th>
                      <th>Função na brigada</th>
                      <th>Área / turno</th>
                      <th>Treinamento</th>
                      <th aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody>
                    {brigadistas.map((b) => (
                      <tr key={b.id} style={{ opacity: b.ativo ? 1 : 0.6 }}>
                        <td>
                          <FotoBrigadista brigadista={b} />
                        </td>
                        <td>
                          <b>{b.colaborador.nome}</b>
                          <div className="hint">
                            {b.colaborador.funcao}
                            {b.colaborador.setor ? ` · ${b.colaborador.setor}` : ''}
                          </div>
                          {b.colaborador.telefone ? (
                            <div className="hint">
                              <Icone nome="telefone" /> {b.colaborador.telefone}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <span className="pill" style={{ background: COR_FUNCAO[b.funcaoBrigada], color: '#fff' }}>
                            {ROTULO_FUNCAO_BRIGADA[b.funcaoBrigada]}
                          </span>
                          {!b.ativo ? <div className="hint">inativo</div> : null}
                        </td>
                        <td>
                          {b.area ? `${b.area.codigo} ${b.area.nome}` : <span className="hint">—</span>}
                          {b.turno ? <div className="hint">Turno {b.turno}</div> : null}
                        </td>
                        <td>
                          <span className={`pill ${PILL_TREINAMENTO[b.situacaoTreinamento]}`}>{ROTULO_SITUACAO_TREINAMENTO_BRIGADA[b.situacaoTreinamento]}</span>
                          {b.validadeTreinamento ? (
                            <div className="hint">
                              até {formatarDataIso(b.validadeTreinamento)} · {textoPrazo(b.diasParaVencerTreinamento)}
                            </div>
                          ) : null}
                          {b.dataTreinamento ? <div className="hint">treinado em {formatarDataIso(b.dataTreinamento)}</div> : null}
                          {b.certificadoUrl ? (
                            <div>
                              <a href={urlAbsoluta(b.certificadoUrl) ?? '#'} target="_blank" rel="noreferrer">
                                <Icone nome="documento" /> Certificado
                              </a>
                            </div>
                          ) : null}
                        </td>
                        <td>
                          {podeEscrever ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              <label className="btn btn-ghost btn-sm" title="Anexar foto">
                                <Icone nome="camera" /> Foto
                                <input
                                  type="file"
                                  hidden
                                  accept="image/*"
                                  onChange={(e) => {
                                    const arquivo = e.target.files?.[0];
                                    if (arquivo) void anexarBrigadista(b, 'foto', arquivo);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              <label className="btn btn-ghost btn-sm" title="Anexar certificado do treinamento">
                                <Icone nome="anexo" /> Certificado
                                <input
                                  type="file"
                                  hidden
                                  accept="application/pdf,image/*"
                                  onChange={(e) => {
                                    const arquivo = e.target.files?.[0];
                                    if (arquivo) void anexarBrigadista(b, 'certificado', arquivo);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => editarBrigadista(b)}>
                                Editar
                              </button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void removerBrigadista(b)}>
                                Remover
                              </button>
                            </div>
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

      {/* -------------------------------------------------- Extintores --- */}
      {aba === 'extintores' ? (
        <>
          {podeEscrever && formEAberto ? (
            <div className="painel">
              <h3>{editandoE ? 'Editar extintor' : 'Novo extintor'}</h3>
              <div className="filtros">
                <Campo label="Cliente" htmlFor="fe-cliente" obrigatorio erro={errosE.clienteId}>
                  <select id="fe-cliente" value={formE.clienteId} onChange={(e) => setFormE({ ...formE, clienteId: e.target.value, areaId: '' })}>
                    <option value="">Selecione...</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nomeFantasia}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Número / identificação" htmlFor="fe-numero" obrigatorio erro={errosE.numero}>
                  <input id="fe-numero" className="estreito mono" value={formE.numero} onChange={(e) => setFormE({ ...formE, numero: e.target.value })} placeholder="EXT-01" />
                </Campo>
                <Campo label="Tipo" htmlFor="fe-tipo" obrigatorio erro={errosE.tipo} ajuda={`Combate classe ${CLASSE_FOGO_EXTINTOR[formE.tipo]}`}>
                  <select id="fe-tipo" value={formE.tipo} onChange={(e) => setFormE({ ...formE, tipo: e.target.value as TipoExtintor })}>
                    {TIPOS_EXTINTOR.map((t) => (
                      <option key={t} value={t}>
                        {ROTULO_TIPO_EXTINTOR[t]} — classe {CLASSE_FOGO_EXTINTOR[t]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Capacidade" htmlFor="fe-cap" erro={errosE.capacidade}>
                  <input id="fe-cap" className="estreito" value={formE.capacidade} onChange={(e) => setFormE({ ...formE, capacidade: e.target.value })} placeholder="4 kg, 10 L, 6 kg" />
                </Campo>
                <Campo label="Área" htmlFor="fe-area" erro={errosE.areaId}>
                  <select id="fe-area" value={formE.areaId} disabled={!formE.clienteId} onChange={(e) => setFormE({ ...formE, areaId: e.target.value })}>
                    <option value="">Sem área específica</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.codigo} — {a.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Localização" htmlFor="fe-local" obrigatorio erro={errosE.localizacao}>
                  <input id="fe-local" value={formE.localizacao} onChange={(e) => setFormE({ ...formE, localizacao: e.target.value })} placeholder="Ex.: Corredor principal, ao lado do quadro elétrico" />
                </Campo>
                <Campo label="Validade da carga" htmlFor="fe-carga" erro={errosE.validadeCarga}>
                  <input id="fe-carga" type="date" value={formE.validadeCarga} onChange={(e) => setFormE({ ...formE, validadeCarga: e.target.value })} />
                </Campo>
                <Campo label="Validade do teste hidrostático" htmlFor="fe-teste" erro={errosE.validadeTesteHidrostatico} ajuda="A cada 5 anos (NBR 12962).">
                  <input id="fe-teste" type="date" value={formE.validadeTesteHidrostatico} onChange={(e) => setFormE({ ...formE, validadeTesteHidrostatico: e.target.value })} />
                </Campo>
                <Campo label="Última inspeção" htmlFor="fe-insp" erro={errosE.ultimaInspecao}>
                  <input id="fe-insp" type="date" value={formE.ultimaInspecao} onChange={(e) => setFormE({ ...formE, ultimaInspecao: e.target.value })} />
                </Campo>
                <Campo label="Situação" htmlFor="fe-sit" erro={errosE.situacao} ajuda="“Vencido” é derivado das validades automaticamente.">
                  <select id="fe-sit" value={formE.situacao} onChange={(e) => setFormE({ ...formE, situacao: e.target.value as SituacaoExtintor })}>
                    {SITUACOES_EXTINTOR.map((s) => (
                      <option key={s} value={s}>
                        {ROTULO_SITUACAO_EXTINTOR[s]}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
              <Campo label="Observações" htmlFor="fe-obs" erro={errosE.observacoes}>
                <input id="fe-obs" value={formE.observacoes} onChange={(e) => setFormE({ ...formE, observacoes: e.target.value })} />
              </Campo>
              {!formE.clienteId || !formE.numero.trim() || !formE.localizacao.trim() ? (
                <p className="hint alerta">Informe o cliente, o número e a localização para salvar.</p>
              ) : null}
              <div className="barra-acoes">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={salvando || !formE.clienteId || !formE.numero.trim() || !formE.localizacao.trim()}
                  onClick={() => void salvarExtintor()}
                >
                  {salvando ? 'Salvando...' : editandoE ? 'Salvar alterações' : 'Cadastrar extintor'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={cancelarExtintor}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}

          <div className="painel">
            <div className="filtros">
              <Campo label="Situação" htmlFor="fx-sit">
                <select id="fx-sit" value={filtroSituacao} onChange={(e) => setFiltroSituacao(e.target.value as '' | SituacaoExtintor)}>
                  <option value="">Todas</option>
                  {SITUACOES_EXTINTOR.map((s) => (
                    <option key={s} value={s}>
                      {ROTULO_SITUACAO_EXTINTOR[s]}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            {podeEscrever && !formEAberto ? (
              <div className="barra-acoes">
                <button type="button" className="btn btn-primary" onClick={novoExtintor}>
                  <Icone nome="mais" /> Novo extintor
                </button>
              </div>
            ) : null}

            {carregando ? (
              <div className="centro-tela">
                <div className="spinner" />
                Carregando...
              </div>
            ) : extintores.length === 0 ? (
              <div className="vazio">
                <div className="icone-vazio" aria-hidden="true">
                  <Icone nome="alerta" tamanho={22} />
                </div>
                <h4>Nenhum extintor cadastrado</h4>
                <p>Cadastre os extintores com número, tipo, localização e validades.</p>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nº</th>
                      <th>Tipo</th>
                      <th>Localização</th>
                      <th>Carga</th>
                      <th>Teste hidrostático</th>
                      <th>Última inspeção</th>
                      <th>Situação</th>
                      <th aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody>
                    {extintores.map((e) => (
                      <Fragment key={e.id}>
                        <tr>
                          <td className="mono">
                            <b>{e.numero}</b>
                          </td>
                          <td>
                            {ROTULO_TIPO_EXTINTOR[e.tipo]}
                            <div className="hint">
                              classe {CLASSE_FOGO_EXTINTOR[e.tipo]}
                              {e.capacidade ? ` · ${e.capacidade}` : ''}
                            </div>
                          </td>
                          <td>
                            {e.localizacao}
                            {e.area ? <div className="hint">{`${e.area.codigo} ${e.area.nome}`}</div> : null}
                          </td>
                          <td>
                            {e.validadeCarga ? (
                              <>
                                <span className={`pill ${e.diasParaVencerCarga !== null && e.diasParaVencerCarga < 0 ? 'bad' : e.diasParaVencerCarga !== null && e.diasParaVencerCarga <= 30 ? 'warn' : 'ok'}`}>
                                  {formatarDataIso(e.validadeCarga)}
                                </span>
                                <div className="hint">{textoPrazo(e.diasParaVencerCarga)}</div>
                              </>
                            ) : (
                              <span className="hint">—</span>
                            )}
                          </td>
                          <td>
                            {e.validadeTesteHidrostatico ? (
                              <>
                                <span className={`pill ${e.diasParaVencerTeste !== null && e.diasParaVencerTeste < 0 ? 'bad' : e.diasParaVencerTeste !== null && e.diasParaVencerTeste <= 30 ? 'warn' : 'ok'}`}>
                                  {formatarDataIso(e.validadeTesteHidrostatico)}
                                </span>
                                <div className="hint">{textoPrazo(e.diasParaVencerTeste)}</div>
                              </>
                            ) : (
                              <span className="hint">—</span>
                            )}
                          </td>
                          <td>{e.ultimaInspecao ? formatarDataIso(e.ultimaInspecao) : <span className="hint">nunca</span>}</td>
                          <td>
                            <span className={`pill ${PILL_EXTINTOR[e.situacaoEfetiva]}`}>{ROTULO_SITUACAO_EXTINTOR[e.situacaoEfetiva]}</span>
                            {e.observacoes ? <div className="hint">{e.observacoes}</div> : null}
                          </td>
                          <td>
                            {podeEscrever ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                <button type="button" className="btn btn-outline btn-sm" onClick={() => (inspecionando === e.id ? setInspecionando(null) : abrirInspecao(e))}>
                                  <Icone nome="ok" /> Registrar inspeção
                                </button>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => editarExtintor(e)}>
                                  Editar
                                </button>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void removerExtintor(e)}>
                                  Remover
                                </button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                        {inspecionando === e.id ? (
                          <tr>
                            <td colSpan={8} style={{ background: 'var(--bg-soft, #f7f8fa)' }}>
                              <div className="filtros" style={{ alignItems: 'end' }}>
                                <Campo label="Data da inspeção" htmlFor={`ins-data-${e.id}`} obrigatorio>
                                  <input id={`ins-data-${e.id}`} type="date" max={hojeIso()} value={inspecao.data} onChange={(ev) => setInspecao({ ...inspecao, data: ev.target.value })} />
                                </Campo>
                                <Campo label="Situação observada" htmlFor={`ins-sit-${e.id}`}>
                                  <select id={`ins-sit-${e.id}`} value={inspecao.situacao} onChange={(ev) => setInspecao({ ...inspecao, situacao: ev.target.value as SituacaoExtintor })}>
                                    {SITUACOES_EXTINTOR.map((s) => (
                                      <option key={s} value={s}>
                                        {ROTULO_SITUACAO_EXTINTOR[s]}
                                      </option>
                                    ))}
                                  </select>
                                </Campo>
                                <Campo label="Observações" htmlFor={`ins-obs-${e.id}`}>
                                  <input id={`ins-obs-${e.id}`} value={inspecao.observacoes} onChange={(ev) => setInspecao({ ...inspecao, observacoes: ev.target.value })} placeholder="Lacre, manômetro, sinalização, acesso..." />
                                </Campo>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button type="button" className="btn btn-primary btn-sm" disabled={salvando || !inspecao.data} onClick={() => void registrarInspecao()}>
                                    {salvando ? 'Gravando...' : 'Gravar inspeção'}
                                  </button>
                                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setInspecionando(null)}>
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      {/* ------------------------------------------------- Organograma --- */}
      {aba === 'organograma' ? (
        <>
          <div className="painel sem-impressao">
            <div className="barra-acoes" style={{ justifyContent: 'space-between' }}>
              <p className="hint" style={{ margin: 0 }}>
                Gerado automaticamente a partir dos brigadistas ativos{nomeCliente ? ` de ${nomeCliente}` : ''}. Atualize a aba
                Brigadistas para alterar.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={ativos.length === 0}>
                <Icone nome="impressora" /> Imprimir organograma
              </button>
            </div>
            {!clienteId ? <p className="hint alerta">Selecione um cliente no topo para gerar o organograma de uma única brigada.</p> : null}
          </div>

          <div className="painel folha">
            <div className="folha-cabecalho">
              <div>
                <h2>Organograma da brigada de incêndio</h2>
                <div className="hint">
                  {nomeCliente ?? 'Todos os clientes'} · {ativos.length} {ativos.length === 1 ? 'brigadista ativo' : 'brigadistas ativos'} · emitido em{' '}
                  {formatarDataIso(new Date().toISOString())}
                </div>
              </div>
            </div>

            {ativos.length === 0 ? (
              <div className="vazio">
                <div className="icone-vazio" aria-hidden="true">
                  <Icone nome="pessoas" tamanho={22} />
                </div>
                <h4>Sem brigadistas ativos</h4>
                <p>Inclua os brigadistas na aba correspondente para o organograma ser montado.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                <NivelOrganograma titulo="Coordenação" membros={coordenadores} vazio="Coordenador não definido" />
                {chefes.length > 0 || coordenadores.length > 0 ? <Conector /> : null}
                <NivelOrganograma titulo="Chefia de brigada" membros={chefes} vazio="Chefe de brigada não definido" />
                {equipes.length > 0 ? <Conector /> : null}
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16, width: '100%' }}>
                  {equipes.map((g) => (
                    <div
                      key={g.titulo}
                      style={{
                        border: '1px solid #cbd5e1',
                        borderRadius: 10,
                        padding: 10,
                        minWidth: 220,
                        flex: '1 1 260px',
                        maxWidth: 360,
                        breakInside: 'avoid',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13, textAlign: 'center', marginBottom: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
                        {g.titulo}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {g.membros.map((b) => (
                          <CaixaBrigadista key={b.id} brigadista={b} compacta />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 18, fontSize: 12 }} className="hint">
              {FUNCOES_BRIGADA.map((f) => (
                <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: COR_FUNCAO[f], display: 'inline-block' }} />
                  {ROTULO_FUNCAO_BRIGADA[f]}
                </span>
              ))}
              <span>Emergência: Bombeiros 193 · SAMU 192</span>
            </div>
          </div>
        </>
      ) : null}

      {/* -------------------------------------------- Mapa de extintores --- */}
      {aba === 'mapa' ? (
        <>
          <div className="painel sem-impressao">
            <div className="barra-acoes" style={{ justifyContent: 'space-between' }}>
              <p className="hint" style={{ margin: 0 }}>
                Relação de extintores por área{nomeCliente ? ` de ${nomeCliente}` : ''}, com tipo, classe de fogo e situação — para afixar no
                quadro da brigada.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={extintores.length === 0}>
                <Icone nome="impressora" /> Imprimir mapa
              </button>
            </div>
          </div>

          <div className="painel folha">
            <div className="folha-cabecalho">
              <div>
                <h2>Mapa de extintores</h2>
                <div className="hint">
                  {nomeCliente ?? 'Todos os clientes'} · {extintores.length} {extintores.length === 1 ? 'extintor' : 'extintores'} · emitido em{' '}
                  {formatarDataIso(new Date().toISOString())}
                </div>
              </div>
              {resumo ? (
                <div className="meta">
                  {resumo.extintores.porTipo
                    .filter((t) => t.total > 0)
                    .map((t) => (
                      <div key={t.tipo} className="hint">
                        {t.rotulo}: <b>{t.total}</b>
                      </div>
                    ))}
                </div>
              ) : null}
            </div>

            {extintores.length === 0 ? (
              <div className="vazio">
                <div className="icone-vazio" aria-hidden="true">
                  <Icone nome="mapa" tamanho={22} />
                </div>
                <h4>Nenhum extintor cadastrado</h4>
                <p>Cadastre os extintores na aba correspondente.</p>
              </div>
            ) : (
              extintoresPorArea.map((g) => (
                <div key={g.titulo} className="folha-secao" style={{ breakInside: 'avoid' }}>
                  <h4>
                    <Icone nome="local" /> {g.titulo} <span className="hint">({g.itens.length})</span>
                  </h4>
                  <div className="tbl-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Nº</th>
                          <th>Tipo</th>
                          <th>Classe</th>
                          <th>Capacidade</th>
                          <th>Localização</th>
                          <th>Carga</th>
                          <th>Teste hidr.</th>
                          <th>Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.itens.map((e) => (
                          <tr key={e.id}>
                            <td className="mono">
                              <b>{e.numero}</b>
                            </td>
                            <td>{ROTULO_TIPO_EXTINTOR[e.tipo]}</td>
                            <td>{CLASSE_FOGO_EXTINTOR[e.tipo]}</td>
                            <td>{e.capacidade ?? '—'}</td>
                            <td>{e.localizacao}</td>
                            <td>{formatarDataIso(e.validadeCarga)}</td>
                            <td>{formatarDataIso(e.validadeTesteHidrostatico)}</td>
                            <td>
                              <span className={`pill ${PILL_EXTINTOR[e.situacaoEfetiva]}`}>{ROTULO_SITUACAO_EXTINTOR[e.situacaoEfetiva]}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}

            <div className="folha-assinatura">
              <div>
                <div style={{ height: 50 }} />
                Chefe da brigada
              </div>
              <div>
                <div style={{ height: 50 }} />
                Responsável pela segurança do trabalho
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Pecas do organograma                                                        */
/* -------------------------------------------------------------------------- */

function Conector() {
  return <div aria-hidden="true" style={{ width: 2, height: 22, background: '#94a3b8', margin: '2px 0' }} />;
}

function NivelOrganograma({ titulo, membros, vazio }: { titulo: string; membros: BrigadistaApi[]; vazio: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="hint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        {titulo}
      </div>
      {membros.length === 0 ? (
        <div style={{ border: '1px dashed #cbd5e1', borderRadius: 10, padding: '10px 18px', color: '#94a3b8', fontSize: 13 }}>{vazio}</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
          {membros.map((b) => (
            <CaixaBrigadista key={b.id} brigadista={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function CaixaBrigadista({ brigadista, compacta = false }: { brigadista: BrigadistaApi; compacta?: boolean }) {
  const cor = COR_FUNCAO[brigadista.funcaoBrigada];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        border: `1px solid ${cor}`,
        borderLeft: `5px solid ${cor}`,
        borderRadius: 8,
        padding: compacta ? '6px 8px' : '8px 12px',
        minWidth: compacta ? undefined : 220,
        background: '#fff',
        breakInside: 'avoid',
      }}
    >
      <FotoBrigadista brigadista={brigadista} tamanho={compacta ? 36 : 48} />
      <div style={{ textAlign: 'left', lineHeight: 1.25, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: compacta ? 13 : 14 }}>{brigadista.colaborador.nome}</div>
        <div style={{ fontSize: 12, color: cor, fontWeight: 600 }}>{ROTULO_FUNCAO_BRIGADA[brigadista.funcaoBrigada]}</div>
        <div className="hint" style={{ fontSize: 11 }}>
          {brigadista.colaborador.funcao}
          {brigadista.colaborador.telefone ? ` · ${brigadista.colaborador.telefone}` : ''}
        </div>
        {!compacta && brigadista.area ? (
          <div className="hint" style={{ fontSize: 11 }}>
            {brigadista.area.codigo} {brigadista.area.nome}
            {brigadista.turno ? ` · ${brigadista.turno}` : ''}
          </div>
        ) : null}
      </div>
    </div>
  );
}
