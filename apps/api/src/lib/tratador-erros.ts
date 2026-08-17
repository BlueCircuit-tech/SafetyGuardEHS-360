import { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { ErroApp } from './erros.js';
import { isProducao } from '../env.js';

/** Formato unico de erro devolvido pela API. */
export interface RespostaErro {
  erro: {
    codigo: string;
    mensagem: string;
    /** Mensagens por campo — consumido direto pelo formulario do front. */
    campos?: Record<string, string[]>;
    detalhes?: unknown;
  };
}

/** Converte um ZodError no mapa campo -> mensagens usado pelo formulario. */
export function camposDoZodError(erro: ZodError): Record<string, string[]> {
  const campos: Record<string, string[]> = {};
  for (const issue of erro.issues) {
    const chave = issue.path.length > 0 ? issue.path.join('.') : '_';
    (campos[chave] ??= []).push(issue.message);
  }
  return campos;
}

export function registrarTratadorDeErros(app: FastifyInstance): void {
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send({
      erro: {
        codigo: 'ROTA_NAO_ENCONTRADA',
        mensagem: `Rota ${request.method} ${request.url} nao existe.`,
      },
    } satisfies RespostaErro);
  });

  app.setErrorHandler((erro, request, reply) => {
    if (erro instanceof ZodError) {
      return reply.status(422).send({
        erro: {
          codigo: 'VALIDACAO',
          mensagem: 'Os dados enviados nao passaram na validacao.',
          campos: camposDoZodError(erro),
        },
      } satisfies RespostaErro);
    }

    if (erro instanceof ErroApp) {
      return reply.status(erro.status).send({
        erro: { codigo: erro.codigo, mensagem: erro.message, campos: erro.campos, detalhes: erro.detalhes },
      } satisfies RespostaErro);
    }

    if (erro instanceof Prisma.PrismaClientKnownRequestError) {
      if (erro.code === 'P2002') {
        const alvo = Array.isArray(erro.meta?.target) ? (erro.meta.target as string[]).join(', ') : 'registro';
        return reply.status(409).send({
          erro: { codigo: 'DUPLICADO', mensagem: `Ja existe um registro com este ${alvo}.` },
        } satisfies RespostaErro);
      }
      if (erro.code === 'P2025') {
        return reply.status(404).send({
          erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Recurso nao encontrado.' },
        } satisfies RespostaErro);
      }
    }

    // Erros de payload do Fastify (JSON malformado, limite de upload, ...).
    const erroFastify = erro as { statusCode?: number; code?: string; message?: string };
    const statusFastify = typeof erroFastify.statusCode === 'number' ? erroFastify.statusCode : 0;
    if (statusFastify >= 400 && statusFastify < 500) {
      return reply.status(statusFastify).send({
        erro: {
          codigo: erroFastify.code ?? 'REQUISICAO_INVALIDA',
          mensagem: erroFastify.message ?? 'Requisicao invalida.',
        },
      } satisfies RespostaErro);
    }

    request.log.error({ err: erro }, 'Erro nao tratado');
    return reply.status(500).send({
      erro: {
        codigo: 'ERRO_INTERNO',
        mensagem: 'Erro interno no servidor.',
        detalhes: isProducao ? undefined : erroFastify.message,
      },
    } satisfies RespostaErro);
  });
}
