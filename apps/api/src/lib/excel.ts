import ExcelJS from 'exceljs';
import type { FastifyReply } from 'fastify';

/**
 * Planilhas Excel geradas pela API (relatorios mensais, ASO, ponto...).
 *
 * Um unico lugar define o visual: cabecalho em negrito com fundo, colunas
 * largas o suficiente, datas e moeda formatadas. Quem gera o relatorio so
 * descreve colunas e linhas.
 */

export interface ColunaPlanilha {
  cabecalho: string;
  chave: string;
  largura?: number;
  /** `data` formata dd/mm/aaaa; `moeda` em R$; `numero` com separador. */
  formato?: 'data' | 'moeda' | 'numero' | 'texto';
}

export function novaPlanilha(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SafetyGuard EHS 360';
  workbook.created = new Date();
  return workbook;
}

export function adicionarAba(
  workbook: ExcelJS.Workbook,
  nome: string,
  colunas: ColunaPlanilha[],
  linhas: Array<Record<string, unknown>>,
  opcoes: { titulo?: string } = {},
): ExcelJS.Worksheet {
  // Nomes de aba: ate 31 caracteres, sem []:*?/\
  const aba = workbook.addWorksheet(nome.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31));
  let linhaCabecalho = 1;

  if (opcoes.titulo) {
    aba.mergeCells(1, 1, 1, Math.max(1, colunas.length));
    const celula = aba.getCell(1, 1);
    celula.value = opcoes.titulo;
    celula.font = { bold: true, size: 13 };
    linhaCabecalho = 3;
  }

  colunas.forEach((coluna, indice) => {
    const celula = aba.getCell(linhaCabecalho, indice + 1);
    celula.value = coluna.cabecalho;
    celula.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
    celula.alignment = { vertical: 'middle', wrapText: true };
    aba.getColumn(indice + 1).width = coluna.largura ?? Math.max(12, Math.min(60, coluna.cabecalho.length + 4));
  });

  for (const linha of linhas) {
    const valores = colunas.map((coluna) => {
      const valor = linha[coluna.chave];
      if (valor === null || valor === undefined) return '';
      if (coluna.formato === 'data') {
        const data = valor instanceof Date ? valor : new Date(String(valor));
        return Number.isNaN(data.getTime()) ? String(valor) : data;
      }
      if (coluna.formato === 'moeda' || coluna.formato === 'numero') return typeof valor === 'number' ? valor : Number(valor);
      return typeof valor === 'object' ? JSON.stringify(valor) : (valor as string | number | boolean);
    });
    const nova = aba.addRow(valores);
    colunas.forEach((coluna, indice) => {
      const celula = nova.getCell(indice + 1);
      if (coluna.formato === 'data') celula.numFmt = 'dd/mm/yyyy';
      if (coluna.formato === 'moeda') celula.numFmt = '"R$" #,##0.00';
      if (coluna.formato === 'numero') celula.numFmt = '#,##0.##';
    });
  }

  aba.views = [{ state: 'frozen', ySplit: linhaCabecalho }];
  if (linhas.length > 0) {
    aba.autoFilter = { from: { row: linhaCabecalho, column: 1 }, to: { row: linhaCabecalho + linhas.length, column: colunas.length } };
  }
  return aba;
}

/** Envia a planilha como download. */
export async function responderPlanilha(reply: FastifyReply, workbook: ExcelJS.Workbook, nomeArquivo: string): Promise<FastifyReply> {
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return reply
    .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .header('Content-Disposition', `attachment; filename="${nomeArquivo.replace(/[^\w.-]+/g, '-')}"`)
    .send(buffer);
}
