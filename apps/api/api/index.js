// Handler serverless da Vercel — encapsula a app Fastify compilada.
//
// Este projeto na Vercel tem Root Directory = apps/api, entao esta pasta `api/`
// e a que a Vercel varre em busca de funcoes. O rewrite do vercel.json manda
// todo o trafego para ca preservando a URL original em req.url, e o Fastify
// casa suas proprias rotas (/, /health, /api/v1/...) normalmente.
//
// A instancia do Fastify e reaproveitada entre invocacoes na mesma instancia
// quente do lambda, evitando recriar o pool do Prisma a cada requisicao.

import { criarApp } from '../dist/app.js';

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
