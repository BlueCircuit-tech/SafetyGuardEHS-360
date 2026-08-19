import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icone } from '../componentes/Icone';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm, type Path, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { clienteCreateSchema, type ClienteFormValues } from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { MASCARAS, type NomeMascara } from '../lib/mascaras';
import { useBuscaCep } from '../lib/useBuscaCep';
import { formatarDataHora, formatarDataIso } from '../lib/datas';
import {
  VALORES_INICIAIS_CLIENTE,
  clienteParaFormulario,
  clienteParaPayload,
  type ClienteApi,
} from '../lib/cliente-form';

interface OpcaoCentro {
  id: string;
  nome: string;
  codigo: string;
}

interface Referencias {
  ufs: Array<{ sigla: string; nome: string }>;
  portes: Array<{ valor: string; rotulo: string }>;
  situacoesContrato: Array<{ valor: string; rotulo: string }>;
  grausRisco: Array<{ valor: number; descricao: string }>;
  segmentos: string[];
  cnaesSugeridos: Array<{ codigo: string; descricao: string; formatado: string }>;
}

interface RegistroAuditoria {
  id: string;
  acao: string;
  autor: string | null;
  criadoEm: string;
  alteracoes: Record<string, { de: unknown; para: unknown }> | null;
}

const REFERENCIAS_VAZIAS: Referencias = {
  ufs: [],
  portes: [],
  situacoesContrato: [],
  grausRisco: [],
  segmentos: [],
  cnaesSugeridos: [],
};

const PILL_GRAU: Record<string, string> = { '1': 'ok', '2': 'warn', '3': 'orange', '4': 'bad' };

function textoValor(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'sim' : 'nao';
  return String(valor);
}

export function ClienteFormPage() {
  const { id } = useParams<{ id: string }>();
  const navegar = useNavigate();
  const { mostrar } = useToast();

  const modoEdicao = Boolean(id);
  const [carregando, setCarregando] = useState(modoEdicao);
  const [cliente, setCliente] = useState<ClienteApi | null>(null);
  const [referencias, setReferencias] = useState<Referencias>(REFERENCIAS_VAZIAS);
  const [centros, setCentros] = useState<OpcaoCentro[]>([]);
  const [aba, setAba] = useState<'cadastro' | 'historico'>('cadastro');
  const [auditoria, setAuditoria] = useState<RegistroAuditoria[]>([]);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const inputLogo = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ClienteFormValues>({
    defaultValues: VALORES_INICIAIS_CLIENTE,
    // O schema compartilhado normaliza máscaras e vazios; o formulário
    // trabalha só com strings, por isso o resolver é reapontado.
    resolver: zodResolver(clienteCreateSchema) as unknown as Resolver<ClienteFormValues>,
    mode: 'onBlur',
  });

  const valores = watch();

  /* ------------------------------------------------------------- carga --- */
  useEffect(() => {
    let ativo = true;

    async function carregar() {
      const [refs, opcoesCentro] = await Promise.allSettled([
        api.get<Referencias>('/referencias'),
        api.get<OpcaoCentro[]>('/centros-negocio/opcoes?incluirInativos=true'),
      ]);

      if (ativo && refs.status === 'fulfilled') setReferencias(refs.value);
      if (ativo && opcoesCentro.status === 'fulfilled') setCentros(opcoesCentro.value);

      if (!id) return;

      try {
        const atual = await api.get<ClienteApi>(`/clientes/${id}`);
        if (!ativo) return;
        setCliente(atual);
        reset(clienteParaFormulario(atual));
      } catch (erro) {
        if (ativo) {
          mostrar(erro instanceof Error ? erro.message : 'Cliente nao encontrado.', 'erro');
          navegar('/clientes', { replace: true });
        }
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    void carregar();
    return () => {
      ativo = false;
    };
  }, [id, reset, mostrar, navegar]);

  const carregarAuditoria = useCallback(async () => {
    if (!id) return;
    try {
      setAuditoria(await api.get<RegistroAuditoria[]>(`/clientes/${id}/auditoria?limite=50`));
    } catch {
      setAuditoria([]);
    }
  }, [id]);

  useEffect(() => {
    if (aba === 'historico') void carregarAuditoria();
  }, [aba, carregarAuditoria]);

  /* ---------------------------------------------------------- máscaras --- */
  const comMascara = (campo: Path<ClienteFormValues>, mascara: NomeMascara) => {
    const registro = register(campo);
    return {
      ...registro,
      onChange: (evento: React.ChangeEvent<HTMLInputElement>) => {
        setValue(campo, MASCARAS[mascara](evento.target.value), { shouldDirty: true, shouldValidate: false });
      },
    };
  };

  const campoCep = comMascara('cep', 'cep');
  const { buscar: buscarCep, buscando: buscandoCep } = useBuscaCep(
    useCallback(
      (endereco) => {
        if (endereco.logradouro) setValue('logradouro', endereco.logradouro, { shouldDirty: true });
        if (endereco.bairro) setValue('bairro', endereco.bairro, { shouldDirty: true });
        if (endereco.cidade) setValue('cidade', endereco.cidade, { shouldDirty: true });
        if (endereco.uf) setValue('uf', endereco.uf, { shouldDirty: true });
      },
      [setValue],
    ),
  );

  /* -------------------------------------------------------------- envio -- */
  const aoSalvar = handleSubmit(async (dados) => {
    const payload = clienteParaPayload(dados);

    try {
      const salvo = modoEdicao
        ? await api.put<ClienteApi>(`/clientes/${id}`, payload)
        : await api.post<ClienteApi>('/clientes', payload);

      setCliente(salvo);
      reset(clienteParaFormulario(salvo));
      mostrar(modoEdicao ? 'Cliente atualizado.' : `Cliente ${salvo.nomeFantasia} cadastrado.`, 'sucesso');

      if (!modoEdicao) navegar(`/clientes/${salvo.id}`, { replace: true });
      if (aba === 'historico') void carregarAuditoria();
    } catch (erro) {
      if (erro instanceof ErroApi) {
        for (const [campo, mensagens] of Object.entries(erro.campos)) {
          setError(campo as Path<ClienteFormValues>, { type: 'server', message: mensagens[0] });
        }
        mostrar(erro.mensagemAmigavel(), 'erro');
        return;
      }
      mostrar('Falha inesperada ao salvar.', 'erro');
    }
  });

  /* --------------------------------------------------------------- logo -- */
  async function enviarLogo(arquivo: File) {
    if (!id) return;
    setEnviandoLogo(true);
    try {
      const atualizado = await api.upload<ClienteApi>(`/clientes/${id}/logo`, arquivo);
      setCliente(atualizado);
      setValue('logoUrl', atualizado.logoUrl ?? '', { shouldDirty: false });
      mostrar('Logo atualizada.', 'sucesso');
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao enviar a logo.', 'erro');
    } finally {
      setEnviandoLogo(false);
      if (inputLogo.current) inputLogo.current.value = '';
    }
  }

  async function removerLogo() {
    if (!id) return;
    setEnviandoLogo(true);
    try {
      const atualizado = await api.delete<ClienteApi>(`/clientes/${id}/logo`);
      setCliente(atualizado);
      setValue('logoUrl', '', { shouldDirty: false });
      mostrar('Logo removida.');
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao remover a logo.', 'erro');
    } finally {
      setEnviandoLogo(false);
    }
  }

  const logoAtual = useMemo(() => urlAbsoluta(valores.logoUrl), [valores.logoUrl]);

  if (carregando) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
        Carregando cliente...
      </div>
    );
  }

  const erro = (campo: keyof ClienteFormValues) => errors[campo]?.message as string | undefined;

  return (
    <>
      <Link className="link-voltar" to="/clientes">
        ← Voltar para a lista de clientes
      </Link>

      <div className="page-head">
        <div>
          <h2>{modoEdicao ? valores.nomeFantasia || 'Editar cliente' : 'Novo cliente'}</h2>
          <p>
            {modoEdicao
              ? 'Alterações ficam registradas na trilha de auditoria, com autor e diferença campo a campo.'
              : 'Cadastre a empresa contratante. O grau de risco e a quantidade de funcionários alimentam o ranking e os indicadores.'}
          </p>
        </div>
        {modoEdicao && cliente ? (
          <span className={`pill ${cliente.situacao === 'ATIVO' ? 'ok' : cliente.situacao === 'SUSPENSO' ? 'warn' : 'gray'}`}>
            Contrato {cliente.numeroContrato} · {cliente.situacao}
          </span>
        ) : null}
      </div>

      {modoEdicao ? (
        <div className="abas" role="tablist">
          <button type="button" role="tab" className={aba === 'cadastro' ? 'on' : ''} onClick={() => setAba('cadastro')}>
            Cadastro
          </button>
          <button
            type="button"
            role="tab"
            className={aba === 'historico' ? 'on' : ''}
            onClick={() => setAba('historico')}
          >
            Histórico de alterações
          </button>
        </div>
      ) : null}

      {aba === 'historico' ? (
        <div className="painel">
          <h3><Icone nome="documento" /> Trilha de auditoria</h3>
          <p className="desc">Quem alterou o quê e quando, desde a criação do cadastro.</p>
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
              {/* ------------------------------------------ agrupamento --- */}
              <section className="painel">
                <h3><Icone nome="pasta" /> Agrupamento</h3>
                <p className="desc">
                  Centro de negócio ao qual este cliente pertence — regional, unidade ou tipo de contrato. É o filtro
                  transversal dos dashboards.
                </p>

                <Campo
                  label="Centro de negócio"
                  erro={erro('centroNegocioId')}
                  ajuda={
                    centros.length === 0
                      ? 'Nenhum centro cadastrado ainda — o campo é opcional.'
                      : 'Opcional. Cliente sem centro não aparece quando o dashboard é filtrado por centro.'
                  }
                >
                  <select {...register('centroNegocioId')} aria-invalid={Boolean(erro('centroNegocioId'))}>
                    <option value="">Sem centro de negócio</option>
                    {centros.map((centro) => (
                      <option key={centro.id} value={centro.id}>
                        {centro.nome} ({centro.codigo})
                      </option>
                    ))}
                  </select>
                </Campo>
              </section>

              {/* ------------------------------------- identificação --- */}
              <section className="painel">
                <h3><Icone nome="fabrica" /> Identificação</h3>
                <p className="desc">Dados cadastrais da empresa contratante, conforme o cartão CNPJ.</p>

                <Campo label="Razão social" obrigatorio erro={erro('razaoSocial')}>
                  <input
                    {...register('razaoSocial')}
                    aria-invalid={Boolean(erro('razaoSocial'))}
                    placeholder="Vale Verde Mineracao e Britagem S.A."
                  />
                </Campo>

                <div className="row2">
                  <Campo
                    label="Nome fantasia"
                    obrigatorio
                    erro={erro('nomeFantasia')}
                    ajuda="Nome curto usado no ranking e nos filtros dos dashboards."
                  >
                    <input
                      {...register('nomeFantasia')}
                      aria-invalid={Boolean(erro('nomeFantasia'))}
                      placeholder="Vale Verde Mineracao"
                    />
                  </Campo>
                  <Campo label="CNPJ" obrigatorio erro={erro('cnpj')} ajuda="Único por cliente.">
                    <input
                      {...comMascara('cnpj', 'cnpj')}
                      value={valores.cnpj}
                      aria-invalid={Boolean(erro('cnpj'))}
                      placeholder="00.000.000/0000-00"
                    />
                  </Campo>
                </div>

                <div className="row2">
                  <Campo label="Inscrição estadual" erro={erro('inscricaoEstadual')}>
                    <input {...register('inscricaoEstadual')} placeholder="ISENTO" />
                  </Campo>
                  <Campo label="Inscrição municipal" erro={erro('inscricaoMunicipal')}>
                    <input {...register('inscricaoMunicipal')} />
                  </Campo>
                </div>

                <div className="row3">
                  <Campo label="CNAE principal" erro={erro('cnaePrincipal')} ajuda="Subclasse com 7 dígitos.">
                    <input {...comMascara('cnaePrincipal', 'cnae')} value={valores.cnaePrincipal} placeholder="0810-0/99" />
                  </Campo>
                  <Campo label="Porte" erro={erro('porte')}>
                    <select {...register('porte')}>
                      <option value="">Não informado</option>
                      {referencias.portes.map((porte) => (
                        <option key={porte.valor} value={porte.valor}>
                          {porte.rotulo}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo label="Segmento" erro={erro('segmento')}>
                    <input {...register('segmento')} list="segmentos-sugeridos" placeholder="Mineracao" />
                    <datalist id="segmentos-sugeridos">
                      {referencias.segmentos.map((segmento) => (
                        <option key={segmento} value={segmento} />
                      ))}
                    </datalist>
                  </Campo>
                </div>

                <Campo label="Site" erro={erro('site')}>
                  <input {...register('site')} placeholder="https://cliente.com.br" />
                </Campo>
              </section>

              {/* ------------------------------------------- contrato --- */}
              <section className="painel">
                <h3><Icone nome="documento" /> Contrato</h3>
                <p className="desc">Vigência e escopo do serviço prestado pela consultoria.</p>

                <div className="row3">
                  <Campo label="Número do contrato" obrigatorio erro={erro('numeroContrato')} ajuda="Único por cliente.">
                    <input
                      {...register('numeroContrato')}
                      aria-invalid={Boolean(erro('numeroContrato'))}
                      placeholder="4501"
                    />
                  </Campo>
                  <Campo label="Início da vigência" obrigatorio erro={erro('dataInicioContrato')}>
                    <input type="date" {...register('dataInicioContrato')} aria-invalid={Boolean(erro('dataInicioContrato'))} />
                  </Campo>
                  <Campo label="Fim da vigência" erro={erro('dataFimContrato')} ajuda="Vazio = contrato por prazo indeterminado.">
                    <input type="date" {...register('dataFimContrato')} aria-invalid={Boolean(erro('dataFimContrato'))} />
                  </Campo>
                </div>

                <div className="row3">
                  <Campo label="Situação" erro={erro('situacao')}>
                    <select {...register('situacao')}>
                      {referencias.situacoesContrato.map((situacao) => (
                        <option key={situacao.valor} value={situacao.valor}>
                          {situacao.rotulo}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo label="Valor mensal (R$)" erro={erro('valorMensal')}>
                    <input type="number" step="0.01" min="0" {...register('valorMensal')} placeholder="28500.00" />
                  </Campo>
                  <Campo label="Dia de vencimento" erro={erro('diaVencimento')}>
                    <input type="number" min="1" max="31" {...register('diaVencimento')} placeholder="10" />
                  </Campo>
                </div>

                <Campo label="Escopo dos serviços" erro={erro('escopoServicos')}>
                  <textarea
                    {...register('escopoServicos')}
                    placeholder="PGR, PCMSO, inspecoes mensais, treinamentos NR-22 e NR-33."
                  />
                </Campo>

                <Campo
                  label="Consultor responsável"
                  erro={erro('consultorResponsavel')}
                  ajuda="Vira vínculo de usuário quando a etapa de acessos entrar."
                >
                  <input {...register('consultorResponsavel')} placeholder="Rafael Martini" />
                </Campo>
              </section>

              {/* ---------------------------------------- perfil SSMA --- */}
              <section className="painel">
                <h3><Icone nome="alerta" /> Perfil SSMA</h3>
                <p className="desc">
                  Base do ranking, dos indicadores e do dimensionamento das equipes de segurança.
                </p>

                <div className="row3">
                  <Campo label="Grau de risco (NR-4)" obrigatorio erro={erro('grauRisco')}>
                    <select {...register('grauRisco')} aria-invalid={Boolean(erro('grauRisco'))}>
                      <option value="">Selecione</option>
                      {referencias.grausRisco.map((grau) => (
                        <option key={grau.valor} value={grau.valor}>
                          {grau.descricao}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo label="Funcionários" obrigatorio erro={erro('quantidadeFuncionarios')}>
                    <input
                      type="number"
                      min="1"
                      {...register('quantidadeFuncionarios')}
                      aria-invalid={Boolean(erro('quantidadeFuncionarios'))}
                      placeholder="640"
                    />
                  </Campo>
                  <Campo
                    label="Meta do Índice Global"
                    erro={erro('metaIndiceGlobal')}
                    ajuda="0 a 100. Referência do ranking e dos alertas."
                  >
                    <input type="number" min="0" max="100" step="1" {...register('metaIndiceGlobal')} />
                  </Campo>
                </div>

                <div className="row2">
                  <label className="check-linha">
                    <input type="checkbox" {...register('possuiCipa')} />
                    Possui CIPA constituída
                  </label>
                  <label className="check-linha">
                    <input type="checkbox" {...register('possuiSesmt')} />
                    Possui SESMT próprio
                  </label>
                </div>
              </section>

              {/* --------------------------------------- interlocutor --- */}
              <section className="painel">
                <h3><Icone nome="pessoa" /> Interlocutor no cliente</h3>
                <p className="desc">Quem recebe os relatórios, alertas e notificações deste contrato.</p>

                <div className="row2">
                  <Campo label="Nome" obrigatorio erro={erro('contatoNome')}>
                    <input {...register('contatoNome')} aria-invalid={Boolean(erro('contatoNome'))} placeholder="Juliana Amaral" />
                  </Campo>
                  <Campo label="Cargo" erro={erro('contatoCargo')}>
                    <input {...register('contatoCargo')} placeholder="Coordenadora de SSMA" />
                  </Campo>
                </div>

                <div className="row3">
                  <Campo label="E-mail" obrigatorio erro={erro('contatoEmail')}>
                    <input type="email" {...register('contatoEmail')} aria-invalid={Boolean(erro('contatoEmail'))} />
                  </Campo>
                  <Campo label="Telefone" obrigatorio erro={erro('contatoTelefone')}>
                    <input
                      {...comMascara('contatoTelefone', 'telefone')}
                      value={valores.contatoTelefone}
                      aria-invalid={Boolean(erro('contatoTelefone'))}
                      placeholder="(62) 3222-1010"
                    />
                  </Campo>
                  <Campo label="WhatsApp" erro={erro('contatoWhatsapp')}>
                    <input
                      {...comMascara('contatoWhatsapp', 'telefone')}
                      value={valores.contatoWhatsapp}
                      placeholder="(62) 99111-2020"
                    />
                  </Campo>
                </div>
              </section>

              {/* ------------------------------------------- endereço --- */}
              <section className="painel">
                <h3><Icone nome="local" /> Endereço da sede</h3>
                <p className="desc">Endereço administrativo. As frentes de trabalho entram na etapa de unidades e áreas.</p>

                <div className="row-cep">
                  <Campo label="CEP" obrigatorio erro={erro('cep')}>
                    <input
                      {...campoCep}
                      value={valores.cep}
                      onBlur={(evento) => {
                        void campoCep.onBlur(evento);
                        void buscarCep(evento.target.value);
                      }}
                      aria-invalid={Boolean(erro('cep'))}
                      placeholder="75380-000"
                      inputMode="numeric"
                    />
                  </Campo>
                  <Campo label="Logradouro" obrigatorio erro={erro('logradouro')}>
                    <input {...register('logradouro')} aria-invalid={Boolean(erro('logradouro'))} />
                  </Campo>
                  <Campo label="Número" obrigatorio erro={erro('numero')}>
                    <input {...register('numero')} aria-invalid={Boolean(erro('numero'))} placeholder="S/N" />
                  </Campo>
                </div>

                {buscandoCep ? <p className="ajuda">Consultando CEP...</p> : null}

                <div className="row2">
                  <Campo label="Complemento" erro={erro('complemento')}>
                    <input {...register('complemento')} />
                  </Campo>
                  <Campo label="Bairro" obrigatorio erro={erro('bairro')}>
                    <input {...register('bairro')} aria-invalid={Boolean(erro('bairro'))} />
                  </Campo>
                </div>

                <div className="row2">
                  <Campo label="Cidade" obrigatorio erro={erro('cidade')}>
                    <input {...register('cidade')} aria-invalid={Boolean(erro('cidade'))} />
                  </Campo>
                  <Campo label="UF" obrigatorio erro={erro('uf')}>
                    <select {...register('uf')} aria-invalid={Boolean(erro('uf'))}>
                      <option value="">Selecione</option>
                      {referencias.ufs.map((uf) => (
                        <option key={uf.sigla} value={uf.sigla}>
                          {uf.sigla} — {uf.nome}
                        </option>
                      ))}
                    </select>
                  </Campo>
                </div>
              </section>

              {/* ------------------------------------------ identidade -- */}
              <section className="painel" style={{ paddingBottom: 0 }}>
                <h3><Icone nome="paleta" /> Identidade e anotações</h3>
                <p className="desc">Cor e logo do cliente nos relatórios e nos gráficos comparativos.</p>

                <div className="row2">
                  <Campo label="Logo" ajuda="PNG, JPG, WEBP ou SVG — até 5 MB.">
                    <div className="logo-box">
                      <div className="logo-preview">
                        {logoAtual ? <img src={logoAtual} alt="Logo do cliente" /> : <span aria-hidden="true"><Icone nome="fabrica" /></span>}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input
                          ref={inputLogo}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          style={{ display: 'none' }}
                          onChange={(evento) => {
                            const arquivo = evento.target.files?.[0];
                            if (arquivo) void enviarLogo(arquivo);
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={!modoEdicao || enviandoLogo}
                          onClick={() => inputLogo.current?.click()}
                        >
                          {enviandoLogo ? 'Enviando...' : 'Enviar logo'}
                        </button>
                        {logoAtual ? (
                          <button type="button" className="btn btn-ghost btn-sm" disabled={enviandoLogo} onClick={() => void removerLogo()}>
                            Remover
                          </button>
                        ) : null}
                        {!modoEdicao ? <span className="ajuda">Salve o cadastro para habilitar o envio.</span> : null}
                      </div>
                    </div>
                  </Campo>
                  <Campo label="Cor de destaque" erro={erro('corDestaque')} ajuda="Cor da série deste cliente nos gráficos.">
                    <input type="color" {...register('corDestaque')} />
                  </Campo>
                </div>

                <Campo
                  label="URL da planta baixa"
                  erro={erro('imagemPlantaUrl')}
                  ajuda="Endereço (https://...) de uma imagem da planta da instalação. Usada no Mapa de calor por planta para posicionar as áreas."
                >
                  <input type="url" {...register('imagemPlantaUrl')} placeholder="https://exemplo.com/planta-baixa.png" />
                </Campo>

                <Campo label="Observações" erro={erro('observacoes')}>
                  <textarea {...register('observacoes')} placeholder="Particularidades do contrato, restrições de acesso, contatos alternativos." />
                </Campo>

                <div className="barra-acoes rodape-form">
                  <span className="aviso">
                    {modoEdicao
                      ? isDirty
                        ? 'Há alterações não salvas.'
                        : `Última atualização: ${formatarDataHora(cliente?.atualizadoEm)}`
                      : 'Campos marcados com * são obrigatórios.'}
                  </span>
                  <button type="button" className="btn btn-ghost" onClick={() => navegar('/clientes')}>
                    Cancelar
                  </button>
                  {modoEdicao ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={isSubmitting || !isDirty}
                      onClick={() => cliente && reset(clienteParaFormulario(cliente))}
                    >
                      Descartar alterações
                    </button>
                  ) : null}
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Salvando...' : modoEdicao ? 'Salvar alterações' : 'Cadastrar cliente'}
                  </button>
                </div>
              </section>
            </div>

            <aside className="coluna-previa">
              <div className="painel">
                <h3><Icone nome="grafico" /> Como entra no ranking</h3>
                <p className="desc">
                  Esta é a linha do cliente nos dashboards e no comparativo entre contratos.
                </p>

                <div className="previa-doc">
                  <div className="cab" style={{ background: 'var(--navy)' }}>
                    <div className="logo">
                      {logoAtual ? <img src={logoAtual} alt="" /> : <span aria-hidden="true"><Icone nome="fabrica" /></span>}
                    </div>
                    <div>
                      <div className="nome" style={{ color: valores.corDestaque || '#fff' }}>
                        {valores.nomeFantasia || 'Nome fantasia'}
                      </div>
                      <div className="sub">
                        Contrato {valores.numeroContrato || '—'} · {valores.cidade || 'Cidade'}/{valores.uf || 'UF'}
                      </div>
                    </div>
                  </div>
                  <div className="corpo">
                    <div className="titulo-doc">Índice Global SSMA — meta {valores.metaIndiceGlobal || '85'}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      {valores.grauRisco ? (
                        <span className={`pill ${PILL_GRAU[valores.grauRisco] ?? 'gray'}`}>
                          Grau de risco {valores.grauRisco}
                        </span>
                      ) : (
                        <span className="pill gray">Grau de risco —</span>
                      )}
                      {valores.possuiSesmt ? <span className="pill info">SESMT</span> : null}
                      {valores.possuiCipa ? <span className="pill info">CIPA</span> : null}
                    </div>
                    {valores.quantidadeFuncionarios || '0'} trabalhadores cobertos
                    <br />
                    {valores.segmento || 'Segmento não informado'}
                  </div>
                  <div className="rodape">
                    Interlocutor: {valores.contatoNome || '—'}
                    {valores.contatoCargo ? ` (${valores.contatoCargo})` : ''}
                  </div>
                </div>

                <dl className="resumo-lateral">
                  <dt>Vigência</dt>
                  <dd>
                    {formatarDataIso(valores.dataInicioContrato)}
                    {valores.dataFimContrato ? ` → ${formatarDataIso(valores.dataFimContrato)}` : ' → indeterminado'}
                  </dd>
                  {cliente && cliente.diasParaFimContrato !== null ? (
                    <>
                      <dt>Dias até o fim</dt>
                      <dd style={{ color: cliente.contratoVencido ? 'var(--red)' : undefined }}>
                        {cliente.contratoVencido
                          ? `vencido há ${Math.abs(cliente.diasParaFimContrato)} dias`
                          : `${cliente.diasParaFimContrato} dias`}
                      </dd>
                    </>
                  ) : null}
                </dl>
              </div>
            </aside>
          </div>
        </form>
      )}
    </>
  );
}
