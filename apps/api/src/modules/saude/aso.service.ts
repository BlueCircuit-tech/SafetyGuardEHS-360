import type { Prisma } from '@prisma/client';
import {
  type AsoCreateData,
  type AsoFiltro,
  diasAteVencer,
  situacaoDaValidade,
  validadeSugeridaDoAso,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria, type ContextoAuditoria } from '../../lib/auditoria.js';

const ENTIDADE = 'Aso';

/* -------------------------------------------------------------------------- */
/* Leitura                                                                     */
/* -------------------------------------------------------------------------- */

function montarWhere(filtro: AsoFiltro, hoje = new Date()): Prisma.AsoWhereInput {
  const where: Prisma.AsoWhereInput = {};
  const doColaborador: Prisma.ColaboradorWhereInput = {};

  if (filtro.colaboradorId) where.colaboradorId = filtro.colaboradorId;
  if (filtro.tipo) where.tipo = filtro.tipo;
  if (filtro.resultado) where.resultado = filtro.resultado;

  if (filtro.clienteId) doColaborador.clienteId = filtro.clienteId;
  if (filtro.terceiroId) doColaborador.terceiroId = filtro.terceiroId;

  const busca = filtro.busca?.trim();
  if (busca) {
    where.OR = [
      { medicoNome: { contains: busca, mode: 'insensitive' } },
      { medicoCrm: { contains: busca, mode: 'insensitive' } },
      { colaborador: { nome: { contains: busca, mode: 'insensitive' } } },
      { colaborador: { cpf: { contains: busca.replace(/\D/g, '') || busca } } },
    ];
  }

  // A situacao de vencimento vira faixa de data no banco — assim a paginacao
  // continua correta, em vez de filtrar so a pagina ja carregada.
  if (filtro.situacao) {
    const hojeZero = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const limiteAlerta = new Date(hojeZero.getTime());
    limiteAlerta.setDate(limiteAlerta.getDate() + 30);

    if (filtro.situacao === 'VENCIDO') where.validade = { lt: hojeZero };
    else if (filtro.situacao === 'A_VENCER') where.validade = { gte: hojeZero, lte: limiteAlerta };
    else if (filtro.situacao === 'VIGENTE') where.validade = { gt: limiteAlerta };
    else where.validade = null;
  }

  if (Object.keys(doColaborador).length > 0) where.colaborador = doColaborador;

  return where;
}

const COM_COLABORADOR = {
  colaborador: {
    select: {
      id: true,
      nome: true,
      cpf: true,
      funcao: true,
      setor: true,
      grauRisco: true,
      situacao: true,
      clienteId: true,
      cliente: { select: { id: true, nomeFantasia: true } },
      terceiro: { select: { id: true, nomeFantasia: true } },
    },
  },
} satisfies Prisma.AsoInclude;

export async function listarAsos(filtro: AsoFiltro) {
  const hoje = new Date();
  const where = montarWhere(filtro, hoje);

  const [total, itens] = await prisma.$transaction([
    prisma.aso.count({ where }),
    prisma.aso.findMany({
      where,
      orderBy: { [filtro.ordenarPor]: filtro.direcao },
      skip: (filtro.pagina - 1) * filtro.porPagina,
      take: filtro.porPagina,
      include: COM_COLABORADOR,
    }),
  ]);

  return {
    itens: itens.map((aso) => ({
      ...aso,
      /** `clienteId` no topo para a barreira de escopo por cliente. */
      clienteId: aso.colaborador.clienteId,
      situacao: situacaoDaValidade(aso.validade, hoje),
      diasParaVencer: diasAteVencer(aso.validade, hoje),
    })),
    total,
    pagina: filtro.pagina,
    porPagina: filtro.porPagina,
    totalPaginas: Math.max(1, Math.ceil(total / filtro.porPagina)),
  };
}

export async function obterAsoOuFalhar(id: string) {
  const aso = await prisma.aso.findUnique({ where: { id }, include: COM_COLABORADOR });
  if (!aso) throw new NaoEncontrado('ASO nao encontrado.', 'ASO_NAO_ENCONTRADO');

  return {
    ...aso,
    clienteId: aso.colaborador.clienteId,
    situacao: situacaoDaValidade(aso.validade),
    diasParaVencer: diasAteVencer(aso.validade),
  };
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Preenche a validade quando o formulario nao informou.
 *
 * A periodicidade vem do grau de risco da funcao (NR-4/NR-7): risco alto
 * exige exame anual; os demais, bienal. E sugestao, nao imposicao — a lei tem
 * excecoes por agente e por idade, e o usuario pode informar outra data.
 */
async function resolverValidade(dados: AsoCreateData): Promise<Date | null> {
  if (dados.validade) return dados.validade;

  const colaborador = await prisma.colaborador.findUnique({
    where: { id: dados.colaboradorId },
    select: { grauRisco: true },
  });

  if (!colaborador) throw new NaoEncontrado('Colaborador nao encontrado.', 'COLABORADOR_NAO_ENCONTRADO');

  return validadeSugeridaDoAso(dados.dataExame, colaborador.grauRisco, dados.tipo);
}

export async function criarAso(dados: AsoCreateData, contexto: ContextoAuditoria = {}) {
  const colaborador = await prisma.colaborador.findUnique({
    where: { id: dados.colaboradorId },
    select: { id: true, nome: true, situacao: true, dataAdmissao: true },
  });

  if (!colaborador) throw new NaoEncontrado('Colaborador nao encontrado.', 'COLABORADOR_NAO_ENCONTRADO');

  if (colaborador.dataAdmissao && dados.dataExame < colaborador.dataAdmissao && dados.tipo !== 'ADMISSIONAL') {
    throw new RequisicaoInvalida(
      'A data do exame e anterior a admissao do colaborador.',
      'EXAME_ANTES_DA_ADMISSAO',
      { campos: { dataExame: ['Exame anterior a admissao.'] } },
    );
  }

  const validade = await resolverValidade(dados);

  return prisma.$transaction(async (tx) => {
    const aso = await tx.aso.create({
      data: { ...dados, validade } as Prisma.AsoUncheckedCreateInput,
    });

    // O demissional encerra o vinculo — refletir isso no cadastro evita que o
    // colaborador continue aparecendo como pendencia de exame periodico.
    if (dados.tipo === 'DEMISSIONAL' && colaborador.situacao !== 'DESLIGADO') {
      await tx.colaborador.update({
        where: { id: colaborador.id },
        data: { situacao: 'DESLIGADO', dataDesligamento: dados.dataExame },
      });

      await registrarAuditoria(tx, {
        entidade: 'Colaborador',
        entidadeId: colaborador.id,
        acao: 'ATUALIZACAO',
        alteracoes: { situacao: { de: colaborador.situacao, para: 'DESLIGADO (ASO demissional)' } },
        contexto,
      });
    }

    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: aso.id,
      acao: 'CRIACAO',
      alteracoes: calcularDiferenca({}, aso as unknown as Record<string, unknown>),
      contexto,
    });

    return aso;
  });
}

export async function atualizarAso(id: string, dados: Partial<AsoCreateData>, contexto: ContextoAuditoria = {}) {
  const atual = await prisma.aso.findUnique({ where: { id } });
  if (!atual) throw new NaoEncontrado('ASO nao encontrado.', 'ASO_NAO_ENCONTRADO');

  return prisma.$transaction(async (tx) => {
    const aso = await tx.aso.update({ where: { id }, data: dados as Prisma.AsoUncheckedUpdateInput });

    const diferenca = calcularDiferenca(
      atual as unknown as Record<string, unknown>,
      aso as unknown as Record<string, unknown>,
    );

    if (Object.keys(diferenca).length > 0) {
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: id,
        acao: 'ATUALIZACAO',
        alteracoes: diferenca,
        contexto,
      });
    }

    return aso;
  });
}

export async function excluirAso(id: string, contexto: ContextoAuditoria = {}): Promise<void> {
  const aso = await prisma.aso.findUnique({ where: { id }, select: { id: true, tipo: true, dataExame: true } });
  if (!aso) throw new NaoEncontrado('ASO nao encontrado.', 'ASO_NAO_ENCONTRADO');

  await prisma.$transaction(async (tx) => {
    await tx.aso.delete({ where: { id } });
    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'EXCLUSAO',
      alteracoes: { tipo: { de: aso.tipo, para: null } },
      contexto,
    });
  });
}

/** Anexa a digitalizacao do atestado. */
export async function definirArquivoDoAso(id: string, url: string | null, contexto: ContextoAuditoria = {}) {
  const atual = await prisma.aso.findUnique({ where: { id }, select: { arquivoUrl: true } });
  if (!atual) throw new NaoEncontrado('ASO nao encontrado.', 'ASO_NAO_ENCONTRADO');

  return prisma.$transaction(async (tx) => {
    const aso = await tx.aso.update({ where: { id }, data: { arquivoUrl: url } });

    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'ATUALIZACAO',
      alteracoes: { arquivoUrl: { de: atual.arquivoUrl, para: url } },
      contexto,
    });

    return aso;
  });
}
