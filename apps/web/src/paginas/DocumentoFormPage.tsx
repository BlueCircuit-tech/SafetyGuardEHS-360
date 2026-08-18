import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm, type Path, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ABRANGENCIAS_DOCUMENTO,
  CATALOGO_DOCUMENTOS,
  ROTULO_ABRANGENCIA_DOCUMENTO,
  ROTULO_SITUACAO_DOCUMENTO,
  SITUACOES_DOCUMENTO,
  calcularValidade,
  definicaoDoDocumento,
  documentoCreateSchema,
  type AbrangenciaDocumento,
  type DocumentoFormValues,
  type TipoDocumento,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { formatarDataHora, formatarDataIso } from '../lib/datas';
import { PILL_VENCIMENTO, textoPrazo, type DocumentoApi } from '../lib/saude';
import { useSessao } from '../lib/sessao';

interface Opcao {
  id: string;
  nomeFantasia?: string;
  nome?: string;
  codigo?: string;
  cpfFormatado?: string;
}

interface RegistroAuditoria {
  id: string;
  acao: string;
  autor: string | null;
  criadoEm: string;
  alteracoes: Record<string, { de: unknown; para: unknown }> | null;
}

const VALORES_INICIAIS: DocumentoFormValues = {
  clienteId: '',
  abrangencia: 'CLIENTE',
  areaId: '',
  terceiroId: '',
  colaboradorId: '',
  tipo: 'PGR',
  titulo: '',
  numero: '',
  revisao: '',
  descricao: '',
  dataEmissao: '',
  validade: '',
  responsavelNome: '',
  responsavelRegistro: '',
  numeroArt: '',
  situacao: 'ATIVO',
  observacoes: '',
};

function paraFormulario(documento: DocumentoApi): DocumentoFormValues {
  return {
    clienteId: documento.clienteId,
    abrangencia: documento.abrangencia,
    areaId: documento.areaId ?? '',
    terceiroId: documento.terceiroId ?? '',
    colaboradorId: documento.colaboradorId ?? '',
    tipo: documento.tipo,
    titulo: documento.titulo,
    numero: documento.numero ?? '',
    revisao: documento.revisao ?? '',
    descricao: documento.descricao ?? '',
    dataEmissao: documento.dataEmissao.slice(0, 10),
    validade: documento.validade?.slice(0, 10) ?? '',
    responsavelNome: documento.responsavelNome ?? '',
    responsavelRegistro: documento.responsavelRegistro ?? '',
    numeroArt: documento.numeroArt ?? '',
    situacao: documento.situacao,
    observacoes: documento.observacoes ?? '',
  };
}

function textoValor(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'sim' : 'nao';
  return String(valor);
}

export function DocumentoFormPage() {
  const { id } = useParams<{ id: string }>();
  const navegar = useNavigate();
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('saude:escrever');

  const modoEdicao = Boolean(id);
  const [carregando, setCarregando] = useState(modoEdicao);
  const [documento, setDocumento] = useState<DocumentoApi | null>(null);
  const [clientes, setClientes] = useState<Opcao[]>([]);
  const [terceiros, setTerceiros] = useState<Opcao[]>([]);
  const [areas, setAreas] = useState<Opcao[]>([]);
  const [colaboradores, setColaboradores] = useState<Opcao[]>([]);
  const [aba, setAba] = useState<'cadastro' | 'historico'>('cadastro');
  const [auditoria, setAuditoria] = useState<RegistroAuditoria[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DocumentoFormValues>({
    defaultValues: VALORES_INICIAIS,
    resolver: zodResolver(documentoCreateSchema) as unknown as Resolver<DocumentoFormValues>,
    mode: 'onBlur',
  });

  const valores = watch();
  const definicao = definicaoDoDocumento((valores.tipo || 'OUTRO') as TipoDocumento);

  useEffect(() => {
    api
      .get<Opcao[]>('/clientes/opcoes?incluirInativos=true')
      .then(setClientes)
      .catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    if (!valores.clienteId) {
      setTerceiros([]);
      setAreas([]);
      setColaboradores([]);
      return;
    }

    void api
      .get<{ itens: Opcao[] }>(`/terceiros?clienteId=${valores.clienteId}&porPagina=200`)
      .then((resposta) => setTerceiros(resposta.itens))
      .catch(() => setTerceiros([]));

    void api
      .get<{ itens: Opcao[] }>(`/areas?clienteId=${valores.clienteId}&porPagina=200`)
      .then((resposta) => setAreas(resposta.itens))
      .catch(() => setAreas([]));

    void api
      .get<Opcao[]>(`/colaboradores/opcoes?clienteId=${valores.clienteId}`)
      .then(setColaboradores)
      .catch(() => setColaboradores([]));
  }, [valores.clienteId]);

  const carregar = useCallback(async () => {
    if (!id) return;
    setCarregando(true);
    try {
      const dados = await api.get<DocumentoApi>(`/documentos/${id}`);
      setDocumento(dados);
      reset(paraFormulario(dados));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar o documento.', 'erro');
      navegar('/documentos');
    } finally {
      setCarregando(false);
    }
  }, [id, mostrar, navegar, reset]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (aba !== 'historico' || !id) return;
    void api
      .get<RegistroAuditoria[]>(`/documentos/${id}/auditoria`)
      .then(setAuditoria)
      .catch(() => setAuditoria([]));
  }, [aba, id]);

  /** Ao escolher tipo e emissão, sugere a validade pelo prazo do catálogo. */
  function sugerirValidade(tipo: TipoDocumento, emissao: string): void {
    if (!emissao) return;
    const { validadeMeses } = definicaoDoDocumento(tipo);
    if (!validadeMeses) {
      setValue('validade', '');
      return;
    }

    const calculada = calcularValidade(new Date(`${emissao}T00:00:00`), validadeMeses);
    setValue('validade', calculada.toISOString().slice(0, 10));
  }

  async function salvar(dados: DocumentoFormValues) {
    try {
      if (modoEdicao) {
        await api.put(`/documentos/${id}`, dados);
        mostrar('Documento atualizado.', 'sucesso');
        void carregar();
      } else {
        const criado = await api.post<{ id: string }>('/documentos', dados);
        mostrar('Documento cadastrado.', 'sucesso');
        navegar(`/documentos/${criado.id}`);
      }
    } catch (erro) {
      if (erro instanceof ErroApi && Object.keys(erro.campos).length > 0) {
        for (const [campo, mensagens] of Object.entries(erro.campos)) {
          setError(campo as Path<DocumentoFormValues>, { message: mensagens[0] });
        }
      }
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao salvar.', 'erro');
    }
  }

  async function anexar(arquivo: File) {
    if (!id) return;
    try {
      await api.upload(`/documentos/${id}/arquivo`, arquivo);
      mostrar('Arquivo anexado.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao anexar.', 'erro');
    }
  }

  async function registrarRevisao() {
    if (!id || !documento) return;
    const revisao = window.prompt('Número da nova revisão:', String(Number(documento.revisao ?? '0') + 1).padStart(2, '0'));
    if (revisao === null) return;

    try {
      const novo = await api.post<{ id: string }>(`/documentos/${id}/revisao`, { revisao });
      mostrar('Revisão criada. A versão anterior ficou como substituída.', 'sucesso');
      navegar(`/documentos/${novo.id}`);
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao revisar.', 'erro');
    }
  }

  if (carregando) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
        Carregando...
      </div>
    );
  }

  const abrangencia = valores.abrangencia as AbrangenciaDocumento;

  return (
    <>
      <Link className="link-voltar" to="/documentos">
        ← Voltar para documentos
      </Link>

      {documento ? (
        <div className="painel">
          <h3>{documento.titulo}</h3>
          <p className="desc">
            {definicaoDoDocumento(documento.tipo).descricao}
            {documento.numero ? ` · ${documento.numero}` : ''}
          </p>

          <div className="stat-grid">
            <div className="stat">
              <b>
                <span className={`pill ${PILL_VENCIMENTO[documento.situacaoVencimento]}`}>
                  {documento.validade ? formatarDataIso(documento.validade) : 'sem prazo'}
                </span>
              </b>
              <span>{textoPrazo(documento.diasParaVencer)}</span>
            </div>
            <div className="stat">
              <b>{formatarDataIso(documento.dataEmissao)}</b>
              <span>emissão</span>
            </div>
            <div className="stat">
              <b>{ROTULO_SITUACAO_DOCUMENTO[documento.situacao]}</b>
              <span>situação {documento.revisao ? `· rev. ${documento.revisao}` : ''}</span>
            </div>
            <div className="stat">
              <b>{documento.responsavelNome ?? '—'}</b>
              <span>responsável técnico {documento.responsavelRegistro ?? ''}</span>
            </div>
          </div>

          <div className="barra-acoes">
            {documento.arquivoUrl ? (
              <a className="btn btn-outline" href={urlAbsoluta(documento.arquivoUrl) ?? '#'} target="_blank" rel="noreferrer">
                Abrir arquivo
              </a>
            ) : null}
            {podeEscrever ? (
              <>
                <label className="btn btn-outline">
                  {documento.arquivoUrl ? 'Substituir arquivo' : 'Anexar arquivo'}
                  <input
                    type="file"
                    hidden
                    accept="application/pdf,image/*"
                    onChange={(evento) => {
                      const arquivo = evento.target.files?.[0];
                      if (arquivo) void anexar(arquivo);
                    }}
                  />
                </label>
                {documento.situacao === 'ATIVO' ? (
                  <button type="button" className="btn btn-outline" onClick={() => void registrarRevisao()}>
                    Registrar revisão
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {modoEdicao ? (
        <div className="abas">
          <button type="button" className={aba === 'cadastro' ? 'ativa' : ''} onClick={() => setAba('cadastro')}>
            Cadastro
          </button>
          <button type="button" className={aba === 'historico' ? 'ativa' : ''} onClick={() => setAba('historico')}>
            Histórico
          </button>
        </div>
      ) : null}

      {aba === 'cadastro' ? (
        <form className="painel" onSubmit={handleSubmit(salvar)} noValidate>
          <h3>{modoEdicao ? 'Dados do documento' : 'Novo documento'}</h3>

          <div className="filtros">
            <Campo label="Cliente" htmlFor="clienteId" obrigatorio erro={errors.clienteId?.message}>
              <select id="clienteId" {...register('clienteId')} disabled={modoEdicao}>
                <option value="">Selecione...</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nomeFantasia}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Abrangência" htmlFor="abrangencia" obrigatorio erro={errors.abrangencia?.message}>
              <select id="abrangencia" {...register('abrangencia')}>
                {ABRANGENCIAS_DOCUMENTO.map((item) => (
                  <option key={item} value={item}>
                    {ROTULO_ABRANGENCIA_DOCUMENTO[item]}
                  </option>
                ))}
              </select>
            </Campo>

            {abrangencia === 'AREA' ? (
              <Campo label="Área" htmlFor="areaId" obrigatorio erro={errors.areaId?.message}>
                <select id="areaId" {...register('areaId')}>
                  <option value="">Selecione...</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.codigo ? `${area.codigo} — ` : ''}
                      {area.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            ) : null}

            {abrangencia === 'TERCEIRO' ? (
              <Campo label="Empresa contratada" htmlFor="terceiroId" obrigatorio erro={errors.terceiroId?.message}>
                <select id="terceiroId" {...register('terceiroId')}>
                  <option value="">Selecione...</option>
                  {terceiros.map((terceiro) => (
                    <option key={terceiro.id} value={terceiro.id}>
                      {terceiro.nomeFantasia}
                    </option>
                  ))}
                </select>
              </Campo>
            ) : null}

            {abrangencia === 'COLABORADOR' ? (
              <Campo label="Colaborador" htmlFor="colaboradorId" obrigatorio erro={errors.colaboradorId?.message}>
                <select id="colaboradorId" {...register('colaboradorId')}>
                  <option value="">Selecione...</option>
                  {colaboradores.map((colaborador) => (
                    <option key={colaborador.id} value={colaborador.id}>
                      {colaborador.nome} — {colaborador.cpfFormatado}
                    </option>
                  ))}
                </select>
              </Campo>
            ) : null}
          </div>

          <div className="filtros">
            <Campo
              label="Tipo"
              htmlFor="tipo"
              obrigatorio
              erro={errors.tipo?.message}
              ajuda={
                definicao.validadeMeses
                  ? `${definicao.descricao} · validade típica ${definicao.validadeMeses} meses`
                  : `${definicao.descricao} · sem prazo padrão`
              }
            >
              <select
                id="tipo"
                {...register('tipo')}
                onChange={(evento) => {
                  const tipo = evento.target.value as TipoDocumento;
                  setValue('tipo', tipo);
                  sugerirValidade(tipo, valores.dataEmissao);
                }}
              >
                {CATALOGO_DOCUMENTOS.map((item) => (
                  <option key={item.tipo} value={item.tipo}>
                    {item.rotulo}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Título" htmlFor="titulo" obrigatorio erro={errors.titulo?.message}>
              <input id="titulo" className="busca" {...register('titulo')} />
            </Campo>

            <Campo label="Número / protocolo" htmlFor="numero" erro={errors.numero?.message}>
              <input id="numero" className="estreito" {...register('numero')} />
            </Campo>

            <Campo label="Revisão" htmlFor="revisao" erro={errors.revisao?.message}>
              <input id="revisao" className="estreito" {...register('revisao')} />
            </Campo>
          </div>

          <div className="filtros">
            <Campo label="Emissão" htmlFor="dataEmissao" obrigatorio erro={errors.dataEmissao?.message}>
              <input
                id="dataEmissao"
                type="date"
                {...register('dataEmissao')}
                onChange={(evento) => {
                  setValue('dataEmissao', evento.target.value);
                  if (!valores.validade) sugerirValidade(valores.tipo as TipoDocumento, evento.target.value);
                }}
              />
            </Campo>

            <Campo
              label="Validade"
              htmlFor="validade"
              erro={errors.validade?.message}
              ajuda="Em branco = sem prazo (PPP, procedimento)."
            >
              <input id="validade" type="date" {...register('validade')} />
            </Campo>

            <Campo label="Situação" htmlFor="situacao" erro={errors.situacao?.message}>
              <select id="situacao" className="estreito" {...register('situacao')}>
                {SITUACOES_DOCUMENTO.map((item) => (
                  <option key={item} value={item}>
                    {ROTULO_SITUACAO_DOCUMENTO[item]}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="filtros">
            <Campo
              label="Responsável técnico"
              htmlFor="responsavelNome"
              obrigatorio={definicao.exigeResponsavelTecnico}
              erro={errors.responsavelNome?.message}
              ajuda={definicao.exigeResponsavelTecnico ? 'Este tipo exige responsável técnico.' : undefined}
            >
              <input id="responsavelNome" className="busca" {...register('responsavelNome')} />
            </Campo>

            <Campo label="Registro (CREA/CRM/CRT)" htmlFor="responsavelRegistro" erro={errors.responsavelRegistro?.message}>
              <input id="responsavelRegistro" {...register('responsavelRegistro')} />
            </Campo>

            <Campo label="Número da ART" htmlFor="numeroArt" erro={errors.numeroArt?.message}>
              <input id="numeroArt" {...register('numeroArt')} />
            </Campo>
          </div>

          <Campo label="Descrição" htmlFor="descricao" erro={errors.descricao?.message}>
            <textarea id="descricao" rows={3} {...register('descricao')} />
          </Campo>

          <Campo label="Observações" htmlFor="observacoes" erro={errors.observacoes?.message}>
            <textarea id="observacoes" rows={2} {...register('observacoes')} />
          </Campo>

          {podeEscrever ? (
            <div className="barra-acoes">
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : modoEdicao ? 'Salvar alterações' : 'Cadastrar documento'}
              </button>
              <Link className="btn btn-ghost" to="/documentos">
                Cancelar
              </Link>
            </div>
          ) : (
            <p className="hint">Seu perfil pode consultar, mas não editar este cadastro.</p>
          )}
        </form>
      ) : (
        <div className="painel">
          <h3>Histórico de alterações</h3>
          {auditoria.length === 0 ? (
            <p className="hint">Nenhuma alteração registrada.</p>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Ação</th>
                    <th>Autor</th>
                    <th>Alterações</th>
                  </tr>
                </thead>
                <tbody>
                  {auditoria.map((registro) => (
                    <tr key={registro.id}>
                      <td>{formatarDataHora(registro.criadoEm)}</td>
                      <td>{registro.acao}</td>
                      <td>{registro.autor ?? '—'}</td>
                      <td>
                        {registro.alteracoes
                          ? Object.entries(registro.alteracoes).map(([campo, mudanca]) => (
                              <div key={campo} className="hint">
                                <b>{campo}</b>: {textoValor(mudanca.de)} → {textoValor(mudanca.para)}
                              </div>
                            ))
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
