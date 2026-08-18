import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { nivelDeMaturidade } from '@safetyguard/shared';
import { Farol } from '../componentes/Icone';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { api } from '../lib/api';
import { formatarDataHora } from '../lib/datas';
import type { PainelExecutivo } from '../lib/dashboards';

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

interface OpcaoCentro {
  id: string;
  nome: string;
}

/** Cartão de índice com valor grande e classificação. */
function Indice({
  titulo,
  valor,
  cor,
  nivel,
  nota,
}: {
  titulo: string;
  valor: number;
  cor: string;
  nivel: string;
  nota?: string;
}) {
  return (
    <div className="indice-destaque">
      <h4>{titulo}</h4>
      <div className="indice-valor" style={{ color: cor }}>
        {valor}
      </div>
      <div className="indice-nivel">
        <Farol cor={cor} /> {nivel}
      </div>
      {nota ? <p className="hint">{nota}</p> : null}
    </div>
  );
}

export function DashboardExecutivoPage() {
  const { mostrar } = useToast();

  const [carregando, setCarregando] = useState(true);
  const [painel, setPainel] = useState<PainelExecutivo | null>(null);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [centros, setCentros] = useState<OpcaoCentro[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [centroNegocioId, setCentroNegocioId] = useState('');
  const [meses, setMeses] = useState(12);

  useEffect(() => {
    void api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
    void api.get<OpcaoCentro[]>('/centros-negocio/opcoes').then(setCentros).catch(() => setCentros([]));
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const parametros = new URLSearchParams({ meses: String(meses) });
      if (clienteId) parametros.set('clienteId', clienteId);
      if (centroNegocioId) parametros.set('centroNegocioId', centroNegocioId);
      setPainel(await api.get<PainelExecutivo>(`/dashboards/executivo?${parametros.toString()}`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar o painel executivo.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [clienteId, centroNegocioId, meses, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando && !painel) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
        Consolidando indicadores...
      </div>
    );
  }

  if (!painel) return null;

  const { indiceGlobal, cobertura, maturidade, conformidade, tendencia, ranking, centros: comparativo } = painel;
  const maiorMes = Math.max(1, ...tendencia.pontos.map((ponto) => ponto.total));
  /*
   * A variação compara o primeiro mês com o último. Quando a janela começa sem
   * registros, esse cálculo não tem base — mostrar "0%" ali sugeriria
   * estabilidade onde na verdade não há com o que comparar.
   */
  const variacaoComparavel = (tendencia.pontos[0]?.total ?? 0) > 0;

  return (
    <>
      <div className="painel">
        <h3>Painel executivo</h3>
        <p className="desc">
          A leitura da diretoria: uma nota, a tendência e onde está o pior contrato. O detalhe de causa fica no{' '}
          <Link to="/dashboard-gerencial">painel gerencial</Link>. Dados de {formatarDataHora(painel.geradoEm)}.
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

          <Campo label="Centro de negócio" htmlFor="centro">
            <select id="centro" value={centroNegocioId} onChange={(evento) => setCentroNegocioId(evento.target.value)}>
              <option value="">Todos</option>
              {centros.map((centro) => (
                <option key={centro.id} value={centro.id}>
                  {centro.nome}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Janela" htmlFor="meses">
            <select id="meses" className="estreito" value={meses} onChange={(evento) => setMeses(Number(evento.target.value))}>
              <option value={6}>6 meses</option>
              <option value={12}>12 meses</option>
              <option value={24}>24 meses</option>
            </select>
          </Campo>
        </div>
      </div>

      <div className="grid-indices">
        <Indice
          titulo="Índice Global SSMA"
          valor={indiceGlobal.valor}
          cor={indiceGlobal.classificacao.cor}
          nivel={indiceGlobal.classificacao.rotulo}
          nota={`Calculado sobre ${cobertura.pesoConsiderado}% dos pesos.`}
        />
        <Indice
          titulo="Score de Maturidade"
          valor={maturidade.valor}
          cor={maturidade.classificacao.cor}
          nivel={`Nivel ${nivelDeMaturidade(maturidade.valor).nivel} — ${nivelDeMaturidade(maturidade.valor).nome}`}
          nota={`${nivelDeMaturidade(maturidade.valor).descricao}. ${maturidade.pesoConsiderado}% dos pesos com dado.`}
        />
        <Indice
          titulo="Conformidade Legal"
          valor={conformidade.icl}
          cor={conformidade.classificacao.cor}
          nivel={conformidade.classificacao.rotulo}
          nota={`${conformidade.impedidos} impedido(s) · ${conformidade.documentosVencidos} documento(s) vencido(s).`}
        />
      </div>

      <div className="painel">
        <h3>Composição do Índice Global</h3>
        <p className="desc">
          Pilar sem dado fica de fora e os pesos restantes são renormalizados — um contrato sem auditoria não é tratado
          como se tivesse tirado zero nela.
        </p>

        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Pilar</th>
                <th>Peso</th>
                <th>Nota</th>
                <th>Contribuição</th>
              </tr>
            </thead>
            <tbody>
              {indiceGlobal.pilares.map((pilar) => (
                <tr key={pilar.pilar}>
                  <td>
                    <b>{pilar.rotulo}</b>
                  </td>
                  <td>{pilar.peso}%</td>
                  <td>{pilar.nota}</td>
                  <td>{pilar.contribuicao}</td>
                </tr>
              ))}
              {cobertura.pilaresSemDados.map((pilar) => (
                <tr key={pilar.pilar}>
                  <td>
                    <span className="hint">{pilar.pilar}</span>
                  </td>
                  <td colSpan={3}>
                    <span className="pill gray">sem fonte</span> <span className="hint">{pilar.motivo}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="hint">
          <b>Segurança</b> usa {painel.seguranca.acidentes} acidente(s) e {painel.seguranca.quaseAcidentes} quase-acidente(s)
          em {painel.seguranca.registros} registros. {painel.seguranca.observacao}
        </p>
      </div>

      <div className="painel">
        <h3>Carteira</h3>
        <div className="stat-grid">
          <div className="stat">
            <b>{painel.carteira.clientesAtivos}</b>
            <span>clientes ativos</span>
          </div>
          <div className="stat">
            <b>{painel.carteira.terceirosAtivos}</b>
            <span>contratadas ativas</span>
          </div>
          <div className="stat">
            <b>{painel.carteira.colaboradores}</b>
            <span>colaboradores cobertos</span>
          </div>
          <div className="stat">
            <b>{painel.carteira.areasAtivas}</b>
            <span>áreas monitoradas</span>
          </div>
          <div className="stat">
            <b>{painel.cultura.totalBbs}</b>
            <span>observações na base BBS</span>
          </div>
          <div className="stat">
            <b>{painel.planos.total}</b>
            <span>planos de ação ({painel.planos.atrasados} atrasados)</span>
          </div>
        </div>
      </div>

      {tendencia.pontos.length > 0 ? (
        <div className="painel">
          <h3>
            Tendência de desvios
            {variacaoComparavel ? (
              <span className={`pill ${tendencia.direcao === 'MELHORANDO' ? 'ok' : tendencia.direcao === 'PIORANDO' ? 'bad' : 'gray'}`}>
                {tendencia.simbolo} {tendencia.variacao > 0 ? '+' : ''}
                {tendencia.variacao}%
              </span>
            ) : null}
          </h3>
          {!variacaoComparavel ? (
            <p className="desc">A janela começa sem registros, então não há base de comparação percentual.</p>
          ) : null}
          <div className="tendencia">
            {tendencia.pontos.map((ponto) => (
              <div className="tendencia-col" key={ponto.periodo}>
                <div
                  className="tendencia-barra"
                  style={{ height: `${Math.round((ponto.total / maiorMes) * 100)}%` }}
                  title={`${ponto.comportamentosInseguros} comportamentos · ${ponto.condicoesInseguras} condições`}
                >
                  <span style={{ flexGrow: ponto.comportamentosInseguros, background: '#f59e0b' }} />
                  <span style={{ flexGrow: ponto.condicoesInseguras, background: '#dc2626' }} />
                </div>
                <div className="tendencia-total">{ponto.total}</div>
                <div className="tendencia-mes">{ponto.periodo.replace(/^(\w{3})\w*\//, '$1/')}</div>
              </div>
            ))}
          </div>
          <p className="hint">
            <span className="legenda-cor" style={{ background: '#f59e0b' }} /> comportamentos inseguros{' '}
            <span className="legenda-cor" style={{ background: '#dc2626' }} /> condições inseguras
          </p>
        </div>
      ) : null}

      <div className="painel">
        <h3>Ranking de contratos</h3>
        <p className="desc">Cada cliente recebe a mesma composição do índice global, calculada sobre os próprios números.</p>

        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th>Índice</th>
                <th>ICS / ICI</th>
                <th>Observações</th>
                <th>Planos atrasados</th>
                <th>Aderência</th>
                <th>Acidentes</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((linha, indice) => (
                <tr key={linha.clienteId}>
                  <td>
                    {indice === 0 ? (
                      <span className="medalha ouro">1º</span>
                    ) : indice === 1 ? (
                      <span className="medalha prata">2º</span>
                    ) : indice === 2 ? (
                      <span className="medalha bronze">3º</span>
                    ) : (
                      `${indice + 1}º`
                    )}
                  </td>
                  <td>
                    <b>{linha.cliente}</b>
                    {linha.centroNegocio ? <div className="hint">{linha.centroNegocio}</div> : null}
                  </td>
                  <td>
                    <span className="pill" style={{ background: `${linha.classificacao.cor}22`, color: linha.classificacao.cor }}>
                      {linha.indiceGlobal} · {linha.classificacao.rotulo}
                    </span>
                  </td>
                  <td>
                    {linha.ics}% / {linha.ici}%
                  </td>
                  <td>{linha.observacoes}</td>
                  <td>{linha.planosAtrasados > 0 ? <span className="pill bad">{linha.planosAtrasados}</span> : 0}</td>
                  <td>{linha.aderenciaAoPrazo}%</td>
                  <td>{linha.acidentes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {comparativo.length > 0 ? (
        <div className="painel">
          <h3>Centros de negócio × meta</h3>
          <p className="desc">A meta de índice global vem do cadastro do centro (Etapa 4).</p>

          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Centro</th>
                  <th>Índice</th>
                  <th>Meta</th>
                  <th>Desvio</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {comparativo.map((centro) => (
                  <tr key={centro.centroId}>
                    <td>
                      <span className="marca-cor" style={{ background: centro.cor }} /> <b>{centro.centro}</b>
                      <div className="hint">{centro.codigo}</div>
                    </td>
                    <td>{centro.indiceGlobal}</td>
                    <td>{centro.meta}</td>
                    <td style={{ color: centro.desvioDaMeta < 0 ? '#dc2626' : '#059669' }}>
                      {centro.desvioDaMeta > 0 ? '+' : ''}
                      {centro.desvioDaMeta}
                    </td>
                    <td>
                      <span className={`pill ${centro.atingiuMeta ? 'ok' : 'bad'}`}>
                        {centro.atingiuMeta ? 'Meta atingida' : 'Abaixo da meta'}
                      </span>
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
