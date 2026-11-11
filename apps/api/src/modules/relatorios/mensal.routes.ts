import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ROTULO_CRITICIDADE_PLANO,
  ROTULO_MEDIDA,
  ROTULO_STATUS_PLANO,
  ROTULO_TIPO_ASO,
  diasAteVencer,
  situacaoDaValidade,
  type CriticidadePlano,
  type MedidaDisciplinar,
  type StatusPlano,
  type TipoAso,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { adicionarAba, novaPlanilha, responderPlanilha } from '../../lib/excel.js';
import { guardaPorMetodo } from '../../lib/guarda.js';
import { obterEmpresaOuFalhar } from '../empresa/empresa.service.js';
import { DIAS_ALERTA_ASO } from '../saude/colaborador.service.js';

/**
 * Relatorio mensal (Administracao SST): o que foi realizado no mes e as
 * pendencias — compilado a partir dos registros da plataforma, nunca
 * digitado. Serve a tela (JSON) e o Excel (uma aba por bloco).
 */

const filtroSchema = z.object({
  clienteId: z.string().uuid().optional(),
  /** Competencia AAAA-MM; padrao = mes atual. */
  mes: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Informe o mes como AAAA-MM.')
    .optional(),
});

function janelaDoMes(mes?: string): { inicio: Date; fim: Date; competencia: string } {
  const agora = new Date();
  const [ano, m] = mes ? mes.split('-').map(Number) : [agora.getFullYear(), agora.getMonth() + 1];
  const inicio = new Date(ano!, m! - 1, 1);
  const fim = new Date(ano!, m!, 1);
  return { inicio, fim, competencia: `${ano}-${String(m).padStart(2, '0')}` };
}

export async function montarRelatorioMensal(filtro: { clienteId?: string; mes?: string }) {
  const { inicio, fim, competencia } = janelaDoMes(filtro.mes);
  const porCliente = filtro.clienteId ? { clienteId: filtro.clienteId } : {};
  const agora = new Date();

  const [empresa, cliente, observacoes, planosAbertos, planosConcluidos, planosPendentes, dds, treinamentos, aprs, checklists, auditorias, acidentes, consequencias, afastamentos, colaboradores, asosVencendo, documentosVencendo, ordensServico] =
    await Promise.all([
      obterEmpresaOuFalhar(),
      filtro.clienteId ? prisma.cliente.findUnique({ where: { id: filtro.clienteId }, select: { nomeFantasia: true, razaoSocial: true, cnpj: true } }) : Promise.resolve(null),
      prisma.observacao.findMany({ where: { ...porCliente, dataHora: { gte: inicio, lt: fim } }, include: { area: { select: { nome: true } }, causa: { select: { descricao: true } } }, orderBy: { dataHora: 'asc' } }),
      prisma.planoAcao.findMany({ where: { ...porCliente, criadoEm: { gte: inicio, lt: fim } }, include: { area: { select: { nome: true } } }, orderBy: { criadoEm: 'asc' } }),
      prisma.planoAcao.findMany({ where: { ...porCliente, dataConclusao: { gte: inicio, lt: fim }, status: 'CONCLUIDO' }, include: { area: { select: { nome: true } } }, orderBy: { dataConclusao: 'asc' } }),
      prisma.planoAcao.findMany({ where: { ...porCliente, status: { in: ['ABERTO', 'EM_ANDAMENTO'] } }, include: { area: { select: { nome: true } }, cliente: { select: { nomeFantasia: true } } }, orderBy: { prazo: 'asc' } }),
      prisma.registroDds.findMany({ where: { ...porCliente, data: { gte: inicio, lt: fim } }, include: { tema: { select: { titulo: true } }, area: { select: { nome: true } } }, orderBy: { data: 'asc' } }),
      prisma.treinamentoRealizado.findMany({ where: { dataRealizacao: { gte: inicio, lt: fim }, colaborador: porCliente }, include: { treinamento: { select: { nome: true, norma: true } }, colaborador: { select: { nome: true, funcao: true } } }, orderBy: { dataRealizacao: 'asc' } }),
      prisma.apr.findMany({ where: { ...porCliente, criadoEm: { gte: inicio, lt: fim } }, select: { codigo: true, versao: true, modelo: true, atividade: true, situacao: true, responsavel: true, dataInicio: true } }),
      prisma.execucaoChecklist.findMany({ where: { ...porCliente, dataHora: { gte: inicio, lt: fim } }, include: { modelo: { select: { nome: true, tipoEquipamento: true } } } }),
      prisma.auditoria.findMany({ where: { ...porCliente, dataRealizacao: { gte: inicio, lt: fim } }, select: { titulo: true, tipo: true, situacao: true, dataRealizacao: true, requisitosAvaliados: true, requisitosAtendidos: true, ncMaiores: true, ncMenores: true } }),
      prisma.acidente.findMany({ where: { ...porCliente, data: { gte: inicio, lt: fim } }, include: { colaborador: { select: { nome: true } } } }),
      prisma.consequencia.findMany({ where: { data: { gte: inicio, lt: fim }, colaborador: porCliente }, include: { colaborador: { select: { nome: true, funcao: true } } } }),
      prisma.afastamento.findMany({ where: { ...porCliente, dataInicio: { gte: inicio, lt: fim } }, include: { colaborador: { select: { nome: true, funcao: true } } } }),
      prisma.colaborador.findMany({ where: { ...porCliente, situacao: 'ATIVO' }, select: { id: true, nome: true, funcao: true, bloqueado: true, motivoBloqueio: true, asos: { where: { tipo: { not: 'DEMISSIONAL' } }, orderBy: { dataExame: 'desc' }, take: 1, select: { validade: true, tipo: true } } } }),
      Promise.resolve(null),
      prisma.documentoSsma.findMany({ where: { ...porCliente, vigente: true, situacao: 'ATIVO', validade: { lte: new Date(agora.getTime() + 60 * 24 * 60 * 60 * 1000) } }, select: { tipo: true, titulo: true, validade: true } }),
      prisma.ordemServico.findMany({ where: { ...porCliente, geradaEm: { gte: inicio, lt: fim } }, select: { codigo: true, situacao: true, funcao: true, colaborador: { select: { nome: true } } } }),
    ]);
  void asosVencendo;

  const asosPendentes = colaboradores
    .map((c) => {
      const [aso] = c.asos;
      const situacao = aso ? situacaoDaValidade(aso.validade, agora, DIAS_ALERTA_ASO) : 'SEM_ASO';
      return { colaborador: c.nome, funcao: c.funcao, tipo: aso ? ROTULO_TIPO_ASO[aso.tipo as TipoAso] : null, validade: aso?.validade ?? null, diasParaVencer: aso ? diasAteVencer(aso.validade, agora) : null, situacao };
    })
    .filter((l) => l.situacao === 'VENCIDO' || l.situacao === 'A_VENCER' || l.situacao === 'SEM_ASO');

  const planosAtrasados = planosPendentes.filter((p) => p.prazo < agora);

  return {
    geradoEm: agora,
    competencia,
    periodo: { inicio, fim },
    consultoria: { nomeFantasia: empresa.nomeFantasia, razaoSocial: empresa.razaoSocial },
    cliente,
    resumo: {
      observacoes: observacoes.length,
      desvios: observacoes.filter((o) => o.tipo !== 'COMPORTAMENTO_SEGURO').length,
      planosAbertos: planosAbertos.length,
      planosConcluidos: planosConcluidos.length,
      planosPendentes: planosPendentes.length,
      planosAtrasados: planosAtrasados.length,
      dds: dds.length,
      participantesDds: dds.reduce((s, d) => s + d.participantes, 0),
      treinamentos: treinamentos.length,
      aprs: aprs.length,
      checklists: checklists.length,
      checklistsReprovados: checklists.filter((c) => c.resultado === 'NAO_APTO').length,
      auditorias: auditorias.length,
      acidentes: acidentes.length,
      acidentesComAfastamento: acidentes.filter((a) => a.comAfastamento).length,
      consequencias: consequencias.length,
      afastamentos: afastamentos.length,
      diasAfastamento: afastamentos.reduce((s, a) => s + a.diasAfastamento, 0),
      ordensServico: ordensServico.length,
      asosPendentes: asosPendentes.length,
      documentosVencendo: documentosVencendo.length,
      colaboradoresBloqueados: colaboradores.filter((c) => c.bloqueado).length,
    },
    realizado: {
      observacoes: observacoes.map((o) => ({ data: o.dataHora, tipo: o.tipo, area: o.area.nome, causa: o.causa?.descricao ?? null, descricao: o.descricao, observador: o.observador, grau: o.grauRisco, situacao: o.situacao })),
      planosAbertos: planosAbertos.map((p) => ({ codigo: p.codigo, acao: p.acao, area: p.area?.nome ?? null, responsavel: p.responsavelNome, criticidade: ROTULO_CRITICIDADE_PLANO[p.criticidade as CriticidadePlano], prazo: p.prazo, status: ROTULO_STATUS_PLANO[p.status as StatusPlano] })),
      planosConcluidos: planosConcluidos.map((p) => ({ codigo: p.codigo, acao: p.acao, area: p.area?.nome ?? null, responsavel: p.responsavelNome, criticidade: ROTULO_CRITICIDADE_PLANO[p.criticidade as CriticidadePlano], prazo: p.prazo, concluidoEm: p.dataConclusao, noPrazo: p.dataConclusao && p.dataConclusao <= p.prazo ? 'Sim' : 'Nao', comentario: p.comentarioConclusao })),
      dds: dds.map((d) => ({ data: d.data, tema: d.tema?.titulo ?? d.temaLivre, area: d.area?.nome ?? 'Geral', lider: d.lider, participantes: d.participantes, duracao: d.duracaoMinutos })),
      treinamentos: treinamentos.map((t) => ({ data: t.dataRealizacao, treinamento: t.treinamento.nome, norma: t.treinamento.norma, colaborador: t.colaborador.nome, funcao: t.colaborador.funcao, validade: t.validade, instrutor: t.instrutor })),
      aprs: aprs.map((a) => ({ codigo: `${a.codigo} v${a.versao}`, modelo: a.modelo, atividade: a.atividade, situacao: a.situacao, responsavel: a.responsavel, inicio: a.dataInicio })),
      checklists: checklists.map((c) => ({ data: c.dataHora, equipamento: c.equipamentoIdentificacao, tipo: c.modelo.tipoEquipamento, checklist: c.modelo.nome, executadoPor: c.executadoPor, resultado: c.resultado })),
      auditorias: auditorias.map((a) => ({ data: a.dataRealizacao, titulo: a.titulo, tipo: a.tipo, situacao: a.situacao, avaliados: a.requisitosAvaliados, atendidos: a.requisitosAtendidos, ncMaiores: a.ncMaiores, ncMenores: a.ncMenores })),
      acidentes: acidentes.map((a) => ({ data: a.data, tipo: a.tipo, colaborador: a.colaborador?.nome ?? null, descricao: a.descricao, afastamento: a.comAfastamento ? a.diasAfastamento : 0, diasDebitados: a.diasDebitados, cat: a.catNumero, investigacao: a.situacaoInvestigacao })),
      consequencias: consequencias.map((c) => ({ data: c.data, colaborador: c.colaborador.nome, funcao: c.colaborador.funcao, comportamento: c.comportamento, medida: ROTULO_MEDIDA[c.medida as MedidaDisciplinar], lider: c.liderNome })),
      afastamentos: afastamentos.map((a) => ({ inicio: a.dataInicio, fim: a.dataFim, dias: a.diasAfastamento, tipo: a.tipo, colaborador: a.colaborador.nome, funcao: a.colaborador.funcao, cid: a.cid })),
      ordensServico: ordensServico.map((o) => ({ codigo: o.codigo, colaborador: o.colaborador.nome, funcao: o.funcao, situacao: o.situacao })),
    },
    pendencias: {
      planos: planosPendentes.map((p) => ({ codigo: p.codigo, acao: p.acao, cliente: p.cliente.nomeFantasia, area: p.area?.nome ?? null, responsavel: p.responsavelNome, criticidade: ROTULO_CRITICIDADE_PLANO[p.criticidade as CriticidadePlano], prazo: p.prazo, diasAtraso: Math.max(0, Math.floor((agora.getTime() - p.prazo.getTime()) / (24 * 60 * 60 * 1000))), status: ROTULO_STATUS_PLANO[p.status as StatusPlano], cobradoChefia: p.cobrancaChefiaEm ? 'Sim' : 'Nao' })),
      asos: asosPendentes,
      documentos: documentosVencendo.map((d) => ({ tipo: d.tipo, titulo: d.titulo, validade: d.validade, diasParaVencer: diasAteVencer(d.validade, agora) })),
      bloqueados: colaboradores.filter((c) => c.bloqueado).map((c) => ({ colaborador: c.nome, funcao: c.funcao, motivo: c.motivoBloqueio })),
    },
  };
}

export async function registrarRotasRelatorioMensal(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, { leitura: 'indicadores:ler', escrita: 'indicadores:ler' }));

  app.get('/relatorios/mensal', async (request) => montarRelatorioMensal(filtroSchema.parse(request.query)));

  app.get('/relatorios/mensal.xlsx', async (request, reply) => {
    const filtro = filtroSchema.parse(request.query);
    const r = await montarRelatorioMensal(filtro);
    const wb = novaPlanilha();
    const titulo = `Relatorio mensal SSMA — ${r.competencia}${r.cliente ? ` — ${r.cliente.nomeFantasia}` : ''}`;

    adicionarAba(wb, 'Resumo', [{ cabecalho: 'Indicador', chave: 'indicador', largura: 40 }, { cabecalho: 'Valor', chave: 'valor', formato: 'numero' }],
      Object.entries(r.resumo).map(([indicador, valor]) => ({ indicador, valor })), { titulo });
    adicionarAba(wb, 'Observacoes', [
      { cabecalho: 'Data', chave: 'data', formato: 'data' }, { cabecalho: 'Tipo', chave: 'tipo', largura: 24 }, { cabecalho: 'Area', chave: 'area', largura: 22 }, { cabecalho: 'Causa', chave: 'causa', largura: 30 }, { cabecalho: 'Descricao', chave: 'descricao', largura: 60 }, { cabecalho: 'Observador', chave: 'observador', largura: 24 }, { cabecalho: 'Grau', chave: 'grau' }, { cabecalho: 'Situacao', chave: 'situacao' },
    ], r.realizado.observacoes);
    adicionarAba(wb, 'Planos abertos', [
      { cabecalho: 'Codigo', chave: 'codigo' }, { cabecalho: 'Acao', chave: 'acao', largura: 50 }, { cabecalho: 'Area', chave: 'area', largura: 22 }, { cabecalho: 'Responsavel', chave: 'responsavel', largura: 24 }, { cabecalho: 'Criticidade', chave: 'criticidade' }, { cabecalho: 'Prazo', chave: 'prazo', formato: 'data' }, { cabecalho: 'Status', chave: 'status' },
    ], r.realizado.planosAbertos);
    adicionarAba(wb, 'Planos concluidos', [
      { cabecalho: 'Codigo', chave: 'codigo' }, { cabecalho: 'Acao', chave: 'acao', largura: 50 }, { cabecalho: 'Area', chave: 'area', largura: 22 }, { cabecalho: 'Responsavel', chave: 'responsavel', largura: 24 }, { cabecalho: 'Criticidade', chave: 'criticidade' }, { cabecalho: 'Prazo', chave: 'prazo', formato: 'data' }, { cabecalho: 'Concluido em', chave: 'concluidoEm', formato: 'data' }, { cabecalho: 'No prazo', chave: 'noPrazo' }, { cabecalho: 'O que foi feito', chave: 'comentario', largura: 50 },
    ], r.realizado.planosConcluidos);
    adicionarAba(wb, 'DDS', [
      { cabecalho: 'Data', chave: 'data', formato: 'data' }, { cabecalho: 'Tema', chave: 'tema', largura: 40 }, { cabecalho: 'Area', chave: 'area', largura: 22 }, { cabecalho: 'Lider', chave: 'lider', largura: 24 }, { cabecalho: 'Participantes', chave: 'participantes', formato: 'numero' }, { cabecalho: 'Duracao (min)', chave: 'duracao', formato: 'numero' },
    ], r.realizado.dds);
    adicionarAba(wb, 'Treinamentos', [
      { cabecalho: 'Data', chave: 'data', formato: 'data' }, { cabecalho: 'Treinamento', chave: 'treinamento', largura: 40 }, { cabecalho: 'Norma', chave: 'norma' }, { cabecalho: 'Colaborador', chave: 'colaborador', largura: 30 }, { cabecalho: 'Funcao', chave: 'funcao', largura: 22 }, { cabecalho: 'Validade', chave: 'validade', formato: 'data' }, { cabecalho: 'Instrutor', chave: 'instrutor', largura: 24 },
    ], r.realizado.treinamentos);
    adicionarAba(wb, 'APR e checklists', [
      { cabecalho: 'Codigo', chave: 'codigo' }, { cabecalho: 'Modelo', chave: 'modelo' }, { cabecalho: 'Atividade', chave: 'atividade', largura: 40 }, { cabecalho: 'Situacao', chave: 'situacao' }, { cabecalho: 'Responsavel', chave: 'responsavel', largura: 24 }, { cabecalho: 'Inicio', chave: 'inicio', formato: 'data' },
    ], r.realizado.aprs);
    adicionarAba(wb, 'Checklists', [
      { cabecalho: 'Data', chave: 'data', formato: 'data' }, { cabecalho: 'Equipamento', chave: 'equipamento', largura: 20 }, { cabecalho: 'Tipo', chave: 'tipo', largura: 20 }, { cabecalho: 'Checklist', chave: 'checklist', largura: 30 }, { cabecalho: 'Executado por', chave: 'executadoPor', largura: 24 }, { cabecalho: 'Resultado', chave: 'resultado' },
    ], r.realizado.checklists);
    adicionarAba(wb, 'Acidentes', [
      { cabecalho: 'Data', chave: 'data', formato: 'data' }, { cabecalho: 'Tipo', chave: 'tipo' }, { cabecalho: 'Colaborador', chave: 'colaborador', largura: 30 }, { cabecalho: 'Descricao', chave: 'descricao', largura: 60 }, { cabecalho: 'Dias afastamento', chave: 'afastamento', formato: 'numero' }, { cabecalho: 'Dias debitados', chave: 'diasDebitados', formato: 'numero' }, { cabecalho: 'CAT', chave: 'cat' }, { cabecalho: 'Investigacao', chave: 'investigacao' },
    ], r.realizado.acidentes);
    adicionarAba(wb, 'Consequencias', [
      { cabecalho: 'Data', chave: 'data', formato: 'data' }, { cabecalho: 'Colaborador', chave: 'colaborador', largura: 30 }, { cabecalho: 'Funcao', chave: 'funcao', largura: 22 }, { cabecalho: 'Comportamento', chave: 'comportamento', largura: 40 }, { cabecalho: 'Medida', chave: 'medida', largura: 24 }, { cabecalho: 'Lider', chave: 'lider', largura: 24 },
    ], r.realizado.consequencias);
    adicionarAba(wb, 'Afastamentos', [
      { cabecalho: 'Inicio', chave: 'inicio', formato: 'data' }, { cabecalho: 'Retorno', chave: 'fim', formato: 'data' }, { cabecalho: 'Dias', chave: 'dias', formato: 'numero' }, { cabecalho: 'Tipo', chave: 'tipo', largura: 22 }, { cabecalho: 'Colaborador', chave: 'colaborador', largura: 30 }, { cabecalho: 'Funcao', chave: 'funcao', largura: 22 }, { cabecalho: 'CID', chave: 'cid' },
    ], r.realizado.afastamentos);
    adicionarAba(wb, 'Pendencias - planos', [
      { cabecalho: 'Codigo', chave: 'codigo' }, { cabecalho: 'Acao', chave: 'acao', largura: 50 }, { cabecalho: 'Cliente', chave: 'cliente', largura: 24 }, { cabecalho: 'Area', chave: 'area', largura: 22 }, { cabecalho: 'Responsavel', chave: 'responsavel', largura: 24 }, { cabecalho: 'Criticidade', chave: 'criticidade' }, { cabecalho: 'Prazo', chave: 'prazo', formato: 'data' }, { cabecalho: 'Dias de atraso', chave: 'diasAtraso', formato: 'numero' }, { cabecalho: 'Status', chave: 'status' }, { cabecalho: 'Chefia cobrada', chave: 'cobradoChefia' },
    ], r.pendencias.planos);
    adicionarAba(wb, 'Pendencias - ASO', [
      { cabecalho: 'Colaborador', chave: 'colaborador', largura: 30 }, { cabecalho: 'Funcao', chave: 'funcao', largura: 22 }, { cabecalho: 'Ultimo exame', chave: 'tipo', largura: 20 }, { cabecalho: 'Validade', chave: 'validade', formato: 'data' }, { cabecalho: 'Dias para vencer', chave: 'diasParaVencer', formato: 'numero' }, { cabecalho: 'Situacao', chave: 'situacao' },
    ], r.pendencias.asos);
    adicionarAba(wb, 'Pendencias - documentos', [
      { cabecalho: 'Tipo', chave: 'tipo', largura: 24 }, { cabecalho: 'Titulo', chave: 'titulo', largura: 40 }, { cabecalho: 'Validade', chave: 'validade', formato: 'data' }, { cabecalho: 'Dias para vencer', chave: 'diasParaVencer', formato: 'numero' },
    ], r.pendencias.documentos);

    return responderPlanilha(reply, wb, `relatorio-mensal-${r.competencia}.xlsx`);
  });
}
