import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { formatMinutes, getWorkHoursSummary, type WorkHoursSummary } from "@/services/workHours";

interface EmployeeTotal {
  id: string;
  employeeName: string;
  minutes: number;
}

const inputClass =
  "px-3 py-2 bg-secondary/50 border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring";

const HoursReportPage = () => {
  const [range, setRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [summary, setSummary] = useState<WorkHoursSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (next = range) => {
    setIsLoading(true);
    setError("");

    try {
      const data = await getWorkHoursSummary({ from: next.from || undefined, to: next.to || undefined });
      setSummary(data);
      // Show the period actually used (default: current month).
      setRange({ from: data.from, to: data.to });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar as horas.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(
    () =>
      (summary?.rows ?? []).map((row, index) => ({
        ...row,
        id: `${row.employeeId}-${row.projectId ?? row.label}-${index}`,
      })),
    [summary],
  );

  const employeeTotals = useMemo<EmployeeTotal[]>(() => {
    const totals = new Map<string, EmployeeTotal>();

    for (const row of summary?.rows ?? []) {
      const current = totals.get(row.employeeId) ?? { id: row.employeeId, employeeName: row.employeeName, minutes: 0 };
      current.minutes += row.minutes;
      totals.set(row.employeeId, current);
    }

    return [...totals.values()].sort((a, b) => b.minutes - a.minutes);
  }, [summary]);

  return (
    <DashboardLayout title="Horas por funcionário / projeto" subtitle="Horas">
      <div className="animate-fade-in space-y-6">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <label className="text-xs text-muted-foreground">
            De
            <input
              type="date"
              value={range.from}
              onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))}
              className={`${inputClass} mt-1 block`}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Até
            <input
              type="date"
              value={range.to}
              onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))}
              className={`${inputClass} mt-1 block`}
            />
          </label>
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium disabled:opacity-60"
          >
            Filtrar
          </button>
          <p className="ml-auto text-sm text-muted-foreground">
            Total no período:{" "}
            <span className="font-mono font-bold text-primary">{formatMinutes(summary?.totalMinutes ?? 0)}</span>
          </p>
        </form>

        {error && (
          <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="space-y-2">
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Por funcionário</h2>
          <DataTable
            data={employeeTotals}
            emptyMessage={isLoading ? "Carregando..." : "Nenhuma hora lançada no período."}
            columns={[
              { key: "employeeName", header: "Funcionário" },
              { key: "minutes", header: "Total", mono: true, render: (row) => formatMinutes(row.minutes) },
            ]}
          />
        </section>

        <section className="space-y-2">
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
            Por funcionário e projeto / atividade
          </h2>
          <DataTable
            data={rows}
            emptyMessage={isLoading ? "Carregando..." : "Nenhuma hora lançada no período."}
            columns={[
              { key: "employeeName", header: "Funcionário" },
              { key: "label", header: "Projeto / atividade" },
              {
                key: "isActivity",
                header: "Tipo",
                render: (row) => (row.isActivity ? "Outra atividade" : "Projeto"),
              },
              { key: "minutes", header: "Horas", mono: true, render: (row) => formatMinutes(row.minutes) },
            ]}
          />
        </section>
      </div>
    </DashboardLayout>
  );
};

export default HoursReportPage;
