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
  type ColaboradorFormValues,
  type GrauRiscoFuncao,
  type ResultadoAso,
  type TipoAso,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { MASCARAS } from '../lib/mascaras';
import { formatarDataIso } from '../lib/datas';
import {
  PILL_RESULTADO_ASO,
  PILL_VENCIMENTO,
  textoPrazo,
  type ColaboradorDetalhe,
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
  situacao: 'ATIVO',
  observacoes: '',
};

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
    telefone: colaborador.telefone ?? '',
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
  const [aba, setAba] = useState<'cadastro' | 'asos'>('cadastro');

  const [novoAso, setNovoAso] = useState(ASO_INICIAL);
  const [salvandoAso, setSalvandoAso] = useState(false);

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
    resolver: zodResolver(colaboradorCreateSchema) as unknown as Resolver<ColaboradorFormValues>,
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

  const carregar = useCallback(async () => {
    if (!id) return;
    setCarregando(true);
    try {
      const dados = await api.get<ColaboradorDetalhe>(`/colaboradores/${id}`);
      setColaborador(dados);
      reset(paraFormulario(dados));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar o colaborador.', 'erro');
      navegar('/colaboradores');
    } finally {
      setCarregando(false);
    }
  }, [id, mostrar, navegar, reset]);

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

  async function salvar(dados: ColaboradorFormValues) {
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
          <h3>{colaborador.nome}</h3>
          <p className="desc">
            {colaborador.funcao} · {colaborador.cpfFormatado}
            {colaborador.terceiro ? ` · ${colaborador.terceiro.nomeFantasia}` : ''}
          </p>

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
                {colaborador.situacaoAso === 'SEM_ASO'
                  ? 'nenhum ASO registrado'
                  : colaborador.asoAtual?.resultado === 'INAPTO'
                    ? 'resultado inapto no último exame'
                    : 'ASO vencido'}
                .
              </span>
            </div>
          ) : null}

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
              ajuda={exigeTerceiro ? 'É quem responde pelo ASO deste colaborador.' : 'Só para vínculo de terceiro.'}
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
    </>
  );
}
