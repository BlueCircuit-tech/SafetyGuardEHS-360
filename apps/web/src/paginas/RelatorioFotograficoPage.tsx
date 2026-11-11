import { useEffect, useState, type CSSProperties } from 'react';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { formatarDataHora, formatarDataIso } from '../lib/datas';

interface ItemFotografico {
  origem: 'OBSERVACAO' | 'PLANO' | 'CHECKLIST';
  id: string;
  data: string;
  area: string | null;
  titulo: string;
  descricao: string;
  fotoAntesUrl: string | null;
  fotoDepoisUrl: string | null;
  situacao: string | null;
  responsavel: string | null;
  grau: string | null;
}

interface RelatorioFotografico {
  geradoEm: string;
  empresa: { nomeFantasia: string; logoUrl: string | null };
  cabecalho: {
    nomeExibicao: string;
    razaoSocial: string;
    cnpjFormatado: string;
    enderecoLinha: string;
    contatoLinha: string;
    responsavelTecnicoLinha: string;
    rodapeRelatorio: string;
    corPrimaria: string;
  };
  cliente: { id: string; nomeFantasia: string; razaoSocial: string; logoUrl: string | null };
  periodo: { de: string; ate: string };
  resumo: { total: number; comAntesEDepois: number; observacoes: number; planos: number; checklists: number; truncado: boolean };
  itens: ItemFotografico[];
}

const ROTULO_ORIGEM: Record<ItemFotografico['origem'], string> = {
  OBSERVACAO: 'Observação',
  PLANO: 'Plano de ação',
  CHECKLIST: 'Checklist',
};

function classeDaSituacao(item: ItemFotografico): string {
  const s = (item.situacao ?? '').toLowerCase();
  if (s.startsWith('conclu') || s === 'apto') return 'ok';
  if (s.startsWith('cancel')) return 'gray';
  if (s.includes('nao apto') || s.includes('não apto')) return 'bad';
  if (s.startsWith('em ')) return 'info';
  if (item.grau === 'Grau I' || item.grau === 'ALTA') return 'bad';
  return 'warn';
}

function isoLocal(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function inicioDoMes(): string {
  const d = new Date();
  return isoLocal(new Date(d.getFullYear(), d.getMonth(), 1));
}

const ESTILO_CARTAO: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: 10,
  breakInside: 'avoid',
  pageBreakInside: 'avoid',
  background: '#fff',
};

const ESTILO_FOTO: CSSProperties = {
  width: '100%',
  height: 190,
  objectFit: 'cover',
  borderRadius: 6,
  border: '1px solid var(--border)',
  display: 'block',
  background: '#f3f4f6',
};

function Foto({ url, rotulo }: { url: string | null; rotulo: string }) {
  const src = urlAbsoluta(url);
  return (
    <div style={{ minWidth: 0 }}>
      <div className="hint" style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.04em', marginBottom: 4 }}>
        {rotulo}
      </div>
      {src ? (
        <img src={src} alt={rotulo} style={ESTILO_FOTO} loading="lazy" />
      ) : (
        <div style={{ ...ESTILO_FOTO, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--texto-medio)', fontSize: 12 }}>
          sem foto
        </div>
      )}
    </div>
  );
}

/**
 * Relatorio fotografico de SSMA: fotos das observacoes (antes/depois com a
 * evidencia do plano concluido), dos planos de acao e das execucoes de
 * checklist no periodo, prontas para imprimir ou salvar em PDF.
 */
export function RelatorioFotograficoPage() {
  const { mostrar } = useToast();
  const [clientes, setClientes] = useState<Array<{ id: string; nomeFantasia: string }>>([]);
  const [areas, setAreas] = useState<Array<{ id: string; nome: string; codigo: string }>>([]);
  const [filtro, setFiltro] = useState({
    clienteId: '',
    de: inicioDoMes(),
    ate: isoLocal(new Date()),
    areaId: '',
    incluirPlanos: true,
    incluirChecklists: true,
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [gerando, setGerando] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioFotografico | null>(null);
  const [observacoesFinais, setObservacoesFinais] = useState('');

  useEffect(() => {
    void api.get<Array<{ id: string; nomeFantasia: string }>>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    if (!filtro.clienteId) {
      setAreas([]);
      return;
    }
    void api
      .get<{ itens: Array<{ id: string; nome: string; codigo: string }> }>(`/areas?clienteId=${filtro.clienteId}&porPagina=200`)
      .then((r) => setAreas(r.itens))
      .catch(() => setAreas([]));
  }, [filtro.clienteId]);

  async function gerar() {
    const novosErros: Record<string, string> = {};
    if (!filtro.clienteId) novosErros.clienteId = 'Escolha o cliente do relatório.';
    if (filtro.de && filtro.ate && filtro.de > filtro.ate) novosErros.ate = 'A data final deve ser igual ou posterior à inicial.';
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    setGerando(true);
    try {
      const p = new URLSearchParams({
        clienteId: filtro.clienteId,
        incluirPlanos: String(filtro.incluirPlanos),
        incluirChecklists: String(filtro.incluirChecklists),
      });
      if (filtro.de) p.set('de', filtro.de);
      if (filtro.ate) p.set('ate', filtro.ate);
      if (filtro.areaId) p.set('areaId', filtro.areaId);
      setRelatorio(await api.get<RelatorioFotografico>(`/relatorios/fotografico?${p.toString()}`));
    } catch (erro) {
      if (erro instanceof ErroApi) {
        const porCampo: Record<string, string> = {};
        for (const [campo, mensagens] of Object.entries(erro.campos)) porCampo[campo] = mensagens[0] ?? '';
        setErros(porCampo);
        mostrar(erro.mensagemAmigavel(), 'erro');
      } else {
        mostrar(erro instanceof Error ? erro.message : 'Falha ao montar o relatório.', 'erro');
      }
    } finally {
      setGerando(false);
    }
  }

  const r = relatorio;
  const logoEmpresa = urlAbsoluta(r?.empresa.logoUrl);
  const logoCliente = urlAbsoluta(r?.cliente.logoUrl);

  return (
    <>
      <div className="painel sem-impressao">
        <h3>Relatório fotográfico de SSMA</h3>
        <p className="desc">
          Fotos das observações de campo (com o "depois" da evidência do plano concluído), dos planos de ação e das
          execuções de checklist no período escolhido, organizadas numa folha pronta para imprimir ou salvar em PDF.
        </p>
        <div className="filtros">
          <Campo label="Cliente" htmlFor="rf-cliente" obrigatorio erro={erros.clienteId}>
            <select id="rf-cliente" value={filtro.clienteId} onChange={(e) => setFiltro({ ...filtro, clienteId: e.target.value, areaId: '' })}>
              <option value="">Escolha...</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeFantasia}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="De" htmlFor="rf-de" erro={erros.de}>
            <input id="rf-de" type="date" value={filtro.de} onChange={(e) => setFiltro({ ...filtro, de: e.target.value })} />
          </Campo>
          <Campo label="Até" htmlFor="rf-ate" erro={erros.ate}>
            <input id="rf-ate" type="date" value={filtro.ate} onChange={(e) => setFiltro({ ...filtro, ate: e.target.value })} />
          </Campo>
          <Campo label="Área" htmlFor="rf-area" erro={erros.areaId}>
            <select id="rf-area" value={filtro.areaId} onChange={(e) => setFiltro({ ...filtro, areaId: e.target.value })} disabled={!filtro.clienteId}>
              <option value="">Todas as áreas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo} · {a.nome}
                </option>
              ))}
            </select>
          </Campo>
          <div className="check-linha" style={{ alignSelf: 'end' }}>
            <label>
              <input type="checkbox" checked={filtro.incluirPlanos} onChange={(e) => setFiltro({ ...filtro, incluirPlanos: e.target.checked })} />
              Incluir planos de ação
            </label>
            <label>
              <input type="checkbox" checked={filtro.incluirChecklists} onChange={(e) => setFiltro({ ...filtro, incluirChecklists: e.target.checked })} />
              Incluir checklists
            </label>
          </div>
          <div style={{ alignSelf: 'end', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={() => void gerar()} disabled={gerando}>
              <Icone nome="camera" /> {gerando ? 'Gerando...' : 'Gerar'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => window.print()} disabled={!r} title={r ? undefined : 'Gere o relatório primeiro'}>
              <Icone nome="impressora" /> Imprimir / salvar PDF
            </button>
          </div>
        </div>
        {r ? (
          <Campo label="Observações finais (aparecem no fim da folha)" htmlFor="rf-obs">
            <textarea id="rf-obs" rows={3} value={observacoesFinais} onChange={(e) => setObservacoesFinais(e.target.value)} placeholder="Considerações do consultor sobre o período, pendências e próximos passos." />
          </Campo>
        ) : null}
      </div>

      {gerando && !r ? (
        <div className="painel">
          <div className="centro-tela">
            <div className="spinner" />
            Montando o relatório...
          </div>
        </div>
      ) : null}

      {r ? (
        <div className="painel folha">
          <div className="folha-cabecalho" style={{ alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {logoEmpresa ? <img src={logoEmpresa} alt={r.empresa.nomeFantasia} style={{ maxHeight: 56, maxWidth: 140, objectFit: 'contain' }} /> : null}
              <div>
                <h2>Relatório Fotográfico de SSMA</h2>
                <div className="hint">
                  {r.cliente.nomeFantasia} · {r.cliente.razaoSocial}
                </div>
                <div className="hint">
                  Período: {formatarDataIso(r.periodo.de)} a {formatarDataIso(r.periodo.ate)}
                </div>
              </div>
            </div>
            <div className="meta" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              {logoCliente ? <img src={logoCliente} alt={r.cliente.nomeFantasia} style={{ maxHeight: 48, maxWidth: 140, objectFit: 'contain' }} /> : null}
              <b>{r.empresa.nomeFantasia}</b>
              <div>gerado em {formatarDataHora(r.geradoEm)}</div>
            </div>
          </div>

          <div className="stat-grid">
            <div className="stat">
              <b>{r.resumo.total}</b>
              <span>registro(s) com foto</span>
            </div>
            <div className="stat">
              <b>{r.resumo.comAntesEDepois}</b>
              <span>com antes e depois</span>
            </div>
            <div className="stat">
              <b>{r.resumo.observacoes}</b>
              <span>observação(ões) de campo</span>
            </div>
            <div className="stat">
              <b>{r.resumo.planos + r.resumo.checklists}</b>
              <span>
                plano(s) {r.resumo.planos} · checklist(s) {r.resumo.checklists}
              </span>
            </div>
          </div>
          {r.resumo.truncado ? (
            <div className="hint alerta sem-impressao">O período tem mais de 300 registros com foto; apenas os 300 primeiros aparecem. Reduza o período ou filtre por área.</div>
          ) : null}

          <div className="folha-secao">
            <h4>Registros fotográficos</h4>
            {r.itens.length === 0 ? (
              <div className="vazio">
                <div className="icone-vazio" aria-hidden="true">
                  <Icone nome="camera" tamanho={22} />
                </div>
                <h4>Nenhuma foto no período</h4>
                <p>Não há observações, planos ou checklists com foto para este cliente no período e área escolhidos.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                {r.itens.map((item, indice) => {
                  const duasFotos = Boolean(item.fotoAntesUrl && item.fotoDepoisUrl);
                  const unica = item.fotoAntesUrl ?? item.fotoDepoisUrl;
                  return (
                    <div key={`${item.origem}-${item.id}`} style={ESTILO_CARTAO}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <b style={{ fontSize: 13 }}>
                          {indice + 1}. {item.titulo}
                        </b>
                        <span className="pill gray" style={{ fontSize: 10 }}>
                          {ROTULO_ORIGEM[item.origem]}
                        </span>
                      </div>
                      {duasFotos ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <Foto url={item.fotoAntesUrl} rotulo="Antes" />
                          <Foto url={item.fotoDepoisUrl} rotulo="Depois" />
                        </div>
                      ) : (
                        <Foto url={unica} rotulo={item.fotoAntesUrl ? (item.origem === 'CHECKLIST' ? 'Registro' : 'Antes') : 'Depois'} />
                      )}
                      <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.4 }}>
                        <div className="hint">
                          {formatarDataHora(item.data)}
                          {item.area ? ` · ${item.area}` : ''}
                        </div>
                        <p style={{ margin: '4px 0' }}>{item.descricao}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          {item.situacao ? <span className={`pill ${classeDaSituacao(item)}`}>{item.situacao}</span> : null}
                          {item.grau ? <span className="pill orange">{item.grau}</span> : null}
                          {item.responsavel ? <span className="hint">Responsável: {item.responsavel}</span> : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {observacoesFinais.trim() ? (
            <div className="folha-secao">
              <h4>Observações finais</h4>
              {observacoesFinais
                .split(/\n{2,}/)
                .map((paragrafo, i) => (
                  <p key={i} style={{ whiteSpace: 'pre-line', margin: '0 0 8px' }}>
                    {paragrafo.trim()}
                  </p>
                ))}
            </div>
          ) : null}

          <div className="folha-assinatura">
            <div>
              <div style={{ height: 50 }} />
              {r.cabecalho.responsavelTecnicoLinha}
              <div className="hint">{r.empresa.nomeFantasia}</div>
            </div>
            <div>
              <div style={{ height: 50 }} />
              Ciente — {r.cliente.nomeFantasia}
            </div>
          </div>

          <div className="hint" style={{ marginTop: 18, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 11, textAlign: 'center' }}>
            {r.cabecalho.rodapeRelatorio}
            <div>{r.cabecalho.contatoLinha}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
