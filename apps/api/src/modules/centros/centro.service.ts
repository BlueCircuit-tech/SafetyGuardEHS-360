import type { CentroNegocio, Prisma } from '@prisma/client';
import type { CentroNegocioCreateData, CentroNegocioFiltro } from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { Conflito, NaoEncontrado } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria, type ContextoAuditoria } from '../../lib/auditoria.js';
import { obterEmpresaOuFalhar } from '../empresa/empresa.service.js';

const ENTIDADE = 'CentroNegocio';

export interface PaginaCentros {
  itens: CentroNegocio[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                     */
/* -------------------------------------------------------------------------- */

function montarWhere(empresaId: string, filtro: CentroNegocioFiltro): Prisma.CentroNegocioWhereInput {
  const where: Prisma.CentroNegocioWhereInput = { empresaId };

  if (filtro.tipo) where.tipo = filtro.tipo;
  if (filtro.situacao) where.situacao = filtro.situacao;
  if (filtro.uf) where.uf = filtro.uf;

  const busca = filtro.busca?.trim();
  if (busca) {
    where.OR = [
      { nome: { contains: busca, mode: 'insensitive' } },
      { codigo: { contains: busca, mode: 'insensitive' } },
      { responsavelNome: { contains: busca, mode: 'insensitive' } },
      { cidade: { contains: busca, mode: 'insensitive' } },
    ];
  }

  return where;
}

/**
 * A contagem de clientes e de terceiros vem junto: e ela que mostra se o
 * agrupamento esta sendo realmente usado ou se ficou orfao.
 */
const COM_CONTAGENS = {
  _count: { select: { clientes: true } },
} satisfies Prisma.CentroNegocioInclude;

export async function listarCentros(filtro: CentroNegocioFiltro): Promise<PaginaCentros> {
  const empresa = await obterEmpresaOuFalhar();
  const where = montarWhere(empresa.id, filtro);

  const [total, itens] = await prisma.$transaction([
    prisma.centroNegocio.count({ where }),
    prisma.centroNegocio.findMany({
      where,
      orderBy: { [filtro.ordenarPor]: filtro.direcao },
      skip: (filtro.pagina - 1) * filtro.porPagina,
      take: filtro.porPagina,
      include: COM_CONTAGENS,
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

export async function obterCentroOuFalhar(id: string): Promise<CentroNegocio> {
  const centro = await prisma.centroNegocio.findUnique({ where: { id }, include: COM_CONTAGENS });
  if (!centro) throw new NaoEncontrado('Centro de negocio nao encontrado.', 'CENTRO_NAO_ENCONTRADO');
  return centro;
}

/** Lista enxuta para os seletores do cadastro de cliente e dos dashboards. */
export async function listarOpcoesCentros(apenasAtivos = true) {
  const empresa = await obterEmpresaOuFalhar();

  return prisma.centroNegocio.findMany({
    where: { empresaId: empresa.id, ...(apenasAtivos ? { situacao: 'ATIVO' } : {}) },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, codigo: true, tipo: true, situacao: true, corDestaque: true },
  });
}

/**
 * Consolidado por centro: quantos clientes e terceiros, quantos trabalhadores
 * estao cobertos. E a base do comparativo entre centros no dashboard.
 */
export async function consolidadoPorCentro() {
  const empresa = await obterEmpresaOuFalhar();

  const centros = await prisma.centroNegocio.findMany({
    where: { empresaId: empresa.id },
    orderBy: { nome: 'asc' },
    select: {
      id: true,
      nome: true,
      codigo: true,
      tipo: true,
      situacao: true,
      corDestaque: true,
      metaIndiceGlobal: true,
      clientes: {
        select: {
          situacao: true,
          quantidadeFuncionarios: true,
          _count: { select: { terceiros: true } },
        },
      },
    },
  });

  const linhas = centros.map((centro) => {
    const ativos = centro.clientes.filter((cliente) => cliente.situacao === 'ATIVO');

    return {
      id: centro.id,
      nome: centro.nome,
      codigo: centro.codigo,
      tipo: centro.tipo,
      situacao: centro.situacao,
      corDestaque: centro.corDestaque,
      metaIndiceGlobal: Number(centro.metaIndiceGlobal),
      clientes: centro.clientes.length,
      clientesAtivos: ativos.length,
      terceiros: centro.clientes.reduce((soma, cliente) => soma + cliente._count.terceiros, 0),
      funcionariosCobertos: ativos.reduce((soma, cliente) => soma + cliente.quantidadeFuncionarios, 0),
    };
  });

  const semCentro = await prisma.cliente.count({ where: { empresaId: empresa.id, centroNegocioId: null } });

  return { centros: linhas, clientesSemCentro: semCentro };
}

/** Contagens dos cards da listagem. */
export async function resumoCentros() {
  const empresa = await obterEmpresaOuFalhar();
  const daMatriz = { empresaId: empresa.id };

  const [total, ativos, inativos, semCentro, semClientes] = await prisma.$transaction([
    prisma.centroNegocio.count({ where: daMatriz }),
    prisma.centroNegocio.count({ where: { ...daMatriz, situacao: 'ATIVO' } }),
    prisma.centroNegocio.count({ where: { ...daMatriz, situacao: 'INATIVO' } }),
    prisma.cliente.count({ where: { ...daMatriz, centroNegocioId: null } }),
    prisma.centroNegocio.count({ where: { ...daMatriz, clientes: { none: {} } } }),
  ]);

  return { total, ativos, inativos, clientesSemCentro: semCentro, centrosSemClientes: semClientes };
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                     */
/* -------------------------------------------------------------------------- */

/** O codigo e o identificador curto usado em relatorio e filtro — unico por matriz. */
async function garantirCodigoUnico(empresaId: string, codigo: string | undefined, ignorarId?: string): Promise<void> {
  if (!codigo) return;

  const existente = await prisma.centroNegocio.findFirst({
    where: { empresaId, codigo, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    select: { id: true, nome: true },
  });

  if (existente) {
    throw new Conflito(`O codigo ${codigo} ja pertence ao centro "${existente.nome}".`, 'CODIGO_CENTRO_DUPLICADO', {
      campos: { codigo: ['Codigo ja utilizado por outro centro de negocio.'] },
    });
  }
}

export async function criarCentro(
  dados: CentroNegocioCreateData,
  contexto: ContextoAuditoria = {},
): Promise<CentroNegocio> {
  const empresa = await obterEmpresaOuFalhar();
  await garantirCodigoUnico(empresa.id, dados.codigo);

  return prisma.$transaction(async (tx) => {
    const centro = await tx.centroNegocio.create({ data: { ...dados, empresaId: empresa.id } });

    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: centro.id,
      acao: 'CRIACAO',
      alteracoes: calcularDiferenca({}, centro as unknown as Record<string, unknown>),
      contexto,
    });

    return centro;
  });
}

export async function atualizarCentro(
  id: string,
  dados: Partial<CentroNegocioCreateData>,
  contexto: ContextoAuditoria = {},
): Promise<CentroNegocio> {
  const atual = await obterCentroOuFalhar(id);
  await garantirCodigoUnico(atual.empresaId, dados.codigo, id);

  return prisma.$transaction(async (tx) => {
    const centro = await tx.centroNegocio.update({ where: { id }, data: dados });

    const diferenca = calcularDiferenca(
      atual as unknown as Record<string, unknown>,
      centro as unknown as Record<string, unknown>,
    );

    if (Object.keys(diferenca).length > 0) {
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: centro.id,
        acao: 'ATUALIZACAO',
        alteracoes: diferenca,
        contexto,
      });
    }

    return centro;
  });
}

/**
 * Exclusao bloqueada enquanto houver cliente vinculado — apagar o centro
 * deixaria os clientes orfaos sem aviso. O caminho e desvincular ou inativar.
 */
export async function excluirCentro(id: string, contexto: ContextoAuditoria = {}): Promise<void> {
  const centro = await obterCentroOuFalhar(id);

  const vinculados = await prisma.cliente.count({ where: { centroNegocioId: id } });
  if (vinculados > 0) {
    throw new Conflito(
      `Este centro tem ${vinculados} cliente(s) vinculado(s). Desvincule-os ou mude a situacao para Inativo.`,
      'CENTRO_COM_CLIENTES',
      { detalhes: { clientesVinculados: vinculados } },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.centroNegocio.delete({ where: { id } });
    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'EXCLUSAO',
      alteracoes: { nome: { de: centro.nome, para: null }, codigo: { de: centro.codigo, para: null } },
      contexto,
    });
  });
}

/** Vincula ou desvincula clientes em lote — util na organizacao inicial. */
export async function vincularClientes(
  id: string,
  clienteIds: string[],
  contexto: ContextoAuditoria = {},
): Promise<{ vinculados: number }> {
  const centro = await obterCentroOuFalhar(id);

  const validos = await prisma.cliente.findMany({
    where: { id: { in: clienteIds }, empresaId: centro.empresaId },
    select: { id: true },
  });

  if (validos.length !== clienteIds.length) {
    throw new NaoEncontrado('Um ou mais clientes informados nao pertencem a esta matriz.', 'CLIENTE_NAO_ENCONTRADO');
  }

  return prisma.$transaction(async (tx) => {
    const resultado = await tx.cliente.updateMany({
      where: { id: { in: clienteIds } },
      data: { centroNegocioId: id },
    });

    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'ATUALIZACAO',
      alteracoes: { clientesVinculados: { de: null, para: clienteIds.length } },
      contexto,
    });

    return { vinculados: resultado.count };
  });
}

export async function listarAuditoriaCentro(id: string, limite = 50) {
  await obterCentroOuFalhar(id);
  return prisma.registroAuditoria.findMany({
    where: { entidade: ENTIDADE, entidadeId: id },
    orderBy: { criadoEm: 'desc' },
    take: limite,
  });
}
