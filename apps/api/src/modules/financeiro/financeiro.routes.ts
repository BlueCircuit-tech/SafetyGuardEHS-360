import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { guardaPorMetodo } from '../../lib/guarda.js';
import { calcularIndicadores, obterParametros, salvarParametros } from './financeiro.service.js';

const parametrosSchema = z.object({
  clienteId: z.string().uuid().optional().nullable(),
  custoAcidenteComAfastamento: z.number().positive().default(50000),
  custoAcidenteSemAfastamento: z.number().positive().default(5000),
  custoDiaAfastamento: z.number().positive().default(300),
  custoHoraParadaProducao: z.number().positive().default(2000),
  custoMultaNrMedia: z.number().positive().default(20000),
  fatorPreventivoBbs: z.number().min(0).max(1).default(0.3),
  valorContratoMensal: z.number().positive().nullable().optional().default(null),
});

export async function registrarRotasFinanceiro(app: FastifyInstance): Promise<void> {
  app.addHook(
    'preHandler',
    guardaPorMetodo(app, {
      leitura: 'indicadores:ler',
      escrita: 'indicadores:ler',
    }),
  );

  /** Parâmetros de custo configuráveis por cliente. */
  app.get('/financeiro/parametros', async (request) => {
    const { clienteId } = z
      .object({ clienteId: z.string().uuid().optional() })
      .parse(request.query);
    return obterParametros(clienteId);
  });

  app.put('/financeiro/parametros', async (request) => {
    const dados = parametrosSchema.parse(request.body);
    return salvarParametros(dados);
  });

  /** Indicadores financeiros calculados do período. */
  app.get('/financeiro/indicadores', async (request) => {
    const { clienteId, meses } = z
      .object({
        clienteId: z.string().uuid().optional(),
        meses: z.coerce.number().int().min(1).max(36).default(12),
      })
      .parse(request.query);
    return calcularIndicadores(clienteId, meses);
  });
}
