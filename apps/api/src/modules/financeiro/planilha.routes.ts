import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  lancamentoCreateSchema,
  lancamentoFiltroSchema,
  lancamentoUpdateSchema,
  resumoFinanceiroFiltroSchema,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { NaoEncontrado } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria } from '../../lib/auditoria.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';
import {
  INCLUIR_VINCULOS,
  calcularResumo,
  gerarPlanilhaExcel,
  listarLancamentos,
  serializarLancamento,
} from './planilha.service.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Confere que cliente e fornecedor informados existem — 404 com o campo apontado. */
async function validarVinculos(dados: { clienteId?: string | null; fornecedorId?: string | null }): Promise<void> {
  if (dados.clienteId) {
    const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true } });
    if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');
  }
  if (dados.fornecedorId) {
    const fornecedor = await prisma.fornecedor.findUnique({ where: { id: dados.fornecedorId }, select: { id: true } });
    if (!fornecedor) throw new NaoEncontrado('Fornecedor nao encontrado.', 'FORNECEDOR_NAO_ENCONTRADO');
  }
}

/**
 * Etapa 24 — Planilha financeira (lancamentos).
 *
 * Leitura com `indicadores:ler` (quem ve o painel financeiro ve a planilha);
 * escrita com `cadastros:escrever`. O modulo `financeiro.routes.ts` (custos de
 * acidentes) segue intacto — este arquivo cuida so das receitas e despesas.
 */
export async function registrarRotasPlanilhaFinanceira(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'indicadores:ler', escrita: 'cadastros:escrever' }));

  app.get('/financeiro/lancamentos', async (request) => {
    const filtro = lancamentoFiltroSchema.parse(request.query);
    return listarLancamentos(filtro);
  });

  app.get('/financeiro/lancamentos/resumo', async (request) => {
    const { ano, clienteId } = resumoFinanceiroFiltroSchema.parse(request.query);
    return calcularResumo(ano ?? new Date().getFullYear(), clienteId);
  });

  app.get('/financeiro/lancamentos/planilha.xlsx', async (request, reply) => {
    const { ano: anoPedido, clienteId } = resumoFinanceiroFiltroSchema.parse(request.query);
    const ano = anoPedido ?? new Date().getFullYear();

    const workbook = await gerarPlanilhaExcel(ano, clienteId);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    reply.header('Content-Type', MIME_XLSX);
    reply.header('Content-Disposition', `attachment; filename="planilha-financeira-${ano}.xlsx"`);
    return reply.send(buffer);
  });

  app.post('/financeiro/lancamentos', async (request, reply) => {
    const dados = lancamentoCreateSchema.parse(request.body);
    await validarVinculos(dados);

    const lancamento = await prisma.$transaction(async (tx) => {
      const criado = await tx.lancamentoFinanceiro.create({
        data: dados as Prisma.LancamentoFinanceiroUncheckedCreateInput,
        include: INCLUIR_VINCULOS,
      });
      await registrarAuditoria(tx, {
        entidade: 'LancamentoFinanceiro',
        entidadeId: criado.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, dados as unknown as Record<string, unknown>),
        contexto: contextoDeAuditoria(request),
      });
      return criado;
    });

    return reply.status(201).send(serializarLancamento(lancamento));
  });

  app.put('/financeiro/lancamentos/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = lancamentoUpdateSchema.parse(request.body);

    const atual = await prisma.lancamentoFinanceiro.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado('Lancamento nao encontrado.', 'LANCAMENTO_NAO_ENCONTRADO');
    await validarVinculos(dados);

    const lancamento = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.lancamentoFinanceiro.update({
        where: { id },
        data: dados as Prisma.LancamentoFinanceiroUncheckedUpdateInput,
        include: INCLUIR_VINCULOS,
      });
      const diferenca = calcularDiferenca(
        { ...atual, valor: Number(atual.valor) } as unknown as Record<string, unknown>,
        { ...atualizado, valor: Number(atualizado.valor), cliente: undefined, fornecedor: undefined } as unknown as Record<string, unknown>,
      );
      if (Object.keys(diferenca).length > 0) {
        await registrarAuditoria(tx, {
          entidade: 'LancamentoFinanceiro',
          entidadeId: id,
          acao: 'ATUALIZACAO',
          alteracoes: diferenca,
          contexto: contextoDeAuditoria(request),
        });
      }
      return atualizado;
    });

    return serializarLancamento(lancamento);
  });

  app.delete('/financeiro/lancamentos/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);

    const atual = await prisma.lancamentoFinanceiro.findUnique({ where: { id } });
    if (!atual) throw new NaoEncontrado('Lancamento nao encontrado.', 'LANCAMENTO_NAO_ENCONTRADO');

    await prisma.$transaction(async (tx) => {
      await tx.lancamentoFinanceiro.delete({ where: { id } });
      await registrarAuditoria(tx, {
        entidade: 'LancamentoFinanceiro',
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: {
          descricao: { de: atual.descricao, para: null },
          valor: { de: Number(atual.valor), para: null },
        },
        contexto: contextoDeAuditoria(request),
      });
    });

    return reply.status(204).send();
  });
}
