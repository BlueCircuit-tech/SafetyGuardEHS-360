import type { Cliente, Prisma } from '@prisma/client';
import { limparCnpj, type ClienteCreateData, type ClienteFiltro } from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { Conflito, NaoEncontrado } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria, type ContextoAuditoria } from '../../lib/auditoria.js';
import { obterEmpresaOuFalhar } from '../empresa/empresa.service.js';

const ENTIDADE = 'Cliente';

export interface PaginaClientes {
  itens: Cliente[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                     */
/* -------------------------------------------------------------------------- */

function montarWhere(empresaId: string, filtro: ClienteFiltro): Prisma.ClienteWhereInput {
  const where: Prisma.ClienteWhereInput = { empresaId };

  if (filtro.situacao) where.situacao = filtro.situacao;
  if (filtro.grauRisco) where.grauRisco = filtro.grauRisco;
  if (filtro.uf) where.uf = filtro.uf;
  if (filtro.centroNegocioId) where.centroNegocioId = filtro.centroNegocioId;
  if (filtro.semCentroNegocio === 'true') where.centroNegocioId = null;

  const busca = filtro.busca?.trim();
  if (busca) {
    const somenteDocumento = limparCnpj(busca);
    where.OR = [
      { nomeFantasia: { contains: busca, mode: 'insensitive' } },
      { razaoSocial: { contains: busca, mode: 'insensitive' } },
      { numeroContrato: { contains: busca, mode: 'insensitive' } },
      { cidade: { contains: busca, mode: 'insensitive' } },
      ...(somenteDocumento ? [{ cnpj: { contains: somenteDocumento } }] : []),
    ];
  }

  return where;
}

export async function listarClientes(filtro: ClienteFiltro): Promise<PaginaClientes> {
  const empresa = await obterEmpresaOuFalhar();
  const where = montarWhere(empresa.id, filtro);

  const [total, itens] = await prisma.$transaction([
    prisma.cliente.count({ where }),
    prisma.cliente.findMany({
      where,
      orderBy: { [filtro.ordenarPor]: filtro.direcao },
      skip: (filtro.pagina - 1) * filtro.porPagina,
      take: filtro.porPagina,
      include: { centroNegocio: { select: { id: true, nome: true, codigo: true, corDestaque: true } } },
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

export async function obterClienteOuFalhar(id: string): Promise<Cliente> {
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: { centroNegocio: { select: { id: true, nome: true, codigo: true, corDestaque: true } } },
  });
  if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');
  return cliente;
}

/**
 * Lista enxuta para os seletores de cliente dos dashboards e dos cadastros
 * seguintes (unidades, inspecoes, documentos).
 */
export async function listarOpcoesClientes(apenasAtivos = true) {
  const empresa = await obterEmpresaOuFalhar();

  const clientes = await prisma.cliente.findMany({
    where: { empresaId: empresa.id, ...(apenasAtivos ? { situacao: 'ATIVO' } : {}) },
    orderBy: { nomeFantasia: 'asc' },
    select: {
      id: true,
      nomeFantasia: true,
      numeroContrato: true,
      situacao: true,
      corDestaque: true,
      grauRisco: true,
    },
  });

  return clientes;
}

/** Contagens usadas no cabecalho da listagem e nos cards do dashboard. */
export async function resumoClientes() {
  const empresa = await obterEmpresaOuFalhar();

  const daMatriz = { empresaId: empresa.id };

  const [total, ativos, suspensos, encerrados, agregados] = await prisma.$transaction([
    prisma.cliente.count({ where: daMatriz }),
    prisma.cliente.count({ where: { ...daMatriz, situacao: 'ATIVO' } }),
    prisma.cliente.count({ where: { ...daMatriz, situacao: 'SUSPENSO' } }),
    prisma.cliente.count({ where: { ...daMatriz, situacao: 'ENCERRADO' } }),
    prisma.cliente.aggregate({
      where: { ...daMatriz, situacao: 'ATIVO' },
      _sum: { quantidadeFuncionarios: true },
    }),
  ]);

  return {
    total,
    ativos,
    suspensos,
    encerrados,
    /** Trabalhadores sob cobertura dos contratos ativos. */
    funcionariosCobertos: agregados._sum.quantidadeFuncionarios ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * CNPJ e numero de contrato sao unicos dentro da matriz. A checagem aqui
 * existe para devolver a mensagem no campo certo — a garantia real e o
 * indice unico do banco.
 */
async function garantirUnicidade(
  empresaId: string,
  dados: { cnpj?: string; numeroContrato?: string },
  ignorarId?: string,
): Promise<void> {
  if (dados.cnpj) {
    const existente = await prisma.cliente.findFirst({
      where: { empresaId, cnpj: dados.cnpj, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
      select: { id: true, nomeFantasia: true },
    });
    if (existente) {
      throw new Conflito(`Este CNPJ ja esta cadastrado para o cliente "${existente.nomeFantasia}".`, 'CNPJ_DUPLICADO', {
        campos: { cnpj: ['CNPJ ja cadastrado para outro cliente.'] },
      });
    }
  }

  if (dados.numeroContrato) {
    const existente = await prisma.cliente.findFirst({
      where: { empresaId, numeroContrato: dados.numeroContrato, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
      select: { id: true, nomeFantasia: true },
    });
    if (existente) {
      throw new Conflito(
        `O contrato ${dados.numeroContrato} ja pertence ao cliente "${existente.nomeFantasia}".`,
        'CONTRATO_DUPLICADO',
        { campos: { numeroContrato: ['Numero de contrato ja utilizado.'] } },
      );
    }
  }
}

export async function criarCliente(dados: ClienteCreateData, contexto: ContextoAuditoria = {}): Promise<Cliente> {
  const empresa = await obterEmpresaOuFalhar();
  await garantirUnicidade(empresa.id, dados);

  return prisma.$transaction(async (tx) => {
    const cliente = await tx.cliente.create({ data: { ...dados, empresaId: empresa.id } });

    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: cliente.id,
      acao: 'CRIACAO',
      alteracoes: calcularDiferenca({}, cliente as unknown as Record<string, unknown>),
      contexto,
    });

    return cliente;
  });
}

export async function atualizarCliente(
  id: string,
  dados: Partial<ClienteCreateData>,
  contexto: ContextoAuditoria = {},
): Promise<Cliente> {
  const atual = await obterClienteOuFalhar(id);
  await garantirUnicidade(atual.empresaId, dados, id);

  return prisma.$transaction(async (tx) => {
    const cliente = await tx.cliente.update({ where: { id }, data: dados });

    const diferenca = calcularDiferenca(
      atual as unknown as Record<string, unknown>,
      cliente as unknown as Record<string, unknown>,
    );

    if (Object.keys(diferenca).length > 0) {
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: cliente.id,
        acao: 'ATUALIZACAO',
        alteracoes: diferenca,
        contexto,
      });
    }

    return cliente;
  });
}

/**
 * Exclusao definitiva. Em SSMA o normal e encerrar o contrato
 * (situacao = ENCERRADO) para preservar o historico; a exclusao fica
 * reservada a cadastros criados por engano.
 */
export async function excluirCliente(id: string, contexto: ContextoAuditoria = {}): Promise<void> {
  const cliente = await obterClienteOuFalhar(id);

  await prisma.$transaction(async (tx) => {
    await tx.cliente.delete({ where: { id } });
    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'EXCLUSAO',
      alteracoes: {
        nomeFantasia: { de: cliente.nomeFantasia, para: null },
        numeroContrato: { de: cliente.numeroContrato, para: null },
      },
      contexto,
    });
  });
}

export async function definirLogoCliente(
  id: string,
  logoUrl: string | null,
  contexto: ContextoAuditoria = {},
): Promise<Cliente> {
  return atualizarCliente(id, { logoUrl }, contexto);
}

export async function listarAuditoriaCliente(id: string, limite = 50) {
  await obterClienteOuFalhar(id);
  return prisma.registroAuditoria.findMany({
    where: { entidade: ENTIDADE, entidadeId: id },
    orderBy: { criadoEm: 'desc' },
    take: limite,
  });
}
