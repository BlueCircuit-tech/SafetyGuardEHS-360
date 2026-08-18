import { useCallback, useEffect, useState } from 'react';
import { Icone } from '../componentes/Icone';
import { Link } from 'react-router-dom';
import { DEFINICOES_TIPO_OBSERVACAO, ROTULO_CRITICIDADE_PLANO, type TipoObservacao } from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { api } from '../lib/api';
import { formatarDataHora, formatarDataIso } from '../lib/datas';
import { PILL_URGENCIA, PILL_VENCIMENTO, textoPrazo } from '../lib/saude';
import type { PainelOperacional } from '../lib/dashboards';

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

const ROTULO_TIPO = Object.fromEntries(
  DEFINICOES_TIPO_OBSERVACAO.map((definicao) => [definicao.tipo, definicao.rotulo]),
) as Record<TipoObservacao, string>;

const PILL_CRITICIDADE: Record<string, string> = {
  BAIXA: 'ok',
  MEDIA: 'warn',
  ALTA: 'orange',
  CRITICA: 'bad',
};

/** Card da fila: número grande, rótulo e link para a tela que resolve. */
function Fila({ valor, rotulo, para, alerta }: { valor: number; rotulo: string; para: string; alerta?: boolean }) {
  return (
    <Link className="stat" to={para} style={{ textDecoration: 'none' }}>
      <b style={{ color: alerta && valor > 0 ? '#dc2626' : undefined }}>{valor}</b>
      <span>{rotulo}</span>
    </Link>
  );
}

export function DashboardOperacionalPage() {
  const { mostrar } = useToast();

  const [carregando, setCarregando] = useState(true);
  const [painel, setPainel] = useState<PainelOperacional | null>(null);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [clienteId, setClienteId] = useState('');

  useEffect(() => {
    void api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const parametros = new URLSearchParams();
      if (clienteId) parametros.set('clienteId', clienteId);
      setPainel(await api.get<PainelOperacional>(`/dashboards/operacional?${parametros.toString()}`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar o painel operacional.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [clienteId, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando && !painel) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
        Montando a fila do dia...
      </div>
    );
  }

  if (!painel) return null;

  const { fila, planos, observacoes, areasAtrasadas, renovacoes, impedidos } = painel;
  const pendentes = planos.filter((plano) => plano.atrasado || plano.venceEmBreve);

  return (
    <>
      <div className="painel">
        <h3>Painel operacional</h3>
        <p className="desc">
          A fila de hoje, na ordem em que aperta. Sem índice: só o que precisa de ação. Dados de{' '}
          {formatarDataHora(painel.geradoEm)}.
        </p>

        <div className="filtros">
          <Campo label="Cliente" htmlFor="cliente">
            <select id="cliente" value={clienteId} onChange={(evento) => setClienteId(evento.target.value)}>
              <option value="">Todos os clientes</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <div className="stat-grid">
          <Fila valor={fila.planosAtrasados} rotulo="planos atrasados" para="/planos-acao?atrasados=true" alerta />
          <Fila valor={fila.planosVencendo} rotulo="planos vencendo em 7 dias" para="/planos-acao" />
          <Fila valor={fila.escalonamentosPendentes} rotulo="escalonamentos pendentes" para="/planos-acao" alerta />
          <Fila valor={fila.observacoesSemTratativa} rotulo="observações sem tratativa" para="/observacoes" />
          <Fila valor={fila.areasSemInspecao} rotulo="áreas fora do prazo" para="/areas" alerta />
          <Fila valor={fila.colaboradoresImpedidos} rotulo="colaboradores impedidos" para="/colaboradores" alerta />
          <Fila valor={fila.renovacoesEm30Dias} rotulo="renovações em 30 dias" para="/conformidade" />
        </div>
      </div>

      <div className="painel">
        <h3>Planos que exigem ação ({pendentes.length})</h3>

        {pendentes.length === 0 ? (
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="ok" tamanho={22} />
            </div>
            <h4>Nenhum plano atrasado ou vencendo</h4>
            <p>A carteira está dentro do prazo.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Ação</th>
                  <th>Onde</th>
                  <th>Responsável</th>
                  <th>Criticidade</th>
                  <th>Prazo</th>
                  <th>Nível</th>
                </tr>
              </thead>
              <tbody>
                {pendentes.map((plano) => (
                  <tr key={plano.id}>
                    <td>
                      <Link className="mono" to={`/planos-acao/${plano.id}`}>
                        <b>{plano.codigo}</b>
                      </Link>
                    </td>
                    <td>{plano.acao}</td>
                    <td>
                      {plano.cliente.nomeFantasia}
                      {plano.area ? <div className="hint">{plano.area.nome}</div> : null}
                    </td>
                    <td>{plano.responsavelNome}</td>
                    <td>
                      <span className={`pill ${PILL_CRITICIDADE[plano.criticidade] ?? 'gray'}`}>
                        {ROTULO_CRITICIDADE_PLANO[plano.criticidade]}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${plano.atrasado ? 'bad' : 'warn'}`}>
                        {plano.atrasado
                          ? `${Math.abs(plano.diasParaPrazo)} dia(s) de atraso`
                          : `em ${plano.diasParaPrazo} dia(s)`}
                      </span>
                      <div className="hint">{formatarDataHora(plano.prazo)}</div>
                    </td>
                    <td>
                      {plano.nivelDevido}
                      {plano.escalonamentoPendente ? <div className="hint"><Icone nome="alerta" /> escalonamento pendente</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {observacoes.length > 0 ? (
        <div className="painel">
          <h3>Observações sem tratativa ({observacoes.length})</h3>
          <p className="desc">Desvios registrados que ainda não viraram plano de ação.</p>

          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Registro</th>
                  <th>Onde</th>
                  <th>Tipo</th>
                  <th>Grau</th>
                  <th>Prazo-limite</th>
                </tr>
              </thead>
              <tbody>
                {observacoes.map((observacao) => (
                  <tr key={observacao.id}>
                    <td>
                      <Link to={`/observacoes/${observacao.id}`}>{observacao.descricao.slice(0, 70)}</Link>
                      <div className="hint">
                        {observacao.observador} · {formatarDataHora(observacao.dataHora)}
                      </div>
                    </td>
                    <td>
                      {observacao.cliente.nomeFantasia}
                      <div className="hint">{observacao.area.nome}</div>
                    </td>
                    <td>{ROTULO_TIPO[observacao.tipo]}</td>
                    <td>{observacao.grauRisco ?? '—'}</td>
                    <td>{observacao.prazoLimite ? formatarDataHora(observacao.prazoLimite) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {areasAtrasadas.length > 0 ? (
        <div className="painel">
          <h3>Áreas fora do prazo de inspeção ({areasAtrasadas.length})</h3>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Área</th>
                  <th>Cliente</th>
                  <th>Frequência</th>
                  <th>Sem inspeção há</th>
                </tr>
              </thead>
              <tbody>
                {areasAtrasadas.map((linha) => (
                  <tr key={linha.areaId}>
                    <td>
                      <b>{linha.area}</b>
                      <div className="hint">{linha.codigo}</div>
                    </td>
                    <td>{linha.cliente}</td>
                    <td>{linha.frequenciaInspecaoDias} dias</td>
                    <td>
                      <span className="pill bad">
                        {linha.diasSemInspecao === null ? 'nunca inspecionada' : `${linha.diasSemInspecao} dias`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {impedidos.length > 0 ? (
        <div className="painel">
          <h3>Colaboradores impedidos ({impedidos.length})</h3>
          <p className="desc">Sem ASO, com ASO vencido ou com resultado inapto — não podem estar em campo.</p>

          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Função</th>
                  <th>Cliente</th>
                  <th>ASO</th>
                </tr>
              </thead>
              <tbody>
                {impedidos.map((linha) => (
                  <tr key={linha.colaboradorId}>
                    <td>
                      <Link to={`/colaboradores/${linha.colaboradorId}`}>{linha.nome}</Link>
                    </td>
                    <td>{linha.funcao}</td>
                    <td>{linha.cliente}</td>
                    <td>
                      <span className={`pill ${PILL_VENCIMENTO[linha.situacao]}`}>
                        {linha.situacao === 'SEM_ASO' ? 'Sem ASO' : textoPrazo(linha.diasParaVencer)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {renovacoes.length > 0 ? (
        <div className="painel">
          <h3>Renovações nos próximos 30 dias ({renovacoes.length})</h3>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Urgência</th>
                  <th>O quê</th>
                  <th>Referente a</th>
                  <th>Validade</th>
                </tr>
              </thead>
              <tbody>
                {renovacoes.map((item) => (
                  <tr key={`${item.origem}-${item.id}`}>
                    <td>
                      <span className={`pill ${PILL_URGENCIA[item.urgencia]}`}>{item.rotuloUrgencia ?? item.urgencia}</span>
                    </td>
                    <td>{item.descricao}</td>
                    <td>{item.referente}</td>
                    <td>
                      {item.validade ? formatarDataIso(item.validade) : '—'}
                      <div className="hint">{textoPrazo(item.diasParaVencer)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
