import { useEffect, useState } from 'react';
import { Icone } from '../componentes/Icone';
import { Link, useParams } from 'react-router-dom';
import { APP_NOME } from '@safetyguard/shared';
import { ErroApi, api } from '../lib/api';
import { PILL_CRITICIDADE_AREA, type AreaApi } from '../lib/area-form';

/**
 * Destino do QR Code da área.
 *
 * É a primeira tela do fluxo de campo: fica fora do shell administrativo
 * porque é aberta no celular, muitas vezes com luva e sob sol. Mostra o que o
 * inspetor precisa saber antes de entrar — riscos, exigência de PT e controle
 * de acesso — e é aqui que o formulário de observação vai entrar.
 */
export function LeituraQrPage() {
  const { token } = useParams<{ token: string }>();
  const [carregando, setCarregando] = useState(true);
  const [area, setArea] = useState<AreaApi | null>(null);
  const [erro, setErro] = useState<{ codigo: string; mensagem: string } | null>(null);

  useEffect(() => {
    let ativo = true;

    async function resolver() {
      try {
        const resposta = await api.get<AreaApi>(`/areas/qr/${token}`);
        if (ativo) setArea(resposta);
      } catch (falha) {
        if (!ativo) return;
        setErro(
          falha instanceof ErroApi
            ? { codigo: falha.codigo, mensagem: falha.message }
            : { codigo: 'ERRO_REDE', mensagem: 'Nao foi possivel falar com o servidor.' },
        );
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    void resolver();
    return () => {
      ativo = false;
    };
  }, [token]);

  if (carregando) {
    return (
      <div className="tela-campo">
        <div className="centro-tela">
          <div className="spinner" />
          Lendo QR Code...
        </div>
      </div>
    );
  }

  if (erro || !area) {
    return (
      <div className="tela-campo">
        <div className="cartao-campo">
          <div className="campo-icone" aria-hidden="true">
            {erro?.codigo === 'AREA_INATIVA' ? '<Icone nome="bloqueado" />' : '<Icone nome="interrogacao" />'}
          </div>
          <h1>{erro?.codigo === 'AREA_INATIVA' ? 'Área inativa' : 'QR Code não reconhecido'}</h1>
          <p>{erro?.mensagem ?? 'Este código não corresponde a nenhuma área cadastrada.'}</p>
          <p className="campo-token">
            Código lido: <code>{token}</code>
          </p>
          <Link className="btn btn-outline" to="/areas">
            Ver áreas cadastradas
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="tela-campo">
      <div className="cartao-campo">
        <div className="campo-marca"><Icone nome="escudo" /> {APP_NOME}</div>

        <div className="campo-cliente">{area.cliente?.nomeFantasia}</div>
        <h1>{area.nome}</h1>
        <p className="campo-sub">
          <code>{area.codigo}</code>
          {area.setor ? ` · ${area.setor}` : ''} · {area.rotulos.tipo}
        </p>

        <div className="campo-pills">
          <span className={`pill ${PILL_CRITICIDADE_AREA[area.criticidade]}`}>
            Criticidade {area.rotulos.criticidade}
          </span>
          {area.exigePermissaoTrabalho ? <span className="pill bad">Exige permissão de trabalho</span> : null}
          {area.exigeAutorizacaoEntrada ? <span className="pill warn">Acesso controlado</span> : null}
        </div>

        {area.riscos.length > 0 ? (
          <div className="campo-bloco">
            <h2>Riscos presentes</h2>
            <div className="campo-pills">
              {area.riscos.map((risco) => (
                <span className="pill gray" key={risco}>
                  {risco}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {area.pontoReferencia ? (
          <div className="campo-bloco">
            <h2>Ponto de referência</h2>
            <p>{area.pontoReferencia}</p>
          </div>
        ) : null}

        {area.responsavelNome ? (
          <div className="campo-bloco">
            <h2>Responsável pela área</h2>
            <p>
              {area.responsavelNome}
              {area.responsavelCargo ? ` — ${area.responsavelCargo}` : ''}
            </p>
            {area.formatado.responsavelTelefone ? <p>{area.formatado.responsavelTelefone}</p> : null}
          </div>
        ) : null}

        <Link className="btn btn-primary btn-block-campo" to={`/observacoes/nova?qr=${area.tokenQr}`}>
          <Icone nome="documento" /> Registrar observação
        </Link>

        <Link className="btn btn-ghost btn-sm" to={`/areas/${area.id}`}>
          Ver cadastro da área
        </Link>
      </div>
    </div>
  );
}
