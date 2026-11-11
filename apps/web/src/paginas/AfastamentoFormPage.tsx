import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  PROVIDENCIAS_AFASTAMENTO,
  ROTULO_PROVIDENCIA_AFASTAMENTO,
  ROTULO_TIPO_AFASTAMENTO,
  TIPOS_AFASTAMENTO,
  type ProvidenciaAfastamento,
  type TipoAfastamento,
} from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { ErroApi, api } from '../lib/api';

interface OpcaoCliente {
  id: string;
  nomeFantasia: string;
}
interface OpcaoColaborador {
  id: string;
  nome: string;
  funcao: string;
  cpfFormatado?: string;
}
interface ColaboradorDetalhe {
  id: string;
  funcao: string | null;
  setor: string | null;
  liderNome: string | null;
}
interface AfastamentoApi {
  clienteId: string;
  colaboradorId: string;
  tipo: TipoAfastamento;
  dataInicio: string;
  dataFim: string | null;
  diasAfastamento: number;
  cid: string | null;
  descricao: string | null;
  funcao?: string | null;
  setor?: string | null;
  liderNome?: string | null;
  providencias?: ProvidenciaAfastamento[] | null;
}

const VAZIO = {
  clienteId: '',
  colaboradorId: '',
  tipo: '' as TipoAfastamento | '',
  dataInicio: '',
  dataFim: '',
  diasAfastamento: '0',
  cid: '',
  descricao: '',
  funcao: '',
  setor: '',
  liderNome: '',
  providencias: [] as ProvidenciaAfastamento[],
};

type Formulario = typeof VAZIO;

/** Tipos em que o CID-10 e obrigatorio (mesma regra do schema compartilhado). */
const EXIGE_CID: TipoAfastamento[] = ['DOENCA_COMUM', 'DOENCA_OCUPACIONAL'];

/** Validacao local — os mesmos erros que a API devolveria, antes de enviar. */
function validar(dados: Formulario): Record<string, string> {
  const erros: Record<string, string> = {};
  if (!dados.clienteId) erros.clienteId = 'Informe o cliente.';
  if (!dados.colaboradorId) erros.colaboradorId = 'Informe o colaborador.';
  if (!dados.tipo) erros.tipo = 'Informe o tipo de afastamento.';
  if (!dados.dataInicio) erros.dataInicio = 'Informe a data de início.';
  else if (dados.dataInicio > new Date().toISOString().slice(0, 10)) erros.dataInicio = 'A data de início não pode ser futura.';
  if (dados.dataFim && dados.dataInicio && dados.dataFim < dados.dataInicio) {
    erros.dataFim = 'Data de retorno deve ser posterior ao início.';
  }
  const dias = Number(dados.diasAfastamento);
  if (!Number.isInteger(dias) || dias < 0 || dias > 3650) erros.diasAfastamento = 'Informe um número inteiro de 0 a 3650.';
  if (dados.tipo && EXIGE_CID.includes(dados.tipo) && !dados.cid.trim()) {
    erros.cid = 'Informe o CID-10: obrigatório para doença comum e doença ocupacional.';
  }
  if (dados.cid.trim().length > 10) erros.cid = 'O CID-10 tem no máximo 10 caracteres.';
  return erros;
}

const ROTULO_CAMPO: Record<string, string> = {
  clienteId: 'Cliente',
  colaboradorId: 'Colaborador',
  tipo: 'Tipo',
  dataInicio: 'Data de início',
  dataFim: 'Data de retorno',
  diasAfastamento: 'Dias de afastamento',
  cid: 'CID-10',
  descricao: 'Observações',
  funcao: 'Função',
  setor: 'Setor',
  liderNome: 'Liderança',
  providencias: 'Providências',
};

export function AfastamentoFormPage() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navigate = useNavigate();
  const { mostrar } = useToast();

  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [colaboradores, setColaboradores] = useState<OpcaoColaborador[]>([]);
  const [carregandoColaboradores, setCarregandoColaboradores] = useState(false);
  const [buscandoDados, setBuscandoDados] = useState(false);
  const [dados, setDados] = useState<Formulario>(VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  function definir<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setDados((atual) => ({ ...atual, [campo]: valor }));
    if (erros[campo]) setErros(({ [campo]: _removido, ...resto }) => resto);
  }

  useEffect(() => {
    api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => setClientes([]));
  }, []);

  // A relacao de trabalhadores depende do cliente escolhido.
  useEffect(() => {
    if (!dados.clienteId) {
      setColaboradores([]);
      return;
    }
    setCarregandoColaboradores(true);
    api
      .get<OpcaoColaborador[]>(`/colaboradores/opcoes?clienteId=${dados.clienteId}`)
      .then(setColaboradores)
      .catch(() => {
        setColaboradores([]);
        mostrar('Não foi possível carregar os colaboradores deste cliente.', 'erro');
      })
      .finally(() => setCarregandoColaboradores(false));
  }, [dados.clienteId, mostrar]);

  // Calcula automaticamente os dias ao informar as duas datas.
  useEffect(() => {
    if (!dados.dataInicio || !dados.dataFim) return;
    const inicio = new Date(dados.dataInicio);
    const fim = new Date(dados.dataFim);
    if (fim >= inicio) {
      const dias = String(Math.round((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));
      setDados((atual) => (atual.diasAfastamento === dias ? atual : { ...atual, diasAfastamento: dias }));
    }
  }, [dados.dataInicio, dados.dataFim]);

  const carregar = useCallback(async () => {
    if (!id) return;
    try {
      const a = await api.get<AfastamentoApi>(`/absenteismo/${id}`);
      setDados({
        clienteId: a.clienteId,
        colaboradorId: a.colaboradorId,
        tipo: a.tipo,
        dataInicio: a.dataInicio?.slice(0, 10) ?? '',
        dataFim: a.dataFim?.slice(0, 10) ?? '',
        diasAfastamento: String(a.diasAfastamento ?? 0),
        cid: a.cid ?? '',
        descricao: a.descricao ?? '',
        funcao: a.funcao ?? '',
        setor: a.setor ?? '',
        liderNome: a.liderNome ?? '',
        providencias: a.providencias ?? [],
      });
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar o afastamento.', 'erro');
    }
  }, [id, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /** Fotografa funcao, setor e lideranca do cadastro — continuam editaveis. */
  async function escolherColaborador(colaboradorId: string) {
    definir('colaboradorId', colaboradorId);
    if (!colaboradorId) return;
    setBuscandoDados(true);
    try {
      const c = await api.get<ColaboradorDetalhe>(`/colaboradores/${colaboradorId}`);
      setDados((atual) => ({
        ...atual,
        funcao: c.funcao ?? '',
        setor: c.setor ?? '',
        liderNome: c.liderNome ?? '',
      }));
    } catch {
      const opcao = colaboradores.find((c) => c.id === colaboradorId);
      if (opcao) setDados((atual) => ({ ...atual, funcao: opcao.funcao ?? '' }));
    } finally {
      setBuscandoDados(false);
    }
  }

  function alternarProvidencia(providencia: ProvidenciaAfastamento) {
    definir(
      'providencias',
      dados.providencias.includes(providencia)
        ? dados.providencias.filter((p) => p !== providencia)
        : [...dados.providencias, providencia],
    );
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const locais = validar(dados);
    setErros(locais);
    if (Object.keys(locais).length > 0) {
      mostrar(`Corrija ${Object.keys(locais).length === 1 ? 'o campo destacado' : 'os campos destacados'}.`, 'erro');
      return;
    }

    setSalvando(true);
    try {
      const payload = {
        ...dados,
        diasAfastamento: Number(dados.diasAfastamento),
        dataFim: dados.dataFim || null,
        cid: dados.cid.trim() || null,
        descricao: dados.descricao.trim() || null,
        funcao: dados.funcao.trim() || null,
        setor: dados.setor.trim() || null,
        liderNome: dados.liderNome.trim() || null,
      };
      if (editando) {
        await api.put(`/absenteismo/${id}`, payload);
        mostrar('Afastamento atualizado.', 'sucesso');
      } else {
        await api.post('/absenteismo', payload);
        mostrar('Afastamento registrado.', 'sucesso');
      }
      navigate('/absenteismo');
    } catch (erro) {
      if (erro instanceof ErroApi) {
        const porCampo: Record<string, string> = {};
        for (const [campo, mensagens] of Object.entries(erro.campos)) porCampo[campo] = mensagens[0] ?? 'Valor inválido.';
        setErros(porCampo);
        mostrar(erro.mensagemAmigavel(), 'erro');
      } else {
        mostrar('Falha ao salvar.', 'erro');
      }
    } finally {
      setSalvando(false);
    }
  }

  const cidObrigatorio = dados.tipo !== '' && EXIGE_CID.includes(dados.tipo);

  return (
    <form className="painel" onSubmit={(e) => void enviar(e)} noValidate>
      <div className="barra-acoes" style={{ justifyContent: 'space-between', marginTop: 0 }}>
        <h2 style={{ margin: 0 }}>{editando ? 'Editar afastamento' : 'Registrar afastamento'}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          <Icone nome="voltar" /> Voltar
        </button>
      </div>
      <p className="desc">
        Campos com <span className="obrig">*</span> são obrigatórios. Ao escolher o colaborador, função, setor e liderança
        são copiados do cadastro — ajuste se no momento do afastamento eram outros.
      </p>

      <h4>Trabalhador</h4>
      <div className="grid2">
        <Campo label="Cliente" htmlFor="af-cliente" obrigatorio erro={erros.clienteId}>
          <select
            id="af-cliente"
            value={dados.clienteId}
            onChange={(e) => setDados((atual) => ({ ...atual, clienteId: e.target.value, colaboradorId: '' }))}
          >
            <option value="">Selecione…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nomeFantasia}
              </option>
            ))}
          </select>
        </Campo>

        <Campo
          label="Colaborador"
          htmlFor="af-colab"
          obrigatorio
          erro={erros.colaboradorId}
          ajuda={
            !dados.clienteId
              ? 'Escolha o cliente para listar os colaboradores.'
              : carregandoColaboradores
                ? 'Carregando colaboradores…'
                : colaboradores.length === 0
                  ? 'Nenhum colaborador ativo cadastrado neste cliente.'
                  : `${colaboradores.length} colaborador(es) neste cliente.`
          }
        >
          <select
            id="af-colab"
            value={dados.colaboradorId}
            disabled={!dados.clienteId || carregandoColaboradores}
            onChange={(e) => void escolherColaborador(e.target.value)}
          >
            <option value="">Selecione…</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} — {c.funcao}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <div className="row3">
        <Campo label="Função" htmlFor="af-funcao" erro={erros.funcao} ajuda={buscandoDados ? 'Buscando no cadastro…' : undefined}>
          <input id="af-funcao" value={dados.funcao} maxLength={80} onChange={(e) => definir('funcao', e.target.value)} />
        </Campo>
        <Campo label="Setor" htmlFor="af-setor" erro={erros.setor}>
          <input id="af-setor" value={dados.setor} maxLength={80} onChange={(e) => definir('setor', e.target.value)} />
        </Campo>
        <Campo label="Liderança" htmlFor="af-lider" erro={erros.liderNome}>
          <input id="af-lider" value={dados.liderNome} maxLength={120} onChange={(e) => definir('liderNome', e.target.value)} />
        </Campo>
      </div>

      <h4>Afastamento</h4>
      <div className="grid2">
        <Campo label="Tipo de afastamento" htmlFor="af-tipo" obrigatorio erro={erros.tipo}>
          <select id="af-tipo" value={dados.tipo} onChange={(e) => definir('tipo', e.target.value as TipoAfastamento | '')}>
            <option value="">Selecione…</option>
            {TIPOS_AFASTAMENTO.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_AFASTAMENTO[t]}
              </option>
            ))}
          </select>
        </Campo>

        <Campo
          label="CID-10"
          htmlFor="af-cid"
          obrigatorio={cidObrigatorio}
          erro={erros.cid}
          ajuda={cidObrigatorio ? 'Obrigatório para doença comum e doença ocupacional.' : 'Opcional para este tipo.'}
        >
          <input id="af-cid" placeholder="Ex: J45" maxLength={10} value={dados.cid} onChange={(e) => definir('cid', e.target.value.toUpperCase())} />
        </Campo>

        <Campo label="Data de início" htmlFor="af-inicio" obrigatorio erro={erros.dataInicio}>
          <input id="af-inicio" type="date" value={dados.dataInicio} onChange={(e) => definir('dataInicio', e.target.value)} />
        </Campo>

        <Campo label="Data de retorno" htmlFor="af-fim" erro={erros.dataFim} ajuda="Deixe em branco enquanto o afastamento estiver em curso.">
          <input id="af-fim" type="date" value={dados.dataFim} onChange={(e) => definir('dataFim', e.target.value)} />
        </Campo>

        <Campo label="Dias de afastamento" htmlFor="af-dias" obrigatorio erro={erros.diasAfastamento} ajuda="Calculado pelas datas; ajuste se necessário.">
          <input id="af-dias" type="number" min={0} value={dados.diasAfastamento} onChange={(e) => definir('diasAfastamento', e.target.value)} />
        </Campo>
      </div>

      <h4>Providências para o retorno</h4>
      <div className="grid2" role="group" aria-label="Providências para o retorno">
        {PROVIDENCIAS_AFASTAMENTO.map((p) => (
          <div className="check-linha" key={p}>
            <label>
              <input type="checkbox" checked={dados.providencias.includes(p)} onChange={() => alternarProvidencia(p)} />
              {ROTULO_PROVIDENCIA_AFASTAMENTO[p]}
            </label>
          </div>
        ))}
      </div>
      {erros.providencias ? (
        <div className="erro" role="alert">
          {erros.providencias}
        </div>
      ) : null}

      <Campo label="Observações" htmlFor="af-desc" erro={erros.descricao}>
        <textarea id="af-desc" rows={3} maxLength={500} value={dados.descricao} onChange={(e) => definir('descricao', e.target.value)} />
      </Campo>

      {Object.keys(erros).length > 0 ? (
        <div className="hint alerta" role="alert">
          <b>Corrija antes de salvar:</b>
          <ul style={{ margin: '4px 0 0 18px' }}>
            {Object.entries(erros).map(([campo, mensagem]) => (
              <li key={campo}>
                <b>{ROTULO_CAMPO[campo] ?? campo}</b> — {mensagem}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="barra-acoes" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
          <Icone nome="voltar" /> Voltar
        </button>
        <button type="button" className="btn btn-outline" onClick={() => navigate('/absenteismo')}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={salvando}>
          {salvando ? 'Salvando…' : editando ? 'Salvar' : 'Registrar'}
        </button>
      </div>
    </form>
  );
}
