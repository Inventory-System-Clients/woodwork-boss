import type { FinancialStatements, StatementLine } from "@/services/finance";
import { formatDateOnly } from "@/services/projects";

type Row = [label: string, ...values: (number | string | null)[]];

const MONEY_FORMAT = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

/** Builds the 4 statements (same layout as the screen) as an .xlsx and downloads it. */
export async function exportStatementsToExcel(data: FinancialStatements) {
  // Loaded on demand: exceljs is large and only needed here.
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const period = `${formatDateOnly(data.from)} a ${formatDateOnly(data.to)}`;

  const addSheet = (name: string, title: string, header: string[], rows: (Row | null)[], totals: Set<number>) => {
    const sheet = workbook.addWorksheet(name);
    sheet.addRow([title]).font = { bold: true, size: 14 };
    sheet.addRow([]);
    const headerRow = sheet.addRow(header);
    headerRow.font = { bold: true };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };

    rows.forEach((row, index) => {
      const added = sheet.addRow(row ?? []);
      if (totals.has(index)) added.font = { bold: true };
    });

    sheet.getColumn(1).width = 48;
    for (let column = 2; column <= header.length; column += 1) {
      sheet.getColumn(column).width = 20;
      sheet.getColumn(column).numFmt = MONEY_FORMAT;
    }
  };

  // Each line followed by its entries, indented.
  const withEntries = (line: StatementLine): Row[] => [
    [line.label, line.amount],
    ...line.entries.map<Row>((entry) => [`      ${entry.label}${entry.date ? ` (${formatDateOnly(entry.date)})` : ""}`, entry.amount]),
  ];

  // DRE
  const dre = data.incomeStatement;
  const dreRows: (Row | null)[] = [
    [dre.revenue.label, dre.revenue.amount],
    [dre.costOfProjects.label, dre.costOfProjects.amount],
    ["(=) Lucro bruto", dre.grossProfit],
    null,
    ...dre.operatingExpenses.map<Row>((line) => [line.label, line.amount]),
    ["(=) Total de despesas operacionais", dre.totalOperatingExpenses],
    [dre.depreciation.label, dre.depreciation.amount],
    [dre.assetDisposalResult.label, dre.assetDisposalResult.amount],
    [dre.interest.label, dre.interest.amount],
    null,
    ["(=) Lucro líquido", dre.netIncome],
  ];
  addSheet("DRE", `DRE · ${period}`, ["Linha", "Valor"], dreRows, new Set([2, dre.operatingExpenses.length + 4, dreRows.length - 1]));

  // Retained earnings
  const retained = data.retainedEarnings;
  addSheet(
    "Lucros Acumulados",
    `Lucros Acumulados · ${period}`,
    ["Linha", "Capital social", "Lucros acumulados", "Total"],
    retained.rows.map<Row>((row) => [row.label, row.shareCapital, row.retainedEarnings, row.total]),
    new Set([0, retained.rows.length - 1]),
  );

  // Balance sheet
  const balance = data.balanceSheet;
  const balanceRows: (Row | null)[] = [
    ["ATIVO", null],
    ...balance.assets.map<Row>((line) => [`  ${line.label}`, line.amount]),
    ["Total do ativo", balance.totalAssets],
    null,
    ["PASSIVO", null],
    ...balance.liabilities.map<Row>((line) => [`  ${line.label}`, line.amount]),
    ["Total do passivo", balance.totalLiabilities],
    null,
    ["PATRIMÔNIO LÍQUIDO", null],
    ...balance.equity.map<Row>((line) => [`  ${line.label}`, line.amount]),
    ["Total do patrimônio líquido", balance.totalEquity],
    null,
    ["Total do passivo + PL", balance.totalLiabilities + balance.totalEquity],
    ["Conferência: Ativo − (Passivo + PL)", balance.diff],
  ];
  const balanceTotals = new Set(
    balanceRows.flatMap((row, index) => (row && /^(ATIVO|PASSIVO|PATRIM|Total|Conferência)/.test(row[0]) ? [index] : [])),
  );
  addSheet("Balanço", `Balanço Patrimonial em ${formatDateOnly(balance.date)}`, ["Conta", "Valor"], balanceRows, balanceTotals);

  // Cash flow
  const flow = data.cashFlow;
  const flowRows: (Row | null)[] = [["Saldo inicial de caixa", flow.openingCash]];
  const flowTotals = new Set([0]);

  for (const group of flow.groups) {
    flowRows.push(null);
    flowRows.push([group.label.toUpperCase(), null]);
    flowTotals.add(flowRows.length - 1);
    group.lines.forEach((line) => flowRows.push([`  ${line.label}`, line.amount]));
    flowRows.push([`Total ${group.label.toLowerCase()}`, group.total]);
    flowTotals.add(flowRows.length - 1);
  }

  flowRows.push(null, ["Variação do caixa", flow.netChange], ["Saldo final de caixa", flow.closingCash]);
  flowTotals.add(flowRows.length - 1);
  addSheet("Fluxo de Caixa", `Fluxo de Caixa · ${period}`, ["Linha", "Valor"], flowRows, flowTotals);

  // Detail: every record behind each line, for auditing.
  const detail: (Row | null)[] = [
    ["DRE", null],
    ...[dre.revenue, dre.costOfProjects, ...dre.operatingExpenses, dre.depreciation, dre.assetDisposalResult, dre.interest].flatMap(withEntries),
    null,
    ["BALANÇO", null],
    ...[...balance.assets, ...balance.liabilities, ...balance.equity].filter((line) => line.key !== "cash").flatMap(withEntries),
    null,
    ["FLUXO DE CAIXA", null],
    ...flow.groups.flatMap((group) => group.lines.flatMap(withEntries)),
  ];
  addSheet("Detalhe", `Lançamentos por linha · ${period}`, ["Linha / lançamento", "Valor"], detail, new Set());

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Mais_Quiosque_Demonstracoes_${data.from}_a_${data.to}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
