// Handler serverless da Vercel — encapsula a app Fastify compilada.
//
// O nome `[...path].js` e a rota catch-all das Vercel Functions: tudo sob
// /api (inclusive /api/v1/...) chega a esta funcao com a URL original
// preservada em req.url. Isso importa porque as rotas do Fastify vivem em
// /api/v1/* — um rewrite comum reescreveria o caminho e o Fastify devolveria
// 404 para todas elas.
//
// Nao usar `[[...path]]` aqui: a forma com colchetes duplos e do Next.js e a
// Vercel a trata como nome literal, deixando a funcao inalcancavel.
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
