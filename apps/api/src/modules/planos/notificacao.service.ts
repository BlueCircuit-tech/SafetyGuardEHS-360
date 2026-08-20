import type { CanalNotificacao, Prisma, PrismaClient } from '@prisma/client';
import {
  JANELA_AGRUPAMENTO_HORAS,
  canaisDoDisparo,
  deveAgrupar,
  montarCabecalhoInstitucional,
  montarMensagensAlerta,
  type NivelHierarquia,
  type NotificacaoFiltro,
  type RegraComunicacao,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { obterEmpresaOuFalhar } from '../empresa/empresa.service.js';
import { enviarEmail } from '../../lib/email.js';
import { env } from '../../env.js';

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
  /** Area e tipo da observacao de origem — base da regra de agrupamento. */
  areaId?: string | null;
  tipoObservacao?: string | null;
}

/**
 * Monta e registra as notificacoes de uma ocorrencia, respeitando os canais
 * definidos pela matriz. WhatsApp opcional gera registro (para o gestor decidir
 * enviar); WhatsApp `NAO` nao gera.
 */
export async function registrarNotificacoes(
  db: ClientePrisma,
  contexto: ContextoNotificacao,
): Promise<{ canais: CanalNotificacao[]; agrupada: boolean }> {
  const empresa = await obterEmpresaOuFalhar();
  const cabecalho = montarCabecalhoInstitucional(empresa);
  const agora = new Date();

  /*
   * Agrupamento (aba Parametros da matriz): acima de 5 ocorrencias na mesma
   * area/tipo em 1 hora, o disparo individual vira resumo agrupado. Vale so
   * para o aviso inicial — escalonamento e sempre individual, porque cobra um
   * plano especifico. Risco I nunca agrupa (a matriz o marca INDIVIDUAL).
   */
  let agrupada = false;
  const ehEscalonamento = (contexto.nivelEscalonamento ?? 0) > 0;

  if (!ehEscalonamento && contexto.regra.disparo !== 'INDIVIDUAL') {
    let naJanela = 0;

    if (contexto.regra.disparo === 'AGRUPAVEL' && contexto.areaId && contexto.tipoObservacao) {
      const inicioJanela = new Date(agora.getTime() - JANELA_AGRUPAMENTO_HORAS * 60 * 60 * 1000);
      naJanela = await db.observacao.count({
        where: {
          areaId: contexto.areaId,
          tipo: contexto.tipoObservacao as never,
          dataHora: { gte: inicioJanela },
        },
      });
    }

    agrupada = deveAgrupar(contexto.regra.disparo, naJanela);
  }

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
    prioridade: contexto.regra.prioridade,
    agrupada,
    // Declarado pela matriz; o disparo real do fallback exige provedor com
    // confirmacao de entrega, que ainda nao existe.
    canalFallback: contexto.regra.canalFallback,
    // Sem provedor configurado: fica registrada, nao enviada.
    status: 'SIMULADA' as const,
  };

  // Horario comercial: fora de 07:00-18:00/seg-sex, Risco I soma o canal de voz.
  const canais = canaisDoDisparo(contexto.regra, agora) as CanalNotificacao[];

  for (const canal of canais) {
    const corpo =
      canal === 'EMAIL'
        ? mensagens.emailCorpo
        : canal === 'WHATSAPP'
          ? mensagens.whatsapp
          : `[LIGACAO DE VOZ] Risco I fora do horario comercial. ${mensagens.emailAssunto}`;

    const notificacao = await db.notificacao.create({
      data: {
        ...base,
        canal,
        assunto: canal === 'EMAIL' ? mensagens.emailAssunto : null,
        corpo,
      },
    });

    if (canal === 'EMAIL' && mensagens.emailAssunto && mensagens.emailCorpo) {
      const destinatariosEmail = resolverDestinatariosEmail(
        contexto.regra.destinatarios,
        contexto,
      );
      if (destinatariosEmail.length > 0) {
        try {
          const enviado = await enviarEmail({
            para: destinatariosEmail,
            assunto: mensagens.emailAssunto,
            corpo: mensagens.emailCorpo,
          });
          if (enviado) {
            await prisma.notificacao.update({
              where: { id: notificacao.id },
              data: { status: 'ENVIADA' },
            });
          }
        } catch {
          await prisma.notificacao.update({
            where: { id: notificacao.id },
            data: { status: 'FALHOU' },
          });
        }
      }
    }
  }

  return { canais, agrupada };
}

/* -------------------------------------------------------------------------- */
/* Resolução de destinatários de e-mail                                       */
/* -------------------------------------------------------------------------- */

/**
 * Monta a lista de e-mails reais para o canal EMAIL.
 *
 * Estratégia (em ordem):
 * 1. E-mail do responsável pelo plano de ação (se houver)
 * 2. E-mail de cópia de monitoramento configurado em ALERTA_EMAIL_COPIA
 *
 * Os `destinatarios` da regra são nomes de papel (GESTOR_SST, DIRETOR…), não
 * e-mails. O mapeamento de papel→e-mail exigiria uma agenda de contatos que
 * ainda não existe. Por ora, o responsável do plano e o e-mail de cópia
 * garantem que o alerta chegue.
 */
function resolverDestinatariosEmail(
  _papeis: string[],
  contexto: ContextoNotificacao,
): string[] {
  const enderecos = new Set<string>();

  // Responsável registrado no plano de ação ou na observação
  if (contexto.regra && 'responsavelEmail' in contexto) {
    const re = (contexto as { responsavelEmail?: string }).responsavelEmail;
    if (re) enderecos.add(re);
  }

  // Cópia de monitoramento (ex.: gestor da consultoria)
  if (env.ALERTA_EMAIL_COPIA) {
    for (const email of env.ALERTA_EMAIL_COPIA.split(',').map((e) => e.trim())) {
      if (email) enderecos.add(email);
    }
  }

  return [...enderecos];
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

  const [total, email, whatsapp, voz, simuladas, enviadas, falhas, escalonamentos, agrupadas, criticas] =
    await prisma.$transaction([
      prisma.notificacao.count({ where: base }),
      prisma.notificacao.count({ where: { ...base, canal: 'EMAIL' } }),
      prisma.notificacao.count({ where: { ...base, canal: 'WHATSAPP' } }),
      prisma.notificacao.count({ where: { ...base, canal: 'VOZ' } }),
      prisma.notificacao.count({ where: { ...base, status: 'SIMULADA' } }),
      prisma.notificacao.count({ where: { ...base, status: 'ENVIADA' } }),
      prisma.notificacao.count({ where: { ...base, status: 'FALHOU' } }),
      prisma.notificacao.count({ where: { ...base, nivelEscalonamento: { gt: 0 } } }),
      prisma.notificacao.count({ where: { ...base, agrupada: true } }),
      prisma.notificacao.count({ where: { ...base, prioridade: 'CRITICA' } }),
    ]);

  /*
   * Tempo medio de resposta — definicao da matriz: "resposta" e o status do
   * plano mudar para Em andamento, nao a abertura do e-mail.
   */
  const respondidos = await prisma.planoAcao.findMany({
    where: {
      cliente: { empresaId: empresa.id },
      ...(clienteId ? { clienteId } : {}),
      dataInicioTratativa: { not: null },
    },
    select: { criadoEm: true, dataInicioTratativa: true },
  });

  const tempoMedioRespostaHoras =
    respondidos.length > 0
      ? Math.round(
          (respondidos.reduce(
            (soma, plano) => soma + (plano.dataInicioTratativa!.getTime() - plano.criadoEm.getTime()),
            0,
          ) /
            respondidos.length /
            (60 * 60 * 1000)) *
            10,
        ) / 10
      : null;

  return {
    total,
    email,
    whatsapp,
    voz,
    simuladas,
    enviadas,
    falhas,
    porEscalonamento: escalonamentos,
    agrupadas,
    criticas,
    tempoMedioRespostaHoras,
    planosRespondidos: respondidos.length,
  };
}
