import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { gerarAnalises } from './inteligencia.service.js';
import { guardaPorMetodo } from '../../lib/guarda.js';

/**
 * Etapa 17 — SafetyGuard Intelligence.
 * Leitura consolidada de indicadores: exige `indicadores:ler`.
 */
export async function registrarRotasInteligencia(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'indicadores:ler', escrita: 'indicadores:ler' }));

  app.get('/inteligencia', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    return gerarAnalises(clienteId);
  });
}
