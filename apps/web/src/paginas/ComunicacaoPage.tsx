import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icone } from '../componentes/Icone';
import { Link } from 'react-router-dom';
import {
  CANAIS_NOTIFICACAO,
  ROTULO_HIERARQUIA,
  ROTULO_STATUS_NOTIFICACAO,
  STATUS_NOTIFICACAO,
  type CanalNotificacao,
  type NivelHierarquia,
  type StatusNotificacao,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import { formatarDataHora } from '../lib/datas';
import type { NotificacaoApi, ResumoNotificacoes } from '../lib/plano-form';

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

const POR_PAGINA = 25;

const RESUMO_VAZIO: ResumoNotificacoes = {
  total: 0,
  email: 0,
  whatsapp: 0,
  simuladas: 0,
  enviadas: 0,
  falhas: 0,
  porEscalonamento: 0,
};

const PILL_STATUS: Record<StatusNotificacao, string> = {
  SIMULADA: 'warn',
  ENVIADA: 'ok',
  FALHOU: 'bad',
};

export function ComunicacaoPage() {
  const { mostrar } = useToast();

  const [carregando, setCarregando] = useState(true);
  const [semMatriz, setSemMatriz] = useState(false);
  const [itens, setItens] = useState<NotificacaoApi[]>([]);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState<ResumoNotificacoes>(RESUMO_VAZIO);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [expandida, setExpandida] = useState<string | null>(null);

  const [clienteId, setClienteId] = useState('');
  const [canal, setCanal] = useState<CanalNotificacao | ''>('');
  const [status, setStatus] = useState<StatusNotificacao | ''>('');
  const [numeroPagina, setNumeroPagina] = useState(1);

  useEffect(() => {
    api
      .get<OpcaoCliente[]>('/clientes/opcoes?incluirInativos=true')
      .then(setClientes)
      .catch(() => setClientes([]));
  }, []);

  const consulta = useMemo(() => {
    const parametros = new URLSearchParams({ pagina: String(numeroPagina), porPagina: String(POR_PAGINA) });
    if (clienteId) parametros.set('clienteId', clienteId);
    if (canal) parametros.set('canal', canal);
    if (status) parametros.set('status', status);
    return parametros.toString();
  }, [clienteId, canal, status, numeroPagina]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const escopo = clienteId ? `?clienteId=${clienteId}` : '';
      const [lista, contagens] = await Promise.all([
        api.get<{ itens: NotificacaoApi[]; total: number; totalPaginas: number }>(`/notificacoes?${consulta}`),
        api.get<ResumoNotificacoes>(`/notificacoes/resumo${escopo}`),
      ]);
      setItens(lista.itens);
      setTotal(lista.total);
      setTotalPaginas(lista.totalPaginas);
      setResumo(contagens);
      setSemMatriz(false);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.codigo === 'MATRIZ_NAO_CADASTRADA') {
        setSemMatriz(true);
      } else {
        mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar as notificacoes.', 'erro');
      }
    } finally {
      setCarregando(false);
    }
  }, [consulta, clienteId, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (semMatriz) {
    return (
      <div className="painel">
        <div className="vazio">
          <div className="icone-vazio" aria-hidden="true">
              <Icone nome="predio" tamanho={22} />
            </div>
          <h4>Conclua as etapas anteriores</h4>
          <Link className="btn btn-primary" to="/empresa">
            Ir para o cadastro da matriz
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Comunicação automática</h2>
          <p>
            Tudo que a matriz de comunicação decidiu enviar: canal, destinatários, prazo e conteúdo — inclusive os
            escalonamentos por prazo estourado.
          </p>
        </div>
        <Link className="btn btn-outline" to="/planos-acao">
          <Icone nome="alvo" /> Planos de ação
        </Link>
      </div>

      <div className="hint">
        <Icone nome="alerta" /> <b>Nenhum provedor está conectado.</b> As mensagens são montadas com o cabeçalho e a assinatura
        institucionais da matriz e registradas como <b>simuladas</b> — dá para auditar exatamente o que sairia. Plugar
        e-mail ou WhatsApp muda só o status para <i>Enviada</i>.
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="lbl">Alertas gerados</div>
          <div className="num">{resumo.total}</div>
        </div>
        <div className="stat">
          <div className="lbl">E-mails</div>
          <div className="num" style={{ color: 'var(--blue)' }}>
            {resumo.email}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">WhatsApp</div>
          <div className="num" style={{ color: 'var(--green)' }}>
            {resumo.whatsapp}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Por escalonamento</div>
          <div className="num" style={{ color: resumo.porEscalonamento > 0 ? 'var(--red)' : 'var(--gray)' }}>
            {resumo.porEscalonamento}
          </div>
          <div className="sub">prazo estourado</div>
        </div>
        <div className="stat">
          <div className="lbl">Situação</div>
          <div className="num" style={{ color: 'var(--yellow)' }}>
            {resumo.simuladas}
          </div>
          <div className="sub">
            simuladas · {resumo.enviadas} enviadas · {resumo.falhas} falhas
          </div>
        </div>
      </div>

      <div className="painel">
        <div className="filtros">
          <Campo label="Cliente" htmlFor="filtro-cliente-notif">
            <select
              id="filtro-cliente-notif"
              value={clienteId}
              onChange={(e) => {
                setClienteId(e.target.value);
                setNumeroPagina(1);
              }}
              style={{ width: 210 }}
            >
              <option value="">Todos</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Canal" htmlFor="filtro-canal">
            <select
              id="filtro-canal"
              value={canal}
              onChange={(e) => {
                setCanal(e.target.value as CanalNotificacao | '');
                setNumeroPagina(1);
              }}
              style={{ width: 150 }}
            >
              <option value="">Todos</option>
              {CANAIS_NOTIFICACAO.map((valor) => (
                <option key={valor} value={valor}>
                  {valor === 'EMAIL' ? 'E-mail' : 'WhatsApp'}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Situação" htmlFor="filtro-status-notif">
            <select
              id="filtro-status-notif"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as StatusNotificacao | '');
                setNumeroPagina(1);
              }}
              style={{ width: 200 }}
            >
              <option value="">Todas</option>
              {STATUS_NOTIFICACAO.map((valor) => (
                <option key={valor} value={valor}>
                  {ROTULO_STATUS_NOTIFICACAO[valor]}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        {carregando && itens.length === 0 ? (
          <div className="vazio">
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            Carregando...
          </div>
        ) : itens.length === 0 ? (
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="envelope" tamanho={22} />
            </div>
            <h4>Nenhuma notificação gerada</h4>
            <p>Alertas são criados quando um plano de ação é aberto ou escalonado.</p>
          </div>
        ) : (
          <>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Canal</th>
                    <th>Plano</th>
                    <th>Destinatários</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {itens.map((notificacao) => (
                    <>
                      <tr key={notificacao.id}>
                        <td>{formatarDataHora(notificacao.criadoEm)}</td>
                        <td>
                          <span className={`pill ${notificacao.canal === 'EMAIL' ? 'info' : 'ok'}`}>
                            {notificacao.canal === 'EMAIL' ? 'E-mail' : 'WhatsApp'}
                          </span>
                          {notificacao.nivelEscalonamento > 0 ? (
                            <div className="secundario" style={{ color: 'var(--red)' }}>
                              escalonamento nível {notificacao.nivelEscalonamento}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          {notificacao.planoAcao ? (
                            <>
                              <Link to={`/planos-acao/${notificacao.planoAcao.id}`}>
                                <b>{notificacao.planoAcao.codigo}</b>
                              </Link>
                              <div className="secundario">{notificacao.planoAcao.acao}</div>
                            </>
                          ) : (
                            '—'
                          )}
                          <div className="secundario">{notificacao.cliente?.nomeFantasia}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {/* O mesmo nivel pode repetir na lista — o indice desempata a key. */}
                            {notificacao.destinatarios.split(',').map((destinatario, posicao) => (
                              <span className="pill gray" key={`${destinatario}-${posicao}`}>
                                {ROTULO_HIERARQUIA[destinatario as NivelHierarquia] ?? destinatario}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span className={`pill ${PILL_STATUS[notificacao.status]}`}>
                            {ROTULO_STATUS_NOTIFICACAO[notificacao.status]}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setExpandida(expandida === notificacao.id ? null : notificacao.id)}
                          >
                            {expandida === notificacao.id ? 'Ocultar' : 'Ver mensagem'}
                          </button>
                        </td>
                      </tr>
                      {expandida === notificacao.id ? (
                        <tr key={`${notificacao.id}-corpo`}>
                          <td colSpan={6}>
                            <div className={`previa-canal ${notificacao.canal === 'WHATSAPP' ? 'whats' : ''}`}>
                              {notificacao.assunto ? (
                                <span className="canal-lbl">Assunto: {notificacao.assunto}</span>
                              ) : null}
                              {notificacao.corpo}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="paginacao">
              <span>
                {totalPaginas > 1 ? `Página ${numeroPagina} de ${totalPaginas} · ${total} alertas` : `${total} alerta(s)`}
              </span>
              {totalPaginas > 1 ? (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={numeroPagina <= 1}
                    onClick={() => setNumeroPagina((atual) => atual - 1)}
                  >
                    ← Anterior
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={numeroPagina >= totalPaginas}
                    onClick={() => setNumeroPagina((atual) => atual + 1)}
                  >
                    Próxima →
                  </button>
                </>
              ) : null}
            </div>
          </>
        )}
      </div>
    </>
  );
}
