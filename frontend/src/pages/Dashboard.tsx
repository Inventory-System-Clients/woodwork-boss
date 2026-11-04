import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Banknote, TrendingUp, Clock, FolderOpen, HandCoins, Hourglass, Landmark, Wallet } from "lucide-react";
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
import { CostReportModal } from "@/components/CostReportModal";
import { toast } from "@/components/ui/use-toast";
import {
  formatCurrency,
  formatDateOnly,
  getProjectDashboard,
  type DashboardPeriod,
  type ProjectDashboard,
} from "@/services/projects";
import { getFinanceSummary, type FinanceSummary } from "@/services/finance";
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
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  /** Null = no filter: the dashboard shows the current totals, as before. */
  const [period, setPeriod] = useState<DashboardPeriod | null>(null);
  const [draft, setDraft] = useState({ from: "", to: "" });
  const [isCostReportOpen, setIsCostReportOpen] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError("");

    // Financial cards are optional: the dashboard still loads if the finance module is unavailable.
    void getFinanceSummary(period)
      .then(setFinance)
      .catch(() => setFinance(null));

    try {
      setData(await getProjectDashboard(period));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o dashboard.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [period?.from, period?.to]);

  const applyPeriod = () => {
    if (!draft.from || !draft.to || draft.from > draft.to) {
      toast({ variant: "destructive", title: "Informe as duas datas (início antes do fim)." });
      return;
    }

    setPeriod({ from: draft.from, to: draft.to });
  };

  const clearPeriod = () => {
    setDraft({ from: "", to: "" });
    setPeriod(null);
  };

  const periodLabel = period ? `${formatDateOnly(period.from)} a ${formatDateOnly(period.to)}` : "";

  const monthlyRows = useMemo(
    () => (data?.monthly ?? []).map((point) => ({ ...point, label: shortMonth(point.month) })),
    [data],
  );
  const hasFinanceData = monthlyRows.some((row) => row.expenses || row.commissions || row.profit);

  return (
    <DashboardLayout title="Dashboard" subtitle="Visão geral">
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-wrap items-end gap-2 border border-border rounded bg-card px-3 py-2">
          <label className="space-y-1">
            <span className="block text-[11px] uppercase tracking-wider text-muted-foreground font-medium">De</span>
            <input
              type="date"
              value={draft.from}
              onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
              className="px-3 py-1.5 bg-secondary/50 border border-border rounded text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Até</span>
            <input
              type="date"
              value={draft.to}
              onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
              className="px-3 py-1.5 bg-secondary/50 border border-border rounded text-sm"
            />
          </label>
          <button onClick={applyPeriod} className="px-3 py-2 text-xs font-bold rounded bg-primary text-primary-foreground hover:opacity-90">
            FILTRAR PERÍODO
          </button>
          {period && (
            <button onClick={clearPeriod} className="px-3 py-2 text-xs font-bold rounded border border-border hover:bg-secondary">
              LIMPAR
            </button>
          )}
          <span className="text-xs text-muted-foreground sm:ml-auto self-center">
            {period ? `Mostrando ${periodLabel}` : "Sem filtro: totais atuais"}
          </span>
        </div>

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
                title={period ? "Projetos no período" : "Projetos em andamento"}
                value={data.activeProjects}
                subtitle={period ? `em andamento em algum momento · ${data.totalProjects} criados no período` : `${data.totalProjects} projetos no total`}
                icon={<FolderOpen className="h-4 w-4" />}
                highlight
              />
              <StatCard
                title="Total pago"
                value={formatCurrency(data.totals.totalPaid)}
                subtitle={period ? "dos custos lançados no período" : undefined}
                icon={<Wallet className="h-4 w-4" />}
              />
              <StatCard
                title="Total a pagar"
                value={formatCurrency(data.totals.totalToPay)}
                subtitle={period ? "dos custos lançados no período" : undefined}
                icon={<Hourglass className="h-4 w-4" />}
              />
              <StatCard
                title="Custo total"
                value={formatCurrency(data.totals.totalCost)}
                subtitle={period ? "lançados no período · clique para ver a origem" : "clique para ver de onde vem"}
                icon={<Banknote className="h-4 w-4" />}
                highlight
                onClick={() => setIsCostReportOpen(true)}
              />
              <StatCard
                title={period ? "Lucro líquido do período" : "Lucro líquido do mês"}
                value={finance ? formatCurrency(finance.netIncome) : "—"}
                subtitle={
                  period
                    ? `DRE de ${periodLabel} (receitas − custos − despesas)`
                    : `DRE de ${formatMonth(finance?.month ?? data.monthLabel)} (receitas − custos − despesas)`
                }
                icon={<TrendingUp className="h-4 w-4" />}
                highlight
              />
              <StatCard
                title={period ? "Caixa no fim do período" : "Caixa hoje"}
                value={finance?.cash != null ? formatCurrency(finance.cash) : "—"}
                subtitle={
                  finance && !finance.hasOpeningBalance
                    ? "configure o saldo inicial"
                    : period && finance
                      ? `saldo em ${formatDateOnly(finance.date)}`
                      : "saldo em caixa e bancos"
                }
                icon={<Landmark className="h-4 w-4" />}
              />
              <StatCard
                title="A receber"
                value={finance?.receivables != null ? formatCurrency(finance.receivables) : "—"}
                subtitle={
                  period && finance
                    ? `projetos entregues não pagos em ${formatDateOnly(finance.date)}`
                    : "projetos entregues ainda não pagos pelo cliente"
                }
                icon={<HandCoins className="h-4 w-4" />}
              />
              <StatCard
                title={period ? "Horas no período" : "Horas no mês"}
                value={formatMinutes(data.hoursMonthMinutes)}
                subtitle={period ? periodLabel : formatMonth(data.monthLabel)}
                icon={<Clock className="h-4 w-4" />}
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className="text-sm">Lucro, gastos e comissão por mês</CardTitle>
                  <CardDescription>
                    Gastos e comissão pelo mês do lançamento; lucro (valor final − custos − comissões) pelo mês em que o
                    projeto foi finalizado. {period ? "Meses do período filtrado." : "Últimos 12 meses."}
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
                Projetos com maior custo{period ? " no período" : ""}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <StatCard
                title="Prazo vencido"
                value={data.overdueProjects}
                subtitle="projetos em andamento"
                icon={<AlertTriangle className="h-4 w-4" />}
              />
            </div>
          </>
        )}
      </div>
      <CostReportModal open={isCostReportOpen} onClose={() => setIsCostReportOpen(false)} period={period} />
    </DashboardLayout>
  );
};

export default DashboardPage;
