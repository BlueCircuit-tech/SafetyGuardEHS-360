import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { uploadDir } from '../env.js';
import { RequisicaoInvalida } from './erros.js';
import { supabaseAdmin } from './supabase.js';

export const PREFIXO_PUBLICO = '/arquivos';

const EXTENSAO_POR_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

export const MIMES_IMAGEM_ACEITOS = Object.keys(EXTENSAO_POR_MIME);

const EXTENSAO_POR_MIME_DOCUMENTO: Record<string, string> = {
  ...EXTENSAO_POR_MIME,
  'application/pdf': '.pdf',
};

export const MIMES_DOCUMENTO_ACEITOS = Object.keys(EXTENSAO_POR_MIME_DOCUMENTO);

// Cache para evitar listagem repetida de buckets
const bucketsCriados = new Set<string>();

async function garantirBucket(nome: string): Promise<void> {
  if (!supabaseAdmin || bucketsCriados.has(nome)) return;
  const { data: lista } = await supabaseAdmin.storage.listBuckets();
  if (!lista?.find((b) => b.name === nome)) {
    await supabaseAdmin.storage.createBucket(nome, { public: true });
  }
  bucketsCriados.add(nome);
}

async function uploadParaSupabase(
  conteudo: Buffer,
  mimetype: string,
  bucket: string,
  nomeArquivo: string,
): Promise<string> {
  await garantirBucket(bucket);
  const { error } = await supabaseAdmin!.storage
    .from(bucket)
    .upload(nomeArquivo, conteudo, { contentType: mimetype, upsert: true });
  if (error) throw error;
  const { data } = supabaseAdmin!.storage.from(bucket).getPublicUrl(nomeArquivo);
  return data.publicUrl;
}

export async function garantirDiretorioDeUpload(): Promise<void> {
  await mkdir(uploadDir, { recursive: true });
}

/**
 * Grava um arquivo de imagem e devolve a URL pública.
 * — Se Supabase estiver configurado: sobe para o bucket "imagens".
 * — Caso contrário: salva no disco local em ./uploads.
 */
export async function salvarImagem(
  conteudo: Buffer,
  mimetype: string,
  prefixo = 'arquivo',
): Promise<string> {
  const extensao = EXTENSAO_POR_MIME[mimetype];
  if (!extensao) {
    throw new RequisicaoInvalida(
      `Formato ${mimetype} nao suportado. Envie PNG, JPG, WEBP ou SVG.`,
      'FORMATO_NAO_SUPORTADO',
    );
  }

  const nomeArquivo = `${prefixo}-${randomUUID()}${extensao}`;

  if (supabaseAdmin) {
    return uploadParaSupabase(conteudo, mimetype, 'imagens', nomeArquivo);
  }

  await garantirDiretorioDeUpload();
  await writeFile(join(uploadDir, nomeArquivo), conteudo);
  return `${PREFIXO_PUBLICO}/${nomeArquivo}`;
}

/**
 * Grava um documento (PDF ou imagem) e devolve a URL pública.
 * — Se Supabase estiver configurado: PDFs → bucket "documentos", imagens → "imagens".
 * — Caso contrário: salva no disco local.
 */
export async function salvarDocumento(
  conteudo: Buffer,
  mimetype: string,
  prefixo = 'documento',
): Promise<string> {
  const extensao = EXTENSAO_POR_MIME_DOCUMENTO[mimetype];
  if (!extensao) {
    throw new RequisicaoInvalida(
      `Formato ${mimetype} nao suportado. Envie PDF, PNG, JPG ou WEBP.`,
      'FORMATO_NAO_SUPORTADO',
    );
  }

  const nomeArquivo = `${prefixo}-${randomUUID()}${extensao}`;

  if (supabaseAdmin) {
    const bucket = mimetype === 'application/pdf' ? 'documentos' : 'imagens';
    return uploadParaSupabase(conteudo, mimetype, bucket, nomeArquivo);
  }

  await garantirDiretorioDeUpload();
  await writeFile(join(uploadDir, nomeArquivo), conteudo);
  return `${PREFIXO_PUBLICO}/${nomeArquivo}`;
}

/**
 * Remove um arquivo. Detecta automaticamente se é URL do Supabase ou local.
 */
export async function removerArquivoPublico(url: string | null | undefined): Promise<void> {
  if (!url) return;

  if (supabaseAdmin && url.includes('.supabase.co/storage/')) {
    try {
      const match = url.match(/\/object\/public\/([^/]+)\/(.+)$/);
      if (match) {
        const [, bucket, caminho] = match;
        if (bucket && caminho) {
          await supabaseAdmin.storage.from(bucket).remove([caminho]);
        }
      }
    } catch {
      // silent
    }
    return;
  }

  if (!url.startsWith(`${PREFIXO_PUBLICO}/`)) return;
  try {
    await unlink(join(uploadDir, basename(url)));
  } catch {
    // arquivo ja removido ou inexistente
  }
}
