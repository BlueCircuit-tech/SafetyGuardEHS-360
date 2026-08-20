import nodemailer from 'nodemailer';
import { env } from '../env.js';

let transporter: nodemailer.Transporter | null = null;

function obterTransporter(): nodemailer.Transporter | null {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }

  return transporter;
}

export interface OpcaoEmail {
  para: string | string[];
  assunto: string;
  corpo: string;
}

/**
 * Envia um e-mail. Retorna `true` se enviado, `false` se SMTP não configurado,
 * lança erro se a configuração está presente mas o envio falhou.
 */
export async function enviarEmail(opcao: OpcaoEmail): Promise<boolean> {
  const t = obterTransporter();
  if (!t) return false;

  await t.sendMail({
    from: env.SMTP_FROM || env.SMTP_USER,
    to: Array.isArray(opcao.para) ? opcao.para.join(', ') : opcao.para,
    subject: opcao.assunto,
    html: opcao.corpo.replace(/\n/g, '<br>'),
    text: opcao.corpo,
  });

  return true;
}

export function smtpConfigurado(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}
