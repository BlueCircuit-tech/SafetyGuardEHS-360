// Handler serverless da Vercel — encapsula a app Fastify compilada.
//
// O rewrite de /api/(.*) no vercel.json aponta para esta funcao. A Vercel
// preserva a URL original em req.url ao aplicar o rewrite, entao o Fastify
// continua enxergando /api/v1/... e casa suas rotas normalmente.
//
// A instancia do Fastify e reaproveitada entre invocacoes na mesma instancia
// quente do lambda, evitando recriar o pool do Prisma a cada requisicao.

import { criarApp } from '../apps/api/dist/app.js';

let appPromise = null;

function obterApp() {
  if (!appPromise) {
    appPromise = criarApp().then(async (app) => {
      await app.ready();
      return app;
    });
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await obterApp();
  app.server.emit('request', req, res);
}
