import { useCallback, useEffect, useMemo, useState } from 'react';
import { horasLiquidas, mesAtual, valorDoRegistro } from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { API_URL, ErroApi, api, lerTokenSalvo } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import { useSessao } from '../lib/sessao';

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

interface OpcaoUsuario {
  id: string;
  nome: string;
  perfil: string;
  valorHora: number | null;
}

interface RegistroApi {
  id: string;
  usuarioId: string;
  clienteId: string | null;
  data: string;
  entrada: string;
  saida: string | null;
  intervaloMinutos: number;
  atividade: string | null;
  horasTrabalhadas: number | null;
  valorHora: number | null;
  valor: number | null;
  aberto: boolean;
  usuario: { id: string; nome: string };
  cliente: OpcaoCliente | null;
}

interface ResumoApi {
  mes: string;
  totalHoras: number;
  totalValor: number;
  diasTrabalhados: number;
  registros: number;
  abertos: number;
  porCliente: Array<{ clienteId: string | null; nome: string; horas: number; valor: number; registros: number }>;
  porUsuario: Array<{ usuarioId: string; nome: string; horas: number; valor: number; dias: number }>;
  usuario: { id: string; nome: string; valorHora: number | null } | null;
  registroAberto: RegistroApi | null;
}

const REAL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const HORAS = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function hojeIso(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
}

function hora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function rotuloMes(mes: string): string {
  const [ano, m] = mes.split('-');
  const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return `${nomes[Number(m) - 1] ?? m}/${ano}`;
}

interface FormManual {
  data: string;
  horaEntrada: string;
  horaSaida: string;
  intervaloMinutos: string;
  clienteId: string;
  atividade: string;
}

const MANUAL_VAZIO: FormManual = { data: '', horaEntrada: '08:00', horaSaida: '17:00', intervaloMinutos: '60', clienteId: '', atividade: '' };

type Erros = Partial<Record<string, string>>;

function errosDoApi(erro: unknown): Erros {
  if (!(erro instanceof ErroApi)) return {};
  const saida: Erros = {};
  for (const [campo, mensagens] of Object.entries(erro.campos)) saida[campo] = mensagens[0];
  return saida;
}

export function PontoPage() {
  const { mostrar } = useToast();
  const { usuario, pode } = useSessao();
  const gerente = pode('usuarios:gerenciar');

  const [mes, setMes] = useState(mesAtual());
  const [usuarioId, setUsuarioId] = useState(usuario?.id ?? '');
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [usuarios, setUsuarios] = useState<OpcaoUsuario[]>([]);

  const [carregando, setCarregando] = useState(true);
  const [itens, setItens] = useState<RegistroApi[]>([]);
  const [resumo, setResumo] = useState<ResumoApi | null>(null);

  const [rapido, setRapido] = useState({ clienteId: '', atividade: '' });
  const [manual, setManual] = useState<FormManual>({ ...MANUAL_VAZIO, data: hojeIso() });
  const [errosManual, setErrosManual] = useState<Erros>({});
  const [valorHora, setValorHora] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());

  // Relogio do turno aberto.
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
    if (gerente) void api.get<OpcaoUsuario[]>('/ponto/usuarios').then(setUsuarios).catch(() => setUsuarios([]));
  }, [gerente]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const params = new URLSearchParams({ mes });
      if (usuarioId) params.set('usuarioId', usuarioId);
      const [lista, cards] = await Promise.all([
        api.get<RegistroApi[]>(`/ponto?${params.toString()}`),
        api.get<ResumoApi>(`/ponto/resumo?${params.toString()}`),
      ]);
      setItens(lista);
      setResumo(cards);
      setValorHora(cards.usuario?.valorHora === null || cards.usuario?.valorHora === undefined ? '' : String(cards.usuario.valorHora));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar o cartão de ponto.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [mes, usuarioId, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const vendoTodos = gerente && !usuarioId;
  const vendoOutro = Boolean(usuarioId) && usuarioId !== usuario?.id;
  const registroAberto = resumo?.registroAberto ?? null;
  const horasAbertas = useMemo(
    () => (registroAberto ? horasLiquidas(registroAberto.entrada, new Date(agora), registroAberto.intervaloMinutos) : null),
    [registroAberto, agora],
  );

  async function registrarEntradaAgora() {
    setSalvando(true);
    try {
      const agoraData = new Date();
      await api.post('/ponto', {
        data: hojeIso(),
        entrada: agoraData.toISOString(),
        saida: null,
        intervaloMinutos: 0,
        clienteId: rapido.clienteId || null,
        atividade: rapido.atividade || null,
      });
      mostrar(`Entrada registrada às ${hora(agoraData.toISOString())}.`, 'sucesso');
      setRapido({ clienteId: '', atividade: '' });
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.message : 'Falha ao registrar a entrada.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function encerrar(registro: RegistroApi) {
    setSalvando(true);
    try {
      const fechado = await api.post<RegistroApi>(`/ponto/${registro.id}/encerrar`, {});
      mostrar(`Turno encerrado: ${HORAS.format(fechado.horasTrabalhadas ?? 0)} h.`, 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.message : 'Falha ao encerrar o turno.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarManual() {
    setSalvando(true);
    setErrosManual({});
    try {
      if (!manual.data || !manual.horaEntrada) {
        setErrosManual({ data: !manual.data ? 'Informe a data.' : undefined, entrada: !manual.horaEntrada ? 'Informe a entrada.' : undefined });
        return;
      }
      const entrada = new Date(`${manual.data}T${manual.horaEntrada}:00`);
      let saida: Date | null = manual.horaSaida ? new Date(`${manual.data}T${manual.horaSaida}:00`) : null;
      // Turno que atravessa a meia-noite: a saida cai no dia seguinte.
      if (saida && saida.getTime() <= entrada.getTime()) saida = new Date(saida.getTime() + 24 * 3_600_000);

      await api.post('/ponto', {
        data: manual.data,
        entrada: entrada.toISOString(),
        saida: saida ? saida.toISOString() : null,
        intervaloMinutos: manual.intervaloMinutos || 0,
        clienteId: manual.clienteId || null,
        atividade: manual.atividade || null,
      });
      mostrar('Registro de ponto salvo.', 'sucesso');
      setManual({ ...MANUAL_VAZIO, data: manual.data, clienteId: manual.clienteId });
      void carregar();
    } catch (erro) {
      setErrosManual(errosDoApi(erro));
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao salvar o registro.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(registro: RegistroApi) {
    if (!window.confirm(`Excluir o registro de ${formatarDataIso(registro.data)} (${hora(registro.entrada)})?`)) return;
    try {
      await api.delete(`/ponto/${registro.id}`);
      mostrar('Registro excluído.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.message : 'Falha ao excluir.', 'erro');
    }
  }

  async function salvarValorHora() {
    setSalvando(true);
    try {
      const alvo = usuarioId && usuarioId !== usuario?.id ? usuarioId : undefined;
      await api.put('/ponto/valor-hora', { usuarioId: alvo ?? null, valorHora: valorHora === '' ? null : valorHora });
      mostrar('Valor/hora atualizado. Vale para os próximos registros.', 'sucesso');
      void carregar();
      if (gerente) void api.get<OpcaoUsuario[]>('/ponto/usuarios').then(setUsuarios).catch(() => {});
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao salvar o valor/hora.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function baixarExcel() {
    setBaixando(true);
    try {
      const params = new URLSearchParams({ mes });
      if (usuarioId) params.set('usuarioId', usuarioId);
      const resposta = await fetch(`${API_URL}/api/v1/ponto/relatorio.xlsx?${params.toString()}`, {
        headers: { Authorization: `Bearer ${lerTokenSalvo() ?? ''}` },
      });
      if (!resposta.ok) throw new Error(`A API respondeu ${resposta.status} ao gerar o Excel.`);
      const url = URL.createObjectURL(await resposta.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `cartao-de-ponto-${mes}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao baixar o Excel.', 'erro');
    } finally {
      setBaixando(false);
    }
  }

  const semValorHora = resumo?.usuario && resumo.usuario.valorHora === null && !vendoTodos;

  return (
    <>
      <div className="painel">
        <h3>Cartão de ponto</h3>
        <p className="desc">
          Registre a entrada ao chegar e encerre ao sair — as horas líquidas (descontado o intervalo) e o valor
          (horas × seu valor/hora) fecham o mês por cliente. Registros também podem ser lançados à mão.
        </p>

        <div className="filtros">
          <Campo label="Mês" htmlFor="po-mes">
            <input id="po-mes" type="month" className="estreito" value={mes} onChange={(e) => setMes(e.target.value || mesAtual())} />
          </Campo>
          {gerente ? (
            <Campo label="Consultor" htmlFor="po-usuario">
              <select id="po-usuario" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
                <option value="">Todos os consultores</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                    {u.id === usuario?.id ? ' (eu)' : ''}
                  </option>
                ))}
              </select>
            </Campo>
          ) : null}
          <Campo label=" " htmlFor="po-excel">
            <button id="po-excel" type="button" className="btn btn-outline" disabled={baixando} onClick={() => void baixarExcel()}>
              <Icone nome="documento" tamanho={14} /> {baixando ? 'Gerando...' : 'Baixar Excel'}
            </button>
          </Campo>
        </div>

        {resumo ? (
          <div className="stat-grid">
            <div className="stat">
              <b>{HORAS.format(resumo.totalHoras)} h</b>
              <span>horas em {rotuloMes(mes)}</span>
            </div>
            <div className="stat">
              <b>{REAL.format(resumo.totalValor)}</b>
              <span>valor do mês</span>
            </div>
            <div className="stat">
              <b>{resumo.diasTrabalhados}</b>
              <span>dias trabalhados</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.abertos > 0 ? 'var(--orange)' : undefined }}>{resumo.abertos}</b>
              <span>turnos em aberto</span>
            </div>
          </div>
        ) : null}
      </div>

      {!vendoOutro ? (
        <div className="painel">
          {registroAberto ? (
            <>
              <h3>Turno em andamento</h3>
              <p className="hint">
                Entrada às <b>{hora(registroAberto.entrada)}</b> em {formatarDataIso(registroAberto.data)}
                {registroAberto.cliente ? <> · {registroAberto.cliente.nomeFantasia}</> : null}
                {registroAberto.atividade ? <> · {registroAberto.atividade}</> : null}
                {horasAbertas !== null ? <> · <b>{HORAS.format(horasAbertas)} h</b> até agora</> : null}
              </p>
              <div className="barra-acoes">
                <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void encerrar(registroAberto)}>
                  <Icone nome="relogio" tamanho={14} /> Encerrar agora
                </button>
              </div>
            </>
          ) : (
            <>
              <h3>Registrar entrada agora</h3>
              <div className="filtros">
                <Campo label="Cliente" htmlFor="po-rapido-cliente">
                  <select id="po-rapido-cliente" value={rapido.clienteId} onChange={(e) => setRapido({ ...rapido, clienteId: e.target.value })}>
                    <option value="">Interno / sem cliente</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nomeFantasia}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Atividade" htmlFor="po-rapido-atividade">
                  <input
                    id="po-rapido-atividade"
                    className="busca"
                    placeholder="Ex.: inspeção de campo, DDS, elaboração de PGR"
                    value={rapido.atividade}
                    onChange={(e) => setRapido({ ...rapido, atividade: e.target.value })}
                  />
                </Campo>
                <Campo label=" " htmlFor="po-rapido-botao">
                  <button id="po-rapido-botao" type="button" className="btn btn-primary" disabled={salvando} onClick={() => void registrarEntradaAgora()}>
                    <Icone nome="relogio" tamanho={14} /> Registrar entrada agora
                  </button>
                </Campo>
              </div>
            </>
          )}
        </div>
      ) : null}

      {semValorHora ? (
        <div className="hint alerta">
          {vendoOutro ? 'Este consultor' : 'Você'} ainda não tem valor/hora definido — os registros ficam sem valor até preencher o campo abaixo.
        </div>
      ) : null}

      <div className="grid2">
        {!vendoOutro ? (
          <div className="painel">
            <h3>Lançar registro à mão</h3>
            <div className="filtros">
              <Campo label="Data" htmlFor="po-data" obrigatorio erro={errosManual.data}>
                <input id="po-data" type="date" value={manual.data} onChange={(e) => setManual({ ...manual, data: e.target.value })} />
              </Campo>
              <Campo label="Entrada" htmlFor="po-entrada" obrigatorio erro={errosManual.entrada}>
                <input id="po-entrada" type="time" className="estreito" value={manual.horaEntrada} onChange={(e) => setManual({ ...manual, horaEntrada: e.target.value })} />
              </Campo>
              <Campo label="Saída" htmlFor="po-saida" erro={errosManual.saida} ajuda="Vazio = turno fica aberto.">
                <input id="po-saida" type="time" className="estreito" value={manual.horaSaida} onChange={(e) => setManual({ ...manual, horaSaida: e.target.value })} />
              </Campo>
              <Campo label="Intervalo (min)" htmlFor="po-intervalo" erro={errosManual.intervaloMinutos}>
                <input
                  id="po-intervalo"
                  type="number"
                  min={0}
                  step={5}
                  className="estreito"
                  value={manual.intervaloMinutos}
                  onChange={(e) => setManual({ ...manual, intervaloMinutos: e.target.value })}
                />
              </Campo>
              <Campo label="Cliente" htmlFor="po-cliente" erro={errosManual.clienteId}>
                <select id="po-cliente" value={manual.clienteId} onChange={(e) => setManual({ ...manual, clienteId: e.target.value })}>
                  <option value="">Interno / sem cliente</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nomeFantasia}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Atividade" htmlFor="po-atividade" erro={errosManual.atividade}>
                <input id="po-atividade" className="busca" value={manual.atividade} onChange={(e) => setManual({ ...manual, atividade: e.target.value })} />
              </Campo>
            </div>
            <div className="barra-acoes">
              <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void salvarManual()}>
                {salvando ? 'Salvando...' : 'Salvar registro'}
              </button>
              {!manual.data ? <span className="hint">Informe a data e a hora de entrada.</span> : null}
            </div>
          </div>
        ) : null}

        <div className="painel">
          <h3>{vendoOutro ? `Valor/hora de ${resumo?.usuario?.nome ?? 'consultor'}` : 'Meu valor/hora'}</h3>
          <p className="hint">
            Fotografado em cada registro no momento da entrada — mudar aqui não altera registros antigos.
            {vendoTodos ? ' Selecione um consultor para definir o valor dele.' : null}
          </p>
          {!vendoTodos ? (
            <div className="filtros">
              <Campo label="Valor/hora (R$)" htmlFor="po-valor-hora">
                <input
                  id="po-valor-hora"
                  type="number"
                  min={0}
                  step={0.01}
                  className="estreito"
                  value={valorHora}
                  disabled={vendoOutro && !gerente}
                  onChange={(e) => setValorHora(e.target.value)}
                />
              </Campo>
              <Campo label=" " htmlFor="po-valor-hora-salvar">
                <button id="po-valor-hora-salvar" type="button" className="btn btn-outline" disabled={salvando} onClick={() => void salvarValorHora()}>
                  Salvar valor/hora
                </button>
              </Campo>
            </div>
          ) : null}

          {resumo && resumo.porCliente.length > 0 ? (
            <>
              <h3 style={{ marginTop: 16 }}>Resumo por cliente</h3>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th className="num-col">Registros</th>
                      <th className="num-col">Horas</th>
                      <th className="num-col">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumo.porCliente.map((c) => (
                      <tr key={c.clienteId ?? 'sem-cliente'}>
                        <td>{c.nome}</td>
                        <td className="num-col">{c.registros}</td>
                        <td className="num-col">{HORAS.format(c.horas)} h</td>
                        <td className="num-col">
                          <b>{REAL.format(c.valor)}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {vendoTodos && resumo && resumo.porUsuario.length > 0 ? (
            <>
              <h3 style={{ marginTop: 16 }}>Por consultor</h3>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Consultor</th>
                      <th className="num-col">Dias</th>
                      <th className="num-col">Horas</th>
                      <th className="num-col">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumo.porUsuario.map((u) => (
                      <tr key={u.usuarioId}>
                        <td>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUsuarioId(u.usuarioId)}>
                            {u.nome}
                          </button>
                        </td>
                        <td className="num-col">{u.dias}</td>
                        <td className="num-col">{HORAS.format(u.horas)} h</td>
                        <td className="num-col">{REAL.format(u.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="painel">
        <h3>Registros de {rotuloMes(mes)}</h3>
        {carregando && itens.length === 0 ? (
          <div className="centro-tela">
            <div className="spinner" />
            Carregando...
          </div>
        ) : itens.length === 0 ? (
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="relogio" tamanho={22} />
            </div>
            <h4>Nenhum registro neste mês</h4>
            <p>Use "Registrar entrada agora" ou lance um registro à mão.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  {vendoTodos ? <th>Consultor</th> : null}
                  <th>Cliente</th>
                  <th>Entrada</th>
                  <th>Saída</th>
                  <th className="num-col">Intervalo</th>
                  <th className="num-col">Horas</th>
                  <th className="num-col">Valor</th>
                  <th>Atividade</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {itens.map((r) => {
                  const podeMexer = gerente || r.usuarioId === usuario?.id;
                  const parciais = r.aberto ? horasLiquidas(r.entrada, new Date(agora), r.intervaloMinutos) : null;
                  return (
                    <tr key={r.id}>
                      <td>{formatarDataIso(r.data)}</td>
                      {vendoTodos ? <td>{r.usuario.nome}</td> : null}
                      <td>{r.cliente?.nomeFantasia ?? <span className="hint">interno</span>}</td>
                      <td className="mono">{hora(r.entrada)}</td>
                      <td className="mono">{r.aberto ? <span className="pill orange">em aberto</span> : hora(r.saida)}</td>
                      <td className="num-col">{r.intervaloMinutos} min</td>
                      <td className="num-col">
                        {r.horasTrabalhadas !== null ? (
                          <b>{HORAS.format(r.horasTrabalhadas)} h</b>
                        ) : parciais !== null ? (
                          <span className="hint">{HORAS.format(parciais)} h...</span>
                        ) : (
                          <span className="hint">—</span>
                        )}
                      </td>
                      <td className="num-col">
                        {r.valor !== null ? (
                          REAL.format(r.valor)
                        ) : r.horasTrabalhadas !== null && r.valorHora === null ? (
                          <span className="hint" title="Sem valor/hora no momento do registro">
                            sem valor/hora
                          </span>
                        ) : parciais !== null && r.valorHora !== null ? (
                          <span className="hint">{REAL.format(valorDoRegistro(parciais, r.valorHora) ?? 0)}...</span>
                        ) : (
                          <span className="hint">—</span>
                        )}
                      </td>
                      <td>{r.atividade ?? <span className="hint">—</span>}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {podeMexer && r.aberto ? (
                          <button type="button" className="btn btn-outline btn-sm" disabled={salvando} onClick={() => void encerrar(r)}>
                            Encerrar
                          </button>
                        ) : null}{' '}
                        {podeMexer ? (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluir(r)}>
                            Excluir
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
