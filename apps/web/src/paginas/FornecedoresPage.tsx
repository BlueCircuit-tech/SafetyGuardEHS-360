import { useCallback, useEffect, useState } from 'react';
import {
  CATEGORIAS_FORNECEDOR_SUGERIDAS,
  formatarCnpj,
  formatarTelefone,
  limparTelefone,
  type FornecedorFormValues,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import { MASCARAS } from '../lib/mascaras';
import { useSessao } from '../lib/sessao';

interface FornecedorApi {
  id: string;
  nome: string;
  cnpj: string | null;
  categoria: string | null;
  contatoNome: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  site: string | null;
  observacoes: string | null;
  ativo: boolean;
  totalLancamentos: number;
}

const FORM_VAZIO: FornecedorFormValues = {
  nome: '',
  cnpj: '',
  categoria: '',
  contatoNome: '',
  telefone: '',
  whatsapp: '',
  email: '',
  site: '',
  observacoes: '',
  ativo: true,
};

type Erros = Partial<Record<keyof FornecedorFormValues, string>>;

function errosDoApi(erro: unknown): Erros {
  if (!(erro instanceof ErroApi)) return {};
  const saida: Erros = {};
  for (const [campo, mensagens] of Object.entries(erro.campos)) {
    saida[campo as keyof FornecedorFormValues] = mensagens[0];
  }
  return saida;
}

function paraFormulario(fornecedor: FornecedorApi): FornecedorFormValues {
  return {
    nome: fornecedor.nome,
    cnpj: fornecedor.cnpj ? MASCARAS.cnpj(fornecedor.cnpj) : '',
    categoria: fornecedor.categoria ?? '',
    contatoNome: fornecedor.contatoNome ?? '',
    telefone: fornecedor.telefone ? MASCARAS.telefone(fornecedor.telefone) : '',
    whatsapp: fornecedor.whatsapp ? MASCARAS.telefone(fornecedor.whatsapp) : '',
    email: fornecedor.email ?? '',
    site: fornecedor.site ?? '',
    observacoes: fornecedor.observacoes ?? '',
    ativo: fornecedor.ativo,
  };
}

function linkSite(site: string): string {
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}

export function FornecedoresPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('cadastros:escrever');

  const [carregando, setCarregando] = useState(true);
  const [itens, setItens] = useState<FornecedorApi[]>([]);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [incluirInativos, setIncluirInativos] = useState(false);

  const [form, setForm] = useState<FornecedorFormValues>(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [erros, setErros] = useState<Erros>({});
  const [salvando, setSalvando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const params = new URLSearchParams();
      if (busca.trim()) params.set('busca', busca.trim());
      if (categoria) params.set('categoria', categoria);
      if (incluirInativos) params.set('inativos', 'true');
      const consulta = params.toString();
      setItens(await api.get<FornecedorApi[]>(`/fornecedores${consulta ? `?${consulta}` : ''}`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os fornecedores.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [busca, categoria, incluirInativos, mostrar]);

  // Pequeno atraso para nao consultar a API a cada tecla da busca.
  useEffect(() => {
    const timer = window.setTimeout(() => void carregar(), 250);
    return () => window.clearTimeout(timer);
  }, [carregar]);

  function atualizar<K extends keyof FornecedorFormValues>(campo: K, valor: FornecedorFormValues[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    if (erros[campo]) setErros((atual) => ({ ...atual, [campo]: undefined }));
  }

  function novo() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setErros({});
    setMostrarForm(true);
  }

  function editar(fornecedor: FornecedorApi) {
    setEditandoId(fornecedor.id);
    setForm(paraFormulario(fornecedor));
    setErros({});
    setMostrarForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setErros({});
    setMostrarForm(false);
  }

  async function salvar() {
    setSalvando(true);
    setErros({});
    try {
      if (editandoId) {
        await api.put(`/fornecedores/${editandoId}`, form);
        mostrar('Fornecedor atualizado.', 'sucesso');
      } else {
        await api.post('/fornecedores', form);
        mostrar('Fornecedor cadastrado.', 'sucesso');
      }
      cancelarEdicao();
      void carregar();
    } catch (erro) {
      setErros(errosDoApi(erro));
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao salvar o fornecedor.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(fornecedor: FornecedorApi) {
    try {
      await api.put(`/fornecedores/${fornecedor.id}`, { ativo: !fornecedor.ativo });
      mostrar(fornecedor.ativo ? 'Fornecedor desativado.' : 'Fornecedor reativado.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao alterar a situação.', 'erro');
    }
  }

  async function excluir(fornecedor: FornecedorApi) {
    if (!window.confirm(`Excluir o fornecedor "${fornecedor.nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/fornecedores/${fornecedor.id}`);
      mostrar('Fornecedor excluído.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.message : 'Falha ao excluir.', 'erro');
    }
  }

  const ativos = itens.filter((f) => f.ativo).length;

  return (
    <>
      <div className="painel">
        <h3>Fornecedores</h3>
        <p className="desc">
          Quem a consultoria compra: EPI, laboratório de exames, instrutores, recarga de extintores... Telefone,
          WhatsApp e e-mail ficam a um clique. Fornecedores com lançamentos na planilha financeira só podem ser
          desativados, nunca excluídos.
        </p>

        <div className="stat-grid">
          <div className="stat">
            <b>{ativos}</b>
            <span>fornecedores ativos</span>
          </div>
          <div className="stat">
            <b>{itens.filter((f) => f.totalLancamentos > 0).length}</b>
            <span>com lançamentos financeiros</span>
          </div>
          <div className="stat">
            <b>{new Set(itens.filter((f) => f.categoria).map((f) => f.categoria!.toLowerCase())).size}</b>
            <span>categorias em uso</span>
          </div>
        </div>
      </div>

      {podeEscrever && mostrarForm ? (
        <div className="painel">
          <h3>{editandoId ? 'Editar fornecedor' : 'Novo fornecedor'}</h3>
          <div className="filtros">
            <Campo label="Nome" htmlFor="fo-nome" obrigatorio erro={erros.nome}>
              <input id="fo-nome" className="busca" value={form.nome} onChange={(e) => atualizar('nome', e.target.value)} />
            </Campo>
            <Campo label="CNPJ" htmlFor="fo-cnpj" erro={erros.cnpj} ajuda="Opcional — validado quando informado.">
              <input
                id="fo-cnpj"
                className="mono"
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
                value={form.cnpj}
                onChange={(e) => atualizar('cnpj', MASCARAS.cnpj(e.target.value))}
              />
            </Campo>
            <Campo label="Categoria" htmlFor="fo-categoria" erro={erros.categoria}>
              <input
                id="fo-categoria"
                list="fo-categorias"
                value={form.categoria}
                onChange={(e) => atualizar('categoria', e.target.value)}
              />
              <datalist id="fo-categorias">
                {CATEGORIAS_FORNECEDOR_SUGERIDAS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Campo>
            <Campo label="Contato" htmlFor="fo-contato" erro={erros.contatoNome}>
              <input id="fo-contato" value={form.contatoNome} onChange={(e) => atualizar('contatoNome', e.target.value)} />
            </Campo>
            <Campo label="Telefone" htmlFor="fo-telefone" erro={erros.telefone}>
              <input
                id="fo-telefone"
                inputMode="tel"
                placeholder="(00) 0000-0000"
                value={form.telefone}
                onChange={(e) => atualizar('telefone', MASCARAS.telefone(e.target.value))}
              />
            </Campo>
            <Campo label="WhatsApp" htmlFor="fo-whatsapp" erro={erros.whatsapp}>
              <input
                id="fo-whatsapp"
                inputMode="tel"
                placeholder="(00) 90000-0000"
                value={form.whatsapp}
                onChange={(e) => atualizar('whatsapp', MASCARAS.telefone(e.target.value))}
              />
            </Campo>
            <Campo label="E-mail" htmlFor="fo-email" erro={erros.email}>
              <input id="fo-email" type="email" value={form.email} onChange={(e) => atualizar('email', e.target.value)} />
            </Campo>
            <Campo label="Site" htmlFor="fo-site" erro={erros.site}>
              <input id="fo-site" placeholder="www.exemplo.com.br" value={form.site} onChange={(e) => atualizar('site', e.target.value)} />
            </Campo>
          </div>
          <Campo label="Observações" htmlFor="fo-obs" erro={erros.observacoes}>
            <textarea id="fo-obs" rows={2} value={form.observacoes} onChange={(e) => atualizar('observacoes', e.target.value)} />
          </Campo>
          {editandoId ? (
            <label className="check-linha">
              <input type="checkbox" checked={form.ativo} onChange={(e) => atualizar('ativo', e.target.checked)} />
              Fornecedor ativo
            </label>
          ) : null}
          <div className="barra-acoes">
            <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void salvar()}>
              {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Cadastrar fornecedor'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={cancelarEdicao}>
              Cancelar
            </button>
            {!form.nome.trim() ? <span className="hint">Informe ao menos o nome para salvar.</span> : null}
          </div>
        </div>
      ) : null}

      <div className="painel">
        <div className="filtros">
          <Campo label="Buscar" htmlFor="fo-busca">
            <div style={{ position: 'relative' }}>
              <Icone
                nome="lupa"
                tamanho={14}
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)' }}
              />
              <input
                id="fo-busca"
                className="busca"
                placeholder="Nome, contato, CNPJ, telefone ou e-mail"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={{ paddingLeft: 30 }}
              />
            </div>
          </Campo>
          <Campo label="Categoria" htmlFor="fo-filtro-categoria">
            <select id="fo-filtro-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todas</option>
              {CATEGORIAS_FORNECEDOR_SUGERIDAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Situação" htmlFor="fo-inativos">
            <select id="fo-inativos" value={incluirInativos ? 'todos' : 'ativos'} onChange={(e) => setIncluirInativos(e.target.value === 'todos')}>
              <option value="ativos">Somente ativos</option>
              <option value="todos">Ativos e inativos</option>
            </select>
          </Campo>
          {podeEscrever && !mostrarForm ? (
            <Campo label=" " htmlFor="fo-novo">
              <button id="fo-novo" type="button" className="btn btn-primary" onClick={novo}>
                <Icone nome="mais" tamanho={14} /> Novo fornecedor
              </button>
            </Campo>
          ) : null}
        </div>

        {carregando && itens.length === 0 ? (
          <div className="centro-tela">
            <div className="spinner" />
            Carregando...
          </div>
        ) : itens.length === 0 ? (
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="parceria" tamanho={22} />
            </div>
            <h4>Nenhum fornecedor encontrado</h4>
            <p>{busca || categoria ? 'Ajuste a busca ou os filtros.' : 'Cadastre o primeiro fornecedor para ter telefone e e-mail à mão.'}</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>Contato</th>
                  <th>Telefone</th>
                  <th>WhatsApp</th>
                  <th>E-mail</th>
                  <th className="num-col">Lançamentos</th>
                  <th>Situação</th>
                  {podeEscrever ? <th aria-label="Ações" /> : null}
                </tr>
              </thead>
              <tbody>
                {itens.map((f) => (
                  <tr key={f.id} style={{ opacity: f.ativo ? 1 : 0.6 }}>
                    <td>
                      <b>{f.nome}</b>
                      <div className="hint">
                        {f.categoria ? <span className="pill gray">{f.categoria}</span> : null}{' '}
                        {f.cnpj ? <span className="mono">{formatarCnpj(f.cnpj)}</span> : null}
                      </div>
                      {f.site ? (
                        <div className="hint">
                          <a href={linkSite(f.site)} target="_blank" rel="noreferrer">
                            {f.site}
                          </a>
                        </div>
                      ) : null}
                    </td>
                    <td>{f.contatoNome ?? <span className="hint">—</span>}</td>
                    <td>
                      {f.telefone ? (
                        <a href={`tel:+55${limparTelefone(f.telefone)}`} className="mono">
                          <Icone nome="telefone" tamanho={13} /> {formatarTelefone(f.telefone)}
                        </a>
                      ) : (
                        <span className="hint">—</span>
                      )}
                    </td>
                    <td>
                      {f.whatsapp ? (
                        <a href={`https://wa.me/55${limparTelefone(f.whatsapp)}`} target="_blank" rel="noreferrer" className="mono">
                          <Icone nome="mensagem" tamanho={13} /> {formatarTelefone(f.whatsapp)}
                        </a>
                      ) : (
                        <span className="hint">—</span>
                      )}
                    </td>
                    <td>
                      {f.email ? (
                        <a href={`mailto:${f.email}`}>
                          <Icone nome="envelope" tamanho={13} /> {f.email}
                        </a>
                      ) : (
                        <span className="hint">—</span>
                      )}
                    </td>
                    <td className="num-col">{f.totalLancamentos}</td>
                    <td>{f.ativo ? <span className="pill ok">Ativo</span> : <span className="pill gray">Inativo</span>}</td>
                    {podeEscrever ? (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => editar(f)}>
                          Editar
                        </button>{' '}
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void alternarAtivo(f)}>
                          {f.ativo ? 'Desativar' : 'Ativar'}
                        </button>{' '}
                        {f.totalLancamentos === 0 ? (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluir(f)}>
                            Excluir
                          </button>
                        ) : null}
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
