import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CATEGORIAS_ISHIKAWA, ROTULO_ISHIKAWA, type Ishikawa } from '@safetyguard/shared';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { api, urlAbsoluta } from '../lib/api';
import { formatarDataIso } from '../lib/datas';

interface Apresentacao {
  geradoEm: string;
  empresa: { nomeFantasia: string; razaoSocial: string; logoUrl: string | null } | null;
  cliente: { nomeFantasia: string; razaoSocial: string; cnpj: string; logoUrl: string | null } | null;
  plano: {
    codigo: string;
    acao: string;
    descricao: string | null;
    responsavelNome: string;
    responsavelCargo: string | null;
    criticidade: string;
    prazo: string;
    status: string;
    dataConclusao: string | null;
    evidenciaUrl: string | null;
    comentarioConclusao: string | null;
    nivelEscalonamento: number;
    diasParaPrazo: number;
    atrasado: boolean;
    nivelAtual?: string;
    rotulos?: { status: string; criticidade: string; origem: string };
    area?: { nome: string; codigo: string } | null;
    terceiro?: { nomeFantasia: string } | null;
  };
  observacao: {
    dataHora: string;
    tipo: string;
    descricao: string;
    observador: string;
    iir: number | null;
    grauRisco: string | null;
    classificacaoBird: string | null;
    fotoUrl: string | null;
    assinaturaUrl: string | null;
    assinaturaHash: string | null;
    acaoImediata: string | null;
    area?: { nome: string; codigo: string } | null;
    terceiro?: { razaoSocial: string } | null;
    causa?: { descricao: string } | null;
  } | null;
  acidentes: Array<{
    id: string;
    data: string;
    descricao: string;
    causaRaiz: string | null;
    fatoresContribuintes: string | null;
    ishikawa: Ishikawa | null;
    cincoPorques: string[] | null;
    colaborador?: { nome: string; funcao: string } | null;
  }>;
  riscos: Array<{ perigo: string; tipo: string; iir: number; grauRisco: string; medidasPropostas: string | null }>;
  notificacoes: Array<{ canal: string; status: string; prioridade: string; nivelEscalonamento: number; destinatarios: string; criadoEm: string }>;
  linhaDoTempo: Array<{ id: string; acao: string; criadoEm: string; autor?: string | null; alteracoes?: Record<string, { de: unknown; para: unknown }> }>;
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{rotulo}</dt>
      <dd>{children ?? '—'}</dd>
    </div>
  );
}

/**
 * Apresentacao do plano de acao: o documento da reuniao de tratativa,
 * montado automaticamente a partir do que ja esta registrado. Nada e
 * digitado duas vezes; imprime-se ou salva-se em PDF pelo navegador.
 */
export function PlanoApresentacaoPage() {
  const { id } = useParams<{ id: string }>();
  const { mostrar } = useToast();
  const [dados, setDados] = useState<Apresentacao | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<Apresentacao>(`/planos-acao/${id}/apresentacao`)
      .then(setDados)
      .catch((erro) => mostrar(erro instanceof Error ? erro.message : 'Falha ao montar a apresentação.', 'erro'));
  }, [id, mostrar]);

  if (!dados) {
    return (
      <div className="painel">
        <div className="centro-tela">
          <div className="spinner" />
          Montando a apresentação...
        </div>
      </div>
    );
  }

  const { plano, observacao, acidentes, riscos, notificacoes, linhaDoTempo, empresa, cliente } = dados;

  return (
    <>
      <div className="painel sem-impressao">
        <div className="barra-acoes" style={{ justifyContent: 'space-between' }}>
          <Link to="/planos-acao" className="btn btn-ghost">
            <Icone nome="voltar" /> Planos de ação
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <Icone nome="impressora" /> Imprimir / salvar PDF
          </button>
        </div>
      </div>

      <div className="painel folha">
        <div className="folha-cabecalho">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {cliente?.logoUrl ? <img src={urlAbsoluta(cliente.logoUrl) ?? ''} alt="" style={{ height: 40 }} /> : null}
            <div>
              <h2>Plano de ação {plano.codigo}</h2>
              <div className="hint">
                {cliente ? `${cliente.nomeFantasia} · CNPJ ${cliente.cnpj}` : null}
                {empresa ? ` · Consultoria: ${empresa.nomeFantasia}` : null}
              </div>
            </div>
          </div>
          <div className="meta">
            <span className={`pill ${plano.atrasado ? 'bad' : plano.status === 'CONCLUIDO' ? 'ok' : 'warn'}`}>{plano.rotulos?.status ?? plano.status}</span>
            <div>gerado em {new Date(dados.geradoEm).toLocaleString('pt-BR')}</div>
          </div>
        </div>

        <div className="folha-secao">
          <h4>1. A ação</h4>
          <p style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>{plano.acao}</p>
          {plano.descricao ? <p>{plano.descricao}</p> : null}
          <dl className="folha-dados">
            <Dado rotulo="Responsável">
              {plano.responsavelNome}
              {plano.responsavelCargo ? ` (${plano.responsavelCargo})` : ''}
            </Dado>
            <Dado rotulo="Criticidade">{plano.rotulos?.criticidade ?? plano.criticidade}</Dado>
            <Dado rotulo="Prazo">
              {formatarDataIso(plano.prazo)}
              {plano.atrasado ? <span className="pill bad" style={{ marginLeft: 6 }}>{Math.abs(plano.diasParaPrazo)} dia(s) de atraso</span> : null}
            </Dado>
            <Dado rotulo="Origem">{plano.rotulos?.origem}</Dado>
            <Dado rotulo="Área">{plano.area ? `${plano.area.codigo} · ${plano.area.nome}` : null}</Dado>
            <Dado rotulo="Terceiro">{plano.terceiro?.nomeFantasia}</Dado>
            <Dado rotulo="Escalonamento">
              Degrau {plano.nivelEscalonamento} — {plano.nivelAtual ?? 'Supervisor'}
            </Dado>
            <Dado rotulo="Conclusão">{plano.dataConclusao ? formatarDataIso(plano.dataConclusao) : 'em aberto'}</Dado>
          </dl>
          {plano.comentarioConclusao ? <p className="hint">Conclusão: {plano.comentarioConclusao}</p> : null}
          {plano.evidenciaUrl ? <img className="evidencia-thumb" src={urlAbsoluta(plano.evidenciaUrl) ?? ''} alt="Evidência de conclusão" style={{ marginTop: 8 }} /> : null}
        </div>

        {observacao ? (
          <div className="folha-secao">
            <h4>2. A ocorrência de origem</h4>
            <dl className="folha-dados">
              <Dado rotulo="Quando">{new Date(observacao.dataHora).toLocaleString('pt-BR')}</Dado>
              <Dado rotulo="Tipo">{observacao.tipo.replace(/_/g, ' ')}</Dado>
              <Dado rotulo="Onde">{observacao.area ? `${observacao.area.codigo} · ${observacao.area.nome}` : null}</Dado>
              <Dado rotulo="Observador">{observacao.observador}</Dado>
              <Dado rotulo="Risco">
                {observacao.grauRisco ? `Grau ${observacao.grauRisco}` : null}
                {observacao.iir ? ` · IIR ${observacao.iir}` : null}
              </Dado>
              <Dado rotulo="Classificação Bird">{observacao.classificacaoBird?.replace(/_/g, ' ')}</Dado>
              <Dado rotulo="Causa">{observacao.causa?.descricao}</Dado>
              <Dado rotulo="Terceiro">{observacao.terceiro?.razaoSocial}</Dado>
            </dl>
            <p style={{ marginTop: 8 }}>{observacao.descricao}</p>
            {observacao.acaoImediata ? <p className="hint">Ação imediata: {observacao.acaoImediata}</p> : null}
            <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
              {observacao.fotoUrl ? <img className="evidencia-thumb" src={urlAbsoluta(observacao.fotoUrl) ?? ''} alt="Foto da ocorrência" /> : null}
              {observacao.assinaturaUrl ? (
                <div>
                  <img className="evidencia-thumb" src={urlAbsoluta(observacao.assinaturaUrl) ?? ''} alt="Assinatura" style={{ maxHeight: 60 }} />
                  {observacao.assinaturaHash ? <div className="carimbo">carimbo {observacao.assinaturaHash.slice(0, 16)}…</div> : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {acidentes.length > 0 ? (
          <div className="folha-secao">
            <h4>3. Investigação</h4>
            {acidentes.map((a) => (
              <div key={a.id} style={{ marginBottom: 14 }}>
                <b>{formatarDataIso(a.data)}</b>
                {a.colaborador ? ` — ${a.colaborador.nome} (${a.colaborador.funcao})` : null}
                <p>{a.descricao}</p>
                {a.ishikawa ? (
                  <div className="ishikawa-grid" style={{ marginBottom: 10 }}>
                    {CATEGORIAS_ISHIKAWA.filter((c) => (a.ishikawa?.[c]?.length ?? 0) > 0).map((c) => (
                      <div key={c} className="ishikawa-categoria">
                        <h5>{ROTULO_ISHIKAWA[c]}</h5>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                          {a.ishikawa?.[c].map((causa, i) => (
                            <li key={i}>{causa}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
                {a.cincoPorques && a.cincoPorques.length > 0 ? (
                  <ol className="lista-editavel-itens numerada">
                    {a.cincoPorques.map((p, i) => (
                      <li key={i}>
                        <span className="ordem">{i + 1}º por quê?</span>
                        <span className="texto">{p}</span>
                      </li>
                    ))}
                  </ol>
                ) : null}
                {a.causaRaiz ? (
                  <p>
                    <b>Causa raiz:</b> {a.causaRaiz}
                  </p>
                ) : null}
                {a.fatoresContribuintes ? <p className="hint">Fatores contribuintes: {a.fatoresContribuintes}</p> : null}
              </div>
            ))}
          </div>
        ) : null}

        {riscos.length > 0 ? (
          <div className="folha-secao">
            <h4>{acidentes.length > 0 ? '4' : '3'}. Riscos do inventário tratados por este plano</h4>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Perigo</th>
                    <th>Tipo</th>
                    <th>IIR</th>
                    <th>Grau</th>
                    <th>Medidas propostas</th>
                  </tr>
                </thead>
                <tbody>
                  {riscos.map((r, i) => (
                    <tr key={i}>
                      <td>{r.perigo}</td>
                      <td>{r.tipo}</td>
                      <td>{r.iir}</td>
                      <td>{r.grauRisco}</td>
                      <td>{r.medidasPropostas ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="folha-secao">
          <h4>Comunicação e escalonamento</h4>
          {notificacoes.length === 0 ? (
            <p className="hint">Nenhuma notificação gerada para este plano.</p>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Canal</th>
                    <th>Degrau</th>
                    <th>Prioridade</th>
                    <th>Destinatários</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {notificacoes.map((n, i) => (
                    <tr key={i}>
                      <td>{new Date(n.criadoEm).toLocaleString('pt-BR')}</td>
                      <td>{n.canal}</td>
                      <td>{n.nivelEscalonamento}</td>
                      <td>{n.prioridade}</td>
                      <td>{n.destinatarios.replace(/,/g, ', ')}</td>
                      <td>
                        <span className={`pill ${n.status === 'ENVIADA' ? 'ok' : n.status === 'FALHOU' ? 'bad' : 'gray'}`}>{n.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="folha-secao">
          <h4>Linha do tempo</h4>
          {linhaDoTempo.length === 0 ? (
            <p className="hint">Sem registros de auditoria.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {linhaDoTempo.map((e) => (
                <li key={e.id}>
                  <b>{new Date(e.criadoEm).toLocaleString('pt-BR')}</b> — {e.acao.toLowerCase()}
                  {e.autor ? ` por ${e.autor}` : ''}
                  {e.alteracoes?.status ? ` · status → ${String(e.alteracoes.status.para)}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="folha-assinatura">
          <div>Responsável pela ação</div>
          <div>Gestor de SSMA</div>
        </div>
      </div>
    </>
  );
}
