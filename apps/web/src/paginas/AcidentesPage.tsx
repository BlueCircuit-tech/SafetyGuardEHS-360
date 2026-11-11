import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CATEGORIAS_ISHIKAWA,
  ISHIKAWA_VAZIO,
  PERGUNTA_ISHIKAWA,
  ROTULO_INVESTIGACAO,
  ROTULO_ISHIKAWA,
  ROTULO_TIPO_ACIDENTE,
  SITUACOES_INVESTIGACAO,
  TIPOS_ACIDENTE,
  totalCausasIshikawa,
  type Ishikawa,
  type SituacaoInvestigacao,
  type TipoAcidente,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { ListaEditavel } from '../componentes/ListaEditavel';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import { useSessao } from '../lib/sessao';

interface AcidenteApi {
  id: string;
  data: string;
  tipo: TipoAcidente;
  descricao: string;
  parteCorpoAtingida: string | null;
  comAfastamento: boolean;
  diasAfastamento: number;
  catNumero: string | null;
  catEmitidaEm: string | null;
  catPendente: boolean;
  situacaoInvestigacao: SituacaoInvestigacao;
  investigador: string | null;
  causaRaiz: string | null;
  ishikawa: Ishikawa | null;
  cincoPorques: string[] | null;
  causasIshikawa?: number;
  cliente?: { id: string; nomeFantasia: string };
  area?: { id: string; nome: string } | null;
  colaborador?: { id: string; nome: string; funcao: string } | null;
  planoAcao?: { id: string; codigo: string; status: string } | null;
  rotulos?: { tipo: string; investigacao: string };
}

interface ResumoAcidentes {
  ultimos12Meses: number;
  comAfastamento: number;
  diasPerdidos: number;
  investigacoesAbertas: number;
  catsPendentes: number;
}

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

interface OpcaoColaborador {
  id: string;
  nome: string;
  funcao: string;
}

const PILL_INVESTIGACAO: Record<SituacaoInvestigacao, string> = {
  ABERTA: 'bad',
  EM_INVESTIGACAO: 'warn',
  CONCLUIDA: 'ok',
};

const NOVO_VAZIO = {
  clienteId: '',
  colaboradorId: '',
  data: '',
  tipo: 'TIPICO' as TipoAcidente,
  descricao: '',
  parteCorpoAtingida: '',
  comAfastamento: false,
  diasAfastamento: '0',
  catNumero: '',
  investigador: '',
  situacaoInvestigacao: 'ABERTA' as SituacaoInvestigacao,
  causaRaiz: '',
  ishikawa: ISHIKAWA_VAZIO as Ishikawa,
  cincoPorques: [] as string[],
};

const FILTRO_VAZIO = { busca: '', de: '', ate: '', situacaoInvestigacao: '' };

export function AcidentesPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('planos:escrever');

  const [carregando, setCarregando] = useState(true);
  const [itens, setItens] = useState<AcidenteApi[]>([]);
  const [resumo, setResumo] = useState<ResumoAcidentes | null>(null);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [colaboradores, setColaboradores] = useState<OpcaoColaborador[]>([]);

  const [filtro, setFiltro] = useState(FILTRO_VAZIO);
  const [novo, setNovo] = useState(NOVO_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  /** Mensagens por campo devolvidas pela API — sem isso o usuario via "corrija 2 campos" e nao sabia quais. */
  const [erros, setErros] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const parametros = new URLSearchParams();
      if (filtro.busca) parametros.set('busca', filtro.busca);
      if (filtro.de) parametros.set('de', filtro.de);
      if (filtro.ate) parametros.set('ate', filtro.ate);
      if (filtro.situacaoInvestigacao) parametros.set('situacaoInvestigacao', filtro.situacaoInvestigacao);
      const consulta = parametros.toString();

      const [lista, cards] = await Promise.all([
        api.get<AcidenteApi[]>(`/acidentes${consulta ? `?${consulta}` : ''}`),
        api.get<ResumoAcidentes>('/acidentes/resumo'),
      ]);
      setItens(lista);
      setResumo(cards);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os acidentes.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [filtro, mostrar]);

  useEffect(() => {
    void api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
    void api.get<OpcaoColaborador[]>('/colaboradores/opcoes').then(setColaboradores).catch(() => setColaboradores([]));
    void carregar();
  }, [carregar]);

  async function salvar() {
    setSalvando(true);
    try {
      // Ishikawa sem nenhuma causa e 5 Porques vazio vao como null — "nao
      // preenchido", nao "preenchido com nada".
      const corpo = {
        ...novo,
        colaboradorId: novo.colaboradorId || undefined,
        parteCorpoAtingida: novo.parteCorpoAtingida || undefined,
        catNumero: novo.catNumero || undefined,
        investigador: novo.investigador || undefined,
        causaRaiz: novo.causaRaiz || undefined,
        ishikawa: totalCausasIshikawa(novo.ishikawa) > 0 ? novo.ishikawa : null,
        cincoPorques: novo.cincoPorques.length > 0 ? novo.cincoPorques : null,
      };

      if (editandoId) {
        await api.put(`/acidentes/${editandoId}`, corpo);
        mostrar('Acidente atualizado.', 'sucesso');
      } else {
        await api.post('/acidentes', corpo);
        mostrar('Acidente registrado. Emita a CAT em até 1 dia útil.', 'sucesso');
      }
      setNovo(NOVO_VAZIO);
      setEditandoId(null);
      void carregar();
      setErros({});
    } catch (erro) {
      if (erro instanceof ErroApi) {
        const porCampo: Record<string, string> = {};
        for (const [campo, mensagens] of Object.entries(erro.campos)) porCampo[campo] = mensagens[0] ?? 'Valor invalido.';
        setErros(porCampo);
        const lista = Object.values(porCampo);
        mostrar(lista.length > 0 ? lista.join(' ') : erro.mensagemAmigavel(), 'erro');
      } else {
        mostrar('Falha ao salvar.', 'erro');
      }
    } finally {
      setSalvando(false);
    }
  }

  function editar(acidente: AcidenteApi) {
    setErros({});
    setEditandoId(acidente.id);
    setNovo({
      clienteId: acidente.cliente?.id ?? '',
      colaboradorId: acidente.colaborador?.id ?? '',
      data: acidente.data.slice(0, 10),
      tipo: acidente.tipo,
      descricao: acidente.descricao,
      parteCorpoAtingida: acidente.parteCorpoAtingida ?? '',
      comAfastamento: acidente.comAfastamento,
      diasAfastamento: String(acidente.diasAfastamento),
      catNumero: acidente.catNumero ?? '',
      investigador: acidente.investigador ?? '',
      situacaoInvestigacao: acidente.situacaoInvestigacao,
      causaRaiz: acidente.causaRaiz ?? '',
      ishikawa: { ...ISHIKAWA_VAZIO, ...(acidente.ishikawa ?? {}) },
      cincoPorques: acidente.cincoPorques ?? [],
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function definirIshikawa(categoria: (typeof CATEGORIAS_ISHIKAWA)[number], causas: string[]) {
    setNovo({ ...novo, ishikawa: { ...novo.ishikawa, [categoria]: causas } });
  }

  return (
    <>
      <div className="painel">
        <h3>Acidentes, CAT e Investigação</h3>
        <p className="desc">
          O registro formal que a observação de campo não cobre: CAT (evento S-2210 do eSocial, prazo de 1 dia útil) e
          investigação com causa raiz. Investigação concluída <b>exige</b> a causa raiz — senão não investigou nada.
        </p>

        {resumo ? (
          <div className="stat-grid">
            <div className="stat">
              <b>{resumo.ultimos12Meses}</b>
              <span>acidentes (12 meses)</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.comAfastamento > 0 ? 'var(--red)' : undefined }}>{resumo.comAfastamento}</b>
              <span>com afastamento</span>
            </div>
            <div className="stat">
              <b>{resumo.diasPerdidos}</b>
              <span>dias perdidos</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.catsPendentes > 0 ? 'var(--red)' : undefined }}>{resumo.catsPendentes}</b>
              <span>CAT pendente(s)</span>
            </div>
            <div className="stat">
              <b>{resumo.investigacoesAbertas}</b>
              <span>investigações abertas</span>
            </div>
          </div>
        ) : null}
      </div>

      {podeEscrever ? (
        <div className="painel">
          <h3>{editandoId ? 'Editar acidente / investigação' : 'Registrar acidente'}</h3>
          <div className="filtros">
            <Campo label="Cliente" htmlFor="ac-cliente" obrigatorio erro={erros.clienteId}>
              <select id="ac-cliente" value={novo.clienteId} onChange={(e) => setNovo({ ...novo, clienteId: e.target.value })}>
                <option value="">Selecione...</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nomeFantasia}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Colaborador" htmlFor="ac-colab" erro={erros.colaboradorId}>
              <select id="ac-colab" value={novo.colaboradorId} onChange={(e) => setNovo({ ...novo, colaboradorId: e.target.value })}>
                <option value="">Não identificado</option>
                {colaboradores.map((colaborador) => (
                  <option key={colaborador.id} value={colaborador.id}>
                    {colaborador.nome} — {colaborador.funcao}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Data" htmlFor="ac-data" obrigatorio erro={erros.data}>
              <input id="ac-data" type="date" value={novo.data} onChange={(e) => setNovo({ ...novo, data: e.target.value })} />
            </Campo>
            <Campo label="Tipo" htmlFor="ac-tipo" obrigatorio erro={erros.tipo}>
              <select id="ac-tipo" value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as TipoAcidente })}>
                {TIPOS_ACIDENTE.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {ROTULO_TIPO_ACIDENTE[tipo]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Parte do corpo" htmlFor="ac-parte">
              <input id="ac-parte" value={novo.parteCorpoAtingida} onChange={(e) => setNovo({ ...novo, parteCorpoAtingida: e.target.value })} />
            </Campo>
          </div>

          <Campo label="Descrição do acidente" htmlFor="ac-desc" obrigatorio erro={erros.descricao}>
            <textarea id="ac-desc" rows={2} value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
          </Campo>

          <div className="filtros">
            <div className="check-linha">
              <label>
                <input
                  type="checkbox"
                  checked={novo.comAfastamento}
                  onChange={(e) => setNovo({ ...novo, comAfastamento: e.target.checked, diasAfastamento: e.target.checked ? novo.diasAfastamento : '0' })}
                />
                Com afastamento
              </label>
            </div>
            {novo.comAfastamento ? (
              <Campo label="Dias de afastamento" htmlFor="ac-dias" erro={erros.diasAfastamento}>
                <input id="ac-dias" type="number" min={0} className="estreito" value={novo.diasAfastamento} onChange={(e) => setNovo({ ...novo, diasAfastamento: e.target.value })} />
              </Campo>
            ) : null}
            <Campo label="Nº da CAT (S-2210)" htmlFor="ac-cat" ajuda="Prazo legal: 1 dia útil." erro={erros.catNumero}>
              <input id="ac-cat" className="mono" value={novo.catNumero} onChange={(e) => setNovo({ ...novo, catNumero: e.target.value })} />
            </Campo>
            <Campo label="Investigador" htmlFor="ac-inv" erro={erros.investigador}>
              <input id="ac-inv" value={novo.investigador} onChange={(e) => setNovo({ ...novo, investigador: e.target.value })} />
            </Campo>
            <Campo label="Situação da investigação" htmlFor="ac-sit" erro={erros.situacaoInvestigacao}>
              <select
                id="ac-sit"
                value={novo.situacaoInvestigacao}
                onChange={(e) => setNovo({ ...novo, situacaoInvestigacao: e.target.value as SituacaoInvestigacao })}
              >
                {SITUACOES_INVESTIGACAO.map((situacao) => (
                  <option key={situacao} value={situacao}>
                    {ROTULO_INVESTIGACAO[situacao]}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          {novo.situacaoInvestigacao !== 'ABERTA' ? (
            <>
              <h4>Diagrama de Ishikawa (6M)</h4>
              <p className="desc">
                Levante as causas possíveis em cada categoria. A pergunta-guia ajuda a não deixar categoria em branco por
                esquecimento — em branco por não se aplicar é legítimo.
              </p>
              <div className="ishikawa-grid">
                {CATEGORIAS_ISHIKAWA.map((categoria) => (
                  <div key={categoria} className="ishikawa-categoria">
                    <h5>
                      {ROTULO_ISHIKAWA[categoria]}
                      {novo.ishikawa[categoria].length > 0 ? <span className="pill gray"> {novo.ishikawa[categoria].length}</span> : null}
                    </h5>
                    <div className="hint">{PERGUNTA_ISHIKAWA[categoria]}</div>
                    <ListaEditavel
                      itens={novo.ishikawa[categoria]}
                      onChange={(causas) => definirIshikawa(categoria, causas)}
                      placeholder="Causa possível"
                    />
                  </div>
                ))}
              </div>

              <h4>5 Porquês</h4>
              <p className="desc">
                Parta do fato e pergunte “por quê?” até chegar a uma causa que a organização consegue controlar. Cinco é
                a convenção; a cadeia para quando chega lá.
              </p>
              <ListaEditavel
                itens={novo.cincoPorques}
                onChange={(cincoPorques) => setNovo({ ...novo, cincoPorques })}
                placeholder={novo.cincoPorques.length === 0 ? 'O que aconteceu?' : 'Por quê?'}
                numerada
                maximo={7}
              />

              <Campo
                label="Causa raiz"
                htmlFor="ac-causa"
                obrigatorio={novo.situacaoInvestigacao === 'CONCLUIDA'}
                ajuda="A conclusão da análise. Obrigatória para concluir a investigação."
                erro={erros.causaRaiz}
              >
                <textarea id="ac-causa" rows={2} value={novo.causaRaiz} onChange={(e) => setNovo({ ...novo, causaRaiz: e.target.value })} />
              </Campo>
            </>
          ) : null}

          {Object.keys(erros).length > 0 ? (
            <div className="hint alerta" role="alert">
              <b>Corrija antes de salvar:</b>
              <ul style={{ margin: '4px 0 0 18px' }}>
                {Object.entries(erros).map(([campo, mensagem]) => (
                  <li key={campo}>
                    <span className="mono">{campo === '_' ? 'geral' : campo}</span> — {mensagem}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="barra-acoes">
            <button
              type="button"
              className="btn btn-primary"
              disabled={salvando}
              onClick={() => void salvar()}
            >
              {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Registrar acidente'}
            </button>
            {editandoId ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEditandoId(null);
                  setNovo(NOVO_VAZIO);
                }}
              >
                Cancelar edição
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="painel">
        <div className="filtros">
          <Campo label="Buscar" htmlFor="fa-busca" ajuda="Descrição, causa raiz, colaborador, área ou nº da CAT.">
            <input id="fa-busca" value={filtro.busca} onChange={(e) => setFiltro({ ...filtro, busca: e.target.value })} placeholder="Texto livre" />
          </Campo>
          <Campo label="De" htmlFor="fa-de">
            <input id="fa-de" type="date" value={filtro.de} onChange={(e) => setFiltro({ ...filtro, de: e.target.value })} />
          </Campo>
          <Campo label="Até" htmlFor="fa-ate">
            <input id="fa-ate" type="date" value={filtro.ate} onChange={(e) => setFiltro({ ...filtro, ate: e.target.value })} />
          </Campo>
          <Campo label="Investigação" htmlFor="fa-sit">
            <select id="fa-sit" value={filtro.situacaoInvestigacao} onChange={(e) => setFiltro({ ...filtro, situacaoInvestigacao: e.target.value })}>
              <option value="">Todas</option>
              {SITUACOES_INVESTIGACAO.map((situacao) => (
                <option key={situacao} value={situacao}>
                  {ROTULO_INVESTIGACAO[situacao]}
                </option>
              ))}
            </select>
          </Campo>
          <div style={{ alignSelf: 'end' }}>
            <Link to="/acidentes/relatorio-diario" className="btn btn-ghost">
              <Icone nome="documento" /> Relatório diário
            </Link>
          </div>
        </div>

        {carregando ? (
          <div className="centro-tela">
            <div className="spinner" />
            Carregando...
          </div>
        ) : itens.length === 0 ? (
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="ok" tamanho={22} />
            </div>
            <h4>{filtro.busca || filtro.de || filtro.ate || filtro.situacaoInvestigacao ? 'Nada encontrado com esses filtros' : 'Nenhum acidente registrado'}</h4>
            <p>{filtro.busca ? 'Tente outro termo ou limpe os filtros.' : 'É a meta. Quando houver registro, a CAT e a investigação são cobradas aqui.'}</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Acidente</th>
                  <th>Envolvido</th>
                  <th>Afastamento</th>
                  <th>CAT</th>
                  <th>Investigação</th>
                  {podeEscrever ? <th aria-label="Ações" /> : null}
                </tr>
              </thead>
              <tbody>
                {itens.map((acidente) => (
                  <tr key={acidente.id}>
                    <td>{formatarDataIso(acidente.data)}</td>
                    <td>
                      <b>{acidente.rotulos?.tipo ?? acidente.tipo}</b>
                      <div className="hint">{acidente.descricao.slice(0, 80)}</div>
                    </td>
                    <td>
                      {acidente.colaborador?.nome ?? '—'}
                      <div className="hint">{acidente.cliente?.nomeFantasia}</div>
                    </td>
                    <td>
                      {acidente.comAfastamento ? (
                        <span className="pill bad">{acidente.diasAfastamento} dia(s)</span>
                      ) : (
                        <span className="pill ok">Sem afastamento</span>
                      )}
                    </td>
                    <td>
                      {acidente.catNumero ? (
                        <span className="mono">{acidente.catNumero}</span>
                      ) : acidente.catPendente ? (
                        <span className="pill bad">Pendente</span>
                      ) : (
                        <span className="hint">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`pill ${PILL_INVESTIGACAO[acidente.situacaoInvestigacao]}`}>
                        {acidente.rotulos?.investigacao ?? acidente.situacaoInvestigacao}
                      </span>
                      {acidente.causaRaiz ? <div className="hint">{acidente.causaRaiz.slice(0, 60)}</div> : null}
                      {(acidente.causasIshikawa ?? 0) > 0 || (acidente.cincoPorques?.length ?? 0) > 0 ? (
                        <div className="hint">
                          {acidente.causasIshikawa ? `Ishikawa: ${acidente.causasIshikawa} causa(s)` : null}
                          {acidente.causasIshikawa && acidente.cincoPorques?.length ? ' · ' : null}
                          {acidente.cincoPorques?.length ? `${acidente.cincoPorques.length} porquê(s)` : null}
                        </div>
                      ) : null}
                    </td>
                    {podeEscrever ? (
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => editar(acidente)}>
                          {acidente.situacaoInvestigacao === 'CONCLUIDA' ? 'Editar' : 'Investigar'}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
