import type { Prisma } from '@prisma/client';
import {
  type ColaboradorCreateData,
  type ColaboradorFiltro,
  situacaoDaValidade,
  diasAteVencer,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { Conflito, NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria, type ContextoAuditoria } from '../../lib/auditoria.js';

const ENTIDADE = 'Colaborador';

/* -------------------------------------------------------------------------- */
/* Leitura                                                                     */
/* -------------------------------------------------------------------------- */

function montarWhere(filtro: ColaboradorFiltro): Prisma.ColaboradorWhereInput {
  const where: Prisma.ColaboradorWhereInput = {};

  if (filtro.clienteId) where.clienteId = filtro.clienteId;
  if (filtro.terceiroId) where.terceiroId = filtro.terceiroId;
  if (filtro.areaId) where.areaId = filtro.areaId;
  if (filtro.vinculo) where.vinculo = filtro.vinculo;
  if (filtro.grauRisco) where.grauRisco = filtro.grauRisco;
  if (filtro.situacao) where.situacao = filtro.situacao;

  const busca = filtro.busca?.trim();
  if (busca) {
    where.OR = [
      { nome: { contains: busca, mode: 'insensitive' } },
      { cpf: { contains: busca.replace(/\D/g, '') || busca } },
      { matricula: { contains: busca, mode: 'insensitive' } },
      { funcao: { contains: busca, mode: 'insensitive' } },
      { setor: { contains: busca, mode: 'insensitive' } },
    ];
  }

  return where;
}

const COM_VINCULOS = {
  cliente: { select: { id: true, nomeFantasia: true } },
  terceiro: { select: { id: true, nomeFantasia: true } },
  area: { select: { id: true, nome: true, codigo: true } },
  /**
   * So o ASO mais recente com validade: e ele que responde "esta apto?".
   * O demissional fica de fora porque nao gera vigencia.
   */
  asos: {
    where: { tipo: { not: 'DEMISSIONAL' as const } },
    orderBy: { dataExame: 'desc' as const },
    take: 1,
    select: { id: true, tipo: true, dataExame: true, validade: true, resultado: true, restricoes: true },
  },
} satisfies Prisma.ColaboradorInclude;

type ColaboradorComVinculos = Prisma.ColaboradorGetPayload<{ include: typeof COM_VINCULOS }>;

/**
 * Acrescenta a situacao do ASO ao colaborador.
 *
 * Quem nunca fez exame nao e "vigente" nem "vencido": e `SEM_ASO`. Tratar os
 * dois como a mesma coisa esconderia exatamente o caso mais grave — alguem
 * trabalhando sem nenhum atestado.
 */
function comSituacaoDoAso(colaborador: ColaboradorComVinculos, hoje = new Date()) {
  const [ultimo] = colaborador.asos;
  const { asos: _asos, ...resto } = colaborador;

  return {
    ...resto,
    asoAtual: ultimo ?? null,
    situacaoAso: ultimo ? situacaoDaValidade(ultimo.validade, hoje) : ('SEM_ASO' as const),
    diasParaVencerAso: ultimo ? diasAteVencer(ultimo.validade, hoje) : null,
    /** `true` quando o colaborador nao pode estar em campo. */
    impedido: !ultimo || situacaoDaValidade(ultimo.validade, hoje) === 'VENCIDO' || ultimo.resultado === 'INAPTO',
  };
}

export async function listarColaboradores(filtro: ColaboradorFiltro) {
  const where = montarWhere(filtro);

  const [total, itens] = await prisma.$transaction([
    prisma.colaborador.count({ where }),
    prisma.colaborador.findMany({
      where,
      orderBy: { [filtro.ordenarPor]: filtro.direcao },
      skip: (filtro.pagina - 1) * filtro.porPagina,
      take: filtro.porPagina,
      include: COM_VINCULOS,
    }),
  ]);

  const hoje = new Date();
  let enriquecidos = itens.map((item) => comSituacaoDoAso(item, hoje));

  // O filtro de irregularidade depende do ASO, que so existe depois do
  // enriquecimento — por isso e aplicado aqui, e nao no `where`.
  if (filtro.asoIrregular) enriquecidos = enriquecidos.filter((item) => item.impedido);

  return {
    itens: enriquecidos,
    total: filtro.asoIrregular ? enriquecidos.length : total,
    pagina: filtro.pagina,
    porPagina: filtro.porPagina,
    totalPaginas: Math.max(1, Math.ceil(total / filtro.porPagina)),
  };
}

export async function obterColaboradorOuFalhar(id: string) {
  const colaborador = await prisma.colaborador.findUnique({
    where: { id },
    include: {
      ...COM_VINCULOS,
      asos: {
        orderBy: { dataExame: 'desc' },
        select: {
          id: true,
          tipo: true,
          dataExame: true,
          validade: true,
          resultado: true,
          restricoes: true,
          medicoNome: true,
          medicoCrm: true,
          arquivoUrl: true,
        },
      },
      documentos: {
        orderBy: { validade: 'asc' },
        select: { id: true, tipo: true, titulo: true, validade: true, situacao: true },
      },
    },
  });

  if (!colaborador) throw new NaoEncontrado('Colaborador nao encontrado.', 'COLABORADOR_NAO_ENCONTRADO');

  const vigentes = colaborador.asos.filter((aso) => aso.tipo !== 'DEMISSIONAL');
  const [ultimo] = vigentes;

  return {
    ...colaborador,
    asoAtual: ultimo ?? null,
    situacaoAso: ultimo ? situacaoDaValidade(ultimo.validade) : ('SEM_ASO' as const),
    diasParaVencerAso: ultimo ? diasAteVencer(ultimo.validade) : null,
    impedido: !ultimo || situacaoDaValidade(ultimo.validade) === 'VENCIDO' || ultimo.resultado === 'INAPTO',
  };
}

/** Lista enxuta para os seletores de ASO e de documento. */
export async function listarOpcoesColaboradores(clienteId?: string) {
  return prisma.colaborador.findMany({
    where: { situacao: 'ATIVO', ...(clienteId ? { clienteId } : {}) },
    orderBy: { nome: 'asc' },
    take: 500,
    select: { id: true, nome: true, cpf: true, funcao: true, grauRisco: true, clienteId: true, terceiroId: true },
  });
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * O CPF e unico **por cliente**, e nao global: a mesma pessoa pode prestar
 * servico em contratos diferentes, com funcao e grau de risco proprios.
 */
async function garantirCpfUnico(clienteId: string, cpf: string | undefined, ignorarId?: string): Promise<void> {
  if (!cpf) return;

  const existente = await prisma.colaborador.findFirst({
    where: { clienteId, cpf, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    select: { id: true, nome: true },
  });

  if (existente) {
    throw new Conflito(`Este CPF ja esta cadastrado neste cliente para "${existente.nome}".`, 'CPF_DUPLICADO', {
      campos: { cpf: ['CPF ja cadastrado neste cliente.'] },
    });
  }
}

/** Terceiro e area precisam pertencer ao mesmo cliente do colaborador. */
async function validarVinculos(dados: Partial<ColaboradorCreateData>, clienteId: string): Promise<void> {
  if (dados.terceiroId) {
    const terceiro = await prisma.terceiro.findUnique({
      where: { id: dados.terceiroId },
      select: { clienteId: true },
    });
    if (!terceiro) throw new NaoEncontrado('Empresa contratada nao encontrada.', 'TERCEIRO_NAO_ENCONTRADO');
    if (terceiro.clienteId !== clienteId) {
      throw new RequisicaoInvalida('A empresa contratada pertence a outro cliente.', 'TERCEIRO_DE_OUTRO_CLIENTE', {
        campos: { terceiroId: ['Empresa contratada de outro cliente.'] },
      });
    }
  }

  if (dados.areaId) {
    const area = await prisma.area.findUnique({ where: { id: dados.areaId }, select: { clienteId: true } });
    if (!area) throw new NaoEncontrado('Area nao encontrada.', 'AREA_NAO_ENCONTRADA');
    if (area.clienteId !== clienteId) {
      throw new RequisicaoInvalida('A area pertence a outro cliente.', 'AREA_DE_OUTRO_CLIENTE', {
        campos: { areaId: ['Area de outro cliente.'] },
      });
    }
  }
}

export async function criarColaborador(dados: ColaboradorCreateData, contexto: ContextoAuditoria = {}) {
  const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true } });
  if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');

  await garantirCpfUnico(dados.clienteId, dados.cpf);
  await validarVinculos(dados, dados.clienteId);

  return prisma.$transaction(async (tx) => {
    const colaborador = await tx.colaborador.create({ data: dados as Prisma.ColaboradorUncheckedCreateInput });

    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: colaborador.id,
      acao: 'CRIACAO',
      alteracoes: calcularDiferenca({}, colaborador as unknown as Record<string, unknown>),
      contexto,
    });

    return colaborador;
  });
}

export async function atualizarColaborador(
  id: string,
  dados: Partial<ColaboradorCreateData>,
  contexto: ContextoAuditoria = {},
) {
  const atual = await prisma.colaborador.findUnique({ where: { id } });
  if (!atual) throw new NaoEncontrado('Colaborador nao encontrado.', 'COLABORADOR_NAO_ENCONTRADO');

  const clienteId = dados.clienteId ?? atual.clienteId;
  await garantirCpfUnico(clienteId, dados.cpf, id);
  await validarVinculos(dados, clienteId);

  return prisma.$transaction(async (tx) => {
    const colaborador = await tx.colaborador.update({
      where: { id },
      data: dados as Prisma.ColaboradorUncheckedUpdateInput,
    });

    const diferenca = calcularDiferenca(
      atual as unknown as Record<string, unknown>,
      colaborador as unknown as Record<string, unknown>,
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

    return colaborador;
  });
}

/**
 * Excluir apaga o historico de ASO junto (cascata no banco).
 *
 * Por isso quem ja tem exame registrado nao e excluido: o caminho e marcar
 * como desligado, que preserva a prova documental exigida em fiscalizacao.
 */
export async function excluirColaborador(id: string, contexto: ContextoAuditoria = {}): Promise<void> {
  const colaborador = await prisma.colaborador.findUnique({
    where: { id },
    select: { id: true, nome: true, cpf: true, _count: { select: { asos: true, documentos: true } } },
  });

  if (!colaborador) throw new NaoEncontrado('Colaborador nao encontrado.', 'COLABORADOR_NAO_ENCONTRADO');

  const historico = colaborador._count.asos + colaborador._count.documentos;
  if (historico > 0) {
    throw new Conflito(
      `Este colaborador tem ${colaborador._count.asos} ASO(s) e ${colaborador._count.documentos} documento(s). ` +
        'Marque como Desligado para preservar o historico.',
      'COLABORADOR_COM_HISTORICO',
      { detalhes: { asos: colaborador._count.asos, documentos: colaborador._count.documentos } },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.colaborador.delete({ where: { id } });
    await registrarAuditoria(tx, {
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'EXCLUSAO',
      alteracoes: { nome: { de: colaborador.nome, para: null } },
      contexto,
    });
  });
}

export async function listarAuditoriaColaborador(id: string, limite = 50) {
  await obterColaboradorOuFalhar(id);
  return prisma.registroAuditoria.findMany({
    where: { entidade: ENTIDADE, entidadeId: id },
    orderBy: { criadoEm: 'desc' },
    take: limite,
  });
}
