import { useCallback, useEffect, useState } from 'react';
import { NIVEIS_CONTATO_CLIENTE, ROTULO_NIVEL_CONTATO, type NivelContatoCliente } from '@safetyguard/shared';
import { Campo } from './Campo';
import { Icone } from './Icone';
import { useToast } from './Toast';
import { API_URL, ErroApi, api, lerTokenSalvo } from '../lib/api';
import { MASCARAS } from '../lib/mascaras';

interface ContatoApi {
  id: string;
  nome: string;
  cargo: string | null;
  nivel: NivelContatoCliente;
  rotuloNivel: string;
  email: string;
  telefone: string | null;
  whatsapp: string | null;
  recebeAlertas: boolean;
  observacoes: string | null;
  formatado: { telefone: string | null; whatsapp: string | null };
}

const VAZIO = { nome: '', cargo: '', nivel: 'SUPERVISOR' as NivelContatoCliente, email: '', telefone: '', whatsapp: '', recebeAlertas: true, observacoes: '' };

/**
 * Responsaveis e contatos do cliente por nivel hierarquico.
 *
 * E aqui que "escalar para o gerente" vira um e-mail de verdade: a matriz de
 * comunicacao, a cobranca de pendencias (10/20/30 dias), o aviso de medida
 * disciplinar e o resumo diario de pendencias procuram os contatos pelo nivel.
 */
export function ContatosCliente({ clienteId, podeEscrever }: { clienteId: string; podeEscrever: boolean }) {
  const { mostrar } = useToast();
  const [contatos, setContatos] = useState<ContatoApi[]>([]);
  const [form, setForm] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setContatos(await api.get<ContatoApi[]>(`/clientes/${clienteId}/contatos`));
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar os contatos.', 'erro');
    }
  }, [clienteId, mostrar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar() {
    setSalvando(true);
    setErros({});
    const corpo = {
      ...form,
      cargo: form.cargo || undefined,
      telefone: form.telefone || undefined,
      whatsapp: form.whatsapp || undefined,
      observacoes: form.observacoes || undefined,
    };
    try {
      if (editandoId) await api.put(`/clientes/contatos/${editandoId}`, corpo);
      else await api.post(`/clientes/${clienteId}/contatos`, corpo);
      mostrar(editandoId ? 'Contato atualizado.' : 'Contato incluído.', 'sucesso');
      setForm(VAZIO);
      setEditandoId(null);
      void carregar();
    } catch (erro) {
      if (erro instanceof ErroApi) {
        const porCampo: Record<string, string> = {};
        for (const [campo, mensagens] of Object.entries(erro.campos)) porCampo[campo] = mensagens[0] ?? 'Valor inválido.';
        setErros(porCampo);
        mostrar(Object.values(porCampo).join(' ') || erro.mensagemAmigavel(), 'erro');
      } else mostrar('Falha ao salvar o contato.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(contato: ContatoApi) {
    if (!window.confirm(`Remover ${contato.nome}?`)) return;
    try {
      await api.delete(`/clientes/contatos/${contato.id}`);
      void carregar();
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao remover.', 'erro');
    }
  }

  function editar(contato: ContatoApi) {
    setEditandoId(contato.id);
    setForm({
      nome: contato.nome,
      cargo: contato.cargo ?? '',
      nivel: contato.nivel,
      email: contato.email,
      telefone: contato.formatado.telefone ?? '',
      whatsapp: contato.formatado.whatsapp ?? '',
      recebeAlertas: contato.recebeAlertas,
      observacoes: contato.observacoes ?? '',
    });
  }

  return (
    <div className="painel">
      <h3>
        <Icone nome="pessoas" /> Responsáveis e contatos por nível hierárquico
      </h3>
      <p className="desc">
        Supervisor, coordenador, gerente, diretoria, SSMA, RH... Quem estiver marcado para receber alertas recebe por e-mail os
        avisos da matriz de comunicação, a cobrança de pendências não tratadas (10 dias Alta, 20 Média, 30 Baixa), os avisos de
        medida disciplinar e o resumo diário de pendências (ASO a vencer, documentos, EPI).
      </p>

      {podeEscrever ? (
        <>
          <div className="filtros">
            <Campo label="Nome" htmlFor="ct-nome" obrigatorio erro={erros.nome}>
              <input id="ct-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </Campo>
            <Campo label="Nível" htmlFor="ct-nivel" obrigatorio erro={erros.nivel}>
              <select id="ct-nivel" value={form.nivel} onChange={(e) => setForm({ ...form, nivel: e.target.value as NivelContatoCliente })}>
                {NIVEIS_CONTATO_CLIENTE.map((nivel) => (
                  <option key={nivel} value={nivel}>
                    {ROTULO_NIVEL_CONTATO[nivel]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Cargo" htmlFor="ct-cargo" erro={erros.cargo}>
              <input id="ct-cargo" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
            </Campo>
            <Campo label="E-mail" htmlFor="ct-email" obrigatorio erro={erros.email}>
              <input id="ct-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Campo>
            <Campo label="Telefone" htmlFor="ct-tel" erro={erros.telefone}>
              <input id="ct-tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: MASCARAS.telefone(e.target.value) })} />
            </Campo>
            <Campo label="WhatsApp" htmlFor="ct-wpp" erro={erros.whatsapp}>
              <input id="ct-wpp" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: MASCARAS.telefone(e.target.value) })} />
            </Campo>
          </div>
          <div className="check-linha">
            <label>
              <input type="checkbox" checked={form.recebeAlertas} onChange={(e) => setForm({ ...form, recebeAlertas: e.target.checked })} /> Recebe alertas e
              cobranças por e-mail
            </label>
          </div>
          <div className="barra-acoes">
            <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void salvar()}>
              {salvando ? 'Salvando...' : editandoId ? 'Salvar contato' : 'Incluir contato'}
            </button>
            {editandoId ? (
              <button type="button" className="btn btn-ghost" onClick={() => { setEditandoId(null); setForm(VAZIO); setErros({}); }}>
                Cancelar
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {contatos.length === 0 ? (
        <p className="hint alerta">Nenhum contato cadastrado — sem eles, alertas e cobranças ficam só registrados, sem destinatário.</p>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Nível</th>
                <th>Nome</th>
                <th>Contato</th>
                <th>Alertas</th>
                {podeEscrever ? <th aria-label="Ações" /> : null}
              </tr>
            </thead>
            <tbody>
              {contatos.map((contato) => (
                <tr key={contato.id}>
                  <td>
                    <span className="pill info">{contato.rotuloNivel}</span>
                  </td>
                  <td>
                    <b>{contato.nome}</b>
                    {contato.cargo ? <div className="hint">{contato.cargo}</div> : null}
                  </td>
                  <td>
                    <a href={`mailto:${contato.email}`}>{contato.email}</a>
                    {contato.formatado.telefone ? (
                      <div className="hint">
                        <a href={`tel:${contato.telefone}`}>{contato.formatado.telefone}</a>
                      </div>
                    ) : null}
                    {contato.formatado.whatsapp ? (
                      <div className="hint">
                        <a href={`https://wa.me/55${contato.whatsapp}`} target="_blank" rel="noreferrer">
                          WhatsApp {contato.formatado.whatsapp}
                        </a>
                      </div>
                    ) : null}
                  </td>
                  <td>{contato.recebeAlertas ? <span className="pill ok">Sim</span> : <span className="pill gray">Não</span>}</td>
                  {podeEscrever ? (
                    <td>
                      <div className="acoes-linha">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => editar(contato)}>
                          Editar
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void excluir(contato)}>
                          Remover
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** QR Code unico do cliente: abre a lista de areas para quem esta em campo escolher onde esta. */
export function QrCodeCliente({ clienteId, nome }: { clienteId: string; nome: string }) {
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const [destino, setDestino] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    let criada: string | null = null;
    void (async () => {
      try {
        const info = await api.get<{ urlInspecao: string }>(`/clientes/${clienteId}/qrcode`);
        if (ativo) setDestino(info.urlInspecao);
        const resposta = await fetch(`${API_URL}/api/v1/clientes/${clienteId}/qrcode.svg?escala=8`, {
          headers: lerTokenSalvo() ? { Authorization: `Bearer ${lerTokenSalvo()}` } : {},
        });
        if (!resposta.ok) return;
        criada = URL.createObjectURL(await resposta.blob());
        if (ativo) setSvgUrl(criada);
      } catch {
        /* sem QR: a tela segue funcionando */
      }
    })();
    return () => {
      ativo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [clienteId]);

  return (
    <div className="painel">
      <h3>
        <Icone nome="etiqueta" /> QR Code único do cliente
      </h3>
      <p className="desc">
        Alternativa ao QR por área: uma única placa na portaria ou no refeitório. Quem lê escolhe a área onde está e cai no
        formulário de observação daquela área — sem login. Os QR Codes por área continuam valendo (tela Áreas e QR Code).
      </p>
      <div className="folha" style={{ maxWidth: 360, textAlign: 'center' }}>
        <strong>{nome}</strong>
        <div className="hint">Registre aqui sua observação de segurança</div>
        {svgUrl ? <img src={svgUrl} alt="QR Code do cliente" style={{ width: 240, height: 240, margin: '12px auto', display: 'block' }} /> : <div className="spinner" />}
        {destino ? <div className="hint mono" style={{ wordBreak: 'break-all' }}>{destino}</div> : null}
      </div>
      <div className="barra-acoes sem-impressao">
        <button type="button" className="btn btn-outline" onClick={() => window.print()}>
          <Icone nome="impressora" /> Imprimir placa
        </button>
      </div>
    </div>
  );
}
