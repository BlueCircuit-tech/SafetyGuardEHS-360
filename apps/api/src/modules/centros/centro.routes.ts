import type { FastifyInstance } from 'fastify';
import type { CentroNegocio } from '@prisma/client';
import { z } from 'zod';
import {
  centroNegocioCreateSchema,
  centroNegocioFiltroSchema,
  centroNegocioUpdateSchema,
  formatarTelefone,
} from '@safetyguard/shared';
import {
  atualizarCentro,
  consolidadoPorCentro,
  criarCentro,
  excluirCentro,
  listarAuditoriaCentro,
  listarCentros,
  listarOpcoesCentros,
  obterCentroOuFalhar,
  resumoCentros,
  vincularClientes,
} from './centro.service.js';
import { RequisicaoInvalida } from '../../lib/erros.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador de centro invalido.') });

/** Prisma devolve `_count` quando o include pede — tipado aqui para a serializacao. */
type CentroComContagem = CentroNegocio & { _count?: { clientes: number } };

function serializar(centro: CentroComContagem) {
  return {
    ...centro,
    metaIndiceGlobal: Number(centro.metaIndiceGlobal),
    quantidadeClientes: centro._count?.clientes ?? 0,
    formatado: {
      responsavelTelefone: centro.responsavelTelefone ? formatarTelefone(centro.responsavelTelefone) : null,
      responsavelWhatsapp: centro.responsavelWhatsapp ? formatarTelefone(centro.responsavelWhatsapp) : null,
    },
  };
}

export async function rotasCentros(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'cadastros:ler', escrita: 'cadastros:escrever' }));

  app.get('/centros-negocio/resumo', async () => resumoCentros());

  /** Comparativo entre centros — base do filtro e do ranking por centro. */
  app.get('/centros-negocio/consolidado', async () => consolidadoPorCentro());

  app.get('/centros-negocio/opcoes', async (request) => {
    const { incluirInativos } = z
      .object({ incluirInativos: z.enum(['true', 'false']).default('false') })
      .parse(request.query);
    return listarOpcoesCentros(incluirInativos === 'false');
  });

  app.get('/centros-negocio', async (request) => {
    const filtro = centroNegocioFiltroSchema.parse(request.query);
    const pagina = await listarCentros(filtro);
    return { ...pagina, itens: pagina.itens.map(serializar) };
  });

  app.get('/centros-negocio/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return serializar(await obterCentroOuFalhar(id));
  });

  app.post('/centros-negocio', async (request, reply) => {
    const dados = centroNegocioCreateSchema.parse(request.body);
    const centro = await criarCentro(dados, contextoDeAuditoria(request));
    return reply.status(201).send(serializar(centro));
  });

  app.put('/centros-negocio/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = centroNegocioUpdateSchema.parse(request.body);

    if (Object.keys(dados).length === 0) {
      throw new RequisicaoInvalida('Nenhum campo enviado para atualizacao.', 'PAYLOAD_VAZIO');
    }

    return serializar(await atualizarCentro(id, dados, contextoDeAuditoria(request)));
  });

  app.delete('/centros-negocio/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await excluirCentro(id, contextoDeAuditoria(request));
    return reply.status(204).send();
  });

  /** Vinculo em lote — organiza os clientes existentes de uma vez. */
  app.post('/centros-negocio/:id/clientes', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const { clienteIds } = z
      .object({ clienteIds: z.array(z.string().uuid('Cliente invalido.')).min(1, 'Informe ao menos um cliente.') })
      .parse(request.body);

    return vincularClientes(id, clienteIds, contextoDeAuditoria(request));
  });

  app.get('/centros-negocio/:id/auditoria', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const { limite } = z.object({ limite: z.coerce.number().int().min(1).max(200).default(50) }).parse(request.query);
    return listarAuditoriaCentro(id, limite);
  });
}
