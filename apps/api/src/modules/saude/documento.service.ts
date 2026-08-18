import type { Prisma } from '@prisma/client';
import {
  type DocumentoCreateData,
  type DocumentoFiltro,
  calcularValidade,
  definicaoDoDocumento,
  diasAteVencer,
  situacaoDaValidade,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria, type ContextoAuditoria } from '../../lib/auditoria.js';

const ENTIDADE = 'DocumentoSsma';

/* -------------------------------------------------------------------------- */
/* Leitura                                                                     */
/* -------------------------------------------------------------------------- */

function montarWhere(filtro: DocumentoFiltro, hoje = new Date()): Prisma.DocumentoSsmaWhereInput {
  const where: Prisma.DocumentoSsmaWhereInput = {};

  if (filtro.clienteId) where.clienteId = filtro.clienteId;
  if (filtro.areaId) where.areaId = filtro.areaId;
  if (filtro.terceiroId) where.terceiroId = filtro.terceiroId;
  if (filtro.colaboradorId) where.colaboradorId = filtro.colaboradorId;
  if (filtro.observacaoId) where.observacaoId = filtro.observacaoId;
  if (filtro.tipo) where.tipo = filtro.tipo;
  if (filtro.abrangencia) where.abrangencia = filtro.abrangencia;
  if (filtro.situacao) where.situacao = filtro.situacao;

  const busca = filtro.busca?.trim();
  if (busca) {
    where.OR = [
      { titulo: { contains: busca, mode: 'insensitive' } },
      { numero: { contains: busca, mode: 'insensitive' } },
      { numeroArt: { contains: busca, mode: 'insensitive' } },
      { responsavelNome: { contains: busca, mode: 'insensitive' } },
    ];
  }

  if (filtro.vencimento) {
    const hojeZero = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const limiteAlerta = new Date(hojeZero.getTime());
    limiteAlerta.setDate(limiteAlerta.getDate() + 30);

    if (filtro.vencimento === 'VENCIDO') where.validade = { lt: hojeZero };
    else if (filtro.vencimento === 'A_VENCER') where.validade = { gte: hojeZero, lte: limiteAlerta };
    else if (filtro.vencimento === 'VIGENTE') where.validade = { gt: limiteAlerta };
    else where.validade = null;
  }

  return where;
}

const COM_ALVOS = {
  cliente: { select: { id: true, nomeFantasia: true } },
  area: { select: { id: true, nome: true, codigo: true } },
  terceiro: { select: { id: true, nomeFantasia: true } },
  colaborador: { select: { id: true, nome: true, cpf: true } },
  observacaoRef: { select: { id: true, descricao: true, dataHora: true } },
} satisfies Prisma.DocumentoSsmaInclude;

export async function listarDocumentos(filtro: DocumentoFiltro) {
  const hoje = new Date();
  const where = montarWhere(filtro, hoje);

  const [total, itens] = await prisma.$transaction([
    prisma.documentoSsma.count({ where }),
    prisma.documentoSsma.findMany({
      where,
      // `nulls: 'last'`: documento sem validade nao deve encabecar a fila de
      // renovacao ordenada por vencimento.
      orderBy: { [filtro.ordenarPor]: { sort: filtro.direcao, nulls: 'last' } },
      skip: (filtro.pagina - 1) * filtro.porPagina,
      take: filtro.porPagina,
      include: COM_ALVOS,
    }),
  ]);

  return {
    itens: itens.map((documento) => ({
      ...documento,
      situacaoVencimento: situacaoDaValidade(documento.validade, hoje),
      diasParaVencer: diasAteVencer(documento.validade, hoje),
    })),
    total,
    pagina: filtro.pagina,
    porPagina: filtro.porPagina,
    totalPaginas: Math.max(1, Math.ceil(total / filtro.porPagina)),
  };
}

export async function obterDocumentoOuFalhar(id: string) {
  const documento = await prisma.documentoSsma.findUnique({ where: { id }, include: COM_ALVOS });
  if (!documento) throw new NaoEncontrado('Documento nao encontrado.', 'DOCUMENTO_NAO_ENCONTRADO');

  return {
    ...documento,
    situacaoVencimento: situacaoDaValidade(documento.validade),
    diasParaVencer: diasAteVencer(documento.validade),
  };
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                     */
/* -------------------------------------------------------------------------- */

/** Cada alvo do documento precisa pertencer ao cliente informado. */
async function validarAlvos(dados: Partial<DocumentoCreateData>, clienteId: string): Promise<void> {
  const checagens: { id: string | null | undefined; campo: string; rotulo: string; buscar: () => Promise<{ clienteId: string } | null> }[] = [
    {
      id: dados.areaId,
      campo: 'areaId',
      rotulo: 'Area',
      buscar: () => prisma.area.findUnique({ where: { id: dados.areaId! }, select: { clienteId: true } }),
    },
    {
      id: dados.terceiroId,
      campo: 'terceiroId',
      rotulo: 'Empresa contratada',
      buscar: () => prisma.terceiro.findUnique({ where: { id: dados.terceiroId! }, select: { clienteId: true } }),
    },
    {
      id: dados.colaboradorId,
      campo: 'colaboradorId',
      rotulo: 'Colaborador',
      buscar: () => prisma.colaborador.findUnique({ where: { id: dados.colaboradorId! }, select: { clienteId: true } }),
    },
    {
      id: dados.observacaoId,
      campo: 'observacaoId',
      rotulo: 'Ocorrencia',
      buscar: () => prisma.observacao.findUnique({ where: { id: dados.observacaoId! }, select: { clienteId: true } }),
    },
  ];

  for (const checagem of checagens) {
    if (!checagem.id) continue;

    const registro = await checagem.buscar();
    if (!registro) throw new NaoEncontrado(`${checagem.rotulo} nao encontrado(a).`, 'ALVO_NAO_ENCONTRADO');

    if (registro.clienteId !== clienteId) {
      throw new RequisicaoInvalida(`${checagem.rotulo} pertence a outro cliente.`, 'ALVO_DE_OUTRO_CLIENTE', {
        campos: { [checagem.campo]: [`${checagem.rotulo} de outro cliente.`] },
      });
    }
  }
}

/**
 * Sugere a validade pelo catalogo quando o formulario nao informa.
 *
 * Tipos sem prazo padrao (PPP, procedimento) continuam sem validade — nao
 * inventamos uma data para eles.
 */
function resolverValidade(dados: DocumentoCreateData): Date | null {
  if (dados.validade) return dados.validade;

  const { validadeMeses } = definicaoDoDocumento(dados.tipo);
  return validadeMeses ? calcularValidade(dados.dataEmissao, validadeMeses) : null;
}

export async function criarDocumento(dados: DocumentoCreateData, contexto: ContextoAuditoria = {}) {
  const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true } });
  if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');

  await validarAlvos(dados, dados.clienteId);
  const validade = resolverValidade(dados);

  return prisma.$transaction(async (tx) => {
    const documento = await tx.documentoSsma.create({
      data: { ...dados, validade } as Prisma.DocumentoSsmaUncheckedCreateInput,
    });

    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: documento.id,
      acao: 'CRIACAO',
      alteracoes: calcularDiferenca({}, documento as unknown as Record<string, unknown>),
      contexto,
    });

    return documento;
  });
}

export async function atualizarDocumento(
  id: string,
  dados: Partial<DocumentoCreateData>,
  contexto: ContextoAuditoria = {},
) {
  const atual = await prisma.documentoSsma.findUnique({ where: { id } });
  if (!atual) throw new NaoEncontrado('Documento nao encontrado.', 'DOCUMENTO_NAO_ENCONTRADO');

  await validarAlvos(dados, dados.clienteId ?? atual.clienteId);

  return prisma.$transaction(async (tx) => {
    const documento = await tx.documentoSsma.update({
      where: { id },
      data: dados as Prisma.DocumentoSsmaUncheckedUpdateInput,
    });

    const diferenca = calcularDiferenca(
      atual as unknown as Record<string, unknown>,
      documento as unknown as Record<string, unknown>,
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

    return documento;
  });
}

/**
 * Registra a revisao de um documento.
 *
 * A revisao **nao sobrescreve** o original: o anterior fica como
 * `SUBSTITUIDO`, porque a fiscalizacao pode pedir a versao vigente numa data
 * passada. E a mesma logica do historico de ASO.
 */
export async function revisarDocumento(
  id: string,
  dados: Partial<DocumentoCreateData> & { revisao?: string | null },
  contexto: ContextoAuditoria = {},
) {
  const anterior = await prisma.documentoSsma.findUnique({ where: { id } });
  if (!anterior) throw new NaoEncontrado('Documento nao encontrado.', 'DOCUMENTO_NAO_ENCONTRADO');

  if (anterior.situacao !== 'ATIVO') {
    throw new RequisicaoInvalida(
      'Só um documento ativo pode ser revisado.',
      'DOCUMENTO_NAO_ATIVO',
      { detalhes: { situacao: anterior.situacao } },
    );
  }

  const { id: _id, criadoEm: _criadoEm, atualizadoEm: _atualizadoEm, ...campos } = anterior;

  return prisma.$transaction(async (tx) => {
    await tx.documentoSsma.update({ where: { id }, data: { situacao: 'SUBSTITUIDO' } });

    const novo = await tx.documentoSsma.create({
      data: { ...campos, ...dados, situacao: 'ATIVO' } as Prisma.DocumentoSsmaUncheckedCreateInput,
    });

    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'ATUALIZACAO',
      alteracoes: { situacao: { de: anterior.situacao, para: 'SUBSTITUIDO' }, revisadoPor: { de: null, para: novo.id } },
      contexto,
    });

    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: novo.id,
      acao: 'CRIACAO',
      alteracoes: { revisaoDe: { de: null, para: id }, revisao: { de: anterior.revisao, para: novo.revisao } },
      contexto,
    });

    return novo;
  });
}

export async function excluirDocumento(id: string, contexto: ContextoAuditoria = {}): Promise<void> {
  const documento = await prisma.documentoSsma.findUnique({
    where: { id },
    select: { id: true, titulo: true, tipo: true },
  });

  if (!documento) throw new NaoEncontrado('Documento nao encontrado.', 'DOCUMENTO_NAO_ENCONTRADO');

  await prisma.$transaction(async (tx) => {
    await tx.documentoSsma.delete({ where: { id } });
    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'EXCLUSAO',
      alteracoes: { titulo: { de: documento.titulo, para: null } },
      contexto,
    });
  });
}

export async function definirArquivoDoDocumento(id: string, url: string | null, contexto: ContextoAuditoria = {}) {
  const atual = await prisma.documentoSsma.findUnique({ where: { id }, select: { arquivoUrl: true } });
  if (!atual) throw new NaoEncontrado('Documento nao encontrado.', 'DOCUMENTO_NAO_ENCONTRADO');

  return prisma.$transaction(async (tx) => {
    const documento = await tx.documentoSsma.update({ where: { id }, data: { arquivoUrl: url } });

    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'ATUALIZACAO',
      alteracoes: { arquivoUrl: { de: atual.arquivoUrl, para: url } },
      contexto,
    });

    return documento;
  });
}

export async function listarAuditoriaDocumento(id: string, limite = 50) {
  await obterDocumentoOuFalhar(id);
  return prisma.registroAuditoria.findMany({
    where: { entidade: ENTIDADE, entidadeId: id },
    orderBy: { criadoEm: 'desc' },
    take: limite,
  });
}
