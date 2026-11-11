import ExcelJS from 'exceljs';
import type { Prisma } from '@prisma/client';
import {
  ROTULO_SITUACAO_LANCAMENTO,
  ROTULO_TIPO_LANCAMENTO,
  lancamentoVencido,
  type LancamentoFiltro,
  type SituacaoLancamento,
  type TipoLancamento,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';

/* -------------------------------------------------------------------------- */
/* Consulta                                                                    */
/* -------------------------------------------------------------------------- */

export const INCLUIR_VINCULOS = {
  cliente: { select: { id: true, nomeFantasia: true } },
  fornecedor: { select: { id: true, nome: true } },
} as const;

type LancamentoComVinculos = Prisma.LancamentoFinanceiroGetPayload<{ include: typeof INCLUIR_VINCULOS }>;

export function intervaloDoAno(ano: number): { inicio: Date; fim: Date } {
  return { inicio: new Date(Date.UTC(ano, 0, 1)), fim: new Date(Date.UTC(ano + 1, 0, 1)) };
}

export function montarWhere(filtro: LancamentoFiltro): Prisma.LancamentoFinanceiroWhereInput {
  const where: Prisma.LancamentoFinanceiroWhereInput = {};

  if (filtro.clienteId) where.clienteId = filtro.clienteId;
  if (filtro.fornecedorId) where.fornecedorId = filtro.fornecedorId;
  if (filtro.tipo) where.tipo = filtro.tipo;
  if (filtro.situacao) where.situacao = filtro.situacao;

  const data: Prisma.DateTimeFilter = {};
  if (filtro.ano) {
    const { inicio, fim } = intervaloDoAno(filtro.ano);
    data.gte = inicio;
    data.lt = fim;
  }
  if (filtro.de) data.gte = filtro.de;
  if (filtro.ate) data.lte = filtro.ate;
  if (Object.keys(data).length > 0) where.data = data;

  if (filtro.busca) {
    where.OR = [
      { descricao: { contains: filtro.busca, mode: 'insensitive' } },
      { categoria: { contains: filtro.busca, mode: 'insensitive' } },
      { notaFiscal: { contains: filtro.busca, mode: 'insensitive' } },
      { observacoes: { contains: filtro.busca, mode: 'insensitive' } },
    ];
  }

  return where;
}

/** Decimal vira numero e o lancamento ganha os rotulos e a flag de vencido. */
export function serializarLancamento(lancamento: LancamentoComVinculos, hoje = new Date()) {
  const situacao = lancamento.situacao as SituacaoLancamento;
  const tipo = lancamento.tipo as TipoLancamento;
  return {
    ...lancamento,
    valor: Number(lancamento.valor),
    vencido: lancamentoVencido({ situacao, vencimento: lancamento.vencimento }, hoje),
    rotulos: { tipo: ROTULO_TIPO_LANCAMENTO[tipo], situacao: ROTULO_SITUACAO_LANCAMENTO[situacao] },
  };
}

export type LancamentoSerializado = ReturnType<typeof serializarLancamento>;

export async function listarLancamentos(filtro: LancamentoFiltro): Promise<LancamentoSerializado[]> {
  const hoje = new Date();
  const itens = await prisma.lancamentoFinanceiro.findMany({
    where: montarWhere(filtro),
    orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
    include: INCLUIR_VINCULOS,
    take: 2000,
  });
  return itens.map((item) => serializarLancamento(item, hoje));
}

/* -------------------------------------------------------------------------- */
/* Resumo                                                                      */
/* -------------------------------------------------------------------------- */

const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const;

export interface LinhaMensal {
  mes: number;
  rotulo: string;
  receitas: number;
  despesas: number;
  saldo: number;
}

export interface ResumoFinanceiro {
  ano: number;
  clienteId: string | null;
  meses: LinhaMensal[];
  totais: {
    receitas: number;
    despesas: number;
    saldo: number;
    recebido: number;
    pago: number;
    aReceber: number;
    aPagar: number;
    lancamentos: number;
    cancelados: number;
  };
  pendentesVencidos: { quantidade: number; total: number };
  porCategoria: Array<{ tipo: TipoLancamento; categoria: string; total: number; quantidade: number }>;
  porCliente: Array<{ clienteId: string | null; nome: string; receitas: number; despesas: number; saldo: number }>;
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Resumo do ano: linha por mes, totais, pendencias vencidas e quebras por
 * categoria e por cliente. Lancamentos cancelados ficam fora de todas as somas
 * — aparecem so na contagem, para a tela mostrar que existem.
 */
export async function calcularResumo(ano: number, clienteId?: string): Promise<ResumoFinanceiro> {
  const { inicio, fim } = intervaloDoAno(ano);
  const hoje = new Date();

  const itens = await prisma.lancamentoFinanceiro.findMany({
    where: { data: { gte: inicio, lt: fim }, ...(clienteId ? { clienteId } : {}) },
    include: INCLUIR_VINCULOS,
  });

  const meses: LinhaMensal[] = NOMES_MES.map((rotulo, indice) => ({
    mes: indice + 1,
    rotulo,
    receitas: 0,
    despesas: 0,
    saldo: 0,
  }));

  const totais = { receitas: 0, despesas: 0, saldo: 0, recebido: 0, pago: 0, aReceber: 0, aPagar: 0, lancamentos: itens.length, cancelados: 0 };
  const pendentesVencidos = { quantidade: 0, total: 0 };
  const categorias = new Map<string, ResumoFinanceiro['porCategoria'][number]>();
  const clientes = new Map<string, ResumoFinanceiro['porCliente'][number]>();

  for (const item of itens) {
    if (item.situacao === 'CANCELADO') {
      totais.cancelados += 1;
      continue;
    }

    const valor = Number(item.valor);
    const tipo = item.tipo as TipoLancamento;
    const linha = meses[item.data.getUTCMonth()]!;

    if (tipo === 'RECEITA') {
      linha.receitas += valor;
      totais.receitas += valor;
      if (item.situacao === 'PAGO') totais.recebido += valor;
      else totais.aReceber += valor;
    } else {
      linha.despesas += valor;
      totais.despesas += valor;
      if (item.situacao === 'PAGO') totais.pago += valor;
      else totais.aPagar += valor;
    }

    if (lancamentoVencido({ situacao: item.situacao as SituacaoLancamento, vencimento: item.vencimento }, hoje)) {
      pendentesVencidos.quantidade += 1;
      pendentesVencidos.total += valor;
    }

    const chaveCategoria = `${tipo}|${item.categoria.trim().toLowerCase()}`;
    const categoria = categorias.get(chaveCategoria) ?? { tipo, categoria: item.categoria.trim(), total: 0, quantidade: 0 };
    categoria.total += valor;
    categoria.quantidade += 1;
    categorias.set(chaveCategoria, categoria);

    const chaveCliente = item.clienteId ?? '';
    const cliente = clientes.get(chaveCliente) ?? {
      clienteId: item.clienteId,
      nome: item.cliente?.nomeFantasia ?? 'Sem cliente',
      receitas: 0,
      despesas: 0,
      saldo: 0,
    };
    if (tipo === 'RECEITA') cliente.receitas += valor;
    else cliente.despesas += valor;
    clientes.set(chaveCliente, cliente);
  }

  for (const linha of meses) {
    linha.receitas = arredondar(linha.receitas);
    linha.despesas = arredondar(linha.despesas);
    linha.saldo = arredondar(linha.receitas - linha.despesas);
  }
  totais.saldo = totais.receitas - totais.despesas;
  for (const chave of ['receitas', 'despesas', 'saldo', 'recebido', 'pago', 'aReceber', 'aPagar'] as const) {
    totais[chave] = arredondar(totais[chave]);
  }
  pendentesVencidos.total = arredondar(pendentesVencidos.total);

  const porCategoria = [...categorias.values()]
    .map((c) => ({ ...c, total: arredondar(c.total) }))
    .sort((a, b) => (a.tipo === b.tipo ? b.total - a.total : a.tipo.localeCompare(b.tipo)));

  const porCliente = [...clientes.values()]
    .map((c) => ({ ...c, receitas: arredondar(c.receitas), despesas: arredondar(c.despesas), saldo: arredondar(c.receitas - c.despesas) }))
    .sort((a, b) => b.receitas - a.receitas || a.nome.localeCompare(b.nome));

  return { ano, clienteId: clienteId ?? null, meses, totais, pendentesVencidos, porCategoria, porCliente };
}

/* -------------------------------------------------------------------------- */
/* Excel                                                                       */
/* -------------------------------------------------------------------------- */

const FORMATO_REAL = '"R$" #,##0.00';
const FORMATO_DATA = 'dd/mm/yyyy';

function estilizarCabecalho(planilha: ExcelJS.Worksheet): void {
  const cabecalho = planilha.getRow(1);
  cabecalho.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cabecalho.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1C2E' } };
  cabecalho.alignment = { vertical: 'middle' };
  cabecalho.height = 20;
  planilha.views = [{ state: 'frozen', ySplit: 1 }];
}

function linhaDeTotal(planilha: ExcelJS.Worksheet, valores: Array<string | number | null>): void {
  const linha = planilha.addRow(valores);
  linha.font = { bold: true };
  linha.border = { top: { style: 'thin' } };
}

/**
 * Gera o Excel da planilha financeira: a aba "Lançamentos" com todas as
 * colunas e as abas de resumo (mensal, por categoria, por cliente).
 */
export async function gerarPlanilhaExcel(ano: number, clienteId?: string): Promise<ExcelJS.Workbook> {
  const [itens, resumo] = await Promise.all([
    listarLancamentos({ ano, clienteId }),
    calcularResumo(ano, clienteId),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SafetyGuard EHS 360';
  workbook.created = new Date();

  /* --- Lancamentos -------------------------------------------------------- */
  const abaLancamentos = workbook.addWorksheet('Lançamentos');
  abaLancamentos.columns = [
    { header: 'Data', key: 'data', width: 12, style: { numFmt: FORMATO_DATA } },
    { header: 'Tipo', key: 'tipo', width: 10 },
    { header: 'Categoria', key: 'categoria', width: 20 },
    { header: 'Descrição', key: 'descricao', width: 40 },
    { header: 'Cliente', key: 'cliente', width: 26 },
    { header: 'Fornecedor', key: 'fornecedor', width: 26 },
    { header: 'Valor (R$)', key: 'valor', width: 16, style: { numFmt: FORMATO_REAL } },
    { header: 'Vencimento', key: 'vencimento', width: 12, style: { numFmt: FORMATO_DATA } },
    { header: 'Situação', key: 'situacao', width: 12 },
    { header: 'Nota fiscal', key: 'notaFiscal', width: 14 },
    { header: 'Observações', key: 'observacoes', width: 40 },
  ];
  estilizarCabecalho(abaLancamentos);

  // Do mais antigo para o mais novo, como numa planilha de caixa.
  for (const item of [...itens].reverse()) {
    const linha = abaLancamentos.addRow({
      data: item.data,
      tipo: item.rotulos.tipo,
      categoria: item.categoria,
      descricao: item.descricao,
      cliente: item.cliente?.nomeFantasia ?? '',
      fornecedor: item.fornecedor?.nome ?? '',
      valor: item.tipo === 'DESPESA' ? -item.valor : item.valor,
      vencimento: item.vencimento ?? null,
      situacao: item.rotulos.situacao,
      notaFiscal: item.notaFiscal ?? '',
      observacoes: item.observacoes ?? '',
    });
    if (item.situacao === 'CANCELADO') linha.font = { strike: true, color: { argb: 'FF6B7C92' } };
    if (item.vencido) linha.getCell('situacao').font = { bold: true, color: { argb: 'FFB91C1C' } };
  }
  if (itens.length > 0) {
    abaLancamentos.autoFilter = { from: 'A1', to: `K${itens.length + 1}` };
  }
  linhaDeTotal(abaLancamentos, ['Total', null, null, null, null, null, resumo.totais.saldo]);

  /* --- Resumo mensal ------------------------------------------------------ */
  const abaResumo = workbook.addWorksheet('Resumo mensal');
  abaResumo.columns = [
    { header: 'Mês', key: 'mes', width: 12 },
    { header: 'Receitas (R$)', key: 'receitas', width: 18, style: { numFmt: FORMATO_REAL } },
    { header: 'Despesas (R$)', key: 'despesas', width: 18, style: { numFmt: FORMATO_REAL } },
    { header: 'Saldo (R$)', key: 'saldo', width: 18, style: { numFmt: FORMATO_REAL } },
  ];
  estilizarCabecalho(abaResumo);
  for (const linha of resumo.meses) {
    abaResumo.addRow({ mes: `${linha.rotulo}/${ano}`, receitas: linha.receitas, despesas: linha.despesas, saldo: linha.saldo });
  }
  linhaDeTotal(abaResumo, [`Total ${ano}`, resumo.totais.receitas, resumo.totais.despesas, resumo.totais.saldo]);
  abaResumo.addRow([]);
  abaResumo.addRow(['Recebido', resumo.totais.recebido]).getCell(2).numFmt = FORMATO_REAL;
  abaResumo.addRow(['A receber', resumo.totais.aReceber]).getCell(2).numFmt = FORMATO_REAL;
  abaResumo.addRow(['Pago', resumo.totais.pago]).getCell(2).numFmt = FORMATO_REAL;
  abaResumo.addRow(['A pagar', resumo.totais.aPagar]).getCell(2).numFmt = FORMATO_REAL;
  abaResumo.addRow(['Pendentes vencidos', resumo.pendentesVencidos.total, resumo.pendentesVencidos.quantidade]).getCell(2).numFmt =
    FORMATO_REAL;

  /* --- Por categoria ------------------------------------------------------ */
  const abaCategoria = workbook.addWorksheet('Por categoria');
  abaCategoria.columns = [
    { header: 'Tipo', key: 'tipo', width: 10 },
    { header: 'Categoria', key: 'categoria', width: 26 },
    { header: 'Lançamentos', key: 'quantidade', width: 14 },
    { header: 'Total (R$)', key: 'total', width: 18, style: { numFmt: FORMATO_REAL } },
  ];
  estilizarCabecalho(abaCategoria);
  for (const c of resumo.porCategoria) {
    abaCategoria.addRow({ tipo: ROTULO_TIPO_LANCAMENTO[c.tipo], categoria: c.categoria, quantidade: c.quantidade, total: c.total });
  }

  /* --- Por cliente -------------------------------------------------------- */
  const abaCliente = workbook.addWorksheet('Por cliente');
  abaCliente.columns = [
    { header: 'Cliente', key: 'nome', width: 30 },
    { header: 'Receitas (R$)', key: 'receitas', width: 18, style: { numFmt: FORMATO_REAL } },
    { header: 'Despesas (R$)', key: 'despesas', width: 18, style: { numFmt: FORMATO_REAL } },
    { header: 'Saldo (R$)', key: 'saldo', width: 18, style: { numFmt: FORMATO_REAL } },
  ];
  estilizarCabecalho(abaCliente);
  for (const c of resumo.porCliente) {
    abaCliente.addRow({ nome: c.nome, receitas: c.receitas, despesas: c.despesas, saldo: c.saldo });
  }
  linhaDeTotal(abaCliente, ['Total', resumo.totais.receitas, resumo.totais.despesas, resumo.totais.saldo]);

  return workbook;
}
