import { useCallback, useEffect, useState } from 'react';
import { ROTULO_SITUACAO_OS, type OsEpi, type OsRisco, type OsTreinamento, type SituacaoOs } from '@safetyguard/shared';
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
  cliente?: { id: string; nomeFantasia: string };
  colaborador?: { id: string; nome: string; cpf: string; matricula: string | null; funcao: string; setor: string | null };
  rotulos?: { situacao: string };
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
    try {
      const atualizada = await api.upload<OsApi>(`/ordens-servico/${os.id}/ciencia`, arquivo);
      mostrar('Ciência registrada com carimbo.', 'sucesso');
      setAberta(atualizada);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao registrar a ciência.', 'erro');
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
            <div style={{ display: 'flex', gap: 8 }}>
              {podeEscrever && os.situacao === 'EMITIDA' ? (
                <label className="btn btn-primary">
                  <Icone nome="camera" /> Registrar ciência (foto da assinatura)
                  <input type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && void registrarCiencia(os, e.target.files[0])} />
                </label>
              ) : null}
              <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
                <Icone nome="impressora" /> Imprimir
              </button>
            </div>
          </div>
        </div>

        <div className="painel folha">
          <div className="folha-cabecalho">
            <div>
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

          {os.medidasPreventivas ? (
            <div className="folha-secao">
              <h4>Medidas preventivas e orientações</h4>
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
