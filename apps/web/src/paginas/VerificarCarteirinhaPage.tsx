import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { APP_NOME } from '@safetyguard/shared';
import { Icone } from '../componentes/Icone';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { formatarDataHora, formatarDataIso } from '../lib/datas';
import { PILL_VENCIMENTO, type CarteirinhaApi } from '../lib/saude';

/**
 * Etapa 24 — Verificação pública da carteirinha (destino do QR Code).
 *
 * Aberta no celular do porteiro, do líder ou do fiscal do cliente, sem login:
 * o token do QR é a credencial. Mostra grande se a pessoa está LIBERADA agora,
 * com foto, função, empregador, ASO e treinamentos com validade. Nada sensível
 * (o CPF vem mascarado pelo servidor).
 */

const ROTULO_VALIDADE: Record<string, string> = {
  VIGENTE: 'Vigente',
  A_VENCER: 'A vencer',
  VENCIDO: 'Vencido',
  SEM_VALIDADE: 'Sem validade',
  SEM_ASO: 'Sem ASO',
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return `${partes[0]?.[0] ?? ''}${partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : ''}`.toUpperCase();
}

export function VerificarCarteirinhaPage() {
  const { token } = useParams<{ token: string }>();
  const [carregando, setCarregando] = useState(true);
  const [dados, setDados] = useState<CarteirinhaApi | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    api
      .get<CarteirinhaApi>(`/carteirinha/${encodeURIComponent(token ?? '')}`)
      .then((resposta) => {
        if (ativo) setDados(resposta);
      })
      .catch((falha) => {
        if (!ativo) return;
        setErro(falha instanceof ErroApi ? falha.message : 'Não foi possível falar com o servidor.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [token]);

  if (carregando) {
    return (
      <div className="tela-campo">
        <div className="centro-tela">
          <div className="spinner" />
          Verificando carteirinha...
        </div>
      </div>
    );
  }

  if (erro || !dados) {
    return (
      <div className="tela-campo">
        <div className="cartao-campo">
          <div className="campo-icone" aria-hidden="true">
            <Icone nome="interrogacao" tamanho={22} />
          </div>
          <h1>Carteirinha não reconhecida</h1>
          <p>{erro ?? 'Este QR Code não corresponde a nenhuma carteirinha válida.'}</p>
          <p className="campo-token">
            Código lido: <code>{token}</code>
          </p>
          <p className="hint">Não permita o acesso até confirmar a identidade com o responsável de SSMA.</p>
        </div>
      </div>
    );
  }

  const { colaborador } = dados;
  const foto = urlAbsoluta(colaborador.fotoUrl);
  const corSituacao = dados.liberado ? '#047857' : '#b91c1c';

  const motivos = [
    colaborador.bloqueado ? `Bloqueado${colaborador.motivoBloqueio ? `: ${colaborador.motivoBloqueio}` : ''}` : null,
    !dados.aso ? 'Sem ASO registrado' : null,
    dados.aso?.situacao === 'VENCIDO' ? 'ASO vencido' : null,
    dados.aso?.resultado?.toUpperCase().startsWith('INAPTO') ? 'ASO inapto' : null,
    colaborador.situacao !== 'Ativo' ? `Situação: ${colaborador.situacao}` : null,
  ].filter((motivo): motivo is string => Boolean(motivo));

  return (
    <div className="tela-campo">
      <div className="cartao-campo">
        <div className="campo-marca">
          <Icone nome="escudo" /> {dados.consultoria?.nomeFantasia ?? APP_NOME}
        </div>

        <div
          role="status"
          style={{
            background: corSituacao,
            color: '#fff',
            borderRadius: 12,
            padding: '18px 14px',
            textAlign: 'center',
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 2, lineHeight: 1.1 }}>
            {dados.liberado ? 'LIBERADO' : colaborador.bloqueado ? 'BLOQUEADO' : 'NÃO LIBERADO'}
          </div>
          <div style={{ fontSize: 13, marginTop: 6, opacity: 0.95 }}>
            {dados.liberado ? 'Pode trabalhar — ASO em dia e sem bloqueio.' : 'Não permita o trabalho até regularizar.'}
          </div>
        </div>

        {motivos.length > 0 ? (
          <div className="campo-bloco">
            <h2>Motivo</h2>
            <ul style={{ margin: '4px 0 0 18px' }}>
              {motivos.map((motivo) => (
                <li key={motivo}>{motivo}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
          {foto ? (
            <img
              src={foto}
              alt={`Foto de ${colaborador.nome}`}
              style={{ width: 90, height: 112, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }}
            />
          ) : (
            <div
              style={{
                width: 90,
                height: 112,
                borderRadius: 10,
                background: 'var(--superficie-2)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 30,
                fontWeight: 700,
                color: 'var(--texto-medio)',
                flexShrink: 0,
              }}
            >
              {iniciais(colaborador.nome)}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div className="campo-cliente">{dados.cliente.nomeFantasia}</div>
            <h1 style={{ margin: '2px 0' }}>{colaborador.nome}</h1>
            <p className="campo-sub">
              {colaborador.funcao}
              {colaborador.setor ? ` · ${colaborador.setor}` : ''}
            </p>
            <p className="campo-sub">
              Empregador: <b>{dados.empregador}</b>
            </p>
            <p className="campo-sub">
              CPF {colaborador.cpfParcial}
              {colaborador.matricula ? ` · mat. ${colaborador.matricula}` : ''}
            </p>
          </div>
        </div>

        <div className="campo-bloco">
          <h2>ASO</h2>
          {dados.aso ? (
            <div className="campo-pills">
              <span className={`pill ${PILL_VENCIMENTO[dados.aso.situacao]}`}>
                {ROTULO_VALIDADE[dados.aso.situacao] ?? dados.aso.situacao}
              </span>
              <span className="pill gray">{dados.aso.resultado}</span>
              <span>{dados.aso.validade ? `válido até ${formatarDataIso(dados.aso.validade)}` : 'sem validade'}</span>
            </div>
          ) : (
            <p>
              <span className="pill bad">Sem ASO</span>
            </p>
          )}
        </div>

        <div className="campo-bloco">
          <h2>Treinamentos</h2>
          {dados.treinamentos.length === 0 ? (
            <p>Nenhum treinamento registrado.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {dados.treinamentos.map((treinamento) => (
                <li
                  key={`${treinamento.nome}-${treinamento.dataRealizacao}`}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}
                >
                  <span>
                    <b>{treinamento.norma ? `${treinamento.norma} — ` : ''}</b>
                    {treinamento.nome}
                  </span>
                  <span className={`pill ${PILL_VENCIMENTO[treinamento.situacao]}`} style={{ whiteSpace: 'nowrap' }}>
                    {treinamento.validade ? formatarDataIso(treinamento.validade) : 'sem venc.'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="campo-proximo">
          Consulta feita em {formatarDataHora(dados.geradoEm ?? new Date().toISOString())}. A situação é calculada na hora da
          leitura — um ASO que vence ou um bloqueio aparecem imediatamente.
        </p>
      </div>
    </div>
  );
}
