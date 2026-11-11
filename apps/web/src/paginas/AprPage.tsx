import { useCallback, useEffect, useState } from 'react';
import {
  MODELOS_APR,
  ROTULO_MODELO_APR,
  ROTULO_SITUACAO_APR,
  ROTULO_TIPO_SERVICO_APR,
  SITUACOES_APR,
  TIPOS_SERVICO_APR,
  type AprEtapa,
  type ModeloApr,
  type SituacaoApr,
  type TipoServicoApr,
} from '@safetyguard/shared';
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
  modelo?: ModeloApr | null;
  atividade: string;
  local: string | null;
  dataInicio: string;
  dataFim: string | null;
  responsavel: string;
  tiposServico?: TipoServicoApr[] | null;
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

interface VerificacaoApr {
  carimbada: boolean;
  valida: boolean | null;
  hash?: string;
  aprovadaPor?: string;
  aprovadaEm?: string;
  mensagem: string;
}

const PILL_APR: Record<SituacaoApr, string> = { RASCUNHO: 'warn', APROVADA: 'ok', ENCERRADA: 'gray' };
const ETAPA_VAZIA: AprEtapa = { etapa: '', perigos: '', riscos: '', medidasControle: '', epis: '' };
const NOVA_VAZIA = {
  clienteId: '',
  areaId: '',
  terceiroId: '',
  modelo: 'APR' as ModeloApr,
  atividade: '',
  local: '',
  dataInicio: '',
  dataFim: '',
  responsavel: '',
  tiposServico: [] as TipoServicoApr[],
  etapas: [{ ...ETAPA_VAZIA }],
};

/** Titulos com acento para a tela/folha (o shared guarda sem acento). */
const TITULO_MODELO: Record<ModeloApr, string> = {
  APR: 'APR — Análise Preliminar de Risco',
  AST: 'AST — Análise de Segurança da Tarefa',
};
const OPCAO_MODELO: Record<ModeloApr, string> = {
  APR: 'APR — Análise Preliminar de Risco',
  AST: 'AST — Análise de Segurança da Tarefa (COMAU)',
};
const TIPO_SERVICO_TELA: Record<TipoServicoApr, string> = {
  ESPACO_CONFINADO: 'Ambiente confinado (NR-33)',
  TRABALHO_A_QUENTE: 'Trabalho a quente (NR-34)',
  TRABALHO_EM_ALTURA: 'Trabalho em altura (NR-35)',
  ICAMENTO_DE_CARGA: 'Içamento de carga (NR-11)',
  ESCAVACAO: 'Escavação (NR-18)',
  REQUER_BLOQUEIO: 'Requer bloqueio e etiquetagem (LOTO)',
};

function rotuloModelo(modelo: ModeloApr): string {
  return OPCAO_MODELO[modelo] ?? ROTULO_MODELO_APR[modelo];
}
function rotuloTipo(tipo: TipoServicoApr): string {
  return TIPO_SERVICO_TELA[tipo] ?? ROTULO_TIPO_SERVICO_APR[tipo];
}

/**
 * APR — a atividade decomposta em etapas, cada uma com perigos, riscos e
 * controles. Rascunho se edita; aprovada se congela e recebe carimbo; para
 * mudar, gera-se nova versao com o mesmo codigo. O modelo AST (COMAU) usa a
 * mesma estrutura com outro titulo.
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
  const [modeloFiltro, setModeloFiltro] = useState('');

  const [form, setForm] = useState(NOVA_VAZIA);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [aberta, setAberta] = useState<AprApi | null>(null);
  const [verificacao, setVerificacao] = useState<VerificacaoApr | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [logos, setLogos] = useState<{ empresa: string | null; empresaNome: string | null; cliente: string | null }>({
    empresa: null,
    empresaNome: null,
    cliente: null,
  });

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const p = new URLSearchParams({ porPagina: '50' });
      if (clienteId) p.set('clienteId', clienteId);
      if (situacao) p.set('situacao', situacao);
      if (modeloFiltro) p.set('modelo', modeloFiltro);
      const lista = await api.get<{ itens: AprApi[]; total: number }>(`/aprs?${p.toString()}`);
      setItens(lista.itens);
      setTotal(lista.total);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar as APRs.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [clienteId, situacao, modeloFiltro, mostrar]);

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

  // Ao abrir uma APR: limpa a verificacao anterior e carrega os logos do cabecalho.
  const abertaId = aberta?.id ?? null;
  const abertaClienteId = aberta?.cliente?.id ?? null;
  useEffect(() => {
    setVerificacao(null);
    if (!abertaId) return;
    let ativo = true;
    void Promise.all([
      api.get<{ logoUrl: string | null; nomeFantasia: string | null }>('/empresa').catch(() => null),
      abertaClienteId ? api.get<{ logoUrl: string | null }>(`/clientes/${abertaClienteId}`).catch(() => null) : Promise.resolve(null),
    ]).then(([empresa, cliente]) => {
      if (!ativo) return;
      setLogos({ empresa: urlAbsoluta(empresa?.logoUrl), empresaNome: empresa?.nomeFantasia ?? null, cliente: urlAbsoluta(cliente?.logoUrl) });
    });
    return () => {
      ativo = false;
    };
  }, [abertaId, abertaClienteId]);

  function definirEtapa(indice: number, campo: keyof AprEtapa, valor: string) {
    setForm({ ...form, etapas: form.etapas.map((e, i) => (i === indice ? { ...e, [campo]: valor } : e)) });
  }

  function alternarTipo(tipo: TipoServicoApr, marcado: boolean) {
    const conjunto = new Set(form.tiposServico);
    if (marcado) conjunto.add(tipo);
    else conjunto.delete(tipo);
    setForm({ ...form, tiposServico: TIPOS_SERVICO_APR.filter((t) => conjunto.has(t)) });
  }

  /** Validacao local — o botao nunca fica desabilitado sem dizer o que falta. */
  function validarLocal(): Record<string, string> {
    const falta: Record<string, string> = {};
    if (!form.clienteId) falta.clienteId = 'Informe o cliente.';
    if (form.atividade.trim().length < 3) falta.atividade = 'Descreva a atividade (ao menos 3 letras).';
    if (!form.dataInicio) falta.dataInicio = 'Informe a data de início.';
    if (form.responsavel.trim().length < 3) falta.responsavel = 'Informe o responsável (ao menos 3 letras).';
    form.etapas.forEach((e, i) => {
      if (e.etapa.trim().length < 3) falta[`etapas.${i}.etapa`] = 'Descreva a etapa.';
      if (e.perigos.trim().length < 3) falta[`etapas.${i}.perigos`] = 'Informe os perigos.';
      if (e.riscos.trim().length < 3) falta[`etapas.${i}.riscos`] = 'Informe os riscos.';
      if (e.medidasControle.trim().length < 3) falta[`etapas.${i}.medidasControle`] = 'Informe as medidas de controle.';
    });
    return falta;
  }

  async function salvar() {
    const falta = validarLocal();
    setErros(falta);
    if (Object.keys(falta).length > 0) {
      const n = Object.keys(falta).length;
      mostrar(`Corrija ${n} ${n === 1 ? 'campo destacado' : 'campos destacados'}.`, 'erro');
      return;
    }
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
        mostrar(`${form.modelo} atualizada.`, 'sucesso');
      } else {
        const criada = await api.post<AprApi>('/aprs', corpo);
        mostrar(`${criada.codigo} criada como rascunho.`, 'sucesso');
      }
      setForm(NOVA_VAZIA);
      setEditandoId(null);
      setErros({});
      void carregar();
    } catch (erro) {
      if (erro instanceof ErroApi) {
        const porCampo: Record<string, string> = {};
        for (const [campo, mensagens] of Object.entries(erro.campos)) porCampo[campo] = mensagens[0] ?? 'Valor inválido.';
        setErros(porCampo);
        mostrar(erro.mensagemAmigavel(), 'erro');
      } else {
        mostrar('Falha ao salvar.', 'erro');
      }
    } finally {
      setSalvando(false);
    }
  }

  function editar(apr: AprApi) {
    setEditandoId(apr.id);
    setAberta(null);
    setErros({});
    setForm({
      clienteId: apr.cliente?.id ?? '',
      areaId: apr.area?.id ?? '',
      terceiroId: apr.terceiro?.id ?? '',
      modelo: apr.modelo ?? 'APR',
      atividade: apr.atividade,
      local: apr.local ?? '',
      dataInicio: apr.dataInicio.slice(0, 10),
      dataFim: apr.dataFim?.slice(0, 10) ?? '',
      responsavel: apr.responsavel,
      tiposServico: apr.tiposServico ?? [],
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

  async function excluir(apr: AprApi) {
    if (!window.confirm(`Excluir ${apr.modelo ?? 'APR'} ${apr.codigo} v${apr.versao}? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/aprs/${apr.id}`);
      mostrar(`${apr.codigo} v${apr.versao} excluída.`, 'sucesso');
      if (aberta?.id === apr.id) setAberta(null);
      if (editandoId === apr.id) {
        setEditandoId(null);
        setForm(NOVA_VAZIA);
      }
      void carregar();
    } catch (erro) {
      if (erro instanceof ErroApi && (erro.status === 400 || erro.codigo === 'APR_APROVADA')) {
        mostrar(
          erro.codigo === 'APR_APROVADA'
            ? 'APR aprovada não pode ser excluída — encerre-a primeiro (botão Encerrar) e depois exclua.'
            : erro.message,
          'erro',
        );
      } else {
        mostrar(erro instanceof Error ? erro.message : 'Falha ao excluir.', 'erro');
      }
    }
  }

  async function verificar(apr: AprApi) {
    setVerificando(true);
    try {
      setVerificacao(await api.get<VerificacaoApr>(`/aprs/${apr.id}/verificar`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao verificar o carimbo.', 'erro');
    } finally {
      setVerificando(false);
    }
  }

  if (aberta) {
    const apr = aberta;
    const modelo: ModeloApr = apr.modelo ?? 'APR';
    const tipos = new Set(apr.tiposServico ?? []);
    const corVerificacao =
      verificacao?.valida === true
        ? { background: 'var(--green-light)', color: 'var(--green)', borda: 'var(--green)' }
        : verificacao?.valida === false
          ? { background: 'var(--red-light)', color: 'var(--red)', borda: 'var(--red)' }
          : { background: 'transparent', color: 'var(--texto-medio)', borda: 'var(--border)' };
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
              <button type="button" className="btn btn-ghost" onClick={() => void verificar(apr)} disabled={verificando}>
                <Icone nome="escudo" /> {verificando ? 'Verificando...' : 'Verificar autenticidade'}
              </button>
              {podeEscrever ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void excluir(apr)}
                  title={apr.situacao === 'APROVADA' ? 'APR aprovada: encerre antes de excluir.' : undefined}
                >
                  Excluir
                </button>
              ) : null}
              <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
                <Icone nome="impressora" /> Imprimir
              </button>
            </div>
          </div>
          <p className="hint">A folha é impressa em A4 paisagem.</p>
        </div>

        <div className="painel folha folha-paisagem" style={{ maxWidth: 1120 }}>
          <div className="folha-cabecalho">
            <div>
              {logos.empresa || logos.cliente ? (
                <div className="folha-logos" style={{ marginBottom: 8 }}>
                  {logos.empresa ? <img src={logos.empresa} alt={logos.empresaNome ?? 'Consultoria'} /> : null}
                  {logos.cliente ? <img src={logos.cliente} alt={apr.cliente?.nomeFantasia ?? 'Cliente'} /> : null}
                </div>
              ) : null}
              <h2>
                {TITULO_MODELO[modelo]} — {apr.codigo} <span className="hint">v{apr.versao}</span>
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

          <div style={{ border: '2px solid var(--primary)', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--texto-medio)' }}>Local da atividade</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{apr.local ?? '—'}</div>
          </div>

          <dl className="folha-dados" style={{ marginBottom: 12 }}>
            <div>
              <dt>Atividade</dt>
              <dd>{apr.atividade}</dd>
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
            <h4>Tipo de serviço</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '4px 16px', fontSize: 13 }}>
              {TIPOS_SERVICO_APR.map((tipo) => (
                <div key={tipo} aria-label={`${rotuloTipo(tipo)}: ${tipos.has(tipo) ? 'marcado' : 'não marcado'}`}>
                  <span style={{ fontSize: 16, marginRight: 6 }} aria-hidden="true">
                    {tipos.has(tipo) ? '☒' : '☐'}
                  </span>
                  {tipos.has(tipo) ? <b>{rotuloTipo(tipo)}</b> : rotuloTipo(tipo)}
                </div>
              ))}
            </div>
          </div>

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

          <div className="folha-secao" style={{ marginTop: 18 }}>
            <h4>Autenticidade da assinatura eletrônica</h4>
            <p style={{ fontSize: 12, margin: '0 0 6px' }}>
              Na aprovação, o SafetyGuard grava um carimbo <b>SHA-256</b> calculado sobre o conteúdo das etapas, o nome do
              aprovador e o momento da aprovação. O carimbo liga esses três elementos: qualquer alteração posterior nas etapas,
              no aprovador ou na data/hora produz outro hash e invalida o carimbo. Para conferir, abra {apr.codigo} v{apr.versao} no
              SafetyGuard e use <b>Verificar autenticidade</b>: o sistema recalcula o hash e compara com o registrado.
            </p>
            {apr.aprovacaoHash ? (
              <div className="carimbo">carimbo sha256 {apr.aprovacaoHash}</div>
            ) : (
              <p className="hint">Ainda não aprovada — sem carimbo para conferir.</p>
            )}
            <div className="sem-impressao" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => void verificar(apr)} disabled={verificando}>
                <Icone nome="escudo" /> {verificando ? 'Verificando...' : 'Verificar autenticidade'}
              </button>
            </div>
            {verificacao ? (
              <div
                role="status"
                style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: `1px solid ${corVerificacao.borda}`,
                  background: corVerificacao.background,
                  color: corVerificacao.color,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {verificacao.valida === true ? '✔ ' : verificacao.valida === false ? '✖ ' : ''}
                {verificacao.mensagem}
                {verificacao.aprovadaEm ? (
                  <div style={{ fontWeight: 400, fontSize: 12 }}>
                    Aprovador: {verificacao.aprovadaPor} · {new Date(verificacao.aprovadaEm).toLocaleString('pt-BR')} · conferido em{' '}
                    {new Date().toLocaleString('pt-BR')}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="painel">
        <h3>APR / AST — Análise de risco da atividade</h3>
        <p className="desc">
          A atividade decomposta em etapas, cada uma com perigos, riscos e medidas de controle. Rascunho se edita;
          aprovada se congela e recebe carimbo. Para mudar uma APR aprovada, gera-se nova versão com o mesmo código. O modelo
          AST (Análise de Segurança da Tarefa, padrão COMAU) segue a mesma estrutura.
        </p>
      </div>

      {podeEscrever ? (
        <div className="painel">
          <h3>{editandoId ? `Editar ${form.modelo} (rascunho)` : `Nova ${form.modelo}`}</h3>
          <div className="filtros">
            <Campo label="Modelo" htmlFor="apr-modelo" obrigatorio erro={erros.modelo}>
              <select id="apr-modelo" value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value as ModeloApr })}>
                {MODELOS_APR.map((m) => (
                  <option key={m} value={m}>
                    {rotuloModelo(m)}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Cliente" htmlFor="apr-cliente" obrigatorio erro={erros.clienteId}>
              <select id="apr-cliente" value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value, areaId: '' })}>
                <option value="">Selecione...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nomeFantasia}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Área" htmlFor="apr-area" erro={erros.areaId}>
              <select id="apr-area" value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })}>
                <option value="">Sem área</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo} — {a.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Início" htmlFor="apr-ini" obrigatorio erro={erros.dataInicio}>
              <input id="apr-ini" type="date" value={form.dataInicio} onChange={(e) => setForm({ ...form, dataInicio: e.target.value })} />
            </Campo>
            <Campo label="Fim" htmlFor="apr-fim" erro={erros.dataFim}>
              <input id="apr-fim" type="date" value={form.dataFim} onChange={(e) => setForm({ ...form, dataFim: e.target.value })} />
            </Campo>
          </div>

          <div style={{ borderLeft: '4px solid var(--primary)', paddingLeft: 12, margin: '4px 0 12px' }}>
            <Campo
              label="Local da atividade"
              htmlFor="apr-local"
              erro={erros.local}
              ajuda="Onde o serviço será executado (prédio, setor, linha, equipamento). Sai em destaque na folha."
            >
              <input
                id="apr-local"
                value={form.local}
                maxLength={200}
                style={{ fontSize: 15, fontWeight: 600 }}
                placeholder="Ex.: Galpão 2 — linha de pintura, cabine 3"
                onChange={(e) => setForm({ ...form, local: e.target.value })}
              />
            </Campo>
          </div>

          <div className="grid2">
            <Campo label="Atividade" htmlFor="apr-ativ" obrigatorio erro={erros.atividade}>
              <input id="apr-ativ" value={form.atividade} onChange={(e) => setForm({ ...form, atividade: e.target.value })} />
            </Campo>
            <Campo label="Responsável pela elaboração" htmlFor="apr-resp" obrigatorio erro={erros.responsavel}>
              <input id="apr-resp" value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} />
            </Campo>
          </div>

          <Campo label="Tipo de serviço" erro={erros.tiposServico} ajuda="Marque todos que se aplicam — exigem permissão e controles próprios.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '4px 16px' }}>
              {TIPOS_SERVICO_APR.map((tipo) => (
                <label key={tipo} className="check-linha">
                  <input type="checkbox" checked={form.tiposServico.includes(tipo)} onChange={(e) => alternarTipo(tipo, e.target.checked)} /> {rotuloTipo(tipo)}
                </label>
              ))}
            </div>
          </Campo>

          <h4>Etapas</h4>
          {erros.etapas ? <p className="hint alerta">{erros.etapas}</p> : null}
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
                <Campo label="O que se faz" htmlFor={`et-${i}-etapa`} obrigatorio erro={erros[`etapas.${i}.etapa`]}>
                  <input id={`et-${i}-etapa`} value={e.etapa} onChange={(ev) => definirEtapa(i, 'etapa', ev.target.value)} />
                </Campo>
                <Campo label="EPIs" htmlFor={`et-${i}-epis`} erro={erros[`etapas.${i}.epis`]}>
                  <input id={`et-${i}-epis`} value={e.epis ?? ''} onChange={(ev) => definirEtapa(i, 'epis', ev.target.value)} />
                </Campo>
              </div>
              <div className="grid2">
                <Campo label="Perigos" htmlFor={`et-${i}-perigos`} obrigatorio erro={erros[`etapas.${i}.perigos`]}>
                  <textarea id={`et-${i}-perigos`} rows={2} value={e.perigos} onChange={(ev) => definirEtapa(i, 'perigos', ev.target.value)} />
                </Campo>
                <Campo label="Riscos" htmlFor={`et-${i}-riscos`} obrigatorio erro={erros[`etapas.${i}.riscos`]}>
                  <textarea id={`et-${i}-riscos`} rows={2} value={e.riscos} onChange={(ev) => definirEtapa(i, 'riscos', ev.target.value)} />
                </Campo>
              </div>
              <Campo label="Medidas de controle" htmlFor={`et-${i}-medidas`} obrigatorio erro={erros[`etapas.${i}.medidasControle`]}>
                <textarea id={`et-${i}-medidas`} rows={2} value={e.medidasControle} onChange={(ev) => definirEtapa(i, 'medidasControle', ev.target.value)} />
              </Campo>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, etapas: [...form.etapas, { ...ETAPA_VAZIA }] })}>
            <Icone nome="mais" /> Adicionar etapa
          </button>

          <div className="barra-acoes">
            <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void salvar()}>
              {salvando ? 'Salvando...' : editandoId ? 'Salvar rascunho' : `Criar ${form.modelo}`}
            </button>
            {editandoId ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEditandoId(null);
                  setForm(NOVA_VAZIA);
                  setErros({});
                }}
              >
                Cancelar
              </button>
            ) : null}
            <span className="hint">Campos com * são obrigatórios. Se faltar algo, o campo é destacado ao clicar.</span>
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
          <Campo label="Modelo" htmlFor="fapr-modelo">
            <select id="fapr-modelo" value={modeloFiltro} onChange={(e) => setModeloFiltro(e.target.value)}>
              <option value="">Todos</option>
              {MODELOS_APR.map((m) => (
                <option key={m} value={m}>
                  {rotuloModelo(m)}
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
                    <th>Local / onde</th>
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
                        <span className="pill info" style={{ marginRight: 4 }}>
                          {apr.modelo ?? 'APR'}
                        </span>
                        {apr.codigo} <span className="hint">v{apr.versao}</span>
                      </td>
                      <td>
                        <b>{apr.atividade}</b>
                        <div className="hint">{apr.responsavel}</div>
                        {apr.tiposServico && apr.tiposServico.length > 0 ? (
                          <div className="hint">{apr.tiposServico.map((t) => rotuloTipo(t)).join(' · ')}</div>
                        ) : null}
                      </td>
                      <td>
                        {apr.local ? <b>{apr.local}</b> : null}
                        <div className={apr.local ? 'hint' : undefined}>
                          {apr.cliente?.nomeFantasia}
                          {apr.area ? ` · ${apr.area.nome}` : ''}
                        </div>
                      </td>
                      <td>{formatarDataIso(apr.dataInicio)}</td>
                      <td className="num-col">{apr.etapas.length}</td>
                      <td>
                        <span className={`pill ${PILL_APR[apr.situacao]}`}>{apr.rotulos?.situacao ?? apr.situacao}</span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAberta(apr)}>
                          Abrir
                        </button>
                        {podeEscrever && apr.situacao !== 'APROVADA' ? (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluir(apr)}>
                            Excluir
                          </button>
                        ) : null}
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
