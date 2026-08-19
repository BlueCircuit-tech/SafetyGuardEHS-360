import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { painelExecutivo, painelGerencial, painelOperacional } from './dashboard.service.js';
import { mapaDeCalorPorPlanta, benchmarkSupervisores } from './mapa.service.js';
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

  /**
   * Mapa de calor por planta (§22): retorna as áreas com coordenadas e os
   * indicadores de desvio para renderizar pontos coloridos sobre a imagem.
   */
  app.get('/dashboards/mapa-planta', async (request) => {
    const { clienteId, meses } = z
      .object({ clienteId: z.string().uuid(), meses: z.coerce.number().int().min(1).max(24).default(3) })
      .parse(request.query);
    return mapaDeCalorPorPlanta(clienteId, meses);
  });

  /**
   * Benchmark supervisor×supervisor (§27): compara responsáveis de área
   * por volume de desvios, conformidade e planos em aberto.
   */
  app.get('/dashboards/supervisores', async (request) => {
    const { clienteId, meses } = z
      .object({ clienteId: z.string().uuid().optional(), meses: z.coerce.number().int().min(1).max(24).default(3) })
      .parse(request.query);
    return benchmarkSupervisores(clienteId, meses);
  });
}
