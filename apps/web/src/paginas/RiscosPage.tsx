import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  NIVEIS_CONTROLE,
  PERIGOS_SUGERIDOS,
  ROTULO_NIVEL_CONTROLE,
  ROTULO_SITUACAO_RISCO,
  ROTULO_TIPO_RISCO,
  SITUACOES_RISCO,
  TIPOS_RISCO,
  avaliarRisco,
  type NivelControle,
  type SituacaoRisco,
  type TipoRisco,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Farol, Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import { formatarDataHora, formatarDataIso } from '../lib/datas';
import { useSessao } from '../lib/sessao';

interface RiscoApi {
  id: string;
  tipo: TipoRisco;
  perigo: string;
  fonteGeradora: string | null;
  atividade: string | null;
  funcao: string | null;
  danosPossiveis: string;
  severidade: number;
  probabilidade: number;
  exposicao: number;
  frequencia: number;
  iir: number;
  grauRisco: string;
  controlesExistentes: string | null;
  nivelControleAtual: NivelControle | null;
  medidasPropostas: string | null;
  situacao: SituacaoRisco;
  responsavel: string | null;
  reavaliarEm: string | null;
  faixa: { nivel: string; rotulo: string; cor: string };
  cliente?: { id: string; nomeFantasia: string };
  area?: { id: string; nome: string; codigo: string } | null;
  planoAcao?: { id: string; codigo: string; status: string } | null;
  rotulos?: { tipo: string; situacao: string; nivelControle: string | null };
}

interface Central {
  geradoEm: string;
  totalRiscos: number;
  porFaixa: Array<{ nivel: string; rotulo: string; cor: string; quantidade: number }>;
  naoControlados: number;
  reavaliacoesVencidas: number;
  planosAtrasados: number;
  ocorrenciasCriticas: Array<{
    id: string;
    descricao: string;
    dataHora: string;
    observador: string;
    prazoVencido: boolean;
    area?: { nome: string };
    cliente?: { nomeFantasia: string };
  }>;
}

interface Opcao {
  id: string;
  nomeFantasia?: string;
  nome?: string;
  codigo?: string;
}

const NOVO_VAZIO = {
  clienteId: '',
  areaId: '',
  funcao: '',
  tipo: 'ACIDENTE' as TipoRisco,
  perigo: '',
  fonteGeradora: '',
  atividade: '',
  danosPossiveis: '',
  severidade: '3',
  probabilidade: '3',
  exposicao: '3',
  frequencia: '3',
  controlesExistentes: '',
  nivelControleAtual: '' as NivelControle | '',
  medidasPropostas: '',
  situacao: 'IDENTIFICADO' as SituacaoRisco,
  responsavel: '',
};

export function RiscosPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('cadastros:escrever');

  const [carregando, setCarregando] = useState(true);
  const [itens, setItens] = useState<RiscoApi[]>([]);
  const [central, setCentral] = useState<Central | null>(null);
  const [clientes, setClientes] = useState<Opcao[]>([]);
  const [areas, setAreas] = useState<Opcao[]>([]);

  const [clienteId, setClienteId] = useState('');
  const [faixa, setFaixa] = useState('');
  const [situacao, setSituacao] = useState<SituacaoRisco | ''>('');

  const [novo, setNovo] = useState(NOVO_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);

  // Prévia do IIR enquanto o usuário mexe nos fatores — mesma régua do servidor.
  const previa = avaliarRisco({
    severidade: Number(novo.severidade) || 1,
    probabilidade: Number(novo.probabilidade) || 1,
    exposicao: Number(novo.exposicao) || 1,
    frequencia: Number(novo.frequencia) || 1,
  });

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const parametros = new URLSearchParams();
      if (clienteId) parametros.set('clienteId', clienteId);
      if (faixa) parametros.set('faixa', faixa);
      if (situacao) parametros.set('situacao', situacao);
      const escopo = clienteId ? `?clienteId=${clienteId}` : '';

      const [lista, painel] = await Promise.all([
        api.get<RiscoApi[]>(`/riscos?${parametros.toString()}`),
        api.get<Central>(`/riscos/central${escopo}`),
      ]);
      setItens(lista);
      setCentral(painel);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os riscos.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [clienteId, faixa, situacao, mostrar]);

  useEffect(() => {
    void api.get<Opcao[]>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!novo.clienteId) {
      setAreas([]);
      return;
    }
    void api
      .get<{ itens: Opcao[] }>(`/areas?clienteId=${novo.clienteId}&porPagina=200`)
      .then((resposta) => setAreas(resposta.itens))
      .catch(() => setAreas([]));
  }, [novo.clienteId]);

  async function salvar() {
    setSalvando(true);
    try {
      const corpo = {
        ...novo,
        areaId: novo.areaId || undefined,
        funcao: novo.funcao || undefined,
        fonteGeradora: novo.fonteGeradora || undefined,
        atividade: novo.atividade || undefined,
        controlesExistentes: novo.controlesExistentes || undefined,
        nivelControleAtual: novo.nivelControleAtual || undefined,
        medidasPropostas: novo.medidasPropostas || undefined,
        responsavel: novo.responsavel || undefined,
      };

      if (editandoId) {
        await api.put(`/riscos/${editandoId}`, corpo);
        mostrar('Risco atualizado.', 'sucesso');
      } else {
        await api.post('/riscos', corpo);
        mostrar('Risco adicionado ao inventário.', 'sucesso');
      }
      setNovo(NOVO_VAZIO);
      setEditandoId(null);
      setFormAberto(false);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao salvar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  function editar(risco: RiscoApi) {
    setEditandoId(risco.id);
    setFormAberto(true);
    setNovo({
      clienteId: risco.cliente?.id ?? '',
      areaId: risco.area?.id ?? '',
      funcao: risco.funcao ?? '',
      tipo: risco.tipo,
      perigo: risco.perigo,
      fonteGeradora: risco.fonteGeradora ?? '',
      atividade: risco.atividade ?? '',
      danosPossiveis: risco.danosPossiveis,
      severidade: String(risco.severidade),
      probabilidade: String(risco.probabilidade),
      exposicao: String(risco.exposicao),
      frequencia: String(risco.frequencia),
      controlesExistentes: risco.controlesExistentes ?? '',
      nivelControleAtual: risco.nivelControleAtual ?? '',
      medidasPropostas: risco.medidasPropostas ?? '',
      situacao: risco.situacao,
      responsavel: risco.responsavel ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <>
      {/* ------------------------------------------------ Central de Risco */}
      <div className="painel">
        <h3>Central de Risco</h3>
        <p className="desc">
          O inventário de riscos que sustenta o PGR (NR-1) e a leitura operacional do que está crítico agora. A
          avaliação usa a mesma régua de IIR das observações de campo — o mesmo perigo não pode ter dois graus na mesma
          plataforma.
        </p>

        {central ? (
          <>
            <div className="stat-grid">
              {central.porFaixa.map((linha) => (
                <div className="stat" key={linha.nivel}>
                  <b style={{ color: linha.quantidade > 0 ? linha.cor : undefined }}>{linha.quantidade}</b>
                  <span>
                    <Farol cor={linha.cor} /> risco {linha.rotulo.toLowerCase()}
                  </span>
                </div>
              ))}
              <div className="stat">
                <b style={{ color: central.naoControlados > 0 ? 'var(--orange)' : undefined }}>
                  {central.naoControlados}
                </b>
                <span>sem controle concluído</span>
              </div>
              <div className="stat">
                <b style={{ color: central.reavaliacoesVencidas > 0 ? 'var(--red)' : undefined }}>
                  {central.reavaliacoesVencidas}
                </b>
                <span>reavaliações vencidas</span>
              </div>
            </div>

            {central.ocorrenciasCriticas.length > 0 ? (
              <>
                <h4>Ocorrências críticas em aberto ({central.ocorrenciasCriticas.length})</h4>
                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Quando</th>
                        <th>Ocorrência</th>
                        <th>Onde</th>
                        <th>Observador</th>
                        <th>Prazo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {central.ocorrenciasCriticas.map((ocorrencia) => (
                        <tr key={ocorrencia.id}>
                          <td>{formatarDataHora(ocorrencia.dataHora)}</td>
                          <td>
                            <Link to={`/observacoes/${ocorrencia.id}`}>{ocorrencia.descricao.slice(0, 70)}</Link>
                          </td>
                          <td>
                            {ocorrencia.cliente?.nomeFantasia}
                            {ocorrencia.area ? <div className="hint">{ocorrencia.area.nome}</div> : null}
                          </td>
                          <td>{ocorrencia.observador}</td>
                          <td>
                            <span className={`pill ${ocorrencia.prazoVencido ? 'bad' : 'warn'}`}>
                              {ocorrencia.prazoVencido ? 'Vencido' : 'Em aberto'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {central.planosAtrasados > 0 ? (
              <p className="hint alerta">
                <Icone nome="alerta" /> {central.planosAtrasados} plano(s) de ação com prazo vencido —{' '}
                <Link to="/planos-acao?atrasados=true">abrir a fila</Link>.
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      {/* -------------------------------------------------------- formulário */}
      {podeEscrever ? (
        <div className="painel">
          <div className="barra-acoes">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setFormAberto(!formAberto);
                if (formAberto) {
                  setEditandoId(null);
                  setNovo(NOVO_VAZIO);
                }
              }}
            >
              {formAberto ? 'Fechar formulário' : '+ Novo risco no inventário'}
            </button>
            {editandoId ? <span className="aviso">Editando um risco existente.</span> : null}
          </div>

          {formAberto ? (
            <>
              <div className="filtros">
                <Campo label="Cliente" htmlFor="nr-cliente" obrigatorio>
                  <select id="nr-cliente" value={novo.clienteId} onChange={(e) => setNovo({ ...novo, clienteId: e.target.value })}>
                    <option value="">Selecione...</option>
                    {clientes.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.nomeFantasia}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Área" htmlFor="nr-area" ajuda="Área ou função — ao menos um.">
                  <select id="nr-area" value={novo.areaId} onChange={(e) => setNovo({ ...novo, areaId: e.target.value })}>
                    <option value="">Sem área específica</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.codigo} — {area.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Função" htmlFor="nr-funcao">
                  <input id="nr-funcao" value={novo.funcao} onChange={(e) => setNovo({ ...novo, funcao: e.target.value })} />
                </Campo>
                <Campo label="Tipo de risco" htmlFor="nr-tipo" obrigatorio>
                  <select id="nr-tipo" value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as TipoRisco })}>
                    {TIPOS_RISCO.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {ROTULO_TIPO_RISCO[tipo]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Perigo" htmlFor="nr-perigo" obrigatorio>
                  <input
                    id="nr-perigo"
                    className="busca"
                    list="perigos"
                    value={novo.perigo}
                    onChange={(e) => setNovo({ ...novo, perigo: e.target.value })}
                  />
                  <datalist id="perigos">
                    {PERIGOS_SUGERIDOS[novo.tipo].map((perigo) => (
                      <option key={perigo} value={perigo} />
                    ))}
                  </datalist>
                </Campo>
              </div>

              <div className="grid2">
                <Campo label="Fonte geradora" htmlFor="nr-fonte">
                  <input id="nr-fonte" value={novo.fonteGeradora} onChange={(e) => setNovo({ ...novo, fonteGeradora: e.target.value })} />
                </Campo>
                <Campo label="Atividade" htmlFor="nr-atividade">
                  <input id="nr-atividade" value={novo.atividade} onChange={(e) => setNovo({ ...novo, atividade: e.target.value })} />
                </Campo>
              </div>

              <Campo label="Danos possíveis" htmlFor="nr-danos" obrigatorio>
                <input id="nr-danos" className="busca" value={novo.danosPossiveis} onChange={(e) => setNovo({ ...novo, danosPossiveis: e.target.value })} />
              </Campo>

              <h4>Avaliação do risco (1 a 5 cada fator)</h4>
              <div className="filtros">
                {(
                  [
                    ['severidade', 'Severidade'],
                    ['probabilidade', 'Probabilidade'],
                    ['exposicao', 'Exposição'],
                    ['frequencia', 'Frequência'],
                  ] as const
                ).map(([campo, rotulo]) => (
                  <Campo label={rotulo} htmlFor={`nr-${campo}`} key={campo} obrigatorio>
                    <select
                      id={`nr-${campo}`}
                      className="estreito"
                      value={novo[campo]}
                      onChange={(e) => setNovo({ ...novo, [campo]: e.target.value })}
                    >
                      {[1, 2, 3, 4, 5].map((valor) => (
                        <option key={valor} value={valor}>
                          {valor}
                        </option>
                      ))}
                    </select>
                  </Campo>
                ))}
                <Campo label="IIR resultante" htmlFor="nr-iir">
                  <div
                    className="pill"
                    style={{ background: `${previa.faixa.cor}22`, color: previa.faixa.cor, padding: '9px 12px', fontSize: 13 }}
                  >
                    {previa.iir} — {previa.faixa.rotulo} · grau {previa.grauRisco}
                  </div>
                </Campo>
              </div>

              <h4>Controles</h4>
              <div className="grid2">
                <Campo label="Controles existentes" htmlFor="nr-controles" ajuda="Obrigatório para marcar como Controlado.">
                  <textarea id="nr-controles" rows={2} value={novo.controlesExistentes} onChange={(e) => setNovo({ ...novo, controlesExistentes: e.target.value })} />
                </Campo>
                <Campo label="Medidas propostas" htmlFor="nr-medidas">
                  <textarea id="nr-medidas" rows={2} value={novo.medidasPropostas} onChange={(e) => setNovo({ ...novo, medidasPropostas: e.target.value })} />
                </Campo>
              </div>

              <div className="filtros">
                <Campo
                  label="Nível de controle atual"
                  htmlFor="nr-nivel"
                  ajuda="Hierarquia da NR-1: EPI é o último recurso, não o primeiro."
                >
                  <select
                    id="nr-nivel"
                    value={novo.nivelControleAtual}
                    onChange={(e) => setNovo({ ...novo, nivelControleAtual: e.target.value as NivelControle | '' })}
                  >
                    <option value="">Não informado</option>
                    {NIVEIS_CONTROLE.map((nivel) => (
                      <option key={nivel} value={nivel}>
                        {ROTULO_NIVEL_CONTROLE[nivel]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Situação" htmlFor="nr-situacao">
                  <select id="nr-situacao" value={novo.situacao} onChange={(e) => setNovo({ ...novo, situacao: e.target.value as SituacaoRisco })}>
                    {SITUACOES_RISCO.map((item) => (
                      <option key={item} value={item}>
                        {ROTULO_SITUACAO_RISCO[item]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Responsável" htmlFor="nr-resp">
                  <input id="nr-resp" value={novo.responsavel} onChange={(e) => setNovo({ ...novo, responsavel: e.target.value })} />
                </Campo>
              </div>

              <div className="barra-acoes">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={salvando || !novo.clienteId || !novo.perigo || !novo.danosPossiveis}
                  onClick={() => void salvar()}
                >
                  {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Adicionar ao inventário'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {/* ---------------------------------------------------------- listagem */}
      <div className="painel">
        <h3>Inventário de riscos ({itens.length})</h3>
        <div className="filtros">
          <Campo label="Cliente" htmlFor="fr-cliente">
            <select id="fr-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Faixa de risco" htmlFor="fr-faixa">
            <select id="fr-faixa" className="estreito" value={faixa} onChange={(e) => setFaixa(e.target.value)}>
              <option value="">Todas</option>
              <option value="CRITICO">Crítico</option>
              <option value="ALTO">Alto</option>
              <option value="MODERADO">Moderado</option>
              <option value="BAIXO">Baixo</option>
            </select>
          </Campo>
          <Campo label="Situação" htmlFor="fr-situacao">
            <select id="fr-situacao" className="estreito" value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoRisco | '')}>
              <option value="">Todas</option>
              {SITUACOES_RISCO.map((item) => (
                <option key={item} value={item}>
                  {ROTULO_SITUACAO_RISCO[item]}
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
              <Icone nome="alerta" tamanho={22} />
            </div>
            <h4>Inventário vazio</h4>
            <p>O inventário de riscos é a base do PGR. Cadastre o primeiro perigo identificado.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Perigo</th>
                  <th>Onde</th>
                  <th>Tipo</th>
                  <th className="num-col">IIR</th>
                  <th>Controle</th>
                  <th>Situação</th>
                  {podeEscrever ? <th aria-label="Ações" /> : null}
                </tr>
              </thead>
              <tbody>
                {itens.map((risco) => (
                  <tr key={risco.id}>
                    <td>
                      <b>{risco.perigo}</b>
                      <div className="hint">{risco.danosPossiveis.slice(0, 70)}</div>
                    </td>
                    <td>
                      {risco.area?.nome ?? risco.funcao ?? '—'}
                      <div className="hint">{risco.cliente?.nomeFantasia}</div>
                    </td>
                    <td>{risco.rotulos?.tipo ?? risco.tipo}</td>
                    <td className="num-col">
                      <span className="pill" style={{ background: `${risco.faixa.cor}22`, color: risco.faixa.cor }}>
                        {risco.iir} · {risco.faixa.rotulo}
                      </span>
                      <div className="hint">grau {risco.grauRisco}</div>
                    </td>
                    <td>
                      {risco.rotulos?.nivelControle ?? <span className="hint">não informado</span>}
                      {risco.planoAcao ? (
                        <div className="hint">
                          <Link className="mono" to={`/planos-acao/${risco.planoAcao.id}`}>
                            {risco.planoAcao.codigo}
                          </Link>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={`pill ${
                          risco.situacao === 'CONTROLADO' ? 'ok' : risco.situacao === 'IDENTIFICADO' ? 'bad' : 'warn'
                        }`}
                      >
                        {risco.rotulos?.situacao ?? risco.situacao}
                      </span>
                      {risco.reavaliarEm ? (
                        <div className="hint">reavaliar {formatarDataIso(risco.reavaliarEm)}</div>
                      ) : null}
                    </td>
                    {podeEscrever ? (
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => editar(risco)}>
                          Editar
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
  );
}
