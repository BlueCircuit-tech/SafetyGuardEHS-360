import nodemailer from 'nodemailer';
import { env } from '../env.js';

/**
 * Serviço de e-mail.
 *
 * Modo de operação (automático, sem configuração manual):
 *
 * 1. SMTP real configurado (SMTP_HOST + SMTP_USER + SMTP_PASS no .env)
 *    → envia o e-mail de verdade para o destinatário.
 *
 * 2. Sem SMTP configurado (padrão em desenvolvimento)
 *    → usa Ethereal (servidor de teste do Nodemailer).
 *    → O e-mail é capturado e uma URL de visualização aparece no terminal.
 *    → Acesse a URL para ver o e-mail exatamente como seria recebido.
 *    → Nenhum e-mail chega a uma caixa de entrada real — é seguro testar.
 *
 * Para ativar envio real: descomente e preencha as variáveis SMTP no .env.
 */

let transporterReal: nodemailer.Transporter | null = null;
let transporterEthereal: nodemailer.Transporter | null = null;

async function obterTransporter(): Promise<{ t: nodemailer.Transporter; modo: 'real' | 'ethereal' }> {
  // Modo real: SMTP configurado
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    if (!transporterReal) {
      transporterReal = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      });
    }
    return { t: transporterReal, modo: 'real' };
  }

  // Modo teste: Ethereal (cria conta temporária uma vez por processo)
  if (!transporterEthereal) {
    const conta = await nodemailer.createTestAccount();
    transporterEthereal = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: conta.user, pass: conta.pass },
    });
    console.log('\n📧  SMTP não configurado — usando Ethereal (modo de teste)');
    console.log('    Os e-mails aparecem como URL no terminal abaixo.\n');
  }

  return { t: transporterEthereal, modo: 'ethereal' };
}

export interface OpcaoEmail {
  para: string | string[];
  assunto: string;
  corpo: string;
}

/**
 * Envia um e-mail.
 * - Modo real: entrega na caixa do destinatário, retorna `true`.
 * - Modo Ethereal: captura o e-mail, imprime a URL de visualização no terminal.
 */
export async function enviarEmail(opcao: OpcaoEmail): Promise<boolean> {
  const { t, modo } = await obterTransporter();

  const info = await t.sendMail({
    from: env.SMTP_FROM || env.SMTP_USER || 'SafetyGuard <alertas@safetyguard.local>',
    to: Array.isArray(opcao.para) ? opcao.para.join(', ') : opcao.para,
    subject: opcao.assunto,
    html: opcao.corpo.replace(/\n/g, '<br>'),
    text: opcao.corpo,
  });

  if (modo === 'ethereal') {
    const url = nodemailer.getTestMessageUrl(info);
    console.log(`\n📬  E-mail capturado (Ethereal) — visualize em:\n    ${url}\n`);
  }

  return true;
}

export function smtpConfigurado(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}
