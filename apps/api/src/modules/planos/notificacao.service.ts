import type { CanalNotificacao, Prisma, PrismaClient } from '@prisma/client';
import {
  montarCabecalhoInstitucional,
  montarMensagensAlerta,
  type NivelHierarquia,
  type NotificacaoFiltro,
  type RegraComunicacao,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { obterEmpresaOuFalhar } from '../empresa/empresa.service.js';

type ClientePrisma = PrismaClient | Prisma.TransactionClient;

/**
 * Geracao e registro de notificacoes.
 *
 * O conteudo vem de `montarMensagensAlerta` (pacote compartilhado); aqui so
 * persistimos o que foi montado. Enquanto nao ha provedor de e-mail/WhatsApp,
 * o status e `SIMULADA` — a mensagem fica registrada e auditavel, e trocar
 * para `ENVIADA` sera so plugar o transporte.
 */

export interface ContextoNotificacao {
  clienteId: string;
  planoAcaoId?: string | null;
  observacaoId?: string | null;
  cliente: string;
  terceiro?: string | null;
  area: string;
  local?: string | null;
  classificacao: string;
  grauRisco: string;
  tipo: string;
  descricao: string;
  responsavel: string;
  dataHora: Date;
  regra: RegraComunicacao;
  prazoLimite?: Date | null;
  nivelAcionado?: NivelHierarquia | null;
  nivelEscalonamento?: number;
  codigoPlano?: string | null;
}

/**
 * Monta e registra as notificacoes de uma ocorrencia, respeitando os canais
 * definidos pela matriz. WhatsApp opcional gera registro (para o gestor decidir
 * enviar); WhatsApp `NAO` nao gera.
 */
export async function registrarNotificacoes(
  db: ClientePrisma,
  contexto: ContextoNotificacao,
): Promise<{ canais: CanalNotificacao[] }> {
  const empresa = await obterEmpresaOuFalhar();
  const cabecalho = montarCabecalhoInstitucional(empresa);

  const mensagens = montarMensagensAlerta({
    cabecalho,
    cliente: contexto.cliente,
    terceiro: contexto.terceiro,
    area: contexto.area,
    local: contexto.local,
    classificacao: contexto.classificacao,
    grauRisco: contexto.grauRisco,
    tipo: contexto.tipo,
    descricao: contexto.descricao,
    responsavel: contexto.responsavel,
    dataHora: contexto.dataHora,
    regra: contexto.regra,
    prazoLimite: contexto.prazoLimite,
    nivelAcionado: contexto.nivelAcionado,
    codigoPlano: contexto.codigoPlano,
  });

  const base = {
    clienteId: contexto.clienteId,
    planoAcaoId: contexto.planoAcaoId ?? null,
    observacaoId: contexto.observacaoId ?? null,
    destinatarios: contexto.regra.destinatarios.join(','),
    nivelEscalonamento: contexto.nivelEscalonamento ?? 0,
    // Sem provedor configurado: fica registrada, nao enviada.
    status: 'SIMULADA' as const,
  };

  const canais: CanalNotificacao[] = [];

  if (contexto.regra.email) {
    await db.notificacao.create({
      data: { ...base, canal: 'EMAIL', assunto: mensagens.emailAssunto, corpo: mensagens.emailCorpo },
    });
    canais.push('EMAIL');
  }

  if (contexto.regra.whatsapp !== 'NAO') {
    await db.notificacao.create({
      data: { ...base, canal: 'WHATSAPP', assunto: null, corpo: mensagens.whatsapp },
    });
    canais.push('WHATSAPP');
  }

  return { canais };
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                     */
/* -------------------------------------------------------------------------- */

export async function listarNotificacoes(filtro: NotificacaoFiltro) {
  const empresa = await obterEmpresaOuFalhar();

  const where: Prisma.NotificacaoWhereInput = { cliente: { empresaId: empresa.id } };
  if (filtro.clienteId) where.clienteId = filtro.clienteId;
  if (filtro.planoAcaoId) where.planoAcaoId = filtro.planoAcaoId;
  if (filtro.observacaoId) where.observacaoId = filtro.observacaoId;
  if (filtro.canal) where.canal = filtro.canal;
  if (filtro.status) where.status = filtro.status;

  const [total, itens] = await prisma.$transaction([
    prisma.notificacao.count({ where }),
    prisma.notificacao.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip: (filtro.pagina - 1) * filtro.porPagina,
      take: filtro.porPagina,
      include: {
        planoAcao: { select: { id: true, codigo: true, acao: true, status: true } },
        cliente: { select: { id: true, nomeFantasia: true } },
      },
    }),
  ]);

  return {
    itens,
    total,
    pagina: filtro.pagina,
    porPagina: filtro.porPagina,
    totalPaginas: Math.max(1, Math.ceil(total / filtro.porPagina)),
  };
}

/** Painel de comunicação: quantos alertas, por canal e por situação. */
export async function resumoNotificacoes(clienteId?: string) {
  const empresa = await obterEmpresaOuFalhar();
  const base: Prisma.NotificacaoWhereInput = {
    cliente: { empresaId: empresa.id },
    ...(clienteId ? { clienteId } : {}),
  };

  const [total, email, whatsapp, simuladas, enviadas, falhas, escalonamentos] = await prisma.$transaction([
    prisma.notificacao.count({ where: base }),
    prisma.notificacao.count({ where: { ...base, canal: 'EMAIL' } }),
    prisma.notificacao.count({ where: { ...base, canal: 'WHATSAPP' } }),
    prisma.notificacao.count({ where: { ...base, status: 'SIMULADA' } }),
    prisma.notificacao.count({ where: { ...base, status: 'ENVIADA' } }),
    prisma.notificacao.count({ where: { ...base, status: 'FALHOU' } }),
    prisma.notificacao.count({ where: { ...base, nivelEscalonamento: { gt: 0 } } }),
  ]);

  return { total, email, whatsapp, simuladas, enviadas, falhas, porEscalonamento: escalonamentos };
}
