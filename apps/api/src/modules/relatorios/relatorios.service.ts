import type { Prisma } from '@prisma/client';
import {
  MARCADORES_RELATORIO,
  ROTULO_SITUACAO_OBSERVACAO,
  ROTULO_STATUS_PLANO,
  aplicarMarcadores,
  definicaoDoTipo,
  montarCabecalhoInstitucional,
  type ModeloRelatorioGerarData,
  type SituacaoObservacao,
  type StatusPlano,
  type TipoObservacao,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { gerarTexto, type TextoGerado } from '../../lib/assistente.js';
import { NaoEncontrado } from '../../lib/erros.js';
import { obterEmpresaOuFalhar } from '../empresa/empresa.service.js';

/**
 * Etapa 24 — Relatorios: geracao assistida de modelos e relatorio fotografico.
 *
 * O assistente nunca grava nada: devolve texto para a tela, e o usuario decide
 * o que salvar. Sem chave de IA, os geradores locais montam um esqueleto para
 * a tela nunca ficar sem resposta.
 */

/* ------------------------------------------------------------ marcadores --- */

function formatarDataBr(data: Date): string {
  return data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function periodoPadrao(data: Date): string {
  const texto = data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
  return texto.replace(' de ', '/');
}

export interface ValoresMarcadores {
  clienteId?: string | null;
  periodo?: string | null;
  responsavel?: string | null;
  /** Nome do usuario logado — usado quando o responsavel nao foi informado. */
  usuarioNome?: string | null;
}

/** Resolve os valores dos marcadores a partir do cliente, da matriz e do periodo. */
export async function resolverMarcadores(valores: ValoresMarcadores): Promise<Record<string, string>> {
  const agora = new Date();
  const [cliente, empresa] = await Promise.all([
    valores.clienteId
      ? prisma.cliente.findUnique({ where: { id: valores.clienteId }, select: { nomeFantasia: true } })
      : Promise.resolve(null),
    prisma.empresaConsultoria.findFirst({ select: { nomeFantasia: true, razaoSocial: true } }),
  ]);
  if (valores.clienteId && !cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');

  return {
    cliente: cliente?.nomeFantasia ?? '',
    periodo: valores.periodo?.trim() || periodoPadrao(agora),
    data: formatarDataBr(agora),
    responsavel: valores.responsavel?.trim() || valores.usuarioNome?.trim() || '',
    consultoria: empresa?.nomeFantasia || empresa?.razaoSocial || '',
  };
}

export async function preencherModelo(conteudo: string, valores: ValoresMarcadores): Promise<{ conteudo: string; valores: Record<string, string> }> {
  const resolvidos = await resolverMarcadores(valores);
  return { conteudo: aplicarMarcadores(conteudo, resolvidos), valores: resolvidos };
}

/* ------------------------------------------------------------- assistente --- */

const LISTA_MARCADORES = MARCADORES_RELATORIO.map((m) => `${m.marcador} — ${m.descricao}`).join('\n');

const SISTEMA_REDATOR = `Voce e um redator tecnico de Seguranca, Saude e Meio Ambiente (SSMA/SST) de uma consultoria brasileira.
Escreve em portugues do Brasil, em tom formal, objetivo e tecnico, citando as Normas Regulamentadoras (NRs) quando pertinente.
Responde SEMPRE e SOMENTE em Markdown: titulo principal com "#", secoes com "##" e subsecoes com "###"; listas com "- "; tabelas simples quando ajudarem.
Nao inclui comentarios fora do documento, nem explica o que fez. Nao inventa numeros, nomes ou fatos: quando um dado nao foi informado, deixa o campo para preenchimento (ex.: "- Taxa de frequencia: ").`;

const SISTEMA_MODELO = `${SISTEMA_REDATOR}
Sua tarefa e criar MODELOS de relatorio reutilizaveis. Use os marcadores abaixo onde fizer sentido (eles sao trocados pelos valores reais na hora de usar):
${LISTA_MARCADORES}`;

const SISTEMA_RELATORIO = `${SISTEMA_REDATOR}
Sua tarefa e redigir a versao FINAL de um relatorio a partir de um modelo ja preenchido e das instrucoes e dados fornecidos pelo consultor.
Preserve a estrutura de secoes do modelo, preencha cada secao com o que foi informado e deixe explicito o que ficou sem dado. Nao deixe marcadores {{...}} no texto final.`;

const SECOES_POR_CATEGORIA: Record<string, string[]> = {
  Inspecao: ['Objetivo', 'Escopo da inspecao', 'Metodologia', 'Constatacoes', 'Nao conformidades e acoes recomendadas', 'Conclusao'],
  Mensal: ['Objetivo', 'Atividades realizadas', 'Indicadores do periodo', 'Desvios e ocorrencias', 'Planos de acao', 'Recomendacoes', 'Conclusao'],
  Auditoria: ['Objetivo', 'Criterios de auditoria', 'Escopo e equipe', 'Resultados por requisito', 'Nao conformidades', 'Oportunidades de melhoria', 'Conclusao'],
  Acidente: ['Identificacao do evento', 'Descricao do evento', 'Lesoes e danos', 'Analise de causas', 'Medidas corretivas e preventivas', 'Licoes aprendidas'],
  Treinamento: ['Identificacao do treinamento', 'Objetivo', 'Conteudo programatico', 'Participantes', 'Avaliacao', 'Observacoes e recomendacoes'],
  Ambiental: ['Objetivo', 'Aspectos e impactos avaliados', 'Gestao de residuos', 'Ocorrencias ambientais', 'Licencas e condicionantes', 'Recomendacoes', 'Conclusao'],
  Outro: ['Objetivo', 'Desenvolvimento', 'Resultados', 'Recomendacoes', 'Conclusao'],
};

/** Esqueleto local usado quando a IA nao esta configurada ou falha. */
export function esqueletoModelo(dados: ModeloRelatorioGerarData): string {
  const secoes = SECOES_POR_CATEGORIA[dados.categoria ?? 'Outro'] ?? SECOES_POR_CATEGORIA.Outro!;
  const linhas = [
    `# ${dados.tema} — {{cliente}}`,
    '',
    '**Periodo:** {{periodo}}',
    '**Elaborado por:** {{responsavel}} — {{consultoria}}',
    '**Data de emissao:** {{data}}',
    '',
  ];
  if (dados.contexto) {
    linhas.push('## Contexto', '', dados.contexto.trim(), '');
  }
  secoes.forEach((secao, indice) => {
    linhas.push(`## ${indice + 1}. ${secao}`, '', '- ', '- ', '');
  });
  linhas.push('---', '{{consultoria}} · {{responsavel}}');
  return linhas.join('\n');
}

export async function gerarModeloAssistido(dados: ModeloRelatorioGerarData): Promise<TextoGerado> {
  const cliente = dados.clienteId
    ? await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { nomeFantasia: true, segmento: true, grauRisco: true } })
    : null;

  const pedido = [
    `Crie um modelo de relatorio de SST com o tema: "${dados.tema}".`,
    dados.categoria ? `Categoria: ${dados.categoria}.` : null,
    cliente
      ? `O modelo sera usado com o cliente ${cliente.nomeFantasia}${cliente.segmento ? ` (segmento: ${cliente.segmento})` : ''}, grau de risco NR-4 ${cliente.grauRisco}; mesmo assim use o marcador {{cliente}} em vez do nome.`
      : null,
    dados.contexto ? `Contexto e exigencias do consultor:\n${dados.contexto}` : null,
    'Entregue um documento completo com cabecalho (periodo, responsavel, consultoria, data de emissao usando os marcadores), secoes numeradas e campos a preencher.',
  ]
    .filter(Boolean)
    .join('\n\n');

  return gerarTexto({ sistema: SISTEMA_MODELO, pedido, reserva: () => esqueletoModelo(dados) });
}

export async function redigirRelatorioAssistido(
  modelo: { titulo: string; conteudo: string },
  valores: ValoresMarcadores,
  instrucoes: string,
): Promise<TextoGerado & { modeloPreenchido: string }> {
  const { conteudo: preenchido, valores: resolvidos } = await preencherModelo(modelo.conteudo, valores);

  const pedido = [
    `Redija o relatorio final "${modelo.titulo}" a partir do modelo preenchido abaixo.`,
    `Dados conhecidos: cliente "${resolvidos.cliente || 'nao informado'}", periodo "${resolvidos.periodo}", responsavel "${resolvidos.responsavel || 'nao informado'}", consultoria "${resolvidos.consultoria || 'nao informada'}", data ${resolvidos.data}.`,
    `Instrucoes e dados fornecidos pelo consultor:\n${instrucoes.trim()}`,
    `MODELO PREENCHIDO:\n\n${preenchido}`,
  ].join('\n\n');

  const reserva = () => `${preenchido.trimEnd()}\n\n## Observações\n\n${instrucoes.trim()}\n`;
  const resultado = await gerarTexto({ sistema: SISTEMA_RELATORIO, pedido, reserva, maxTokens: 6000 });
  return { ...resultado, modeloPreenchido: preenchido };
}

/* ------------------------------------------------------ relatorio fotografico --- */

export type OrigemItemFotografico = 'OBSERVACAO' | 'PLANO' | 'CHECKLIST';

export interface ItemFotografico {
  origem: OrigemItemFotografico;
  id: string;
  data: Date;
  area: string | null;
  titulo: string;
  descricao: string;
  fotoAntesUrl: string | null;
  fotoDepoisUrl: string | null;
  situacao: string | null;
  responsavel: string | null;
  grau: string | null;
}

export interface FiltroFotografico {
  clienteId: string;
  de: Date;
  ate: Date;
  areaId?: string;
  incluirPlanos: boolean;
  incluirChecklists: boolean;
}

const LIMITE_ITENS = 300;

function nomeDaArea(area: { nome: string; codigo: string } | null | undefined): string | null {
  if (!area) return null;
  return area.codigo ? `${area.codigo} · ${area.nome}` : area.nome;
}

export async function montarRelatorioFotografico(filtro: FiltroFotografico) {
  const [empresa, cliente] = await Promise.all([
    obterEmpresaOuFalhar(),
    prisma.cliente.findUnique({
      where: { id: filtro.clienteId },
      select: { id: true, nomeFantasia: true, razaoSocial: true, logoUrl: true },
    }),
  ]);
  if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');

  const janela = { gte: filtro.de, lte: filtro.ate };
  const porArea = filtro.areaId ? { areaId: filtro.areaId } : {};
  const areaSelect = { select: { nome: true, codigo: true } };

  const observacoes = await prisma.observacao.findMany({
    where: { clienteId: filtro.clienteId, ...porArea, dataHora: janela, fotoUrl: { not: null } },
    orderBy: { dataHora: 'asc' },
    take: LIMITE_ITENS,
    select: {
      id: true,
      dataHora: true,
      tipo: true,
      descricao: true,
      observador: true,
      fotoUrl: true,
      situacao: true,
      grauRisco: true,
      acaoImediata: true,
      area: areaSelect,
      causa: { select: { descricao: true } },
      planosDeAcao: {
        select: { id: true, status: true, evidenciaUrl: true, dataConclusao: true, responsavelNome: true },
        orderBy: { criadoEm: 'asc' },
      },
    },
  });

  const itens: ItemFotografico[] = observacoes.map((obs) => {
    const concluido = obs.planosDeAcao.find((plano) => plano.status === 'CONCLUIDO' && plano.evidenciaUrl);
    const descricao = [obs.descricao, obs.causa ? `Causa: ${obs.causa.descricao}` : null, obs.acaoImediata ? `Acao imediata: ${obs.acaoImediata}` : null]
      .filter(Boolean)
      .join(' · ');
    return {
      origem: 'OBSERVACAO',
      id: obs.id,
      data: obs.dataHora,
      area: nomeDaArea(obs.area),
      titulo: definicaoDoTipo(obs.tipo as TipoObservacao).rotulo,
      descricao,
      fotoAntesUrl: obs.fotoUrl,
      fotoDepoisUrl: concluido?.evidenciaUrl ?? null,
      situacao: ROTULO_SITUACAO_OBSERVACAO[obs.situacao as SituacaoObservacao] ?? obs.situacao,
      responsavel: concluido?.responsavelNome ?? obs.observador,
      grau: obs.grauRisco ? `Grau ${obs.grauRisco}` : null,
    };
  });

  const observacoesIncluidas = new Set(observacoes.map((obs) => obs.id));

  if (filtro.incluirPlanos) {
    const wherePlanos: Prisma.PlanoAcaoWhereInput = {
      clienteId: filtro.clienteId,
      ...porArea,
      OR: [{ fotoInicialUrl: { not: null } }, { evidenciaUrl: { not: null } }],
      AND: [{ OR: [{ criadoEm: janela }, { dataConclusao: janela }] }],
    };
    const planos = await prisma.planoAcao.findMany({
      where: wherePlanos,
      orderBy: { criadoEm: 'asc' },
      take: LIMITE_ITENS,
      select: {
        id: true,
        codigo: true,
        acao: true,
        descricao: true,
        status: true,
        prazo: true,
        criadoEm: true,
        dataConclusao: true,
        evidenciaUrl: true,
        fotoInicialUrl: true,
        responsavelNome: true,
        observacaoId: true,
        criticidade: true,
        area: areaSelect,
      },
    });

    for (const plano of planos) {
      // A observacao de origem ja aparece com o antes/depois: nao duplica.
      if (plano.observacaoId && observacoesIncluidas.has(plano.observacaoId)) continue;
      itens.push({
        origem: 'PLANO',
        id: plano.id,
        data: plano.dataConclusao ?? plano.criadoEm,
        area: nomeDaArea(plano.area),
        titulo: `Plano de acao ${plano.codigo}`,
        descricao: [plano.acao, plano.descricao].filter(Boolean).join(' · '),
        fotoAntesUrl: plano.fotoInicialUrl,
        fotoDepoisUrl: plano.evidenciaUrl,
        situacao: ROTULO_STATUS_PLANO[plano.status as StatusPlano] ?? plano.status,
        responsavel: plano.responsavelNome,
        grau: plano.criticidade,
      });
    }
  }

  if (filtro.incluirChecklists) {
    const execucoes = await prisma.execucaoChecklist.findMany({
      where: { clienteId: filtro.clienteId, ...porArea, dataHora: janela, fotoUrl: { not: null } },
      orderBy: { dataHora: 'asc' },
      take: LIMITE_ITENS,
      select: {
        id: true,
        dataHora: true,
        equipamentoIdentificacao: true,
        executadoPor: true,
        resultado: true,
        fotoUrl: true,
        area: areaSelect,
        modelo: { select: { nome: true } },
      },
    });

    for (const execucao of execucoes) {
      itens.push({
        origem: 'CHECKLIST',
        id: execucao.id,
        data: execucao.dataHora,
        area: nomeDaArea(execucao.area),
        titulo: `Checklist: ${execucao.modelo.nome}`,
        descricao: `Equipamento ${execucao.equipamentoIdentificacao}`,
        fotoAntesUrl: execucao.fotoUrl,
        fotoDepoisUrl: null,
        situacao: execucao.resultado === 'APTO' ? 'Apto' : 'Nao apto',
        responsavel: execucao.executadoPor,
        grau: null,
      });
    }
  }

  itens.sort((a, b) => a.data.getTime() - b.data.getTime());
  const limitados = itens.slice(0, LIMITE_ITENS);

  return {
    geradoEm: new Date(),
    empresa: { nomeFantasia: empresa.nomeFantasia, logoUrl: empresa.logoUrl },
    cabecalho: montarCabecalhoInstitucional(empresa),
    cliente: { id: cliente.id, nomeFantasia: cliente.nomeFantasia, razaoSocial: cliente.razaoSocial, logoUrl: cliente.logoUrl },
    periodo: { de: filtro.de, ate: filtro.ate },
    resumo: {
      total: limitados.length,
      comAntesEDepois: limitados.filter((item) => item.fotoAntesUrl && item.fotoDepoisUrl).length,
      observacoes: limitados.filter((item) => item.origem === 'OBSERVACAO').length,
      planos: limitados.filter((item) => item.origem === 'PLANO').length,
      checklists: limitados.filter((item) => item.origem === 'CHECKLIST').length,
      truncado: itens.length > LIMITE_ITENS,
    },
    itens: limitados,
  };
}
