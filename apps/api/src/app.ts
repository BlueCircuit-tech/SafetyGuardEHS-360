import type { IncomingMessage, ServerResponse } from 'node:http';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import estaticos from '@fastify/static';
import { APP_NOME } from '@safetyguard/shared';
import { env, isProducao, origemPermitida, uploadDir, uploadMaxBytes } from './env.js';
import { garantirDiretorioDeUpload, PREFIXO_PUBLICO } from './lib/arquivos.js';
import { registrarTratadorDeErros } from './lib/tratador-erros.js';
import { registrarAutenticacao, registrarEscopoNaResposta } from './lib/autenticacao.js';
import { rotasEmpresa } from './modules/empresa/empresa.routes.js';
import { rotasClientes } from './modules/clientes/cliente.routes.js';
import { rotasTerceiros } from './modules/terceiros/terceiro.routes.js';
import { rotasCentros } from './modules/centros/centro.routes.js';
import { rotasAreas } from './modules/areas/area.routes.js';
import { rotasObservacoes } from './modules/observacoes/observacao.routes.js';
import { rotasPlanos } from './modules/planos/plano.routes.js';
import { registrarRotasSaude as rotasSaude } from './modules/saude/saude.routes.js';
import { registrarRotasDashboards as rotasDashboards } from './modules/dashboards/dashboard.routes.js';
import { registrarRotasTreinamentos as rotasTreinamentos } from './modules/treinamentos/treinamento.routes.js';
import { registrarRotasAuditorias as rotasAuditorias } from './modules/auditorias/auditoria.routes.js';
import { registrarRotasDds as rotasDds } from './modules/dds/dds.routes.js';
import { registrarRotasEpi as rotasEpi } from './modules/epi/epi.routes.js';
import { registrarRotasConsequencias as rotasConsequencias } from './modules/consequencias/consequencia.routes.js';
import { registrarRotasMeioAmbiente as rotasMeioAmbiente } from './modules/meio-ambiente/meio-ambiente.routes.js';
import { registrarRotasInteligencia as rotasInteligencia } from './modules/inteligencia/inteligencia.routes.js';
import { registrarRotasAcidentes as rotasAcidentes } from './modules/acidentes/acidente.routes.js';
import { registrarRotasRiscos as rotasRiscos } from './modules/riscos/risco.routes.js';
import { rotasUsuarios } from './modules/usuarios/usuario.routes.js';
import { rotasReferencias } from './modules/referencias/referencias.routes.js';
import { registrarRotasFinanceiro as rotasFinanceiro } from './modules/financeiro/financeiro.routes.js';
import { prisma } from './db.js';

export const PREFIXO_API = '/api/v1';

export async function criarApp(): Promise<FastifyInstance> {
  const loggerConfig = isProducao || Boolean(process.env.VERCEL)
    ? { level: 'info' }
    : { level: 'info', transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } };

  const app = Fastify({
    logger: loggerConfig,
    bodyLimit: uploadMaxBytes + 1024 * 1024,
  });

  /*
   * Sem `origin` (ferramentas de linha de comando, health checks) nao ha o que
   * proteger — a politica de CORS so vale para requisicoes vindas de um site.
   */
  await app.register(cors, {
    origin: (origem, cb) => cb(null, !origem || origemPermitida(origem)),
    credentials: true,
  });
  await app.register(multipart, { limits: { fileSize: uploadMaxBytes, files: 1 } });

  /*
   * Na Vercel o filesystem e read-only e efemero: nao ha diretorio de uploads
   * para servir, e os arquivos vao para o Supabase Storage (URLs absolutas).
   * Fora dela, o diretorio local continua sendo servido em /arquivos.
   */
  if (!process.env.VERCEL) {
    await garantirDiretorioDeUpload();
    await app.register(estaticos, { root: uploadDir, prefix: `${PREFIXO_PUBLICO}/`, decorateReply: false });
  }

  await registrarAutenticacao(app);
  registrarEscopoNaResposta(app);
  registrarTratadorDeErros(app);

  app.get('/', async () => ({
    status: 'ok',
    app: APP_NOME,
    ambiente: env.NODE_ENV,
    api: `${PREFIXO_API}`,
    health: `${PREFIXO_API}/health`,
  }));

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
      // Login e catalogo de perfis sao publicos; /usuarios se protege por dentro.
      await api.register(rotasUsuarios);
      await api.register(rotasEmpresa);
      await api.register(rotasCentros);
      await api.register(rotasClientes);
      await api.register(rotasTerceiros);
      await api.register(rotasAreas);
      await api.register(rotasObservacoes);
      await api.register(rotasPlanos);
      await api.register(rotasSaude);
      await api.register(rotasDashboards);
      await api.register(rotasTreinamentos);
      await api.register(rotasAuditorias);
      await api.register(rotasDds);
      await api.register(rotasEpi);
      await api.register(rotasConsequencias);
      await api.register(rotasMeioAmbiente);
      await api.register(rotasInteligencia);
      await api.register(rotasAcidentes);
      await api.register(rotasRiscos);
      await api.register(rotasFinanceiro);
      await api.register(async (referencias) => {
        referencias.addHook('preHandler', app.autenticar);
        await referencias.register(rotasReferencias);
      });
    },
    { prefix: PREFIXO_API },
  );

  return app;
}

export default async function appHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await criarApp();
  await app.ready();
  app.server.emit('request', req, res);
}
