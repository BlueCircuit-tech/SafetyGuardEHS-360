import { randomInt } from 'node:crypto';
import type { Area, Prisma } from '@prisma/client';
import {
  ALFABETO_TOKEN_QR,
  TAMANHO_TOKEN_QR,
  type AreaCreateData,
  type AreaFiltro,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { Conflito, NaoEncontrado } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria, type ContextoAuditoria } from '../../lib/auditoria.js';
import { obterEmpresaOuFalhar } from '../empresa/empresa.service.js';
import { obterClienteOuFalhar } from '../clientes/cliente.service.js';

const ENTIDADE = 'Area';

export interface PaginaAreas {
  itens: Area[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

/* -------------------------------------------------------------------------- */
/* Token do QR Code                                                            */
/* -------------------------------------------------------------------------- */

/** Sorteia um token com alfabeto sem caracteres ambiguos (0/O, 1/I/L). */
function sortearToken(): string {
  let token = '';
  for (let i = 0; i < TAMANHO_TOKEN_QR; i += 1) {
    token += ALFABETO_TOKEN_QR[randomInt(ALFABETO_TOKEN_QR.length)];
  }
  return token;
}

/**
 * Gera um token livre. A colisao e improvavel (31^10), mas o `while` garante
 * que ela nunca vire um erro em producao.
 */
async function gerarTokenUnico(): Promise<string> {
  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    const token = sortearToken();
    const existente = await prisma.area.findUnique({ where: { tokenQr: token }, select: { id: true } });
    if (!existente) return token;
  }
  throw new Error('Nao foi possivel gerar um token de QR Code unico.');
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                     */
/* -------------------------------------------------------------------------- */

const COM_CLIENTE = {
  cliente: {
    select: {
      id: true,
      nomeFantasia: true,
      numeroContrato: true,
      corDestaque: true,
      centroNegocio: { select: { id: true, nome: true, codigo: true } },
    },
  },
} satisfies Prisma.AreaInclude;

function montarWhere(empresaId: string, filtro: AreaFiltro): Prisma.AreaWhereInput {
  // Escopo pela matriz: a area so existe dentro de um cliente da consultoria.
  const cliente: Prisma.ClienteWhereInput = { empresaId };
  if (filtro.centroNegocioId) cliente.centroNegocioId = filtro.centroNegocioId;

  const where: Prisma.AreaWhereInput = { cliente };

  if (filtro.clienteId) where.clienteId = filtro.clienteId;
  if (filtro.tipo) where.tipo = filtro.tipo;
  if (filtro.criticidade) where.criticidade = filtro.criticidade;
  if (filtro.situacao) where.situacao = filtro.situacao;

  const busca = filtro.busca?.trim();
  if (busca) {
    where.OR = [
      { nome: { contains: busca, mode: 'insensitive' } },
      { codigo: { contains: busca, mode: 'insensitive' } },
      { setor: { contains: busca, mode: 'insensitive' } },
      { riscosPresentes: { contains: busca, mode: 'insensitive' } },
      { pontoReferencia: { contains: busca, mode: 'insensitive' } },
      { tokenQr: { equals: busca.toUpperCase() } },
    ];
  }

  return where;
}

export async function listarAreas(filtro: AreaFiltro): Promise<PaginaAreas> {
  const empresa = await obterEmpresaOuFalhar();
  const where = montarWhere(empresa.id, filtro);

  const [total, itens] = await prisma.$transaction([
    prisma.area.count({ where }),
    prisma.area.findMany({
      where,
      orderBy: [{ [filtro.ordenarPor]: filtro.direcao }, { nome: 'asc' }],
      skip: (filtro.pagina - 1) * filtro.porPagina,
      take: filtro.porPagina,
      include: COM_CLIENTE,
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

export async function obterAreaOuFalhar(id: string): Promise<Area> {
  const area = await prisma.area.findUnique({ where: { id }, include: COM_CLIENTE });
  if (!area) throw new NaoEncontrado('Area nao encontrada.', 'AREA_NAO_ENCONTRADA');
  return area;
}

/**
 * Resolve a leitura do QR Code.
 *
 * E o primeiro passo do fluxo de campo: o inspetor aponta a camera, cai neste
 * endpoint e recebe tudo que o formulario de observacao precisa ja preenchido.
 */
export async function resolverTokenQr(token: string): Promise<Area> {
  const area = await prisma.area.findUnique({
    where: { tokenQr: token.trim().toUpperCase() },
    include: COM_CLIENTE,
  });

  if (!area) throw new NaoEncontrado('QR Code nao reconhecido.', 'QR_NAO_RECONHECIDO');
  if (area.situacao === 'INATIVA') {
    throw new Conflito('Esta area esta inativa — nao aceita novas inspecoes.', 'AREA_INATIVA');
  }

  return area;
}

/** Lista enxuta para seletores (formulario de observacao, filtros). */
export async function listarOpcoesAreas(clienteId?: string) {
  const empresa = await obterEmpresaOuFalhar();

  return prisma.area.findMany({
    where: { cliente: { empresaId: empresa.id }, situacao: 'ATIVA', ...(clienteId ? { clienteId } : {}) },
    orderBy: [{ setor: 'asc' }, { nome: 'asc' }],
    select: {
      id: true,
      nome: true,
      codigo: true,
      setor: true,
      tipo: true,
      criticidade: true,
      tokenQr: true,
      clienteId: true,
    },
  });
}

/** Contagens dos cards da listagem. */
export async function resumoAreas(clienteId?: string) {
  const empresa = await obterEmpresaOuFalhar();
  const base: Prisma.AreaWhereInput = {
    cliente: { empresaId: empresa.id },
    ...(clienteId ? { clienteId } : {}),
  };

  const [total, ativas, criticas, altas, comPermissao] = await prisma.$transaction([
    prisma.area.count({ where: base }),
    prisma.area.count({ where: { ...base, situacao: 'ATIVA' } }),
    prisma.area.count({ where: { ...base, criticidade: 'CRITICA', situacao: 'ATIVA' } }),
    prisma.area.count({ where: { ...base, criticidade: 'ALTA', situacao: 'ATIVA' } }),
    prisma.area.count({ where: { ...base, exigePermissaoTrabalho: true, situacao: 'ATIVA' } }),
  ]);

  return { total, ativas, inativas: total - ativas, criticas, altas, comPermissaoTrabalho: comPermissao };
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                     */
/* -------------------------------------------------------------------------- */

/** O codigo aparece na placa e nos relatorios — unico dentro do cliente. */
async function garantirCodigoUnico(clienteId: string, codigo: string | undefined, ignorarId?: string): Promise<void> {
  if (!codigo) return;

  const existente = await prisma.area.findFirst({
    where: { clienteId, codigo, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    select: { id: true, nome: true },
  });

  if (existente) {
    throw new Conflito(`O codigo ${codigo} ja pertence a area "${existente.nome}".`, 'CODIGO_AREA_DUPLICADO', {
      campos: { codigo: ['Codigo ja utilizado por outra area deste cliente.'] },
    });
  }
}

export async function criarArea(dados: AreaCreateData, contexto: ContextoAuditoria = {}): Promise<Area> {
  await obterClienteOuFalhar(dados.clienteId);
  await garantirCodigoUnico(dados.clienteId, dados.codigo);

  const tokenQr = await gerarTokenUnico();

  return prisma.$transaction(async (tx) => {
    const area = await tx.area.create({ data: { ...dados, tokenQr } });

    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: area.id,
      acao: 'CRIACAO',
      alteracoes: calcularDiferenca({}, area as unknown as Record<string, unknown>),
      contexto,
    });

    return area;
  });
}

export async function atualizarArea(
  id: string,
  dados: Partial<AreaCreateData>,
  contexto: ContextoAuditoria = {},
): Promise<Area> {
  const atual = await obterAreaOuFalhar(id);
  const clienteDestino = dados.clienteId ?? atual.clienteId;

  if (dados.clienteId && dados.clienteId !== atual.clienteId) {
    await obterClienteOuFalhar(dados.clienteId);
  }
  await garantirCodigoUnico(clienteDestino, dados.codigo ?? atual.codigo, id);

  return prisma.$transaction(async (tx) => {
    const area = await tx.area.update({ where: { id }, data: dados });

    const diferenca = calcularDiferenca(
      atual as unknown as Record<string, unknown>,
      area as unknown as Record<string, unknown>,
    );

    if (Object.keys(diferenca).length > 0) {
      await registrarAuditoria(tx, {
        entidade: ENTIDADE,
        entidadeId: area.id,
        acao: 'ATUALIZACAO',
        alteracoes: diferenca,
        contexto,
      });
    }

    return area;
  });
}

export async function excluirArea(id: string, contexto: ContextoAuditoria = {}): Promise<void> {
  const area = await obterAreaOuFalhar(id);

  await prisma.$transaction(async (tx) => {
    await tx.area.delete({ where: { id } });
    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'EXCLUSAO',
      alteracoes: { nome: { de: area.nome, para: null }, codigo: { de: area.codigo, para: null } },
      contexto,
    });
  });
}

/**
 * Emite um novo token para a area.
 *
 * Usado quando a placa e comprometida (foto vazada, QR adulterado). Invalida
 * as placas impressas — por isso e uma acao explicita e auditada, e nao um
 * efeito colateral da edicao.
 */
export async function regenerarTokenQr(id: string, contexto: ContextoAuditoria = {}): Promise<Area> {
  const atual = await obterAreaOuFalhar(id);
  const tokenQr = await gerarTokenUnico();

  return prisma.$transaction(async (tx) => {
    const area = await tx.area.update({ where: { id }, data: { tokenQr } });

    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'ATUALIZACAO',
      alteracoes: { tokenQr: { de: atual.tokenQr, para: tokenQr } },
      contexto,
    });

    return area;
  });
}

export async function listarAuditoriaArea(id: string, limite = 50) {
  await obterAreaOuFalhar(id);
  return prisma.registroAuditoria.findMany({
    where: { entidade: ENTIDADE, entidadeId: id },
    orderBy: { criadoEm: 'desc' },
    take: limite,
  });
}
