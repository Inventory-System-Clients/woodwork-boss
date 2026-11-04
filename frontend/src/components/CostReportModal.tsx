import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Modal } from "@/components/Modal";
import { DataTable } from "@/components/DataTable";
import {
  formatCurrency,
  formatDateOnly,
  getCostReport,
  type CostReport,
  type CostReportProject,
  type DashboardPeriod,
} from "@/services/projects";
import { ProjectStatusBadge } from "@/pages/Projects";

interface CostReportModalProps {
  open: boolean;
  onClose: () => void;
  /** Same period as the dashboard; null = every cost (current totals). */
  period: DashboardPeriod | null;
}

function ProjectItems({ project }: { project: CostReportProject }) {
  return (
    <div className="space-y-2">
      <ul className="text-xs divide-y divide-border/40 max-h-64 overflow-y-auto">
        {project.items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-1.5">
            <span className="min-w-0">
              {item.description}
              {item.isCommission ? (
                <span className="ml-2 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-bold uppercase">
                  Comissão{item.commissionEmployeeName ? ` · ${item.commissionEmployeeName}` : ""}
                </span>
              ) : (
                item.supplier && <span className="text-muted-foreground"> · {item.supplier}</span>
              )}
              <span className="text-muted-foreground"> · lançado em {formatDateOnly(item.createdAt)}</span>
            </span>
            <span className="flex items-center gap-3 shrink-0">
              {item.isPaid ? (
                <span className="text-success text-[11px] font-bold">Pago {formatDateOnly(item.paidAt)}</span>
              ) : (
                <span className="text-amber-300 text-[11px] font-bold">A pagar</span>
              )}
              <span className="font-mono tabular-nums">{formatCurrency(item.amount)}</span>
            </span>
          </li>
        ))}
      </ul>
      <Link to={`/projects/${project.projectId}`} className="text-xs text-primary hover:underline">
        Abrir projeto →
      </Link>
    </div>
  );
}

/** Mini report behind the dashboard "Custo total" card: the same costs, by project and by supplier. */
export function CostReportModal({ open, onClose, period }: CostReportModalProps) {
  const [report, setReport] = useState<CostReport | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    setIsLoading(true);
    setError("");
    getCostReport(period)
      .then(setReport)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o relatório."))
      .finally(() => setIsLoading(false));
  }, [open, period?.from, period?.to]);

  const totals = report?.totals;

  return (
    <Modal open={open} onClose={onClose} title="De onde vem o custo total" width="max-w-4xl">
      <div className="space-y-5">
        <p className="text-xs text-muted-foreground">
          {period
            ? `Custos lançados de ${formatDateOnly(period.from)} a ${formatDateOnly(period.to)}.`
            : "Todos os custos lançados nos projetos (mesmo total do card)."}{" "}
          Clique num projeto para ver cada lançamento.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {isLoading && !report && <p className="text-sm text-muted-foreground animate-pulse">Carregando...</p>}

        {totals && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                ["Custo total", totals.totalCost],
                ["Pago", totals.totalPaid],
                ["A pagar", totals.totalToPay],
                ["Materiais e serviços", totals.materials],
                ["Comissões", totals.commissions],
              ].map(([label, value]) => (
                <div key={label} className="border border-border rounded p-3">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{label}</p>
                  <p className="text-sm sm:text-base font-bold font-mono tabular-nums">{formatCurrency(Number(value))}</p>
                </div>
              ))}
            </div>

            <section className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
                Por projeto ({report.projects.length} projetos · {totals.costCount} lançamentos)
              </h3>
              <DataTable
                data={report.projects.map((project) => ({ ...project, id: project.projectId }))}
                emptyMessage="Nenhum custo lançado."
                renderExpanded={(project) => <ProjectItems project={project} />}
                columns={[
                  {
                    key: "name",
                    header: "Projeto",
                    render: (project) => (
                      <span>
                        {project.name}
                        <span className="block text-[11px] text-muted-foreground">{project.clientName}</span>
                      </span>
                    ),
                  },
                  { key: "status", header: "Status", render: (project) => <ProjectStatusBadge status={project.status} /> },
                  { key: "totalPaid", header: "Pago", mono: true, render: (project) => formatCurrency(project.totalPaid) },
                  { key: "totalToPay", header: "A pagar", mono: true, render: (project) => formatCurrency(project.totalToPay) },
                  { key: "totalCost", header: "Custo total", mono: true, render: (project) => formatCurrency(project.totalCost) },
                  {
                    key: "share",
                    header: "% do total",
                    mono: true,
                    render: (project) =>
                      totals.totalCost > 0 ? `${((project.totalCost / totals.totalCost) * 100).toFixed(1)}%` : "—",
                  },
                ]}
              />
            </section>

            {report.suppliers.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Por fornecedor</h3>
                <ul className="text-sm divide-y divide-border/50 border border-border rounded px-3">
                  {report.suppliers.slice(0, 15).map((supplier) => (
                    <li key={supplier.supplier} className="flex justify-between gap-3 py-1.5">
                      <span>
                        {supplier.supplier}
                        <span className="text-xs text-muted-foreground"> · {supplier.count} lançamentos</span>
                      </span>
                      <span className="font-mono tabular-nums">{formatCurrency(supplier.total)}</span>
                    </li>
                  ))}
                </ul>
                {report.suppliers.length > 15 && (
                  <p className="text-xs text-muted-foreground">Mostrando os 15 maiores de {report.suppliers.length}.</p>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
