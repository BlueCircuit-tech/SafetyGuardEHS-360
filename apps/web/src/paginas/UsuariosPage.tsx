import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Icone } from '../componentes/Icone';
import { PERFIS, ROTULO_PERFIL, exigeCliente, type Perfil } from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import { formatarDataHora } from '../lib/datas';
import { useSessao } from '../lib/sessao';

interface UsuarioApi {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  cargo: string | null;
  telefone: string | null;
  clienteId: string | null;
  cliente: { id: string; nomeFantasia: string } | null;
  ativo: boolean;
  ultimoAcesso: string | null;
  criadoEm: string;
  rotuloPerfil: string;
  permissoes: string[];
}

interface PerfilApi {
  perfil: Perfil;
  rotulo: string;
  descricao: string;
  permissoes: string[];
  exigeCliente: boolean;
}

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

const VAZIO = {
  nome: '',
  email: '',
  senha: '',
  perfil: '' as Perfil | '',
  cargo: '',
  clienteId: '',
};

export function UsuariosPage() {
  const { mostrar } = useToast();
  const { usuario: eu } = useSessao();

  const [itens, setItens] = useState<UsuarioApi[]>([]);
  const [perfis, setPerfis] = useState<PerfilApi[]>([]);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [novo, setNovo] = useState(VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setBuscaAplicada(busca.trim()), 350);
    return () => clearTimeout(timer);
  }, [busca]);

  useEffect(() => {
    void Promise.allSettled([
      api.get<PerfilApi[]>('/auth/perfis'),
      api.get<OpcaoCliente[]>('/clientes/opcoes?incluirInativos=true'),
    ]).then(([p, c]) => {
      if (p.status === 'fulfilled') setPerfis(p.value);
      if (c.status === 'fulfilled') setClientes(c.value);
    });
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const parametros = new URLSearchParams({ porPagina: '100' });
      if (buscaAplicada) parametros.set('busca', buscaAplicada);
      const resposta = await api.get<{ itens: UsuarioApi[] }>(`/usuarios?${parametros}`);
      setItens(resposta.itens);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar usuarios.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [buscaAplicada, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const perfilEscolhido = useMemo(() => perfis.find((p) => p.perfil === novo.perfil), [perfis, novo.perfil]);

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    setErros({});
    setSalvando(true);

    try {
      await api.post('/usuarios', {
        ...novo,
        clienteId: novo.clienteId || undefined,
        cargo: novo.cargo || undefined,
      });
      mostrar(`Usuário ${novo.nome} criado.`, 'sucesso');
      setNovo(VAZIO);
      void carregar();
    } catch (erro) {
      if (erro instanceof ErroApi) {
        const mapa: Record<string, string> = {};
        for (const [campo, mensagens] of Object.entries(erro.campos)) mapa[campo] = mensagens[0] ?? '';
        setErros(mapa);
        mostrar(erro.mensagemAmigavel(), 'erro');
      } else {
        mostrar('Falha ao criar o usuário.', 'erro');
      }
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(usuario: UsuarioApi) {
    try {
      await api.put(`/usuarios/${usuario.id}`, { ativo: !usuario.ativo });
      mostrar(`${usuario.nome} ${usuario.ativo ? 'desativado' : 'reativado'}.`, 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao alterar o usuário.', 'erro');
    }
  }

  async function redefinirSenha(usuario: UsuarioApi) {
    const senha = window.prompt(
      `Nova senha para ${usuario.nome}\n\nMínimo 8 caracteres, com ao menos uma letra e um número.`,
    );
    if (!senha) return;

    try {
      await api.put(`/usuarios/${usuario.id}`, { senha });
      mostrar('Senha redefinida.', 'sucesso');
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao redefinir a senha.', 'erro');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Pessoas e acessos</h2>
          <p>
            Cada perfil enxerga e altera só o que lhe compete. A trilha de auditoria passa a registrar quem fez cada
            alteração — não mais um cabeçalho que qualquer um poderia forjar.
          </p>
        </div>
      </div>

      <div className="grid32">
        <div className="painel">
          <h3><Icone nome="pessoas" /> Usuários</h3>
          <div className="filtros">
            <div className="campo busca">
              <label htmlFor="busca-usuario">Buscar</label>
              <input
                id="busca-usuario"
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                placeholder="Nome, e-mail ou cargo"
              />
            </div>
          </div>

          {carregando && itens.length === 0 ? (
            <div className="vazio">
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              Carregando...
            </div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Perfil</th>
                    <th>Escopo</th>
                    <th>Último acesso</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {itens.map((usuario) => (
                    <tr key={usuario.id}>
                      <td>
                        <div className="principal">{usuario.nome}</div>
                        <div className="secundario">{usuario.email}</div>
                        {usuario.cargo ? <div className="secundario">{usuario.cargo}</div> : null}
                      </td>
                      <td>
                        <span className={`pill ${usuario.perfil === 'ADMIN' ? 'purple' : 'info'}`}>
                          {usuario.rotuloPerfil}
                        </span>
                        <div className="secundario">{usuario.permissoes.length} permissões</div>
                      </td>
                      <td>
                        {usuario.cliente ? (
                          <>
                            <span className="pill warn">restrito</span>
                            <div className="secundario">{usuario.cliente.nomeFantasia}</div>
                          </>
                        ) : (
                          <span className="secundario">toda a operação</span>
                        )}
                      </td>
                      <td>{usuario.ultimoAcesso ? formatarDataHora(usuario.ultimoAcesso) : '—'}</td>
                      <td>
                        <span className={`pill ${usuario.ativo ? 'ok' : 'gray'}`}>
                          {usuario.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                        {usuario.id === eu?.id ? <div className="secundario">você</div> : null}
                      </td>
                      <td>
                        <div className="acoes-linha">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => void redefinirSenha(usuario)}
                          >
                            Senha
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={usuario.id === eu?.id}
                            title={usuario.id === eu?.id ? 'Você não pode desativar a si mesmo' : undefined}
                            onClick={() => void alternarAtivo(usuario)}
                          >
                            {usuario.ativo ? 'Desativar' : 'Reativar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <form className="painel" onSubmit={criar} noValidate>
            <h3>＋ Novo usuário</h3>

            <Campo label="Nome" obrigatorio erro={erros.nome}>
              <input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} required />
            </Campo>

            <Campo label="E-mail" obrigatorio erro={erros.email}>
              <input
                type="email"
                value={novo.email}
                onChange={(e) => setNovo({ ...novo, email: e.target.value })}
                required
              />
            </Campo>

            <Campo label="Senha inicial" obrigatorio erro={erros.senha} ajuda="Mín. 8 caracteres, com letra e número.">
              <input
                type="text"
                value={novo.senha}
                onChange={(e) => setNovo({ ...novo, senha: e.target.value })}
                required
              />
            </Campo>

            <Campo label="Perfil" obrigatorio erro={erros.perfil} ajuda={perfilEscolhido?.descricao}>
              <select
                value={novo.perfil}
                onChange={(e) => setNovo({ ...novo, perfil: e.target.value as Perfil })}
                required
              >
                <option value="">Selecione</option>
                {PERFIS.map((perfil) => (
                  <option key={perfil} value={perfil}>
                    {ROTULO_PERFIL[perfil]}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Cargo" erro={erros.cargo}>
              <input value={novo.cargo} onChange={(e) => setNovo({ ...novo, cargo: e.target.value })} />
            </Campo>

            {novo.perfil && exigeCliente(novo.perfil) ? (
              <Campo
                label="Cliente"
                obrigatorio
                erro={erros.clienteId}
                ajuda="Este perfil só enxerga os dados deste cliente."
              >
                <select
                  value={novo.clienteId}
                  onChange={(e) => setNovo({ ...novo, clienteId: e.target.value })}
                  required
                >
                  <option value="">Selecione</option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nomeFantasia}
                    </option>
                  ))}
                </select>
              </Campo>
            ) : null}

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={salvando}>
              {salvando ? 'Criando...' : 'Criar usuário'}
            </button>
          </form>

          <div className="painel">
            <h3><Icone nome="chave" /> Perfis e permissões</h3>
            <p className="desc">A checagem que vale é a da API — a interface só esconde o que não interessa.</p>
            {perfis.map((perfil) => (
              <div key={perfil.perfil} style={{ marginBottom: 12 }}>
                <b style={{ fontSize: 13 }}>{perfil.rotulo}</b>
                <div className="secundario" style={{ marginBottom: 4 }}>
                  {perfil.descricao}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {perfil.permissoes.map((permissao) => (
                    <span className="pill gray" key={permissao} style={{ fontSize: 10 }}>
                      {permissao}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
