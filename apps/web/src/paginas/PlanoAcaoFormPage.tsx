import { useCallback, useEffect, useRef, useState } from 'react';
import { Icone } from '../componentes/Icone';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, type Path, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CRITICIDADES_PLANO,
  PRAZO_PADRAO_POR_CRITICIDADE,
  ROTULO_CRITICIDADE_PLANO,
  ROTULO_STATUS_PLANO,
  STATUS_PLANO,
  planoAcaoCreateSchema,
  type CriticidadePlano,
  type PlanoAcaoFormValues,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { formatarDataHora } from '../lib/datas';
import {
  PILL_CRITICIDADE_PLANO,
  PILL_STATUS_PLANO,
  VALORES_INICIAIS_PLANO,
  paraDatetimeLocal,
  type NotificacaoApi,
  type PlanoApi,
} from '../lib/plano-form';

interface OpcaoArea {
  id: string;
  nome: string;
  codigo: string;
  setor: string | null;
}

export function PlanoAcaoFormPage() {
  const { id } = useParams<{ id: string }>();
  const [parametros] = useSearchParams();
  const navegar = useNavigate();
  const { mostrar } = useToast();

  const modoEdicao = Boolean(id);
  const [carregando, setCarregando] = useState(modoEdicao);
  const [plano, setPlano] = useState<PlanoApi | null>(null);
  const [areas, setAreas] = useState<OpcaoArea[]>([]);
  const [notificacoes, setNotificacoes] = useState<NotificacaoApi[]>([]);
  const [enviandoEvidencia, setEnviandoEvidencia] = useState(false);
  const inputEvidencia = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<PlanoAcaoFormValues>({
    defaultValues: { ...VALORES_INICIAIS_PLANO, areaId: parametros.get('areaId') ?? '' },
    resolver: zodResolver(planoAcaoCreateSchema) as unknown as Resolver<PlanoAcaoFormValues>,
    mode: 'onBlur',
  });

  const valores = watch();

  const carregarNotificacoes = useCallback(async () => {
    if (!id) return;
    try {
      const resposta = await api.get<{ itens: NotificacaoApi[] }>(`/notificacoes?planoAcaoId=${id}`);
      setNotificacoes(resposta.itens);
    } catch {
      setNotificacoes([]);
    }
  }, [id]);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      const areasResposta = await api.get<OpcaoArea[]>('/areas/opcoes').catch(() => [] as OpcaoArea[]);
      if (ativo) setAreas(areasResposta);

      if (!id) return;

      try {
        const atual = await api.get<PlanoApi>(`/planos-acao/${id}`);
        if (!ativo) return;
        setPlano(atual);
        reset({
          origem: atual.origem,
          observacaoId: atual.observacaoId ?? '',
          areaId: atual.areaId ?? '',
          terceiroId: atual.terceiroId ?? '',
          acao: atual.acao,
          descricao: atual.descricao ?? '',
          responsavelNome: atual.responsavelNome,
          responsavelCargo: atual.responsavelCargo ?? '',
          responsavelEmail: atual.responsavelEmail ?? '',
          criticidade: atual.criticidade,
          prazo: paraDatetimeLocal(new Date(atual.prazo)),
          status: atual.status,
          dataConclusao: atual.dataConclusao ? paraDatetimeLocal(new Date(atual.dataConclusao)) : '',
          evidenciaUrl: atual.evidenciaUrl ?? '',
          comentarioConclusao: atual.comentarioConclusao ?? '',
          observacoes: atual.observacoes ?? '',
        });
        void carregarNotificacoes();
      } catch (erro) {
        if (ativo) {
          mostrar(erro instanceof Error ? erro.message : 'Plano nao encontrado.', 'erro');
          navegar('/planos-acao', { replace: true });
        }
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    void carregar();
    return () => {
      ativo = false;
    };
  }, [id, reset, mostrar, navegar, carregarNotificacoes]);

  /** Ao escolher a criticidade num plano novo, sugere o prazo padrão da matriz. */
  function aoEscolherCriticidade(valor: string) {
    setValue('criticidade', valor, { shouldDirty: true, shouldValidate: true });

    if (modoEdicao || !valor) return;
    const horas = PRAZO_PADRAO_POR_CRITICIDADE[valor as CriticidadePlano];
    setValue('prazo', paraDatetimeLocal(new Date(Date.now() + horas * 60 * 60 * 1000)), { shouldDirty: true });
  }

  const aoSalvar = handleSubmit(async (dados) => {
    try {
      const salvo = modoEdicao
        ? await api.put<PlanoApi>(`/planos-acao/${id}`, dados)
        : await api.post<PlanoApi>('/planos-acao', dados);

      setPlano(salvo);
      mostrar(modoEdicao ? 'Plano atualizado.' : `Plano ${salvo.codigo} aberto.`, 'sucesso');
      if (!modoEdicao) navegar(`/planos-acao/${salvo.id}`, { replace: true });
      else void carregarNotificacoes();
    } catch (erro) {
      if (erro instanceof ErroApi) {
        for (const [campo, mensagens] of Object.entries(erro.campos)) {
          setError(campo as Path<PlanoAcaoFormValues>, { type: 'server', message: mensagens[0] });
        }
        mostrar(erro.mensagemAmigavel(), 'erro');
        return;
      }
      mostrar('Falha inesperada ao salvar.', 'erro');
    }
  });

  async function enviarEvidencia(arquivo: File) {
    if (!id) return;
    setEnviandoEvidencia(true);
    try {
      const atualizado = await api.upload<PlanoApi>(`/planos-acao/${id}/evidencia`, arquivo);
      setPlano(atualizado);
      setValue('evidenciaUrl', atualizado.evidenciaUrl ?? '', { shouldDirty: false });
      mostrar('Evidência anexada.', 'sucesso');
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao enviar a evidência.', 'erro');
    } finally {
      setEnviandoEvidencia(false);
      if (inputEvidencia.current) inputEvidencia.current.value = '';
    }
  }

  if (carregando) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
        Carregando plano...
      </div>
    );
  }

  const erro = (campo: keyof PlanoAcaoFormValues) => errors[campo]?.message as string | undefined;
  const evidenciaAtual = urlAbsoluta(valores.evidenciaUrl);
  const concluindo = valores.status === 'CONCLUIDO';

  return (
    <>
      <Link className="link-voltar" to="/planos-acao">
        ← Voltar para os planos de ação
      </Link>

      <div className="page-head">
        <div>
          <h2>{plano ? `${plano.codigo} — ${plano.acao}` : 'Novo plano de ação'}</h2>
          <p>
            {plano?.origem === 'OBSERVACAO'
              ? 'Aberto a partir de uma observação de campo. Prazo e destinatários vieram da matriz de comunicação.'
              : 'Tratativa de um desvio. O prazo padrão é sugerido pela criticidade escolhida.'}
          </p>
        </div>
        {plano ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={`pill ${PILL_CRITICIDADE_PLANO[plano.criticidade]}`}>{plano.rotulos.criticidade}</span>
            <span className={`pill ${PILL_STATUS_PLANO[plano.status]}`}>{plano.rotulos.status}</span>
            {plano.atrasado ? <span className="pill bad">atrasado {Math.abs(plano.diasParaPrazo)}d</span> : null}
          </div>
        ) : null}
      </div>

      {plano?.escalonamentoPendente ? (
        <div className="hint alerta">
          <Icone nome="raio" /> <b>Escalonamento pendente.</b> O prazo estourou e o nível devido é <b>{plano.nivelDevido}</b>, mas o
          registrado ainda é <b>{plano.nivelAtual}</b>. Rode o escalonamento na listagem para acionar e registrar a
          notificação.
        </div>
      ) : null}

      <form onSubmit={aoSalvar} noValidate>
        <div className="layout-form">
          <div>
            <section className="painel">
              <h3><Icone nome="alvo" /> A ação</h3>

              <Campo label="Ação corretiva" obrigatorio erro={erro('acao')}>
                <input {...register('acao')} aria-invalid={Boolean(erro('acao'))} placeholder="Isolar area e emitir laudo de liberacao" />
              </Campo>

              <Campo label="Detalhamento" erro={erro('descricao')}>
                <textarea {...register('descricao')} placeholder="O que precisa ser feito, com contexto suficiente para quem executa." />
              </Campo>

              {!modoEdicao ? (
                <Campo label="Área" erro={erro('areaId')} ajuda="Sem observação de origem, a área define o cliente do plano.">
                  <select {...register('areaId')} aria-invalid={Boolean(erro('areaId'))}>
                    <option value="">Selecione a área</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.setor ? `${area.setor} · ` : ''}
                        {area.nome} ({area.codigo})
                      </option>
                    ))}
                  </select>
                </Campo>
              ) : null}
            </section>

            <section className="painel">
              <h3><Icone nome="pessoa" /> Responsável e prazo</h3>

              <div className="row2">
                <Campo label="Responsável" obrigatorio erro={erro('responsavelNome')}>
                  <input {...register('responsavelNome')} aria-invalid={Boolean(erro('responsavelNome'))} />
                </Campo>
                <Campo label="Cargo" erro={erro('responsavelCargo')}>
                  <input {...register('responsavelCargo')} />
                </Campo>
              </div>

              <div className="row3">
                <Campo label="E-mail" erro={erro('responsavelEmail')} ajuda="Destino da notificação de cobrança.">
                  <input type="email" {...register('responsavelEmail')} />
                </Campo>
                <Campo label="Criticidade" obrigatorio erro={erro('criticidade')}>
                  <select
                    value={valores.criticidade}
                    onChange={(evento) => aoEscolherCriticidade(evento.target.value)}
                    aria-invalid={Boolean(erro('criticidade'))}
                  >
                    <option value="">Selecione</option>
                    {CRITICIDADES_PLANO.map((valor) => (
                      <option key={valor} value={valor}>
                        {ROTULO_CRITICIDADE_PLANO[valor]} —{' '}
                        {PRAZO_PADRAO_POR_CRITICIDADE[valor] === 0
                          ? 'imediato'
                          : `${PRAZO_PADRAO_POR_CRITICIDADE[valor]}h`}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Prazo" obrigatorio erro={erro('prazo')}>
                  <input type="datetime-local" {...register('prazo')} aria-invalid={Boolean(erro('prazo'))} />
                </Campo>
              </div>
            </section>

            <section className="painel" style={{ paddingBottom: 0 }}>
              <h3><Icone nome="ok" /> Tratativa</h3>
              <p className="desc">Concluir exige evidência anexada ou a descrição do que foi feito.</p>

              <div className="row2">
                <Campo label="Status" erro={erro('status')}>
                  <select {...register('status')}>
                    {STATUS_PLANO.map((valor) => (
                      <option key={valor} value={valor}>
                        {ROTULO_STATUS_PLANO[valor]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo
                  label="Data de conclusão"
                  erro={erro('dataConclusao')}
                  ajuda="Vazio ao concluir = carimba o momento atual."
                >
                  <input type="datetime-local" {...register('dataConclusao')} />
                </Campo>
              </div>

              <Campo
                label="Evidência da correção"
                erro={erro('evidenciaUrl')}
                ajuda="Foto do antes/depois ou documento comprobatório."
              >
                <div className="logo-box">
                  <div className="logo-preview">
                    {evidenciaAtual ? <img src={evidenciaAtual} alt="Evidência" /> : <span aria-hidden="true"><Icone nome="anexo" /></span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      ref={inputEvidencia}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      style={{ display: 'none' }}
                      onChange={(evento) => {
                        const arquivo = evento.target.files?.[0];
                        if (arquivo) void enviarEvidencia(arquivo);
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={!modoEdicao || enviandoEvidencia}
                      onClick={() => inputEvidencia.current?.click()}
                    >
                      {enviandoEvidencia ? 'Enviando...' : 'Anexar evidência'}
                    </button>
                    {!modoEdicao ? <span className="ajuda">Salve o plano para habilitar o anexo.</span> : null}
                  </div>
                </div>
              </Campo>

              <Campo
                label="O que foi feito"
                erro={erro('comentarioConclusao')}
                obrigatorio={concluindo && !valores.evidenciaUrl}
              >
                <textarea {...register('comentarioConclusao')} placeholder="Descreva a correção executada e como foi verificada." />
              </Campo>

              <Campo label="Observações" erro={erro('observacoes')}>
                <textarea {...register('observacoes')} />
              </Campo>

              <div className="barra-acoes rodape-form">
                <span className="aviso">
                  {plano
                    ? `Aberto em ${formatarDataHora(plano.criadoEm)}${
                        plano.dataConclusao ? ` · concluído em ${formatarDataHora(plano.dataConclusao)}` : ''
                      }`
                    : 'Campos marcados com * são obrigatórios.'}
                </span>
                <button type="button" className="btn btn-ghost" onClick={() => navegar('/planos-acao')}>
                  Cancelar
                </button>
                {modoEdicao ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={isSubmitting || valores.status === 'CONCLUIDO'}
                    onClick={() => setValue('status', 'CONCLUIDO', { shouldDirty: true, shouldValidate: true })}
                  >
                    <Icone nome="ok" /> Marcar como concluído
                  </button>
                ) : null}
                <button type="submit" className="btn btn-primary" disabled={isSubmitting || (modoEdicao && !isDirty)}>
                  {isSubmitting ? 'Salvando...' : modoEdicao ? 'Salvar' : 'Abrir plano'}
                </button>
              </div>
            </section>
          </div>

          <aside className="coluna-previa">
            {plano?.observacao ? (
              <div className="painel">
                <h3><Icone nome="documento" /> Observação de origem</h3>
                <dl className="resumo-lateral">
                  <dt>Registrada em</dt>
                  <dd>{formatarDataHora(plano.observacao.dataHora)}</dd>
                  <dt>Causa</dt>
                  <dd>{plano.observacao.causa?.descricao ?? '—'}</dd>
                  {plano.observacao.iir !== null ? (
                    <>
                      <dt>Risco</dt>
                      <dd>
                        IIR {plano.observacao.iir} · grau {plano.observacao.grauRisco}
                      </dd>
                    </>
                  ) : null}
                  <dt>Descrição</dt>
                  <dd style={{ fontWeight: 400 }}>{plano.observacao.descricao}</dd>
                </dl>
                <Link className="btn btn-ghost btn-sm" to={`/observacoes/${plano.observacao.id}`}>
                  Abrir observação
                </Link>
              </div>
            ) : null}

            <div className="painel">
              <h3><Icone nome="envelope" /> Notificações</h3>
              <p className="desc">
                Mensagens montadas para este plano. Registradas como <b>simuladas</b> — o disparo depende do provedor.
              </p>

              {notificacoes.length === 0 ? (
                <p className="ajuda">Nenhuma notificação gerada para este plano.</p>
              ) : (
                notificacoes.map((notificacao) => (
                  <div className="previa-canal" key={notificacao.id}>
                    <span className="canal-lbl">
                      {notificacao.canal === 'EMAIL' ? 'E-mail' : 'WhatsApp'} ·{' '}
                      {formatarDataHora(notificacao.criadoEm)}
                      {notificacao.nivelEscalonamento > 0 ? ` · escalonamento nível ${notificacao.nivelEscalonamento}` : ''}
                    </span>
                    {notificacao.assunto ? <b>{notificacao.assunto}</b> : null}
                    {notificacao.corpo}
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      </form>
    </>
  );
}
