import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ROTULO_SITUACAO_AUDITORIA,
  ROTULO_TIPO_AUDITORIA,
  auditoriaCreateSchema,
  auditoriaFiltroSchema,
  auditoriaUpdateSchema,
  type SituacaoAuditoria,
  type TipoAuditoria,
} from '@safetyguard/shared';
import {
  atualizarAuditoria,
  criarAuditoria,
  excluirAuditoria,
  listarAuditorias,
  obterAuditoriaOuFalhar,
  resumoAuditorias,
} from './auditoria.service.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });

/** Etapa 12 — Auditorias. Cadastro comum: `cadastros:ler` / `cadastros:escrever`. */
export async function registrarRotasAuditorias(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'cadastros:ler', escrita: 'cadastros:escrever' }));

  app.get('/auditorias', async (request) => {
    const filtro = auditoriaFiltroSchema.parse(request.query);
    const itens = await listarAuditorias(filtro);

    return itens.map((auditoria) => ({
      ...auditoria,
      rotulos: {
        tipo: ROTULO_TIPO_AUDITORIA[auditoria.tipo as TipoAuditoria],
        situacao: ROTULO_SITUACAO_AUDITORIA[auditoria.situacao as SituacaoAuditoria],
      },
    }));
  });

  app.get('/auditorias/resumo', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    return resumoAuditorias(clienteId);
  });

  app.get('/auditorias/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return obterAuditoriaOuFalhar(id);
  });

  app.post('/auditorias', async (request, reply) => {
    const dados = auditoriaCreateSchema.parse(request.body);
    return reply.status(201).send(await criarAuditoria(dados, contextoDeAuditoria(request)));
  });

  app.put('/auditorias/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = auditoriaUpdateSchema.parse(request.body);
    return atualizarAuditoria(id, dados, contextoDeAuditoria(request));
  });

  app.delete('/auditorias/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await excluirAuditoria(id, contextoDeAuditoria(request));
    return reply.status(204).send();
  });
}
