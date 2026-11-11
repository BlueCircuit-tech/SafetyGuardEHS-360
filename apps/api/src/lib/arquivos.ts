import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { uploadDir } from '../env.js';
import { ErroApp, RequisicaoInvalida } from './erros.js';
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
  const { data: lista, error: erroLista } = await supabaseAdmin.storage.listBuckets();
  if (erroLista) {
    throw new ErroApp(`Armazenamento indisponivel: ${erroLista.message}`, { status: 503, codigo: 'STORAGE_INDISPONIVEL' });
  }
  if (!lista?.find((b) => b.name === nome)) {
    const { error } = await supabaseAdmin.storage.createBucket(nome, { public: true });
    // Outro processo pode ter criado o bucket entre a listagem e a criacao.
    if (error && !/already exists/i.test(error.message)) {
      throw new ErroApp(`Nao foi possivel preparar o armazenamento "${nome}": ${error.message}`, {
        status: 503,
        codigo: 'STORAGE_INDISPONIVEL',
      });
    }
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
  if (error) {
    throw new ErroApp(`Falha ao gravar o arquivo no armazenamento: ${error.message}`, {
      status: 502,
      codigo: 'STORAGE_FALHOU',
    });
  }
  const { data } = supabaseAdmin!.storage.from(bucket).getPublicUrl(nomeArquivo);
  return data.publicUrl;
}

/**
 * Na Vercel o disco e efemero e nao e servido: um arquivo gravado em /tmp
 * "salva" mas a URL devolvida nunca abre — era o simbolo de imagem quebrada
 * que a operacao via nas evidencias. Sem Supabase configurado, e melhor
 * recusar o upload com uma mensagem clara do que fingir que deu certo.
 */
function exigirArmazenamentoPersistente(): void {
  if (process.env.VERCEL && !supabaseAdmin) {
    throw new ErroApp(
      'Armazenamento de arquivos nao configurado neste ambiente (defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY).',
      { status: 503, codigo: 'STORAGE_NAO_CONFIGURADO' },
    );
  }
}

export async function garantirDiretorioDeUpload(): Promise<void> {
  try {
    await mkdir(uploadDir, { recursive: true });
  } catch {
    if (process.env.VERCEL) {
      await mkdir('/tmp/uploads', { recursive: true });
      return;
    }
    throw new Error(`Nao foi possivel criar o diretorio de upload em ${uploadDir}`);
  }
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

  exigirArmazenamentoPersistente();
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

  exigirArmazenamentoPersistente();
  await garantirDiretorioDeUpload();
  await writeFile(join(uploadDir, nomeArquivo), conteudo);
  return `${PREFIXO_PUBLICO}/${nomeArquivo}`;
}

/**
 * Le os bytes de um arquivo gravado (local ou Supabase). Devolve null quando
 * nao ha URL ou o arquivo nao pode ser lido — quem verifica carimbo decide o
 * que fazer sem a imagem.
 */
export async function lerArquivoPublico(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    if (/^https?:\/\//i.test(url)) {
      const resposta = await fetch(url);
      if (!resposta.ok) return null;
      return Buffer.from(await resposta.arrayBuffer());
    }
    if (!url.startsWith(`${PREFIXO_PUBLICO}/`)) return null;
    return await readFile(join(uploadDir, basename(url)));
  } catch {
    return null;
  }
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
