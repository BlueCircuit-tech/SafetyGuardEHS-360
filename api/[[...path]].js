// Handler serverless da Vercel — encapsula a app Fastify compilada.
//
// O nome `[[...path]].js` e uma rota catch-all opcional: a Vercel entrega a
// esta funcao tudo sob /api (inclusive /api/v1/...), preservando a URL
// original em req.url. Isso importa porque as rotas do Fastify vivem em
// /api/v1/* — um rewrite comum reescreveria o caminho para /api e o Fastify
// devolveria 404 para todas elas.
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
