import { formatCurrency, formatDateOnly, type ProjectDetail } from "@/services/projects";
import { formatMinutes } from "@/services/workHours";

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Opens the print dialog (Save as PDF) with the project report.
 * Not finished: partial report of the project as it is today.
 * Finished: final report with every cost and the final value.
 * Returns false when the browser blocked the print window.
 */
export const printProjectReport = (project: ProjectDetail): boolean => {
  const isFinal = project.status === "Finalizado";

  const costRows = project.costs
    .map((cost) => {
      const label = cost.isCommission
        ? `${escapeHtml(cost.description)} <span class="muted">(comissão${
            cost.commissionEmployeeName ? ` - ${escapeHtml(cost.commissionEmployeeName)}` : ""
          }${cost.commissionPercent !== null ? `, ${cost.commissionPercent}%` : ""})</span>`
        : escapeHtml(cost.description);

      return `<tr><td>${label}</td><td>${escapeHtml(cost.supplier || "-")}</td><td>${
        cost.isPaid ? `Pago em ${formatDateOnly(cost.paidAt)}` : "A pagar"
      }</td><td class="r">${formatCurrency(cost.amount)}</td></tr>`;
    })
    .join("");

  const hoursRows = project.hoursByEmployee
    .map((row) => `<tr><td>${escapeHtml(row.employeeName)}</td><td class="r">${formatMinutes(row.minutes)}</td></tr>`)
    .join("");

  const commissionsTotal = project.costs
    .filter((cost) => cost.isCommission)
    .reduce((sum, cost) => sum + cost.amount, 0);

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${
    isFinal ? "Relatório final" : "Relatório do projeto"
  } - ${escapeHtml(project.name)}</title>
<style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:20px 0 6px}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}.r{text-align:right}
.total td{font-weight:bold}.muted{color:#666;font-size:12px}.final{font-size:16px}.badge{display:inline-block;padding:2px 8px;border-radius:4px;background:#eee;font-size:11px;font-weight:bold}</style></head><body>
<h1>${isFinal ? "Relatório final do projeto" : "Relatório do projeto (parcial)"}</h1>
<p class="muted">${escapeHtml(project.clientName)} - ${escapeHtml(project.name)}<br>
Status: <span class="badge">${escapeHtml(project.status)}</span> &nbsp; Prazo: ${formatDateOnly(project.deadline)}<br>
Gerado em ${new Date().toLocaleString("pt-BR")}</p>
${
  project.lastUpdateNote
    ? `<h2>Última atualização${project.lastUpdateAt ? ` (${new Date(project.lastUpdateAt).toLocaleString("pt-BR")})` : ""}</h2><p style="font-size:12px;white-space:pre-wrap">${escapeHtml(project.lastUpdateNote)}</p>`
    : ""
}
<h2>Custos</h2><table><tr><th>O que foi comprado</th><th>Fornecedor</th><th>Pagamento</th><th class="r">Valor</th></tr>${
    costRows || '<tr><td colspan="4">Nenhum custo lançado.</td></tr>'
  }</table>
<h2>Resumo financeiro</h2><table>
<tr><td>Total pago</td><td class="r">${formatCurrency(project.totals.totalPaid)}</td></tr>
<tr><td>Total a pagar</td><td class="r">${formatCurrency(project.totals.totalToPay)}</td></tr>
${commissionsTotal > 0 ? `<tr><td>Comissões incluídas nos custos</td><td class="r">${formatCurrency(commissionsTotal)}</td></tr>` : ""}
<tr class="total ${isFinal ? "final" : ""}"><td>${isFinal ? "Valor final (custo total)" : "Custo total até agora"}</td><td class="r">${formatCurrency(project.totals.totalCost)}</td></tr></table>
<h2>Horas trabalhadas (${formatMinutes(project.totalMinutes)})</h2><table><tr><th>Funcionário</th><th class="r">Horas</th></tr>${
    hoursRows || '<tr><td colspan="2">Nenhuma hora lançada.</td></tr>'
  }</table>
<script>window.onload=function(){window.print()}</script></body></html>`;

  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    return false;
  }

  printWindow.document.write(html);
  printWindow.document.close();
  return true;
};
