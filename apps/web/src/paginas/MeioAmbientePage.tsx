import { useCallback, useEffect, useState } from 'react';
import {
  ROTULO_OCORRENCIA_AMBIENTAL,
  TIPOS_OCORRENCIA_AMBIENTAL,
  type TipoOcorrenciaAmbiental,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import { useSessao } from '../lib/sessao';

interface OcorrenciaApi {
  id: string;
  tipo: TipoOcorrenciaAmbiental;
  rotuloTipo: string;
  data: string;
  descricao: string;
  grauRisco: string;
  volumeEstimado: string | null;
  contida: boolean;
  acaoImediata: string | null;
  responsavel: string;
  cliente?: { id: string; nomeFantasia: string };
  area?: { id: string; nome: string; codigo: string } | null;
}

interface LeituraApi {
  id: string;
  competencia: string;
  aguaM3: string | null;
  energiaKwh: string | null;
  residuosKg: string | null;
  residuosRecicladosKg: string | null;
  emissoesTco2: string | null;
  cliente?: { id: string; nomeFantasia: string };
}

interface ResumoAmbiental {
  ultimos12Meses: number;
  naoContidas: number;
  grauI: number;
  nota: number | null;
}

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

const OCORRENCIA_VAZIA = {
  clienteId: '',
  areaId: '',
  tipo: 'DERRAMAMENTO' as TipoOcorrenciaAmbiental,
  data: '',
  descricao: '',
  grauRisco: 'II',
  volumeEstimado: '',
  contida: false,
  acaoImediata: '',
  responsavel: '',
};

const LEITURA_VAZIA = { clienteId: '', competencia: '', aguaM3: '', energiaKwh: '', residuosKg: '', residuosRecicladosKg: '', emissoesTco2: '' };

function numero(valor: string | null): string {
  return valor === null ? '—' : Number(valor).toLocaleString('pt-BR');
}

export function MeioAmbientePage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('observacoes:escrever');

  const [aba, setAba] = useState<'ocorrencias' | 'esg'>('ocorrencias');
  const [carregando, setCarregando] = useState(true);
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaApi[]>([]);
  const [leituras, setLeituras] = useState<LeituraApi[]>([]);
  const [resumo, setResumo] = useState<ResumoAmbiental | null>(null);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [areas, setAreas] = useState<Array<{ id: string; nome: string; codigo: string }>>([]);

  const [nova, setNova] = useState(OCORRENCIA_VAZIA);
  const [leitura, setLeitura] = useState(LEITURA_VAZIA);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [listaOcorrencias, cards, listaLeituras] = await Promise.all([
        api.get<OcorrenciaApi[]>('/meio-ambiente/ocorrencias'),
        api.get<ResumoAmbiental>('/meio-ambiente/resumo'),
        api.get<LeituraApi[]>('/meio-ambiente/indicadores'),
      ]);
      setOcorrencias(listaOcorrencias);
      setResumo(cards);
      setLeituras(listaLeituras);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [mostrar]);

  useEffect(() => {
    void api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!nova.clienteId) {
      setAreas([]);
      return;
    }
    void api
      .get<{ itens: Array<{ id: string; nome: string; codigo: string }> }>(`/areas?clienteId=${nova.clienteId}&porPagina=200`)
      .then((resposta) => setAreas(resposta.itens))
      .catch(() => setAreas([]));
  }, [nova.clienteId]);

  async function registrarOcorrencia() {
    setSalvando(true);
    try {
      await api.post('/meio-ambiente/ocorrencias', {
        ...nova,
        areaId: nova.areaId || undefined,
        volumeEstimado: nova.volumeEstimado || undefined,
        acaoImediata: nova.acaoImediata || undefined,
      });
      mostrar(
        nova.grauRisco === 'I'
          ? 'Ocorrência registrada — matriz de comunicação acionada (Meio Ambiente → Diretoria).'
          : 'Ocorrência registrada.',
        'sucesso',
      );
      setNova(OCORRENCIA_VAZIA);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao registrar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarLeitura() {
    setSalvando(true);
    try {
      await api.post('/meio-ambiente/indicadores', {
        ...leitura,
        aguaM3: leitura.aguaM3 || undefined,
        energiaKwh: leitura.energiaKwh || undefined,
        residuosKg: leitura.residuosKg || undefined,
        residuosRecicladosKg: leitura.residuosRecicladosKg || undefined,
        emissoesTco2: leitura.emissoesTco2 || undefined,
      });
      mostrar('Leitura do mês salva.', 'sucesso');
      setLeitura(LEITURA_VAZIA);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao salvar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <div className="painel">
        <h3>Meio Ambiente e ESG</h3>
        <p className="desc">
          Meta do plano diretor: <b>zero ocorrência ambiental</b>. A nota do pilar parte de 100 e desconta por
          ocorrência nos últimos 12 meses (15 pontos por não contida, 5 por contida — convenção editável). Grau I aciona
          a matriz de comunicação: Meio Ambiente no registro, Diretoria em 4 horas.
        </p>

        {resumo ? (
          <div className="stat-grid">
            <div className="stat">
              <b>{resumo.nota !== null ? resumo.nota : '—'}</b>
              <span>nota do pilar Meio Ambiente</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.ultimos12Meses > 0 ? 'var(--orange)' : 'var(--green)' }}>{resumo.ultimos12Meses}</b>
              <span>ocorrências (12 meses) · meta zero</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.naoContidas > 0 ? 'var(--red)' : undefined }}>{resumo.naoContidas}</b>
              <span>não contidas</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.grauI > 0 ? 'var(--red)' : undefined }}>{resumo.grauI}</b>
              <span>grau I (críticas)</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="abas">
        <button type="button" className={aba === 'ocorrencias' ? 'ativa' : ''} onClick={() => setAba('ocorrencias')}>
          Ocorrências ambientais
        </button>
        <button type="button" className={aba === 'esg' ? 'ativa' : ''} onClick={() => setAba('esg')}>
          Indicadores ESG mensais
        </button>
      </div>

      {aba === 'ocorrencias' ? (
        <>
          {podeEscrever ? (
            <div className="painel">
              <h3>Registrar ocorrência</h3>
              <div className="filtros">
                <Campo label="Cliente" htmlFor="oa-cliente" obrigatorio>
                  <select id="oa-cliente" value={nova.clienteId} onChange={(e) => setNova({ ...nova, clienteId: e.target.value })}>
                    <option value="">Selecione...</option>
                    {clientes.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.nomeFantasia}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Área" htmlFor="oa-area">
                  <select id="oa-area" value={nova.areaId} onChange={(e) => setNova({ ...nova, areaId: e.target.value })}>
                    <option value="">Sem área</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.codigo} — {area.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Tipo" htmlFor="oa-tipo" obrigatorio>
                  <select id="oa-tipo" value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value as TipoOcorrenciaAmbiental })}>
                    {TIPOS_OCORRENCIA_AMBIENTAL.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {ROTULO_OCORRENCIA_AMBIENTAL[tipo]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Data" htmlFor="oa-data" obrigatorio>
                  <input id="oa-data" type="date" value={nova.data} onChange={(e) => setNova({ ...nova, data: e.target.value })} />
                </Campo>
                <Campo label="Grau" htmlFor="oa-grau" obrigatorio ajuda="Grau I dispara e-mail/WhatsApp imediato.">
                  <select id="oa-grau" className="estreito" value={nova.grauRisco} onChange={(e) => setNova({ ...nova, grauRisco: e.target.value })}>
                    <option value="I">I — Crítico</option>
                    <option value="II">II — Moderado</option>
                    <option value="III">III — Baixo</option>
                  </select>
                </Campo>
                <Campo label="Volume estimado" htmlFor="oa-volume" ajuda="Ex.: 20 L, 5 kg.">
                  <input id="oa-volume" className="estreito" value={nova.volumeEstimado} onChange={(e) => setNova({ ...nova, volumeEstimado: e.target.value })} />
                </Campo>
                <Campo label="Responsável" htmlFor="oa-resp" obrigatorio>
                  <input id="oa-resp" value={nova.responsavel} onChange={(e) => setNova({ ...nova, responsavel: e.target.value })} />
                </Campo>
              </div>

              <Campo label="Descrição" htmlFor="oa-desc" obrigatorio>
                <textarea id="oa-desc" rows={2} value={nova.descricao} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} />
              </Campo>
              <Campo label="Ação imediata tomada" htmlFor="oa-acao">
                <input id="oa-acao" className="busca" value={nova.acaoImediata} onChange={(e) => setNova({ ...nova, acaoImediata: e.target.value })} />
              </Campo>
              <div className="check-linha" style={{ maxWidth: 360, marginBottom: 16 }}>
                <label>
                  <input type="checkbox" checked={nova.contida} onChange={(e) => setNova({ ...nova, contida: e.target.checked })} />
                  Ocorrência contida (sem extravasamento)
                </label>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                disabled={salvando || !nova.clienteId || !nova.data || !nova.responsavel || nova.descricao.length < 10}
                onClick={() => void registrarOcorrencia()}
              >
                {salvando ? 'Registrando...' : 'Registrar ocorrência'}
              </button>
            </div>
          ) : null}

          <div className="painel">
            {carregando ? (
              <div className="centro-tela">
                <div className="spinner" />
                Carregando...
              </div>
            ) : ocorrencias.length === 0 ? (
              <div className="vazio">
                <div className="icone-vazio" aria-hidden="true">
                  <Icone nome="ok" tamanho={22} />
                </div>
                <h4>Zero ocorrência ambiental</h4>
                <p>É exatamente a meta. O pilar pontua 100 enquanto o histórico ficar limpo.</p>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Ocorrência</th>
                      <th>Onde</th>
                      <th>Grau</th>
                      <th>Contida</th>
                      <th>Responsável</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ocorrencias.map((ocorrencia) => (
                      <tr key={ocorrencia.id}>
                        <td>{formatarDataIso(ocorrencia.data)}</td>
                        <td>
                          <b>{ocorrencia.rotuloTipo}</b>
                          {ocorrencia.volumeEstimado ? <span className="hint"> · {ocorrencia.volumeEstimado}</span> : null}
                          <div className="hint">{ocorrencia.descricao.slice(0, 90)}</div>
                        </td>
                        <td>
                          {ocorrencia.cliente?.nomeFantasia}
                          {ocorrencia.area ? <div className="hint">{ocorrencia.area.nome}</div> : null}
                        </td>
                        <td>
                          <span className={`pill ${ocorrencia.grauRisco === 'I' ? 'bad' : ocorrencia.grauRisco === 'II' ? 'warn' : 'gray'}`}>
                            Grau {ocorrencia.grauRisco}
                          </span>
                        </td>
                        <td>
                          <span className={`pill ${ocorrencia.contida ? 'ok' : 'bad'}`}>{ocorrencia.contida ? 'Contida' : 'Não contida'}</span>
                        </td>
                        <td>{ocorrencia.responsavel}</td>
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
              <h3>Leitura do mês</h3>
              <p className="desc">Reenviar a mesma competência corrige a leitura — não duplica.</p>
              <div className="filtros">
                <Campo label="Cliente" htmlFor="le-cliente" obrigatorio>
                  <select id="le-cliente" value={leitura.clienteId} onChange={(e) => setLeitura({ ...leitura, clienteId: e.target.value })}>
                    <option value="">Selecione...</option>
                    {clientes.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.nomeFantasia}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Competência" htmlFor="le-comp" obrigatorio>
                  <input id="le-comp" type="date" value={leitura.competencia} onChange={(e) => setLeitura({ ...leitura, competencia: e.target.value })} />
                </Campo>
                <Campo label="Água (m³)" htmlFor="le-agua">
                  <input id="le-agua" type="number" min={0} className="estreito" value={leitura.aguaM3} onChange={(e) => setLeitura({ ...leitura, aguaM3: e.target.value })} />
                </Campo>
                <Campo label="Energia (kWh)" htmlFor="le-energia">
                  <input id="le-energia" type="number" min={0} className="estreito" value={leitura.energiaKwh} onChange={(e) => setLeitura({ ...leitura, energiaKwh: e.target.value })} />
                </Campo>
                <Campo label="Resíduos (kg)" htmlFor="le-residuos">
                  <input id="le-residuos" type="number" min={0} className="estreito" value={leitura.residuosKg} onChange={(e) => setLeitura({ ...leitura, residuosKg: e.target.value })} />
                </Campo>
                <Campo label="Reciclados (kg)" htmlFor="le-reciclados">
                  <input id="le-reciclados" type="number" min={0} className="estreito" value={leitura.residuosRecicladosKg} onChange={(e) => setLeitura({ ...leitura, residuosRecicladosKg: e.target.value })} />
                </Campo>
                <Campo label="Emissões (tCO₂)" htmlFor="le-emissoes">
                  <input id="le-emissoes" type="number" min={0} step="0.001" className="estreito" value={leitura.emissoesTco2} onChange={(e) => setLeitura({ ...leitura, emissoesTco2: e.target.value })} />
                </Campo>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={salvando || !leitura.clienteId || !leitura.competencia}
                onClick={() => void salvarLeitura()}
              >
                Salvar leitura
              </button>
            </div>
          ) : null}

          <div className="painel">
            <h3>Histórico mensal</h3>
            {leituras.length === 0 ? (
              <p className="hint">Nenhuma leitura registrada.</p>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Competência</th>
                      <th>Cliente</th>
                      <th className="num-col">Água (m³)</th>
                      <th className="num-col">Energia (kWh)</th>
                      <th className="num-col">Resíduos (kg)</th>
                      <th className="num-col">Reciclagem</th>
                      <th className="num-col">tCO₂</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leituras.map((linha) => {
                      const residuos = linha.residuosKg ? Number(linha.residuosKg) : null;
                      const reciclados = linha.residuosRecicladosKg ? Number(linha.residuosRecicladosKg) : null;
                      const taxa = residuos && reciclados !== null ? Math.round((reciclados / residuos) * 100) : null;

                      return (
                        <tr key={linha.id}>
                          <td>{formatarDataIso(linha.competencia).slice(3)}</td>
                          <td>{linha.cliente?.nomeFantasia ?? '—'}</td>
                          <td className="num-col">{numero(linha.aguaM3)}</td>
                          <td className="num-col">{numero(linha.energiaKwh)}</td>
                          <td className="num-col">{numero(linha.residuosKg)}</td>
                          <td className="num-col">{taxa !== null ? `${taxa}%` : '—'}</td>
                          <td className="num-col">{numero(linha.emissoesTco2)}</td>
                        </tr>
                      );
                    })}
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
