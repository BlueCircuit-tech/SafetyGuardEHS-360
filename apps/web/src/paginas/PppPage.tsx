import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icone } from '../componentes/Icone';
import { useToast } from '../componentes/Toast';
import { api } from '../lib/api';
import { formatarDataHora, formatarDataIso } from '../lib/datas';

/**
 * PPP — Perfil Profissiográfico Previdenciário (seção 17 do plano diretor).
 *
 * A tela é o documento: o que aparece na tela é o que sai na impressão. Por
 * isso ela não tem filtro nem formulário — só o conteúdo, as fontes de cada
 * bloco e as pendências que impedem a emissão.
 */

interface Ppp {
  geradoEm: string;
  fontes: Record<string, string>;
  cabecalho: {
    nomeExibicao: string;
    cnpjFormatado: string;
    enderecoLinha: string;
    contatoLinha: string;
    responsavelTecnicoLinha: string;
    rodapeRelatorio: string;
  };
  empregador: { razaoSocial: string; cnpjFormatado: string; unidade: string | null };
  trabalhador: {
    nome: string;
    cpfFormatado: string;
    matricula: string | null;
    dataNascimento: string | null;
    funcao: string;
    setor: string | null;
    grauRisco: string;
    dataAdmissao: string | null;
    dataDesligamento: string | null;
    vinculo: string;
  };
  periodo: { de: string | null; ate: string };
  fatoresDeRisco: Array<{
    tipo: string;
    perigo: string;
    fonteGeradora: string | null;
    atividade: string | null;
    intensidade: string;
    tecnicaUtilizada: string;
    controleColetivo: string | null;
    origem: 'AREA' | 'FUNCAO';
  }>;
  examesMedicos: Array<{ tipo: string; data: string; resultado: string; medico: string; crm: string }>;
  epiFornecidos: Array<{ nome: string; ca: string; ultimaEntrega: string; quantidade: number }>;
  responsavelTecnico: {
    nome: string;
    cargo: string | null;
    registro: string;
    tipoRegistro: string;
    uf: string | null;
  };
  pendencias: string[];
}

/** Linha rótulo/valor dos blocos de identificação. */
function Dado({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div className="ppp-dado">
      <span className="ppp-rotulo">{rotulo}</span>
      <span className="ppp-valor">{valor?.trim() ? valor : '—'}</span>
    </div>
  );
}

/** Cabeçalho de seção com a origem do dado ao lado — a rastreabilidade. */
function Secao({ numero, titulo, fonte }: { numero: string; titulo: string; fonte?: string }) {
  return (
    <div className="ppp-secao">
      <h2>
        <span className="ppp-num">{numero}</span>
        {titulo}
      </h2>
      {fonte ? <span className="ppp-fonte">Fonte: {fonte}</span> : null}
    </div>
  );
}

export function PppPage() {
  const { id = '' } = useParams();
  const { mostrar } = useToast();

  const [carregando, setCarregando] = useState(true);
  const [ppp, setPpp] = useState<Ppp | null>(null);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    api
      .get<Ppp>(`/colaboradores/${id}/ppp`)
      .then((dados) => {
        if (ativo) setPpp(dados);
      })
      .catch((erro: unknown) => {
        if (ativo) mostrar(erro instanceof Error ? erro.message : 'Falha ao montar o PPP.', 'erro');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [id, mostrar]);

  if (carregando) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
      </div>
    );
  }

  if (!ppp) {
    return (
      <div className="painel">
        <p className="vazio">Não foi possível montar o PPP deste colaborador.</p>
        <Link className="btn btn-ghost" to="/colaboradores">
          Voltar
        </Link>
      </div>
    );
  }

  const periodo = `${formatarDataIso(ppp.periodo.de) || '—'} a ${
    ppp.trabalhador.dataDesligamento ? formatarDataIso(ppp.trabalhador.dataDesligamento) : 'hoje'
  }`;

  return (
    <>
      <div className="barra-acoes sem-impressao">
        <Link className="btn btn-ghost" to={`/colaboradores/${id}`}>
          <Icone nome="voltar" /> Voltar ao cadastro
        </Link>
        <button type="button" className="btn btn-primario" onClick={() => window.print()}>
          <Icone nome="imprimir" /> Imprimir / salvar em PDF
        </button>
      </div>

      {ppp.pendencias.length > 0 ? (
        <div className="hint alerta sem-impressao">
          <b>O documento está incompleto.</b> Emitir assim entrega ao INSS um PPP que não sustenta análise:
          <ul>
            {ppp.pendencias.map((pendencia) => (
              <li key={pendencia}>{pendencia}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <article className="folha-ppp">
        <header className="ppp-cabecalho">
          <div>
            <strong>{ppp.cabecalho.nomeExibicao}</strong>
            <div className="hint">CNPJ {ppp.cabecalho.cnpjFormatado}</div>
            <div className="hint">{ppp.cabecalho.enderecoLinha}</div>
            <div className="hint">{ppp.cabecalho.contatoLinha}</div>
          </div>
          <div className="ppp-titulo">
            <h1>Perfil Profissiográfico Previdenciário</h1>
            <div className="hint">Dados consolidados · gerado em {formatarDataHora(ppp.geradoEm)}</div>
          </div>
        </header>

        <p className="ppp-aviso">
          Documento de apoio: consolida os dados que a plataforma mantém sobre o colaborador para preencher e conferir o
          PPP. A emissão oficial é feita pelo eSocial (evento S-2240) no layout vigente.
        </p>

        <Secao numero="1" titulo="Empregador" fonte={ppp.fontes.empregador} />
        <div className="ppp-grade">
          <Dado rotulo="Razão social" valor={ppp.empregador.razaoSocial} />
          <Dado rotulo="CNPJ" valor={ppp.empregador.cnpjFormatado} />
          <Dado rotulo="Unidade" valor={ppp.empregador.unidade} />
        </div>

        <Secao numero="2" titulo="Trabalhador" fonte={ppp.fontes.trabalhador} />
        <div className="ppp-grade">
          <Dado rotulo="Nome" valor={ppp.trabalhador.nome} />
          <Dado rotulo="CPF" valor={ppp.trabalhador.cpfFormatado} />
          <Dado rotulo="Matrícula" valor={ppp.trabalhador.matricula} />
          <Dado rotulo="Nascimento" valor={formatarDataIso(ppp.trabalhador.dataNascimento)} />
          <Dado rotulo="Admissão" valor={formatarDataIso(ppp.trabalhador.dataAdmissao)} />
          <Dado rotulo="Desligamento" valor={formatarDataIso(ppp.trabalhador.dataDesligamento)} />
        </div>

        <Secao numero="3" titulo="Perfil profissiográfico" />
        <div className="ppp-grade">
          <Dado rotulo="Função" valor={ppp.trabalhador.funcao} />
          <Dado rotulo="Setor" valor={ppp.trabalhador.setor} />
          <Dado rotulo="Vínculo" valor={ppp.trabalhador.vinculo} />
          <Dado rotulo="Grau de risco da função" valor={ppp.trabalhador.grauRisco} />
          <Dado rotulo="Período do registro" valor={periodo} />
        </div>

        <Secao numero="4" titulo="Fatores de risco" fonte={ppp.fontes.fatoresDeRisco} />
        {ppp.fatoresDeRisco.length === 0 ? (
          <p className="vazio">
            Nenhum fator de risco inventariado para a área ou a função. É exatamente este bloco que o INSS analisa para
            reconhecer a exposição.
          </p>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Fator de risco</th>
                  <th>Fonte geradora</th>
                  <th>Intensidade / concentração</th>
                  <th>Técnica</th>
                  <th>Controle coletivo</th>
                </tr>
              </thead>
              <tbody>
                {ppp.fatoresDeRisco.map((fator, indice) => (
                  <tr key={`${fator.perigo}-${indice}`}>
                    <td>{fator.tipo}</td>
                    <td>
                      <b>{fator.perigo}</b>
                      {fator.atividade ? <div className="hint">{fator.atividade}</div> : null}
                    </td>
                    <td>{fator.fonteGeradora ?? '—'}</td>
                    <td>
                      {fator.intensidade}
                      <div className="hint">{fator.origem === 'AREA' ? 'vinculado à área' : 'vinculado à função'}</div>
                    </td>
                    <td>{fator.tecnicaUtilizada}</td>
                    <td>{fator.controleColetivo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Secao numero="5" titulo="Exames médicos ocupacionais" fonte={ppp.fontes.examesMedicos} />
        {ppp.examesMedicos.length === 0 ? (
          <p className="vazio">Nenhum ASO registrado.</p>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Resultado</th>
                  <th>Médico examinador</th>
                </tr>
              </thead>
              <tbody>
                {ppp.examesMedicos.map((exame, indice) => (
                  <tr key={`${exame.data}-${indice}`}>
                    <td>{formatarDataIso(exame.data)}</td>
                    <td>{exame.tipo}</td>
                    <td>{exame.resultado}</td>
                    <td>
                      {exame.medico}
                      <div className="hint">{exame.crm}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Secao numero="6" titulo="EPI fornecidos" fonte={ppp.fontes.epiFornecidos} />
        {ppp.epiFornecidos.length === 0 ? (
          <p className="vazio">Nenhuma entrega de EPI registrada.</p>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Equipamento</th>
                  <th>CA</th>
                  <th>Última entrega</th>
                  <th className="num">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {ppp.epiFornecidos.map((epi) => (
                  <tr key={`${epi.nome}-${epi.ca}`}>
                    <td>{epi.nome}</td>
                    <td className="mono">{epi.ca}</td>
                    <td>{formatarDataIso(epi.ultimaEntrega)}</td>
                    <td className="num">{epi.quantidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Secao numero="7" titulo="Responsável pelos registros ambientais" fonte={ppp.fontes.responsavelTecnico} />
        <div className="ppp-grade">
          <Dado rotulo="Nome" valor={ppp.responsavelTecnico.nome} />
          <Dado rotulo="Cargo" valor={ppp.responsavelTecnico.cargo} />
          <Dado
            rotulo="Registro profissional"
            valor={`${ppp.responsavelTecnico.tipoRegistro} ${ppp.responsavelTecnico.registro}${
              ppp.responsavelTecnico.uf ? `/${ppp.responsavelTecnico.uf}` : ''
            }`}
          />
        </div>

        <div className="ppp-assinaturas">
          <div>
            <span className="ppp-linha-assinatura" />
            <div className="hint">{ppp.responsavelTecnico.nome} — responsável técnico</div>
          </div>
          <div>
            <span className="ppp-linha-assinatura" />
            <div className="hint">Representante legal do empregador</div>
          </div>
        </div>

        <footer className="ppp-rodape">{ppp.cabecalho.rodapeRelatorio}</footer>
      </article>
    </>
  );
}
