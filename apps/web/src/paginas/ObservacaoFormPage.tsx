import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Farol, Icone } from '../componentes/Icone';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, type Path, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CLASSIFICACOES_BIRD_OCORRENCIA,
  DEFINICOES_BIRD,
  ROTULO_SITUACAO_OBSERVACAO,
  SITUACOES_OBSERVACAO,
  calcularIir,
  classificarIir,
  grauRiscoPeloIir,
  observacaoCreateSchema,
  type ObservacaoFormValues,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { formatarDataHora } from '../lib/datas';
import type { AreaApi } from '../lib/area-form';
import {
  VALORES_INICIAIS_OBSERVACAO,
  paraDatetimeLocal,
  type CausaApi,
  type ObservacaoApi,
  type TipoObservacaoApi,
} from '../lib/observacao-form';

interface OpcaoArea {
  id: string;
  nome: string;
  codigo: string;
  setor: string | null;
  clienteId: string;
}

interface OpcaoTerceiro {
  id: string;
  nomeFantasia: string;
}

const FATORES = [
  { campo: 'severidade', rotulo: 'Severidade', ajuda: 'Gravidade do dano potencial' },
  { campo: 'probabilidade', rotulo: 'Probabilidade', ajuda: 'Chance de o evento ocorrer' },
  { campo: 'exposicao', rotulo: 'Exposição', ajuda: 'Pessoas / tempo expostos' },
  { campo: 'frequencia', rotulo: 'Frequência', ajuda: 'Com que frequência acontece' },
] as const;

export function ObservacaoFormPage() {
  const { id } = useParams<{ id: string }>();
  const [parametros] = useSearchParams();
  const navegar = useNavigate();
  const { mostrar } = useToast();

  const tokenDaUrl = parametros.get('qr') ?? '';
  const modoEdicao = Boolean(id);

  const [carregando, setCarregando] = useState(true);
  const [observacao, setObservacao] = useState<ObservacaoApi | null>(null);
  const [tipos, setTipos] = useState<TipoObservacaoApi[]>([]);
  const [causas, setCausas] = useState<CausaApi[]>([]);
  const [areas, setAreas] = useState<OpcaoArea[]>([]);
  const [terceiros, setTerceiros] = useState<OpcaoTerceiro[]>([]);
  const [areaDoQr, setAreaDoQr] = useState<AreaApi | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [abrindoPlano, setAbrindoPlano] = useState(false);
  const inputFoto = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ObservacaoFormValues>({
    defaultValues: { ...VALORES_INICIAIS_OBSERVACAO, dataHora: paraDatetimeLocal(new Date()) },
    resolver: zodResolver(observacaoCreateSchema) as unknown as Resolver<ObservacaoFormValues>,
    mode: 'onBlur',
  });

  const valores = watch();
  const tipoSelecionado = tipos.find((item) => item.tipo === valores.tipo);

  /* ------------------------------------------------------------- carga --- */
  useEffect(() => {
    let ativo = true;

    async function carregar() {
      const [t, c, a] = await Promise.allSettled([
        api.get<TipoObservacaoApi[]>('/observacoes/tipos'),
        api.get<CausaApi[]>('/causas'),
        api.get<OpcaoArea[]>('/areas/opcoes'),
      ]);

      if (!ativo) return;
      if (t.status === 'fulfilled') setTipos(t.value);
      if (c.status === 'fulfilled') setCausas(c.value);
      if (a.status === 'fulfilled') setAreas(a.value);

      // Chegou pelo QR Code: resolve a área e trava o campo.
      if (tokenDaUrl) {
        try {
          const area = await api.get<AreaApi>(`/areas/qr/${tokenDaUrl}`);
          if (!ativo) return;
          setAreaDoQr(area);
          setValue('areaId', area.id);
          setValue('tokenQr', area.tokenQr);
        } catch (erro) {
          if (ativo) mostrar(erro instanceof Error ? erro.message : 'QR Code nao reconhecido.', 'erro');
        }
      }

      if (id) {
        try {
          const atual = await api.get<ObservacaoApi>(`/observacoes/${id}`);
          if (!ativo) return;
          setObservacao(atual);
          reset({
            ...VALORES_INICIAIS_OBSERVACAO,
            areaId: atual.areaId,
            terceiroId: atual.terceiroId ?? '',
            dataHora: paraDatetimeLocal(new Date(atual.dataHora)),
            tipo: atual.tipo,
            causaId: atual.causaId ?? '',
            descricao: atual.descricao,
            observador: atual.observador,
            severidade: atual.severidade === null ? '' : String(atual.severidade),
            probabilidade: atual.probabilidade === null ? '' : String(atual.probabilidade),
            exposicao: atual.exposicao === null ? '' : String(atual.exposicao),
            frequencia: atual.frequencia === null ? '' : String(atual.frequencia),
            classificacaoBird: atual.classificacaoBird ?? '',
            fotoUrl: atual.fotoUrl ?? '',
            latitude: atual.latitude === null ? '' : String(atual.latitude),
            longitude: atual.longitude === null ? '' : String(atual.longitude),
            acaoImediata: atual.acaoImediata ?? '',
            situacao: atual.situacao,
            observacoes: atual.observacoes ?? '',
          });
        } catch (erro) {
          if (ativo) {
            mostrar(erro instanceof Error ? erro.message : 'Observacao nao encontrada.', 'erro');
            navegar('/observacoes', { replace: true });
          }
        }
      }

      if (ativo) setCarregando(false);
    }

    void carregar();
    return () => {
      ativo = false;
    };
  }, [id, tokenDaUrl, reset, setValue, mostrar, navegar]);

  /* --- terceiros do cliente da área selecionada --------------------------- */
  const clienteDaArea = useMemo(() => {
    if (areaDoQr) return areaDoQr.clienteId;
    return areas.find((area) => area.id === valores.areaId)?.clienteId ?? '';
  }, [areaDoQr, areas, valores.areaId]);

  useEffect(() => {
    if (!clienteDaArea) {
      setTerceiros([]);
      return;
    }
    api
      .get<OpcaoTerceiro[]>(`/terceiros?clienteId=${clienteDaArea}&porPagina=100`)
      .then((resposta) => setTerceiros((resposta as unknown as { itens: OpcaoTerceiro[] }).itens ?? []))
      .catch(() => setTerceiros([]));
  }, [clienteDaArea]);

  /* --- GPS ---------------------------------------------------------------- */
  const capturarGps = useCallback(() => {
    if (!navigator.geolocation) {
      mostrar('Este dispositivo nao expoe GPS ao navegador.', 'erro');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        setValue('latitude', String(posicao.coords.latitude), { shouldDirty: true });
        setValue('longitude', String(posicao.coords.longitude), { shouldDirty: true });
        mostrar('Localizacao capturada.', 'sucesso');
      },
      () => mostrar('Nao foi possivel obter a localizacao.', 'erro'),
    );
  }, [setValue, mostrar]);

  /* --- IIR ao vivo -------------------------------------------------------- */
  const previaRisco = useMemo(() => {
    const fatores = FATORES.map(({ campo }) => Number(valores[campo]));
    if (fatores.some((fator) => !Number.isFinite(fator) || fator < 1 || fator > 5)) return null;

    const [severidade, probabilidade, exposicao, frequencia] = fatores as [number, number, number, number];
    const { valor } = calcularIir({ severidade, probabilidade, exposicao, frequencia });
    return { valor, faixa: classificarIir(valor), grau: grauRiscoPeloIir(valor) };
  }, [valores]);

  /* --- envio -------------------------------------------------------------- */
  const aoSalvar = handleSubmit(async (dados) => {
    // O token só vai no payload quando não temos o id da área.
    const payload = { ...dados, tokenQr: dados.areaId ? '' : dados.tokenQr };

    try {
      const salva = modoEdicao
        ? await api.put<ObservacaoApi>(`/observacoes/${id}`, payload)
        : await api.post<ObservacaoApi>('/observacoes', payload);

      setObservacao(salva);
      mostrar(modoEdicao ? 'Observação atualizada.' : 'Observação registrada. Indicadores atualizados.', 'sucesso');
      if (!modoEdicao) navegar(`/observacoes/${salva.id}`, { replace: true });
    } catch (erro) {
      if (erro instanceof ErroApi) {
        for (const [campo, mensagens] of Object.entries(erro.campos)) {
          setError(campo as Path<ObservacaoFormValues>, { type: 'server', message: mensagens[0] });
        }
        mostrar(erro.mensagemAmigavel(), 'erro');
        return;
      }
      mostrar('Falha inesperada ao salvar.', 'erro');
    }
  });

  /** Abre o plano de ação da observação, com prazo e destinatários da matriz. */
  async function abrirPlano() {
    if (!id) return;
    setAbrindoPlano(true);
    try {
      const plano = await api.post<{ id: string; codigo: string }>(`/observacoes/${id}/plano-acao`, {});
      mostrar(`Plano ${plano.codigo} aberto e notificações registradas.`, 'sucesso');
      navegar(`/planos-acao/${plano.id}`);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao abrir o plano.', 'erro');
    } finally {
      setAbrindoPlano(false);
    }
  }

  async function enviarFoto(arquivo: File) {
    if (!id) {
      mostrar('Salve a observacao antes de anexar a foto.', 'erro');
      return;
    }
    setEnviandoFoto(true);
    try {
      const atualizada = await api.upload<ObservacaoApi>(`/observacoes/${id}/foto`, arquivo);
      setObservacao(atualizada);
      setValue('fotoUrl', atualizada.fotoUrl ?? '', { shouldDirty: false });
      mostrar('Evidência anexada.', 'sucesso');
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao enviar a foto.', 'erro');
    } finally {
      setEnviandoFoto(false);
      if (inputFoto.current) inputFoto.current.value = '';
    }
  }

  if (carregando) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
        Carregando formulário...
      </div>
    );
  }

  interface EventoTimeline {
    quando: string;
    titulo: string;
    detalhe: string;
    tipo: string;
  }
  const [timeline, setTimeline] = useState<EventoTimeline[]>([]);

  useEffect(() => {
    if (!id) return;
    void api
      .get<{ eventos: EventoTimeline[] }>(`/observacoes/${id}/timeline`)
      .then((resposta) => setTimeline(resposta.eventos))
      .catch(() => setTimeline([]));
  }, [id, observacao]);

  const erro = (campo: keyof ObservacaoFormValues) => errors[campo]?.message as string | undefined;
  const causasDoTipo = causas.filter((causa) => causa.tipo === valores.tipo);
  const fotoAtual = urlAbsoluta(valores.fotoUrl);

  return (
    <>
      <Link className="link-voltar" to="/observacoes">
        ← Voltar para as observações
      </Link>

      <div className="page-head">
        <div>
          <h2>{modoEdicao ? 'Observação de campo' : 'Nova observação'}</h2>
          <p>
            {areaDoQr
              ? `QR lido: ${areaDoQr.nome} (${areaDoQr.codigo}) — cliente e área já identificados.`
              : 'Classifique o que foi observado. Nos desvios, a avaliação de risco define prazo e destinatários.'}
          </p>
        </div>
        {observacao?.comunicacao ? (
          <span className={`pill ${observacao.prazoVencido ? 'bad' : 'info'}`}>
            {observacao.comunicacao.acao} · {observacao.comunicacao.prazoRotulo}
          </span>
        ) : null}
      </div>

      <form onSubmit={aoSalvar} noValidate>
        <div className="layout-form">
          <div>
            <section className="painel">
              <h3><Icone nome="local" /> Onde e quando</h3>

              {areaDoQr ? (
                <div className="hint">
                  <Icone nome="telefone" /> <b>{areaDoQr.nome}</b> ({areaDoQr.codigo}) · {areaDoQr.cliente?.nomeFantasia}
                  {areaDoQr.riscos.length > 0 ? (
                    <div style={{ marginTop: 6, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {areaDoQr.riscos.map((risco) => (
                        <span className="pill gray" key={risco}>
                          {risco}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <Campo label="Área" obrigatorio erro={erro('areaId')}>
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
              )}

              <div className="row2">
                <Campo label="Data e hora" erro={erro('dataHora')}>
                  <input type="datetime-local" {...register('dataHora')} aria-invalid={Boolean(erro('dataHora'))} />
                </Campo>
                <Campo label="Observador" obrigatorio erro={erro('observador')}>
                  <input {...register('observador')} aria-invalid={Boolean(erro('observador'))} placeholder="Seu nome" />
                </Campo>
              </div>

              <Campo
                label="Terceiro envolvido"
                erro={erro('terceiroId')}
                ajuda="Preencha quando o desvio for de uma empresa contratada."
              >
                <select {...register('terceiroId')} disabled={terceiros.length === 0}>
                  <option value="">Nenhum / equipe própria</option>
                  {terceiros.map((terceiro) => (
                    <option key={terceiro.id} value={terceiro.id}>
                      {terceiro.nomeFantasia}
                    </option>
                  ))}
                </select>
              </Campo>
            </section>

            <section className="painel">
              <h3><Icone nome="etiqueta" /> Tipo da observação</h3>
              <p className="desc">
                É a primeira pergunta em campo. Define o que entra no ICS/ICI e se abre plano de ação.
              </p>

              <div className="tipo-grid">
                {tipos.map((item) => (
                  <button
                    type="button"
                    key={item.tipo}
                    className={`tipo-opt ${valores.tipo === item.tipo ? 'sel' : ''}`}
                    style={{ '--tc': item.cor, '--tb': `${item.cor}1a` } as React.CSSProperties}
                    onClick={() => setValue('tipo', item.tipo, { shouldDirty: true, shouldValidate: true })}
                  >
                    <span className="dotc" />
                    <span>
                      {item.rotulo}
                      <small>
                        {item.contaNoBbs ? 'entra no ICS/ICI' : 'fora do ICS/ICI'}
                        {item.abrePlanoDeAcao ? ' · abre plano' : ''}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
              {erro('tipo') ? (
                <div className="erro" role="alert">
                  {erro('tipo')}
                </div>
              ) : null}

              {tipoSelecionado?.exigeCausa ? (
                <Campo
                  label="Causa"
                  obrigatorio
                  erro={erro('causaId')}
                  ajuda="Catalogada — é ela que monta o Pareto."
                >
                  <select {...register('causaId')} aria-invalid={Boolean(erro('causaId'))}>
                    <option value="">Selecione a causa</option>
                    {causasDoTipo.map((causa) => (
                      <option key={causa.id} value={causa.id}>
                        {causa.descricao}
                        {causa.destinatarioSugerido ? ` → ${causa.destinatarioSugerido}` : ''}
                      </option>
                    ))}
                  </select>
                </Campo>
              ) : null}

              <Campo label="Descrição" obrigatorio erro={erro('descricao')}>
                <textarea
                  {...register('descricao')}
                  aria-invalid={Boolean(erro('descricao'))}
                  placeholder="O que foi observado, com detalhe suficiente para quem vai tratar."
                />
              </Campo>

              <Campo label="Ação imediata" erro={erro('acaoImediata')} ajuda="O que foi feito na hora.">
                <textarea {...register('acaoImediata')} placeholder="Atividade interrompida e colaborador orientado." />
              </Campo>
            </section>

            {tipoSelecionado && tipoSelecionado.exigeCausa ? (
              <section className="painel">
                <h3><Icone nome="alerta" /> Avaliação de risco</h3>
                <p className="desc">
                  IIR = Severidade × Probabilidade × Exposição × Frequência. Define o grau da ocorrência, o prazo e
                  quem é avisado. Preencha os quatro ou deixe todos em branco.
                </p>

                <div className="row2">
                  {FATORES.map((fator) => (
                    <Campo key={fator.campo} label={fator.rotulo} erro={erro(fator.campo)} ajuda={fator.ajuda}>
                      <select {...register(fator.campo)} aria-invalid={Boolean(erro(fator.campo))}>
                        <option value="">—</option>
                        {[1, 2, 3, 4, 5].map((valor) => (
                          <option key={valor} value={valor}>
                            {valor}
                          </option>
                        ))}
                      </select>
                    </Campo>
                  ))}
                </div>

                {previaRisco ? (
                  <div className="hint" style={{ background: `${previaRisco.faixa.cor}18`, color: previaRisco.faixa.cor }}>
                    <Farol cor={previaRisco.faixa.cor} /> <b>IIR {previaRisco.valor}</b> — {previaRisco.faixa.rotulo} · grau de risco{' '}
                    <b>{previaRisco.grau}</b>
                  </div>
                ) : null}

                <Campo
                  label="Classificação (Pirâmide de Bird)"
                  erro={erro('classificacaoBird')}
                  ajuda="Preencha apenas se a observação virou ocorrência."
                >
                  <select {...register('classificacaoBird')}>
                    <option value="">Não se aplica</option>
                    {CLASSIFICACOES_BIRD_OCORRENCIA.map((classificacao) => {
                      const definicao = DEFINICOES_BIRD.find((item) => item.classificacao === classificacao)!;
                      return (
                        <option key={classificacao} value={classificacao}>
                          {definicao.codigo} — {definicao.rotulo}
                        </option>
                      );
                    })}
                  </select>
                </Campo>
              </section>
            ) : null}

            <section className="painel" style={{ paddingBottom: 0 }}>
              <h3><Icone nome="camera" /> Evidência e localização</h3>
              <p className="desc">
                {tipoSelecionado?.exigeFoto
                  ? 'Foto obrigatória para este tipo — é o que sustenta o plano de ação e a auditoria.'
                  : 'Foto opcional para este tipo.'}
              </p>

              <div className="row2">
                <Campo label="Foto da evidência" erro={erro('fotoUrl')}>
                  <div className="logo-box">
                    <div className="logo-preview">
                      {fotoAtual ? <img src={fotoAtual} alt="Evidência" /> : <span aria-hidden="true"><Icone nome="camera" /></span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        ref={inputFoto}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={(evento) => {
                          const arquivo = evento.target.files?.[0];
                          if (arquivo) void enviarFoto(arquivo);
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={!modoEdicao || enviandoFoto}
                        onClick={() => inputFoto.current?.click()}
                      >
                        {enviandoFoto ? 'Enviando...' : 'Anexar foto'}
                      </button>
                      {!modoEdicao ? <span className="ajuda">Salve para habilitar o anexo.</span> : null}
                    </div>
                  </div>
                </Campo>

                <Campo label="Localização (GPS)" erro={erro('latitude') ?? erro('longitude')}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={capturarGps}>
                      <Icone nome="local" /> Capturar
                    </button>
                    {valores.latitude && valores.longitude ? (
                      <span className="pill info">
                        {Number(valores.latitude).toFixed(5)}, {Number(valores.longitude).toFixed(5)}
                      </span>
                    ) : (
                      <span className="ajuda">Não capturada</span>
                    )}
                  </div>
                  <input type="hidden" {...register('latitude')} />
                  <input type="hidden" {...register('longitude')} />
                </Campo>
              </div>

              <Campo label="Situação" erro={erro('situacao')}>
                <select {...register('situacao')}>
                  {SITUACOES_OBSERVACAO.map((valor) => (
                    <option key={valor} value={valor}>
                      {ROTULO_SITUACAO_OBSERVACAO[valor]}
                    </option>
                  ))}
                </select>
              </Campo>

              <div className="barra-acoes rodape-form">
                <span className="aviso">
                  {modoEdicao && observacao
                    ? `Registrada em ${formatarDataHora(observacao.criadoEm)}`
                    : 'Campos marcados com * são obrigatórios.'}
                </span>
                <button type="button" className="btn btn-ghost" onClick={() => navegar('/observacoes')}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Salvando...' : modoEdicao ? 'Salvar alterações' : 'Registrar observação'}
                </button>
              </div>
            </section>
          </div>

          <aside className="coluna-previa">
            <div className="painel">
              <h3><Icone nome="envelope" /> Comunicação automática</h3>
              <p className="desc">Quem é avisado, por qual canal e em que prazo — pela matriz de comunicação.</p>

              {!observacao?.comunicacao ? (
                <p className="ajuda">
                  {tipoSelecionado && !tipoSelecionado.abrePlanoDeAcao
                    ? 'Este tipo de observação não dispara comunicação automática.'
                    : 'Salve a observação para ver o plano de comunicação resolvido.'}
                </p>
              ) : (
                <>
                  <dl className="resumo-lateral">
                    <dt>Ação requerida</dt>
                    <dd>{observacao.comunicacao.acao}</dd>
                    <dt>Prazo</dt>
                    <dd style={{ color: observacao.prazoVencido ? 'var(--red)' : undefined }}>
                      {observacao.comunicacao.prazoRotulo}
                      {observacao.prazoLimite ? ` · até ${formatarDataHora(observacao.prazoLimite)}` : ''}
                      {observacao.prazoVencido ? ' — vencido' : ''}
                    </dd>
                    <dt>Canais</dt>
                    <dd>
                      {observacao.comunicacao.email ? 'e-mail' : ''}
                      {observacao.comunicacao.whatsapp === 'OBRIGATORIO'
                        ? ' · WhatsApp'
                        : observacao.comunicacao.whatsapp === 'OPCIONAL'
                          ? ' · WhatsApp (opcional)'
                          : ''}
                    </dd>
                    <dt>Destinatários</dt>
                    <dd>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {observacao.comunicacao.destinatarios.map((destinatario) => (
                          <span className="pill gray" key={destinatario}>
                            {destinatario.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </dd>
                    {observacao.escalonamento ? (
                      <>
                        <dt>Escalonamento</dt>
                        <dd style={{ color: observacao.escalonamento.vencida ? 'var(--red)' : undefined }}>
                          {observacao.escalonamento.rotuloNivel}
                          {observacao.escalonamento.vencida ? ' (prazo estourado)' : ' (dentro do prazo)'}
                        </dd>
                      </>
                    ) : null}
                  </dl>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ marginTop: 12 }}
                    disabled={abrindoPlano}
                    onClick={() => void abrirPlano()}
                  >
                    {abrindoPlano ? 'Abrindo...' : 'Abrir plano de ação'}
                  </button>

                  <div className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
                    <Icone nome="alerta" /> Abrir o plano registra as notificações desta matriz. O disparo real de e-mail e WhatsApp
                    depende do provedor — hoje elas ficam como <b>simuladas</b>.
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      </form>

      {modoEdicao && timeline.length > 0 ? (
        <div className="painel">
          <h3><Icone nome="relogio" /> Linha do tempo da ocorrência</h3>
          <p className="desc">
            Registro → comunicação → plano → tratativa → evidência → encerramento. Tudo derivado dos dados reais — é a
            rastreabilidade que sustenta auditoria e investigação.
          </p>
          <div className="timeline">
            {timeline.map((evento, indice) => (
              <div className={`timeline-evento ${evento.tipo.toLowerCase()}`} key={`${evento.tipo}-${indice}`}>
                <div className="timeline-quando">{formatarDataHora(evento.quando)}</div>
                <div className="timeline-titulo">{evento.titulo}</div>
                <div className="timeline-detalhe">{evento.detalhe}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
