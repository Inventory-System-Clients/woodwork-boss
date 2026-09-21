import { COMPANY } from "@/lib/company";
import type { Client } from "@/services/clients";
import { formatCurrency, formatDateOnly, type ProjectDetail } from "@/services/projects";

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const formatDate = (value: string | null) => (value ? formatDateOnly(value.slice(0, 10)) : "—");

const clientAddress = (client: Client) => {
  const street = [client.street, client.number].filter(Boolean).join(", ");
  const city = [client.city, client.state].filter(Boolean).join("/");

  return [street, client.complement, client.neighborhood, city, client.postalCode].filter(Boolean).join(" - ");
};

const infoLines = (lines: Array<string | null | undefined>) =>
  lines
    .filter((line): line is string => Boolean(line && line.trim()))
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");

export const calculateDeliveryTotals = (project: ProjectDetail) => {
  // Only what was bought for the project is shown to the client: commissions are internal.
  const items = project.costs.filter((cost) => !cost.isCommission);
  const itemsTotal = items.reduce((sum, cost) => sum + cost.amount, 0);
  const total = Math.max(0, itemsTotal + project.laborValue - project.discountValue);

  return { items, itemsTotal, total };
};

/**
 * Opens the print dialog (Save as PDF) with the client-facing delivery document.
 * Shows only item name and value, labor, discount, dates and both parties' data - no internal details.
 * Returns false when the browser blocked the print window.
 */
export const printDeliveryReport = (project: ProjectDetail, client: Client | null): boolean => {
  const isFinished = project.status === "Finalizado";
  const { items, itemsTotal, total } = calculateDeliveryTotals(project);
  const logoUrl = `${window.location.origin}${COMPANY.logoPath}`;

  const itemRows = items
    .map((cost) => `<tr><td>${escapeHtml(cost.description)}</td><td class="r">${formatCurrency(cost.amount)}</td></tr>`)
    .join("");

  const clientLines = infoLines([
    client?.companyName ? `${client.companyName}` : null,
    client?.document ? `CPF/CNPJ: ${client.document}` : null,
    client?.contactName ? `Contato: ${client.contactName}` : null,
    client?.phone ? `Telefone: ${client.phone}` : null,
    client?.email ? `E-mail: ${client.email}` : null,
    client ? clientAddress(client) : null,
  ]);

  const companyLines = infoLines([
    COMPANY.legalName,
    COMPANY.document ? `CNPJ: ${COMPANY.document}` : null,
    COMPANY.phone ? `Telefone: ${COMPANY.phone}` : null,
    COMPANY.email ? `E-mail: ${COMPANY.email}` : null,
    COMPANY.website,
    COMPANY.address,
  ]);

  const title = isFinished ? "Termo de entrega do projeto" : "Resumo do projeto (prévia)";

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)} - ${escapeHtml(project.name)}</title>
<style>
@page{margin:16mm}
body{font-family:Arial,sans-serif;color:#111;font-size:12px}
.head{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}
.head img{height:64px;width:auto}
.head .doc{text-align:right}
.head h1{font-size:18px;margin:0 0 4px}
.muted{color:#555}
.parties{display:flex;gap:16px;margin-bottom:16px}
.box{flex:1;border:1px solid #ddd;border-radius:4px;padding:10px}
.box h3{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#666;margin:0 0 6px}
.box .name{font-size:14px;font-weight:bold;margin-bottom:4px}
h2{font-size:13px;margin:18px 0 6px}
table{width:100%;border-collapse:collapse}
th,td{border-bottom:1px solid #ddd;padding:7px 6px;text-align:left}
.r{text-align:right}
.dates{display:flex;gap:16px;margin-bottom:8px}
.dates div{flex:1;border:1px solid #ddd;border-radius:4px;padding:8px}
.dates b{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#666;margin-bottom:2px}
.summary td{border:none;padding:4px 6px}
.grand td{border-top:2px solid #111;font-size:15px;font-weight:bold;padding-top:8px}
.terms{margin-top:22px;font-size:11px;color:#333;line-height:1.5}
.sign{display:flex;gap:40px;margin-top:56px}
.sign div{flex:1;border-top:1px solid #111;padding-top:4px;text-align:center;font-size:11px}
.foot{margin-top:28px;text-align:center;color:#777;font-size:10px}
</style></head><body>
<div class="head">
  <img src="${logoUrl}" alt="${escapeHtml(COMPANY.name)}">
  <div class="doc"><h1>${escapeHtml(title)}</h1><div class="muted">Emitido em ${new Date().toLocaleDateString("pt-BR")}</div></div>
</div>

<div class="parties">
  <div class="box"><h3>Empresa</h3><div class="name">${escapeHtml(COMPANY.name)}</div>${companyLines}</div>
  <div class="box"><h3>Cliente</h3><div class="name">${escapeHtml(project.clientName)}</div>${clientLines}</div>
</div>

<h2>Projeto: ${escapeHtml(project.name)}</h2>
<div class="dates">
  <div><b>Data de início</b>${formatDate(project.createdAt)}</div>
  <div><b>Prazo de entrega</b>${formatDate(project.deadline)}</div>
  <div><b>Data de finalização</b>${isFinished ? formatDate(project.finishedAt) : "Em andamento"}</div>
</div>

<h2>Materiais e itens</h2>
<table>
  <tr><th>Item</th><th class="r">Valor</th></tr>
  ${itemRows || '<tr><td colspan="2">Nenhum item lançado.</td></tr>'}
</table>

<h2>Valores</h2>
<table class="summary">
  <tr><td>Materiais e itens</td><td class="r">${formatCurrency(itemsTotal)}</td></tr>
  <tr><td>Mão de obra</td><td class="r">${formatCurrency(project.laborValue)}</td></tr>
  ${project.discountValue > 0 ? `<tr><td>Desconto</td><td class="r">- ${formatCurrency(project.discountValue)}</td></tr>` : ""}
  <tr class="grand"><td>Valor final</td><td class="r">${formatCurrency(total)}</td></tr>
</table>

${
  isFinished
    ? `<p class="terms">Declaramos que o projeto acima foi concluído e entregue ao cliente em ${formatDate(project.finishedAt)}. O cliente confirma o recebimento do serviço e dos itens descritos neste documento.</p>
<div class="sign"><div>${escapeHtml(COMPANY.name)}</div><div>${escapeHtml(project.clientName)}</div></div>`
    : `<p class="terms">Documento parcial, sujeito a alterações até a finalização do projeto.</p>`
}

<div class="foot">${escapeHtml(COMPANY.name)}${COMPANY.phone ? ` · ${escapeHtml(COMPANY.phone)}` : ""}${COMPANY.email ? ` · ${escapeHtml(COMPANY.email)}` : ""}</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`;

  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    return false;
  }

  printWindow.document.write(html);
  printWindow.document.close();
  return true;
};
