import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CATEGORIAS_LANCAMENTO_SUGERIDAS,
  ROTULO_SITUACAO_LANCAMENTO,
  ROTULO_TIPO_LANCAMENTO,
  SITUACOES_LANCAMENTO,
  TIPOS_LANCAMENTO,
  type LancamentoFormValues,
  type SituacaoLancamento,
  type TipoLancamento,
} from '@safetyguard/shared';
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

interface OpcaoFornecedor {
  id: string;
  nome: string;
  ativo: boolean;
}

interface LancamentoApi {
  id: string;
  clienteId: string | null;
  fornecedorId: string | null;
  tipo: TipoLancamento;
  categoria: string;
  descricao: string;
  valor: number;
  data: string;
  vencimento: string | null;
  situacao: SituacaoLancamento;
  notaFiscal: string | null;
  observacoes: string | null;
  vencido: boolean;
  cliente: OpcaoCliente | null;
  fornecedor: { id: string; nome: string } | null;
  rotulos: { tipo: string; situacao: string };
}

interface LinhaMensal {
  mes: number;
  rotulo: string;
  receitas: number;
  despesas: number;
  saldo: number;
}

interface ResumoApi {
  ano: number;
  meses: LinhaMensal[];
  totais: {
    receitas: number;
    despesas: number;
    saldo: number;
    recebido: number;
    pago: number;
    aReceber: number;
    aPagar: number;
    lancamentos: number;
    cancelados: number;
  };
  pendentesVencidos: { quantidade: number; total: number };
  porCategoria: Array<{ tipo: TipoLancamento; categoria: string; total: number; quantidade: number }>;
  porCliente: Array<{ clienteId: string | null; nome: string; receitas: number; despesas: number; saldo: number }>;
}

const REAL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const PILL_SITUACAO: Record<SituacaoLancamento, string> = { PENDENTE: 'warn', PAGO: 'ok', CANCELADO: 'gray' };

const FORM_VAZIO: LancamentoFormValues = {
  clienteId: '',
  fornecedorId: '',
  tipo: 'RECEITA',
  categoria: '',
  descricao: '',
  valor: '',
  data: '',
  vencimento: '',
  situacao: 'PENDENTE',
  notaFiscal: '',
  observacoes: '',
};

type Erros = Partial<Record<keyof LancamentoFormValues, string>>;

function errosDoApi(erro: unknown): Erros {
  if (!(erro instanceof ErroApi)) return {};
  const saida: Erros = {};
  for (const [campo, mensagens] of Object.entries(erro.campos)) {
    saida[campo as keyof LancamentoFormValues] = mensagens[0];
  }
  return saida;
}

function paraFormulario(l: LancamentoApi): LancamentoFormValues {
  return {
    clienteId: l.clienteId ?? '',
    fornecedorId: l.fornecedorId ?? '',
    tipo: l.tipo,
    categoria: l.categoria,
    descricao: l.descricao,
    valor: String(l.valor),
    data: l.data.slice(0, 10),
    vencimento: l.vencimento ? l.vencimento.slice(0, 10) : '',
    situacao: l.situacao,
    notaFiscal: l.notaFiscal ?? '',
    observacoes: l.observacoes ?? '',
  };
}

function hojeIso(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
}

export function PlanilhaFinanceiraPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('cadastros:escrever');

  const anoCorrente = new Date().getFullYear();
  const [ano, setAno] = useState(anoCorrente);
  const [clienteId, setClienteId] = useState('');
  const [tipo, setTipo] = useState<'' | TipoLancamento>('');
  const [situacao, setSituacao] = useState<'' | SituacaoLancamento>('');

  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [fornecedores, setFornecedores] = useState<OpcaoFornecedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [itens, setItens] = useState<LancamentoApi[]>([]);
  const [resumo, setResumo] = useState<ResumoApi | null>(null);

  const [form, setForm] = useState<LancamentoFormValues>({ ...FORM_VAZIO, data: hojeIso() });
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [erros, setErros] = useState<Erros>({});
  const [salvando, setSalvando] = useState(false);
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    void api.get<OpcaoCliente[]>('/clientes/opcoes?incluirInativos=true').then(setClientes).catch(() => setClientes([]));
    void api.get<OpcaoFornecedor[]>('/fornecedores?inativos=true').then(setFornecedores).catch(() => setFornecedores([]));
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const params = new URLSearchParams({ ano: String(ano) });
      if (clienteId) params.set('clienteId', clienteId);
      const paramsLista = new URLSearchParams(params);
      if (tipo) paramsLista.set('tipo', tipo);
      if (situacao) paramsLista.set('situacao', situacao);

      const [lista, cards] = await Promise.all([
        api.get<LancamentoApi[]>(`/financeiro/lancamentos?${paramsLista.toString()}`),
        api.get<ResumoApi>(`/financeiro/lancamentos/resumo?${params.toString()}`),
      ]);
      setItens(lista);
      setResumo(cards);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar a planilha.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [ano, clienteId, tipo, situacao, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const anos = useMemo(() => {
    const lista = new Set<number>([anoCorrente - 2, anoCorrente - 1, anoCorrente, anoCorrente + 1, ano]);
    return [...lista].sort((a, b) => b - a);
  }, [ano, anoCorrente]);

  const maiorMes = useMemo(
    () => Math.max(1, ...(resumo?.meses.map((m) => Math.max(m.receitas, m.despesas)) ?? [])),
    [resumo],
  );

  function atualizar<K extends keyof LancamentoFormValues>(campo: K, valor: LancamentoFormValues[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    if (erros[campo]) setErros((atual) => ({ ...atual, [campo]: undefined }));
  }

  function limparForm() {
    setEditandoId(null);
    setForm({ ...FORM_VAZIO, data: hojeIso() });
    setErros({});
  }

  function editar(l: LancamentoApi) {
    setEditandoId(l.id);
    setForm(paraFormulario(l));
    setErros({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function salvar() {
    setSalvando(true);
    setErros({});
    try {
      if (editandoId) {
        await api.put(`/financeiro/lancamentos/${editandoId}`, form);
        mostrar('Lançamento atualizado.', 'sucesso');
      } else {
        await api.post('/financeiro/lancamentos', form);
        mostrar('Lançamento registrado.', 'sucesso');
      }
      limparForm();
      void carregar();
    } catch (erro) {
      setErros(errosDoApi(erro));
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao salvar o lançamento.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function mudarSituacao(l: LancamentoApi, nova: SituacaoLancamento) {
    if (nova === 'CANCELADO' && !window.confirm(`Cancelar o lançamento "${l.descricao}"? Ele sai de todas as somas.`)) return;
    try {
      await api.put(`/financeiro/lancamentos/${l.id}`, { situacao: nova });
      mostrar(nova === 'PAGO' ? 'Marcado como pago.' : `Situação alterada para ${ROTULO_SITUACAO_LANCAMENTO[nova].toLowerCase()}.`, 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao alterar a situação.', 'erro');
    }
  }

  async function excluir(l: LancamentoApi) {
    if (!window.confirm(`Excluir definitivamente "${l.descricao}" (${REAL.format(l.valor)})?`)) return;
    try {
      await api.delete(`/financeiro/lancamentos/${l.id}`);
      mostrar('Lançamento excluído.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.message : 'Falha ao excluir.', 'erro');
    }
  }

  async function baixarExcel() {
    setBaixando(true);
    try {
      const params = new URLSearchParams({ ano: String(ano) });
      if (clienteId) params.set('clienteId', clienteId);
      const resposta = await fetch(`${API_URL}/api/v1/financeiro/lancamentos/planilha.xlsx?${params.toString()}`, {
        headers: { Authorization: `Bearer ${lerTokenSalvo() ?? ''}` },
      });
      if (!resposta.ok) throw new Error(`A API respondeu ${resposta.status} ao gerar o Excel.`);
      const url = URL.createObjectURL(await resposta.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `planilha-financeira-${ano}.xlsx`;
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

  const totais = resumo?.totais;
  const formIncompleto = !form.descricao.trim() || !form.categoria.trim() || !form.valor || !form.data;

  return (
    <>
      <div className="painel">
        <h3>Planilha financeira</h3>
        <p className="desc">
          Receitas e despesas da consultoria, lançamento a lançamento, com cliente e fornecedor. Os cancelados ficam
          fora das somas. O botão "Baixar Excel" gera a planilha do ano com os lançamentos e o resumo mensal.
        </p>

        <div className="filtros">
          <Campo label="Ano" htmlFor="pf-ano">
            <select id="pf-ano" className="estreito" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Cliente" htmlFor="pf-cliente">
            <select id="pf-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Tipo" htmlFor="pf-tipo">
            <select id="pf-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as '' | TipoLancamento)}>
              <option value="">Receitas e despesas</option>
              {TIPOS_LANCAMENTO.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO_LANCAMENTO[t]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Situação" htmlFor="pf-situacao">
            <select id="pf-situacao" value={situacao} onChange={(e) => setSituacao(e.target.value as '' | SituacaoLancamento)}>
              <option value="">Todas</option>
              {SITUACOES_LANCAMENTO.map((s) => (
                <option key={s} value={s}>
                  {ROTULO_SITUACAO_LANCAMENTO[s]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label=" " htmlFor="pf-excel">
            <button id="pf-excel" type="button" className="btn btn-outline" disabled={baixando} onClick={() => void baixarExcel()}>
              <Icone nome="documento" tamanho={14} /> {baixando ? 'Gerando...' : 'Baixar Excel'}
            </button>
          </Campo>
        </div>

        {totais ? (
          <div className="stat-grid">
            <div className="stat">
              <b style={{ color: 'var(--green)' }}>{REAL.format(totais.receitas)}</b>
              <span>receitas em {ano} · {REAL.format(totais.aReceber)} a receber</span>
            </div>
            <div className="stat">
              <b style={{ color: 'var(--red)' }}>{REAL.format(totais.despesas)}</b>
              <span>despesas em {ano} · {REAL.format(totais.aPagar)} a pagar</span>
            </div>
            <div className="stat">
              <b style={{ color: totais.saldo < 0 ? 'var(--red)' : undefined }}>{REAL.format(totais.saldo)}</b>
              <span>saldo do ano</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo && resumo.pendentesVencidos.quantidade > 0 ? 'var(--red)' : undefined }}>
                {resumo?.pendentesVencidos.quantidade ?? 0}
              </b>
              <span>pendentes vencidos · {REAL.format(resumo?.pendentesVencidos.total ?? 0)}</span>
            </div>
          </div>
        ) : null}
      </div>

      {resumo ? (
        <div className="painel">
          <h3>Mês a mês</h3>
          <p className="hint" style={{ marginBottom: 12 }}>
            <span className="pill ok">Receitas</span> <span className="pill bad">Despesas</span> — barras proporcionais ao maior mês do ano.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {resumo.meses.map((m) => (
              <div key={m.mes} className="barra-bbs">
                <div className="barra-rotulo">
                  {m.rotulo}/{String(ano).slice(2)}
                </div>
                <div style={{ display: 'grid', gap: 3 }}>
                  <div className="barra-trilho">
                    <span style={{ width: `${Math.round((m.receitas / maiorMes) * 100)}%`, background: 'var(--green)' }} />
                  </div>
                  <div className="barra-trilho">
                    <span style={{ width: `${Math.round((m.despesas / maiorMes) * 100)}%`, background: 'var(--red)' }} />
                  </div>
                </div>
                <div className="barra-valor" style={{ color: m.saldo < 0 ? 'var(--red)' : undefined }}>
                  {REAL.format(m.saldo)}
                  <small>
                    {REAL.format(m.receitas)} / {REAL.format(m.despesas)}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {podeEscrever ? (
        <div className="painel">
          <h3>{editandoId ? 'Editar lançamento' : 'Novo lançamento'}</h3>
          <div className="filtros">
            <Campo label="Tipo" htmlFor="nl-tipo" obrigatorio erro={erros.tipo}>
              <select id="nl-tipo" className="estreito" value={form.tipo} onChange={(e) => atualizar('tipo', e.target.value)}>
                {TIPOS_LANCAMENTO.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO_LANCAMENTO[t]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Categoria" htmlFor="nl-categoria" obrigatorio erro={erros.categoria}>
              <input id="nl-categoria" list="nl-categorias" value={form.categoria} onChange={(e) => atualizar('categoria', e.target.value)} />
              <datalist id="nl-categorias">
                {(CATEGORIAS_LANCAMENTO_SUGERIDAS[form.tipo as TipoLancamento] ?? []).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Campo>
            <Campo label="Descrição" htmlFor="nl-descricao" obrigatorio erro={erros.descricao}>
              <input id="nl-descricao" className="busca" value={form.descricao} onChange={(e) => atualizar('descricao', e.target.value)} />
            </Campo>
            <Campo label="Valor (R$)" htmlFor="nl-valor" obrigatorio erro={erros.valor}>
              <input
                id="nl-valor"
                type="number"
                min={0.01}
                step={0.01}
                className="estreito"
                value={form.valor}
                onChange={(e) => atualizar('valor', e.target.value)}
              />
            </Campo>
            <Campo label="Data" htmlFor="nl-data" obrigatorio erro={erros.data}>
              <input id="nl-data" type="date" value={form.data} onChange={(e) => atualizar('data', e.target.value)} />
            </Campo>
            <Campo label="Vencimento" htmlFor="nl-vencimento" erro={erros.vencimento}>
              <input id="nl-vencimento" type="date" value={form.vencimento} onChange={(e) => atualizar('vencimento', e.target.value)} />
            </Campo>
            <Campo label="Cliente" htmlFor="nl-cliente" erro={erros.clienteId}>
              <select id="nl-cliente" value={form.clienteId} onChange={(e) => atualizar('clienteId', e.target.value)}>
                <option value="">—</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nomeFantasia}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Fornecedor" htmlFor="nl-fornecedor" erro={erros.fornecedorId}>
              <select id="nl-fornecedor" value={form.fornecedorId} onChange={(e) => atualizar('fornecedorId', e.target.value)}>
                <option value="">—</option>
                {fornecedores
                  .filter((f) => f.ativo || f.id === form.fornecedorId)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                      {f.ativo ? '' : ' (inativo)'}
                    </option>
                  ))}
              </select>
            </Campo>
            <Campo label="Nota fiscal" htmlFor="nl-nf" erro={erros.notaFiscal}>
              <input id="nl-nf" className="estreito mono" value={form.notaFiscal} onChange={(e) => atualizar('notaFiscal', e.target.value)} />
            </Campo>
            <Campo label="Situação" htmlFor="nl-situacao" erro={erros.situacao}>
              <select id="nl-situacao" value={form.situacao} onChange={(e) => atualizar('situacao', e.target.value)}>
                {SITUACOES_LANCAMENTO.map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_SITUACAO_LANCAMENTO[s]}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo label="Observações" htmlFor="nl-obs" erro={erros.observacoes}>
            <textarea id="nl-obs" rows={2} value={form.observacoes} onChange={(e) => atualizar('observacoes', e.target.value)} />
          </Campo>
          <div className="barra-acoes">
            <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void salvar()}>
              {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Registrar lançamento'}
            </button>
            {editandoId ? (
              <button type="button" className="btn btn-ghost" onClick={limparForm}>
                Cancelar edição
              </button>
            ) : null}
            {formIncompleto ? <span className="hint">Tipo, categoria, descrição, valor e data são obrigatórios.</span> : null}
          </div>
        </div>
      ) : null}

      <div className="painel">
        <h3>Lançamentos de {ano}</h3>
        {carregando && itens.length === 0 ? (
          <div className="centro-tela">
            <div className="spinner" />
            Carregando...
          </div>
        ) : itens.length === 0 ? (
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="grafico" tamanho={22} />
            </div>
            <h4>Nenhum lançamento</h4>
            <p>Nada registrado para os filtros escolhidos.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th className="num-col">Valor</th>
                  <th>Vencimento</th>
                  <th>Situação</th>
                  <th>NF</th>
                  {podeEscrever ? <th aria-label="Ações" /> : null}
                </tr>
              </thead>
              <tbody>
                {itens.map((l) => (
                  <tr key={l.id} style={{ opacity: l.situacao === 'CANCELADO' ? 0.55 : 1 }}>
                    <td>{formatarDataIso(l.data)}</td>
                    <td>
                      <span className={`pill ${l.tipo === 'RECEITA' ? 'ok' : 'bad'}`}>{l.rotulos.tipo}</span>
                    </td>
                    <td>
                      <b>{l.descricao}</b>
                      <div className="hint">
                        {l.cliente ? `Cliente: ${l.cliente.nomeFantasia}` : null}
                        {l.cliente && l.fornecedor ? ' · ' : null}
                        {l.fornecedor ? `Fornecedor: ${l.fornecedor.nome}` : null}
                      </div>
                    </td>
                    <td>{l.categoria}</td>
                    <td className="num-col">
                      <b style={{ color: l.tipo === 'RECEITA' ? 'var(--green)' : 'var(--red)' }}>
                        {l.tipo === 'DESPESA' ? '− ' : ''}
                        {REAL.format(l.valor)}
                      </b>
                    </td>
                    <td>
                      {l.vencimento ? (
                        l.vencido ? (
                          <span className="pill bad">{formatarDataIso(l.vencimento)}</span>
                        ) : (
                          formatarDataIso(l.vencimento)
                        )
                      ) : (
                        <span className="hint">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`pill ${PILL_SITUACAO[l.situacao]}`}>{l.rotulos.situacao}</span>
                    </td>
                    <td className="mono">{l.notaFiscal ?? <span className="hint">—</span>}</td>
                    {podeEscrever ? (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {l.situacao === 'PENDENTE' ? (
                          <>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => void mudarSituacao(l, 'PAGO')}>
                              Marcar pago
                            </button>{' '}
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void mudarSituacao(l, 'CANCELADO')}>
                              Cancelar
                            </button>{' '}
                          </>
                        ) : l.situacao === 'CANCELADO' ? (
                          <>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void mudarSituacao(l, 'PENDENTE')}>
                              Reabrir
                            </button>{' '}
                          </>
                        ) : null}
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => editar(l)}>
                          Editar
                        </button>{' '}
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluir(l)}>
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

      {resumo && (resumo.porCategoria.length > 0 || resumo.porCliente.length > 0) ? (
        <div className="grid2">
          <div className="painel">
            <h3>Por categoria</h3>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Categoria</th>
                    <th className="num-col">Qtd.</th>
                    <th className="num-col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.porCategoria.map((c) => (
                    <tr key={`${c.tipo}-${c.categoria}`}>
                      <td>
                        <span className={`pill ${c.tipo === 'RECEITA' ? 'ok' : 'bad'}`}>{ROTULO_TIPO_LANCAMENTO[c.tipo]}</span>
                      </td>
                      <td>{c.categoria}</td>
                      <td className="num-col">{c.quantidade}</td>
                      <td className="num-col">{REAL.format(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="painel">
            <h3>Por cliente</h3>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th className="num-col">Receitas</th>
                    <th className="num-col">Despesas</th>
                    <th className="num-col">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.porCliente.map((c) => (
                    <tr key={c.clienteId ?? 'sem-cliente'}>
                      <td>{c.nome}</td>
                      <td className="num-col">{REAL.format(c.receitas)}</td>
                      <td className="num-col">{REAL.format(c.despesas)}</td>
                      <td className="num-col">
                        <b style={{ color: c.saldo < 0 ? 'var(--red)' : undefined }}>{REAL.format(c.saldo)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
