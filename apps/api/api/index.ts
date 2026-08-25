// Serverless handler para Vercel — wrapper do Fastify
// https://fastify.io/docs/latest/Guides/Serverless/

import type { FastifyInstance } from 'fastify';
import { criarApp } from '../src/app.js';

let app: FastifyInstance | null = null;

export default async (req: any, res: any) => {
  if (!app) {
    app = await criarApp();
    await app.ready();
  }

  // Delegar para o servidor interno do Fastify
  app.server.emit('request', req, res);
};
