import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { uploadDir } from '../env.js';
import { RequisicaoInvalida } from './erros.js';

/** Prefixo publico sob o qual os uploads sao servidos pela API. */
export const PREFIXO_PUBLICO = '/arquivos';

const EXTENSAO_POR_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

export const MIMES_IMAGEM_ACEITOS = Object.keys(EXTENSAO_POR_MIME);

/**
 * Documentos legais (Etapa 9) chegam quase sempre em PDF — o ASO assinado, o
 * PGR, a licenca. Ficam num mapa proprio para que o upload de logo e de
 * evidencia continue aceitando apenas imagem.
 */
const EXTENSAO_POR_MIME_DOCUMENTO: Record<string, string> = {
  ...EXTENSAO_POR_MIME,
  'application/pdf': '.pdf',
};

export const MIMES_DOCUMENTO_ACEITOS = Object.keys(EXTENSAO_POR_MIME_DOCUMENTO);

/** Grava um anexo de documento (PDF ou imagem) e devolve a URL publica. */
export async function salvarDocumento(conteudo: Buffer, mimetype: string, prefixo = 'documento'): Promise<string> {
  const extensao = EXTENSAO_POR_MIME_DOCUMENTO[mimetype];
  if (!extensao) {
    throw new RequisicaoInvalida(
      `Formato ${mimetype} nao suportado. Envie PDF, PNG, JPG ou WEBP.`,
      'FORMATO_NAO_SUPORTADO',
    );
  }

  await garantirDiretorioDeUpload();
  const nomeArquivo = `${prefixo}-${randomUUID()}${extensao}`;
  await writeFile(join(uploadDir, nomeArquivo), conteudo);

  return `${PREFIXO_PUBLICO}/${nomeArquivo}`;
}

export async function garantirDiretorioDeUpload(): Promise<void> {
  await mkdir(uploadDir, { recursive: true });
}

/**
 * Grava um arquivo de imagem no diretorio de uploads e devolve a URL publica
 * relativa (ex.: /arquivos/logo-uuid.png).
 */
export async function salvarImagem(conteudo: Buffer, mimetype: string, prefixo = 'arquivo'): Promise<string> {
  const extensao = EXTENSAO_POR_MIME[mimetype];
  if (!extensao) {
    throw new RequisicaoInvalida(
      `Formato ${mimetype} nao suportado. Envie PNG, JPG, WEBP ou SVG.`,
      'FORMATO_NAO_SUPORTADO',
    );
  }

  await garantirDiretorioDeUpload();
  const nomeArquivo = `${prefixo}-${randomUUID()}${extensao}`;
  await writeFile(join(uploadDir, nomeArquivo), conteudo);

  return `${PREFIXO_PUBLICO}/${nomeArquivo}`;
}

/**
 * Remove um arquivo previamente gravado. Ignora URLs externas e falhas de
 * arquivo inexistente — a limpeza nunca deve derrubar a requisicao.
 */
export async function removerArquivoPublico(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith(`${PREFIXO_PUBLICO}/`)) return;

  try {
    await unlink(join(uploadDir, basename(url)));
  } catch {
    // arquivo ja removido ou inexistente
  }
}
