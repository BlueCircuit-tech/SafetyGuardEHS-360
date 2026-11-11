import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { formatarDataHora, formatarDataIso } from '../lib/datas';
import type { CarteirinhaApi, ColaboradorApi, DocumentacaoColaboradorApi, Paginado } from '../lib/saude';
import { useSessao } from '../lib/sessao';

/**
 * Etapa 24 — Liberação de equipe ("funcionários que irão trabalhar").
 *
 * O líder escolhe quem vai para a atividade; a tela cruza ASO, treinamentos,
 * pasta de documentos e bloqueio de cada um e responde "pode trabalhar?".
 * O resultado vira uma folha imprimível com assinatura do responsável.
 */

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

interface Logos {
  consultoria: { nome: string; logo: string | null } | null;
  cliente: { nome: string; logo: string | null } | null;
}

type Veredito = 'LIBERADO' | 'RESSALVA' | 'IMPEDIDO' | 'ERRO';

interface ResultadoColaborador {
  colaborador: ColaboradorApi;
  carteirinha: CarteirinhaApi | null;
  documentacao: DocumentacaoColaboradorApi | null;
  veredito: Veredito;
  impedimentos: string[];
  ressalvas: string[];
}

const PILL_VEREDITO: Record<Veredito, string> = {
  LIBERADO: 'ok',
  RESSALVA: 'warn',
  IMPEDIDO: 'bad',
  ERRO: 'gray',
};

const ROTULO_VEREDITO: Record<Veredito, string> = {
  LIBERADO: 'Sim',
  RESSALVA: 'Sim, com pendências',
  IMPEDIDO: 'Não',
  ERRO: 'Não verificado',
};

function hojeIso(): string {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function avaliar(
  colaborador: ColaboradorApi,
  carteirinha: CarteirinhaApi | null,
  documentacao: DocumentacaoColaboradorApi | null,
): ResultadoColaborador {
  if (!carteirinha) {
    return {
      colaborador,
      carteirinha,
      documentacao,
      veredito: 'ERRO',
      impedimentos: ['Não foi possível consultar a situação'],
      ressalvas: [],
    };
  }

  const impedimentos: string[] = [];
  if (carteirinha.colaborador.bloqueado) {
    impedimentos.push(`Bloqueado${carteirinha.colaborador.motivoBloqueio ? `: ${carteirinha.colaborador.motivoBloqueio}` : ''}`);
  }
  if (!carteirinha.aso) impedimentos.push('Sem ASO');
  else if (carteirinha.aso.situacao === 'VENCIDO') impedimentos.push('ASO vencido');
  if (carteirinha.aso?.resultado?.toUpperCase().startsWith('INAPTO')) impedimentos.push('ASO inapto');
  if (carteirinha.colaborador.situacao !== 'Ativo') impedimentos.push(`Situação: ${carteirinha.colaborador.situacao}`);
  if (!carteirinha.liberado && impedimentos.length === 0) impedimentos.push('Não liberado pelo cadastro');

  const ressalvas: string[] = [];
  const vencidos = carteirinha.treinamentos.filter((t) => t.situacao === 'VENCIDO');
  if (vencidos.length > 0) ressalvas.push(`Treinamento vencido: ${vencidos.map((t) => t.norma ?? t.nome).join(', ')}`);
  const faltantes = carteirinha.treinamentosFaltantes ?? [];
  if (faltantes.length > 0) ressalvas.push(`Treinamento exigido não realizado: ${faltantes.map((t) => t.norma ?? t.nome).join(', ')}`);
  if (carteirinha.aso?.situacao === 'A_VENCER') ressalvas.push('ASO vence em breve');
  const pendenciasDocs = (documentacao?.pendencias ?? []).filter((p) => !p.startsWith('ASO'));
  ressalvas.push(...pendenciasDocs);
  if (!documentacao) ressalvas.push('Pasta de documentos não consultada');

  return {
    colaborador,
    carteirinha,
    documentacao,
    veredito: impedimentos.length > 0 ? 'IMPEDIDO' : ressalvas.length > 0 ? 'RESSALVA' : 'LIBERADO',
    impedimentos,
    ressalvas,
  };
}

export function LiberacaoEquipePage() {
  const { mostrar } = useToast();
  const { usuario } = useSessao();

  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [colaboradores, setColaboradores] = useState<ColaboradorApi[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [busca, setBusca] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const [atividade, setAtividade] = useState('');
  const [data, setData] = useState(hojeIso());
  const [local, setLocal] = useState('');
  const [responsavel, setResponsavel] = useState(usuario?.nome ?? '');
  const [erros, setErros] = useState<Record<string, string>>({});

  const [verificando, setVerificando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoColaborador[] | null>(null);
  const [verificadoEm, setVerificadoEm] = useState<string | null>(null);
  const [logos, setLogos] = useState<Logos>({ consultoria: null, cliente: null });

  useEffect(() => {
    api
      .get<OpcaoCliente[]>('/clientes/opcoes')
      .then(setClientes)
      .catch(() => setClientes([]));
    api
      .get<{ nomeFantasia: string; logoUrl: string | null }>('/empresa')
      .then((empresa) =>
        setLogos((atual) => ({ ...atual, consultoria: { nome: empresa.nomeFantasia, logo: urlAbsoluta(empresa.logoUrl) } })),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setSelecionados(new Set());
    setResultados(null);
    if (!clienteId) {
      setColaboradores([]);
      setLogos((atual) => ({ ...atual, cliente: null }));
      return;
    }
    let ativo = true;
    setCarregandoLista(true);
    api
      .get<Paginado<ColaboradorApi>>(`/colaboradores?clienteId=${clienteId}&situacao=ATIVO&porPagina=200`)
      .then((pagina) => {
        if (ativo) setColaboradores(pagina.itens);
      })
      .catch((erro) => {
        if (!ativo) return;
        setColaboradores([]);
        mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao carregar os colaboradores.', 'erro');
      })
      .finally(() => {
        if (ativo) setCarregandoLista(false);
      });
    api
      .get<{ nomeFantasia: string; logoUrl: string | null }>(`/clientes/${clienteId}`)
      .then((cliente) => {
        if (ativo) setLogos((atual) => ({ ...atual, cliente: { nome: cliente.nomeFantasia, logo: urlAbsoluta(cliente.logoUrl) } }));
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [clienteId, mostrar]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return colaboradores;
    return colaboradores.filter((c) =>
      [c.nome, c.funcao, c.setor ?? '', c.matricula ?? '', c.cpfFormatado].some((campo) => campo.toLowerCase().includes(termo)),
    );
  }, [colaboradores, busca]);

  function alternar(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function marcarVisiveis(marcar: boolean) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      for (const c of visiveis) {
        if (marcar) novo.add(c.id);
        else novo.delete(c.id);
      }
      return novo;
    });
  }

  async function verificar() {
    const novosErros: Record<string, string> = {};
    if (!clienteId) novosErros.cliente = 'Escolha o cliente.';
    if (selecionados.size === 0) novosErros.selecao = 'Marque ao menos um colaborador.';
    if (!atividade.trim()) novosErros.atividade = 'Informe a atividade.';
    if (!data) novosErros.data = 'Informe a data.';
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) {
      mostrar('Preencha os campos destacados.', 'erro');
      return;
    }

    setVerificando(true);
    try {
      const escolhidos = colaboradores.filter((c) => selecionados.has(c.id));
      const avaliados = await Promise.all(
        escolhidos.map(async (colaborador) => {
          const [carteirinha, documentacao] = await Promise.all([
            api.get<CarteirinhaApi>(`/colaboradores/${colaborador.id}/carteirinha`).catch(() => null),
            api.get<DocumentacaoColaboradorApi>(`/colaboradores/${colaborador.id}/documentacao`).catch(() => null),
          ]);
          return avaliar(colaborador, carteirinha, documentacao);
        }),
      );
      const ordem: Record<Veredito, number> = { IMPEDIDO: 0, ERRO: 1, RESSALVA: 2, LIBERADO: 3 };
      avaliados.sort((a, b) => ordem[a.veredito] - ordem[b.veredito] || a.colaborador.nome.localeCompare(b.colaborador.nome, 'pt-BR'));
      setResultados(avaliados);
      setVerificadoEm(new Date().toISOString());
    } finally {
      setVerificando(false);
    }
  }

  const contagem = useMemo(() => {
    const base = { LIBERADO: 0, RESSALVA: 0, IMPEDIDO: 0, ERRO: 0 } as Record<Veredito, number>;
    for (const r of resultados ?? []) base[r.veredito] += 1;
    return base;
  }, [resultados]);

  const nomeCliente = clientes.find((c) => c.id === clienteId)?.nomeFantasia ?? logos.cliente?.nome ?? '';

  return (
    <>
      <div className="painel sem-impressao">
        <h3>Liberação de equipe</h3>
        <p className="desc">
          Marque os funcionários que irão trabalhar e veja, um a um, se podem ser liberados: ASO, treinamentos, documentos
          da pasta e bloqueios. Ao final, imprima a lista de liberação para assinatura.
        </p>

        <div className="filtros">
          <Campo label="Cliente" htmlFor="le-cliente" obrigatorio erro={erros.cliente}>
            <select id="le-cliente" value={clienteId} onChange={(evento) => setClienteId(evento.target.value)}>
              <option value="">Selecione...</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Atividade" htmlFor="le-atividade" obrigatorio erro={erros.atividade}>
            <input
              id="le-atividade"
              className="busca"
              placeholder="Ex.: manutenção da cobertura do galpão 2"
              value={atividade}
              onChange={(evento) => setAtividade(evento.target.value)}
            />
          </Campo>
          <Campo label="Data" htmlFor="le-data" obrigatorio erro={erros.data}>
            <input id="le-data" type="date" value={data} onChange={(evento) => setData(evento.target.value)} />
          </Campo>
          <Campo label="Local" htmlFor="le-local">
            <input id="le-local" value={local} onChange={(evento) => setLocal(evento.target.value)} />
          </Campo>
          <Campo label="Responsável pela liberação" htmlFor="le-responsavel">
            <input id="le-responsavel" value={responsavel} onChange={(evento) => setResponsavel(evento.target.value)} />
          </Campo>
        </div>
      </div>

      {clienteId ? (
        <div className="painel sem-impressao">
          <h3>
            Funcionários ({selecionados.size} de {colaboradores.length} marcados)
          </h3>
          {erros.selecao ? <p className="hint alerta">{erros.selecao}</p> : null}

          <div className="filtros">
            <Campo label="Buscar" htmlFor="le-busca">
              <input
                id="le-busca"
                className="busca"
                placeholder="Nome, função, setor, matrícula ou CPF"
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
              />
            </Campo>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => marcarVisiveis(true)}>
              Marcar {busca ? 'filtrados' : 'todos'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => marcarVisiveis(false)}>
              Desmarcar {busca ? 'filtrados' : 'todos'}
            </button>
          </div>

          {carregandoLista ? (
            <div className="centro-tela">
              <div className="spinner" />
              Carregando...
            </div>
          ) : visiveis.length === 0 ? (
            <p className="hint">Nenhum colaborador ativo {busca ? 'para esta busca' : 'neste cliente'}.</p>
          ) : (
            <div className="tbl-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th aria-label="Selecionar" />
                    <th>Colaborador</th>
                    <th>Função</th>
                    <th>Situação rápida</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((colaborador) => (
                    <tr key={colaborador.id} onClick={() => alternar(colaborador.id)} style={{ cursor: 'pointer' }}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${colaborador.nome}`}
                          checked={selecionados.has(colaborador.id)}
                          onChange={() => alternar(colaborador.id)}
                          onClick={(evento) => evento.stopPropagation()}
                        />
                      </td>
                      <td>
                        <b>{colaborador.nome}</b>
                        <div className="hint">
                          {colaborador.matricula ? `mat. ${colaborador.matricula} · ` : ''}
                          {colaborador.terceiro?.nomeFantasia ?? colaborador.cliente?.nomeFantasia ?? ''}
                        </div>
                      </td>
                      <td>{colaborador.funcao}</td>
                      <td>
                        {colaborador.bloqueado ? (
                          <span className="pill bad" title={colaborador.motivoBloqueio ?? ''}>
                            Bloqueado
                          </span>
                        ) : colaborador.impedido ? (
                          <span className="pill bad">Impedido (ASO)</span>
                        ) : (
                          <span className="pill ok">ASO ok</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="barra-acoes">
            <button type="button" className="btn btn-primary" disabled={verificando} onClick={() => void verificar()}>
              <Icone nome="ok" /> {verificando ? `Verificando ${selecionados.size}...` : 'Verificar equipe'}
            </button>
          </div>
        </div>
      ) : null}

      {resultados ? (
        <>
          <div className="painel sem-impressao">
            <h3>Pode trabalhar?</h3>
            <div className="stat-grid">
              <div className="stat">
                <b style={{ color: 'var(--primary)' }}>{contagem.LIBERADO}</b>
                <span>liberados</span>
              </div>
              <div className="stat">
                <b>{contagem.RESSALVA}</b>
                <span>liberados com pendências</span>
              </div>
              <div className="stat">
                <b style={{ color: contagem.IMPEDIDO > 0 ? 'var(--red)' : undefined }}>{contagem.IMPEDIDO}</b>
                <span>impedidos</span>
              </div>
              {contagem.ERRO > 0 ? (
                <div className="stat">
                  <b>{contagem.ERRO}</b>
                  <span>não verificados</span>
                </div>
              ) : null}
            </div>
            <p className="hint">
              <b>Não</b> = ASO vencido/ausente/inapto, bloqueio ou colaborador não ativo. <b>Com pendências</b> = pode
              trabalhar, mas há treinamento vencido ou documento faltando na pasta — regularize.
            </p>
            <div className="barra-acoes">
              <button type="button" className="btn btn-primary" onClick={() => window.print()}>
                <Icone nome="impressora" /> Imprimir lista de liberação
              </button>
            </div>
          </div>

          <div className="painel folha folha-paisagem">
            <div className="folha-cabecalho">
              <div>
                <div className="folha-logos">
                  {logos.consultoria?.logo ? <img src={logos.consultoria.logo} alt={logos.consultoria.nome} /> : null}
                  {logos.cliente?.logo ? <img src={logos.cliente.logo} alt={logos.cliente.nome} /> : null}
                </div>
                <h2>Lista de liberação de equipe</h2>
              </div>
              <div className="meta">
                {verificadoEm ? <div>Verificado em {formatarDataHora(verificadoEm)}</div> : null}
                <div>
                  {contagem.LIBERADO + contagem.RESSALVA} liberado(s) · {contagem.IMPEDIDO} impedido(s)
                </div>
              </div>
            </div>

            <dl className="folha-dados" style={{ marginBottom: 16 }}>
              <div>
                <dt>Cliente</dt>
                <dd>{nomeCliente || '—'}</dd>
              </div>
              <div>
                <dt>Atividade</dt>
                <dd>{atividade || '—'}</dd>
              </div>
              <div>
                <dt>Data</dt>
                <dd>{formatarDataIso(data)}</dd>
              </div>
              <div>
                <dt>Local</dt>
                <dd>{local || '—'}</dd>
              </div>
            </dl>

            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    <th>Função</th>
                    <th>ASO</th>
                    <th>Treinamentos</th>
                    <th>Documentos</th>
                    <th>Bloqueio</th>
                    <th>Pode trabalhar?</th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((r) => {
                    const treinos = r.carteirinha?.treinamentos ?? [];
                    const treinosValidos = treinos.filter((t) => t.situacao !== 'VENCIDO');
                    const treinosVencidos = treinos.filter((t) => t.situacao === 'VENCIDO');
                    const pendDocs = (r.documentacao?.pendencias ?? []).filter((p) => !p.startsWith('ASO'));
                    return (
                      <tr key={r.colaborador.id}>
                        <td>
                          <Link to={`/colaboradores/${r.colaborador.id}`}>
                            <b>{r.colaborador.nome}</b>
                          </Link>
                          <div className="hint">
                            {r.carteirinha?.empregador ?? r.colaborador.cliente?.nomeFantasia ?? ''}
                            {r.colaborador.matricula ? ` · mat. ${r.colaborador.matricula}` : ''}
                          </div>
                        </td>
                        <td>{r.colaborador.funcao}</td>
                        <td>
                          {r.carteirinha?.aso ? (
                            <>
                              <span
                                className={`pill ${r.carteirinha.aso.situacao === 'VENCIDO' ? 'bad' : r.carteirinha.aso.situacao === 'A_VENCER' ? 'warn' : 'ok'}`}
                              >
                                {r.carteirinha.aso.validade ? formatarDataIso(r.carteirinha.aso.validade) : 'sem validade'}
                              </span>
                              <div className="hint">{r.carteirinha.aso.resultado}</div>
                            </>
                          ) : r.carteirinha ? (
                            <span className="pill bad">Sem ASO</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          {treinos.length === 0 ? (
                            <span className="hint">nenhum registrado</span>
                          ) : (
                            <>
                              {treinosValidos.length > 0 ? (
                                <div>{treinosValidos.map((t) => t.norma ?? t.nome).join(', ')}</div>
                              ) : null}
                              {treinosVencidos.length > 0 ? (
                                <div style={{ color: 'var(--red)' }}>
                                  Vencido: {treinosVencidos.map((t) => t.norma ?? t.nome).join(', ')}
                                </div>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td>
                          {!r.documentacao ? (
                            '—'
                          ) : pendDocs.length === 0 ? (
                            <span className="pill ok">Completa</span>
                          ) : (
                            <span title={pendDocs.join('\n')}>
                              <span className="pill warn">{pendDocs.length} pendência(s)</span>
                              <div className="hint">{pendDocs.slice(0, 3).join('; ')}{pendDocs.length > 3 ? '…' : ''}</div>
                            </span>
                          )}
                        </td>
                        <td>
                          {r.carteirinha?.colaborador.bloqueado ? (
                            <>
                              <span className="pill bad">Bloqueado</span>
                              {r.carteirinha.colaborador.motivoBloqueio ? (
                                <div className="hint">{r.carteirinha.colaborador.motivoBloqueio}</div>
                              ) : null}
                            </>
                          ) : (
                            <span className="hint">—</span>
                          )}
                        </td>
                        <td>
                          <span className={`pill ${PILL_VEREDITO[r.veredito]}`}>{ROTULO_VEREDITO[r.veredito]}</span>
                          {r.impedimentos.length > 0 ? <div className="hint">{r.impedimentos.join('; ')}</div> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="hint" style={{ marginTop: 12 }}>
              Somente os colaboradores com “Sim” podem iniciar a atividade. Os marcados “Não” devem ser substituídos ou
              regularizados antes do início.
            </p>

            <div className="folha-assinatura">
              <div>
                <div style={{ height: 50 }} />
                {responsavel || 'Responsável pela liberação'} — Responsável pela liberação
              </div>
              <div>
                <div style={{ height: 50 }} />
                Responsável pela atividade / líder
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
