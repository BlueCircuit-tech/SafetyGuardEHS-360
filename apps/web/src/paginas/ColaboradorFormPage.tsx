import { useCallback, useEffect, useState } from 'react';
import { Icone } from '../componentes/Icone';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm, type Path, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  EXAMES_COMPLEMENTARES_SUGERIDOS,
  GRAUS_RISCO_FUNCAO,
  PERIODICIDADE_ASO_MESES,
  RESULTADOS_ASO,
  RISCOS_SUGERIDOS,
  ROTULO_GRAU_RISCO_FUNCAO,
  ROTULO_RESULTADO_ASO,
  ROTULO_SITUACAO_COLABORADOR,
  ROTULO_TIPO_ASO,
  ROTULO_VINCULO_COLABORADOR,
  SITUACOES_COLABORADOR,
  TIPOS_ASO,
  VINCULOS_COLABORADOR,
  colaboradorCreateSchema,
  definicaoDoDocumento,
  type ColaboradorFormValues,
  type GrauRiscoFuncao,
  type ResultadoAso,
  type TipoAso,
  type TipoDocumento,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { MASCARAS } from '../lib/mascaras';
import { formatarDataIso } from '../lib/datas';
import {
  DIAS_ALERTA_ASO,
  PILL_ITEM_PASTA,
  PILL_RESULTADO_ASO,
  PILL_VENCIMENTO,
  ROTULO_ITEM_PASTA,
  textoPrazo,
  type ColaboradorDetalhe,
  type DocumentacaoColaboradorApi,
} from '../lib/saude';
import { useSessao } from '../lib/sessao';

interface Opcao {
  id: string;
  nomeFantasia?: string;
  nome?: string;
  codigo?: string;
}

const VALORES_INICIAIS: ColaboradorFormValues = {
  clienteId: '',
  vinculo: 'CLIENTE',
  terceiroId: '',
  areaId: '',
  nome: '',
  cpf: '',
  matricula: '',
  dataNascimento: '',
  funcao: '',
  setor: '',
  grauRisco: 'MEDIO',
  riscosOcupacionais: '',
  dataAdmissao: '',
  dataDesligamento: '',
  email: '',
  telefone: '',
  liderNome: '',
  // O bloqueio tem endpoint proprio (POST /colaboradores/:id/bloqueio) e
  // nunca vai no PUT do cadastro — os dois campos so existem para o tipo.
  bloqueado: 'false',
  motivoBloqueio: '',
  situacao: 'ATIVO',
  observacoes: '',
};

/** Rótulos legíveis das situações devolvidas pela API. */
const ROTULO_VENCIMENTO: Record<string, string> = {
  VIGENTE: 'Vigente',
  A_VENCER: 'A vencer',
  VENCIDO: 'Vencido',
  SEM_VALIDADE: 'Sem validade',
  SEM_ASO: 'Sem ASO',
};

interface FormDocumento {
  tipo: TipoDocumento;
  titulo: string;
  dataEmissao: string;
  validade: string;
  arquivo: File | null;
}

/** Soma meses a uma data AAAA-MM-DD, preservando o último dia do mês. */
function somarMeses(dataIso: string, meses: number): string {
  const data = new Date(`${dataIso}T00:00:00`);
  const dia = data.getDate();
  data.setMonth(data.getMonth() + meses);
  if (data.getDate() !== dia) data.setDate(0);
  return data.toISOString().slice(0, 10);
}

/** Iniciais do nome para o lugar da foto. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return `${partes[0]?.[0] ?? ''}${partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : ''}`.toUpperCase();
}

const ASO_INICIAL = {
  tipo: 'PERIODICO' as TipoAso,
  dataExame: '',
  validade: '',
  resultado: 'APTO' as ResultadoAso,
  restricoes: '',
  medicoNome: '',
  medicoCrm: '',
  medicoCoordenador: '',
  riscosAvaliados: '',
  examesComplementares: '',
  observacoes: '',
};

const resolverBase = zodResolver(colaboradorCreateSchema) as unknown as Resolver<ColaboradorFormValues>;

/**
 * O schema compartilhado espera `bloqueado` booleano, mas o formulário é todo
 * de strings e o bloqueio nem passa por ele (tem endpoint próprio). Validamos
 * o cadastro como "não bloqueado" para não exigir motivo aqui.
 */
const resolverDoCadastro: Resolver<ColaboradorFormValues> = (valores, contexto, opcoes) =>
  resolverBase({ ...valores, bloqueado: false as unknown as string, motivoBloqueio: '' }, contexto, opcoes);

function paraFormulario(colaborador: ColaboradorDetalhe): ColaboradorFormValues {
  return {
    clienteId: colaborador.clienteId,
    vinculo: colaborador.vinculo,
    terceiroId: colaborador.terceiroId ?? '',
    areaId: colaborador.areaId ?? '',
    nome: colaborador.nome,
    cpf: colaborador.cpfFormatado,
    matricula: colaborador.matricula ?? '',
    dataNascimento: colaborador.dataNascimento?.slice(0, 10) ?? '',
    funcao: colaborador.funcao,
    setor: colaborador.setor ?? '',
    grauRisco: colaborador.grauRisco,
    riscosOcupacionais: colaborador.riscosOcupacionais ?? '',
    dataAdmissao: colaborador.dataAdmissao?.slice(0, 10) ?? '',
    dataDesligamento: colaborador.dataDesligamento?.slice(0, 10) ?? '',
    email: colaborador.email ?? '',
    telefone: colaborador.telefone ? MASCARAS.telefone(colaborador.telefone) : '',
    liderNome: colaborador.liderNome ?? '',
    bloqueado: colaborador.bloqueado ? 'true' : 'false',
    motivoBloqueio: colaborador.motivoBloqueio ?? '',
    situacao: colaborador.situacao,
    observacoes: colaborador.observacoes ?? '',
  };
}

export function ColaboradorFormPage() {
  const { id } = useParams<{ id: string }>();
  const navegar = useNavigate();
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('saude:escrever');

  const modoEdicao = Boolean(id);
  const [carregando, setCarregando] = useState(modoEdicao);
  const [colaborador, setColaborador] = useState<ColaboradorDetalhe | null>(null);
  const [clientes, setClientes] = useState<Opcao[]>([]);
  const [terceiros, setTerceiros] = useState<Opcao[]>([]);
  const [areas, setAreas] = useState<Opcao[]>([]);
  const [aba, setAba] = useState<'cadastro' | 'asos' | 'documentos'>('cadastro');

  const [novoAso, setNovoAso] = useState(ASO_INICIAL);
  const [salvandoAso, setSalvandoAso] = useState(false);

  const [documentacao, setDocumentacao] = useState<DocumentacaoColaboradorApi | null>(null);
  const [formDocumento, setFormDocumento] = useState<FormDocumento | null>(null);
  const [errosDocumento, setErrosDocumento] = useState<Record<string, string>>({});
  const [salvandoDocumento, setSalvandoDocumento] = useState(false);

  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [pedindoBloqueio, setPedindoBloqueio] = useState(false);
  const [motivoBloqueio, setMotivoBloqueio] = useState('');
  const [erroMotivo, setErroMotivo] = useState('');
  const [salvandoBloqueio, setSalvandoBloqueio] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ColaboradorFormValues>({
    defaultValues: VALORES_INICIAIS,
    resolver: resolverDoCadastro,
    mode: 'onBlur',
  });

  const valores = watch();

  useEffect(() => {
    api
      .get<Opcao[]>('/clientes/opcoes?incluirInativos=true')
      .then(setClientes)
      .catch(() => setClientes([]));
  }, []);

  // Terceiros e áreas dependem do cliente escolhido — trocar de cliente troca
  // as duas listas.
  useEffect(() => {
    if (!valores.clienteId) {
      setTerceiros([]);
      setAreas([]);
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
  }, [valores.clienteId]);

  const carregarDocumentacao = useCallback(async () => {
    if (!id) return;
    try {
      setDocumentacao(await api.get<DocumentacaoColaboradorApi>(`/colaboradores/${id}/documentacao`));
    } catch {
      setDocumentacao(null);
    }
  }, [id]);

  const carregar = useCallback(async () => {
    if (!id) return;
    setCarregando(true);
    try {
      const dados = await api.get<ColaboradorDetalhe>(`/colaboradores/${id}`);
      setColaborador(dados);
      reset(paraFormulario(dados));
      void carregarDocumentacao();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar o colaborador.', 'erro');
      navegar('/colaboradores');
    } finally {
      setCarregando(false);
    }
  }, [id, mostrar, navegar, reset, carregarDocumentacao]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function aplicarErrosDaApi(erro: unknown): void {
    if (erro instanceof ErroApi && Object.keys(erro.campos).length > 0) {
      for (const [campo, mensagens] of Object.entries(erro.campos)) {
        setError(campo as Path<ColaboradorFormValues>, { message: mensagens[0] });
      }
    }
    mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao salvar.', 'erro');
  }

  async function salvar(dadosDoFormulario: ColaboradorFormValues) {
    // Bloqueio tem endpoint proprio: tirar as chaves evita que salvar o
    // cadastro desfaça (ou refaça) um bloqueio registrado por outra pessoa.
    const { bloqueado: _bloqueado, motivoBloqueio: _motivo, ...dados } = dadosDoFormulario;
    try {
      if (modoEdicao) {
        await api.put(`/colaboradores/${id}`, dados);
        mostrar('Colaborador atualizado.', 'sucesso');
        void carregar();
      } else {
        const criado = await api.post<{ id: string }>('/colaboradores', dados);
        mostrar('Colaborador cadastrado.', 'sucesso');
        navegar(`/colaboradores/${criado.id}`);
      }
    } catch (erro) {
      aplicarErrosDaApi(erro);
    }
  }

  async function enviarFoto(arquivo: File) {
    if (!id) return;
    if (!arquivo.type.startsWith('image/')) {
      mostrar('Envie uma imagem (JPG, PNG ou WEBP).', 'erro');
      return;
    }
    setEnviandoFoto(true);
    try {
      await api.upload(`/colaboradores/${id}/foto`, arquivo);
      mostrar('Foto atualizada.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao enviar a foto.', 'erro');
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function alterarBloqueio(bloquear: boolean) {
    if (!id) return;
    if (bloquear && !motivoBloqueio.trim()) {
      setErroMotivo('Informe o motivo do bloqueio.');
      return;
    }
    if (!bloquear && !window.confirm('Retirar o bloqueio e liberar este colaborador para o trabalho?')) return;

    setSalvandoBloqueio(true);
    try {
      await api.post(`/colaboradores/${id}/bloqueio`, bloquear ? { bloqueado: true, motivo: motivoBloqueio.trim() } : { bloqueado: false });
      mostrar(bloquear ? 'Colaborador bloqueado.' : 'Bloqueio retirado.', 'sucesso');
      setPedindoBloqueio(false);
      setMotivoBloqueio('');
      setErroMotivo('');
      void carregar();
    } catch (erro) {
      if (erro instanceof ErroApi && erro.campos.motivoBloqueio?.[0]) setErroMotivo(erro.campos.motivoBloqueio[0]);
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao alterar o bloqueio.', 'erro');
    } finally {
      setSalvandoBloqueio(false);
    }
  }

  function abrirFormDocumento(tipo: TipoDocumento, rotulo: string) {
    setErrosDocumento({});
    setFormDocumento({
      tipo,
      titulo: `${rotulo} — ${colaborador?.nome ?? ''}`.slice(0, 150),
      dataEmissao: new Date().toISOString().slice(0, 10),
      validade: '',
      arquivo: null,
    });
  }

  /** Ao mudar a emissão, sugere a validade pelo catálogo (quando o tipo tem prazo). */
  function aoMudarEmissaoDocumento(valor: string) {
    if (!formDocumento) return;
    const meses = definicaoDoDocumento(formDocumento.tipo).validadeMeses;
    setFormDocumento({
      ...formDocumento,
      dataEmissao: valor,
      validade: valor && meses && !formDocumento.validade ? somarMeses(valor, meses) : formDocumento.validade,
    });
  }

  async function salvarDocumento() {
    if (!id || !colaborador || !formDocumento) return;
    setSalvandoDocumento(true);
    setErrosDocumento({});
    try {
      const criado = await api.post<{ id: string }>('/documentos', {
        clienteId: colaborador.clienteId,
        abrangencia: 'COLABORADOR',
        colaboradorId: id,
        tipo: formDocumento.tipo,
        titulo: formDocumento.titulo,
        dataEmissao: formDocumento.dataEmissao,
        validade: formDocumento.validade,
        situacao: 'ATIVO',
      });
      if (formDocumento.arquivo) {
        try {
          await api.upload(`/documentos/${criado.id}/arquivo`, formDocumento.arquivo);
        } catch (erro) {
          mostrar(
            `Documento cadastrado, mas o arquivo não subiu: ${erro instanceof Error ? erro.message : 'falha no envio'}. Use "Anexar arquivo".`,
            'erro',
          );
          setFormDocumento(null);
          void carregarDocumentacao();
          return;
        }
      }
      mostrar(formDocumento.arquivo ? 'Documento cadastrado e anexado.' : 'Documento cadastrado — falta anexar o arquivo.', 'sucesso');
      setFormDocumento(null);
      void carregarDocumentacao();
    } catch (erro) {
      if (erro instanceof ErroApi && Object.keys(erro.campos).length > 0) {
        setErrosDocumento(Object.fromEntries(Object.entries(erro.campos).map(([campo, msgs]) => [campo, msgs[0] ?? ''])));
      }
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao cadastrar o documento.', 'erro');
    } finally {
      setSalvandoDocumento(false);
    }
  }

  async function anexarCertificado(realizacaoId: string, arquivo: File) {
    try {
      await api.upload(`/treinamentos-realizados/${realizacaoId}/certificado`, arquivo);
      mostrar('Certificado anexado.', 'sucesso');
      void carregarDocumentacao();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao anexar o certificado.', 'erro');
    }
  }

  async function anexarDocumento(documentoId: string, arquivo: File) {
    try {
      await api.upload(`/documentos/${documentoId}/arquivo`, arquivo);
      mostrar('Arquivo anexado.', 'sucesso');
      void carregarDocumentacao();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao anexar.', 'erro');
    }
  }

  /** Sugere a validade pela periodicidade do grau de risco ao escolher a data. */
  function aoMudarDataDoExame(valor: string): void {
    const proximo = { ...novoAso, dataExame: valor };

    if (valor && !novoAso.validade && novoAso.tipo !== 'DEMISSIONAL' && colaborador) {
      const data = new Date(`${valor}T00:00:00`);
      const meses = PERIODICIDADE_ASO_MESES[colaborador.grauRisco];
      const dia = data.getDate();
      data.setMonth(data.getMonth() + meses);
      if (data.getDate() !== dia) data.setDate(0);
      proximo.validade = data.toISOString().slice(0, 10);
    }

    setNovoAso(proximo);
  }

  async function registrarAso() {
    if (!id) return;
    setSalvandoAso(true);

    try {
      await api.post('/asos', {
        colaboradorId: id,
        ...novoAso,
        validade: novoAso.tipo === 'DEMISSIONAL' ? '' : novoAso.validade,
      });
      mostrar('ASO registrado.', 'sucesso');
      setNovoAso(ASO_INICIAL);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao registrar o ASO.', 'erro');
    } finally {
      setSalvandoAso(false);
    }
  }

  async function anexarAso(asoId: string, arquivo: File) {
    try {
      await api.upload(`/asos/${asoId}/arquivo`, arquivo);
      mostrar('Atestado anexado.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao anexar.', 'erro');
    }
  }

  async function excluirAso(asoId: string) {
    if (!window.confirm('Excluir este ASO do histórico?')) return;

    try {
      await api.delete(`/asos/${asoId}`);
      mostrar('ASO excluído.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao excluir.', 'erro');
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

  const exigeTerceiro = valores.vinculo === 'TERCEIRO';

  return (
    <>
      <Link className="link-voltar" to="/colaboradores">
        ← Voltar para colaboradores
      </Link>

      {colaborador ? (
        <div className="painel">
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              {colaborador.fotoUrl ? (
                <img
                  src={urlAbsoluta(colaborador.fotoUrl) ?? ''}
                  alt={`Foto de ${colaborador.nome}`}
                  style={{ width: 96, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
                />
              ) : (
                <div
                  aria-label="Sem foto"
                  style={{
                    width: 96,
                    height: 120,
                    borderRadius: 8,
                    border: '1px dashed var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 28,
                    fontWeight: 700,
                    color: 'var(--texto-medio)',
                    background: 'var(--superficie-2)',
                  }}
                >
                  {iniciais(colaborador.nome)}
                </div>
              )}
              {podeEscrever ? (
                <label className="btn btn-ghost btn-sm">
                  <Icone nome="camera" /> {enviandoFoto ? 'Enviando...' : colaborador.fotoUrl ? 'Trocar foto' : 'Enviar foto'}
                  <input
                    type="file"
                    hidden
                    accept="image/jpeg,image/png,image/webp"
                    disabled={enviandoFoto}
                    onChange={(evento) => {
                      const arquivo = evento.target.files?.[0];
                      evento.target.value = '';
                      if (arquivo) void enviarFoto(arquivo);
                    }}
                  />
                </label>
              ) : null}
            </div>

            <div style={{ flex: 1, minWidth: 240 }}>
              <h3>{colaborador.nome}</h3>
              <p className="desc">
                {colaborador.funcao} · {colaborador.cpfFormatado}
                {colaborador.terceiro ? ` · ${colaborador.terceiro.nomeFantasia}` : ''}
                {colaborador.liderNome ? ` · Liderança: ${colaborador.liderNome}` : ''}
              </p>
              <div className="barra-acoes">
                <Link className="btn btn-outline btn-sm" to={`/colaboradores/${colaborador.id}/carteirinha`}>
                  <Icone nome="etiqueta" /> Carteirinha
                </Link>
                <Link className="btn btn-outline btn-sm" to={`/colaboradores/${colaborador.id}/ficha-epi`}>
                  <Icone nome="capacete" /> Ficha de EPI
                </Link>
                <Link className="btn btn-outline btn-sm" to={`/colaboradores/${colaborador.id}/ppp`}>
                  <Icone nome="documento" /> PPP
                </Link>
              </div>
              <p className="hint">A foto aparece na carteirinha com QR Code. Use foto de rosto, fundo claro (formato 3×4).</p>
            </div>
          </div>

          <div className="stat-grid">
            <div className="stat">
              <b>{colaborador.situacaoAso === 'SEM_ASO' ? 'Sem ASO' : textoPrazo(colaborador.diasParaVencerAso)}</b>
              <span>situação do exame</span>
            </div>
            <div className="stat">
              <b>{colaborador.asoAtual ? ROTULO_RESULTADO_ASO[colaborador.asoAtual.resultado] : '—'}</b>
              <span>último resultado</span>
            </div>
            <div className="stat">
              <b>{colaborador.asos.length}</b>
              <span>exames no histórico</span>
            </div>
            <div className="stat">
              <b>{ROTULO_GRAU_RISCO_FUNCAO[colaborador.grauRisco]}</b>
              <span>grau de risco (periódico a cada {PERIODICIDADE_ASO_MESES[colaborador.grauRisco]} meses)</span>
            </div>
          </div>

          {colaborador.impedido ? (
            <div className="barra-acoes">
              <span className="aviso">
                <Icone nome="bloqueado" /> Impedido de trabalhar —{' '}
                {[
                  colaborador.bloqueado ? 'bloqueado manualmente' : null,
                  colaborador.situacaoAso === 'SEM_ASO' ? 'nenhum ASO registrado' : null,
                  colaborador.asoAtual?.resultado === 'INAPTO' ? 'resultado inapto no último exame' : null,
                  colaborador.situacaoAso === 'VENCIDO' ? 'ASO vencido' : null,
                ]
                  .filter(Boolean)
                  .join('; ')}
                .
              </span>
            </div>
          ) : null}

          {colaborador.situacaoAso === 'A_VENCER' ? (
            <p className="hint alerta">
              <Icone nome="relogio" /> <b>ASO vencendo:</b> {textoPrazo(colaborador.diasParaVencerAso)}
              {colaborador.asoAtual?.validade ? ` (validade ${formatarDataIso(colaborador.asoAtual.validade)})` : ''}. O alerta
              começa {DIAS_ALERTA_ASO} dias antes — agende o periódico.
            </p>
          ) : null}

          {/* ------------------------------------------------ liberacao --- */}
          <div className="campo-bloco" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <b>Liberação para o trabalho:</b>
              {colaborador.bloqueado ? (
                <span className="pill bad">
                  <Icone nome="bloqueado" /> Bloqueado
                </span>
              ) : (
                <span className="pill ok">
                  <Icone nome="ok" /> Sem bloqueio
                </span>
              )}
              {podeEscrever && !pedindoBloqueio ? (
                colaborador.bloqueado ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={salvandoBloqueio}
                    onClick={() => void alterarBloqueio(false)}
                  >
                    {salvandoBloqueio ? 'Salvando...' : 'Desbloquear'}
                  </button>
                ) : (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setPedindoBloqueio(true)}>
                    Bloquear
                  </button>
                )
              ) : null}
            </div>

            {colaborador.bloqueado ? (
              <p className="hint alerta" style={{ marginTop: 8 }}>
                <b>Bloqueado</b>
                {colaborador.bloqueadoEm ? ` em ${formatarDataIso(colaborador.bloqueadoEm)}` : ''}
                {colaborador.motivoBloqueio ? ` — motivo: ${colaborador.motivoBloqueio}` : ''}. Não pode ser escalado para
                trabalhar até o bloqueio ser retirado.
              </p>
            ) : null}

            {pedindoBloqueio ? (
              <div style={{ marginTop: 8 }}>
                <Campo
                  label="Motivo do bloqueio"
                  htmlFor="motivo-bloqueio"
                  obrigatorio
                  erro={erroMotivo}
                  ajuda="Fica registrado na auditoria e aparece na carteirinha e na liberação de equipe."
                >
                  <input
                    id="motivo-bloqueio"
                    className="busca"
                    maxLength={300}
                    value={motivoBloqueio}
                    onChange={(evento) => {
                      setMotivoBloqueio(evento.target.value);
                      if (erroMotivo) setErroMotivo('');
                    }}
                  />
                </Campo>
                <div className="barra-acoes">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={salvandoBloqueio}
                    onClick={() => void alterarBloqueio(true)}
                  >
                    {salvandoBloqueio ? 'Bloqueando...' : 'Confirmar bloqueio'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setPedindoBloqueio(false);
                      setMotivoBloqueio('');
                      setErroMotivo('');
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {colaborador.asoAtual?.restricoes ? (
            <p className="hint">
              <b>Restrição registrada:</b> {colaborador.asoAtual.restricoes}
            </p>
          ) : null}
        </div>
      ) : null}

      {modoEdicao ? (
        <div className="abas">
          <button type="button" className={aba === 'cadastro' ? 'ativa' : ''} onClick={() => setAba('cadastro')}>
            Cadastro
          </button>
          <button type="button" className={aba === 'asos' ? 'ativa' : ''} onClick={() => setAba('asos')}>
            ASO ({colaborador?.asos.length ?? 0})
          </button>
          <button type="button" className={aba === 'documentos' ? 'ativa' : ''} onClick={() => setAba('documentos')}>
            Documentos
            {documentacao && documentacao.pendencias.length > 0 ? ` (${documentacao.pendencias.length} pendência${documentacao.pendencias.length === 1 ? '' : 's'})` : ''}
          </button>
        </div>
      ) : null}

      {aba === 'cadastro' ? (
        <form className="painel" onSubmit={handleSubmit(salvar)} noValidate>
          <h3>{modoEdicao ? 'Dados cadastrais' : 'Novo colaborador'}</h3>

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

            <Campo label="Vínculo" htmlFor="vinculo" obrigatorio erro={errors.vinculo?.message}>
              <select id="vinculo" {...register('vinculo')}>
                {VINCULOS_COLABORADOR.map((item) => (
                  <option key={item} value={item}>
                    {ROTULO_VINCULO_COLABORADOR[item]}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo
              label="Empresa contratada"
              htmlFor="terceiroId"
              obrigatorio={exigeTerceiro}
              erro={errors.terceiroId?.message}
              ajuda={
                !exigeTerceiro ? (
                  'Só para vínculo de terceiro.'
                ) : valores.clienteId && terceiros.length === 0 ? (
                  <>
                    Nenhuma empresa contratada encontrada para este cliente —{' '}
                    <Link to="/terceiros">cadastre em Terceiros</Link>.
                  </>
                ) : (
                  'É quem responde pelo ASO deste colaborador.'
                )
              }
            >
              <select id="terceiroId" {...register('terceiroId')} disabled={!exigeTerceiro}>
                <option value="">Selecione...</option>
                {terceiros.map((terceiro) => (
                  <option key={terceiro.id} value={terceiro.id}>
                    {terceiro.nomeFantasia}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Área de lotação" htmlFor="areaId" erro={errors.areaId?.message}>
              <select id="areaId" {...register('areaId')}>
                <option value="">Sem área definida</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.codigo ? `${area.codigo} — ` : ''}
                    {area.nome}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="filtros">
            <Campo label="Nome completo" htmlFor="nome" obrigatorio erro={errors.nome?.message}>
              <input id="nome" className="busca" {...register('nome')} />
            </Campo>

            <Campo label="CPF" htmlFor="cpf" obrigatorio erro={errors.cpf?.message}>
              <input
                id="cpf"
                {...register('cpf')}
                onChange={(evento) => setValue('cpf', MASCARAS.cpf(evento.target.value), { shouldValidate: false })}
              />
            </Campo>

            <Campo label="Matrícula" htmlFor="matricula" erro={errors.matricula?.message}>
              <input id="matricula" className="estreito" {...register('matricula')} />
            </Campo>

            <Campo label="Nascimento" htmlFor="dataNascimento" erro={errors.dataNascimento?.message}>
              <input id="dataNascimento" type="date" {...register('dataNascimento')} />
            </Campo>
          </div>

          <div className="filtros">
            <Campo label="Função" htmlFor="funcao" obrigatorio erro={errors.funcao?.message}>
              <input id="funcao" className="busca" {...register('funcao')} />
            </Campo>

            <Campo label="Setor" htmlFor="setor" erro={errors.setor?.message}>
              <input id="setor" {...register('setor')} />
            </Campo>

            <Campo
              label="Liderança direta"
              htmlFor="liderNome"
              erro={errors.liderNome?.message}
              ajuda="Supervisor ou encarregado — usado no absenteísmo e nos avisos."
            >
              <input id="liderNome" {...register('liderNome')} />
            </Campo>

            <Campo
              label="Grau de risco da função"
              htmlFor="grauRisco"
              obrigatorio
              erro={errors.grauRisco?.message}
              ajuda={`Define a periodicidade do exame: ${PERIODICIDADE_ASO_MESES[valores.grauRisco as GrauRiscoFuncao] ?? 24} meses.`}
            >
              <select id="grauRisco" className="estreito" {...register('grauRisco')}>
                {GRAUS_RISCO_FUNCAO.map((item) => (
                  <option key={item} value={item}>
                    {ROTULO_GRAU_RISCO_FUNCAO[item]}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Situação" htmlFor="situacao" erro={errors.situacao?.message}>
              <select id="situacao" className="estreito" {...register('situacao')}>
                {SITUACOES_COLABORADOR.map((item) => (
                  <option key={item} value={item}>
                    {ROTULO_SITUACAO_COLABORADOR[item]}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <Campo
            label="Riscos ocupacionais da função"
            htmlFor="riscosOcupacionais"
            erro={errors.riscosOcupacionais?.message}
            ajuda={`Separe por ponto e vírgula. Sugestões: ${RISCOS_SUGERIDOS.slice(0, 6).join(', ')}...`}
          >
            <input id="riscosOcupacionais" className="busca" {...register('riscosOcupacionais')} />
          </Campo>

          <div className="filtros">
            <Campo label="Admissão" htmlFor="dataAdmissao" erro={errors.dataAdmissao?.message}>
              <input id="dataAdmissao" type="date" {...register('dataAdmissao')} />
            </Campo>

            <Campo
              label="Desligamento"
              htmlFor="dataDesligamento"
              erro={errors.dataDesligamento?.message}
              ajuda="Obrigatório quando a situação é Desligado."
            >
              <input id="dataDesligamento" type="date" {...register('dataDesligamento')} />
            </Campo>

            <Campo label="E-mail" htmlFor="email" erro={errors.email?.message}>
              <input id="email" type="email" {...register('email')} />
            </Campo>

            <Campo label="Telefone" htmlFor="telefone" erro={errors.telefone?.message}>
              <input
                id="telefone"
                {...register('telefone')}
                onChange={(evento) =>
                  setValue('telefone', MASCARAS.telefone(evento.target.value), { shouldValidate: false })
                }
              />
            </Campo>
          </div>

          <Campo label="Observações" htmlFor="observacoes" erro={errors.observacoes?.message}>
            <textarea id="observacoes" rows={3} {...register('observacoes')} />
          </Campo>

          {podeEscrever ? (
            <div className="barra-acoes">
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : modoEdicao ? 'Salvar alterações' : 'Cadastrar colaborador'}
              </button>
              <Link className="btn btn-ghost" to="/colaboradores">
                Cancelar
              </Link>
            </div>
          ) : (
            <p className="hint">Seu perfil pode consultar, mas não editar este cadastro.</p>
          )}
        </form>
      ) : null}

      {aba === 'asos' && colaborador ? (
        <>
          {podeEscrever ? (
            <div className="painel">
              <h3>Registrar ASO</h3>
              <p className="desc">
                A validade é sugerida pela periodicidade do grau de risco e pode ser ajustada — a NR-7 tem exceções por
                agente e por idade.
              </p>

              <div className="filtros">
                <Campo label="Tipo de exame" htmlFor="aso-tipo" obrigatorio>
                  <select
                    id="aso-tipo"
                    value={novoAso.tipo}
                    onChange={(evento) =>
                      setNovoAso({
                        ...novoAso,
                        tipo: evento.target.value as TipoAso,
                        validade: evento.target.value === 'DEMISSIONAL' ? '' : novoAso.validade,
                      })
                    }
                  >
                    {TIPOS_ASO.map((item) => (
                      <option key={item} value={item}>
                        {ROTULO_TIPO_ASO[item]}
                      </option>
                    ))}
                  </select>
                </Campo>

                <Campo label="Data do exame" htmlFor="aso-data" obrigatorio>
                  <input
                    id="aso-data"
                    type="date"
                    value={novoAso.dataExame}
                    onChange={(evento) => aoMudarDataDoExame(evento.target.value)}
                  />
                </Campo>

                <Campo
                  label="Validade"
                  htmlFor="aso-validade"
                  ajuda={novoAso.tipo === 'DEMISSIONAL' ? 'Demissional não tem validade.' : 'Sugerida pelo grau de risco.'}
                >
                  <input
                    id="aso-validade"
                    type="date"
                    value={novoAso.validade}
                    disabled={novoAso.tipo === 'DEMISSIONAL'}
                    onChange={(evento) => setNovoAso({ ...novoAso, validade: evento.target.value })}
                  />
                </Campo>

                <Campo label="Resultado" htmlFor="aso-resultado" obrigatorio>
                  <select
                    id="aso-resultado"
                    value={novoAso.resultado}
                    onChange={(evento) => setNovoAso({ ...novoAso, resultado: evento.target.value as ResultadoAso })}
                  >
                    {RESULTADOS_ASO.map((item) => (
                      <option key={item} value={item}>
                        {ROTULO_RESULTADO_ASO[item]}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>

              {novoAso.resultado !== 'APTO' ? (
                <Campo
                  label="Restrição / motivo da inaptidão"
                  htmlFor="aso-restricoes"
                  obrigatorio
                  ajuda="O supervisor precisa saber o que o colaborador não pode fazer."
                >
                  <input
                    id="aso-restricoes"
                    className="busca"
                    value={novoAso.restricoes}
                    onChange={(evento) => setNovoAso({ ...novoAso, restricoes: evento.target.value })}
                  />
                </Campo>
              ) : null}

              <div className="filtros">
                <Campo label="Médico examinador" htmlFor="aso-medico" obrigatorio>
                  <input
                    id="aso-medico"
                    className="busca"
                    value={novoAso.medicoNome}
                    onChange={(evento) => setNovoAso({ ...novoAso, medicoNome: evento.target.value })}
                  />
                </Campo>

                <Campo label="CRM" htmlFor="aso-crm" obrigatorio>
                  <input
                    id="aso-crm"
                    value={novoAso.medicoCrm}
                    onChange={(evento) => setNovoAso({ ...novoAso, medicoCrm: evento.target.value })}
                  />
                </Campo>

                <Campo label="Coordenador do PCMSO" htmlFor="aso-coordenador">
                  <input
                    id="aso-coordenador"
                    value={novoAso.medicoCoordenador}
                    onChange={(evento) => setNovoAso({ ...novoAso, medicoCoordenador: evento.target.value })}
                  />
                </Campo>
              </div>

              <div className="filtros">
                <Campo label="Riscos avaliados" htmlFor="aso-riscos" ajuda="Separe por ponto e vírgula.">
                  <input
                    id="aso-riscos"
                    className="busca"
                    value={novoAso.riscosAvaliados}
                    onChange={(evento) => setNovoAso({ ...novoAso, riscosAvaliados: evento.target.value })}
                  />
                </Campo>

                <Campo
                  label="Exames complementares"
                  htmlFor="aso-exames"
                  ajuda={`Sugestões: ${EXAMES_COMPLEMENTARES_SUGERIDOS.slice(0, 4).join(', ')}...`}
                >
                  <input
                    id="aso-exames"
                    className="busca"
                    value={novoAso.examesComplementares}
                    onChange={(evento) => setNovoAso({ ...novoAso, examesComplementares: evento.target.value })}
                  />
                </Campo>
              </div>

              <div className="barra-acoes">
                <button type="button" className="btn btn-primary" disabled={salvandoAso} onClick={() => void registrarAso()}>
                  {salvandoAso ? 'Registrando...' : 'Registrar ASO'}
                </button>
                {novoAso.tipo === 'DEMISSIONAL' ? (
                  <span className="aviso">O demissional marca o colaborador como desligado.</span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="painel">
            <h3>Histórico de exames</h3>
            <p className="desc">
              O histórico é preservado: um novo periódico não apaga o anterior, porque a fiscalização pede a sequência
              completa.
            </p>

            {colaborador.asos.length === 0 ? (
              <div className="vazio">
                <div className="icone-vazio" aria-hidden="true">
              <Icone nome="saude" tamanho={22} />
            </div>
                <h4>Nenhum ASO registrado</h4>
                <p>Este colaborador está impedido de trabalhar até que o exame seja registrado.</p>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Exame</th>
                      <th>Validade</th>
                      <th>Resultado</th>
                      <th>Médico</th>
                      <th>Atestado</th>
                      <th aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody>
                    {colaborador.asos.map((aso) => {
                      const situacao = aso.validade
                        ? aso.validade.slice(0, 10) < new Date().toISOString().slice(0, 10)
                          ? 'VENCIDO'
                          : 'VIGENTE'
                        : 'SEM_VALIDADE';

                      return (
                        <tr key={aso.id}>
                          <td>{ROTULO_TIPO_ASO[aso.tipo]}</td>
                          <td>{formatarDataIso(aso.dataExame)}</td>
                          <td>
                            {aso.validade ? (
                              <span className={`pill ${PILL_VENCIMENTO[situacao]}`}>{formatarDataIso(aso.validade)}</span>
                            ) : (
                              <span className="hint">—</span>
                            )}
                          </td>
                          <td>
                            <span className={`pill ${PILL_RESULTADO_ASO[aso.resultado]}`}>
                              {ROTULO_RESULTADO_ASO[aso.resultado]}
                            </span>
                            {aso.restricoes ? <div className="hint">{aso.restricoes}</div> : null}
                          </td>
                          <td>
                            {aso.medicoNome}
                            <div className="hint">{aso.medicoCrm}</div>
                          </td>
                          <td>
                            {aso.arquivoUrl ? (
                              <a href={urlAbsoluta(aso.arquivoUrl) ?? '#'} target="_blank" rel="noreferrer">
                                Ver arquivo
                              </a>
                            ) : podeEscrever ? (
                              <label className="btn btn-ghost btn-sm">
                                Anexar
                                <input
                                  type="file"
                                  hidden
                                  accept="application/pdf,image/*"
                                  onChange={(evento) => {
                                    const arquivo = evento.target.files?.[0];
                                    if (arquivo) void anexarAso(aso.id, arquivo);
                                  }}
                                />
                              </label>
                            ) : (
                              <span className="hint">sem anexo</span>
                            )}
                          </td>
                          <td>
                            {podeEscrever ? (
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluirAso(aso.id)}>
                                Excluir
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      {aba === 'documentos' && colaborador ? (
        <>
          <div className="painel">
            <h3>Pasta do colaborador</h3>
            <p className="desc">
              Documentos legais exigidos de cada trabalhador: ficha de registro, contrato, acordo de compensação de horas,
              ordem de serviço e ficha de EPI — além do ASO e dos certificados de treinamento. Anexe o arquivo digitalizado
              para o item contar como em dia.
            </p>

            {!documentacao ? (
              <div className="centro-tela">
                <div className="spinner" />
                Carregando a pasta...
              </div>
            ) : (
              <>
                {documentacao.pendencias.length > 0 ? (
                  <div className="hint alerta" style={{ marginBottom: 12 }}>
                    <b>
                      <Icone nome="alerta" /> {documentacao.pendencias.length} pendência
                      {documentacao.pendencias.length === 1 ? '' : 's'} de documentação:
                    </b>
                    <ul style={{ margin: '6px 0 0 18px' }}>
                      {documentacao.pendencias.map((pendencia) => (
                        <li key={pendencia}>{pendencia}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="hint">
                    <Icone nome="ok" /> Documentação completa.
                  </p>
                )}

                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Documento</th>
                        <th>Situação</th>
                        <th>Emissão</th>
                        <th>Validade</th>
                        <th>Arquivo</th>
                        {podeEscrever ? <th aria-label="Ações" /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {documentacao.itens.map((item) => (
                        <tr key={item.tipo}>
                          <td>
                            <b>{item.rotulo}</b>
                            {item.documento ? <div className="hint">{item.documento.titulo}</div> : null}
                            {!item.documento && item.descricao ? <div className="hint">{item.descricao}</div> : null}
                          </td>
                          <td>
                            <span className={`pill ${PILL_ITEM_PASTA[item.situacao]}`}>{ROTULO_ITEM_PASTA[item.situacao]}</span>
                          </td>
                          <td>{item.documento ? formatarDataIso(item.documento.dataEmissao) : '—'}</td>
                          <td>{item.documento?.validade ? formatarDataIso(item.documento.validade) : item.documento ? 'sem validade' : '—'}</td>
                          <td>
                            {item.documento?.arquivoUrl ? (
                              <a href={urlAbsoluta(item.documento.arquivoUrl) ?? '#'} target="_blank" rel="noreferrer">
                                <Icone nome="anexo" /> Ver arquivo
                              </a>
                            ) : item.documento && podeEscrever ? (
                              <label className="btn btn-ghost btn-sm">
                                <Icone nome="anexo" /> Anexar arquivo
                                <input
                                  type="file"
                                  hidden
                                  accept="application/pdf,image/*"
                                  onChange={(evento) => {
                                    const arquivo = evento.target.files?.[0];
                                    evento.target.value = '';
                                    if (arquivo && item.documento) void anexarDocumento(item.documento.id, arquivo);
                                  }}
                                />
                              </label>
                            ) : (
                              <span className="hint">sem arquivo</span>
                            )}
                          </td>
                          {podeEscrever ? (
                            <td>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => abrirFormDocumento(item.tipo, item.rotulo)}
                              >
                                {item.documento ? 'Nova versão' : 'Cadastrar/Anexar'}
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {formDocumento ? (
                  <div className="campo-bloco" style={{ marginTop: 14 }}>
                    <h4 style={{ margin: '0 0 8px' }}>
                      Cadastrar {documentacao.itens.find((item) => item.tipo === formDocumento.tipo)?.rotulo ?? 'documento'}
                    </h4>
                    <div className="filtros">
                      <Campo label="Título" htmlFor="doc-titulo" obrigatorio erro={errosDocumento.titulo}>
                        <input
                          id="doc-titulo"
                          className="busca"
                          maxLength={150}
                          value={formDocumento.titulo}
                          onChange={(evento) => setFormDocumento({ ...formDocumento, titulo: evento.target.value })}
                        />
                      </Campo>
                      <Campo label="Emissão" htmlFor="doc-emissao" obrigatorio erro={errosDocumento.dataEmissao}>
                        <input
                          id="doc-emissao"
                          type="date"
                          value={formDocumento.dataEmissao}
                          onChange={(evento) => aoMudarEmissaoDocumento(evento.target.value)}
                        />
                      </Campo>
                      <Campo
                        label="Validade"
                        htmlFor="doc-validade"
                        erro={errosDocumento.validade}
                        ajuda="Vazio = sem prazo (ficha de registro, contrato)."
                      >
                        <input
                          id="doc-validade"
                          type="date"
                          value={formDocumento.validade}
                          onChange={(evento) => setFormDocumento({ ...formDocumento, validade: evento.target.value })}
                        />
                      </Campo>
                      <Campo label="Arquivo (PDF ou imagem)" htmlFor="doc-arquivo" ajuda="Pode anexar depois, mas o item só fica em dia com o arquivo.">
                        <input
                          id="doc-arquivo"
                          type="file"
                          accept="application/pdf,image/*"
                          onChange={(evento) => setFormDocumento({ ...formDocumento, arquivo: evento.target.files?.[0] ?? null })}
                        />
                      </Campo>
                    </div>
                    {Object.entries(errosDocumento)
                      .filter(([campo]) => !['titulo', 'dataEmissao', 'validade'].includes(campo))
                      .map(([campo, mensagem]) => (
                        <p key={campo} className="hint alerta">
                          {mensagem}
                        </p>
                      ))}
                    <div className="barra-acoes">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={salvandoDocumento}
                        onClick={() => void salvarDocumento()}
                      >
                        {salvandoDocumento ? 'Salvando...' : 'Salvar documento'}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFormDocumento(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {documentacao ? (
            <div className="grid2">
              <div className="painel">
                <h3>ASO e ordem de serviço</h3>
                <dl className="folha-dados">
                  <div>
                    <dt>ASO atual</dt>
                    <dd>
                      {documentacao.aso ? (
                        <>
                          <span className={`pill ${PILL_VENCIMENTO[documentacao.aso.situacao]}`}>
                            {ROTULO_VENCIMENTO[documentacao.aso.situacao] ?? documentacao.aso.situacao}
                          </span>{' '}
                          {documentacao.aso.validade ? `até ${formatarDataIso(documentacao.aso.validade)}` : ''}
                          <div>
                            {documentacao.aso.arquivoUrl ? (
                              <a href={urlAbsoluta(documentacao.aso.arquivoUrl) ?? '#'} target="_blank" rel="noreferrer">
                                <Icone nome="anexo" /> Ver atestado
                              </a>
                            ) : (
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAba('asos')}>
                                Anexar na aba ASO
                              </button>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="pill bad">Sem ASO</span>{' '}
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAba('asos')}>
                            Registrar ASO
                          </button>
                        </>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Ordem de serviço (NR-1)</dt>
                    <dd>
                      {documentacao.ordemServico ? (
                        <>
                          <span className="mono">{documentacao.ordemServico.codigo}</span>{' '}
                          <span className={`pill ${documentacao.ordemServico.situacao === 'EMITIDA' ? 'warn' : 'ok'}`}>
                            {documentacao.ordemServico.situacao === 'EMITIDA' ? 'Sem ciência' : 'Com ciência'}
                          </span>
                          <div>
                            {documentacao.ordemServico.arquivoAssinadoUrl ? (
                              <a
                                href={urlAbsoluta(documentacao.ordemServico.arquivoAssinadoUrl) ?? '#'}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Icone nome="anexo" /> Ver OS assinada
                              </a>
                            ) : (
                              <Link to="/ordens-servico">Abrir ordens de serviço</Link>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="pill bad">Não emitida</span> <Link to="/ordens-servico">Emitir OS</Link>
                        </>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="painel">
                <h3>Certificados de cursos ({documentacao.certificados.length})</h3>
                {documentacao.certificados.length === 0 ? (
                  <p className="hint">
                    Nenhum treinamento registrado. Registre em <Link to="/treinamentos">Treinamentos</Link>.
                  </p>
                ) : (
                  <div className="tbl-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Treinamento</th>
                          <th>Validade</th>
                          <th>Certificado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documentacao.certificados.map((certificado) => (
                          <tr key={certificado.id}>
                            <td>{certificado.treinamento}</td>
                            <td>
                              {certificado.validade ? (
                                <span className={`pill ${PILL_VENCIMENTO[certificado.situacao]}`}>
                                  {formatarDataIso(certificado.validade)}
                                </span>
                              ) : (
                                <span className="hint">sem reciclagem</span>
                              )}
                            </td>
                            <td>
                              {certificado.certificadoUrl ? (
                                <a href={urlAbsoluta(certificado.certificadoUrl) ?? '#'} target="_blank" rel="noreferrer">
                                  <Icone nome="anexo" /> Ver
                                </a>
                              ) : podeEscrever ? (
                                <label className="btn btn-ghost btn-sm">
                                  Anexar
                                  <input
                                    type="file"
                                    hidden
                                    accept="application/pdf,image/*"
                                    onChange={(evento) => {
                                      const arquivo = evento.target.files?.[0];
                                      evento.target.value = '';
                                      if (arquivo) void anexarCertificado(certificado.id, arquivo);
                                    }}
                                  />
                                </label>
                              ) : (
                                <span className="hint">sem anexo</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
