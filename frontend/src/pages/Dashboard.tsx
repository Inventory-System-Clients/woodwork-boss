import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Banknote, TrendingUp, Clock, FolderOpen, Hourglass, Wallet } from "lucide-react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { DataTable } from "@/components/DataTable";
import { formatCurrency, getProjectDashboard, type ProjectDashboard } from "@/services/projects";
import { formatMinutes } from "@/services/workHours";

const financeChartConfig = {
  profit: { label: "Lucro", color: "#22c55e" },
  expenses: { label: "Gastos", color: "#ef4444" },
  commissions: { label: "Comissão", color: "#0ea5e9" },
} satisfies ChartConfig;

const peakChartConfig = {
  peakProjects: { label: "Projetos simultâneos", color: "#f59e0b" },
} satisfies ChartConfig;

const shortMonth = (month: string) => {
  const [year, monthNumber] = month.split("-");
  const label = new Date(Number(year), Number(monthNumber) - 1, 1)
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", "");

  return `${label}/${year.slice(2)}`;
};

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

  const monthlyRows = useMemo(
    () => (data?.monthly ?? []).map((point) => ({ ...point, label: shortMonth(point.month) })),
    [data],
  );
  const hasFinanceData = monthlyRows.some((row) => row.expenses || row.commissions || row.profit);

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
                title="Lucro"
                value={formatCurrency(data.totalProfit)}
                subtitle="projetos finalizados (valor final − custos)"
                icon={<TrendingUp className="h-4 w-4" />}
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

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className="text-sm">Lucro, gastos e comissão por mês</CardTitle>
                  <CardDescription>
                    Gastos e comissão pelo mês do lançamento; lucro (valor final − custos − comissões) pelo mês em que o
                    projeto foi finalizado. Últimos 12 meses.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  {hasFinanceData ? (
                    <ChartContainer config={financeChartConfig} className="h-[280px] w-full aspect-auto">
                      <BarChart data={monthlyRows}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          width={56}
                          tickFormatter={(value) => `R$ ${Number(value).toLocaleString("pt-BR", { notation: "compact" })}`}
                        />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(value, name) => (
                                <div className="flex w-full justify-between gap-4">
                                  <span className="text-muted-foreground">
                                    {financeChartConfig[name as keyof typeof financeChartConfig]?.label ?? name}
                                  </span>
                                  <span className="font-mono font-medium">{formatCurrency(Number(value))}</span>
                                </div>
                              )}
                            />
                          }
                        />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Bar dataKey="profit" fill="var(--color-profit)" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="commissions" fill="var(--color-commissions)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  ) : (
                    <p className="text-sm text-muted-foreground py-6">
                      Ainda não há custos, comissões ou projetos finalizados nos últimos 12 meses.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className="text-sm">Meses com mais projetos simultâneos</CardTitle>
                  <CardDescription>
                    Maior quantidade de projetos em andamento ao mesmo tempo em cada mês (do início à finalização).
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <ChartContainer config={peakChartConfig} className="h-[280px] w-full aspect-auto">
                    <LineChart data={monthlyRows}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                      <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line
                        type="monotone"
                        dataKey="peakProjects"
                        stroke="var(--color-peakProjects)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
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
