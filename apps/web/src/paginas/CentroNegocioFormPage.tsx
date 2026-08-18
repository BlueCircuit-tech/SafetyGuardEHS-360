import { useCallback, useEffect, useState } from 'react';
import { Icone } from '../componentes/Icone';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm, type Path, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ROTULO_SITUACAO_CENTRO,
  ROTULO_TIPO_CENTRO,
  centroNegocioCreateSchema,
  type CentroNegocioFormValues,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import { MASCARAS, type NomeMascara } from '../lib/mascaras';
import { formatarDataHora } from '../lib/datas';
import {
  PILL_TIPO_CENTRO,
  VALORES_INICIAIS_CENTRO,
  centroParaFormulario,
  type CentroApi,
} from '../lib/centro-form';

interface Referencias {
  ufs: Array<{ sigla: string; nome: string }>;
  tiposCentroNegocio: Array<{ valor: string; rotulo: string; descricao: string }>;
  situacoesCentro: Array<{ valor: string; rotulo: string }>;
}

interface ClienteVinculado {
  id: string;
  nomeFantasia: string;
  numeroContrato: string;
  situacao: string;
  quantidadeFuncionarios: number;
}

interface RegistroAuditoria {
  id: string;
  acao: string;
  autor: string | null;
  criadoEm: string;
  alteracoes: Record<string, { de: unknown; para: unknown }> | null;
}

const REFERENCIAS_VAZIAS: Referencias = { ufs: [], tiposCentroNegocio: [], situacoesCentro: [] };

function textoValor(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'sim' : 'nao';
  return String(valor);
}

export function CentroNegocioFormPage() {
  const { id } = useParams<{ id: string }>();
  const navegar = useNavigate();
  const { mostrar } = useToast();

  const modoEdicao = Boolean(id);
  const [carregando, setCarregando] = useState(modoEdicao);
  const [centro, setCentro] = useState<CentroApi | null>(null);
  const [referencias, setReferencias] = useState<Referencias>(REFERENCIAS_VAZIAS);
  const [clientes, setClientes] = useState<ClienteVinculado[]>([]);
  const [aba, setAba] = useState<'cadastro' | 'historico'>('cadastro');
  const [auditoria, setAuditoria] = useState<RegistroAuditoria[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CentroNegocioFormValues>({
    defaultValues: VALORES_INICIAIS_CENTRO,
    resolver: zodResolver(centroNegocioCreateSchema) as unknown as Resolver<CentroNegocioFormValues>,
    mode: 'onBlur',
  });

  const valores = watch();

  const carregarClientes = useCallback(async () => {
    if (!id) return;
    try {
      const resposta = await api.get<{ itens: ClienteVinculado[] }>(`/clientes?centroNegocioId=${id}&porPagina=100`);
      setClientes(resposta.itens);
    } catch {
      setClientes([]);
    }
  }, [id]);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      try {
        const refs = await api.get<Referencias>('/referencias');
        if (ativo) setReferencias(refs);
      } catch {
        // referências são opcionais
      }

      if (!id) return;

      try {
        const atual = await api.get<CentroApi>(`/centros-negocio/${id}`);
        if (!ativo) return;
        setCentro(atual);
        reset(centroParaFormulario(atual));
        void carregarClientes();
      } catch (erro) {
        if (ativo) {
          mostrar(erro instanceof Error ? erro.message : 'Centro nao encontrado.', 'erro');
          navegar('/centros-negocio', { replace: true });
        }
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    void carregar();
    return () => {
      ativo = false;
    };
  }, [id, reset, mostrar, navegar, carregarClientes]);

  const carregarAuditoria = useCallback(async () => {
    if (!id) return;
    try {
      setAuditoria(await api.get<RegistroAuditoria[]>(`/centros-negocio/${id}/auditoria?limite=50`));
    } catch {
      setAuditoria([]);
    }
  }, [id]);

  useEffect(() => {
    if (aba === 'historico') void carregarAuditoria();
  }, [aba, carregarAuditoria]);

  const comMascara = (campo: Path<CentroNegocioFormValues>, mascara: NomeMascara) => {
    const registro = register(campo);
    return {
      ...registro,
      onChange: (evento: React.ChangeEvent<HTMLInputElement>) => {
        setValue(campo, MASCARAS[mascara](evento.target.value), { shouldDirty: true, shouldValidate: false });
      },
    };
  };

  const aoSalvar = handleSubmit(async (dados) => {
    try {
      const salvo = modoEdicao
        ? await api.put<CentroApi>(`/centros-negocio/${id}`, dados)
        : await api.post<CentroApi>('/centros-negocio', dados);

      setCentro(salvo);
      reset(centroParaFormulario(salvo));
      mostrar(modoEdicao ? 'Centro atualizado.' : `Centro ${salvo.nome} cadastrado.`, 'sucesso');

      if (!modoEdicao) navegar(`/centros-negocio/${salvo.id}`, { replace: true });
    } catch (erro) {
      if (erro instanceof ErroApi) {
        for (const [campo, mensagens] of Object.entries(erro.campos)) {
          setError(campo as Path<CentroNegocioFormValues>, { type: 'server', message: mensagens[0] });
        }
        mostrar(erro.mensagemAmigavel(), 'erro');
        return;
      }
      mostrar('Falha inesperada ao salvar.', 'erro');
    }
  });

  if (carregando) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
        Carregando centro...
      </div>
    );
  }

  const erro = (campo: keyof CentroNegocioFormValues) => errors[campo]?.message as string | undefined;
  const tipoSelecionado = referencias.tiposCentroNegocio.find((tipo) => tipo.valor === valores.tipo);

  return (
    <>
      <Link className="link-voltar" to="/centros-negocio">
        ← Voltar para a lista de centros
      </Link>

      <div className="page-head">
        <div>
          <h2>{modoEdicao ? valores.nome || 'Editar centro' : 'Novo centro de negócio'}</h2>
          <p>
            {modoEdicao
              ? 'Alterações ficam registradas na trilha de auditoria, com autor e diferença campo a campo.'
              : 'Agrupamento intermediário entre a matriz e os clientes. Use quando a operação for organizada por regional, unidade ou tipo de contrato.'}
          </p>
        </div>
        {modoEdicao && centro ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={`pill ${PILL_TIPO_CENTRO[centro.tipo]}`}>{ROTULO_TIPO_CENTRO[centro.tipo]}</span>
            <span className="pill gray">
              {centro.quantidadeClientes} cliente(s) · {ROTULO_SITUACAO_CENTRO[centro.situacao]}
            </span>
          </div>
        ) : null}
      </div>

      {modoEdicao ? (
        <div className="abas" role="tablist">
          <button type="button" role="tab" className={aba === 'cadastro' ? 'on' : ''} onClick={() => setAba('cadastro')}>
            Cadastro
          </button>
          <button type="button" role="tab" className={aba === 'historico' ? 'on' : ''} onClick={() => setAba('historico')}>
            Histórico de alterações
          </button>
        </div>
      ) : null}

      {aba === 'historico' ? (
        <div className="painel">
          <h3><Icone nome="documento" /> Trilha de auditoria</h3>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Ação</th>
                  <th>Autor</th>
                  <th>Alterações</th>
                </tr>
              </thead>
              <tbody>
                {auditoria.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--gray)' }}>
                      Nenhum registro ainda.
                    </td>
                  </tr>
                ) : (
                  auditoria.map((registro) => (
                    <tr key={registro.id}>
                      <td>{formatarDataHora(registro.criadoEm)}</td>
                      <td>
                        <span className={`pill ${registro.acao === 'CRIACAO' ? 'ok' : 'info'}`}>{registro.acao}</span>
                      </td>
                      <td>{registro.autor ?? '—'}</td>
                      <td>
                        {registro.alteracoes && Object.keys(registro.alteracoes).length > 0 ? (
                          Object.entries(registro.alteracoes)
                            .slice(0, 8)
                            .map(([campo, mudanca]) => (
                              <div key={campo}>
                                <code>{campo}</code>: {textoValor(mudanca.de)} → <b>{textoValor(mudanca.para)}</b>
                              </div>
                            ))
                        ) : (
                          <span style={{ color: 'var(--gray)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <form onSubmit={aoSalvar} noValidate>
          <div className="layout-form">
            <div>
              <section className="painel">
                <h3><Icone nome="pasta" /> Identificação</h3>
                <p className="desc">Como este agrupamento aparece nos relatórios e nos filtros do dashboard.</p>

                <div className="row2">
                  <Campo label="Nome" obrigatorio erro={erro('nome')}>
                    <input {...register('nome')} aria-invalid={Boolean(erro('nome'))} placeholder="Regional Centro-Oeste" />
                  </Campo>
                  <Campo
                    label="Código"
                    obrigatorio
                    erro={erro('codigo')}
                    ajuda="Curto e único. Vira maiúsculas automaticamente."
                  >
                    <input {...register('codigo')} aria-invalid={Boolean(erro('codigo'))} placeholder="RCO" />
                  </Campo>
                </div>

                <Campo
                  label="Tipo de agrupamento"
                  obrigatorio
                  erro={erro('tipo')}
                  ajuda={tipoSelecionado?.descricao ?? 'Define o vocabulário do filtro no dashboard.'}
                >
                  <select {...register('tipo')} aria-invalid={Boolean(erro('tipo'))}>
                    <option value="">Selecione</option>
                    {referencias.tiposCentroNegocio.map((tipo) => (
                      <option key={tipo.valor} value={tipo.valor}>
                        {tipo.rotulo}
                      </option>
                    ))}
                  </select>
                </Campo>

                <Campo label="Descrição" erro={erro('descricao')}>
                  <textarea {...register('descricao')} placeholder="Clientes industriais de Goias e entorno." />
                </Campo>
              </section>

              <section className="painel">
                <h3><Icone nome="pessoa" /> Responsável</h3>
                <p className="desc">Quem responde pela operação deste agrupamento.</p>

                <div className="row2">
                  <Campo label="Nome" obrigatorio erro={erro('responsavelNome')}>
                    <input
                      {...register('responsavelNome')}
                      aria-invalid={Boolean(erro('responsavelNome'))}
                      placeholder="Rafael Martini"
                    />
                  </Campo>
                  <Campo label="Cargo" erro={erro('responsavelCargo')}>
                    <input {...register('responsavelCargo')} placeholder="Gerente Regional" />
                  </Campo>
                </div>

                <div className="row3">
                  <Campo label="E-mail" obrigatorio erro={erro('responsavelEmail')}>
                    <input type="email" {...register('responsavelEmail')} aria-invalid={Boolean(erro('responsavelEmail'))} />
                  </Campo>
                  <Campo label="Telefone" erro={erro('responsavelTelefone')}>
                    <input
                      {...comMascara('responsavelTelefone', 'telefone')}
                      value={valores.responsavelTelefone}
                      placeholder="(62) 3333-4455"
                    />
                  </Campo>
                  <Campo label="WhatsApp" erro={erro('responsavelWhatsapp')}>
                    <input
                      {...comMascara('responsavelWhatsapp', 'telefone')}
                      value={valores.responsavelWhatsapp}
                      placeholder="(62) 99988-7766"
                    />
                  </Campo>
                </div>
              </section>

              <section className="painel" style={{ paddingBottom: 0 }}>
                <h3><Icone nome="engrenagem" /> Gestão</h3>
                <p className="desc">Referência geográfica e meta usada no comparativo entre centros.</p>

                <div className="row3">
                  <Campo label="Cidade" erro={erro('cidade')}>
                    <input {...register('cidade')} placeholder="Goiania" />
                  </Campo>
                  <Campo label="UF" erro={erro('uf')}>
                    <select {...register('uf')} aria-invalid={Boolean(erro('uf'))}>
                      <option value="">—</option>
                      {referencias.ufs.map((uf) => (
                        <option key={uf.sigla} value={uf.sigla}>
                          {uf.sigla} — {uf.nome}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo label="Meta do Índice Global" erro={erro('metaIndiceGlobal')} ajuda="0 a 100.">
                    <input type="number" min="0" max="100" {...register('metaIndiceGlobal')} />
                  </Campo>
                </div>

                <div className="row2">
                  <Campo label="Situação" erro={erro('situacao')} ajuda="Centro inativo some dos seletores.">
                    <select {...register('situacao')}>
                      {referencias.situacoesCentro.map((situacao) => (
                        <option key={situacao.valor} value={situacao.valor}>
                          {situacao.rotulo}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo label="Cor de destaque" erro={erro('corDestaque')} ajuda="Cor do centro nos gráficos.">
                    <input type="color" {...register('corDestaque')} />
                  </Campo>
                </div>

                <Campo label="Observações" erro={erro('observacoes')}>
                  <textarea {...register('observacoes')} />
                </Campo>

                <div className="barra-acoes rodape-form">
                  <span className="aviso">
                    {modoEdicao
                      ? isDirty
                        ? 'Há alterações não salvas.'
                        : `Última atualização: ${formatarDataHora(centro?.atualizadoEm)}`
                      : 'Campos marcados com * são obrigatórios.'}
                  </span>
                  <button type="button" className="btn btn-ghost" onClick={() => navegar('/centros-negocio')}>
                    Cancelar
                  </button>
                  {modoEdicao ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={isSubmitting || !isDirty}
                      onClick={() => centro && reset(centroParaFormulario(centro))}
                    >
                      Descartar alterações
                    </button>
                  ) : null}
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Salvando...' : modoEdicao ? 'Salvar alterações' : 'Cadastrar centro'}
                  </button>
                </div>
              </section>
            </div>

            <aside className="coluna-previa">
              <div className="painel">
                <h3><Icone nome="parceria" /> Clientes neste centro</h3>
                <p className="desc">
                  {modoEdicao
                    ? 'O vínculo é feito no cadastro de cada cliente.'
                    : 'Depois de salvar, vincule os clientes pelo cadastro de cada um.'}
                </p>

                {!modoEdicao ? (
                  <p className="ajuda">Salve o centro para ver os clientes vinculados.</p>
                ) : clientes.length === 0 ? (
                  <div className="vazio" style={{ padding: '22px 8px' }}>
                    <div className="icone-vazio" aria-hidden="true">
              <Icone nome="pasta" tamanho={22} />
            </div>
                    <h4>Nenhum cliente vinculado</h4>
                    <p>
                      Abra um cliente e escolha este centro no bloco <b>Agrupamento</b>.
                    </p>
                    <Link className="btn btn-outline btn-sm" to="/clientes">
                      Ir para clientes
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="tbl-wrap">
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th>Cliente</th>
                            <th>Funcionários</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientes.map((cliente) => (
                            <tr key={cliente.id}>
                              <td>
                                <Link to={`/clientes/${cliente.id}`}>{cliente.nomeFantasia}</Link>
                                <div className="secundario">contrato {cliente.numeroContrato}</div>
                              </td>
                              <td>{cliente.quantidadeFuncionarios.toLocaleString('pt-BR')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <dl className="resumo-lateral">
                      <dt>Total de trabalhadores</dt>
                      <dd>
                        {clientes
                          .reduce((soma, cliente) => soma + cliente.quantidadeFuncionarios, 0)
                          .toLocaleString('pt-BR')}
                      </dd>
                    </dl>
                  </>
                )}
              </div>
            </aside>
          </div>
        </form>
      )}
    </>
  );
}
