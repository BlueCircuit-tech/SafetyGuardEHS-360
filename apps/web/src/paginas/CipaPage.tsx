import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CARGA_HORARIA_TREINAMENTO_CIPA,
  CARGOS_CIPA,
  REPRESENTACOES,
  ROTULO_CARGO_CIPA,
  ROTULO_REPRESENTACAO_CIPA,
  ROTULO_SITUACAO_CIPA,
  ROTULO_TIPO_DOCUMENTO_CIPA,
  ROTULO_TIPO_MEMBRO_CIPA,
  SITUACOES_CIPA,
  TIPOS_DOCUMENTO_CIPA,
  TIPOS_MEMBRO,
  cronogramaPadraoCipa,
  dimensionamentoCipaSugerido,
  type CargoCipa,
  type CipaEtapa,
  type CipaMembro,
  type RepresentacaoCipa,
  type SituacaoCipa,
  type TipoDocumentoCipa,
  type TipoMembroCipa,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import { useSessao } from '../lib/sessao';

/* -------------------------------------------------------------------------- */
/* Tipos da API                                                               */
/* -------------------------------------------------------------------------- */

interface DocumentoApi {
  id: string;
  cipaId: string;
  tipo: TipoDocumentoCipa;
  titulo: string;
  url: string;
  data: string | null;
  observacoes: string | null;
  criadoEm: string;
  rotulos?: { tipo: string };
}

interface CipaApi {
  id: string;
  clienteId: string;
  gestao: string;
  dataInicioMandato: string;
  dataFimMandato: string;
  situacao: SituacaoCipa;
  cronograma: CipaEtapa[] | null;
  membros: CipaMembro[] | null;
  observacoes: string | null;
  cliente: { id: string; nomeFantasia: string };
  _count?: { documentos: number };
  documentos?: DocumentoApi[];
  diasParaFimDoMandato: number;
  rotulos?: { situacao: string };
}

interface ClienteApi {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  formatado?: { cnpj: string; cep: string };
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  grauRisco: number;
  quantidadeFuncionarios: number;
  logoUrl: string | null;
}

interface ResumoApi {
  total: number;
  emMandato: number;
  emProcessoEleitoral: number;
  vencendo60Dias: number;
  documentos: number;
}

/* -------------------------------------------------------------------------- */
/* Constantes e utilitarios                                                   */
/* -------------------------------------------------------------------------- */

type Aba = 'mandato' | 'membros' | 'cronograma' | 'documentos' | 'modelos';
type Modelo = 'edital' | 'ficha' | 'presenca' | 'cedula' | 'ata-eleicao' | 'ata-posse' | 'certificado';

const PILL_SITUACAO: Record<SituacaoCipa, string> = {
  PLANEJAMENTO: 'gray',
  PROCESSO_ELEITORAL: 'warn',
  EM_MANDATO: 'ok',
  ENCERRADA: 'info',
};

const MODELOS: Array<{ id: Modelo; titulo: string; descricao: string }> = [
  { id: 'edital', titulo: 'Edital de convocação', descricao: 'Convoca a eleição com o cronograma e as regras de inscrição e votação.' },
  { id: 'ficha', titulo: 'Ficha de inscrição', descricao: 'Preenchida por cada candidato a representante dos empregados.' },
  { id: 'presenca', titulo: 'Lista de presença da votação', descricao: 'Linhas numeradas para assinatura dos votantes.' },
  { id: 'cedula', titulo: 'Cédula de votação', descricao: 'Candidatos inscritos com quadrinho para marcação.' },
  { id: 'ata-eleicao', titulo: 'Ata de eleição e apuração', descricao: 'Resultado da votação com os votos de cada candidato.' },
  { id: 'ata-posse', titulo: 'Ata de posse', descricao: 'Posse dos membros eleitos e designados e escolha da diretoria.' },
  { id: 'certificado', titulo: 'Certificado de treinamento', descricao: `Treinamento de cipeiro com ${CARGA_HORARIA_TREINAMENTO_CIPA} h (NR-5, item 5.7).` },
];

const B = '______________';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

interface MembroForm {
  nome: string;
  funcao: string;
  setor: string;
  representacao: RepresentacaoCipa;
  tipo: TipoMembroCipa;
  cargo: '' | CargoCipa;
  votos: string;
}

const MEMBRO_VAZIO: MembroForm = { nome: '', funcao: '', setor: '', representacao: 'EMPREGADOS', tipo: 'TITULAR', cargo: '', votos: '' };
const ETAPA_VAZIA: CipaEtapa = { etapa: '', data: '', concluida: false };
const NOVA_VAZIA = { clienteId: '', gestao: '', dataInicioMandato: '', dataFimMandato: '', situacao: 'PLANEJAMENTO' as SituacaoCipa };

function primeiroErro(campos: Record<string, string[]>): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const [campo, mensagens] of Object.entries(campos)) {
    const chave = campo.split('.')[0] ?? campo;
    if (mensagens[0] && !resultado[chave]) resultado[chave] = mensagens[0];
  }
  return resultado;
}

/** `2026-03-01T00:00:00.000Z` -> `1 de março de 2026` (sem passar pelo fuso). */
function dataPorExtenso(iso: string | null | undefined): string {
  if (!iso) return B;
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  if (!ano || !mes || !dia) return B;
  return `${dia} de ${MESES[mes - 1]} de ${ano}`;
}

/** Data da primeira etapa do cronograma cujo nome casa com o padrao. */
function dataDaEtapa(cronograma: CipaEtapa[] | null, padrao: RegExp): string | null {
  const etapa = cronograma?.find((e) => padrao.test(e.etapa));
  return etapa?.data ? etapa.data : null;
}

function paraMembroForm(m: CipaMembro): MembroForm {
  return {
    nome: m.nome,
    funcao: m.funcao ?? '',
    setor: m.setor ?? '',
    representacao: m.representacao,
    tipo: m.tipo,
    cargo: m.cargo ?? '',
    votos: m.votos === null || m.votos === undefined ? '' : String(m.votos),
  };
}

function paraMembroApi(m: MembroForm) {
  return {
    nome: m.nome,
    funcao: m.funcao || undefined,
    setor: m.setor || undefined,
    representacao: m.representacao,
    tipo: m.tipo,
    cargo: m.cargo || undefined,
    votos: m.votos === '' ? undefined : Number(m.votos),
  };
}

function enderecoDoCliente(c: ClienteApi | null): string {
  if (!c) return B;
  const partes = [`${c.logradouro}, ${c.numero}`, c.complemento, c.bairro, `${c.cidade}/${c.uf}`, c.formatado?.cep ? `CEP ${c.formatado.cep}` : null];
  return partes.filter(Boolean).join(' — ');
}

/* -------------------------------------------------------------------------- */
/* Pagina                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * CIPA (NR-5): o mandato e a unidade. Cada CIPA tem gestao, datas, situacao,
 * cronograma do processo eleitoral, membros e documentos anexados; os modelos
 * (edital, ficha, lista de presenca, cedula, atas, certificado) sao folhas
 * imprimiveis geradas a partir desses dados.
 */
export function CipaPage() {
  const { mostrar } = useToast();
  const { pode } = useSessao();
  const podeEscrever = pode('cadastros:escrever');

  const [clientes, setClientes] = useState<Array<{ id: string; nomeFantasia: string }>>([]);
  const [clienteId, setClienteId] = useState('');
  const [resumo, setResumo] = useState<ResumoApi | null>(null);
  const [itens, setItens] = useState<CipaApi[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [form, setForm] = useState(NOVA_VAZIA);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  const [aberta, setAberta] = useState<CipaApi | null>(null);
  const [clienteAberto, setClienteAberto] = useState<ClienteApi | null>(null);
  const [aba, setAba] = useState<Aba>('mandato');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const p = new URLSearchParams();
      if (clienteId) p.set('clienteId', clienteId);
      const consulta = p.toString() ? `?${p.toString()}` : '';
      const [lista, res] = await Promise.all([api.get<CipaApi[]>(`/cipas${consulta}`), api.get<ResumoApi>(`/cipas/resumo${consulta}`)]);
      setItens(lista);
      setResumo(res);
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar as CIPAs.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [clienteId, mostrar]);

  useEffect(() => {
    void api.get<Array<{ id: string; nomeFantasia: string }>>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrir = useCallback(
    async (id: string) => {
      try {
        const cipa = await api.get<CipaApi>(`/cipas/${id}`);
        setAberta(cipa);
        setAba('mandato');
        const cliente = await api.get<ClienteApi>(`/clientes/${cipa.clienteId}`).catch(() => null);
        setClienteAberto(cliente);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (erro) {
        mostrar(erro instanceof Error ? erro.message : 'Falha ao abrir a CIPA.', 'erro');
      }
    },
    [mostrar],
  );

  async function criar() {
    setSalvando(true);
    setErros({});
    try {
      const criada = await api.post<CipaApi>('/cipas', form);
      mostrar(`CIPA gestão ${criada.gestao} criada com o cronograma padrão da NR-5.`, 'sucesso');
      setForm(NOVA_VAZIA);
      void carregar();
      void abrir(criada.id);
    } catch (erro) {
      if (erro instanceof ErroApi) {
        setErros(primeiroErro(erro.campos));
        mostrar(erro.mensagemAmigavel(), 'erro');
      } else {
        mostrar('Falha ao criar a CIPA.', 'erro');
      }
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(cipa: CipaApi) {
    if (!window.confirm(`Excluir a CIPA gestão ${cipa.gestao} de ${cipa.cliente.nomeFantasia}? Os documentos anexados também serão removidos.`)) return;
    try {
      await api.delete(`/cipas/${cipa.id}`);
      mostrar('CIPA excluída.', 'sucesso');
      if (aberta?.id === cipa.id) setAberta(null);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao excluir.', 'erro');
    }
  }

  /** Atualizacao parcial; a API devolve a CIPA completa (com documentos). */
  async function salvarParcial(dados: Record<string, unknown>, mensagem: string): Promise<Record<string, string> | null> {
    if (!aberta) return null;
    try {
      const atualizada = await api.put<CipaApi>(`/cipas/${aberta.id}`, dados);
      setAberta(atualizada);
      mostrar(mensagem, 'sucesso');
      void carregar();
      return null;
    } catch (erro) {
      if (erro instanceof ErroApi) {
        mostrar(erro.mensagemAmigavel(), 'erro');
        return primeiroErro(erro.campos);
      }
      mostrar('Falha ao salvar.', 'erro');
      return {};
    }
  }

  /* ------------------------------------------------------------ detalhe --- */

  if (aberta) {
    const cipa = aberta;
    const dimensionamento =
      clienteAberto && clienteAberto.grauRisco >= 1 && clienteAberto.grauRisco <= 4
        ? dimensionamentoCipaSugerido(clienteAberto.grauRisco as 1 | 2 | 3 | 4, clienteAberto.quantidadeFuncionarios)
        : null;

    return (
      <>
        <div className="painel sem-impressao">
          <div className="barra-acoes" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setAberta(null)}>
              <Icone nome="voltar" /> Voltar
            </button>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className={`pill ${PILL_SITUACAO[cipa.situacao]}`}>{cipa.rotulos?.situacao ?? ROTULO_SITUACAO_CIPA[cipa.situacao]}</span>
              {podeEscrever ? (
                <button type="button" className="btn btn-ghost" onClick={() => void excluir(cipa)}>
                  Excluir
                </button>
              ) : null}
            </div>
          </div>
          <h3 style={{ marginTop: 8 }}>
            CIPA gestão {cipa.gestao} — {cipa.cliente.nomeFantasia}
          </h3>
          <p className="desc">
            Mandato de {formatarDataIso(cipa.dataInicioMandato)} a {formatarDataIso(cipa.dataFimMandato)}
            {cipa.situacao !== 'ENCERRADA'
              ? cipa.diasParaFimDoMandato < 0
                ? ` · vencido há ${Math.abs(cipa.diasParaFimDoMandato)} dia(s)`
                : ` · faltam ${cipa.diasParaFimDoMandato} dia(s) para o fim do mandato`
              : null}
          </p>
          {clienteAberto ? (
            <div className={`hint ${dimensionamento ? '' : 'alerta'}`}>
              {dimensionamento
                ? `Dimensionamento sugerido: ${dimensionamento.efetivos} titular(es) e ${dimensionamento.suplentes} suplente(s) por representação (grau de risco ${clienteAberto.grauRisco}, ${clienteAberto.quantidadeFuncionarios} empregados). Referência simplificada — o Quadro I da NR-5, por CNAE, prevalece.`
                : `Com grau de risco ${clienteAberto.grauRisco} e ${clienteAberto.quantidadeFuncionarios} empregados, a referência simplificada dispensa a CIPA (designa-se um representante, NR-5 item 5.6.4). Confira o Quadro I oficial.`}
            </div>
          ) : null}

          <div className="abas" style={{ marginTop: 12 }}>
            {(
              [
                ['mandato', 'Mandato'],
                ['membros', `Membros (${cipa.membros?.length ?? 0})`],
                ['cronograma', `Cronograma (${cipa.cronograma?.length ?? 0})`],
                ['documentos', `Documentos (${cipa.documentos?.length ?? 0})`],
                ['modelos', 'Modelos'],
              ] as Array<[Aba, string]>
            ).map(([id, rotulo]) => (
              <button key={id} type="button" className={aba === id ? 'ativa' : ''} onClick={() => setAba(id)}>
                {rotulo}
              </button>
            ))}
          </div>
        </div>

        {aba === 'mandato' ? <AbaMandato cipa={cipa} podeEscrever={podeEscrever} salvar={salvarParcial} /> : null}
        {aba === 'membros' ? <AbaMembros cipa={cipa} podeEscrever={podeEscrever} salvar={salvarParcial} /> : null}
        {aba === 'cronograma' ? <AbaCronograma cipa={cipa} podeEscrever={podeEscrever} salvar={salvarParcial} /> : null}
        {aba === 'documentos' ? (
          <AbaDocumentos cipa={cipa} podeEscrever={podeEscrever} aoMudar={(docs) => { setAberta({ ...cipa, documentos: docs }); void carregar(); }} />
        ) : null}
        {aba === 'modelos' ? <AbaModelos cipa={cipa} cliente={clienteAberto} dimensionamento={dimensionamento} /> : null}
      </>
    );
  }

  /* -------------------------------------------------------------- lista --- */

  return (
    <>
      <div className="painel">
        <h3>CIPA — Comissão Interna de Prevenção de Acidentes e de Assédio (NR-5)</h3>
        <p className="desc">
          Cada mandato reúne o processo eleitoral (cronograma, edital, inscrições, votação, apuração), os membros eleitos e
          designados, os documentos anexados e os modelos imprimíveis gerados a partir desses dados.
        </p>
        {resumo ? (
          <div className="stat-grid">
            <div className="stat">
              <b>{resumo.emMandato}</b>
              <span>Mandatos ativos</span>
            </div>
            <div className="stat">
              <b>{resumo.emProcessoEleitoral}</b>
              <span>Em processo eleitoral</span>
            </div>
            <div className="stat">
              <b>{resumo.vencendo60Dias}</b>
              <span>Vencendo em 60 dias</span>
            </div>
            <div className="stat">
              <b>{resumo.documentos}</b>
              <span>Documentos anexados</span>
            </div>
          </div>
        ) : null}
      </div>

      {podeEscrever ? (
        <div className="painel">
          <h3>Nova CIPA</h3>
          <p className="desc">Sem cronograma informado, a CIPA nasce com o calendário típico da NR-5 contado para trás a partir da posse.</p>
          <div className="filtros">
            <Campo label="Cliente" htmlFor="cipa-cliente" obrigatorio erro={erros.clienteId}>
              <select id="cipa-cliente" value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
                <option value="">Selecione...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nomeFantasia}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Gestão" htmlFor="cipa-gestao" obrigatorio erro={erros.gestao} ajuda="Ex.: 2026/2027">
              <input id="cipa-gestao" value={form.gestao} maxLength={20} onChange={(e) => setForm({ ...form, gestao: e.target.value })} />
            </Campo>
            <Campo label="Início do mandato (posse)" htmlFor="cipa-ini" obrigatorio erro={erros.dataInicioMandato}>
              <input id="cipa-ini" type="date" value={form.dataInicioMandato} onChange={(e) => setForm({ ...form, dataInicioMandato: e.target.value })} />
            </Campo>
            <Campo label="Fim do mandato" htmlFor="cipa-fim" obrigatorio erro={erros.dataFimMandato}>
              <input id="cipa-fim" type="date" value={form.dataFimMandato} onChange={(e) => setForm({ ...form, dataFimMandato: e.target.value })} />
            </Campo>
            <Campo label="Situação" htmlFor="cipa-sit" erro={erros.situacao}>
              <select id="cipa-sit" value={form.situacao} onChange={(e) => setForm({ ...form, situacao: e.target.value as SituacaoCipa })}>
                {SITUACOES_CIPA.map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_SITUACAO_CIPA[s]}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <div className="barra-acoes">
            <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void criar()}>
              {salvando ? 'Salvando...' : 'Criar CIPA'}
            </button>
            {!form.clienteId || !form.gestao || !form.dataInicioMandato || !form.dataFimMandato ? (
              <span className="hint">Preencha cliente, gestão e as datas do mandato.</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="painel">
        <div className="filtros">
          <Campo label="Cliente" htmlFor="fcipa-cliente">
            <select id="fcipa-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeFantasia}
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
            <h4>Nenhuma CIPA</h4>
            <p>Crie o primeiro mandato para gerar o cronograma e os modelos de documentos.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Gestão</th>
                  <th>Mandato</th>
                  <th>Situação</th>
                  <th className="num-col">Membros</th>
                  <th className="num-col">Docs</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {itens.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.cliente.nomeFantasia}</b>
                    </td>
                    <td className="mono">{c.gestao}</td>
                    <td>
                      {formatarDataIso(c.dataInicioMandato)} a {formatarDataIso(c.dataFimMandato)}
                      {c.situacao !== 'ENCERRADA' && c.diasParaFimDoMandato >= 0 && c.diasParaFimDoMandato <= 60 ? (
                        <div className="hint alerta">vence em {c.diasParaFimDoMandato} dia(s)</div>
                      ) : null}
                      {c.situacao !== 'ENCERRADA' && c.diasParaFimDoMandato < 0 ? <div className="hint alerta">mandato vencido</div> : null}
                    </td>
                    <td>
                      <span className={`pill ${PILL_SITUACAO[c.situacao]}`}>{c.rotulos?.situacao ?? ROTULO_SITUACAO_CIPA[c.situacao]}</span>
                    </td>
                    <td className="num-col">{c.membros?.length ?? 0}</td>
                    <td className="num-col">{c._count?.documentos ?? 0}</td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void abrir(c.id)}>
                        Abrir
                      </button>
                    </td>
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

/* -------------------------------------------------------------------------- */
/* Aba Mandato                                                                */
/* -------------------------------------------------------------------------- */

interface AbaProps {
  cipa: CipaApi;
  podeEscrever: boolean;
  salvar: (dados: Record<string, unknown>, mensagem: string) => Promise<Record<string, string> | null>;
}

function AbaMandato({ cipa, podeEscrever, salvar }: AbaProps) {
  const [form, setForm] = useState({
    gestao: cipa.gestao,
    dataInicioMandato: cipa.dataInicioMandato.slice(0, 10),
    dataFimMandato: cipa.dataFimMandato.slice(0, 10),
    situacao: cipa.situacao,
    observacoes: cipa.observacoes ?? '',
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setForm({
      gestao: cipa.gestao,
      dataInicioMandato: cipa.dataInicioMandato.slice(0, 10),
      dataFimMandato: cipa.dataFimMandato.slice(0, 10),
      situacao: cipa.situacao,
      observacoes: cipa.observacoes ?? '',
    });
  }, [cipa]);

  async function enviar() {
    setSalvando(true);
    const resultado = await salvar({ ...form, observacoes: form.observacoes || null }, 'Mandato atualizado.');
    setErros(resultado ?? {});
    setSalvando(false);
  }

  return (
    <div className="painel">
      <h3>Dados do mandato</h3>
      <div className="filtros">
        <Campo label="Gestão" htmlFor="m-gestao" obrigatorio erro={erros.gestao}>
          <input id="m-gestao" value={form.gestao} maxLength={20} disabled={!podeEscrever} onChange={(e) => setForm({ ...form, gestao: e.target.value })} />
        </Campo>
        <Campo label="Início do mandato (posse)" htmlFor="m-ini" obrigatorio erro={erros.dataInicioMandato}>
          <input id="m-ini" type="date" value={form.dataInicioMandato} disabled={!podeEscrever} onChange={(e) => setForm({ ...form, dataInicioMandato: e.target.value })} />
        </Campo>
        <Campo label="Fim do mandato" htmlFor="m-fim" obrigatorio erro={erros.dataFimMandato}>
          <input id="m-fim" type="date" value={form.dataFimMandato} disabled={!podeEscrever} onChange={(e) => setForm({ ...form, dataFimMandato: e.target.value })} />
        </Campo>
        <Campo label="Situação" htmlFor="m-sit" erro={erros.situacao}>
          <select id="m-sit" value={form.situacao} disabled={!podeEscrever} onChange={(e) => setForm({ ...form, situacao: e.target.value as SituacaoCipa })}>
            {SITUACOES_CIPA.map((s) => (
              <option key={s} value={s}>
                {ROTULO_SITUACAO_CIPA[s]}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <Campo label="Observações" htmlFor="m-obs" erro={erros.observacoes} ajuda="Registre decisões da comissão eleitoral, pendências, recursos de candidatos, calendário de reuniões.">
        <textarea id="m-obs" rows={5} value={form.observacoes} disabled={!podeEscrever} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
      </Campo>
      {podeEscrever ? (
        <div className="barra-acoes">
          <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void enviar()}>
            {salvando ? 'Salvando...' : 'Salvar mandato'}
          </button>
        </div>
      ) : (
        <p className="hint">Seu perfil não tem permissão para alterar cadastros.</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Aba Membros                                                                */
/* -------------------------------------------------------------------------- */

function AbaMembros({ cipa, podeEscrever, salvar }: AbaProps) {
  const [membros, setMembros] = useState<MembroForm[]>((cipa.membros ?? []).map(paraMembroForm));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setMembros((cipa.membros ?? []).map(paraMembroForm));
  }, [cipa]);

  function definir(indice: number, campo: keyof MembroForm, valor: string) {
    setMembros(membros.map((m, i) => (i === indice ? { ...m, [campo]: valor } : m)));
  }

  async function enviar() {
    setSalvando(true);
    const resultado = await salvar({ membros: membros.map(paraMembroApi) }, 'Membros salvos.');
    setErros(resultado ?? {});
    setSalvando(false);
  }

  const errosDeLinha = Object.entries(erros).filter(([campo]) => campo.startsWith('membros'));

  return (
    <div className="painel">
      <h3>Membros da comissão</h3>
      <p className="desc">
        Representantes dos empregados são eleitos (registre os votos); os do empregador são designados. O presidente é designado
        pelo empregador, o vice-presidente é eleito pelos representantes dos empregados e o secretário é escolhido de comum acordo.
      </p>
      {membros.length === 0 ? (
        <p className="hint">Nenhum membro cadastrado. Inclua os candidatos inscritos para gerar a cédula e, após a apuração, informe os votos.</p>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Função</th>
                <th>Setor</th>
                <th>Representação</th>
                <th>Titular/Suplente</th>
                <th>Cargo</th>
                <th className="num-col">Votos</th>
                {podeEscrever ? <th aria-label="Ações" /> : null}
              </tr>
            </thead>
            <tbody>
              {membros.map((m, i) => (
                <tr key={i}>
                  <td>
                    <input aria-label={`Nome do membro ${i + 1}`} value={m.nome} maxLength={120} disabled={!podeEscrever} onChange={(e) => definir(i, 'nome', e.target.value)} />
                  </td>
                  <td>
                    <input aria-label={`Função do membro ${i + 1}`} value={m.funcao} maxLength={80} disabled={!podeEscrever} onChange={(e) => definir(i, 'funcao', e.target.value)} />
                  </td>
                  <td>
                    <input aria-label={`Setor do membro ${i + 1}`} value={m.setor} maxLength={80} disabled={!podeEscrever} onChange={(e) => definir(i, 'setor', e.target.value)} />
                  </td>
                  <td>
                    <select aria-label={`Representação do membro ${i + 1}`} value={m.representacao} disabled={!podeEscrever} onChange={(e) => definir(i, 'representacao', e.target.value)}>
                      {REPRESENTACOES.map((r) => (
                        <option key={r} value={r}>
                          {ROTULO_REPRESENTACAO_CIPA[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select aria-label={`Tipo do membro ${i + 1}`} value={m.tipo} disabled={!podeEscrever} onChange={(e) => definir(i, 'tipo', e.target.value)}>
                      {TIPOS_MEMBRO.map((t) => (
                        <option key={t} value={t}>
                          {ROTULO_TIPO_MEMBRO_CIPA[t]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select aria-label={`Cargo do membro ${i + 1}`} value={m.cargo} disabled={!podeEscrever} onChange={(e) => definir(i, 'cargo', e.target.value)}>
                      <option value="">—</option>
                      {CARGOS_CIPA.map((c) => (
                        <option key={c} value={c}>
                          {ROTULO_CARGO_CIPA[c]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num-col">
                    <input
                      aria-label={`Votos do membro ${i + 1}`}
                      type="number"
                      min={0}
                      style={{ width: 80 }}
                      value={m.votos}
                      disabled={!podeEscrever || m.representacao !== 'EMPREGADOS'}
                      onChange={(e) => definir(i, 'votos', e.target.value)}
                    />
                  </td>
                  {podeEscrever ? (
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMembros(membros.filter((_, j) => j !== i))}>
                        Remover
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {errosDeLinha.length > 0 ? (
        <div className="hint alerta">
          {errosDeLinha.map(([campo, mensagem]) => (
            <div key={campo}>{mensagem}</div>
          ))}
        </div>
      ) : null}
      {podeEscrever ? (
        <div className="barra-acoes">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMembros([...membros, { ...MEMBRO_VAZIO }])}>
            <Icone nome="mais" /> Adicionar membro
          </button>
          <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void enviar()}>
            {salvando ? 'Salvando...' : 'Salvar membros'}
          </button>
          {membros.some((m) => m.nome.trim().length < 3) ? <span className="hint">Todo membro precisa de nome (mínimo 3 letras).</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Aba Cronograma                                                             */
/* -------------------------------------------------------------------------- */

function AbaCronograma({ cipa, podeEscrever, salvar }: AbaProps) {
  const [etapas, setEtapas] = useState<CipaEtapa[]>(cipa.cronograma ?? []);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setEtapas(cipa.cronograma ?? []);
  }, [cipa]);

  function definir(indice: number, mudanca: Partial<CipaEtapa>) {
    setEtapas(etapas.map((e, i) => (i === indice ? { ...e, ...mudanca } : e)));
  }

  function gerarPadrao() {
    if (etapas.length > 0 && !window.confirm('Substituir o cronograma atual pelo padrão da NR-5 contado a partir da posse?')) return;
    setEtapas(cronogramaPadraoCipa(new Date(cipa.dataInicioMandato)));
  }

  async function enviar() {
    setSalvando(true);
    const resultado = await salvar({ cronograma: etapas }, 'Cronograma salvo.');
    setErros(resultado ?? {});
    setSalvando(false);
  }

  const concluidas = etapas.filter((e) => e.concluida).length;
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div className="painel">
      <h3>Cronograma do processo eleitoral</h3>
      <p className="desc">
        Prazos de referência da NR-5 (item 5.5): convocação 60 dias antes do fim do mandato anterior, edital 45 dias antes,
        inscrições por no mínimo 15 dias, eleição até 30 dias antes e posse no primeiro dia útil após o término. {concluidas} de{' '}
        {etapas.length} etapa(s) concluída(s).
      </p>
      {etapas.length === 0 ? (
        <p className="hint">Sem etapas. Gere o cronograma padrão ou inclua as etapas manualmente.</p>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Etapa</th>
                <th>Data</th>
                <th>Concluída</th>
                {podeEscrever ? <th aria-label="Ações" /> : null}
              </tr>
            </thead>
            <tbody>
              {etapas.map((e, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <input aria-label={`Etapa ${i + 1}`} value={e.etapa} maxLength={150} disabled={!podeEscrever} onChange={(ev) => definir(i, { etapa: ev.target.value })} />
                  </td>
                  <td>
                    <input aria-label={`Data da etapa ${i + 1}`} type="date" value={e.data} disabled={!podeEscrever} onChange={(ev) => definir(i, { data: ev.target.value })} />
                    {!e.concluida && e.data && e.data < hoje ? <div className="hint alerta">atrasada</div> : null}
                  </td>
                  <td>
                    <label className="check-linha">
                      <input type="checkbox" checked={e.concluida} disabled={!podeEscrever} onChange={(ev) => definir(i, { concluida: ev.target.checked })} />
                      {e.concluida ? 'Sim' : 'Não'}
                    </label>
                  </td>
                  {podeEscrever ? (
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEtapas(etapas.filter((_, j) => j !== i))}>
                        Remover
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {erros.cronograma ? <div className="hint alerta">{erros.cronograma}</div> : null}
      {podeEscrever ? (
        <div className="barra-acoes">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEtapas([...etapas, { ...ETAPA_VAZIA }])}>
            <Icone nome="mais" /> Adicionar etapa
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={gerarPadrao}>
            <Icone nome="relogio" /> Gerar cronograma padrão (NR-5)
          </button>
          <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void enviar()}>
            {salvando ? 'Salvando...' : 'Salvar cronograma'}
          </button>
          {etapas.some((e) => !e.etapa.trim() || !e.data) ? <span className="hint">Toda etapa precisa de descrição e data.</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Aba Documentos                                                             */
/* -------------------------------------------------------------------------- */

function AbaDocumentos({ cipa, podeEscrever, aoMudar }: { cipa: CipaApi; podeEscrever: boolean; aoMudar: (documentos: DocumentoApi[]) => void }) {
  const { mostrar } = useToast();
  const [form, setForm] = useState<{ tipo: TipoDocumentoCipa; titulo: string; data: string; observacoes: string }>({ tipo: 'EDITAL', titulo: '', data: '', observacoes: '' });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const documentos = cipa.documentos ?? [];
  const porTipo = useMemo(() => {
    const grupos = new Map<TipoDocumentoCipa, DocumentoApi[]>();
    for (const d of documentos) grupos.set(d.tipo, [...(grupos.get(d.tipo) ?? []), d]);
    return TIPOS_DOCUMENTO_CIPA.filter((t) => grupos.has(t)).map((t) => [t, grupos.get(t) ?? []] as const);
  }, [documentos]);

  async function enviar() {
    if (!arquivo) {
      setErros({ arquivo: 'Escolha o arquivo (PDF ou imagem).' });
      return;
    }
    setEnviando(true);
    setErros({});
    try {
      const p = new URLSearchParams({ tipo: form.tipo, titulo: form.titulo });
      if (form.data) p.set('data', form.data);
      if (form.observacoes) p.set('observacoes', form.observacoes);
      const criado = await api.upload<DocumentoApi>(`/cipas/${cipa.id}/documentos?${p.toString()}`, arquivo);
      mostrar('Documento anexado.', 'sucesso');
      aoMudar([...documentos, criado]);
      setForm({ tipo: form.tipo, titulo: '', data: '', observacoes: '' });
      setArquivo(null);
    } catch (erro) {
      if (erro instanceof ErroApi) {
        setErros(primeiroErro(erro.campos));
        mostrar(erro.mensagemAmigavel(), 'erro');
      } else {
        mostrar('Falha ao anexar.', 'erro');
      }
    } finally {
      setEnviando(false);
    }
  }

  async function excluir(doc: DocumentoApi) {
    if (!window.confirm(`Excluir "${doc.titulo}"?`)) return;
    try {
      await api.delete(`/cipas/documentos/${doc.id}`);
      mostrar('Documento excluído.', 'sucesso');
      aoMudar(documentos.filter((d) => d.id !== doc.id));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao excluir.', 'erro');
    }
  }

  return (
    <>
      {podeEscrever ? (
        <div className="painel">
          <h3>Anexar documento</h3>
          <p className="desc">Edital publicado, fichas preenchidas, lista de presença assinada, atas, certificados de treinamento, calendário de reuniões. PDF ou imagem.</p>
          <div className="filtros">
            <Campo label="Tipo" htmlFor="d-tipo" obrigatorio erro={erros.tipo}>
              <select id="d-tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoDocumentoCipa })}>
                {TIPOS_DOCUMENTO_CIPA.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO_DOCUMENTO_CIPA[t]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Título" htmlFor="d-titulo" obrigatorio erro={erros.titulo}>
              <input id="d-titulo" value={form.titulo} maxLength={150} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </Campo>
            <Campo label="Data do documento" htmlFor="d-data" erro={erros.data}>
              <input id="d-data" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </Campo>
            <Campo label="Arquivo" htmlFor="d-arquivo" obrigatorio erro={erros.arquivo}>
              <input id="d-arquivo" type="file" accept="application/pdf,image/*" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            </Campo>
          </div>
          <Campo label="Observações" htmlFor="d-obs" erro={erros.observacoes}>
            <input id="d-obs" value={form.observacoes} maxLength={300} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </Campo>
          <div className="barra-acoes">
            <button type="button" className="btn btn-primary" disabled={enviando} onClick={() => void enviar()}>
              <Icone nome="anexo" /> {enviando ? 'Enviando...' : 'Anexar'}
            </button>
            {!form.titulo || !arquivo ? <span className="hint">Informe o título e escolha o arquivo.</span> : null}
          </div>
        </div>
      ) : null}

      <div className="painel">
        <h3>Documentos anexados</h3>
        {documentos.length === 0 ? (
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="anexo" tamanho={22} />
            </div>
            <h4>Nenhum documento</h4>
            <p>Imprima os modelos na aba "Modelos" e anexe aqui as versões assinadas.</p>
          </div>
        ) : (
          porTipo.map(([tipo, docs]) => (
            <div key={tipo} style={{ marginBottom: 14 }}>
              <h4 style={{ margin: '0 0 6px' }}>{ROTULO_TIPO_DOCUMENTO_CIPA[tipo]}</h4>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th>Data</th>
                      <th>Observações</th>
                      <th>Arquivo</th>
                      {podeEscrever ? <th aria-label="Ações" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <b>{d.titulo}</b>
                        </td>
                        <td>{formatarDataIso(d.data)}</td>
                        <td>{d.observacoes ?? '—'}</td>
                        <td>
                          <a href={urlAbsoluta(d.url) ?? '#'} target="_blank" rel="noreferrer">
                            Abrir arquivo
                          </a>
                        </td>
                        {podeEscrever ? (
                          <td>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluir(d)}>
                              Excluir
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Aba Modelos — folhas imprimiveis                                           */
/* -------------------------------------------------------------------------- */

interface ModeloProps {
  cipa: CipaApi;
  cliente: ClienteApi | null;
  dimensionamento: { efetivos: number; suplentes: number } | null;
}

function AbaModelos({ cipa, cliente, dimensionamento }: ModeloProps) {
  const [modelo, setModelo] = useState<Modelo>('edital');
  const [membroCertificado, setMembroCertificado] = useState('');

  const membros = cipa.membros ?? [];
  const info = MODELOS.find((m) => m.id === modelo);

  return (
    <>
      <div className="painel sem-impressao">
        <h3>Modelos de documentos</h3>
        <p className="desc">
          Gerados a partir dos dados desta CIPA. O que faltar aparece em branco ("______") para preenchimento à mão. Imprima, colha as
          assinaturas e anexe na aba "Documentos".
        </p>
        <div className="abas">
          {MODELOS.map((m) => (
            <button key={m.id} type="button" className={modelo === m.id ? 'ativa' : ''} onClick={() => setModelo(m.id)}>
              {m.titulo}
            </button>
          ))}
        </div>
        <div className="barra-acoes" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span className="hint">{info?.descricao}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {modelo === 'certificado' ? (
              <select aria-label="Membro do certificado" value={membroCertificado} onChange={(e) => setMembroCertificado(e.target.value)}>
                <option value="">Nome em branco</option>
                {membros.map((m, i) => (
                  <option key={i} value={String(i)}>
                    {m.nome}
                  </option>
                ))}
              </select>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              <Icone nome="impressora" /> Imprimir
            </button>
          </div>
        </div>
      </div>

      {modelo === 'edital' ? <ModeloEdital cipa={cipa} cliente={cliente} dimensionamento={dimensionamento} /> : null}
      {modelo === 'ficha' ? <ModeloFicha cipa={cipa} cliente={cliente} dimensionamento={dimensionamento} /> : null}
      {modelo === 'presenca' ? <ModeloPresenca cipa={cipa} cliente={cliente} dimensionamento={dimensionamento} /> : null}
      {modelo === 'cedula' ? <ModeloCedula cipa={cipa} cliente={cliente} dimensionamento={dimensionamento} /> : null}
      {modelo === 'ata-eleicao' ? <ModeloAtaEleicao cipa={cipa} cliente={cliente} dimensionamento={dimensionamento} /> : null}
      {modelo === 'ata-posse' ? <ModeloAtaPosse cipa={cipa} cliente={cliente} dimensionamento={dimensionamento} /> : null}
      {modelo === 'certificado' ? (
        <ModeloCertificado cipa={cipa} cliente={cliente} dimensionamento={dimensionamento} membro={membroCertificado === '' ? null : (membros[Number(membroCertificado)] ?? null)} />
      ) : null}
    </>
  );
}

function CabecalhoFolha({ cipa, cliente, titulo }: ModeloProps & { titulo: string }) {
  return (
    <div className="folha-cabecalho">
      <div>
        {cliente?.logoUrl ? <img src={urlAbsoluta(cliente.logoUrl) ?? undefined} alt="" style={{ maxHeight: 48, marginBottom: 6 }} /> : null}
        <h2>{titulo}</h2>
        <div className="hint">
          <b>{cliente?.razaoSocial ?? cipa.cliente.nomeFantasia}</b>
          {cliente ? ` · CNPJ ${cliente.formatado?.cnpj ?? cliente.cnpj}` : null}
          <br />
          {enderecoDoCliente(cliente)}
        </div>
      </div>
      <div className="meta">
        CIPA gestão {cipa.gestao}
        <br />
        Mandato: {formatarDataIso(cipa.dataInicioMandato)} a {formatarDataIso(cipa.dataFimMandato)}
      </div>
    </div>
  );
}

function AssinaturasComissao() {
  return (
    <div className="folha-assinatura">
      <div>
        <div style={{ height: 44 }} />
        Comissão eleitoral — {B}
      </div>
      <div>
        <div style={{ height: 44 }} />
        Comissão eleitoral — {B}
      </div>
      <div>
        <div style={{ height: 44 }} />
        Comissão eleitoral — {B}
      </div>
      <div>
        <div style={{ height: 44 }} />
        Representante do empregador — {B}
      </div>
    </div>
  );
}

function LocalEData({ cliente }: { cliente: ClienteApi | null }) {
  return (
    <p style={{ marginTop: 20 }}>
      {cliente ? `${cliente.cidade}/${cliente.uf}` : B}, ____ de ______________ de ________.
    </p>
  );
}

function ModeloEdital({ cipa, cliente, dimensionamento }: ModeloProps) {
  const cronograma = cipa.cronograma ?? [];
  const inicioInscricoes = dataDaEtapa(cronograma, /in[ií]cio das inscri/i);
  const fimInscricoes = dataDaEtapa(cronograma, /encerramento das inscri/i);
  const votacao = dataDaEtapa(cronograma, /vota/i);

  return (
    <div className="painel folha">
      <CabecalhoFolha cipa={cipa} cliente={cliente} dimensionamento={dimensionamento} titulo={`Edital de convocação — eleição da CIPA gestão ${cipa.gestao}`} />
      <p style={{ textAlign: 'justify' }}>
        A empresa <b>{cliente?.razaoSocial ?? cipa.cliente.nomeFantasia}</b>, inscrita no CNPJ sob o nº {cliente?.formatado?.cnpj ?? B}, com sede em{' '}
        {enderecoDoCliente(cliente)}, no uso de suas atribuições legais e em cumprimento ao disposto na Norma Regulamentadora nº 5 (NR-5) do
        Ministério do Trabalho e Emprego, <b>CONVOCA</b> todos os seus empregados a participarem do processo eleitoral para a composição da
        Comissão Interna de Prevenção de Acidentes e de Assédio — CIPA, gestão <b>{cipa.gestao}</b>, com mandato de{' '}
        {formatarDataIso(cipa.dataInicioMandato)} a {formatarDataIso(cipa.dataFimMandato)}, conforme as regras a seguir.
      </p>

      <div className="folha-secao">
        <h4>1. Inscrições</h4>
        <p style={{ textAlign: 'justify' }}>
          As inscrições dos candidatos a representantes dos empregados estarão abertas no período de <b>{inicioInscricoes ? formatarDataIso(inicioInscricoes) : B}</b> a{' '}
          <b>{fimInscricoes ? formatarDataIso(fimInscricoes) : B}</b>, no setor {B}, no horário de {B}. Podem se inscrever todos os empregados do
          estabelecimento, independentemente de setor ou local de trabalho, mediante preenchimento da ficha de inscrição. A inscrição é individual e o
          candidato receberá comprovante. Fica assegurada ao inscrito a garantia de emprego prevista na NR-5 até a apuração.
        </p>
      </div>

      <div className="folha-secao">
        <h4>2. Votação e apuração</h4>
        <p style={{ textAlign: 'justify' }}>
          A eleição será realizada em <b>{votacao ? formatarDataIso(votacao) : B}</b>, em dia normal de trabalho, por escrutínio secreto, no local {B}, no
          horário de {B}. A apuração dos votos ocorrerá em horário normal de trabalho, logo após o encerramento da votação, com acompanhamento de
          representante do empregador e dos empregados, e será lavrada em ata. Serão eleitos como titulares os candidatos mais votados e como suplentes os
          seguintes, em ordem decrescente de votos.
        </p>
        {dimensionamento ? (
          <p>
            Dimensionamento previsto para esta eleição: <b>{dimensionamento.efetivos}</b> titular(es) e <b>{dimensionamento.suplentes}</b> suplente(s) representando os
            empregados, em igual número aos designados pelo empregador (Quadro I da NR-5).
          </p>
        ) : (
          <p>Dimensionamento previsto: {B} titular(es) e {B} suplente(s) representando os empregados (Quadro I da NR-5).</p>
        )}
      </div>

      <div className="folha-secao">
        <h4>3. Cronograma do processo eleitoral</h4>
        {cronograma.length === 0 ? (
          <p className="hint">Sem cronograma — gere o padrão na aba "Cronograma".</p>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Etapa</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {cronograma.map((e, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{e.etapa}</td>
                    <td>{formatarDataIso(e.data)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="folha-secao">
        <h4>4. Comissão eleitoral</h4>
        <p>
          O processo eleitoral será conduzido pela comissão eleitoral composta por: {B}, {B} e {B}, a quem caberá receber as inscrições, divulgar a
          lista de candidatos, organizar a votação e proceder à apuração.
        </p>
      </div>

      <LocalEData cliente={cliente} />
      <div className="folha-assinatura">
        <div>
          <div style={{ height: 44 }} />
          Representante do empregador
        </div>
        <div>
          <div style={{ height: 44 }} />
          Presidente da comissão eleitoral
        </div>
      </div>
    </div>
  );
}

function ModeloFicha({ cipa, cliente, dimensionamento }: ModeloProps) {
  const linha = (rotulo: string) => (
    <div key={rotulo} style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 10 }}>
      <span style={{ whiteSpace: 'nowrap' }}>{rotulo}:</span>
      <span style={{ flex: 1, borderBottom: '1px solid #000' }}>&nbsp;</span>
    </div>
  );

  return (
    <div className="painel folha">
      <CabecalhoFolha cipa={cipa} cliente={cliente} dimensionamento={dimensionamento} titulo={`Ficha de inscrição de candidato — CIPA gestão ${cipa.gestao}`} />
      <p>
        Inscrição nº <b>______</b>
      </p>
      <div className="folha-secao">
        <h4>Dados do candidato</h4>
        {['Nome completo', 'Matrícula', 'Função', 'Setor / local de trabalho', 'Data de admissão', 'Telefone / ramal', 'E-mail'].map(linha)}
      </div>
      <div className="folha-secao">
        <h4>Declaração</h4>
        <p style={{ textAlign: 'justify' }}>
          Declaro que me candidato a representante dos empregados na Comissão Interna de Prevenção de Acidentes e de Assédio — CIPA, gestão{' '}
          <b>{cipa.gestao}</b>, da empresa {cliente?.razaoSocial ?? cipa.cliente.nomeFantasia}, e que estou ciente das atribuições previstas na NR-5,
          inclusive quanto à participação obrigatória no treinamento de {CARGA_HORARIA_TREINAMENTO_CIPA} horas, às reuniões ordinárias mensais e à
          duração do mandato, de {formatarDataIso(cipa.dataInicioMandato)} a {formatarDataIso(cipa.dataFimMandato)}.
        </p>
      </div>
      <LocalEData cliente={cliente} />
      <div className="folha-assinatura">
        <div>
          <div style={{ height: 44 }} />
          Assinatura do candidato
        </div>
        <div>
          <div style={{ height: 44 }} />
          Comissão eleitoral — recebido em ____/____/________
        </div>
      </div>
    </div>
  );
}

function ModeloPresenca({ cipa, cliente, dimensionamento }: ModeloProps) {
  const votacao = dataDaEtapa(cipa.cronograma, /vota/i);
  const linhas = Array.from({ length: 40 }, (_, i) => i + 1);

  return (
    <div className="painel folha">
      <CabecalhoFolha cipa={cipa} cliente={cliente} dimensionamento={dimensionamento} titulo={`Lista de presença — votação da CIPA gestão ${cipa.gestao}`} />
      <dl className="folha-dados" style={{ marginBottom: 12 }}>
        <div>
          <dt>Data da votação</dt>
          <dd>{votacao ? formatarDataIso(votacao) : '____/____/________'}</dd>
        </div>
        <div>
          <dt>Local</dt>
          <dd>{B}</dd>
        </div>
        <div>
          <dt>Horário</dt>
          <dd>das ______ às ______</dd>
        </div>
        <div>
          <dt>Folha</dt>
          <dd>____ de ____</dd>
        </div>
      </dl>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>Nº</th>
              <th>Nome do votante</th>
              <th style={{ width: 110 }}>Matrícula</th>
              <th style={{ width: 140 }}>Setor</th>
              <th style={{ width: 200 }}>Assinatura</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((n) => (
              <tr key={n} style={{ height: 26 }}>
                <td>{n}</td>
                <td />
                <td />
                <td />
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 12 }}>Total de votantes nesta folha: ________</p>
      <AssinaturasComissao />
    </div>
  );
}

function ModeloCedula({ cipa, cliente, dimensionamento }: ModeloProps) {
  const candidatos = (cipa.membros ?? []).filter((m) => m.representacao === 'EMPREGADOS');
  const votacao = dataDaEtapa(cipa.cronograma, /vota/i);
  const quadro = <span style={{ display: 'inline-block', width: 18, height: 18, border: '1.5px solid #000', verticalAlign: 'middle', marginRight: 10 }} />;

  return (
    <div className="painel folha">
      <CabecalhoFolha cipa={cipa} cliente={cliente} dimensionamento={dimensionamento} titulo={`Cédula de votação — eleição da CIPA gestão ${cipa.gestao}`} />
      <p>
        Eleição em {votacao ? formatarDataIso(votacao) : '____/____/________'}. Assinale com um <b>X</b> o quadrinho de <b>apenas um</b> candidato. Cédula com
        mais de uma marcação será considerada nula.
      </p>
      <div className="folha-secao">
        <h4>Candidatos a representante dos empregados</h4>
        {candidatos.length === 0 ? (
          <p className="hint">Nenhum candidato cadastrado na aba "Membros" (representação: empregados). Linhas em branco abaixo.</p>
        ) : null}
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {candidatos.map((c, i) => (
            <li key={i} style={{ padding: '8px 0', borderBottom: '1px dashed #999', fontSize: 15 }}>
              {quadro}
              <b>{i + 1}.</b> {c.nome}
              {c.setor ? <span className="hint"> — {c.setor}</span> : null}
            </li>
          ))}
          {Array.from({ length: Math.max(0, 8 - candidatos.length) }, (_, i) => (
            <li key={`v-${i}`} style={{ padding: '8px 0', borderBottom: '1px dashed #999', fontSize: 15 }}>
              {quadro}
              <b>{candidatos.length + i + 1}.</b> {B}{B}
            </li>
          ))}
        </ol>
      </div>
      <p className="hint" style={{ marginTop: 16 }}>
        Rubrica da comissão eleitoral: ______________ &nbsp;&nbsp; Cédula nº ______
      </p>
    </div>
  );
}

function ModeloAtaEleicao({ cipa, cliente, dimensionamento }: ModeloProps) {
  const votacao = dataDaEtapa(cipa.cronograma, /vota/i);
  const candidatos = (cipa.membros ?? []).filter((m) => m.representacao === 'EMPREGADOS').sort((a, b) => (b.votos ?? 0) - (a.votos ?? 0));
  const totalVotos = candidatos.reduce((soma, c) => soma + (c.votos ?? 0), 0);
  const titulares = candidatos.filter((c) => c.tipo === 'TITULAR');
  const suplentes = candidatos.filter((c) => c.tipo === 'SUPLENTE');

  return (
    <div className="painel folha">
      <CabecalhoFolha cipa={cipa} cliente={cliente} dimensionamento={dimensionamento} titulo={`Ata de eleição e apuração — CIPA gestão ${cipa.gestao}`} />
      <p style={{ textAlign: 'justify' }}>
        Aos {votacao ? dataPorExtenso(votacao) : `____ dias do mês de ______________ de ________`}, às ______ horas, nas dependências da empresa{' '}
        <b>{cliente?.razaoSocial ?? cipa.cliente.nomeFantasia}</b>, reuniu-se a comissão eleitoral para proceder à apuração dos votos da eleição dos
        representantes dos empregados na Comissão Interna de Prevenção de Acidentes e de Assédio — CIPA, gestão <b>{cipa.gestao}</b>, realizada por
        escrutínio secreto em dia normal de trabalho, conforme edital de convocação. Compareceram à votação ________ empregados, de um total de{' '}
        {cliente ? cliente.quantidadeFuncionarios : B} aptos a votar. Abertas as urnas e conferidas as cédulas com a lista de presença, apurou-se o
        seguinte resultado:
      </p>

      <div className="folha-secao">
        <h4>Resultado da apuração</h4>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Candidato</th>
                <th>Setor</th>
                <th className="num-col">Votos</th>
                <th>Classificação</th>
              </tr>
            </thead>
            <tbody>
              {candidatos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="hint">
                    Nenhum candidato cadastrado — cadastre os membros (representação: empregados) com os votos recebidos.
                  </td>
                </tr>
              ) : null}
              {candidatos.map((c, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <b>{c.nome}</b>
                    {c.funcao ? <div className="hint">{c.funcao}</div> : null}
                  </td>
                  <td>{c.setor ?? '—'}</td>
                  <td className="num-col">{c.votos ?? '____'}</td>
                  <td>{ROTULO_TIPO_MEMBRO_CIPA[c.tipo]}</td>
                </tr>
              ))}
              {Array.from({ length: Math.max(0, 4 - candidatos.length) }, (_, i) => (
                <tr key={`v-${i}`} style={{ height: 26 }}>
                  <td>{candidatos.length + i + 1}</td>
                  <td />
                  <td />
                  <td />
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Votos válidos: <b>{candidatos.length > 0 ? totalVotos : '________'}</b> &nbsp;·&nbsp; Votos em branco: ________ &nbsp;·&nbsp; Votos nulos: ________
        </p>
      </div>

      <p style={{ textAlign: 'justify' }}>
        Em razão do resultado, ficam eleitos como <b>titulares</b>, em ordem decrescente de votação:{' '}
        {titulares.length > 0 ? titulares.map((t) => t.nome).join('; ') : B}; e como <b>suplentes</b>:{' '}
        {suplentes.length > 0 ? suplentes.map((s) => s.nome).join('; ') : B}
        {dimensionamento ? ` — observado o dimensionamento de ${dimensionamento.efetivos} titular(es) e ${dimensionamento.suplentes} suplente(s) do Quadro I da NR-5.` : '.'}{' '}
        Não houve impugnações {'( )'} / Houve impugnações registradas em anexo {'( )'}. Nada mais havendo a tratar, foi encerrada a apuração e lavrada a
        presente ata, que, lida e aprovada, vai assinada pelos membros da comissão eleitoral e pelo representante do empregador.
      </p>

      <LocalEData cliente={cliente} />
      <AssinaturasComissao />
    </div>
  );
}

function ModeloAtaPosse({ cipa, cliente, dimensionamento }: ModeloProps) {
  const membros = cipa.membros ?? [];
  const doEmpregador = membros.filter((m) => m.representacao === 'EMPREGADOR');
  const dosEmpregados = membros.filter((m) => m.representacao === 'EMPREGADOS');
  const comCargo = (cargo: CargoCipa) => membros.find((m) => m.cargo === cargo)?.nome ?? B;

  const tabela = (lista: CipaMembro[], vazio: string) => (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Função</th>
            <th>Setor</th>
            <th>Condição</th>
            <th>Cargo</th>
          </tr>
        </thead>
        <tbody>
          {lista.length === 0 ? (
            <tr>
              <td colSpan={5} className="hint">
                {vazio}
              </td>
            </tr>
          ) : null}
          {lista.map((m, i) => (
            <tr key={i}>
              <td>
                <b>{m.nome}</b>
              </td>
              <td>{m.funcao ?? '—'}</td>
              <td>{m.setor ?? '—'}</td>
              <td>{ROTULO_TIPO_MEMBRO_CIPA[m.tipo]}</td>
              <td>{m.cargo ? ROTULO_CARGO_CIPA[m.cargo] : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="painel folha">
      <CabecalhoFolha cipa={cipa} cliente={cliente} dimensionamento={dimensionamento} titulo={`Ata de posse dos membros da CIPA — gestão ${cipa.gestao}`} />
      <p style={{ textAlign: 'justify' }}>
        Aos {dataPorExtenso(cipa.dataInicioMandato)}, às ______ horas, nas dependências da empresa <b>{cliente?.razaoSocial ?? cipa.cliente.nomeFantasia}</b>,
        reuniram-se os representantes dos empregados, eleitos em escrutínio secreto conforme ata de eleição, e os representantes do empregador, por ele
        designados, para a <b>posse</b> na Comissão Interna de Prevenção de Acidentes e de Assédio — CIPA, gestão <b>{cipa.gestao}</b>, com mandato de{' '}
        {formatarDataIso(cipa.dataInicioMandato)} a {formatarDataIso(cipa.dataFimMandato)}, nos termos da NR-5.
      </p>

      <div className="folha-secao">
        <h4>Representantes do empregador (designados)</h4>
        {tabela(doEmpregador, 'Nenhum representante do empregador cadastrado.')}
      </div>
      <div className="folha-secao">
        <h4>Representantes dos empregados (eleitos)</h4>
        {tabela(dosEmpregados, 'Nenhum representante dos empregados cadastrado.')}
      </div>

      <p style={{ textAlign: 'justify' }}>
        Na mesma ocasião, o empregador designou como <b>Presidente</b> da CIPA {comCargo('PRESIDENTE')}; os representantes dos empregados elegeram, dentre os
        seus titulares, como <b>Vice-presidente</b> {comCargo('VICE_PRESIDENTE')}; e, de comum acordo, foi escolhido(a) como <b>Secretário(a)</b>{' '}
        {comCargo('SECRETARIO')}. Os empossados declararam ciência de suas atribuições (NR-5, item 5.3), do calendário anual de reuniões ordinárias
        mensais e da obrigatoriedade do treinamento de {CARGA_HORARIA_TREINAMENTO_CIPA} horas. Nada mais havendo a tratar, lavrou-se a presente ata, que
        vai assinada pelos empossados e pelo representante do empregador.
      </p>

      <LocalEData cliente={cliente} />
      <div className="folha-assinatura">
        {membros.map((m, i) => (
          <div key={i}>
            <div style={{ height: 40 }} />
            {m.nome} — {ROTULO_TIPO_MEMBRO_CIPA[m.tipo]}
          </div>
        ))}
        {membros.length === 0 ? (
          <>
            <div>
              <div style={{ height: 40 }} />
              Membro empossado — {B}
            </div>
            <div>
              <div style={{ height: 40 }} />
              Membro empossado — {B}
            </div>
          </>
        ) : null}
        <div>
          <div style={{ height: 40 }} />
          Representante do empregador
        </div>
      </div>
    </div>
  );
}

const CONTEUDO_TREINAMENTO = [
  'Estudo do ambiente, das condições de trabalho e dos riscos originados do processo produtivo',
  'Noções sobre acidentes e doenças do trabalho decorrentes da exposição aos riscos existentes na empresa',
  'Metodologia de investigação e análise de acidentes e doenças do trabalho',
  'Princípios gerais de higiene do trabalho e de medidas de controle dos riscos',
  'Noções sobre as legislações trabalhista e previdenciária relativas à segurança e saúde no trabalho',
  'Noções sobre a inclusão de pessoas com deficiência e reabilitados nos processos de trabalho',
  'Prevenção e combate ao assédio sexual e a outras formas de violência no trabalho',
  'Organização da CIPA e outros assuntos necessários ao exercício das atribuições da comissão',
];

function ModeloCertificado({ cipa, cliente, dimensionamento, membro }: ModeloProps & { membro: CipaMembro | null }) {
  return (
    <div className="painel folha">
      <CabecalhoFolha cipa={cipa} cliente={cliente} dimensionamento={dimensionamento} titulo="Certificado de treinamento — membro da CIPA" />
      <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
        <h2 style={{ letterSpacing: '0.12em', margin: '0 0 16px' }}>CERTIFICADO</h2>
        <p style={{ fontSize: 15, lineHeight: 1.7, textAlign: 'justify' }}>
          Certificamos que <b>{membro ? membro.nome : '________________________________________'}</b>
          {membro?.funcao ? `, ${membro.funcao}` : ', ________________'}
          {membro?.setor ? `, do setor ${membro.setor}` : ''}, {membro ? `${ROTULO_TIPO_MEMBRO_CIPA[membro.tipo].toLowerCase()} representante ${membro.representacao === 'EMPREGADOS' ? 'dos empregados' : 'do empregador'}` : 'membro'} na
          CIPA gestão <b>{cipa.gestao}</b> da empresa <b>{cliente?.razaoSocial ?? cipa.cliente.nomeFantasia}</b>, participou do{' '}
          <b>Treinamento para Membros da Comissão Interna de Prevenção de Acidentes e de Assédio</b>, realizado no período de ____/____/________ a
          ____/____/________, com carga horária de <b>{CARGA_HORARIA_TREINAMENTO_CIPA} (vinte) horas</b>, em conformidade com o item 5.7 da Norma
          Regulamentadora nº 5 (NR-5), abrangendo o seguinte conteúdo programático:
        </p>
      </div>
      <div className="folha-secao">
        <h4>Conteúdo programático</h4>
        <ol style={{ margin: 0, paddingLeft: 20, columns: 2, columnGap: 24, fontSize: 13 }}>
          {CONTEUDO_TREINAMENTO.map((item) => (
            <li key={item} style={{ marginBottom: 4, breakInside: 'avoid' }}>
              {item}
            </li>
          ))}
        </ol>
      </div>
      <dl className="folha-dados">
        <div>
          <dt>Entidade / instrutor</dt>
          <dd>{B}{B}</dd>
        </div>
        <div>
          <dt>Registro profissional</dt>
          <dd>{B}</dd>
        </div>
        <div>
          <dt>Aproveitamento</dt>
          <dd>{B}</dd>
        </div>
      </dl>
      <LocalEData cliente={cliente} />
      <div className="folha-assinatura">
        <div>
          <div style={{ height: 44 }} />
          Instrutor(a) responsável
        </div>
        <div>
          <div style={{ height: 44 }} />
          Representante do empregador
        </div>
      </div>
    </div>
  );
}
