import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Banknote, Clock, FolderOpen, Hourglass, Wallet } from "lucide-react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { StatCard } from "@/components/StatCard";
import { DataTable } from "@/components/DataTable";
import { formatCurrency, getProjectDashboard, type ProjectDashboard } from "@/services/projects";
import { formatMinutes } from "@/services/workHours";

const formatMonth = (monthLabel: string) => {
  const [year, month] = monthLabel.split("-");
  const parsed = new Date(Number(year), Number(month) - 1, 1);

  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

const DashboardPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<ProjectDashboard | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    setError("");

    try {
      setData(await getProjectDashboard());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o dashboard.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <DashboardLayout title="Dashboard" subtitle="Visão geral">
      <div className="animate-fade-in space-y-6">
        {error && (
          <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
            <span>{error}</span>
            <button
              onClick={() => void load()}
              className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
            >
              TENTAR NOVAMENTE
            </button>
          </div>
        )}

        {isLoading && !data && <p className="text-sm text-muted-foreground animate-pulse">Carregando...</p>}

        {data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <StatCard
                title="Projetos em andamento"
                value={data.activeProjects}
                subtitle={`${data.totalProjects} projetos no total`}
                icon={<FolderOpen className="h-4 w-4" />}
                highlight
              />
              <StatCard
                title="Total pago"
                value={formatCurrency(data.totals.totalPaid)}
                icon={<Wallet className="h-4 w-4" />}
              />
              <StatCard
                title="Total a pagar"
                value={formatCurrency(data.totals.totalToPay)}
                icon={<Hourglass className="h-4 w-4" />}
              />
              <StatCard
                title="Custo total"
                value={formatCurrency(data.totals.totalCost)}
                icon={<Banknote className="h-4 w-4" />}
                highlight
              />
              <StatCard
                title="Horas no mês"
                value={formatMinutes(data.hoursMonthMinutes)}
                subtitle={formatMonth(data.monthLabel)}
                icon={<Clock className="h-4 w-4" />}
              />
              <StatCard
                title="Prazo vencido"
                value={data.overdueProjects}
                subtitle="projetos em andamento"
                icon={<AlertTriangle className="h-4 w-4" />}
              />
            </div>

            <section className="space-y-2">
              <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
                Projetos com maior custo
              </h2>
              <DataTable
                data={data.topProjects}
                emptyMessage="Nenhum projeto cadastrado ainda."
                onRowClick={(project) => navigate(`/projects/${project.id}`)}
                columns={[
                  { key: "name", header: "Projeto" },
                  { key: "clientName", header: "Cliente" },
                  {
                    key: "totalMinutes",
                    header: "Horas",
                    mono: true,
                    render: (project) => formatMinutes(project.totalMinutes),
                  },
                  {
                    key: "totalCost",
                    header: "Custo total",
                    mono: true,
                    render: (project) => formatCurrency(project.totalCost),
                  },
                ]}
              />
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;
