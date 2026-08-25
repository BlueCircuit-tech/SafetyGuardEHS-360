// Handler serverless da Vercel — encapsula a app Fastify compilada.
//
// A Vercel so detecta funcoes na pasta `api/` da raiz do projeto, por isso
// este arquivo mora aqui e importa o build de apps/api/dist (gerado pelo
// `npm run build` da raiz antes das funcoes serem empacotadas).
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
