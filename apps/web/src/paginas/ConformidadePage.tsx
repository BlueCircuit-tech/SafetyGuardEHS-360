import { useCallback, useEffect, useState } from 'react';
import { Farol, Icone } from '../componentes/Icone';
import { Link } from 'react-router-dom';
import { FAIXAS_ALERTA_DIAS, ROTULO_RESULTADO_ASO } from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { api } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import { PILL_URGENCIA, PILL_VENCIMENTO, textoPrazo, type PainelConformidade } from '../lib/saude';

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

/** Barra proporcional simples — a mesma leitura das barras do Dashboard BBS. */
function Barra({ rotulo, valor, total, cor }: { rotulo: string; valor: number; total: number; cor: string }) {
  const percentual = total > 0 ? Math.round((valor / total) * 1000) / 10 : 0;

  return (
    <div className="barra-bbs">
      <div className="barra-rotulo">{rotulo}</div>
      <div className="barra-trilho">
        <span style={{ width: `${percentual}%`, background: cor }} />
      </div>
      <div className="barra-valor">
        {valor}
        <small>{percentual}%</small>
      </div>
    </div>
  );
}

export function ConformidadePage() {
  const { mostrar } = useToast();

  const [carregando, setCarregando] = useState(true);
  const [painel, setPainel] = useState<PainelConformidade | null>(null);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [janelaDias, setJanelaDias] = useState(90);

  useEffect(() => {
    api
      .get<OpcaoCliente[]>('/clientes/opcoes?incluirInativos=true')
      .then(setClientes)
      .catch(() => setClientes([]));
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const parametros = new URLSearchParams({ janelaDias: String(janelaDias) });
      if (clienteId) parametros.set('clienteId', clienteId);
      setPainel(await api.get<PainelConformidade>(`/conformidade?${parametros.toString()}`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar o painel.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [clienteId, janelaDias, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando && !painel) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
        Calculando conformidade...
      </div>
    );
  }

  if (!painel) return null;

  const { icl, saude, documentos, renovacao, porCliente } = painel;

  return (
    <>
      <div className="painel">
        <h3>Conformidade legal</h3>
        <p className="desc">
          Responde as três perguntas de uma fiscalização: quem está apto, quais documentos estão vigentes e o que vence
          a seguir. Os números são de {formatarDataIso(painel.geradoEm)}.
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

          <Campo label="Janela de renovação" htmlFor="janela">
            <select
              id="janela"
              className="estreito"
              value={janelaDias}
              onChange={(evento) => setJanelaDias(Number(evento.target.value))}
            >
              {FAIXAS_ALERTA_DIAS.map((dias) => (
                <option key={dias} value={dias}>
                  Próximos {dias} dias
                </option>
              ))}
              <option value={180}>Próximos 180 dias</option>
            </select>
          </Campo>
        </div>
      </div>

      <div className="grid-indices">
        <div className="indice-destaque">
          <h4>Índice de Conformidade Legal</h4>
          <div className="indice-valor" style={{ color: icl.classificacao.cor }}>
            {icl.valor}
          </div>
          <div className="indice-nivel">
            <Farol cor={icl.classificacao.cor} /> {icl.classificacao.rotulo}
          </div>
          <p className="hint">
            Saúde ocupacional pesa 60% e documentação 40%. Um lado sem nenhum registro fica de fora e o índice é
            reponderado — hoje {icl.pesoConsiderado}% dos pesos têm dado.
          </p>
        </div>

        <div className="painel">
          <h3>Saúde ocupacional</h3>
          <div className="stat-grid">
            <div className="stat">
              <b>{saude.colaboradoresAtivos}</b>
              <span>colaboradores ativos</span>
            </div>
            <div className="stat">
              <b style={{ color: saude.impedidos > 0 ? '#dc2626' : undefined }}>{saude.impedidos}</b>
              <span>impedidos de trabalhar</span>
            </div>
            <div className="stat">
              <b>{saude.semAso}</b>
              <span>sem nenhum ASO</span>
            </div>
            <div className="stat">
              <b>{saude.percentualConformidade}%</b>
              <span>ASO em dia</span>
            </div>
          </div>

          <div className="barras-bbs">
            <Barra rotulo="Vigentes" valor={saude.vigentes} total={saude.total} cor="#059669" />
            <Barra rotulo="A vencer (30d)" valor={saude.aVencer} total={saude.total} cor="#d97706" />
            <Barra rotulo="Vencidos" valor={saude.vencidos} total={saude.total} cor="#dc2626" />
            <Barra rotulo="Sem exame" valor={saude.semValidade} total={saude.total} cor="#6b7280" />
          </div>

          <p className="hint">
            {saude.inaptos} inapto(s) e {saude.comRestricao} apto(s) com restrição no último exame.
          </p>
        </div>

        <div className="painel">
          <h3>Documentação legal</h3>
          <div className="stat-grid">
            <div className="stat">
              <b>{documentos.total}</b>
              <span>documentos ativos</span>
            </div>
            <div className="stat">
              <b style={{ color: documentos.vencidos > 0 ? '#dc2626' : undefined }}>{documentos.vencidos}</b>
              <span>vencidos</span>
            </div>
            <div className="stat">
              <b>{documentos.aVencer}</b>
              <span>a vencer em 30 dias</span>
            </div>
            <div className="stat">
              <b>{documentos.percentualConformidade}%</b>
              <span>em dia</span>
            </div>
          </div>

          <div className="barras-bbs">
            <Barra rotulo="Vigentes" valor={documentos.vigentes} total={documentos.total} cor="#059669" />
            <Barra rotulo="A vencer" valor={documentos.aVencer} total={documentos.total} cor="#d97706" />
            <Barra rotulo="Vencidos" valor={documentos.vencidos} total={documentos.total} cor="#dc2626" />
            <Barra rotulo="Sem validade" valor={documentos.semValidade} total={documentos.total} cor="#6b7280" />
          </div>
        </div>
      </div>

      <div className="painel">
        <h3>
          Fila de renovação — {renovacao.total} item(ns) nos próximos {renovacao.janelaDias} dias
        </h3>
        <p className="desc">
          ASO e documento na mesma lista, ordenados pelo que aperta primeiro: {renovacao.vencidos} já vencido(s) e{' '}
          {renovacao.criticos} vencendo em até 7 dias.
        </p>

        {renovacao.itens.length === 0 ? (
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="ok" tamanho={22} />
            </div>
            <h4>Nada a renovar nesta janela</h4>
            <p>Nenhum ASO ou documento vence nos próximos {renovacao.janelaDias} dias.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Urgência</th>
                  <th>O quê</th>
                  <th>Referente a</th>
                  <th>Validade</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {renovacao.itens.map((item) => (
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
                    <td>
                      <Link
                        className="btn btn-ghost btn-sm"
                        to={item.origem === 'ASO' ? '/colaboradores?asoIrregular=true' : `/documentos/${item.id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {saude.pendencias.length > 0 ? (
        <div className="painel">
          <h3>Quem está impedido de trabalhar</h3>
          <p className="desc">ASO vencido, resultado inapto ou nenhum exame registrado. É o que para a operação.</p>

          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Função</th>
                  <th>Cliente</th>
                  <th>Motivo</th>
                  <th>Validade</th>
                </tr>
              </thead>
              <tbody>
                {saude.pendencias.map((linha) => (
                  <tr key={linha.colaboradorId}>
                    <td>
                      <Link to={`/colaboradores/${linha.colaboradorId}`}>{linha.nome}</Link>
                    </td>
                    <td>{linha.funcao}</td>
                    <td>
                      {linha.cliente}
                      {linha.terceiro ? <div className="hint">{linha.terceiro}</div> : null}
                    </td>
                    <td>
                      <span className={`pill ${PILL_VENCIMENTO[linha.situacao]}`}>
                        {linha.situacao === 'SEM_ASO'
                          ? 'Sem ASO'
                          : linha.resultado === 'INAPTO'
                            ? ROTULO_RESULTADO_ASO.INAPTO
                            : 'ASO vencido'}
                      </span>
                    </td>
                    <td>
                      {linha.validade ? formatarDataIso(linha.validade) : '—'}
                      <div className="hint">{textoPrazo(linha.diasParaVencer)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {documentos.porTipo.length > 0 ? (
        <div className="painel">
          <h3>Conformidade por tipo de documento</h3>
          <p className="desc">Mostra qual programa está furando, e não apenas quantos documentos estão vencidos.</p>

          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Total</th>
                  <th>Vigentes</th>
                  <th>A vencer</th>
                  <th>Vencidos</th>
                  <th>Em dia</th>
                </tr>
              </thead>
              <tbody>
                {documentos.porTipo.map((linha) => (
                  <tr key={linha.tipo}>
                    <td>
                      <b>{linha.rotulo}</b>
                      <div className="hint">{linha.categoria.toLowerCase()}</div>
                    </td>
                    <td>{linha.total}</td>
                    <td>{linha.vigentes}</td>
                    <td>{linha.aVencer}</td>
                    <td>{linha.vencidos > 0 ? <span className="pill bad">{linha.vencidos}</span> : 0}</td>
                    <td>{linha.percentualConformidade}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {porCliente.length > 0 ? (
        <div className="painel">
          <h3>Ranking por cliente — ASO em dia</h3>

          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Colaboradores</th>
                  <th>Com ASO em dia</th>
                  <th>Impedidos</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {porCliente.map((linha) => (
                  <tr key={linha.clienteId}>
                    <td>{linha.cliente}</td>
                    <td>{linha.total}</td>
                    <td>{linha.emDia}</td>
                    <td>{linha.impedidos > 0 ? <span className="pill bad">{linha.impedidos}</span> : 0}</td>
                    <td>
                      <b>{linha.percentualAsoEmDia}%</b>
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
