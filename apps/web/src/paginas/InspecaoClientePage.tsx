import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { APP_NOME } from '@safetyguard/shared';
import { Icone } from '../componentes/Icone';
import { ErroApi, api, urlAbsoluta } from '../lib/api';

interface AreaDoCliente {
  id: string;
  nome: string;
  codigo: string;
  setor: string | null;
  urlInspecao: string;
}

interface RespostaQrCliente {
  cliente: { id: string; nomeFantasia: string; razaoSocial: string; logoUrl: string | null };
  areas: AreaDoCliente[];
}

/**
 * Destino do QR Code unico do cliente (tela publica, celular).
 *
 * Em vez de uma placa por area, uma placa so: a pessoa escolhe onde esta e
 * segue para a leitura da area, que leva ao formulario de observacao.
 */
export function InspecaoClientePage() {
  const { token } = useParams<{ token: string }>();
  const [dados, setDados] = useState<RespostaQrCliente | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    let ativo = true;
    api
      .get<RespostaQrCliente>(`/clientes/qr/${token}`)
      .then((resposta) => ativo && setDados(resposta))
      .catch((falha: unknown) => ativo && setErro(falha instanceof ErroApi ? falha.message : 'Não foi possível falar com o servidor.'));
    return () => {
      ativo = false;
    };
  }, [token]);

  const setores = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const mapa = new Map<string, AreaDoCliente[]>();
    for (const area of dados?.areas ?? []) {
      if (termo && !`${area.nome} ${area.codigo} ${area.setor ?? ''}`.toLowerCase().includes(termo)) continue;
      const chave = area.setor ?? 'Outras áreas';
      mapa.set(chave, [...(mapa.get(chave) ?? []), area]);
    }
    return [...mapa.entries()];
  }, [dados, busca]);

  if (erro) {
    return (
      <div className="tela-campo">
        <div className="cartao-campo">
          <div className="campo-icone" aria-hidden="true">
            <Icone nome="interrogacao" tamanho={22} />
          </div>
          <h1>QR Code não reconhecido</h1>
          <p>{erro}</p>
        </div>
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="tela-campo">
        <div className="centro-tela">
          <div className="spinner" />
          Lendo QR Code...
        </div>
      </div>
    );
  }

  return (
    <div className="tela-campo">
      <div className="cartao-campo">
        <div className="campo-marca">
          <Icone nome="escudo" /> {APP_NOME}
        </div>
        {dados.cliente.logoUrl ? (
          <img src={urlAbsoluta(dados.cliente.logoUrl) ?? ''} alt="" style={{ maxHeight: 48, margin: '4px auto' }} />
        ) : null}
        <div className="campo-cliente">{dados.cliente.nomeFantasia}</div>
        <h1>Onde você está?</h1>
        <p className="campo-sub">Escolha a área para registrar uma observação de segurança.</p>

        <input
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
          placeholder="Buscar área ou setor"
          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', margin: '8px 0' }}
        />

        {setores.length === 0 ? (
          <p className="hint">Nenhuma área ativa encontrada.</p>
        ) : (
          setores.map(([setor, areas]) => (
            <div className="campo-bloco" key={setor}>
              <h2>{setor}</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {areas.map((area) => (
                  <Link key={area.id} className="btn btn-outline btn-block-campo" to={area.urlInspecao}>
                    <Icone nome="local" /> {area.nome} <span className="hint mono">{area.codigo}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
