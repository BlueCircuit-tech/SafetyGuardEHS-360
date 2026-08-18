import { useCallback, useEffect, useState } from 'react';
import {
  MOTIVOS_ENTREGA_EPI,
  ROTULO_MOTIVO_ENTREGA,
  ROTULO_SITUACAO_VENCIMENTO,
  type MotivoEntregaEpi,
  type SituacaoVencimento,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import { PILL_VENCIMENTO, textoPrazo } from '../lib/saude';
import { useSessao } from '../lib/sessao';

interface EpiApi {
  id: string;
  nome: string;
  ca: string;
  validadeCa: string | null;
  fornecedor: string | null;
  custoUnitario: string | null;
  vidaUtilMeses: number | null;
  estoqueAtual: number;
  estoqueMinimo: number;
  ativo: boolean;
  situacaoCa: SituacaoVencimento;
  diasParaVencerCa: number | null;
  abaixoDoMinimo: boolean;
  _count?: { entregas: number };
}

interface EntregaApi {
  id: string;
  data: string;
  quantidade: number;
  motivo: MotivoEntregaEpi;
  rotuloMotivo: string;
  epi?: { id: string; nome: string; ca: string };
  colaborador?: { id: string; nome: string; funcao: string };
}

interface ResumoEpi {
  ativos: number;
  caVencidos: number;
  caAVencer: number;
  abaixoDoMinimo: number;
  entregues30Dias: number;
}

interface OpcaoColaborador {
  id: string;
  nome: string;
  funcao: string;
}

const EPI_VAZIO = { nome: '', ca: '', validadeCa: '', fornecedor: '', estoqueAtual: '0', estoqueMinimo: '0', vidaUtilMeses: '' };
const ENTREGA_VAZIA = { epiId: '', colaboradorId: '', data: '', quantidade: '1', motivo: 'PRIMEIRA_ENTREGA' as MotivoEntregaEpi };

export function EpiPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('cadastros:escrever');

  const [aba, setAba] = useState<'estoque' | 'entregas'>('estoque');
  const [carregando, setCarregando] = useState(true);
  const [epis, setEpis] = useState<EpiApi[]>([]);
  const [entregas, setEntregas] = useState<EntregaApi[]>([]);
  const [resumo, setResumo] = useState<ResumoEpi | null>(null);
  const [colaboradores, setColaboradores] = useState<OpcaoColaborador[]>([]);

  const [novoEpi, setNovoEpi] = useState(EPI_VAZIO);
  const [novaEntrega, setNovaEntrega] = useState(ENTREGA_VAZIA);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [lista, cards, historico] = await Promise.all([
        api.get<EpiApi[]>('/epis'),
        api.get<ResumoEpi>('/epis/resumo'),
        api.get<EntregaApi[]>('/epis/entregas'),
      ]);
      setEpis(lista);
      setResumo(cards);
      setEntregas(historico);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os EPIs.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [mostrar]);

  useEffect(() => {
    void api.get<OpcaoColaborador[]>('/colaboradores/opcoes').then(setColaboradores).catch(() => setColaboradores([]));
    void carregar();
  }, [carregar]);

  async function cadastrarEpi() {
    setSalvando(true);
    try {
      await api.post('/epis', {
        ...novoEpi,
        validadeCa: novoEpi.validadeCa || null,
        fornecedor: novoEpi.fornecedor || null,
        vidaUtilMeses: novoEpi.vidaUtilMeses || null,
      });
      mostrar('EPI cadastrado.', 'sucesso');
      setNovoEpi(EPI_VAZIO);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao cadastrar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function registrarEntrega() {
    setSalvando(true);
    try {
      await api.post('/epis/entregas', novaEntrega);
      mostrar('Entrega registrada e estoque baixado.', 'sucesso');
      setNovaEntrega({ ...ENTREGA_VAZIA, data: novaEntrega.data });
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao registrar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function estornar(entrega: EntregaApi) {
    if (!window.confirm('Estornar esta entrega? A quantidade volta ao estoque.')) return;
    try {
      await api.delete(`/epis/entregas/${entrega.id}`);
      mostrar('Entrega estornada.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao estornar.', 'erro');
    }
  }

  return (
    <>
      <div className="painel">
        <h3>EPI e Estoque</h3>
        <p className="desc">
          Catálogo com CA e validade (NR-06), estoque com ponto de reposição e a ficha de entrega por colaborador. A
          entrega dá baixa no estoque na mesma transação — nunca há ficha sem baixa.
        </p>

        {resumo ? (
          <div className="stat-grid">
            <div className="stat">
              <b>{resumo.ativos}</b>
              <span>EPIs ativos</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.caVencidos > 0 ? 'var(--red)' : undefined }}>{resumo.caVencidos}</b>
              <span>CA vencidos</span>
            </div>
            <div className="stat">
              <b>{resumo.caAVencer}</b>
              <span>CA a vencer (30d)</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.abaixoDoMinimo > 0 ? 'var(--red)' : undefined }}>{resumo.abaixoDoMinimo}</b>
              <span>abaixo do estoque mínimo</span>
            </div>
            <div className="stat">
              <b>{resumo.entregues30Dias}</b>
              <span>unidades entregues (30d)</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="abas">
        <button type="button" className={aba === 'estoque' ? 'ativa' : ''} onClick={() => setAba('estoque')}>
          Estoque e CA
        </button>
        <button type="button" className={aba === 'entregas' ? 'ativa' : ''} onClick={() => setAba('entregas')}>
          Entregas (NR-06)
        </button>
      </div>

      {aba === 'estoque' ? (
        <>
          {podeEscrever ? (
            <div className="painel">
              <h3>Novo EPI</h3>
              <div className="filtros">
                <Campo label="Nome" htmlFor="ne-nome" obrigatorio>
                  <input id="ne-nome" className="busca" value={novoEpi.nome} onChange={(e) => setNovoEpi({ ...novoEpi, nome: e.target.value })} />
                </Campo>
                <Campo label="CA" htmlFor="ne-ca" obrigatorio>
                  <input id="ne-ca" className="estreito" value={novoEpi.ca} onChange={(e) => setNovoEpi({ ...novoEpi, ca: e.target.value })} />
                </Campo>
                <Campo label="Validade do CA" htmlFor="ne-validade">
                  <input id="ne-validade" type="date" value={novoEpi.validadeCa} onChange={(e) => setNovoEpi({ ...novoEpi, validadeCa: e.target.value })} />
                </Campo>
                <Campo label="Fornecedor" htmlFor="ne-fornecedor">
                  <input id="ne-fornecedor" value={novoEpi.fornecedor} onChange={(e) => setNovoEpi({ ...novoEpi, fornecedor: e.target.value })} />
                </Campo>
                <Campo label="Estoque" htmlFor="ne-estoque">
                  <input id="ne-estoque" type="number" min={0} className="estreito" value={novoEpi.estoqueAtual} onChange={(e) => setNovoEpi({ ...novoEpi, estoqueAtual: e.target.value })} />
                </Campo>
                <Campo label="Mínimo" htmlFor="ne-minimo">
                  <input id="ne-minimo" type="number" min={0} className="estreito" value={novoEpi.estoqueMinimo} onChange={(e) => setNovoEpi({ ...novoEpi, estoqueMinimo: e.target.value })} />
                </Campo>
              </div>
              <button type="button" className="btn btn-primary" disabled={salvando || !novoEpi.nome || !novoEpi.ca} onClick={() => void cadastrarEpi()}>
                Cadastrar EPI
              </button>
            </div>
          ) : null}

          <div className="painel">
            {carregando ? (
              <div className="centro-tela">
                <div className="spinner" />
                Carregando...
              </div>
            ) : epis.length === 0 ? (
              <div className="vazio">
                <div className="icone-vazio" aria-hidden="true">
                  <Icone nome="capacete" tamanho={22} />
                </div>
                <h4>Nenhum EPI cadastrado</h4>
                <p>Cadastre o catálogo com CA e estoque para as entregas começarem.</p>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>EPI</th>
                      <th>CA</th>
                      <th>Validade do CA</th>
                      <th className="num-col">Estoque</th>
                      <th className="num-col">Mínimo</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {epis.map((epi) => (
                      <tr key={epi.id}>
                        <td>
                          <b>{epi.nome}</b>
                          {epi.fornecedor ? <div className="hint">{epi.fornecedor}</div> : null}
                        </td>
                        <td className="mono">{epi.ca}</td>
                        <td>
                          {epi.validadeCa ? (
                            <span className={`pill ${PILL_VENCIMENTO[epi.situacaoCa]}`}>{formatarDataIso(epi.validadeCa)}</span>
                          ) : (
                            <span className="hint">sem validade</span>
                          )}
                          {epi.diasParaVencerCa !== null ? <div className="hint">{textoPrazo(epi.diasParaVencerCa)}</div> : null}
                        </td>
                        <td className="num-col">
                          <b style={{ color: epi.abaixoDoMinimo ? 'var(--red)' : undefined }}>{epi.estoqueAtual}</b>
                        </td>
                        <td className="num-col">{epi.estoqueMinimo}</td>
                        <td>
                          {epi.abaixoDoMinimo ? <span className="pill bad">Repor estoque</span> : null}{' '}
                          {epi.situacaoCa === 'VENCIDO' ? <span className="pill bad">CA vencido</span> : null}
                          {!epi.abaixoDoMinimo && epi.situacaoCa !== 'VENCIDO' ? (
                            <span className="pill ok">{ROTULO_SITUACAO_VENCIMENTO[epi.situacaoCa] ?? 'OK'}</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {podeEscrever ? (
            <div className="painel">
              <h3>Registrar entrega</h3>
              <div className="filtros">
                <Campo label="EPI" htmlFor="re-epi" obrigatorio>
                  <select id="re-epi" value={novaEntrega.epiId} onChange={(e) => setNovaEntrega({ ...novaEntrega, epiId: e.target.value })}>
                    <option value="">Selecione...</option>
                    {epis
                      .filter((epi) => epi.ativo)
                      .map((epi) => (
                        <option key={epi.id} value={epi.id}>
                          {epi.nome} (CA {epi.ca}) — {epi.estoqueAtual} em estoque
                        </option>
                      ))}
                  </select>
                </Campo>
                <Campo label="Colaborador" htmlFor="re-colab" obrigatorio>
                  <select id="re-colab" value={novaEntrega.colaboradorId} onChange={(e) => setNovaEntrega({ ...novaEntrega, colaboradorId: e.target.value })}>
                    <option value="">Selecione...</option>
                    {colaboradores.map((colaborador) => (
                      <option key={colaborador.id} value={colaborador.id}>
                        {colaborador.nome} — {colaborador.funcao}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Data" htmlFor="re-data" obrigatorio>
                  <input id="re-data" type="date" value={novaEntrega.data} onChange={(e) => setNovaEntrega({ ...novaEntrega, data: e.target.value })} />
                </Campo>
                <Campo label="Qtd." htmlFor="re-qtd">
                  <input id="re-qtd" type="number" min={1} className="estreito" value={novaEntrega.quantidade} onChange={(e) => setNovaEntrega({ ...novaEntrega, quantidade: e.target.value })} />
                </Campo>
                <Campo label="Motivo" htmlFor="re-motivo">
                  <select id="re-motivo" value={novaEntrega.motivo} onChange={(e) => setNovaEntrega({ ...novaEntrega, motivo: e.target.value as MotivoEntregaEpi })}>
                    {MOTIVOS_ENTREGA_EPI.map((motivo) => (
                      <option key={motivo} value={motivo}>
                        {ROTULO_MOTIVO_ENTREGA[motivo]}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={salvando || !novaEntrega.epiId || !novaEntrega.colaboradorId || !novaEntrega.data}
                onClick={() => void registrarEntrega()}
              >
                {salvando ? 'Registrando...' : 'Registrar entrega'}
              </button>
            </div>
          ) : null}

          <div className="painel">
            <h3>Histórico de entregas</h3>
            {entregas.length === 0 ? (
              <p className="hint">Nenhuma entrega registrada.</p>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Colaborador</th>
                      <th>EPI</th>
                      <th className="num-col">Qtd.</th>
                      <th>Motivo</th>
                      {podeEscrever ? <th aria-label="Ações" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {entregas.map((entrega) => (
                      <tr key={entrega.id}>
                        <td>{formatarDataIso(entrega.data)}</td>
                        <td>
                          <b>{entrega.colaborador?.nome}</b>
                          <div className="hint">{entrega.colaborador?.funcao}</div>
                        </td>
                        <td>
                          {entrega.epi?.nome} <span className="mono hint">CA {entrega.epi?.ca}</span>
                        </td>
                        <td className="num-col">{entrega.quantidade}</td>
                        <td>{entrega.rotuloMotivo}</td>
                        {podeEscrever ? (
                          <td>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void estornar(entrega)}>
                              Estornar
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
      )}
    </>
  );
}
