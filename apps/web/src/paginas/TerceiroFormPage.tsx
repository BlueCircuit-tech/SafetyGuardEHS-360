import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, type Path, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { classificarNotaSsma, rotuloClassificacao, terceiroCreateSchema, type TerceiroFormValues } from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { MASCARAS, type NomeMascara } from '../lib/mascaras';
import { useBuscaCep } from '../lib/useBuscaCep';
import { formatarDataHora, formatarDataIso } from '../lib/datas';
import {
  PILL_CLASSIFICACAO,
  VALORES_INICIAIS_TERCEIRO,
  terceiroParaFormulario,
  terceiroParaPayload,
  type TerceiroApi,
} from '../lib/terceiro-form';

interface Referencias {
  ufs: Array<{ sigla: string; nome: string }>;
  portes: Array<{ valor: string; rotulo: string }>;
  grausRisco: Array<{ valor: number; descricao: string }>;
  situacoesTerceiro: Array<{ valor: string; rotulo: string }>;
  tiposVinculoTerceiro: Array<{ valor: string; rotulo: string }>;
  atividadesTerceiro: string[];
  faixasClassificacao: Array<{ classificacao: string; minimo: number; rotulo: string }>;
}

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
  numeroContrato: string;
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
  grausRisco: [],
  situacoesTerceiro: [],
  tiposVinculoTerceiro: [],
  atividadesTerceiro: [],
  faixasClassificacao: [],
};

const PILL_GRAU: Record<string, string> = { '1': 'ok', '2': 'warn', '3': 'orange', '4': 'bad' };

function textoValor(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'sim' : 'nao';
  return String(valor);
}

export function TerceiroFormPage() {
  const { id } = useParams<{ id: string }>();
  const [parametros] = useSearchParams();
  const navegar = useNavigate();
  const { mostrar } = useToast();

  const modoEdicao = Boolean(id);
  const [carregando, setCarregando] = useState(modoEdicao);
  const [terceiro, setTerceiro] = useState<TerceiroApi | null>(null);
  const [referencias, setReferencias] = useState<Referencias>(REFERENCIAS_VAZIAS);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
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
  } = useForm<TerceiroFormValues>({
    defaultValues: {
      ...VALORES_INICIAIS_TERCEIRO,
      // Permite abrir o cadastro já com o cliente escolhido (?clienteId=...).
      clienteId: parametros.get('clienteId') ?? '',
    },
    resolver: zodResolver(terceiroCreateSchema) as unknown as Resolver<TerceiroFormValues>,
    mode: 'onBlur',
  });

  const valores = watch();

  /* ------------------------------------------------------------- carga --- */
  useEffect(() => {
    let ativo = true;

    async function carregar() {
      const [refs, opcoes] = await Promise.allSettled([
        api.get<Referencias>('/referencias'),
        api.get<OpcaoCliente[]>('/clientes/opcoes?incluirInativos=true'),
      ]);

      if (ativo && refs.status === 'fulfilled') setReferencias(refs.value);
      if (ativo && opcoes.status === 'fulfilled') setClientes(opcoes.value);

      if (!id) return;

      try {
        const atual = await api.get<TerceiroApi>(`/terceiros/${id}`);
        if (!ativo) return;
        setTerceiro(atual);
        reset(terceiroParaFormulario(atual));
      } catch (erro) {
        if (ativo) {
          mostrar(erro instanceof Error ? erro.message : 'Terceiro nao encontrado.', 'erro');
          navegar('/terceiros', { replace: true });
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
      setAuditoria(await api.get<RegistroAuditoria[]>(`/terceiros/${id}/auditoria?limite=50`));
    } catch {
      setAuditoria([]);
    }
  }, [id]);

  useEffect(() => {
    if (aba === 'historico') void carregarAuditoria();
  }, [aba, carregarAuditoria]);

  /* ---------------------------------------------------------- máscaras --- */
  const comMascara = (campo: Path<TerceiroFormValues>, mascara: NomeMascara) => {
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
    const payload = terceiroParaPayload(dados);

    try {
      const salvo = modoEdicao
        ? await api.put<TerceiroApi>(`/terceiros/${id}`, payload)
        : await api.post<TerceiroApi>('/terceiros', payload);

      setTerceiro(salvo);
      reset(terceiroParaFormulario(salvo));
      mostrar(modoEdicao ? 'Terceiro atualizado.' : `Terceiro ${salvo.nomeFantasia} cadastrado.`, 'sucesso');

      if (!modoEdicao) navegar(`/terceiros/${salvo.id}`, { replace: true });
      if (aba === 'historico') void carregarAuditoria();
    } catch (erro) {
      if (erro instanceof ErroApi) {
        for (const [campo, mensagens] of Object.entries(erro.campos)) {
          setError(campo as Path<TerceiroFormValues>, { type: 'server', message: mensagens[0] });
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
      const atualizado = await api.upload<TerceiroApi>(`/terceiros/${id}/logo`, arquivo);
      setTerceiro(atualizado);
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
      const atualizado = await api.delete<TerceiroApi>(`/terceiros/${id}/logo`);
      setTerceiro(atualizado);
      setValue('logoUrl', '', { shouldDirty: false });
      mostrar('Logo removida.');
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao remover a logo.', 'erro');
    } finally {
      setEnviandoLogo(false);
    }
  }

  const logoAtual = useMemo(() => urlAbsoluta(valores.logoUrl), [valores.logoUrl]);

  const notaPrevia = valores.notaSsma === '' ? null : Number(valores.notaSsma);
  const classePrevia = classificarNotaSsma(Number.isNaN(notaPrevia) ? null : notaPrevia);
  const metaPrevia = valores.metaNotaSsma === '' ? 0 : Number(valores.metaNotaSsma);
  const abaixoDaMeta = notaPrevia !== null && !Number.isNaN(notaPrevia) && notaPrevia < metaPrevia;

  if (carregando) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
        Carregando terceiro...
      </div>
    );
  }

  const erro = (campo: keyof TerceiroFormValues) => errors[campo]?.message as string | undefined;

  return (
    <>
      <Link className="link-voltar" to="/terceiros">
        ← Voltar para a lista de terceiros
      </Link>

      <div className="page-head">
        <div>
          <h2>{modoEdicao ? valores.nomeFantasia || 'Editar terceiro' : 'Novo terceiro'}</h2>
          <p>
            {modoEdicao
              ? 'Alterações ficam registradas na trilha de auditoria, com autor e diferença campo a campo.'
              : 'Empresa terceirizada que atua dentro da operação de um cliente. A nota SSMA define a posição no ranking.'}
          </p>
        </div>
        {modoEdicao && terceiro ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {terceiro.pendenciaDocumental ? <span className="pill bad">pendência documental</span> : null}
            <span className={`pill ${terceiro.classificacao ? PILL_CLASSIFICACAO[terceiro.classificacao] : 'gray'}`}>
              {terceiro.classificacao
                ? `Classe ${terceiro.classificacao} · ${terceiro.classificacaoRotulo}`
                : 'Sem avaliação'}
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
          <h3>🧾 Trilha de auditoria</h3>
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
              {/* -------------------------------------------- vínculo --- */}
              <section className="painel">
                <h3>🔗 Onde atua</h3>
                <p className="desc">O terceiro sempre pertence à operação de um cliente contratante.</p>

                <Campo
                  label="Cliente"
                  obrigatorio
                  erro={erro('clienteId')}
                  ajuda="O mesmo CNPJ pode ser cadastrado em mais de um cliente — a nota e a documentação são por operação."
                >
                  <select {...register('clienteId')} aria-invalid={Boolean(erro('clienteId'))}>
                    <option value="">Selecione o cliente</option>
                    {clientes.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.nomeFantasia} · contrato {cliente.numeroContrato}
                      </option>
                    ))}
                  </select>
                </Campo>

                <div className="row3">
                  <Campo label="Tipo de vínculo" erro={erro('tipoVinculo')}>
                    <select {...register('tipoVinculo')}>
                      {referencias.tiposVinculoTerceiro.map((tipo) => (
                        <option key={tipo.valor} value={tipo.valor}>
                          {tipo.rotulo}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo label="Contrato / OS" erro={erro('numeroContrato')}>
                    <input {...register('numeroContrato')} placeholder="VV-TC-018" />
                  </Campo>
                  <Campo label="Situação" erro={erro('situacao')} ajuda="Bloqueado impede a liberação de acesso.">
                    <select {...register('situacao')}>
                      {referencias.situacoesTerceiro.map((situacao) => (
                        <option key={situacao.valor} value={situacao.valor}>
                          {situacao.rotulo}
                        </option>
                      ))}
                    </select>
                  </Campo>
                </div>

                <div className="row2">
                  <Campo label="Início da atuação" obrigatorio erro={erro('dataInicioAtuacao')}>
                    <input type="date" {...register('dataInicioAtuacao')} aria-invalid={Boolean(erro('dataInicioAtuacao'))} />
                  </Campo>
                  <Campo label="Fim da atuação" erro={erro('dataFimAtuacao')} ajuda="Vazio = sem prazo definido.">
                    <input type="date" {...register('dataFimAtuacao')} aria-invalid={Boolean(erro('dataFimAtuacao'))} />
                  </Campo>
                </div>

                <Campo label="Áreas / frentes onde atua" erro={erro('areasAtuacao')}>
                  <input {...register('areasAtuacao')} placeholder="Britagem — Planta 2; Oficina de manutencao" />
                </Campo>

                <Campo label="Escopo dos serviços" erro={erro('escopoServicos')}>
                  <textarea {...register('escopoServicos')} placeholder="Montagem e manutencao de transportadores de correia." />
                </Campo>
              </section>

              {/* -------------------------------------- identificação --- */}
              <section className="painel">
                <h3>🏭 Identificação</h3>
                <p className="desc">Dados cadastrais da empresa terceirizada.</p>

                <Campo label="Razão social" obrigatorio erro={erro('razaoSocial')}>
                  <input
                    {...register('razaoSocial')}
                    aria-invalid={Boolean(erro('razaoSocial'))}
                    placeholder="Montalta Servicos Industriais Ltda"
                  />
                </Campo>

                <div className="row2">
                  <Campo label="Nome fantasia" obrigatorio erro={erro('nomeFantasia')} ajuda="Nome usado no ranking.">
                    <input {...register('nomeFantasia')} aria-invalid={Boolean(erro('nomeFantasia'))} placeholder="Montalta" />
                  </Campo>
                  <Campo label="CNPJ" obrigatorio erro={erro('cnpj')} ajuda="Único dentro do cliente.">
                    <input
                      {...comMascara('cnpj', 'cnpj')}
                      value={valores.cnpj}
                      aria-invalid={Boolean(erro('cnpj'))}
                      placeholder="00.000.000/0000-00"
                    />
                  </Campo>
                </div>

                <Campo
                  label="Atividade principal"
                  obrigatorio
                  erro={erro('atividadePrincipal')}
                  ajuda="O que a empresa executa dentro da operação."
                >
                  <input
                    {...register('atividadePrincipal')}
                    list="atividades-terceiro"
                    aria-invalid={Boolean(erro('atividadePrincipal'))}
                    placeholder="Montagem eletromecanica"
                  />
                  <datalist id="atividades-terceiro">
                    {referencias.atividadesTerceiro.map((atividade) => (
                      <option key={atividade} value={atividade} />
                    ))}
                  </datalist>
                </Campo>

                <div className="row3">
                  <Campo label="CNAE principal" erro={erro('cnaePrincipal')}>
                    <input {...comMascara('cnaePrincipal', 'cnae')} value={valores.cnaePrincipal} placeholder="3321-0/00" />
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
                  <Campo label="Inscrição estadual" erro={erro('inscricaoEstadual')}>
                    <input {...register('inscricaoEstadual')} placeholder="ISENTO" />
                  </Campo>
                </div>
              </section>

              {/* ----------------------------- desempenho / ranking ----- */}
              <section className="painel">
                <h3>🏆 Desempenho SSMA</h3>
                <p className="desc">
                  A nota posiciona o terceiro no ranking. Enquanto as inspeções não existem, ela é lançada aqui; depois
                  passa a ser calculada a partir dos eventos de campo.
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
                  <Campo label="Funcionários alocados" obrigatorio erro={erro('quantidadeFuncionarios')}>
                    <input
                      type="number"
                      min="1"
                      {...register('quantidadeFuncionarios')}
                      aria-invalid={Boolean(erro('quantidadeFuncionarios'))}
                      placeholder="48"
                    />
                  </Campo>
                  <Campo label="Meta da nota" erro={erro('metaNotaSsma')} ajuda="0 a 100.">
                    <input type="number" min="0" max="100" {...register('metaNotaSsma')} />
                  </Campo>
                </div>

                <div className="row2">
                  <Campo label="Nota SSMA atual" erro={erro('notaSsma')} ajuda="0 a 100. Deixe vazio se ainda não avaliado.">
                    <input type="number" min="0" max="100" step="0.1" {...register('notaSsma')} placeholder="92.5" />
                  </Campo>
                  <Campo
                    label="Data da última avaliação"
                    erro={erro('dataUltimaAvaliacao')}
                    ajuda="Obrigatória quando há nota lançada."
                  >
                    <input
                      type="date"
                      {...register('dataUltimaAvaliacao')}
                      aria-invalid={Boolean(erro('dataUltimaAvaliacao'))}
                    />
                  </Campo>
                </div>
              </section>

              {/* ------------------------------------- documentação ----- */}
              <section className="painel">
                <h3>📋 Documentação e conformidade</h3>
                <p className="desc">
                  Pendência aqui bloqueia a liberação de acesso à área do cliente.
                </p>

                <div className="row2">
                  <label className="check-linha">
                    <input type="checkbox" {...register('possuiPgr')} />
                    PGR entregue e vigente
                  </label>
                  <label className="check-linha">
                    <input type="checkbox" {...register('possuiPcmso')} />
                    PCMSO entregue e vigente
                  </label>
                </div>

                <Campo
                  label="Documentação válida até"
                  erro={erro('documentacaoValidaAte')}
                  ajuda="Vencimento da pasta de documentos do terceiro."
                >
                  <input type="date" {...register('documentacaoValidaAte')} />
                </Campo>
              </section>

              {/* --------------------------------------- responsável ---- */}
              <section className="painel">
                <h3>👤 Preposto / responsável</h3>
                <p className="desc">Quem responde pelo terceiro dentro da operação e recebe as notificações.</p>

                <div className="row2">
                  <Campo label="Nome" obrigatorio erro={erro('responsavelNome')}>
                    <input {...register('responsavelNome')} aria-invalid={Boolean(erro('responsavelNome'))} placeholder="Everton Ferraz" />
                  </Campo>
                  <Campo label="Cargo" erro={erro('responsavelCargo')}>
                    <input {...register('responsavelCargo')} placeholder="Preposto" />
                  </Campo>
                </div>

                <div className="row3">
                  <Campo label="E-mail" obrigatorio erro={erro('responsavelEmail')}>
                    <input type="email" {...register('responsavelEmail')} aria-invalid={Boolean(erro('responsavelEmail'))} />
                  </Campo>
                  <Campo label="Telefone" obrigatorio erro={erro('responsavelTelefone')}>
                    <input
                      {...comMascara('responsavelTelefone', 'telefone')}
                      value={valores.responsavelTelefone}
                      aria-invalid={Boolean(erro('responsavelTelefone'))}
                      placeholder="(62) 3211-5500"
                    />
                  </Campo>
                  <Campo label="WhatsApp" erro={erro('responsavelWhatsapp')}>
                    <input
                      {...comMascara('responsavelWhatsapp', 'telefone')}
                      value={valores.responsavelWhatsapp}
                      placeholder="(62) 99444-5500"
                    />
                  </Campo>
                </div>
              </section>

              {/* ------------------------------------------ endereço ---- */}
              <section className="painel">
                <h3>📍 Endereço da sede</h3>
                <p className="desc">Opcional — mas, se preencher, complete o bloco inteiro.</p>

                <div className="row-cep">
                  <Campo label="CEP" erro={erro('cep')}>
                    <input
                      {...campoCep}
                      value={valores.cep}
                      onBlur={(evento) => {
                        void campoCep.onBlur(evento);
                        void buscarCep(evento.target.value);
                      }}
                      aria-invalid={Boolean(erro('cep'))}
                      placeholder="74910-000"
                      inputMode="numeric"
                    />
                  </Campo>
                  <Campo label="Logradouro" erro={erro('logradouro')}>
                    <input {...register('logradouro')} aria-invalid={Boolean(erro('logradouro'))} />
                  </Campo>
                  <Campo label="Número" erro={erro('numero')}>
                    <input {...register('numero')} aria-invalid={Boolean(erro('numero'))} placeholder="340" />
                  </Campo>
                </div>

                {buscandoCep ? <p className="ajuda">Consultando CEP...</p> : null}

                <div className="row2">
                  <Campo label="Complemento" erro={erro('complemento')}>
                    <input {...register('complemento')} />
                  </Campo>
                  <Campo label="Bairro" erro={erro('bairro')}>
                    <input {...register('bairro')} aria-invalid={Boolean(erro('bairro'))} />
                  </Campo>
                </div>

                <div className="row2">
                  <Campo label="Cidade" erro={erro('cidade')}>
                    <input {...register('cidade')} aria-invalid={Boolean(erro('cidade'))} />
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
                </div>
              </section>

              {/* ----------------------------------------- identidade --- */}
              <section className="painel" style={{ paddingBottom: 0 }}>
                <h3>🎨 Identidade e anotações</h3>

                <div className="row2">
                  <Campo label="Logo" ajuda="PNG, JPG, WEBP ou SVG — até 5 MB.">
                    <div className="logo-box">
                      <div className="logo-preview">
                        {logoAtual ? <img src={logoAtual} alt="Logo do terceiro" /> : <span aria-hidden="true">🛠️</span>}
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
                  <Campo label="Cor de destaque" erro={erro('corDestaque')} ajuda="Cor da barra do terceiro no ranking.">
                    <input type="color" {...register('corDestaque')} />
                  </Campo>
                </div>

                <Campo label="Observações" erro={erro('observacoes')}>
                  <textarea {...register('observacoes')} placeholder="Pendências, restrições de acesso, histórico de ocorrências." />
                </Campo>

                <div className="barra-acoes" style={{ marginLeft: -18, marginRight: -18 }}>
                  <span className="aviso">
                    {modoEdicao
                      ? isDirty
                        ? 'Há alterações não salvas.'
                        : `Última atualização: ${formatarDataHora(terceiro?.atualizadoEm)}`
                      : 'Campos marcados com * são obrigatórios.'}
                  </span>
                  <button type="button" className="btn btn-ghost" onClick={() => navegar('/terceiros')}>
                    Cancelar
                  </button>
                  {modoEdicao ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={isSubmitting || !isDirty}
                      onClick={() => terceiro && reset(terceiroParaFormulario(terceiro))}
                    >
                      Descartar alterações
                    </button>
                  ) : null}
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Salvando...' : modoEdicao ? 'Salvar alterações' : 'Cadastrar terceiro'}
                  </button>
                </div>
              </section>
            </div>

            <aside className="coluna-previa">
              <div className="painel">
                <h3>📊 Posição no ranking</h3>
                <p className="desc">Como este terceiro aparece no comparativo de desempenho.</p>

                <div className="previa-doc">
                  <div className="cab" style={{ background: 'var(--navy)' }}>
                    <div className="logo">
                      {logoAtual ? <img src={logoAtual} alt="" /> : <span aria-hidden="true">🛠️</span>}
                    </div>
                    <div>
                      <div className="nome" style={{ color: valores.corDestaque || '#fff' }}>
                        {valores.nomeFantasia || 'Nome fantasia'}
                      </div>
                      <div className="sub">{valores.atividadePrincipal || 'Atividade principal'}</div>
                    </div>
                  </div>
                  <div className="corpo">
                    <div className="titulo-doc">
                      Nota SSMA{' '}
                      {notaPrevia === null || Number.isNaN(notaPrevia)
                        ? '— não avaliado'
                        : `${notaPrevia.toFixed(1).replace('.', ',')} / meta ${metaPrevia}`}
                    </div>
                    <div className="barra-nota" aria-hidden="true">
                      <span
                        style={{
                          width: `${Math.min(100, Math.max(0, notaPrevia ?? 0))}%`,
                          background: abaixoDaMeta ? 'var(--red)' : 'var(--green)',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      <span className={`pill ${classePrevia ? PILL_CLASSIFICACAO[classePrevia] : 'gray'}`}>
                        {classePrevia ? `Classe ${classePrevia} · ${rotuloClassificacao(classePrevia)}` : 'Sem avaliação'}
                      </span>
                      {valores.grauRisco ? (
                        <span className={`pill ${PILL_GRAU[valores.grauRisco] ?? 'gray'}`}>
                          Grau {valores.grauRisco}
                        </span>
                      ) : null}
                      {valores.possuiPgr && valores.possuiPcmso ? (
                        <span className="pill ok">documentos ok</span>
                      ) : (
                        <span className="pill bad">pendência documental</span>
                      )}
                    </div>
                  </div>
                  <div className="rodape">
                    {valores.quantidadeFuncionarios || '0'} trabalhadores alocados · responsável{' '}
                    {valores.responsavelNome || '—'}
                  </div>
                </div>

                <dl className="resumo-lateral">
                  <dt>Faixas do ranking</dt>
                  <dd style={{ fontWeight: 400, fontSize: 11.5, lineHeight: 1.7 }}>
                    {referencias.faixasClassificacao.map((faixa) => (
                      <div key={faixa.classificacao}>
                        <b>{faixa.classificacao}</b> ≥ {faixa.minimo} — {faixa.rotulo}
                      </div>
                    ))}
                  </dd>
                  <dt>Atuação</dt>
                  <dd>
                    {formatarDataIso(valores.dataInicioAtuacao)}
                    {valores.dataFimAtuacao ? ` → ${formatarDataIso(valores.dataFimAtuacao)}` : ' → sem prazo'}
                  </dd>
                  {terceiro && terceiro.diasParaVencimentoDocumentacao !== null ? (
                    <>
                      <dt>Documentação</dt>
                      <dd style={{ color: terceiro.documentacaoVencida ? 'var(--red)' : undefined }}>
                        {terceiro.documentacaoVencida
                          ? `vencida há ${Math.abs(terceiro.diasParaVencimentoDocumentacao)} dias`
                          : `vence em ${terceiro.diasParaVencimentoDocumentacao} dias`}
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
