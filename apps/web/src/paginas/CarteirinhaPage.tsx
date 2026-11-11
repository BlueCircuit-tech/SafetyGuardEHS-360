import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { API_URL, ErroApi, api, lerTokenSalvo, urlAbsoluta } from '../lib/api';
import { formatarDataIso } from '../lib/datas';
import type { CarteirinhaApi } from '../lib/saude';

/**
 * Etapa 24 — Carteirinha do colaborador com QR Code.
 *
 * Layout provisório em tamanho de cartão de crédito (85,6 × 54 mm), frente e
 * verso lado a lado para imprimir, recortar e plastificar. O QR leva à tela
 * pública /carteirinha/:token, que mostra se a pessoa está liberada agora.
 *
 * TODO: o modelo oficial da carteirinha (enviado pelo Valmir) substituirá este
 * layout — os dados já vêm todos de GET /colaboradores/:id/carteirinha.
 */

const CARTAO: CSSProperties = {
  width: '86mm',
  height: '54mm',
  borderRadius: '3mm',
  border: '0.3mm solid #cbd5e1',
  background: '#fff',
  color: '#0f172a',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'Inter, Arial, sans-serif',
  boxSizing: 'border-box',
  printColorAdjust: 'exact',
  WebkitPrintColorAdjust: 'exact',
  flexShrink: 0,
};

const ROTULO: CSSProperties = { fontSize: '1.9mm', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1mm' };
const VALOR: CSSProperties = { fontSize: '2.6mm', fontWeight: 600, lineHeight: 1.15 };

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return `${partes[0]?.[0] ?? ''}${partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : ''}`.toUpperCase();
}

/** Máximo de treinamentos que cabem no verso sem quebrar o cartão. */
const MAX_TREINAMENTOS = 6;

export function CarteirinhaPage() {
  const { id } = useParams<{ id: string }>();
  const { mostrar } = useToast();
  const [dados, setDados] = useState<CarteirinhaApi | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let ativo = true;
    api
      .get<CarteirinhaApi>(`/colaboradores/${id}/carteirinha`)
      .then((resposta) => {
        if (ativo) setDados(resposta);
      })
      .catch((falha) => {
        if (ativo) setErro(falha instanceof ErroApi ? falha.mensagemAmigavel() : 'Falha ao carregar a carteirinha.');
      });
    return () => {
      ativo = false;
    };
  }, [id]);

  // O SVG do QR exige o token da sessão: busca autenticada e vira blob local.
  useEffect(() => {
    if (!id) return;
    let ativo = true;
    let urlCriada: string | null = null;
    const token = lerTokenSalvo();
    fetch(`${API_URL}/api/v1/colaboradores/${id}/carteirinha.svg`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((resposta) => {
        if (!resposta.ok) throw new Error('QR indisponível');
        return resposta.blob();
      })
      .then((blob) => {
        urlCriada = URL.createObjectURL(blob);
        if (ativo) setQrUrl(urlCriada);
      })
      .catch(() => {
        if (ativo) setQrUrl(null);
      });
    return () => {
      ativo = false;
      if (urlCriada) URL.revokeObjectURL(urlCriada);
    };
  }, [id]);

  async function copiarLink() {
    if (!dados?.urlVerificacao) return;
    try {
      await navigator.clipboard.writeText(dados.urlVerificacao);
      mostrar('Link de verificação copiado.', 'sucesso');
    } catch {
      mostrar('Não foi possível copiar. Selecione o link e copie manualmente.', 'erro');
    }
  }

  if (erro) {
    return (
      <div className="painel">
        <Link className="link-voltar" to={`/colaboradores/${id ?? ''}`}>
          ← Voltar ao colaborador
        </Link>
        <div className="vazio">
          <div className="icone-vazio" aria-hidden="true">
            <Icone nome="alerta" tamanho={22} />
          </div>
          <h4>Carteirinha indisponível</h4>
          <p>{erro}</p>
        </div>
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
        Montando a carteirinha...
      </div>
    );
  }

  const { colaborador } = dados;
  const faixa = dados.liberado
    ? { texto: 'LIBERADO', cor: '#047857' }
    : colaborador.bloqueado
      ? { texto: 'BLOQUEADO', cor: '#b91c1c' }
      : { texto: 'PENDENTE', cor: '#b91c1c' };
  const logoConsultoria = urlAbsoluta(dados.consultoria?.logoUrl);
  const logoCliente = urlAbsoluta(dados.cliente.logoUrl);
  const foto = urlAbsoluta(colaborador.fotoUrl);
  const treinamentosValidos = dados.treinamentos.filter((t) => t.situacao !== 'VENCIDO');

  const motivosPendencia = [
    colaborador.bloqueado ? `bloqueado${colaborador.motivoBloqueio ? ` — ${colaborador.motivoBloqueio}` : ''}` : null,
    !dados.aso ? 'sem ASO registrado' : null,
    dados.aso?.situacao === 'VENCIDO' ? 'ASO vencido' : null,
    dados.aso?.resultado?.toUpperCase().startsWith('INAPTO') ? 'ASO com resultado inapto' : null,
    colaborador.situacao !== 'Ativo' ? `situação: ${colaborador.situacao}` : null,
  ].filter(Boolean);

  return (
    <>
      <style>{`
        @media print {
          .carteirinha-area { padding: 0 !important; gap: 4mm !important; }
          .carteirinha-area > div { break-inside: avoid; }
        }
      `}</style>

      <div className="painel sem-impressao">
        <Link className="link-voltar" to={`/colaboradores/${colaborador.id}`}>
          ← Voltar ao colaborador
        </Link>
        <h3>Carteirinha — {colaborador.nome}</h3>
        <p className="desc">
          Imprima em tamanho real (escala 100%), recorte pela borda e dobre ou cole frente e verso. Quem ler o QR Code vê a
          situação atualizada — se o ASO vencer ou o colaborador for bloqueado, a verificação mostra na hora.
        </p>

        {!dados.liberado ? (
          <p className="hint alerta">
            <Icone nome="bloqueado" /> <b>Não liberado:</b> {motivosPendencia.join('; ') || 'verifique ASO e cadastro'}.
          </p>
        ) : null}
        {!foto ? (
          <p className="hint">
            Sem foto cadastrada — envie a foto no cadastro do colaborador para ela aparecer na carteirinha.
          </p>
        ) : null}

        <div className="barra-acoes">
          <Link className="btn btn-ghost" to={`/colaboradores/${colaborador.id}`}>
            <Icone nome="voltar" /> Voltar
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <Icone nome="impressora" /> Imprimir
          </button>
          {dados.urlVerificacao ? (
            <>
              <a className="btn btn-outline" href={dados.urlVerificacao} target="_blank" rel="noreferrer">
                <Icone nome="link" /> Abrir verificação
              </a>
              <button type="button" className="btn btn-ghost" onClick={() => void copiarLink()}>
                Copiar link
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div
        className="painel carteirinha-area"
        style={{ display: 'flex', gap: '6mm', flexWrap: 'wrap', justifyContent: 'center', padding: '8mm' }}
      >
        {/* ---------------------------------------------------------- frente */}
        <div style={CARTAO} aria-label="Frente da carteirinha">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.5mm 3mm',
              height: '9mm',
              borderBottom: '0.3mm solid #e2e8f0',
              boxSizing: 'border-box',
            }}
          >
            {logoConsultoria ? (
              <img src={logoConsultoria} alt={dados.consultoria?.nomeFantasia ?? 'Consultoria'} style={{ maxHeight: '6mm', maxWidth: '30mm', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: '2.4mm', fontWeight: 700 }}>{dados.consultoria?.nomeFantasia ?? ''}</span>
            )}
            {logoCliente ? (
              <img src={logoCliente} alt={dados.cliente.nomeFantasia} style={{ maxHeight: '6mm', maxWidth: '30mm', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: '2.4mm', fontWeight: 700 }}>{dados.cliente.nomeFantasia}</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '3mm', padding: '2.5mm 3mm', flex: 1, minHeight: 0 }}>
            {foto ? (
              <img
                src={foto}
                alt={`Foto de ${colaborador.nome}`}
                style={{ width: '20mm', height: '26mm', objectFit: 'cover', borderRadius: '1mm', border: '0.3mm solid #cbd5e1' }}
              />
            ) : (
              <div
                style={{
                  width: '20mm',
                  height: '26mm',
                  borderRadius: '1mm',
                  background: '#e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '7mm',
                  fontWeight: 700,
                  color: '#475569',
                  flexShrink: 0,
                }}
              >
                {iniciais(colaborador.nome)}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2mm', minWidth: 0 }}>
              <div style={{ fontSize: '3.2mm', fontWeight: 700, lineHeight: 1.1 }}>{colaborador.nome}</div>
              <div>
                <div style={ROTULO}>Função</div>
                <div style={VALOR}>{colaborador.funcao}</div>
              </div>
              <div style={{ display: 'flex', gap: '3mm' }}>
                <div>
                  <div style={ROTULO}>Matrícula</div>
                  <div style={VALOR}>{colaborador.matricula ?? '—'}</div>
                </div>
                <div>
                  <div style={ROTULO}>CPF</div>
                  <div style={VALOR}>{colaborador.cpfParcial}</div>
                </div>
              </div>
              <div>
                <div style={ROTULO}>Empregador</div>
                <div style={VALOR}>{dados.empregador}</div>
              </div>
            </div>
          </div>

          <div
            style={{
              background: faixa.cor,
              color: '#fff',
              textAlign: 'center',
              fontWeight: 800,
              fontSize: '3.4mm',
              letterSpacing: '0.6mm',
              padding: '1.4mm 0',
            }}
          >
            {faixa.texto}
          </div>
        </div>

        {/* ----------------------------------------------------------- verso */}
        <div style={CARTAO} aria-label="Verso da carteirinha">
          <div style={{ display: 'flex', gap: '2.5mm', padding: '2.5mm 3mm', flex: 1, minHeight: 0 }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1mm' }}>
              <div style={{ ...ROTULO, fontWeight: 700, color: '#0f172a' }}>Treinamentos válidos</div>
              {treinamentosValidos.length === 0 ? (
                <div style={{ fontSize: '2.3mm', color: '#64748b' }}>Nenhum treinamento válido registrado.</div>
              ) : (
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '2.2mm' }}>
                  <tbody>
                    {treinamentosValidos.slice(0, MAX_TREINAMENTOS).map((treinamento) => (
                      <tr key={`${treinamento.nome}-${treinamento.dataRealizacao}`}>
                        <td style={{ padding: '0.3mm 0', fontWeight: 600, whiteSpace: 'nowrap', paddingRight: '1.5mm' }}>
                          {treinamento.norma ?? '—'}
                        </td>
                        <td
                          style={{
                            padding: '0.3mm 0',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '24mm',
                          }}
                        >
                          {treinamento.nome}
                        </td>
                        <td style={{ padding: '0.3mm 0', textAlign: 'right', whiteSpace: 'nowrap', paddingLeft: '1mm' }}>
                          {treinamento.validade ? formatarDataIso(treinamento.validade) : 'sem venc.'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {treinamentosValidos.length > MAX_TREINAMENTOS ? (
                <div style={{ fontSize: '2mm', color: '#64748b' }}>
                  + {treinamentosValidos.length - MAX_TREINAMENTOS} no QR Code
                </div>
              ) : null}
              <div style={{ marginTop: 'auto' }}>
                <div style={ROTULO}>ASO válido até</div>
                <div style={{ ...VALOR, color: dados.aso && dados.aso.situacao !== 'VENCIDO' ? '#0f172a' : '#b91c1c' }}>
                  {dados.aso?.validade
                    ? `${formatarDataIso(dados.aso.validade)}${dados.aso.situacao === 'VENCIDO' ? ' (vencido)' : ''}`
                    : dados.aso
                      ? 'sem validade'
                      : 'sem ASO'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1mm', width: '25mm', flexShrink: 0 }}>
              {qrUrl ? (
                <img src={qrUrl} alt="QR Code de verificação" style={{ width: '24mm', height: '24mm' }} />
              ) : (
                <div
                  style={{
                    width: '24mm',
                    height: '24mm',
                    border: '0.3mm dashed #cbd5e1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2mm',
                    color: '#64748b',
                    textAlign: 'center',
                  }}
                >
                  QR indisponível
                </div>
              )}
              <div style={{ fontSize: '1.9mm', textAlign: 'center', color: '#475569', lineHeight: 1.2 }}>
                Verifique a validade lendo o QR Code
              </div>
            </div>
          </div>
          <div
            style={{
              borderTop: '0.3mm solid #e2e8f0',
              padding: '1mm 3mm',
              fontSize: '1.8mm',
              color: '#64748b',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{dados.cliente.nomeFantasia}</span>
            <span>Pessoal e intransferível</span>
          </div>
        </div>
      </div>
    </>
  );
}
