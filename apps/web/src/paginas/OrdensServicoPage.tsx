import { useCallback, useEffect, useState } from 'react';
import { ROTULO_SITUACAO_OS, type OsEpi, type OsRisco, type OsTreinamento, type SituacaoOs } from '@safetyguard/shared';
import { AssinaturaCanvas } from '../componentes/AssinaturaCanvas';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import { useSessao } from '../lib/sessao';

interface OsApi {
  id: string;
  codigo: string;
  versao: number;
  funcao: string;
  setor: string | null;
  grauRisco: string;
  riscos: OsRisco[];
  episObrigatorios: OsEpi[];
  treinamentosExigidos: OsTreinamento[];
  medidasPreventivas: string | null;
  situacao: SituacaoOs;
  geradaEm: string;
  geradaPor: string;
  cienciaEm: string | null;
  cienciaAssinaturaUrl: string | null;
  cienciaHash: string | null;
  arquivoAssinadoUrl?: string | null;
  cliente?: { id: string; nomeFantasia: string };
  colaborador?: { id: string; nome: string; cpf: string; matricula: string | null; funcao: string; setor: string | null };
  rotulos?: { situacao: string };
}

interface EmpresaApi {
  nomeFantasia: string | null;
  logoUrl: string | null;
  textoPadraoOs: string | null;
}

interface VerificacaoOs {
  carimbada: boolean;
  valida: boolean | null;
  hash?: string;
  cienciaEm?: string;
  mensagem: string;
}

interface Resumo {
  os: { emitidas: number; assinadas: number; semOs: number };
}

const PILL_OS: Record<SituacaoOs, string> = { EMITIDA: 'warn', ASSINADA: 'ok', SUBSTITUIDA: 'gray' };
const PILL_TREINO: Record<OsTreinamento['situacao'], string> = { EM_DIA: 'ok', A_VENCER: 'warn', VENCIDO: 'bad', NAO_REALIZADO: 'bad' };
const ROTULO_TREINO: Record<OsTreinamento['situacao'], string> = {
  EM_DIA: 'Em dia',
  A_VENCER: 'A vencer',
  VENCIDO: 'Vencido',
  NAO_REALIZADO: 'Não realizado',
};

/**
 * Ordem de Servico por funcao (NR-1, 1.4.4). Gerada a partir dos cadastros —
 * inventario de riscos, EPIs entregues, matriz de capacitacao — e assinada
 * pelo trabalhador com carimbo.
 */
export function OrdensServicoPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('saude:escrever');

  const [carregando, setCarregando] = useState(true);
  const [itens, setItens] = useState<OsApi[]>([]);
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [clientes, setClientes] = useState<Array<{ id: string; nomeFantasia: string }>>([]);
  const [colaboradores, setColaboradores] = useState<Array<{ id: string; nome: string; funcao: string }>>([]);
  const [clienteId, setClienteId] = useState('');
  const [busca, setBusca] = useState('');
  const [incluirSubstituidas, setIncluirSubstituidas] = useState(false);

  const [gerar, setGerar] = useState({ colaboradorId: '', medidasPreventivas: '' });
  const [gerando, setGerando] = useState(false);
  const [aberta, setAberta] = useState<OsApi | null>(null);

  // OS aberta: texto padrao, logos, edicao, assinatura e verificacao.
  const [empresa, setEmpresa] = useState<EmpresaApi | null>(null);
  const [logoCliente, setLogoCliente] = useState<string | null>(null);
  const [editandoTexto, setEditandoTexto] = useState(false);
  const [textoEdicao, setTextoEdicao] = useState('');
  const [erroTexto, setErroTexto] = useState<string | undefined>(undefined);
  const [assinandoTela, setAssinandoTela] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [verificacao, setVerificacao] = useState<VerificacaoOs | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const p = new URLSearchParams({ porPagina: '50' });
      if (clienteId) p.set('clienteId', clienteId);
      if (busca) p.set('busca', busca);
      if (incluirSubstituidas) p.set('situacao', 'SUBSTITUIDA');
      const escopo = clienteId ? `?clienteId=${clienteId}` : '';
      const [lista, cards] = await Promise.all([
        api.get<{ itens: OsApi[]; total: number }>(`/ordens-servico?${p.toString()}`),
        api.get<Resumo>(`/documentacao-tecnica/resumo${escopo}`),
      ]);
      setItens(lista.itens);
      setTotal(lista.total);
      setResumo(cards);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar as ordens de serviço.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [busca, clienteId, incluirSubstituidas, mostrar]);

  useEffect(() => {
    void api.get<Array<{ id: string; nomeFantasia: string }>>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
    void api.get<Array<{ id: string; nome: string; funcao: string }>>('/colaboradores/opcoes').then(setColaboradores).catch(() => setColaboradores([]));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    void api.get<EmpresaApi>('/empresa').then(setEmpresa).catch(() => setEmpresa(null));
  }, []);

  // Ao trocar de OS: zera os estados da folha e busca o logo do cliente.
  const abertaId = aberta?.id ?? null;
  const abertaClienteId = aberta?.cliente?.id ?? null;
  useEffect(() => {
    setEditandoTexto(false);
    setAssinandoTela(false);
    setVerificacao(null);
    setErroTexto(undefined);
  }, [abertaId]);

  useEffect(() => {
    setLogoCliente(null);
    if (!abertaClienteId) return;
    api
      .get<{ logoUrl: string | null }>(`/clientes/${abertaClienteId}`)
      .then((c) => setLogoCliente(c.logoUrl))
      .catch(() => setLogoCliente(null));
  }, [abertaClienteId]);

  async function emitir() {
    setGerando(true);
    try {
      const os = await api.post<OsApi>('/ordens-servico/gerar', {
        colaboradorId: gerar.colaboradorId,
        medidasPreventivas: gerar.medidasPreventivas || undefined,
      });
      mostrar(`${os.codigo} emitida (v${os.versao}) com ${os.riscos.length} risco(s).`, 'sucesso');
      setGerar({ colaboradorId: '', medidasPreventivas: '' });
      setAberta(os);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.message : 'Falha ao gerar a OS.', 'erro');
    } finally {
      setGerando(false);
    }
  }

  async function registrarCiencia(os: OsApi, arquivo: File) {
    setEnviando(true);
    try {
      const atualizada = await api.upload<OsApi>(`/ordens-servico/${os.id}/ciencia`, arquivo);
      mostrar('Ciência registrada com carimbo.', 'sucesso');
      setAberta(atualizada);
      setAssinandoTela(false);
      setVerificacao(null);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao registrar a ciência.', 'erro');
    } finally {
      setEnviando(false);
    }
  }

  async function salvarTexto(os: OsApi) {
    setEnviando(true);
    setErroTexto(undefined);
    try {
      const atualizada = await api.put<OsApi>(`/ordens-servico/${os.id}`, { medidasPreventivas: textoEdicao });
      mostrar('Texto complementar atualizado.', 'sucesso');
      setAberta(atualizada);
      setEditandoTexto(false);
      void carregar();
    } catch (erro) {
      if (erro instanceof ErroApi) setErroTexto(erro.campos.medidasPreventivas?.[0]);
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao salvar o texto.', 'erro');
    } finally {
      setEnviando(false);
    }
  }

  async function anexarCopiaAssinada(os: OsApi, arquivo: File) {
    setEnviando(true);
    try {
      const atualizada = await api.upload<OsApi>(`/ordens-servico/${os.id}/arquivo-assinado`, arquivo);
      mostrar('Cópia assinada anexada.', 'sucesso');
      setAberta(atualizada);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao anexar a cópia assinada.', 'erro');
    } finally {
      setEnviando(false);
    }
  }

  async function verificar(os: OsApi) {
    try {
      setVerificacao(await api.get<VerificacaoOs>(`/ordens-servico/${os.id}/verificar`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao verificar a autenticidade.', 'erro');
    }
  }

  if (aberta) {
    const os = aberta;
    return (
      <>
        <div className="painel sem-impressao">
          <div className="barra-acoes" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setAberta(null)}>
              <Icone nome="voltar" /> Voltar à lista
            </button>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {podeEscrever && os.situacao === 'EMITIDA' ? (
                <>
                  <button type="button" className="btn btn-primary" disabled={enviando} onClick={() => setAssinandoTela(!assinandoTela)}>
                    <Icone nome="ferramenta" /> Assinar na tela
                  </button>
                  <label className="btn btn-outline">
                    <Icone nome="camera" /> Foto/arquivo da assinatura
                    <input
                      type="file"
                      hidden
                      accept="image/*"
                      disabled={enviando}
                      onChange={(e) => {
                        const arquivo = e.target.files?.[0];
                        e.target.value = '';
                        if (arquivo) void registrarCiencia(os, arquivo);
                      }}
                    />
                  </label>
                  {!editandoTexto ? (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        setTextoEdicao(os.medidasPreventivas ?? '');
                        setErroTexto(undefined);
                        setEditandoTexto(true);
                      }}
                    >
                      <Icone nome="documento" /> Editar texto complementar
                    </button>
                  ) : null}
                </>
              ) : null}
              {podeEscrever ? (
                <label className="btn btn-outline">
                  <Icone nome="anexo" /> {os.arquivoAssinadoUrl ? 'Substituir cópia assinada (PDF)' : 'Anexar cópia assinada (PDF)'}
                  <input
                    type="file"
                    hidden
                    accept="application/pdf,image/*"
                    disabled={enviando}
                    onChange={(e) => {
                      const arquivo = e.target.files?.[0];
                      e.target.value = '';
                      if (arquivo) void anexarCopiaAssinada(os, arquivo);
                    }}
                  />
                </label>
              ) : null}
              {os.arquivoAssinadoUrl ? (
                <a className="btn btn-ghost" href={urlAbsoluta(os.arquivoAssinadoUrl) ?? '#'} target="_blank" rel="noopener noreferrer">
                  <Icone nome="link" /> Ver cópia assinada
                </a>
              ) : null}
              <button type="button" className="btn btn-ghost" onClick={() => void verificar(os)}>
                <Icone nome="escudo" /> Verificar autenticidade
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
                <Icone nome="impressora" /> Imprimir
              </button>
            </div>
          </div>
          {verificacao ? (
            <p
              className="hint"
              style={{
                color: verificacao.valida === true ? 'var(--green)' : verificacao.valida === false ? 'var(--red)' : undefined,
                fontWeight: 600,
              }}
            >
              <Icone nome={verificacao.valida === true ? 'ok' : 'alerta'} /> {verificacao.mensagem}
              {verificacao.hash ? <span className="carimbo"> · sha256 {verificacao.hash}</span> : null}
            </p>
          ) : null}
          <p className="hint">
            Assinatura do trabalhador: na tela (dedo/mouse) ou foto da assinatura no papel — as duas recebem carimbo
            (hash do conteúdo + signatário + momento). Reconhecimento facial ou digital depende de leitor biométrico
            dedicado, ainda não integrado.
          </p>
          {assinandoTela && os.situacao === 'EMITIDA' ? (
            <AssinaturaCanvas
              rotulo={`${os.colaborador?.nome ?? 'Trabalhador'}: assine para registrar a ciência da ${os.codigo}`}
              enviando={enviando}
              aoCancelar={() => setAssinandoTela(false)}
              aoConfirmar={(arquivo) => registrarCiencia(os, arquivo)}
            />
          ) : null}
          {editandoTexto && os.situacao === 'EMITIDA' ? (
            <div style={{ marginTop: 12 }}>
              <Campo
                label="Texto complementar (medidas preventivas e orientações)"
                htmlFor="os-edicao"
                erro={erroTexto}
                ajuda="O cliente pode ajustar este texto enquanto a OS aguarda ciência. Depois da assinatura, gere nova versão."
              >
                <textarea id="os-edicao" rows={6} value={textoEdicao} onChange={(e) => setTextoEdicao(e.target.value)} maxLength={2000} />
              </Campo>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={enviando} onClick={() => void salvarTexto(os)}>
                  {enviando ? 'Salvando...' : 'Salvar texto'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={enviando} onClick={() => setEditandoTexto(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="painel folha">
          <div className="folha-cabecalho">
            <div>
              {empresa?.logoUrl || logoCliente ? (
                <div className="folha-logos" style={{ marginBottom: 8 }}>
                  {empresa?.logoUrl ? <img src={urlAbsoluta(empresa.logoUrl) ?? undefined} alt={`Logo ${empresa.nomeFantasia ?? 'consultoria'}`} /> : null}
                  {logoCliente ? <img src={urlAbsoluta(logoCliente) ?? undefined} alt={`Logo ${os.cliente?.nomeFantasia ?? 'cliente'}`} /> : null}
                </div>
              ) : null}
              <h2>Ordem de Serviço {os.codigo}</h2>
              <div className="hint">
                {os.cliente?.nomeFantasia} · versão {os.versao} · NR-1 item 1.4.4
              </div>
            </div>
            <div className="meta">
              <span className={`pill ${PILL_OS[os.situacao]}`}>{os.rotulos?.situacao ?? ROTULO_SITUACAO_OS[os.situacao]}</span>
              <div>emitida em {formatarDataIso(os.geradaEm)} por {os.geradaPor}</div>
            </div>
          </div>

          <div className="folha-secao">
            <h4>Trabalhador</h4>
            <dl className="folha-dados">
              <div>
                <dt>Nome</dt>
                <dd>{os.colaborador?.nome}</dd>
              </div>
              <div>
                <dt>CPF</dt>
                <dd className="mono">{os.colaborador?.cpf}</dd>
              </div>
              <div>
                <dt>Matrícula</dt>
                <dd>{os.colaborador?.matricula ?? '—'}</dd>
              </div>
              <div>
                <dt>Função</dt>
                <dd>{os.funcao}</dd>
              </div>
              <div>
                <dt>Setor</dt>
                <dd>{os.setor ?? '—'}</dd>
              </div>
              <div>
                <dt>Grau de risco da função</dt>
                <dd>{os.grauRisco}</dd>
              </div>
            </dl>
          </div>

          <div className="folha-secao">
            <h4>Riscos da função e da área</h4>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Perigo</th>
                    <th>Danos possíveis</th>
                    <th>Grau</th>
                    <th>Controles existentes</th>
                    <th>Medidas propostas</th>
                  </tr>
                </thead>
                <tbody>
                  {os.riscos.map((r, i) => (
                    <tr key={i}>
                      <td>{r.tipo}</td>
                      <td>
                        <b>{r.perigo}</b>
                      </td>
                      <td>{r.danosPossiveis}</td>
                      <td>
                        {r.grauRisco !== '-' ? <span className={`pill ${r.grauRisco === 'I' ? 'bad' : r.grauRisco === 'II' ? 'warn' : 'gray'}`}>Grau {r.grauRisco}</span> : <span className="hint">—</span>}
                        {r.iir ? <div className="hint">IIR {r.iir}</div> : null}
                      </td>
                      <td>{r.controlesExistentes ?? '—'}</td>
                      <td>{r.medidasPropostas ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid2">
            <div className="folha-secao">
              <h4>EPIs entregues (NR-06)</h4>
              {os.episObrigatorios.length === 0 ? (
                <p className="hint">Nenhuma entrega de EPI registrada para este trabalhador.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {os.episObrigatorios.map((e, i) => (
                    <li key={i}>
                      {e.nome} <span className="hint">CA {e.ca} · entregue em {formatarDataIso(e.dataEntrega)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="folha-secao">
              <h4>Treinamentos exigidos para a função</h4>
              {os.treinamentosExigidos.length === 0 ? (
                <p className="hint">A matriz de capacitação não exige treinamentos para esta função.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {os.treinamentosExigidos.map((t, i) => (
                    <li key={i}>
                      {t.nome} {t.norma ? <span className="hint">({t.norma})</span> : null}{' '}
                      <span className={`pill ${PILL_TREINO[t.situacao]}`}>{ROTULO_TREINO[t.situacao]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Texto padrao da empresa (o modelo oficial sera trocado quando o Valmir enviar). */}
          {empresa?.textoPadraoOs?.trim() ? (
            <div className="folha-secao">
              <h4>Orientações gerais</h4>
              <p style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{empresa.textoPadraoOs}</p>
            </div>
          ) : (
            <p className="hint sem-impressao">
              Sem texto padrão de OS. Cadastre em Configurações &gt; Empresa (campo “Texto padrão da OS”) para imprimir em toda OS.
            </p>
          )}

          {os.medidasPreventivas ? (
            <div className="folha-secao">
              <h4>Medidas preventivas e orientações complementares</h4>
              <p style={{ whiteSpace: 'pre-wrap' }}>{os.medidasPreventivas}</p>
            </div>
          ) : null}

          <div className="folha-secao">
            <h4>Ciência do trabalhador</h4>
            <p className="hint">
              Declaro que fui informado(a) sobre os riscos da minha função e da área onde atuo, as medidas de prevenção,
              os EPIs de uso obrigatório e os treinamentos exigidos.
            </p>
            <div className="folha-assinatura">
              <div>
                {os.cienciaAssinaturaUrl ? <img src={urlAbsoluta(os.cienciaAssinaturaUrl) ?? ''} alt="Assinatura do trabalhador" /> : <div style={{ height: 60 }} />}
                {os.colaborador?.nome}
                {os.cienciaEm ? <div className="hint">em {new Date(os.cienciaEm).toLocaleString('pt-BR')}</div> : null}
                {os.cienciaHash ? <div className="carimbo">carimbo sha256 {os.cienciaHash}</div> : null}
              </div>
              <div>
                <div style={{ height: 60 }} />
                Responsável pela emissão — {os.geradaPor}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="painel">
        <h3>Ordens de Serviço por função</h3>
        <p className="desc">
          A OS informa ao trabalhador os riscos da sua função e da sua área, os EPIs e os treinamentos exigidos (NR-1,
          1.4.4). Ela é <b>gerada</b> a partir do inventário de riscos, das entregas de EPI e da matriz de capacitação — e
          guarda uma fotografia desse momento. Se o inventário mudar, gera-se uma nova versão.
        </p>
        {resumo ? (
          <div className="stat-grid">
            <div className="stat">
              <b style={{ color: resumo.os.semOs > 0 ? 'var(--red)' : undefined }}>{resumo.os.semOs}</b>
              <span>colaborador(es) ativo(s) sem OS</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.os.emitidas > 0 ? 'var(--orange)' : undefined }}>{resumo.os.emitidas}</b>
              <span>emitida(s) aguardando ciência</span>
            </div>
            <div className="stat">
              <b>{resumo.os.assinadas}</b>
              <span>assinada(s)</span>
            </div>
          </div>
        ) : null}
      </div>

      {podeEscrever ? (
        <div className="painel">
          <h3>Emitir OS</h3>
          <div className="grid2">
            <Campo label="Colaborador" htmlFor="os-colab" obrigatorio>
              <select id="os-colab" value={gerar.colaboradorId} onChange={(e) => setGerar({ ...gerar, colaboradorId: e.target.value })}>
                <option value="">Selecione...</option>
                {colaboradores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} — {c.funcao}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Medidas preventivas complementares" htmlFor="os-medidas" ajuda="Procedimentos, restrições ou orientações específicas.">
              <textarea id="os-medidas" rows={2} value={gerar.medidasPreventivas} onChange={(e) => setGerar({ ...gerar, medidasPreventivas: e.target.value })} />
            </Campo>
          </div>
          <div className="barra-acoes">
            <button type="button" className="btn btn-primary" disabled={gerando || !gerar.colaboradorId} onClick={() => void emitir()}>
              {gerando ? 'Gerando...' : 'Gerar OS a partir dos cadastros'}
            </button>
            <span className="aviso hint">Se o colaborador já tiver OS, a anterior é marcada como substituída.</span>
          </div>
        </div>
      ) : null}

      <div className="painel">
        <div className="filtros">
          <Campo label="Cliente" htmlFor="fos-cliente">
            <select id="fos-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Buscar" htmlFor="fos-busca">
            <input id="fos-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código, nome ou função" />
          </Campo>
          <div className="check-linha" style={{ alignSelf: 'end' }}>
            <label>
              <input type="checkbox" checked={incluirSubstituidas} onChange={(e) => setIncluirSubstituidas(e.target.checked)} /> Só substituídas (histórico)
            </label>
          </div>
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
            <h4>Nenhuma OS emitida</h4>
            <p>Escolha um colaborador acima. A OS nasce dos riscos já cadastrados para a função e a área.</p>
          </div>
        ) : (
          <>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Trabalhador</th>
                    <th>Função</th>
                    <th className="num-col">Riscos</th>
                    <th>Emitida</th>
                    <th>Situação</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {itens.map((os) => (
                    <tr key={os.id}>
                      <td className="mono">
                        {os.codigo} <span className="hint">v{os.versao}</span>
                      </td>
                      <td>
                        <b>{os.colaborador?.nome}</b>
                        <div className="hint">{os.cliente?.nomeFantasia}</div>
                      </td>
                      <td>{os.funcao}</td>
                      <td className="num-col">{os.riscos.length}</td>
                      <td>{formatarDataIso(os.geradaEm)}</td>
                      <td>
                        <span className={`pill ${PILL_OS[os.situacao]}`}>{os.rotulos?.situacao ?? os.situacao}</span>
                        {os.cienciaEm ? <div className="hint">ciência em {formatarDataIso(os.cienciaEm)}</div> : null}
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAberta(os)}>
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
