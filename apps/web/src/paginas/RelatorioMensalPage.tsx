import { useCallback, useEffect, useState } from 'react';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { api, baixarArquivo } from '../lib/api';
import { formatarDataIso } from '../lib/datas';

type Linha = Record<string, string | number | null>;

interface RelatorioMensal {
  geradoEm: string;
  competencia: string;
  consultoria: { nomeFantasia: string; razaoSocial: string };
  cliente: { nomeFantasia: string; razaoSocial: string; cnpj: string } | null;
  resumo: Record<string, number>;
  realizado: Record<string, Linha[]>;
  pendencias: { planos: Linha[]; asos: Linha[]; documentos: Linha[]; bloqueados: Linha[] };
}

const ROTULOS_RESUMO: Record<string, string> = {
  observacoes: 'Observações de campo',
  desvios: 'Desvios (exceto comportamento seguro)',
  planosAbertos: 'Planos de ação abertos no mês',
  planosConcluidos: 'Planos concluídos no mês',
  planosPendentes: 'Planos em aberto (todos)',
  planosAtrasados: 'Planos atrasados',
  dds: 'DDS realizados',
  participantesDds: 'Participações em DDS',
  treinamentos: 'Treinamentos registrados',
  aprs: 'APR/AST emitidas',
  checklists: 'Checklists de pré-uso',
  checklistsReprovados: 'Equipamentos reprovados',
  auditorias: 'Auditorias',
  acidentes: 'Acidentes',
  acidentesComAfastamento: 'Acidentes com afastamento',
  consequencias: 'Medidas disciplinares',
  afastamentos: 'Afastamentos iniciados',
  diasAfastamento: 'Dias de afastamento',
  ordensServico: 'Ordens de serviço emitidas',
  asosPendentes: 'ASO vencido/a vencer/sem ASO',
  documentosVencendo: 'Documentos vencendo (60 dias)',
  colaboradoresBloqueados: 'Colaboradores bloqueados',
};

const SECOES: Array<{ chave: string; titulo: string; colunas: Array<[string, string]> }> = [
  { chave: 'observacoes', titulo: 'Observações de campo', colunas: [['data', 'Data'], ['tipo', 'Tipo'], ['area', 'Área'], ['causa', 'Causa'], ['descricao', 'Descrição'], ['situacao', 'Situação']] },
  { chave: 'planosConcluidos', titulo: 'Planos de ação concluídos', colunas: [['codigo', 'Código'], ['acao', 'Ação'], ['responsavel', 'Responsável'], ['concluidoEm', 'Concluído em'], ['noPrazo', 'No prazo']] },
  { chave: 'planosAbertos', titulo: 'Planos de ação abertos no mês', colunas: [['codigo', 'Código'], ['acao', 'Ação'], ['responsavel', 'Responsável'], ['criticidade', 'Criticidade'], ['prazo', 'Prazo'], ['status', 'Status']] },
  { chave: 'dds', titulo: 'DDS', colunas: [['data', 'Data'], ['tema', 'Tema'], ['area', 'Área'], ['lider', 'Líder'], ['participantes', 'Participantes']] },
  { chave: 'treinamentos', titulo: 'Treinamentos', colunas: [['data', 'Data'], ['treinamento', 'Treinamento'], ['colaborador', 'Colaborador'], ['validade', 'Validade']] },
  { chave: 'acidentes', titulo: 'Acidentes', colunas: [['data', 'Data'], ['tipo', 'Tipo'], ['colaborador', 'Colaborador'], ['afastamento', 'Dias afast.'], ['diasDebitados', 'Dias debit.'], ['investigacao', 'Investigação']] },
  { chave: 'consequencias', titulo: 'Gestão de consequências', colunas: [['data', 'Data'], ['colaborador', 'Colaborador'], ['comportamento', 'Comportamento'], ['medida', 'Medida']] },
];

function celula(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(valor)) return formatarDataIso(valor);
  return String(valor);
}

function mesAtual(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Relatorio mensal da Administracao SST: o que foi realizado no mes e as
 * pendencias, compilado dos registros. Excel com uma aba por bloco.
 */
export function RelatorioMensalPage() {
  const { mostrar } = useToast();
  const [clientes, setClientes] = useState<Array<{ id: string; nomeFantasia: string }>>([]);
  const [clienteId, setClienteId] = useState('');
  const [mes, setMes] = useState(mesAtual());
  const [dados, setDados] = useState<RelatorioMensal | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    void api.get<Array<{ id: string; nomeFantasia: string }>>('/clientes/opcoes?incluirInativos=true').then(setClientes).catch(() => setClientes([]));
  }, []);

  const consulta = `mes=${mes}${clienteId ? `&clienteId=${clienteId}` : ''}`;

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDados(await api.get<RelatorioMensal>(`/relatorios/mensal?${consulta}`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao montar o relatório.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [consulta, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function baixar() {
    setBaixando(true);
    try {
      await baixarArquivo(`/relatorios/mensal.xlsx?${consulta}`, `relatorio-mensal-${mes}.xlsx`);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao gerar o Excel.', 'erro');
    } finally {
      setBaixando(false);
    }
  }

  return (
    <>
      <div className="painel sem-impressao">
        <h3>Relatório mensal de SSMA</h3>
        <p className="desc">
          O que foi realizado no mês e o acompanhamento das pendências, compilado dos registros da plataforma (observações, planos,
          DDS, treinamentos, APR, checklists, acidentes, consequências, afastamentos, ASO e documentos). O Excel traz uma aba por bloco.
        </p>
        <div className="filtros">
          <Campo label="Mês" htmlFor="rm-mes">
            <input id="rm-mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </Campo>
          <Campo label="Cliente" htmlFor="rm-cliente">
            <select id="rm-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <div className="barra-acoes">
          <button type="button" className="btn btn-primary" disabled={baixando} onClick={() => void baixar()}>
            <Icone nome="documento" /> {baixando ? 'Gerando...' : 'Baixar Excel'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
            <Icone nome="impressora" /> Imprimir
          </button>
        </div>
      </div>

      {carregando || !dados ? (
        <div className="centro-tela">
          <div className="spinner" />
          Compilando o mês...
        </div>
      ) : (
        <div className="painel folha">
          <div className="folha-cabecalho">
            <div>
              <h2>Relatório mensal de SSMA — {dados.competencia.split('-').reverse().join('/')}</h2>
              <div className="hint">
                {dados.consultoria.nomeFantasia}
                {dados.cliente ? ` · ${dados.cliente.nomeFantasia}` : ' · todos os clientes'}
              </div>
            </div>
            <div className="meta">gerado em {new Date(dados.geradoEm).toLocaleString('pt-BR')}</div>
          </div>

          <div className="folha-secao">
            <h4>Resumo do mês</h4>
            <div className="stat-grid">
              {Object.entries(dados.resumo).map(([chave, valor]) => (
                <div className="stat" key={chave}>
                  <b style={{ color: ['planosAtrasados', 'asosPendentes', 'acidentes', 'colaboradoresBloqueados'].includes(chave) && valor > 0 ? 'var(--red)' : undefined }}>{valor}</b>
                  <span>{ROTULOS_RESUMO[chave] ?? chave}</span>
                </div>
              ))}
            </div>
          </div>

          {SECOES.map((secao) => {
            const linhas = dados.realizado[secao.chave] ?? [];
            if (linhas.length === 0) return null;
            return (
              <div className="folha-secao" key={secao.chave}>
                <h4>
                  {secao.titulo} ({linhas.length})
                </h4>
                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr>
                        {secao.colunas.map(([, rotulo]) => (
                          <th key={rotulo}>{rotulo}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.slice(0, 100).map((linha, indice) => (
                        <tr key={indice}>
                          {secao.colunas.map(([chave]) => (
                            <td key={chave}>{celula(linha[chave])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {linhas.length > 100 ? <p className="hint">Exibindo 100 de {linhas.length}; a lista completa está no Excel.</p> : null}
              </div>
            );
          })}

          <div className="folha-secao">
            <h4>Pendências em acompanhamento</h4>
            {dados.pendencias.planos.length === 0 && dados.pendencias.asos.length === 0 && dados.pendencias.documentos.length === 0 ? (
              <p className="hint">Nenhuma pendência em aberto.</p>
            ) : null}
            {dados.pendencias.planos.length > 0 ? (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Plano</th>
                      <th>Ação</th>
                      <th>Responsável</th>
                      <th>Criticidade</th>
                      <th>Prazo</th>
                      <th className="num-col">Atraso (dias)</th>
                      <th>Chefia cobrada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.pendencias.planos.slice(0, 100).map((p, i) => (
                      <tr key={i}>
                        <td className="mono">{celula(p.codigo)}</td>
                        <td>{celula(p.acao)}</td>
                        <td>{celula(p.responsavel)}</td>
                        <td>{celula(p.criticidade)}</td>
                        <td>{celula(p.prazo)}</td>
                        <td className="num-col">{Number(p.diasAtraso) > 0 ? <span className="pill bad">{p.diasAtraso}</span> : '—'}</td>
                        <td>{celula(p.cobradoChefia)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {dados.pendencias.asos.length > 0 ? (
              <>
                <h5 style={{ marginTop: 12 }}>ASO vencido, a vencer (35 dias) ou ausente</h5>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {dados.pendencias.asos.slice(0, 60).map((a, i) => (
                    <li key={i}>
                      {celula(a.colaborador)} — {a.situacao === 'SEM_ASO' ? 'sem ASO' : `${a.situacao === 'VENCIDO' ? 'vencido' : 'vence'} em ${celula(a.validade)}`}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {dados.pendencias.documentos.length > 0 ? (
              <>
                <h5 style={{ marginTop: 12 }}>Documentos legais vencendo em 60 dias</h5>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {dados.pendencias.documentos.map((d, i) => (
                    <li key={i}>
                      {celula(d.titulo)} — validade {celula(d.validade)}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>

          <div className="folha-assinatura">
            <div>
              <div style={{ height: 50 }} />
              Responsável técnico — {dados.consultoria.nomeFantasia}
            </div>
            <div>
              <div style={{ height: 50 }} />
              {dados.cliente ? `Ciente — ${dados.cliente.nomeFantasia}` : 'Ciente'}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
