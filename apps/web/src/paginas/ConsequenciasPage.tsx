import { useCallback, useEffect, useState } from 'react';
import {
  MEDIDAS_DISCIPLINARES,
  MOTIVACOES_CONSEQUENCIA,
  ROTULO_MEDIDA,
  ROTULO_MOTIVACAO,
  type MedidaDisciplinar,
  type MotivacaoConsequencia,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import { useSessao } from '../lib/sessao';

interface ConsequenciaApi {
  id: string;
  data: string;
  liderNome: string;
  comportamento: string;
  detalhamento: string;
  medida: MedidaDisciplinar;
  motivacao: MotivacaoConsequencia;
  responsavelSst: string | null;
  ocorrenciasDoColaborador: number;
  colaborador?: {
    id: string;
    nome: string;
    funcao: string;
    cliente?: { nomeFantasia: string };
    terceiro?: { nomeFantasia: string } | null;
  };
  rotulos?: { medida: string; motivacao: string };
}

interface ResumoConsequencias {
  total: number;
  reincidentes: number;
  porMedida: Array<{ medida: MedidaDisciplinar; rotulo: string; quantidade: number }>;
}

interface OpcaoColaborador {
  id: string;
  nome: string;
  funcao: string;
}

const PILL_MEDIDA: Record<MedidaDisciplinar, string> = {
  ORIENTACAO_VERBAL: 'info',
  ADVERTENCIA_ESCRITA: 'warn',
  SUSPENSAO: 'orange',
  DESLIGAMENTO: 'bad',
  RECICLAGEM_TREINAMENTO: 'ok',
};

const NOVO_VAZIO = {
  colaboradorId: '',
  liderNome: '',
  data: '',
  comportamento: '',
  detalhamento: '',
  medida: 'ORIENTACAO_VERBAL' as MedidaDisciplinar,
  motivacao: 'INTERNA' as MotivacaoConsequencia,
  responsavelSst: '',
};

export function ConsequenciasPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('planos:escrever');

  const [carregando, setCarregando] = useState(true);
  const [itens, setItens] = useState<ConsequenciaApi[]>([]);
  const [resumo, setResumo] = useState<ResumoConsequencias | null>(null);
  const [colaboradores, setColaboradores] = useState<OpcaoColaborador[]>([]);
  const [medida, setMedida] = useState<MedidaDisciplinar | ''>('');
  const [novo, setNovo] = useState(NOVO_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const parametros = new URLSearchParams();
      if (medida) parametros.set('medida', medida);
      const [lista, cards] = await Promise.all([
        api.get<ConsequenciaApi[]>(`/consequencias?${parametros.toString()}`),
        api.get<ResumoConsequencias>('/consequencias/resumo'),
      ]);
      setItens(lista);
      setResumo(cards);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os registros.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [medida, mostrar]);

  useEffect(() => {
    void api.get<OpcaoColaborador[]>('/colaboradores/opcoes').then(setColaboradores).catch(() => setColaboradores([]));
    void carregar();
  }, [carregar]);

  async function registrar() {
    setSalvando(true);
    try {
      await api.post('/consequencias', { ...novo, responsavelSst: novo.responsavelSst || undefined });
      mostrar('Registro de consequência criado.', 'sucesso');
      setNovo(NOVO_VAZIO);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof ErroApi ? erro.mensagemAmigavel() : 'Falha ao registrar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(item: ConsequenciaApi) {
    if (!window.confirm('Excluir este registro de consequência?')) return;
    try {
      await api.delete(`/consequencias/${item.id}`);
      mostrar('Registro excluído.', 'sucesso');
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao excluir.', 'erro');
    }
  }

  return (
    <>
      <div className="painel">
        <h3>Gestão de Consequências</h3>
        <p className="desc">
          Comportamento de risco → envolvido → líder → medida aplicada, no formato da planilha real da operação. A
          reincidência é <b>derivada, nunca digitada</b>: o sistema conta os registros de cada colaborador.
        </p>

        {resumo ? (
          <div className="stat-grid">
            <div className="stat">
              <b>{resumo.total}</b>
              <span>registros</span>
            </div>
            <div className="stat">
              <b style={{ color: resumo.reincidentes > 0 ? 'var(--red)' : undefined }}>{resumo.reincidentes}</b>
              <span>colaboradores reincidentes</span>
            </div>
            {resumo.porMedida.map((linha) => (
              <div className="stat" key={linha.medida}>
                <b>{linha.quantidade}</b>
                <span>{linha.rotulo.toLowerCase()}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {podeEscrever ? (
        <div className="painel">
          <h3>Novo registro</h3>
          <div className="filtros">
            <Campo label="Colaborador envolvido" htmlFor="nc-colab" obrigatorio>
              <select id="nc-colab" value={novo.colaboradorId} onChange={(e) => setNovo({ ...novo, colaboradorId: e.target.value })}>
                <option value="">Selecione...</option>
                {colaboradores.map((colaborador) => (
                  <option key={colaborador.id} value={colaborador.id}>
                    {colaborador.nome} — {colaborador.funcao}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Líder direto" htmlFor="nc-lider" obrigatorio>
              <input id="nc-lider" value={novo.liderNome} onChange={(e) => setNovo({ ...novo, liderNome: e.target.value })} />
            </Campo>
            <Campo label="Data do fato" htmlFor="nc-data" obrigatorio>
              <input id="nc-data" type="date" value={novo.data} onChange={(e) => setNovo({ ...novo, data: e.target.value })} />
            </Campo>
            <Campo label="Medida aplicada" htmlFor="nc-medida" obrigatorio>
              <select id="nc-medida" value={novo.medida} onChange={(e) => setNovo({ ...novo, medida: e.target.value as MedidaDisciplinar })}>
                {MEDIDAS_DISCIPLINARES.map((item) => (
                  <option key={item} value={item}>
                    {ROTULO_MEDIDA[item]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Motivação" htmlFor="nc-motivacao">
              <select id="nc-motivacao" value={novo.motivacao} onChange={(e) => setNovo({ ...novo, motivacao: e.target.value as MotivacaoConsequencia })}>
                {MOTIVACOES_CONSEQUENCIA.map((item) => (
                  <option key={item} value={item}>
                    {ROTULO_MOTIVACAO[item]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="TST responsável" htmlFor="nc-tst">
              <input id="nc-tst" value={novo.responsavelSst} onChange={(e) => setNovo({ ...novo, responsavelSst: e.target.value })} />
            </Campo>
          </div>

          <Campo label="Comportamento de risco" htmlFor="nc-comp" obrigatorio ajuda="Ex.: violação de bloqueio LOTO, não uso de EPI, atividade sem PT.">
            <input id="nc-comp" className="busca" value={novo.comportamento} onChange={(e) => setNovo({ ...novo, comportamento: e.target.value })} />
          </Campo>
          <Campo label="Detalhamento do ocorrido" htmlFor="nc-det" obrigatorio>
            <textarea id="nc-det" rows={3} value={novo.detalhamento} onChange={(e) => setNovo({ ...novo, detalhamento: e.target.value })} />
          </Campo>

          <div className="barra-acoes">
            <button
              type="button"
              className="btn btn-primary"
              disabled={salvando || !novo.colaboradorId || !novo.liderNome || !novo.data || !novo.comportamento || novo.detalhamento.length < 10}
              onClick={() => void registrar()}
            >
              {salvando ? 'Registrando...' : 'Registrar'}
            </button>
            <span className="hint">Registro sensível: fica na trilha de auditoria com autor e data.</span>
          </div>
        </div>
      ) : null}

      <div className="painel">
        <div className="filtros">
          <Campo label="Medida" htmlFor="fc-medida">
            <select id="fc-medida" value={medida} onChange={(e) => setMedida(e.target.value as MedidaDisciplinar | '')}>
              <option value="">Todas</option>
              {MEDIDAS_DISCIPLINARES.map((item) => (
                <option key={item} value={item}>
                  {ROTULO_MEDIDA[item]}
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
              <Icone nome="pessoas" tamanho={22} />
            </div>
            <h4>Nenhum registro</h4>
            <p>O histórico de gestão de consequências aparece aqui, com a reincidência contada automaticamente.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Envolvido</th>
                  <th>Comportamento</th>
                  <th>Medida</th>
                  <th>Motivação</th>
                  <th className="num-col">Reincidência</th>
                  {podeEscrever ? <th aria-label="Ações" /> : null}
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <tr key={item.id}>
                    <td>{formatarDataIso(item.data)}</td>
                    <td>
                      <b>{item.colaborador?.nome}</b>
                      <div className="hint">
                        {item.colaborador?.funcao} · líder: {item.liderNome}
                      </div>
                    </td>
                    <td>
                      {item.comportamento}
                      <div className="hint">{item.detalhamento.slice(0, 90)}...</div>
                    </td>
                    <td>
                      <span className={`pill ${PILL_MEDIDA[item.medida]}`}>{item.rotulos?.medida ?? item.medida}</span>
                    </td>
                    <td>{item.rotulos?.motivacao ?? item.motivacao}</td>
                    <td className="num-col">
                      {item.ocorrenciasDoColaborador > 1 ? (
                        <span className="pill bad">{item.ocorrenciasDoColaborador}ª ocorrência</span>
                      ) : (
                        <span className="hint">1ª</span>
                      )}
                    </td>
                    {podeEscrever ? (
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluir(item)}>
                          Excluir
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
