import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { listBudgets, type Budget } from "@/services/budgets";
import { listProductions, EmployeeProduction } from "@/services/productions";
import { listTeams } from "@/services/teams";
import { listEmployees } from "@/services/employees";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Clock3, DollarSign, Truck, UserCheck, Users } from "lucide-react";
import { StatCard } from "@/components/StatCard";

type DeliveryHealthStatus = "late" | "near_due" | "on_time";

interface LogisticsProductionRow extends EmployeeProduction {
  daysToDelivery: number | null;
  deliveryHealthStatus: DeliveryHealthStatus;
}

interface MaterialUsageRow {
  id: string;
  material: string;
  totalQuantity: number;
  unit: string;
  productionsCount: number;
}

interface FinancialBudgetRow {
  id: string;
  clientName: string;
  referenceDate: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  netProfit: number;
}

interface FinancialMonthRow {
  monthKey: string;
  month: string;
  cost: number;
  grossProfit: number;
  netProfit: number;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const financialByProductionChartConfig = {
  cost: {
    label: "Gastos",
    color: "#ef4444",
  },
  grossProfit: {
    label: "Lucro",
    color: "#22c55e",
  },
} satisfies ChartConfig;

const financialByMonthChartConfig = {
  cost: {
    label: "Gastos",
    color: "#ef4444",
  },
  grossProfit: {
    label: "Lucro",
    color: "#22c55e",
  },
  netProfit: {
    label: "Lucro Líquido",
    color: "#0ea5e9",
  },
} satisfies ChartConfig;

const isFinalizedProduction = (status: EmployeeProduction["productionStatus"]) =>
  status === "approved" || status === "delivered";

const healthStatusStyles: Record<DeliveryHealthStatus, string> = {
  late: "bg-destructive/20 text-destructive",
  near_due: "bg-amber-500/20 text-amber-300",
  on_time: "bg-success/20 text-success",
};

const healthStatusLabels: Record<DeliveryHealthStatus, string> = {
  late: "Atrasada",
  near_due: "Quase no Prazo",
  on_time: "Em Dia",
};

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const formatCurrencyAxis = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const normalizeDeliveryDate = (value: string | null | undefined) => {
  if (!value) {
    return "";
  }

  return value.includes("T") ? value.split("T")[0] : value;
};

const parseDateAtMidnight = (value: string) => {
  const normalized = normalizeDeliveryDate(value);

  if (!normalized) {
    return null;
  }

  const parsed = new Date(`${normalized}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const getDaysToDelivery = (deliveryDate: string) => {
  const targetDate = parseDateAtMidnight(deliveryDate);

  if (!targetDate) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.floor((targetDate.getTime() - today.getTime()) / DAY_IN_MS);
};

const getDeliveryHealthStatus = (daysToDelivery: number | null): DeliveryHealthStatus => {
  if (daysToDelivery === null) {
    return "on_time";
  }

  if (daysToDelivery < 0) {
    return "late";
  }

  if (daysToDelivery <= 3) {
    return "near_due";
  }

  return "on_time";
};

const formatDaysToDelivery = (daysToDelivery: number | null) => {
  if (daysToDelivery === null) {
    return "Sem prazo";
  }

  if (daysToDelivery < 0) {
    return `${Math.abs(daysToDelivery)}d atraso`;
  }

  if (daysToDelivery === 0) {
    return "Hoje";
  }

  if (daysToDelivery === 1) {
    return "1 dia";
  }

  return `${daysToDelivery} dias`;
};

const formatDeliveryDate = (value: string) => normalizeDeliveryDate(value) || "-";

const buildClientChartLabel = (clientName: string) => {
  const normalized = clientName.trim();

  if (!normalized) {
    return "Sem Cliente";
  }

  if (normalized.length <= 16) {
    return normalized;
  }

  return `${normalized.slice(0, 16)}...`;
};

const getApprovedReferenceDate = (budget: Budget) =>
  normalizeDeliveryDate(budget.approvedAt || budget.updatedAt || budget.createdAt || budget.deliveryDate);

const normalizeMarginValue = (value: number) => {
  if (!Number.isFinite(value)) {
    return null;
  }

  if (value > 1 && value <= 100) {
    return value / 100;
  }

  return value;
};

const getMonthReference = (deliveryDate: string) => {
  const normalized = normalizeDeliveryDate(deliveryDate);

  if (!normalized) {
    return { monthKey: "sem-data", month: "Sem data" };
  }

  const parsed = new Date(`${normalized}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return { monthKey: "sem-data", month: "Sem data" };
  }

  const month = String(parsed.getMonth() + 1).padStart(2, "0");

  return {
    monthKey: `${parsed.getFullYear()}-${month}`,
    month: parsed.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
  };
};

const LogisticsPage = () => {
  const [productions, setProductions] = useState<EmployeeProduction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [teamCount, setTeamCount] = useState(0);
  const [activeEmployeesCount, setActiveEmployeesCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requestError, setRequestError] = useState("");
  const [secondaryWarning, setSecondaryWarning] = useState("");

  const loadLogisticsData = async () => {
    setIsLoading(true);
    setRequestError("");
    setSecondaryWarning("");

    try {
      const [productionsResult, teamsResult, employeesResult, budgetsResult] = await Promise.allSettled([
        listProductions(),
        listTeams(),
        listEmployees(),
        listBudgets(),
      ]);

      if (productionsResult.status !== "fulfilled") {
        throw new Error(getErrorMessage(productionsResult.reason, "Falha ao carregar produções."));
      }

      const nextProductions = productionsResult.value;

      setProductions(nextProductions);

      const warnings: string[] = [];

      if (budgetsResult.status === "fulfilled") {
        setBudgets(budgetsResult.value);
      } else {
        setBudgets([]);
        warnings.push("Não foi possível obter orçamentos do banco para calcular lucro e receita na logística.");
      }

      if (teamsResult.status === "fulfilled") {
        setTeamCount(teamsResult.value.length);
      } else {
        setTeamCount(new Set(nextProductions.map((item) => item.installationTeam).filter(Boolean)).size);
        warnings.push("Não foi possível obter o total de equipes do banco.");
      }

      if (employeesResult.status === "fulfilled") {
        setActiveEmployeesCount(employeesResult.value.filter((employee) => employee.isActive).length);
      } else {
        setActiveEmployeesCount(null);
        warnings.push("Não foi possível obter o total de funcionários ativos do banco.");
      }

      setSecondaryWarning(warnings.join(" "));
    } catch (error) {
      setProductions([]);
      setBudgets([]);
      setTeamCount(0);
      setActiveEmployeesCount(null);
      setRequestError(`Não foi possível carregar dados de logística: ${getErrorMessage(error, "Erro inesperado.")}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadLogisticsData();
  }, []);

  const activeProductions = useMemo(
    () => productions.filter((item) => !isFinalizedProduction(item.productionStatus)),
    [productions],
  );

  const activeProductionRows = useMemo<LogisticsProductionRow[]>(
    () =>
      activeProductions.map((item) => {
        const daysToDelivery = getDaysToDelivery(item.deliveryDate);

        return {
          ...item,
          daysToDelivery,
          deliveryHealthStatus: getDeliveryHealthStatus(daysToDelivery),
        };
      }),
    [activeProductions],
  );

  const overdueProductions = useMemo(
    () => activeProductionRows.filter((item) => item.deliveryHealthStatus === "late"),
    [activeProductionRows],
  );

  const nearDueProductions = useMemo(
    () => activeProductionRows.filter((item) => item.deliveryHealthStatus === "near_due"),
    [activeProductionRows],
  );

  const onTimeProductions = useMemo(
    () => activeProductionRows.filter((item) => item.deliveryHealthStatus === "on_time"),
    [activeProductionRows],
  );

  const activeProductionsCost = useMemo(
    () => activeProductions.reduce((sum, item) => sum + item.initialCost, 0),
    [activeProductions],
  );

  const approvedBudgets = useMemo(
    () => budgets.filter((budget) => budget.status === "approved"),
    [budgets],
  );

  const { financialRows, budgetsWithoutMarginCount } = useMemo(() => {
    const rows: FinancialBudgetRow[] = [];

    approvedBudgets.forEach((budget) => {
      const margin =
        typeof budget.profitMargin === "number" ? normalizeMarginValue(budget.profitMargin) : null;

      if (margin === null || margin < 0) {
        return;
      }

      const revenue = Number(budget.totalPrice) || 0;
      const costFromApi =
        typeof budget.totalCost === "number" && Number.isFinite(budget.totalCost)
          ? budget.totalCost
          : null;
      const profitFromApi =
        typeof budget.profitValue === "number" && Number.isFinite(budget.profitValue)
          ? budget.profitValue
          : null;

      const grossProfit =
        profitFromApi ??
        (costFromApi !== null
          ? costFromApi * margin
          : margin > -1
            ? revenue * (margin / (1 + margin))
            : 0);

      const cost = costFromApi ?? Math.max(0, revenue - grossProfit);

      rows.push({
        id: budget.id,
        clientName: budget.clientName,
        referenceDate: getApprovedReferenceDate(budget),
        revenue,
        cost,
        grossProfit,
        netProfit: cost - grossProfit,
      });
    });

    return {
      financialRows: rows,
      budgetsWithoutMarginCount: Math.max(0, approvedBudgets.length - rows.length),
    };
  }, [approvedBudgets]);

  const financialTotals = useMemo(
    () =>
      financialRows.reduce(
        (acc, item) => {
          acc.revenue += item.revenue;
          acc.cost += item.cost;
          acc.grossProfit += item.grossProfit;
          acc.netProfit += item.netProfit;
          return acc;
        },
        {
          revenue: 0,
          cost: 0,
          grossProfit: 0,
          netProfit: 0,
        },
      ),
    [financialRows],
  );

  const financialCoverageSummary =
    approvedBudgets.length === 0
      ? "Sem orçamentos aprovados"
      : `${financialRows.length}/${approvedBudgets.length} aprovados com margem`;

  const financialCoverageWarning =
    approvedBudgets.length > 0 && budgetsWithoutMarginCount > 0
      ? `Lucro calculado com ${financialRows.length} de ${approvedBudgets.length} orçamentos aprovados. ${budgetsWithoutMarginCount} orçamento(s) não retornaram margem de lucro pela API.`
      : "";

  const financialByBudgetRows = useMemo(
    () =>
      [...financialRows]
        .sort((a, b) => a.referenceDate.localeCompare(b.referenceDate))
        .slice(0, 8)
        .map((item) => ({
          id: item.id,
          label: buildClientChartLabel(item.clientName),
          cost: item.cost,
          grossProfit: item.grossProfit,
        })),
    [financialRows],
  );

  const financialByMonthRows = useMemo<FinancialMonthRow[]>(() => {
    const map = new Map<string, FinancialMonthRow>();

    financialRows.forEach((item) => {
      const { monthKey, month } = getMonthReference(item.referenceDate);
      const current = map.get(monthKey);

      if (!current) {
        map.set(monthKey, {
          monthKey,
          month,
          cost: item.cost,
          grossProfit: item.grossProfit,
          netProfit: item.netProfit,
        });
        return;
      }

      current.cost += item.cost;
      current.grossProfit += item.grossProfit;
      current.netProfit += item.netProfit;
    });

    return Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [financialRows]);

  const materialUsageRows = useMemo<MaterialUsageRow[]>(() => {
    const map = new Map<string, MaterialUsageRow>();

    activeProductions.forEach((production) => {
      const seenInThisProduction = new Set<string>();

      production.materials.forEach((material) => {
        const key = material.productId || `${material.productName}-${material.unit}`;
        const current = map.get(key);

        if (!current) {
          map.set(key, {
            id: key,
            material: material.productName,
            unit: material.unit,
            totalQuantity: material.quantity,
            productionsCount: 1,
          });
          seenInThisProduction.add(key);
          return;
        }

        current.totalQuantity += material.quantity;

        if (!seenInThisProduction.has(key)) {
          current.productionsCount += 1;
          seenInThisProduction.add(key);
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => {
      if (b.totalQuantity !== a.totalQuantity) {
        return b.totalQuantity - a.totalQuantity;
      }

      return b.productionsCount - a.productionsCount;
    });
  }, [activeProductions]);

  const productionColumns = [
    { key: "clientName", header: "Cliente" },
    { key: "description", header: "Descrição" },
    { key: "deliveryDate", header: "Entrega", mono: true, render: (item: LogisticsProductionRow) => formatDeliveryDate(item.deliveryDate) },
    {
      key: "daysToDelivery",
      header: "Prazo",
      mono: true,
      render: (item: LogisticsProductionRow) => formatDaysToDelivery(item.daysToDelivery),
    },
    {
      key: "deliveryHealthStatus",
      header: "Situação",
      render: (item: LogisticsProductionRow) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
            healthStatusStyles[item.deliveryHealthStatus]
          }`}
        >
          {healthStatusLabels[item.deliveryHealthStatus]}
        </span>
      ),
    },
    {
      key: "productionStatus",
      header: "Etapa",
      render: (item: LogisticsProductionRow) => <StatusBadge status={item.productionStatus} />,
    },
    { key: "installationTeam", header: "Equipe" },
  ];

  const materialColumns = [
    { key: "material", header: "Material" },
    {
      key: "totalQuantity",
      header: "Quantidade Total",
      mono: true,
      render: (item: MaterialUsageRow) => `${item.totalQuantity} ${item.unit}`,
    },
    { key: "productionsCount", header: "Produções Ativas", mono: true },
  ];

  const activeEmployeesLabel = activeEmployeesCount === null ? "N/D" : activeEmployeesCount;

  return (
    <DashboardLayout title="Logística" subtitle="Entregas e Instalação">
      <div className="animate-fade-in space-y-8">
        {secondaryWarning && (
          <div className="border border-amber-300/40 bg-amber-50/70 rounded px-3 py-2 text-sm text-amber-900">
            {secondaryWarning}
          </div>
        )}

        {financialCoverageWarning && (
          <div className="border border-amber-300/40 bg-amber-50/70 rounded px-3 py-2 text-sm text-amber-900">
            {financialCoverageWarning}
          </div>
        )}

        {requestError && (
          <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
            <span>{requestError}</span>
            <button
              onClick={() => void loadLogisticsData()}
              className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
            >
              TENTAR NOVAMENTE
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-4">
          <StatCard title="Equipes" value={teamCount} icon={<Users className="h-4 w-4" />} />
          <StatCard
            title="Funcionários Ativos"
            value={activeEmployeesLabel}
            icon={<UserCheck className="h-4 w-4" />}
            subtitle={activeEmployeesCount === null ? "Sem acesso ao módulo de funcionários" : undefined}
          />
          <StatCard
            title="Produções Atrasadas"
            value={overdueProductions.length}
            icon={<AlertTriangle className="h-4 w-4" />}
            highlight={overdueProductions.length > 0}
          />
          <StatCard
            title="Quase no Prazo"
            value={nearDueProductions.length}
            icon={<Clock3 className="h-4 w-4" />}
            highlight={nearDueProductions.length > 0}
          />
          <StatCard title="Produções em Dia" value={onTimeProductions.length} icon={<CheckCircle2 className="h-4 w-4" />} />
          <StatCard
            title="Custo Geral Ativo"
            value={formatCurrency(activeProductionsCost)}
            icon={<DollarSign className="h-4 w-4" />}
          />
          <StatCard
            title="Receita Vinculada"
            value={formatCurrency(financialTotals.revenue)}
            icon={<DollarSign className="h-4 w-4" />}
            subtitle={financialCoverageSummary}
          />
          <StatCard
            title="Lucro Bruto"
            value={formatCurrency(financialTotals.grossProfit)}
            icon={<DollarSign className="h-4 w-4" />}
            subtitle="Base: margem dos orçamentos aprovados"
            highlight={financialTotals.grossProfit < 0}
          />
          <StatCard
            title="Lucro Líquido"
            value={formatCurrency(financialTotals.netProfit)}
            icon={<DollarSign className="h-4 w-4" />}
            subtitle="Fórmula: custo - lucro"
          />
        </div>

        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm">Gastos x Lucro por Orçamento Aprovado</CardTitle>
              <CardDescription>
                Comparativo dos primeiros 8 orçamentos aprovados com margem de lucro retornada pelo banco.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {financialByBudgetRows.length > 0 ? (
                <ChartContainer
                  config={financialByProductionChartConfig}
                  className="h-[280px] w-full aspect-auto"
                >
                  <BarChart data={financialByBudgetRows}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={24}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={formatCurrencyAxis}
                      width={110}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => formatCurrency(Number(value) || 0)}
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="cost" fill="var(--color-cost)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="grossProfit" fill="var(--color-grossProfit)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <p className="text-sm text-muted-foreground py-6">
                  Sem orçamentos aprovados com margem para montar o gráfico comparativo.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm">Evolução de Gastos e Lucro (Aprovados)</CardTitle>
              <CardDescription>
                Valores por mês de aprovação, considerando margem de lucro de cada orçamento.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {financialByMonthRows.length > 0 ? (
                <ChartContainer
                  config={financialByMonthChartConfig}
                  className="h-[280px] w-full aspect-auto"
                >
                  <LineChart data={financialByMonthRows}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={formatCurrencyAxis}
                      width={110}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => formatCurrency(Number(value) || 0)}
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Line
                      type="monotone"
                      dataKey="cost"
                      stroke="var(--color-cost)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="grossProfit"
                      stroke="var(--color-grossProfit)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="netProfit"
                      stroke="var(--color-netProfit)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ChartContainer>
              ) : (
                <p className="text-sm text-muted-foreground py-6">
                  Sem dados financeiros de orçamentos aprovados para montar a evolução mensal.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-4">Materiais Mais Usados (Produções Ativas)</h2>
          <DataTable
            columns={materialColumns}
            data={materialUsageRows}
            emptyMessage={
              isLoading
                ? "Carregando uso de materiais..."
                : "Sem produções ativas para calcular consumo de materiais."
            }
          />
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-4">Produções Atrasadas</h2>
          <DataTable
            columns={productionColumns}
            data={overdueProductions}
            emptyMessage={
              isLoading
                ? "Carregando produções atrasadas..."
                : "Nenhuma produção ativa atrasada."
            }
          />
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-4">Produções Quase no Prazo</h2>
          <DataTable
            columns={productionColumns}
            data={nearDueProductions}
            emptyMessage={
              isLoading
                ? "Carregando produções próximas do prazo..."
                : "Nenhuma produção ativa quase no prazo."
            }
          />
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-4">Produções em Dia</h2>
          <DataTable
            columns={productionColumns}
            data={onTimeProductions}
            emptyMessage={
              isLoading
                ? "Carregando produções em dia..."
                : "Nenhuma produção ativa em dia no momento."
            }
          />
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-4">Resumo de Produções Ativas</h2>
          <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded bg-card text-sm w-fit">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Total ativo</span>
            <span className="font-mono text-xs text-foreground">{activeProductions.length}</span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default LogisticsPage;
