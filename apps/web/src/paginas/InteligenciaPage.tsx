import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Campo } from '../componentes/Campo';
import { Icone, type NomeIcone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { api } from '../lib/api';
import { formatarDataHora } from '../lib/datas';

type Severidade = 'CRITICO' | 'ATENCAO' | 'INFORMATIVO' | 'POSITIVO';

interface Achado {
  categoria: string;
  severidade: Severidade;
  titulo: string;
  texto: string;
  evidencia: Record<string, string | number>;
  link: string;
}

interface Analises {
  geradoEm: string;
  resumo: string;
  totais: { criticos: number; atencao: number; informativos: number; positivos: number };
  achados: Achado[];
}

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}

const ESTILO_SEVERIDADE: Record<Severidade, { pill: string; icone: NomeIcone; rotulo: string }> = {
  CRITICO: { pill: 'bad', icone: 'alerta', rotulo: 'Crítico' },
  ATENCAO: { pill: 'warn', icone: 'relogio', rotulo: 'Atenção' },
  INFORMATIVO: { pill: 'info', icone: 'lupa', rotulo: 'Informativo' },
  POSITIVO: { pill: 'ok', icone: 'ok', rotulo: 'Positivo' },
};

const ROTULO_EVIDENCIA: Record<string, string> = {
  periodoDias: 'janela (dias)',
  desviosAtuais: 'desvios no período',
  desviosAnteriores: 'desvios no período anterior',
  variacaoPercentual: 'variação (%)',
  ocorrencias: 'ocorrências',
  totalDesvios: 'total de desvios',
  participacaoPercentual: 'participação (%)',
  atrasados: 'planos atrasados',
  maisAntigo: 'plano mais antigo',
  diasAtrasoMaximo: 'maior atraso (dias)',
  reincidentes: 'reincidentes',
  maiorRecorrencia: 'maior recorrência',
  vencidos: 'vencidos',
  semTreinamento: 'sem treinamento',
  totalRequisitos: 'requisitos',
  notaPilar: 'nota do pilar',
  impedidos: 'impedidos',
  semAso: 'sem ASO',
  asoVencidos: 'ASO vencidos',
  inaptos: 'inaptos',
  caVencidos: 'CA vencidos',
  itensAbaixoDoMinimo: 'itens abaixo do mínimo',
  ncMaiores: 'NC maiores',
  janelaMeses: 'janela (meses)',
  diasSemRegistro: 'dias sem registro',
  melhorCliente: 'melhor cliente',
  melhorIndice: 'melhor índice',
  piorCliente: 'pior cliente',
  piorIndice: 'pior índice',
  requisitos: 'requisitos',
};

export function InteligenciaPage() {
  const { mostrar } = useToast();

  const [carregando, setCarregando] = useState(true);
  const [analises, setAnalises] = useState<Analises | null>(null);
  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [aberto, setAberto] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const parametros = clienteId ? `?clienteId=${clienteId}` : '';
      setAnalises(await api.get<Analises>(`/inteligencia${parametros}`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao gerar as análises.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [clienteId, mostrar]);

  useEffect(() => {
    void api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando && !analises) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
        Analisando os indicadores...
      </div>
    );
  }

  if (!analises) return null;

  return (
    <>
      <div className="painel">
        <h3>SafetyGuard Intelligence</h3>
        <p className="desc">
          Leituras automáticas dos indicadores — <b>por regras, não por adivinhação</b>: cada achado carrega os números
          que o originaram e o link da tela que detalha. O que os dados não sustentam, não vira frase. Gerado em{' '}
          {formatarDataHora(analises.geradoEm)}.
        </p>

        <div className="filtros">
          <Campo label="Cliente" htmlFor="int-cliente">
            <select id="int-cliente" value={clienteId} onChange={(evento) => setClienteId(evento.target.value)}>
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
          <div className="stat">
            <b style={{ color: analises.totais.criticos > 0 ? 'var(--red)' : undefined }}>{analises.totais.criticos}</b>
            <span>críticos</span>
          </div>
          <div className="stat">
            <b style={{ color: analises.totais.atencao > 0 ? 'var(--orange)' : undefined }}>{analises.totais.atencao}</b>
            <span>atenção</span>
          </div>
          <div className="stat">
            <b>{analises.totais.informativos}</b>
            <span>informativos</span>
          </div>
          <div className="stat">
            <b style={{ color: 'var(--green)' }}>{analises.totais.positivos}</b>
            <span>positivos</span>
          </div>
        </div>

        <div className="hint destaque">{analises.resumo}</div>
      </div>

      {analises.achados.length === 0 ? (
        <div className="painel">
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="ok" tamanho={22} />
            </div>
            <h4>Nenhum achado no período</h4>
            <p>Os indicadores estão estáveis — nenhuma variação relevante, pendência crítica ou reincidência.</p>
          </div>
        </div>
      ) : (
        analises.achados.map((achado, indice) => {
          const estilo = ESTILO_SEVERIDADE[achado.severidade];
          const expandido = aberto === indice;

          return (
            <div className="painel" key={`${achado.categoria}-${indice}`}>
              <h3>
                <Icone nome={estilo.icone} />
                {achado.titulo} <span className={`pill ${estilo.pill}`}>{estilo.rotulo}</span>
              </h3>
              <p className="desc" style={{ marginBottom: 10 }}>
                {achado.texto}
              </p>

              <div className="barra-acoes" style={{ marginBottom: 0 }}>
                <Link className="btn btn-outline btn-sm" to={achado.link}>
                  Abrir a tela relacionada
                </Link>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setAberto(expandido ? null : indice)}
                >
                  {expandido ? 'Ocultar evidência' : 'Ver evidência'}
                </button>
              </div>

              {expandido ? (
                <div className="tbl-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Dado</th>
                        <th>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(achado.evidencia).map(([chave, valor]) => (
                        <tr key={chave}>
                          <td>{ROTULO_EVIDENCIA[chave] ?? chave}</td>
                          <td>
                            <b>{typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor}</b>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </>
  );
}
