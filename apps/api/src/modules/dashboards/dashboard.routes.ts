import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { painelExecutivo, painelGerencial, painelOperacional } from './dashboard.service.js';
import { guardaPorMetodo } from '../../lib/guarda.js';

const filtroSchema = z.object({
  clienteId: z.string().uuid('Cliente invalido.').optional(),
  centroNegocioId: z.string().uuid('Centro de negocio invalido.').optional(),
  meses: z.coerce.number().int().min(1).max(36).optional(),
});

/**
 * Etapa 10 — dashboards consolidados.
 *
 * Tres recortes da mesma base. O operacional exige apenas `planos:ler`: quem
 * trabalha em campo precisa da fila do dia, mas nao necessariamente das notas
 * consolidadas da diretoria.
 */
export async function registrarRotasDashboards(app: FastifyInstance): Promise<void> {
  app.addHook(
    'preHandler',
    guardaPorMetodo(app, {
      leitura: 'indicadores:ler',
      escrita: 'indicadores:ler',
      excecoes: { '/api/v1/dashboards/operacional': 'planos:ler' },
    }),
  );

  app.get('/dashboards/executivo', async (request) => painelExecutivo(filtroSchema.parse(request.query)));

  app.get('/dashboards/gerencial', async (request) => painelGerencial(filtroSchema.parse(request.query)));

  app.get('/dashboards/operacional', async (request) => painelOperacional(filtroSchema.parse(request.query)));
}
