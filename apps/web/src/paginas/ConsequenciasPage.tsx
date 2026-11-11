import { useCallback, useEffect, useState } from 'react';
import {
  MEDIDAS_DISCIPLINARES,
  MOTIVACOES_CONSEQUENCIA,
  ROTULO_MEDIDA,
  ROTULO_MOTIVACAO,
  type MedidaDisciplinar,
  type MotivacaoConsequencia,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import { useSessao } from '../lib/sessao';

interface ConsequenciaApi {
  id: string;
  data: string;
  liderNome: string;
  comportamento: string;
  detalhamento: string;
  medida: MedidaDisciplinar;
  motivacao: MotivacaoConsequencia;
  responsavelSst: string | null;
  ocorrenciasDoColaborador: number;
  colaborador?: {
    id: string;
    nome: string;
    funcao: string;
    cliente?: { nomeFantasia: string };
    terceiro?: { nomeFantasia: string } | null;
  };
  rotulos?: { medida: string; motivacao: string };
}

interface ResumoConsequencias {
  total: number;
  reincidentes: number;
  porMedida: Array<{ medida: MedidaDisciplinar; rotulo: string; quantidade: number }>;
}

interface AvisoHierarquia {
  enviado: boolean;
  destinatarios: number;
  motivo?: string;
}

interface OpcaoColaborador {
  id: string;
  nome: string;
  funcao: string;
}

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

interface RelatorioConsequencias {
  periodo: { ano: number; mes: number | null; inicio: string; fim: string };
  total: number;
  colaboradoresEnvolvidos: number;
  reincidentes: number;
  porMedida: Array<{ medida: MedidaDisciplinar; rotulo: string; quantidade: number }>;
  porMotivacao: Array<{ motivacao: MotivacaoConsequencia; rotulo: string; quantidade: number }>;
  porMes: Array<{ mes: string; quantidade: number }>;
  porCliente: Array<{ cliente: string; quantidade: number }>;
  porColaborador: Array<{ nome: string; funcao: string; cliente: string; registros: number }>;
  itens: Array<{
    id: string;
    data: string;
    colaborador: string;
    funcao: string;
    cliente: string;
    lider: string;
    comportamento: string;
    medida: string;
    motivacao: string;
  }>;
}

interface EmpresaCabecalho {
  nomeFantasia?: string;
  logoUrl?: string | null;
}

const PILL_MEDIDA: Record<MedidaDisciplinar, string> = {
  ORIENTACAO_VERBAL: 'info',
  ADVERTENCIA_ESCRITA: 'warn',
  SUSPENSAO: 'orange',
  DESLIGAMENTO: 'bad',
  RECICLAGEM_TREINAMENTO: 'ok',
};

const NOVO_VAZIO = {
  colaboradorId: '',
  liderNome: '',
  data: '',
  comportamento: '',
  detalhamento: '',
  medida: 'ORIENTACAO_VERBAL' as MedidaDisciplinar,
  motivacao: 'INTERNA' as MotivacaoConsequencia,
  responsavelSst: '',
};

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const ROTULO_CAMPO: Record<string, string> = {
  colaboradorId: 'Colaborador envolvido',
  liderNome: 'Líder direto',
  data: 'Data do fato',
  comportamento: 'Comportamento de risco',
  detalhamento: 'Detalhamento',
  medida: 'Medida aplicada',
  motivacao: 'Motivação',
  responsavelSst: 'TST responsável',
};

/** Mesmas regras do schema compartilhado, para avisar antes de enviar. */
function validar(dados: typeof NOVO_VAZIO): Record<string, string> {
  const erros: Record<string, string> = {};
  if (!dados.colaboradorId) erros.colaboradorId = 'Informe o colaborador envolvido.';
  if (dados.liderNome.trim().length < 3) erros.liderNome = 'Informe o nome do líder (mínimo 3 caracteres).';
  if (!dados.data) erros.data = 'Informe a data do fato.';
  else if (dados.data > new Date().toISOString().slice(0, 10)) erros.data = 'A data do fato não pode ser futura.';
  if (dados.comportamento.trim().length < 3) erros.comportamento = 'Descreva o comportamento de risco (mínimo 3 caracteres).';
  if (dados.detalhamento.trim().length < 10) erros.detalhamento = 'Detalhe o ocorrido (mínimo 10 caracteres).';
  return erros;
}

/** Barra proporcional simples (mesma leitura do Dashboard BBS). */
function Barra({ rotulo, valor, maximo, cor = 'var(--primary)' }: { rotulo: string; valor: number; maximo: number; cor?: string }) {
  const pct = maximo > 0 ? Math.round((valor / maximo) * 100) : 0;
  return (
    <div className="barra-bbs">
      <div className="barra-rotulo">{rotulo}</div>
      <div className="barra-trilho">
        <span style={{ width: `${pct}%`, background: cor }} />
      </div>
      <div className="barra-valor">{valor}</div>
    </div>
  );
}

export function ConsequenciasPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('planos:escrever');

  const [aba, setAba] = useState<'registros' | 'relatorio'>('registros');

  const [carregando, setCarregando] = useState(true);
  const [itens, setItens] = useState<ConsequenciaApi[]>([]);
  const [resumo, setResumo] = useState<ResumoConsequencias | null>(null);
  const [colaboradores, setColaboradores] = useState<OpcaoColaborador[]>([]);
  const [medida, setMedida] = useState<MedidaDisciplinar | ''>('');
  const [novo, setNovo] = useState(NOVO_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<AvisoHierarquia | null>(null);

  // Relatorio mensal/anual
  const anoAtual = new Date().getFullYear();
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [filtroRel, setFiltroRel] = useState({ clienteId: '', ano: String(anoAtual), mes: '' });
  const [relatorio, setRelatorio] = useState<RelatorioConsequencias | null>(null);
  const [carregandoRel, setCarregandoRel] = useState(false);
  const [empresa, setEmpresa] = useState<EmpresaCabecalho | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const parametros = new URLSearchParams();
      if (medida) parametros.set('medida', medida);
      const [lista, cards] = await Promise.all([
        api.get<ConsequenciaApi[]>(`/consequencias?${parametros.toString()}`),
        api.get<ResumoConsequencias>('/consequencias/resumo'),
      ]);
      setItens(lista);
      setResumo(cards);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os registros.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [medida, mostrar]);

  useEffect(() => {
    void api.get<OpcaoColaborador[]>('/colaboradores/opcoes').then(setColaboradores).catch(() => setColaboradores([]));
    void carregar();
  }, [carregar]);

  useEffect(() => {
    void api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
    void api.get<EmpresaCabecalho>('/empresa').then(setEmpresa).catch(() => setEmpresa(null));
  }, []);

  const carregarRelatorio = useCallback(async () => {
    setCarregandoRel(true);
    try {
      const parametros = new URLSearchParams({ ano: filtroRel.ano });
      if (filtroRel.clienteId) parametros.set('clienteId', filtroRel.clienteId);
      if (filtroRel.mes) parametros.set('mes', filtroRel.mes);
      setRelatorio(await api.get<RelatorioConsequencias>(`/consequencias/relatorio?${parametros.toString()}`));
    } catch (erro) {
      setRelatorio(null);
      mostrar(erro instanceof Error ? erro.message : 'Falha ao gerar o relatório.', 'erro');
    } finally {
      setCarregandoRel(false);
    }
  }, [filtroRel, mostrar]);

  useEffect(() => {
    if (aba === 'relatorio') void carregarRelatorio();
  }, [aba, carregarRelatorio]);

  function definir<K extends keyof typeof NOVO_VAZIO>(campo: K, valor: (typeof NOVO_VAZIO)[K]) {
    setNovo((atual) => ({ ...atual, [campo]: valor }));
    if (erros[campo]) setErros(({ [campo]: _removido, ...resto }) => resto);
  }

  async function registrar() {
    const locais = validar(novo);
    setErros(locais);
    if (Object.keys(locais).length > 0) {
      mostrar(`Corrija ${Object.keys(locais).length === 1 ? 'o campo destacado' : 'os campos destacados'}.`, 'erro');
      return;
    }
    setSalvando(true);
    setAviso(null);
    try {
      const criado = await api.post<{ aviso?: AvisoHierarquia }>('/consequencias', {
        ...novo,
        responsavelSst: novo.responsavelSst || undefined,
      });
      setAviso(criado?.aviso ?? null);
      mostrar('Registro de consequência criado.', 'sucesso');
      setNovo(NOVO_VAZIO);
      setErros({});
      void carregar();
    } catch (erro) {
      if (erro instanceof ErroApi) {
        const porCampo: Record<string, string> = {};
        for (const [campo, mensagens] of Object.entries(erro.campos)) porCampo[campo] = mensagens[0] ?? 'Valor inválido.';
        setErros(porCampo);
        mostrar(erro.mensagemAmigavel(), 'erro');
      } else {
        mostrar('Falha ao registrar.', 'erro');
      }
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(item: ConsequenciaApi) {
    if (!window.confirm('Excluir este registro de consequência?')) return;
    try {
      await api.delete(`/consequencias/${item.id}`);
      mostrar('Registro excluído.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao excluir.', 'erro');
    }
  }

  /* --- dados derivados do relatorio ---------------------------------------- */
  const anoRel = relatorio?.periodo.ano ?? Number(filtroRel.ano);
  const mesesDoAno = Array.from({ length: 12 }, (_, i) => {
    const chave = `${anoRel}-${String(i + 1).padStart(2, '0')}`;
    return { chave, rotulo: `${MESES_ABREV[i]}/${anoRel}`, quantidade: relatorio?.porMes.find((m) => m.mes === chave)?.quantidade ?? 0 };
  });
  const maxMes = Math.max(1, ...mesesDoAno.map((m) => m.quantidade));
  const maxMedida = Math.max(1, ...(relatorio?.porMedida.map((m) => m.quantidade) ?? [0]));
  const maxCliente = Math.max(1, ...(relatorio?.porCliente.map((c) => c.quantidade) ?? [0]));
  const nomeCliente = clientes.find((c) => c.id === filtroRel.clienteId)?.nomeFantasia;
  const rotuloPeriodo = relatorio?.periodo.mes ? `${MESES[relatorio.periodo.mes - 1]} de ${anoRel}` : `Ano de ${anoRel}`;
  const anos = Array.from({ length: 6 }, (_, i) => anoAtual - i);

  return (
    <>
      <div className={`painel${aba === 'relatorio' ? ' sem-impressao' : ''}`}>
        <h3>Gestão de Consequências</h3>
        <p className="desc">
          Comportamento de risco → envolvido → líder → medida aplicada, no formato da planilha real da operação. A
          reincidência é <b>derivada, nunca digitada</b>: o sistema conta os registros de cada colaborador. Cada registro
          avisa por e-mail os níveis hierárquicos cadastrados no cliente.
        </p>

        {resumo && aba === 'registros' ? (
          <div className="stat-grid">
            <div className="stat">
              <b>{resumo.total}</b>
              <span>registros</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.reincidentes > 0 ? 'var(--red)' : undefined }}>{resumo.reincidentes}</b>
              <span>colaboradores reincidentes</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.reincidentes > 0 ? 'var(--red)' : undefined }}>
                {resumo.total > 0 ? ((resumo.reincidentes / resumo.total) * 100).toFixed(1) : '0.0'}%
              </b>
              <span>taxa de reincidência</span>
            </div>
            {resumo.porMedida.map((linha) => (
              <div className="stat" key={linha.medida}>
                <b>{linha.quantidade}</b>
                <span>{linha.rotulo.toLowerCase()}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="abas sem-impressao">
        <button type="button" className={aba === 'registros' ? 'ativa' : ''} onClick={() => setAba('registros')}>
          Registros
        </button>
        <button type="button" className={aba === 'relatorio' ? 'ativa' : ''} onClick={() => setAba('relatorio')}>
          Relatório mensal / anual
        </button>
      </div>

      {aba === 'registros' ? (
        <>
          {aviso ? (
            <div className={`hint${aviso.enviado ? '' : ' alerta'}`} role="status" style={{ marginBottom: 12 }}>
              <Icone nome="envelope" />{' '}
              {aviso.enviado ? (
                <>
                  <b>Níveis hierárquicos avisados:</b> e-mail enviado para {aviso.destinatarios} destinatário(s).
                </>
              ) : (
                <>
                  <b>O aviso aos níveis hierárquicos não foi enviado.</b>{' '}
                  {aviso.motivo ?? 'Motivo não informado.'}
                  {aviso.destinatarios === 0 ? ' Cadastre os contatos hierárquicos com e-mail em Clientes > Contatos.' : ''}
                </>
              )}
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => setAviso(null)}>
                Fechar
              </button>
            </div>
          ) : null}

          {podeEscrever ? (
            <div className="painel">
              <h3>Novo registro</h3>
              <div className="filtros">
                <Campo label="Colaborador envolvido" htmlFor="nc-colab" obrigatorio erro={erros.colaboradorId}>
                  <select id="nc-colab" value={novo.colaboradorId} onChange={(e) => definir('colaboradorId', e.target.value)}>
                    <option value="">Selecione...</option>
                    {colaboradores.map((colaborador) => (
                      <option key={colaborador.id} value={colaborador.id}>
                        {colaborador.nome} — {colaborador.funcao}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Líder direto" htmlFor="nc-lider" obrigatorio erro={erros.liderNome}>
                  <input id="nc-lider" value={novo.liderNome} onChange={(e) => definir('liderNome', e.target.value)} />
                </Campo>
                <Campo label="Data do fato" htmlFor="nc-data" obrigatorio erro={erros.data}>
                  <input id="nc-data" type="date" value={novo.data} onChange={(e) => definir('data', e.target.value)} />
                </Campo>
                <Campo label="Medida aplicada" htmlFor="nc-medida" obrigatorio erro={erros.medida}>
                  <select id="nc-medida" value={novo.medida} onChange={(e) => definir('medida', e.target.value as MedidaDisciplinar)}>
                    {MEDIDAS_DISCIPLINARES.map((item) => (
                      <option key={item} value={item}>
                        {ROTULO_MEDIDA[item]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Motivação" htmlFor="nc-motivacao" erro={erros.motivacao}>
                  <select id="nc-motivacao" value={novo.motivacao} onChange={(e) => definir('motivacao', e.target.value as MotivacaoConsequencia)}>
                    {MOTIVACOES_CONSEQUENCIA.map((item) => (
                      <option key={item} value={item}>
                        {ROTULO_MOTIVACAO[item]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="TST responsável" htmlFor="nc-tst" erro={erros.responsavelSst}>
                  <input id="nc-tst" value={novo.responsavelSst} onChange={(e) => definir('responsavelSst', e.target.value)} />
                </Campo>
              </div>

              <Campo
                label="Comportamento de risco"
                htmlFor="nc-comp"
                obrigatorio
                erro={erros.comportamento}
                ajuda="Ex.: violação de bloqueio LOTO, não uso de EPI, atividade sem PT."
              >
                <input id="nc-comp" className="busca" value={novo.comportamento} onChange={(e) => definir('comportamento', e.target.value)} />
              </Campo>
              <Campo label="Detalhamento do ocorrido" htmlFor="nc-det" obrigatorio erro={erros.detalhamento} ajuda="Mínimo de 10 caracteres.">
                <textarea id="nc-det" rows={3} value={novo.detalhamento} onChange={(e) => definir('detalhamento', e.target.value)} />
              </Campo>

              {Object.keys(erros).length > 0 ? (
                <div className="hint alerta" role="alert">
                  <b>Corrija antes de registrar:</b>
                  <ul style={{ margin: '4px 0 0 18px' }}>
                    {Object.entries(erros).map(([campo, mensagem]) => (
                      <li key={campo}>
                        <b>{ROTULO_CAMPO[campo] ?? campo}</b> — {mensagem}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="barra-acoes">
                <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void registrar()}>
                  {salvando ? 'Registrando...' : 'Registrar'}
                </button>
                <span className="hint">Registro sensível: fica na trilha de auditoria com autor e data; os níveis hierárquicos do cliente recebem aviso por e-mail.</span>
              </div>
            </div>
          ) : null}

          <div className="painel">
            <div className="filtros">
              <Campo label="Medida" htmlFor="fc-medida">
                <select id="fc-medida" value={medida} onChange={(e) => setMedida(e.target.value as MedidaDisciplinar | '')}>
                  <option value="">Todas</option>
                  {MEDIDAS_DISCIPLINARES.map((item) => (
                    <option key={item} value={item}>
                      {ROTULO_MEDIDA[item]}
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
                  <Icone nome="pessoas" tamanho={22} />
                </div>
                <h4>Nenhum registro</h4>
                <p>O histórico de gestão de consequências aparece aqui, com a reincidência contada automaticamente.</p>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Envolvido</th>
                      <th>Comportamento</th>
                      <th>Medida</th>
                      <th>Motivação</th>
                      <th className="num-col">Reincidência</th>
                      {podeEscrever ? <th aria-label="Ações" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item) => (
                      <tr key={item.id}>
                        <td>{formatarDataIso(item.data)}</td>
                        <td>
                          <b>{item.colaborador?.nome}</b>
                          <div className="hint">
                            {item.colaborador?.funcao} · líder: {item.liderNome}
                          </div>
                        </td>
                        <td>
                          {item.comportamento}
                          <div className="hint">{item.detalhamento.slice(0, 90)}...</div>
                        </td>
                        <td>
                          <span className={`pill ${PILL_MEDIDA[item.medida]}`}>{item.rotulos?.medida ?? item.medida}</span>
                        </td>
                        <td>{item.rotulos?.motivacao ?? item.motivacao}</td>
                        <td className="num-col">
                          {item.ocorrenciasDoColaborador > 1 ? (
                            <span className="pill bad">{item.ocorrenciasDoColaborador}ª ocorrência</span>
                          ) : (
                            <span className="hint">1ª</span>
                          )}
                        </td>
                        {podeEscrever ? (
                          <td>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluir(item)}>
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
      ) : (
        <>
          <div className="painel sem-impressao">
            <h3>Relatório da matriz de consequências</h3>
            <p className="desc">Escolha o ano; informe o mês para o relatório mensal ou deixe em branco para o anual.</p>
            <div className="filtros">
              <Campo label="Cliente" htmlFor="rc-cliente">
                <select id="rc-cliente" value={filtroRel.clienteId} onChange={(e) => setFiltroRel({ ...filtroRel, clienteId: e.target.value })}>
                  <option value="">Todos os clientes</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nomeFantasia}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Ano" htmlFor="rc-ano" obrigatorio>
                <select id="rc-ano" value={filtroRel.ano} onChange={(e) => setFiltroRel({ ...filtroRel, ano: e.target.value })}>
                  {anos.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Mês" htmlFor="rc-mes" ajuda="Em branco = relatório anual.">
                <select id="rc-mes" value={filtroRel.mes} onChange={(e) => setFiltroRel({ ...filtroRel, mes: e.target.value })}>
                  <option value="">Ano inteiro</option>
                  {MESES.map((nome, i) => (
                    <option key={nome} value={i + 1}>
                      {nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            <div className="barra-acoes">
              <button type="button" className="btn btn-primary" disabled={!relatorio || carregandoRel} onClick={() => window.print()}>
                <Icone nome="impressora" /> Imprimir
              </button>
              {!relatorio && !carregandoRel ? <span className="hint">Gere o relatório para habilitar a impressão.</span> : null}
            </div>
          </div>

          {carregandoRel ? (
            <div className="centro-tela">
              <div className="spinner" />
              Gerando relatório...
            </div>
          ) : relatorio ? (
            <div className="painel folha">
              <div className="folha-cabecalho">
                <div>
                  <h2>Matriz de consequências — {rotuloPeriodo}</h2>
                  <div className="hint">
                    {nomeCliente ?? 'Todos os clientes'} · gerado em {new Date().toLocaleString('pt-BR')}
                  </div>
                </div>
                <div className="meta">
                  {empresa?.logoUrl ? (
                    <img src={urlAbsoluta(empresa.logoUrl) ?? undefined} alt={empresa.nomeFantasia ?? 'Logo'} style={{ maxHeight: 48 }} />
                  ) : empresa?.nomeFantasia ? (
                    <b>{empresa.nomeFantasia}</b>
                  ) : null}
                </div>
              </div>

              <div className="stat-grid">
                <div className="stat">
                  <b>{relatorio.total}</b>
                  <span>registros</span>
                </div>
                <div className="stat">
                  <b>{relatorio.colaboradoresEnvolvidos}</b>
                  <span>colaboradores envolvidos</span>
                </div>
                <div className="stat">
                  <b style={{ color: relatorio.reincidentes > 0 ? 'var(--red)' : undefined }}>{relatorio.reincidentes}</b>
                  <span>reincidentes no período</span>
                </div>
              </div>

              {relatorio.total === 0 ? (
                <div className="vazio">
                  <div className="icone-vazio" aria-hidden="true">
                    <Icone nome="ok" tamanho={22} />
                  </div>
                  <h4>Nenhum registro no período</h4>
                  <p>Não houve aplicação de medida neste período{nomeCliente ? ` para ${nomeCliente}` : ''}.</p>
                </div>
              ) : (
                <>
                  <div className="grid2" style={{ gap: 24 }}>
                    {!relatorio.periodo.mes ? (
                      <div className="folha-secao">
                        <h4>Por mês</h4>
                        <div className="barras-bbs">
                          {mesesDoAno.map((m) => (
                            <Barra key={m.chave} rotulo={m.rotulo} valor={m.quantidade} maximo={maxMes} />
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="folha-secao">
                      <h4>Por medida aplicada</h4>
                      <div className="barras-bbs">
                        {relatorio.porMedida.map((m) => (
                          <Barra key={m.medida} rotulo={m.rotulo} valor={m.quantidade} maximo={maxMedida} cor="var(--orange)" />
                        ))}
                      </div>
                      {relatorio.porMotivacao.length > 0 ? (
                        <>
                          <h4 style={{ marginTop: 16 }}>Por motivação</h4>
                          <div className="barras-bbs">
                            {relatorio.porMotivacao.map((m) => (
                              <Barra key={m.motivacao} rotulo={m.rotulo} valor={m.quantidade} maximo={maxMedida} cor="var(--blue)" />
                            ))}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="folha-secao">
                    <h4>Por empresa</h4>
                    <div className="tbl-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Empresa</th>
                            <th className="num-col">Registros</th>
                            <th style={{ width: '45%' }}>Proporção</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...relatorio.porCliente]
                            .sort((a, b) => b.quantidade - a.quantidade)
                            .map((c) => (
                              <tr key={c.cliente}>
                                <td>
                                  <b>{c.cliente}</b>
                                </td>
                                <td className="num-col">{c.quantidade}</td>
                                <td>
                                  <div className="barra-trilho">
                                    <span style={{ width: `${Math.round((c.quantidade / maxCliente) * 100)}%`, background: 'var(--primary)' }} />
                                  </div>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="folha-secao">
                    <h4>Ranking por colaborador</h4>
                    <div className="tbl-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Colaborador</th>
                            <th>Função</th>
                            <th>Empresa</th>
                            <th className="num-col">Registros</th>
                          </tr>
                        </thead>
                        <tbody>
                          {relatorio.porColaborador.map((c, i) => (
                            <tr key={`${c.nome}-${c.cliente}-${i}`}>
                              <td>{i + 1}</td>
                              <td>
                                <b>{c.nome}</b>
                              </td>
                              <td>{c.funcao}</td>
                              <td>{c.cliente}</td>
                              <td className="num-col">
                                {c.registros > 1 ? <span className="pill bad">{c.registros} (reincidente)</span> : c.registros}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="folha-secao">
                    <h4>Lista nominal</h4>
                    <div className="tbl-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>Colaborador</th>
                            <th>Empresa</th>
                            <th>Líder</th>
                            <th>Comportamento</th>
                            <th>Medida</th>
                            <th>Motivação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {relatorio.itens.map((item) => (
                            <tr key={item.id}>
                              <td>{formatarDataIso(item.data)}</td>
                              <td>
                                <b>{item.colaborador}</b>
                                <div className="hint">{item.funcao}</div>
                              </td>
                              <td>{item.cliente}</td>
                              <td>{item.lider}</td>
                              <td>{item.comportamento}</td>
                              <td>{item.medida}</td>
                              <td>{item.motivacao}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              <div className="folha-assinatura">
                <div>
                  <div style={{ height: 50 }} />
                  Responsável SST
                </div>
                <div>
                  <div style={{ height: 50 }} />
                  Gestão do cliente
                </div>
              </div>
            </div>
          ) : (
            <div className="vazio">
              <div className="icone-vazio" aria-hidden="true">
                <Icone nome="documento" tamanho={22} />
              </div>
              <h4>Relatório indisponível</h4>
              <p>Não foi possível gerar o relatório com estes filtros. Ajuste e tente de novo.</p>
            </div>
          )}
        </>
      )}
    </>
  );
}
