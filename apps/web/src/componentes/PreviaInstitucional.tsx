import { montarCabecalhoInstitucional, type EmpresaFormValues } from '@safetyguard/shared';
import { urlAbsoluta } from '../lib/api';

/**
 * Mostra, em tempo real, onde cada campo do cadastro aparece: cabecalho e
 * rodape dos relatorios, assinatura de e-mail e cabecalho do WhatsApp.
 * Usa exatamente a mesma funcao que a API usa para gerar esses blocos.
 */
export function PreviaInstitucional({ valores }: { valores: EmpresaFormValues }) {
  const preenchidoMinimo = valores.razaoSocial.trim() || valores.nomeFantasia.trim();

  if (!preenchidoMinimo) {
    return (
      <div className="painel">
        <h3>👁️ Como vai aparecer</h3>
        <p className="desc">
          Preencha a razao social e o nome fantasia para ver a previa do cabecalho de relatorios, da assinatura de
          e-mail e das notificacoes de WhatsApp.
        </p>
      </div>
    );
  }

  const cabecalho = montarCabecalhoInstitucional({
    ...valores,
    responsavelTecnicoTipoRegistro: valores.responsavelTecnicoTipoRegistro || 'CREA',
  });

  const logo = urlAbsoluta(valores.logoUrl);

  return (
    <div className="painel">
      <h3>👁️ Como vai aparecer</h3>
      <p className="desc">
        Estes blocos sao gerados pela mesma funcao usada pela API — o que voce ve aqui e o que sai nos documentos.
      </p>

      <div className="previa-doc">
        <div className="cab" style={{ background: cabecalho.corSecundaria }}>
          <div className="logo">
            {logo ? <img src={logo} alt="Logo da empresa" /> : <span aria-hidden="true">🦺</span>}
          </div>
          <div>
            <div className="nome" style={{ color: cabecalho.corPrimaria }}>
              {cabecalho.nomeExibicao}
            </div>
            <div className="sub">
              {cabecalho.razaoSocial} · CNPJ {cabecalho.cnpjFormatado}
            </div>
            <div className="sub">{cabecalho.enderecoLinha}</div>
          </div>
        </div>

        <div className="corpo">
          <div className="titulo-doc">RELATORIO DE INSPECAO DE SEGURANCA — modelo</div>
          Responsavel tecnico: {cabecalho.responsavelTecnicoLinha}
          <br />
          Contato: {cabecalho.contatoLinha}
        </div>

        <div className="rodape">{cabecalho.rodapeRelatorio}</div>
      </div>

      <div className="previa-canal">
        <span className="canal-lbl">✉️ Assinatura de e-mail</span>
        {cabecalho.assinaturaEmail}
      </div>

      <div className="previa-canal whats">
        <span className="canal-lbl">💬 Notificacao de WhatsApp</span>
        {cabecalho.cabecalhoWhatsapp}
        {'\n'}
        Plano de acao PA-2031 aberto — criticidade Alta, prazo 24h.
      </div>
    </div>
  );
}
