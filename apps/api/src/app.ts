import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import estaticos from '@fastify/static';
import { APP_NOME } from '@safetyguard/shared';
import { corsOrigins, env, isProducao, uploadDir, uploadMaxBytes } from './env.js';
import { garantirDiretorioDeUpload, PREFIXO_PUBLICO } from './lib/arquivos.js';
import { registrarTratadorDeErros } from './lib/tratador-erros.js';
import { rotasEmpresa } from './modules/empresa/empresa.routes.js';
import { rotasClientes } from './modules/clientes/cliente.routes.js';
import { rotasTerceiros } from './modules/terceiros/terceiro.routes.js';
import { rotasReferencias } from './modules/referencias/referencias.routes.js';
import { prisma } from './db.js';

export const PREFIXO_API = '/api/v1';

export async function criarApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: isProducao
      ? { level: 'info' }
      : { level: 'info', transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } },
    bodyLimit: uploadMaxBytes + 1024 * 1024,
  });

  await app.register(cors, { origin: corsOrigins, credentials: true });
  await app.register(multipart, { limits: { fileSize: uploadMaxBytes, files: 1 } });

  await garantirDiretorioDeUpload();
  await app.register(estaticos, { root: uploadDir, prefix: `${PREFIXO_PUBLICO}/`, decorateReply: false });

  registrarTratadorDeErros(app);

  app.get('/health', async () => {
    let banco = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      banco = 'indisponivel';
    }
    return { status: banco === 'ok' ? 'ok' : 'degradado', app: APP_NOME, ambiente: env.NODE_ENV, banco };
  });

  await app.register(
    async (api) => {
      await api.register(rotasEmpresa);
      await api.register(rotasClientes);
      await api.register(rotasTerceiros);
      await api.register(rotasReferencias);
    },
    { prefix: PREFIXO_API },
  );

  return app;
}
