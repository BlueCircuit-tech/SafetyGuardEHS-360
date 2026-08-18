import { useCallback, useEffect, useState } from 'react';
import {
  ROTULO_SITUACAO_AUDITORIA,
  ROTULO_TIPO_AUDITORIA,
  SITUACOES_AUDITORIA,
  TIPOS_AUDITORIA,
  type SituacaoAuditoria,
  type TipoAuditoria,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import { useSessao } from '../lib/sessao';

interface AuditoriaApi {
  id: string;
  clienteId: string;
  tipo: TipoAuditoria;
  titulo: string;
  dataRealizacao: string;
  auditor: string | null;
  referencia: string | null;
  situacao: SituacaoAuditoria;
  requisitosAvaliados: number | null;
  requisitosAtendidos: number | null;
  ncMaiores: number;
  ncMenores: number;
  oportunidadesMelhoria: number;
  observacoes: string | null;
  score: number | null;
  cliente?: { id: string; nomeFantasia: string };
  rotulos?: { tipo: string; situacao: string };
}

interface ResumoAuditorias {
  total: number;
  planejadas: number;
  emAndamento: number;
  concluidas: number;
  ncMaiores: number;
  ncMenores: number;
  nota: number | null;
}

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

const PILL_SITUACAO_AUDITORIA: Record<SituacaoAuditoria, string> = {
  PLANEJADA: 'info',
  EM_ANDAMENTO: 'warn',
  CONCLUIDA: 'ok',
  CANCELADA: 'gray',
};

const NOVA_VAZIA = {
  clienteId: '',
  tipo: 'INTERNA' as TipoAuditoria,
  titulo: '',
  dataRealizacao: '',
  auditor: '',
  referencia: '',
  situacao: 'PLANEJADA' as SituacaoAuditoria,
  requisitosAvaliados: '',
  requisitosAtendidos: '',
  ncMaiores: '0',
  ncMenores: '0',
};

export function AuditoriasPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('cadastros:escrever');

  const [carregando, setCarregando] = useState(true);
  const [itens, setItens] = useState<AuditoriaApi[]>([]);
  const [resumo, setResumo] = useState<ResumoAuditorias | null>(null);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);

  const [clienteId, setClienteId] = useState('');
  const [tipo, setTipo] = useState<TipoAuditoria | ''>('');
  const [situacao, setSituacao] = useState<SituacaoAuditoria | ''>('');

  const [nova, setNova] = useState(NOVA_VAZIA);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const parametros = new URLSearchParams();
      if (clienteId) parametros.set('clienteId', clienteId);
      if (tipo) parametros.set('tipo', tipo);
      if (situacao) parametros.set('situacao', situacao);
      const escopo = clienteId ? `?clienteId=${clienteId}` : '';

      const [lista, cards] = await Promise.all([
        api.get<AuditoriaApi[]>(`/auditorias?${parametros.toString()}`),
        api.get<ResumoAuditorias>(`/auditorias/resumo${escopo}`),
      ]);
      setItens(lista);
      setResumo(cards);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar as auditorias.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [clienteId, tipo, situacao, mostrar]);

  useEffect(() => {
    void api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar() {
    setSalvando(true);
    try {
      const corpo = {
        ...nova,
        requisitosAvaliados: nova.requisitosAvaliados || null,
        requisitosAtendidos: nova.requisitosAtendidos === '' ? null : nova.requisitosAtendidos,
        auditor: nova.auditor || null,
        referencia: nova.referencia || null,
      };

      if (editandoId) {
        await api.put(`/auditorias/${editandoId}`, corpo);
        mostrar('Auditoria atualizada.', 'sucesso');
      } else {
        await api.post('/auditorias', corpo);
        mostrar('Auditoria registrada.', 'sucesso');
      }
      setNova(NOVA_VAZIA);
      setEditandoId(null);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao salvar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  function editar(auditoria: AuditoriaApi) {
    setEditandoId(auditoria.id);
    setNova({
      clienteId: auditoria.clienteId,
      tipo: auditoria.tipo,
      titulo: auditoria.titulo,
      dataRealizacao: auditoria.dataRealizacao.slice(0, 10),
      auditor: auditoria.auditor ?? '',
      referencia: auditoria.referencia ?? '',
      situacao: auditoria.situacao,
      requisitosAvaliados: auditoria.requisitosAvaliados?.toString() ?? '',
      requisitosAtendidos: auditoria.requisitosAtendidos?.toString() ?? '',
      ncMaiores: String(auditoria.ncMaiores),
      ncMenores: String(auditoria.ncMenores),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function excluir(auditoria: AuditoriaApi) {
    if (!window.confirm(`Excluir a auditoria "${auditoria.titulo}"?`)) return;
    try {
      await api.delete(`/auditorias/${auditoria.id}`);
      mostrar('Auditoria excluída.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao excluir.', 'erro');
    }
  }

  return (
    <>
      <div className="painel">
        <h3>Auditorias</h3>
        <p className="desc">
          ISO 45001, ISO 14001, internas, de cliente e legais. O score de cada auditoria é derivado — requisitos
          atendidos sobre avaliados —, e a média das concluídas nos últimos 12 meses é a nota do pilar{' '}
          <b>Auditorias</b> do Índice Global.
        </p>

        {resumo ? (
          <div className="stat-grid">
            <div className="stat">
              <b>{resumo.nota !== null ? `${resumo.nota}%` : '—'}</b>
              <span>nota do pilar (12 meses)</span>
            </div>
            <div className="stat">
              <b>{resumo.total}</b>
              <span>auditorias · {resumo.concluidas} concluída(s)</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.ncMaiores > 0 ? 'var(--red)' : undefined }}>{resumo.ncMaiores}</b>
              <span>NC maiores</span>
            </div>
            <div className="stat">
              <b>{resumo.ncMenores}</b>
              <span>NC menores</span>
            </div>
            <div className="stat">
              <b>{resumo.planejadas + resumo.emAndamento}</b>
              <span>planejadas / em andamento</span>
            </div>
          </div>
        ) : null}
      </div>

      {podeEscrever ? (
        <div className="painel">
          <h3>{editandoId ? 'Editar auditoria' : 'Nova auditoria'}</h3>
          <div className="filtros">
            <Campo label="Cliente" htmlFor="na-cliente" obrigatorio>
              <select id="na-cliente" value={nova.clienteId} onChange={(e) => setNova({ ...nova, clienteId: e.target.value })}>
                <option value="">Selecione...</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nomeFantasia}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Tipo" htmlFor="na-tipo" obrigatorio>
              <select id="na-tipo" value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value as TipoAuditoria })}>
                {TIPOS_AUDITORIA.map((item) => (
                  <option key={item} value={item}>
                    {ROTULO_TIPO_AUDITORIA[item]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Título" htmlFor="na-titulo" obrigatorio>
              <input id="na-titulo" className="busca" value={nova.titulo} onChange={(e) => setNova({ ...nova, titulo: e.target.value })} />
            </Campo>
            <Campo label="Data" htmlFor="na-data" obrigatorio>
              <input id="na-data" type="date" value={nova.dataRealizacao} onChange={(e) => setNova({ ...nova, dataRealizacao: e.target.value })} />
            </Campo>
            <Campo label="Situação" htmlFor="na-situacao">
              <select
                id="na-situacao"
                className="estreito"
                value={nova.situacao}
                onChange={(e) => setNova({ ...nova, situacao: e.target.value as SituacaoAuditoria })}
              >
                {SITUACOES_AUDITORIA.map((item) => (
                  <option key={item} value={item}>
                    {ROTULO_SITUACAO_AUDITORIA[item]}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="filtros">
            <Campo label="Auditor / entidade" htmlFor="na-auditor">
              <input id="na-auditor" value={nova.auditor} onChange={(e) => setNova({ ...nova, auditor: e.target.value })} />
            </Campo>
            <Campo label="Referência" htmlFor="na-ref" ajuda="Certificadora, órgão ou norma.">
              <input id="na-ref" value={nova.referencia} onChange={(e) => setNova({ ...nova, referencia: e.target.value })} />
            </Campo>
            <Campo label="Requisitos avaliados" htmlFor="na-avaliados" ajuda="Obrigatório ao concluir.">
              <input
                id="na-avaliados"
                type="number"
                min={1}
                className="estreito"
                value={nova.requisitosAvaliados}
                onChange={(e) => setNova({ ...nova, requisitosAvaliados: e.target.value })}
              />
            </Campo>
            <Campo label="Atendidos" htmlFor="na-atendidos">
              <input
                id="na-atendidos"
                type="number"
                min={0}
                className="estreito"
                value={nova.requisitosAtendidos}
                onChange={(e) => setNova({ ...nova, requisitosAtendidos: e.target.value })}
              />
            </Campo>
            <Campo label="NC maiores" htmlFor="na-ncmai">
              <input id="na-ncmai" type="number" min={0} className="estreito" value={nova.ncMaiores} onChange={(e) => setNova({ ...nova, ncMaiores: e.target.value })} />
            </Campo>
            <Campo label="NC menores" htmlFor="na-ncmen">
              <input id="na-ncmen" type="number" min={0} className="estreito" value={nova.ncMenores} onChange={(e) => setNova({ ...nova, ncMenores: e.target.value })} />
            </Campo>
          </div>

          <div className="barra-acoes">
            <button
              type="button"
              className="btn btn-primary"
              disabled={salvando || !nova.clienteId || !nova.titulo || !nova.dataRealizacao}
              onClick={() => void salvar()}
            >
              {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Registrar auditoria'}
            </button>
            {editandoId ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEditandoId(null);
                  setNova(NOVA_VAZIA);
                }}
              >
                Cancelar edição
              </button>
            ) : null}
            <span className="hint">Não conformidade vira tratativa: abra um plano de ação com origem “Auditoria”.</span>
          </div>
        </div>
      ) : null}

      <div className="painel">
        <div className="filtros">
          <Campo label="Cliente" htmlFor="fa-cliente">
            <select id="fa-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Tipo" htmlFor="fa-tipo">
            <select id="fa-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoAuditoria | '')}>
              <option value="">Todos</option>
              {TIPOS_AUDITORIA.map((item) => (
                <option key={item} value={item}>
                  {ROTULO_TIPO_AUDITORIA[item]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Situação" htmlFor="fa-situacao">
            <select id="fa-situacao" className="estreito" value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoAuditoria | '')}>
              <option value="">Todas</option>
              {SITUACOES_AUDITORIA.map((item) => (
                <option key={item} value={item}>
                  {ROTULO_SITUACAO_AUDITORIA[item]}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        {carregando ? (
          <div className="centro-tela">
            <div className="spinner" />
            Carregando...
          </div>
        ) : itens.length === 0 ? (
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="escudo" tamanho={22} />
            </div>
            <h4>Nenhuma auditoria registrada</h4>
            <p>Registre a primeira auditoria para o pilar do Índice Global ganhar fonte.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Auditoria</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Resultado</th>
                  <th>NC</th>
                  <th>Situação</th>
                  {podeEscrever ? <th aria-label="Ações" /> : null}
                </tr>
              </thead>
              <tbody>
                {itens.map((auditoria) => (
                  <tr key={auditoria.id}>
                    <td>
                      <b>{auditoria.titulo}</b>
                      <div className="hint">
                        {auditoria.rotulos?.tipo ?? auditoria.tipo}
                        {auditoria.auditor ? ` · ${auditoria.auditor}` : ''}
                      </div>
                    </td>
                    <td>{auditoria.cliente?.nomeFantasia ?? '—'}</td>
                    <td>{formatarDataIso(auditoria.dataRealizacao)}</td>
                    <td>
                      {auditoria.score !== null ? (
                        <span className={`pill ${auditoria.score >= 90 ? 'ok' : auditoria.score >= 70 ? 'warn' : 'bad'}`}>
                          {auditoria.score}%
                        </span>
                      ) : (
                        <span className="hint">sem resultado</span>
                      )}
                      {auditoria.requisitosAvaliados ? (
                        <div className="hint">
                          {auditoria.requisitosAtendidos}/{auditoria.requisitosAvaliados} requisitos
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {auditoria.ncMaiores > 0 ? <span className="pill bad">{auditoria.ncMaiores} maior(es)</span> : null}{' '}
                      {auditoria.ncMenores > 0 ? <span className="pill warn">{auditoria.ncMenores} menor(es)</span> : null}
                      {auditoria.ncMaiores === 0 && auditoria.ncMenores === 0 ? <span className="hint">—</span> : null}
                    </td>
                    <td>
                      <span className={`pill ${PILL_SITUACAO_AUDITORIA[auditoria.situacao]}`}>
                        {auditoria.rotulos?.situacao ?? auditoria.situacao}
                      </span>
                    </td>
                    {podeEscrever ? (
                      <td>
                        <div className="acoes-linha">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => editar(auditoria)}>
                            Editar
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluir(auditoria)}>
                            Excluir
                          </button>
                        </div>
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
