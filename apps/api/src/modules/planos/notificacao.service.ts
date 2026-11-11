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

/* -------------------------------------------------------------------------- */
/* Destinatarios reais: contatos hierarquicos do cliente                       */
/* -------------------------------------------------------------------------- */

/**
 * Resolve os papeis da matriz (SUPERVISOR, GERENTE...) nas pessoas cadastradas
 * em "Contatos" do cliente. E o que faz "escalar para o gerente" chegar a um
 * e-mail de verdade. Sem contato no nivel, o papel fica so registrado.
 */
export async function emailsDosContatos(clienteId: string, niveis: readonly string[]): Promise<string[]> {
  if (niveis.length === 0) return [];
  const contatos = await prisma.contatoCliente.findMany({
    where: { clienteId, recebeAlertas: true, nivel: { in: [...niveis] } },
    select: { email: true },
  });
  return [...new Set(contatos.map((c) => c.email.toLowerCase()))];
}

function emailsDeCopia(): string[] {
  return (env.ALERTA_EMAIL_COPIA ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

/**
 * Aviso aos niveis hierarquicos quando uma medida disciplinar e registrada
 * (gestao de consequencias). Nunca lanca.
 */
export async function avisarHierarquiaSobreConsequencia(dados: {
  clienteId: string;
  cliente: string;
  colaborador: string;
  medida: string;
  comportamento: string;
  data: Date;
  liderNome: string;
}): Promise<{ enviado: boolean; destinatarios: number; motivo?: string }> {
  try {
    const para = new Set<string>([
      ...(await emailsDosContatos(dados.clienteId, ['SUPERVISOR', 'COORDENADOR', 'GERENTE', 'SSMA', 'RH'])),
      ...emailsDeCopia(),
    ]);
    if (para.size === 0) return { enviado: false, destinatarios: 0, motivo: 'Nenhum contato hierarquico com e-mail cadastrado no cliente.' };

    const empresa = await obterEmpresaOuFalhar();
    const cabecalho = montarCabecalhoInstitucional(empresa);
    const corpo = [
      `${cabecalho.nomeExibicao} — Gestao de Consequencias`,
      '',
      `Cliente: ${dados.cliente}`,
      `Colaborador: ${dados.colaborador}`,
      `Data do fato: ${dados.data.toLocaleDateString('pt-BR')}`,
      `Comportamento de risco: ${dados.comportamento}`,
      `Medida aplicada: ${dados.medida}`,
      `Lider direto: ${dados.liderNome}`,
      '',
      'Este aviso e gerado automaticamente pela plataforma para conhecimento dos niveis hierarquicos. O registro completo esta na tela Gestao de Consequencias.',
      '',
      cabecalho.assinaturaEmail,
    ].join('\n');

    await enviarEmail({ para: [...para], assunto: `[SSMA] Medida disciplinar registrada — ${dados.cliente}`, corpo });
    return { enviado: true, destinatarios: para.size };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.error(`[email] aviso de consequencia falhou: ${motivo}`);
    return { enviado: false, destinatarios: 0, motivo };
  }
}

/**
 * Cobranca da chefia: plano em aberto que passou do prazo + carencia da
 * criticidade (10/20/30 dias). Vai para TODA a cadeia hierarquica do cliente
 * (supervisor ate diretoria) mais o responsavel do plano. Nunca lanca.
 */
export async function cobrarChefiaPorPlano(plano: {
  id: string;
  codigo: string;
  acao: string;
  criticidade: string;
  prazo: Date;
  responsavelNome: string;
  responsavelEmail: string | null;
  clienteId: string;
  cliente: string;
  area: string | null;
  diasAtraso: number;
}): Promise<{ enviado: boolean; destinatarios: number; motivo?: string }> {
  try {
    const para = new Set<string>([
      ...(await emailsDosContatos(plano.clienteId, ['SUPERVISOR', 'COORDENADOR', 'GERENTE', 'GERENCIA_CORPORATIVA', 'DIRETORIA', 'SSMA'])),
      ...emailsDeCopia(),
    ]);
    if (plano.responsavelEmail) para.add(plano.responsavelEmail.toLowerCase());
    if (para.size === 0) return { enviado: false, destinatarios: 0, motivo: 'Nenhum contato hierarquico com e-mail cadastrado no cliente.' };

    const empresa = await obterEmpresaOuFalhar();
    const cabecalho = montarCabecalhoInstitucional(empresa);
    const assunto = `[SSMA] Pendencia nao tratada ha ${plano.diasAtraso} dias — ${plano.codigo} (${plano.cliente})`;
    const corpo = [
      `${cabecalho.nomeExibicao} — Cobranca de pendencia`,
      '',
      `Plano de acao: ${plano.codigo} — ${plano.acao}`,
      `Cliente: ${plano.cliente}${plano.area ? ` · Area: ${plano.area}` : ''}`,
      `Criticidade: ${plano.criticidade}`,
      `Prazo original: ${plano.prazo.toLocaleDateString('pt-BR')} (vencido ha ${plano.diasAtraso} dias)`,
      `Responsavel: ${plano.responsavelNome}`,
      '',
      'A pendencia ultrapassou a carencia definida para a criticidade (10 dias ALTA, 20 dias MEDIA, 30 dias BAIXA) sem tratativa registrada. Pedimos a intervencao da chefia para destravar a acao ou reprogramar o prazo com justificativa.',
      '',
      cabecalho.assinaturaEmail,
    ].join('\n');

    await enviarEmail({ para: [...para], assunto, corpo });

    await prisma.notificacao.create({
      data: {
        clienteId: plano.clienteId,
        planoAcaoId: plano.id,
        canal: 'EMAIL',
        destinatarios: 'SUPERVISOR,COORDENADOR,GERENTE,GERENCIA_CORPORATIVA,DIRETORIA',
        assunto,
        corpo,
        nivelEscalonamento: 9,
        prioridade: 'ALTA',
        status: 'ENVIADA',
      },
    });

    return { enviado: true, destinatarios: para.size };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.error(`[email] cobranca da chefia falhou (${plano.codigo}): ${motivo}`);
    return { enviado: false, destinatarios: 0, motivo };
  }
}

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
export interface ResultadoRegistro {
  canais: CanalNotificacao[];
  agrupada: boolean;
  /**
   * Notificacoes de e-mail gravadas nesta chamada. O envio NAO acontece aqui:
   * esta funcao roda dentro de uma transacao com limite de 5 s, e um SMTP real
   * leva 1-3 s por mensagem. Quem chamou faz o commit e depois passa estes
   * ids a `despacharEmails`.
   */
  emailIds: string[];
}

export async function registrarNotificacoes(
  db: ClientePrisma,
  contexto: ContextoNotificacao,
): Promise<ResultadoRegistro> {
  // Pelo cliente da transacao — com o global seria uma segunda conexao (deadlock com pool de 1).
  const empresa = await obterEmpresaOuFalhar(db);
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
  const emailIds: string[] = [];

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
      emailIds.push(notificacao.id);
    }
  }

  return { canais, agrupada, emailIds };
}

/* -------------------------------------------------------------------------- */
/* Despacho de e-mail — fora da transacao                                     */
/* -------------------------------------------------------------------------- */

/**
 * Envia as notificacoes de e-mail ja commitadas e marca ENVIADA ou FALHOU.
 *
 * Recebe ids explicitos, nunca "tudo que esta SIMULADA": a massa de
 * demonstracao e o historico antigo tambem estao SIMULADA, e um despacho
 * generico dispararia centenas de mensagens de uma vez.
 *
 * Destinatarios: o responsavel do plano (quando ha e-mail cadastrado) e a
 * copia de monitoramento (ALERTA_EMAIL_COPIA). Os papeis da matriz
 * (SUPERVISOR, GERENTE...) ficam gravados em `destinatarios` para auditoria,
 * mas o mapeamento papel -> pessoa exige uma agenda que ainda nao existe.
 *
 * Nunca lanca: falha de envio vira status FALHOU e o chamador segue.
 */
export async function despacharEmails(ids: string[]): Promise<{ enviadas: number; falhas: number; motivos?: string[] }> {
  if (ids.length === 0) return { enviadas: 0, falhas: 0 };
  const motivos: string[] = [];

  const pendentes = await prisma.notificacao.findMany({
    where: { id: { in: ids }, canal: 'EMAIL', status: 'SIMULADA' },
    select: {
      id: true,
      assunto: true,
      corpo: true,
      clienteId: true,
      destinatarios: true,
      planoAcao: { select: { responsavelEmail: true } },
    },
  });

  let enviadas = 0;
  let falhas = 0;

  for (const n of pendentes) {
    const para = new Set<string>();
    if (n.planoAcao?.responsavelEmail) para.add(n.planoAcao.responsavelEmail);
    // Papeis da matriz -> pessoas: contatos hierarquicos cadastrados no cliente.
    for (const email of await emailsDosContatos(n.clienteId, n.destinatarios.split(',').map((d) => d.trim()).filter(Boolean))) {
      para.add(email);
    }
    for (const email of emailsDeCopia()) para.add(email);
    if (para.size === 0 || !n.assunto || !n.corpo) continue;

    try {
      await enviarEmail({ para: [...para], assunto: n.assunto, corpo: n.corpo });
      await prisma.notificacao.update({ where: { id: n.id }, data: { status: 'ENVIADA' } });
      enviadas += 1;
    } catch (erro) {
      // O motivo vai para o log e para a resposta: sem isso, "falhou" nao diz
      // se foi credencial, rede ou remetente nao verificado.
      const motivo = erro instanceof Error ? erro.message : String(erro);
      console.error(`[email] falha ao enviar notificacao ${n.id}: ${motivo}`);
      motivos.push(motivo.slice(0, 200));
      await prisma.notificacao.update({ where: { id: n.id }, data: { status: 'FALHOU' } }).catch(() => {});
      falhas += 1;
    }
  }

  return { enviadas, falhas, ...(motivos.length ? { motivos: [...new Set(motivos)] } : {}) };
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
