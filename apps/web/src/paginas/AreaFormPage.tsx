import { useCallback, useEffect, useRef, useState } from 'react';
import { Icone } from '../componentes/Icone';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, type Path, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { areaCreateSchema, type AreaFormValues } from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import { MASCARAS, type NomeMascara } from '../lib/mascaras';
import { formatarDataHora } from '../lib/datas';
import { PILL_CRITICIDADE_AREA, VALORES_INICIAIS_AREA, areaParaFormulario, type AreaApi } from '../lib/area-form';

interface Referencias {
  tiposArea: Array<{ valor: string; rotulo: string }>;
  criticidadesArea: Array<{ valor: string; rotulo: string; frequenciaSugeridaDias: number }>;
  situacoesArea: Array<{ valor: string; rotulo: string }>;
  riscosSugeridos: string[];
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
  tiposArea: [],
  criticidadesArea: [],
  situacoesArea: [],
  riscosSugeridos: [],
};

function textoValor(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'sim' : 'nao';
  return String(valor);
}

export function AreaFormPage() {
  const { id } = useParams<{ id: string }>();
  const [parametros] = useSearchParams();
  const navegar = useNavigate();
  const { mostrar } = useToast();

  const modoEdicao = Boolean(id);
  const [carregando, setCarregando] = useState(modoEdicao);
  const [area, setArea] = useState<AreaApi | null>(null);
  const [referencias, setReferencias] = useState<Referencias>(REFERENCIAS_VAZIAS);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [aba, setAba] = useState<'cadastro' | 'historico'>('cadastro');
  const [auditoria, setAuditoria] = useState<RegistroAuditoria[]>([]);
  const [regenerando, setRegenerando] = useState(false);
  // Muda a query do <img> para forçar o recarregamento do SVG após regenerar.
  const versaoQr = useRef(0);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<AreaFormValues>({
    defaultValues: { ...VALORES_INICIAIS_AREA, clienteId: parametros.get('clienteId') ?? '' },
    resolver: zodResolver(areaCreateSchema) as unknown as Resolver<AreaFormValues>,
    mode: 'onBlur',
  });

  const valores = watch();

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
        const atual = await api.get<AreaApi>(`/areas/${id}`);
        if (!ativo) return;
        setArea(atual);
        reset(areaParaFormulario(atual));
      } catch (erro) {
        if (ativo) {
          mostrar(erro instanceof Error ? erro.message : 'Area nao encontrada.', 'erro');
          navegar('/areas', { replace: true });
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
      setAuditoria(await api.get<RegistroAuditoria[]>(`/areas/${id}/auditoria?limite=50`));
    } catch {
      setAuditoria([]);
    }
  }, [id]);

  useEffect(() => {
    if (aba === 'historico') void carregarAuditoria();
  }, [aba, carregarAuditoria]);

  const comMascara = (campo: Path<AreaFormValues>, mascara: NomeMascara) => {
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
      const salva = modoEdicao
        ? await api.put<AreaApi>(`/areas/${id}`, dados)
        : await api.post<AreaApi>('/areas', dados);

      setArea(salva);
      reset(areaParaFormulario(salva));
      mostrar(modoEdicao ? 'Área atualizada.' : `Área ${salva.nome} cadastrada — QR Code gerado.`, 'sucesso');

      if (!modoEdicao) navegar(`/areas/${salva.id}`, { replace: true });
    } catch (erro) {
      if (erro instanceof ErroApi) {
        for (const [campo, mensagens] of Object.entries(erro.campos)) {
          setError(campo as Path<AreaFormValues>, { type: 'server', message: mensagens[0] });
        }
        mostrar(erro.mensagemAmigavel(), 'erro');
        return;
      }
      mostrar('Falha inesperada ao salvar.', 'erro');
    }
  });

  async function regenerarQr() {
    if (!id) return;
    const confirmado = window.confirm(
      'Emitir um novo QR Code para esta área?\n\n' +
        'As placas já impressas param de funcionar e precisam ser substituídas. ' +
        'Use apenas se o QR atual foi comprometido.',
    );
    if (!confirmado) return;

    setRegenerando(true);
    try {
      const atualizada = await api.post<AreaApi>(`/areas/${id}/qrcode/regenerar`, {});
      setArea(atualizada);
      versaoQr.current += 1;
      mostrar('Novo QR Code emitido. Reimprima a placa.', 'sucesso');
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao regenerar o QR Code.', 'erro');
    } finally {
      setRegenerando(false);
    }
  }

  if (carregando) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
        Carregando área...
      </div>
    );
  }

  const erro = (campo: keyof AreaFormValues) => errors[campo]?.message as string | undefined;
  const criticidadeSelecionada = referencias.criticidadesArea.find((item) => item.valor === valores.criticidade);
  const frequenciaInformada = Number(valores.frequenciaInspecaoDias || 0);
  const frequenciaAcimaDoSugerido =
    Boolean(criticidadeSelecionada) && frequenciaInformada > (criticidadeSelecionada?.frequenciaSugeridaDias ?? 0);

  return (
    <>
      <Link className="link-voltar" to="/areas">
        ← Voltar para a lista de áreas
      </Link>

      <div className="page-head">
        <div>
          <h2>{modoEdicao ? valores.nome || 'Editar área' : 'Nova área'}</h2>
          <p>
            {modoEdicao
              ? 'Alterações ficam registradas na trilha de auditoria. O QR Code só muda se você emitir um novo.'
              : 'Ponto de leitura da inspeção. Ao salvar, o QR Code é gerado automaticamente.'}
          </p>
        </div>
        {modoEdicao && area ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={`pill ${PILL_CRITICIDADE_AREA[area.criticidade]}`}>{area.rotulos.criticidade}</span>
            {area.exigePermissaoTrabalho ? <span className="pill bad">exige PT</span> : null}
            {area.exigeAutorizacaoEntrada ? <span className="pill warn">acesso controlado</span> : null}
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
                <h3><Icone nome="local" /> Identificação</h3>
                <p className="desc">Onde a área fica e como ela aparece na placa e nos relatórios.</p>

                <Campo label="Cliente" obrigatorio erro={erro('clienteId')}>
                  <select {...register('clienteId')} aria-invalid={Boolean(erro('clienteId'))}>
                    <option value="">Selecione o cliente</option>
                    {clientes.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.nomeFantasia} · contrato {cliente.numeroContrato}
                      </option>
                    ))}
                  </select>
                </Campo>

                <div className="row2">
                  <Campo label="Nome da área" obrigatorio erro={erro('nome')}>
                    <input {...register('nome')} aria-invalid={Boolean(erro('nome'))} placeholder="Britagem — Planta 2" />
                  </Campo>
                  <Campo
                    label="Código"
                    obrigatorio
                    erro={erro('codigo')}
                    ajuda="Impresso na placa. Único por cliente, vira maiúsculas."
                  >
                    <input {...register('codigo')} aria-invalid={Boolean(erro('codigo'))} placeholder="BRT-P2" />
                  </Campo>
                </div>

                <div className="row3">
                  <Campo label="Setor / planta" erro={erro('setor')} ajuda="Agrupamento livre dentro do cliente.">
                    <input {...register('setor')} placeholder="Planta 2" />
                  </Campo>
                  <Campo label="Tipo" obrigatorio erro={erro('tipo')}>
                    <select {...register('tipo')} aria-invalid={Boolean(erro('tipo'))}>
                      <option value="">Selecione</option>
                      {referencias.tiposArea.map((tipo) => (
                        <option key={tipo.valor} value={tipo.valor}>
                          {tipo.rotulo}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo label="Situação" erro={erro('situacao')} ajuda="Área inativa recusa a leitura do QR.">
                    <select {...register('situacao')}>
                      {referencias.situacoesArea.map((situacao) => (
                        <option key={situacao.valor} value={situacao.valor}>
                          {situacao.rotulo}
                        </option>
                      ))}
                    </select>
                  </Campo>
                </div>

                <Campo label="Descrição" erro={erro('descricao')}>
                  <textarea {...register('descricao')} placeholder="O que existe na área e o que deve ser observado." />
                </Campo>
              </section>

              <section className="painel">
                <h3><Icone nome="alerta" /> Risco e controle de acesso</h3>
                <p className="desc">
                  Define a prioridade da inspeção e o que o inspetor precisa saber antes de entrar.
                </p>

                <div className="row2">
                  <Campo label="Criticidade" obrigatorio erro={erro('criticidade')}>
                    <select {...register('criticidade')} aria-invalid={Boolean(erro('criticidade'))}>
                      <option value="">Selecione</option>
                      {referencias.criticidadesArea.map((item) => (
                        <option key={item.valor} value={item.valor}>
                          {item.rotulo} — inspeção sugerida a cada {item.frequenciaSugeridaDias} dias
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo
                    label="Frequência de inspeção (dias)"
                    erro={erro('frequenciaInspecaoDias')}
                    ajuda={
                      criticidadeSelecionada
                        ? `Sugerido para ${criticidadeSelecionada.rotulo.toLowerCase()}: ${criticidadeSelecionada.frequenciaSugeridaDias} dias.`
                        : 'De 1 a 365 dias.'
                    }
                  >
                    <input type="number" min="1" max="365" {...register('frequenciaInspecaoDias')} />
                  </Campo>
                </div>

                {frequenciaAcimaDoSugerido ? (
                  <div className="hint alerta">
                    <Icone nome="alerta" /> A frequência informada ({frequenciaInformada} dias) é maior que a sugerida para esta criticidade (
                    {criticidadeSelecionada?.frequenciaSugeridaDias} dias). Você pode salvar assim — é só um alerta.
                  </div>
                ) : null}

                <Campo
                  label="Riscos presentes"
                  erro={erro('riscosPresentes')}
                  ajuda="Separe por ponto e vírgula. Ex.: Ruido; Poeira; Trabalho em altura"
                >
                  <input {...register('riscosPresentes')} list="riscos-sugeridos" placeholder="Ruido; Poeira; Maquinas" />
                  <datalist id="riscos-sugeridos">
                    {referencias.riscosSugeridos.map((risco) => (
                      <option key={risco} value={risco} />
                    ))}
                  </datalist>
                </Campo>

                <div className="row2">
                  <label className="check-linha">
                    <input type="checkbox" {...register('exigeAutorizacaoEntrada')} />
                    Exige autorização de entrada
                  </label>
                  <label className="check-linha">
                    <input type="checkbox" {...register('exigePermissaoTrabalho')} />
                    Exige permissão de trabalho (PT)
                  </label>
                </div>
              </section>

              <section className="painel">
                <h3><Icone nome="pessoa" /> Responsável pela área</h3>
                <p className="desc">Quem recebe a notificação quando uma observação é registrada aqui.</p>

                <div className="row2">
                  <Campo label="Nome" erro={erro('responsavelNome')}>
                    <input {...register('responsavelNome')} placeholder="Joao Amaral" />
                  </Campo>
                  <Campo label="Cargo" erro={erro('responsavelCargo')}>
                    <input {...register('responsavelCargo')} placeholder="Supervisor de Producao" />
                  </Campo>
                </div>

                <div className="row2">
                  <Campo label="E-mail" erro={erro('responsavelEmail')}>
                    <input type="email" {...register('responsavelEmail')} />
                  </Campo>
                  <Campo label="Telefone" erro={erro('responsavelTelefone')}>
                    <input
                      {...comMascara('responsavelTelefone', 'telefone')}
                      value={valores.responsavelTelefone}
                      placeholder="(62) 3222-1010"
                    />
                  </Campo>
                </div>
              </section>

              <section className="painel" style={{ paddingBottom: 0 }}>
                <h3><Icone nome="mapa" /> Localização física</h3>
                <p className="desc">
                  As coordenadas da placa permitem conferir o GPS capturado na observação — evidência de que a inspeção
                  aconteceu no local.
                </p>

                <div className="row3">
                  <Campo label="Latitude" erro={erro('latitude')}>
                    <input type="number" step="0.0000001" {...register('latitude')} placeholder="-16.6864" />
                  </Campo>
                  <Campo label="Longitude" erro={erro('longitude')}>
                    <input type="number" step="0.0000001" {...register('longitude')} placeholder="-49.2643" />
                  </Campo>
                  <Campo label="Ponto de referência" erro={erro('pontoReferencia')}>
                    <input {...register('pontoReferencia')} placeholder="Ao lado do transportador TC-04" />
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
                        : `Última atualização: ${formatarDataHora(area?.atualizadoEm)}`
                      : 'Campos marcados com * são obrigatórios.'}
                  </span>
                  <button type="button" className="btn btn-ghost" onClick={() => navegar('/areas')}>
                    Cancelar
                  </button>
                  {modoEdicao ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={isSubmitting || !isDirty}
                      onClick={() => area && reset(areaParaFormulario(area))}
                    >
                      Descartar alterações
                    </button>
                  ) : null}
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Salvando...' : modoEdicao ? 'Salvar alterações' : 'Cadastrar área'}
                  </button>
                </div>
              </section>
            </div>

            <aside className="coluna-previa">
              <div className="painel">
                <h3><Icone nome="telefone" /> QR Code da área</h3>
                <p className="desc">
                  {modoEdicao
                    ? 'Imprima e fixe na área. Ao ler, o formulário de observação abre já identificado.'
                    : 'Gerado automaticamente quando você salvar o cadastro.'}
                </p>

                {!modoEdicao || !area ? (
                  <div className="vazio" style={{ padding: '26px 8px' }}>
                    <div className="icone-vazio" aria-hidden="true">
              <Icone nome="telefone" tamanho={22} />
            </div>
                    <p>Salve a área para gerar o QR Code.</p>
                  </div>
                ) : (
                  <>
                    <div className="placa-qr">
                      <div className="placa-cab">
                        <div className="placa-cliente">{area.cliente?.nomeFantasia ?? ''}</div>
                        <div className="placa-nome">{area.nome}</div>
                        <div className="placa-codigo">{area.codigo}</div>
                      </div>
                      <img
                        src={`${area.urlQrCode}?v=${versaoQr.current}`}
                        alt={`QR Code da área ${area.nome}`}
                        className="placa-img"
                      />
                      <div className="placa-rodape">
                        <b>Aponte a câmera para registrar uma observação</b>
                        <div className="placa-token">{area.tokenQr}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                      <a className="btn btn-outline btn-sm" href={area.urlInspecao} target="_blank" rel="noreferrer">
                        Abrir link
                      </a>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()}>
                        <Icone nome="impressora" /> Imprimir
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={regenerando}
                        onClick={() => void regenerarQr()}
                      >
                        {regenerando ? 'Emitindo...' : 'Emitir novo QR'}
                      </button>
                    </div>

                    <dl className="resumo-lateral">
                      <dt>Link gravado</dt>
                      <dd style={{ fontWeight: 400, fontSize: 11.5, wordBreak: 'break-all' }}>{area.urlInspecao}</dd>
                      <dt>Inspeção</dt>
                      <dd>a cada {area.frequenciaInspecaoDias} dias</dd>
                      {area.formatado.coordenadas ? (
                        <>
                          <dt>Coordenadas</dt>
                          <dd style={{ fontWeight: 400 }}>{area.formatado.coordenadas}</dd>
                        </>
                      ) : null}
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
