import ExcelJS from 'exceljs';
import type { Prisma } from '@prisma/client';
import { horasLiquidas, intervaloDoMes, valorDoRegistro } from '@safetyguard/shared';
import { prisma } from '../../db.js';

/* -------------------------------------------------------------------------- */
/* Consulta                                                                    */
/* -------------------------------------------------------------------------- */

export const INCLUIR_VINCULOS_PONTO = {
  usuario: { select: { id: true, nome: true } },
  cliente: { select: { id: true, nomeFantasia: true } },
} as const;

type RegistroComVinculos = Prisma.RegistroPontoGetPayload<{ include: typeof INCLUIR_VINCULOS_PONTO }>;

const FUSO = 'America/Sao_Paulo';

/** Decimal vira numero; o turno ganha o valor calculado e a flag de aberto. */
export function serializarRegistro(registro: RegistroComVinculos) {
  const horasTrabalhadas = registro.horasTrabalhadas === null ? null : Number(registro.horasTrabalhadas);
  const valorHora = registro.valorHora === null ? null : Number(registro.valorHora);
  return {
    ...registro,
    horasTrabalhadas,
    valorHora,
    valor: valorDoRegistro(horasTrabalhadas, valorHora),
    aberto: registro.saida === null,
  };
}

export type RegistroSerializado = ReturnType<typeof serializarRegistro>;

export interface EscopoPonto {
  mes: string;
  /** `undefined` = todos os usuarios (so quem gerencia usuarios chega aqui). */
  usuarioId?: string;
  clienteId?: string;
}

export function montarWherePonto(escopo: EscopoPonto): Prisma.RegistroPontoWhereInput {
  const { inicio, fim } = intervaloDoMes(escopo.mes);
  return {
    data: { gte: inicio, lt: fim },
    ...(escopo.usuarioId ? { usuarioId: escopo.usuarioId } : {}),
    ...(escopo.clienteId ? { clienteId: escopo.clienteId } : {}),
  };
}

export async function listarRegistros(escopo: EscopoPonto): Promise<RegistroSerializado[]> {
  const itens = await prisma.registroPonto.findMany({
    where: montarWherePonto(escopo),
    orderBy: [{ data: 'desc' }, { entrada: 'desc' }],
    include: INCLUIR_VINCULOS_PONTO,
  });
  return itens.map(serializarRegistro);
}

/* -------------------------------------------------------------------------- */
/* Resumo                                                                      */
/* -------------------------------------------------------------------------- */

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export interface ResumoPonto {
  mes: string;
  usuarioId: string | null;
  totalHoras: number;
  totalValor: number;
  diasTrabalhados: number;
  registros: number;
  abertos: number;
  porCliente: Array<{ clienteId: string | null; nome: string; horas: number; valor: number; registros: number }>;
  porUsuario: Array<{ usuarioId: string; nome: string; horas: number; valor: number; dias: number }>;
}

export function calcularResumo(mes: string, usuarioId: string | undefined, itens: RegistroSerializado[]): ResumoPonto {
  const clientes = new Map<string, ResumoPonto['porCliente'][number]>();
  const usuarios = new Map<string, ResumoPonto['porUsuario'][number] & { dias_: Set<string> }>();
  const dias = new Set<string>();
  let totalHoras = 0;
  let totalValor = 0;
  let abertos = 0;

  for (const item of itens) {
    if (item.aberto) abertos += 1;
    const horas = item.horasTrabalhadas ?? 0;
    const valor = item.valor ?? 0;
    const dia = item.data.toISOString().slice(0, 10);

    totalHoras += horas;
    totalValor += valor;
    if (horas > 0) dias.add(`${item.usuarioId}|${dia}`);

    const chaveCliente = item.clienteId ?? '';
    const cliente = clientes.get(chaveCliente) ?? {
      clienteId: item.clienteId,
      nome: item.cliente?.nomeFantasia ?? 'Sem cliente (interno)',
      horas: 0,
      valor: 0,
      registros: 0,
    };
    cliente.horas += horas;
    cliente.valor += valor;
    cliente.registros += 1;
    clientes.set(chaveCliente, cliente);

    const usuario = usuarios.get(item.usuarioId) ?? {
      usuarioId: item.usuarioId,
      nome: item.usuario.nome,
      horas: 0,
      valor: 0,
      dias: 0,
      dias_: new Set<string>(),
    };
    usuario.horas += horas;
    usuario.valor += valor;
    if (horas > 0) usuario.dias_.add(dia);
    usuarios.set(item.usuarioId, usuario);
  }

  return {
    mes,
    usuarioId: usuarioId ?? null,
    totalHoras: arredondar(totalHoras),
    totalValor: arredondar(totalValor),
    diasTrabalhados: dias.size,
    registros: itens.length,
    abertos,
    porCliente: [...clientes.values()]
      .map((c) => ({ ...c, horas: arredondar(c.horas), valor: arredondar(c.valor) }))
      .sort((a, b) => b.horas - a.horas || a.nome.localeCompare(b.nome)),
    porUsuario: [...usuarios.values()]
      .map(({ dias_, ...u }) => ({ ...u, horas: arredondar(u.horas), valor: arredondar(u.valor), dias: dias_.size }))
      .sort((a, b) => b.horas - a.horas || a.nome.localeCompare(b.nome)),
  };
}

/** Horas liquidas de um turno vindas de valores ja mesclados (atual + alteracao). */
export function horasDoTurno(entrada: Date, saida: Date | null, intervaloMinutos: number): number | null {
  return horasLiquidas(entrada, saida, intervaloMinutos);
}

/* -------------------------------------------------------------------------- */
/* Excel                                                                       */
/* -------------------------------------------------------------------------- */

const FORMATO_REAL = '"R$" #,##0.00';
const FORMATO_DATA = 'dd/mm/yyyy';
const FORMATO_HORAS = '0.00';

function hora(data: Date | null): string {
  if (!data) return '';
  return data.toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
}

function estilizarCabecalho(planilha: ExcelJS.Worksheet): void {
  const cabecalho = planilha.getRow(1);
  cabecalho.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cabecalho.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1C2E' } };
  cabecalho.alignment = { vertical: 'middle' };
  cabecalho.height = 20;
  planilha.views = [{ state: 'frozen', ySplit: 1 }];
}

/** Excel do mes: aba com os registros e aba com o resumo por cliente. */
export function gerarRelatorioExcel(mes: string, itens: RegistroSerializado[], resumo: ResumoPonto): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SafetyGuard EHS 360';
  workbook.created = new Date();

  const abaRegistros = workbook.addWorksheet('Registros');
  abaRegistros.columns = [
    { header: 'Data', key: 'data', width: 12, style: { numFmt: FORMATO_DATA } },
    { header: 'Consultor', key: 'usuario', width: 26 },
    { header: 'Cliente', key: 'cliente', width: 28 },
    { header: 'Entrada', key: 'entrada', width: 10 },
    { header: 'Saída', key: 'saida', width: 10 },
    { header: 'Intervalo (min)', key: 'intervalo', width: 14 },
    { header: 'Horas', key: 'horas', width: 10, style: { numFmt: FORMATO_HORAS } },
    { header: 'Valor/hora (R$)', key: 'valorHora', width: 16, style: { numFmt: FORMATO_REAL } },
    { header: 'Valor (R$)', key: 'valor', width: 16, style: { numFmt: FORMATO_REAL } },
    { header: 'Atividade', key: 'atividade', width: 44 },
  ];
  estilizarCabecalho(abaRegistros);

  for (const item of [...itens].reverse()) {
    abaRegistros.addRow({
      data: item.data,
      usuario: item.usuario.nome,
      cliente: item.cliente?.nomeFantasia ?? '',
      entrada: hora(item.entrada),
      saida: item.aberto ? '(aberto)' : hora(item.saida),
      intervalo: item.intervaloMinutos,
      horas: item.horasTrabalhadas,
      valorHora: item.valorHora,
      valor: item.valor,
      atividade: item.atividade ?? '',
    });
  }
  if (itens.length > 0) abaRegistros.autoFilter = { from: 'A1', to: `J${itens.length + 1}` };
  const total = abaRegistros.addRow(['Total do mês', null, null, null, null, null, resumo.totalHoras, null, resumo.totalValor]);
  total.font = { bold: true };
  total.border = { top: { style: 'thin' } };

  const abaResumo = workbook.addWorksheet('Resumo por cliente');
  abaResumo.columns = [
    { header: 'Cliente', key: 'nome', width: 30 },
    { header: 'Registros', key: 'registros', width: 12 },
    { header: 'Horas', key: 'horas', width: 12, style: { numFmt: FORMATO_HORAS } },
    { header: 'Valor (R$)', key: 'valor', width: 18, style: { numFmt: FORMATO_REAL } },
  ];
  estilizarCabecalho(abaResumo);
  for (const c of resumo.porCliente) {
    abaResumo.addRow({ nome: c.nome, registros: c.registros, horas: c.horas, valor: c.valor });
  }
  const totalResumo = abaResumo.addRow([`Total ${mes}`, resumo.registros, resumo.totalHoras, resumo.totalValor]);
  totalResumo.font = { bold: true };
  totalResumo.border = { top: { style: 'thin' } };
  abaResumo.addRow([]);
  abaResumo.addRow(['Dias trabalhados', resumo.diasTrabalhados]);

  if (resumo.porUsuario.length > 1) {
    const abaUsuarios = workbook.addWorksheet('Por consultor');
    abaUsuarios.columns = [
      { header: 'Consultor', key: 'nome', width: 30 },
      { header: 'Dias', key: 'dias', width: 10 },
      { header: 'Horas', key: 'horas', width: 12, style: { numFmt: FORMATO_HORAS } },
      { header: 'Valor (R$)', key: 'valor', width: 18, style: { numFmt: FORMATO_REAL } },
    ];
    estilizarCabecalho(abaUsuarios);
    for (const u of resumo.porUsuario) abaUsuarios.addRow({ nome: u.nome, dias: u.dias, horas: u.horas, valor: u.valor });
  }

  return workbook;
}
