import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icone } from '../componentes/Icone';
import { api, urlAbsoluta } from '../lib/api';
import { formatarDataHora, formatarDataIso } from '../lib/datas';

interface FichaEpiApi {
  geradoEm: string;
  cabecalho: {
    nomeExibicao: string;
    cnpjFormatado: string;
    enderecoLinha: string;
    contatoLinha: string;
    logoUrl: string | null;
    rodapeRelatorio: string;
  };
  empregador: { nomeFantasia: string; razaoSocial: string; cnpj: string; logoUrl: string | null } | null;
  terceiro: { nomeFantasia: string } | null;
  trabalhador: {
    id: string;
    nome: string;
    cpfFormatado: string;
    matricula: string | null;
    funcao: string;
    setor: string | null;
    dataAdmissao: string | null;
    fotoUrl: string | null;
  };
  entregas: Array<{
    id: string;
    data: string;
    epi: string;
    ca: string;
    validadeCa: string | null;
    quantidade: number;
    motivo: string;
    validadeTroca: string | null;
    assinaturaUrl: string | null;
    assinaturaEm: string | null;
    assinaturaHash: string | null;
  }>;
  termo: string;
}

/**
 * Ficha de EPI do colaborador (NR-06, item 6.6.1 "h"): todas as entregas com
 * CA, motivo, proxima troca e a assinatura carimbada de cada recebimento.
 *
 * Layout provisorio: o modelo oficial da ficha sera trocado quando o Valmir
 * enviar o modelo da consultoria.
 */
export function FichaEpiPage() {
  const { id } = useParams<{ id: string }>();
  const navegar = useNavigate();
  const [ficha, setFicha] = useState<FichaEpiApi | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setFicha(null);
    setErro(null);
    api
      .get<FichaEpiApi>(`/epis/ficha/${id}`)
      .then(setFicha)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Falha ao carregar a ficha de EPI.'));
  }, [id]);

  const barra = (
    <div className="painel sem-impressao">
      <div className="barra-acoes" style={{ justifyContent: 'space-between', marginBottom: 0 }}>
        <button type="button" className="btn btn-ghost" onClick={() => navegar(-1)}>
          <Icone nome="voltar" /> Voltar
        </button>
        {ficha ? (
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <Icone nome="impressora" /> Imprimir
          </button>
        ) : null}
      </div>
    </div>
  );

  if (erro) {
    return (
      <>
        {barra}
        <div className="painel">
          <div className="vazio">
            <div className="icone-vazio" aria-hidden="true">
              <Icone nome="alerta" tamanho={22} />
            </div>
            <h4>Não foi possível abrir a ficha</h4>
            <p>{erro}</p>
          </div>
        </div>
      </>
    );
  }

  if (!ficha) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
        Carregando...
      </div>
    );
  }

  const { cabecalho, empregador, trabalhador } = ficha;
  const logoConsultoria = urlAbsoluta(cabecalho.logoUrl);
  const logoEmpregador = urlAbsoluta(empregador?.logoUrl);

  return (
    <>
      {barra}

      <div className="painel folha">
        <div className="folha-cabecalho">
          <div>
            {logoConsultoria || logoEmpregador ? (
              <div className="folha-logos" style={{ marginBottom: 8 }}>
                {logoConsultoria ? <img src={logoConsultoria} alt={`Logo ${cabecalho.nomeExibicao}`} /> : null}
                {logoEmpregador ? <img src={logoEmpregador} alt={`Logo ${empregador?.nomeFantasia ?? 'empregador'}`} /> : null}
              </div>
            ) : null}
            <h2>Ficha de Controle de EPI</h2>
            <div className="hint">NR-06 — Equipamento de Proteção Individual</div>
          </div>
          <div className="meta">
            <b>{cabecalho.nomeExibicao}</b>
            {cabecalho.cnpjFormatado ? <div>CNPJ {cabecalho.cnpjFormatado}</div> : null}
            {cabecalho.enderecoLinha ? <div>{cabecalho.enderecoLinha}</div> : null}
            {cabecalho.contatoLinha ? <div>{cabecalho.contatoLinha}</div> : null}
            <div>gerada em {formatarDataHora(ficha.geradoEm)}</div>
          </div>
        </div>

        <div className="folha-secao">
          <h4>Empregador</h4>
          <dl className="folha-dados">
            <div>
              <dt>Razão social</dt>
              <dd>{empregador?.razaoSocial ?? '—'}</dd>
            </div>
            <div>
              <dt>Nome fantasia</dt>
              <dd>{empregador?.nomeFantasia ?? '—'}</dd>
            </div>
            <div>
              <dt>CNPJ</dt>
              <dd className="mono">{empregador?.cnpj ?? '—'}</dd>
            </div>
            {ficha.terceiro ? (
              <div>
                <dt>Empresa terceira</dt>
                <dd>{ficha.terceiro.nomeFantasia}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="folha-secao">
          <h4>Trabalhador</h4>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {trabalhador.fotoUrl ? (
              <img
                src={urlAbsoluta(trabalhador.fotoUrl) ?? undefined}
                alt={`Foto de ${trabalhador.nome}`}
                style={{ width: 84, height: 104, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
              />
            ) : null}
            <dl className="folha-dados" style={{ flex: 1 }}>
              <div>
                <dt>Nome</dt>
                <dd>{trabalhador.nome}</dd>
              </div>
              <div>
                <dt>CPF</dt>
                <dd className="mono">{trabalhador.cpfFormatado}</dd>
              </div>
              <div>
                <dt>Matrícula</dt>
                <dd>{trabalhador.matricula ?? '—'}</dd>
              </div>
              <div>
                <dt>Função</dt>
                <dd>{trabalhador.funcao}</dd>
              </div>
              <div>
                <dt>Setor</dt>
                <dd>{trabalhador.setor ?? '—'}</dd>
              </div>
              <div>
                <dt>Admissão</dt>
                <dd>{formatarDataIso(trabalhador.dataAdmissao)}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="folha-secao">
          <h4>Entregas</h4>
          {ficha.entregas.length === 0 ? (
            <p className="hint">Nenhuma entrega de EPI registrada para este trabalhador.</p>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>EPI</th>
                    <th>CA</th>
                    <th className="num-col">Qtd.</th>
                    <th>Motivo</th>
                    <th>Próxima troca</th>
                    <th>Assinatura</th>
                  </tr>
                </thead>
                <tbody>
                  {ficha.entregas.map((e) => (
                    <tr key={e.id}>
                      <td>{formatarDataIso(e.data)}</td>
                      <td>{e.epi}</td>
                      <td className="mono">
                        {e.ca}
                        {e.validadeCa ? <div className="hint">val. {formatarDataIso(e.validadeCa)}</div> : null}
                      </td>
                      <td className="num-col">{e.quantidade}</td>
                      <td>{e.motivo}</td>
                      <td>{e.validadeTroca ? formatarDataIso(e.validadeTroca) : 'por desgaste'}</td>
                      <td>
                        {e.assinaturaUrl ? (
                          <>
                            <img src={urlAbsoluta(e.assinaturaUrl) ?? undefined} alt="Assinatura do trabalhador" style={{ maxHeight: 36, maxWidth: 120, display: 'block' }} />
                            <div className="hint">{formatarDataHora(e.assinaturaEm)}</div>
                            {e.assinaturaHash ? (
                              <div className="carimbo" title={e.assinaturaHash}>
                                {e.assinaturaHash.slice(0, 16)}…
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div style={{ minWidth: 120, height: 28, borderBottom: '1px solid var(--texto)' }} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="folha-secao">
          <h4>Termo de responsabilidade</h4>
          <p style={{ fontSize: 13, textAlign: 'justify' }}>{ficha.termo}</p>
        </div>

        <div className="folha-assinatura">
          <div>
            <div style={{ height: 40 }} />
            {trabalhador.nome}
            <div className="hint">Trabalhador</div>
          </div>
          <div>
            <div style={{ height: 40 }} />
            {empregador?.razaoSocial ?? empregador?.nomeFantasia ?? 'Empregador'}
            <div className="hint">Responsável pela entrega</div>
          </div>
        </div>

        {cabecalho.rodapeRelatorio ? (
          <p className="hint" style={{ marginTop: 24, textAlign: 'center' }}>
            {cabecalho.rodapeRelatorio}
          </p>
        ) : null}
      </div>
    </>
  );
}
