import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "@/components/ui/use-toast";
import { listBudgets, type Budget } from "@/services/budgets";
import { listProductions, EmployeeProduction } from "@/services/productions";
import {
  listActiveProductionMaterialConsumption,
  listLogisticsMonthlyClosings,
  type LogisticsMonthlyClosing,
  upsertLogisticsMonthlyClosing,
} from "@/services/logistics";
import { listStockMovements } from "@/services/stock";
import { listTeams } from "@/services/teams";
import { listEmployees } from "@/services/employees";
import { useRoleAccess } from "@/auth/AuthProvider";
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
  linkedRevenue: number;
  generalCost: number;
  applicableCost: number;
  grossProfit: number;
  netProfit: number;
}

interface FinancialMonthRow {
  monthKey: string;
  month: string;
  generalCost: number;
  grossProfit: number;
  netProfit: number;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const financialByProductionChartConfig = {
  generalCost: {
    label: "Gastos",
    color: "#ef4444",
  },
  grossProfit: {
    label: "Lucro",
    color: "#22c55e",
  },
} satisfies ChartConfig;

const financialByMonthChartConfig = {
  generalCost: {
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

const getPreApprovedReferenceDate = (budget: Budget) =>
  normalizeDeliveryDate(
    budget.financialSummary?.costsAppliedAt ||
      budget.costsAppliedAt ||
      budget.updatedAt ||
      budget.createdAt ||
      budget.deliveryDate,
  );

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

const getCurrentReferenceMonth = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
};

const formatReferenceMonth = (referenceMonth: string) => {
  if (!/^\d{4}-\d{2}$/.test(referenceMonth)) {
    return referenceMonth;
  }

  const [year, month] = referenceMonth.split("-");
  return `${month}/${year}`;
};

const formatDateTime = (value: string) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("pt-BR");
};

const LogisticsPage = () => {
  const { canViewFinancials } = useRoleAccess();
  const [productions, setProductions] = useState<EmployeeProduction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [materialUsageRows, setMaterialUsageRows] = useState<MaterialUsageRow[]>([]);
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [teamCount, setTeamCount] = useState(0);
  const [activeEmployeesCount, setActiveEmployeesCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requestError, setRequestError] = useState("");
  const [secondaryWarning, setSecondaryWarning] = useState("");
  const [referenceMonth, setReferenceMonth] = useState(getCurrentReferenceMonth());
  const [closingFilterMonth, setClosingFilterMonth] = useState("");
  const [monthlyClosings, setMonthlyClosings] = useState<LogisticsMonthlyClosing[]>([]);
  const [isSavingClosing, setIsSavingClosing] = useState(false);
  const [isLoadingClosings, setIsLoadingClosings] = useState(false);

  const loadLogisticsData = async () => {
    setIsLoading(true);
    setRequestError("");
    setSecondaryWarning("");

    try {
      const [
        productionsResult,
        teamsResult,
        employeesResult,
        budgetsResult,
        materialConsumptionResult,
        stockMovementsFallbackResult,
      ] = await Promise.allSettled([
        listProductions({ active: true }),
        listTeams(),
        listEmployees(),
        listBudgets(),
        listActiveProductionMaterialConsumption({
          startDate: filterDateStart || undefined,
          endDate: filterDateEnd || undefined,
        }),
        listStockMovements({
          movementType: "saida",
          referenceType: "production",
          activeOnly: true,
          startDate: filterDateStart || undefined,
          endDate: filterDateEnd || undefined,
          limit: 200,
          offset: 0,
        }),
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

      if (materialConsumptionResult.status === "fulfilled" && materialConsumptionResult.value.data.length > 0) {
        setMaterialUsageRows(
          materialConsumptionResult.value.data.map((item) => ({
            id: item.productId,
            material: item.productName,
            unit: item.unit || "unidade",
            totalQuantity: item.totalQuantityUsed,
            productionsCount: item.activeProductionsCount,
          })),
        );
      } else if (stockMovementsFallbackResult.status === "fulfilled") {
        const movementsResult = stockMovementsFallbackResult;
        const grouped = new Map<
          string,
          {
            id: string;
            material: string;
            unit: string;
            totalQuantity: number;
            productionIds: Set<string>;
          }
        >();

        movementsResult.value.data.forEach((movement) => {
          const key = movement.productId || movement.productName;

          if (!key) {
            return;
          }

          const current = grouped.get(key);

          if (!current) {
            grouped.set(key, {
              id: key,
              material: movement.productName || "Produto",
              unit: movement.unit || "unidade",
              totalQuantity: Math.max(0, Number(movement.quantity) || 0),
              productionIds: new Set(movement.referenceId ? [movement.referenceId] : []),
            });
            return;
          }

          current.totalQuantity += Math.max(0, Number(movement.quantity) || 0);

          if (movement.referenceId) {
            current.productionIds.add(movement.referenceId);
          }
        });

        setMaterialUsageRows(
          Array.from(grouped.values()).map((row) => ({
            id: row.id,
            material: row.material,
            unit: row.unit,
            totalQuantity: row.totalQuantity,
            productionsCount: row.productionIds.size,
          })),
        );
      } else {
        setMaterialUsageRows([]);
        warnings.push("Não foi possível obter materiais consumidos por produções ativas.");
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
      setMaterialUsageRows([]);
      setTeamCount(0);
      setActiveEmployeesCount(null);
      setRequestError(`Não foi possível carregar dados de logística: ${getErrorMessage(error, "Erro inesperado.")}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadLogisticsData();
  }, [filterDateStart, filterDateEnd]);

  const loadMonthlyClosings = async (monthFilter = closingFilterMonth) => {
    if (!canViewFinancials) {
      setMonthlyClosings([]);
      setIsLoadingClosings(false);
      return;
    }

    setIsLoadingClosings(true);

    try {
      const closings = await listLogisticsMonthlyClosings(monthFilter || undefined);
      setMonthlyClosings(
        [...closings].sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth)),
      );
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Nao foi possivel carregar fechamentos",
        description: getErrorMessage(error, "Erro inesperado."),
      });
      setMonthlyClosings([]);
    } finally {
      setIsLoadingClosings(false);
    }
  };

  useEffect(() => {
    void loadMonthlyClosings(closingFilterMonth);
  }, [closingFilterMonth, canViewFinancials]);

  const parsedFilterStart = useMemo(() => parseDateAtMidnight(filterDateStart), [filterDateStart]);
  const parsedFilterEnd = useMemo(() => parseDateAtMidnight(filterDateEnd), [filterDateEnd]);

  const hasInvalidDateRange = Boolean(
    parsedFilterStart && parsedFilterEnd && parsedFilterStart.getTime() > parsedFilterEnd.getTime(),
  );

  const isDateInSelectedRange = (value: string | null | undefined) => {
    if (!parsedFilterStart && !parsedFilterEnd) {
      return true;
    }

    const parsedValue = parseDateAtMidnight(value || "");

    if (!parsedValue) {
      return false;
    }

    if (parsedFilterStart && parsedValue.getTime() < parsedFilterStart.getTime()) {
      return false;
    }

    if (parsedFilterEnd && parsedValue.getTime() > parsedFilterEnd.getTime()) {
      return false;
    }

    return true;
  };

  const filteredProductions = useMemo(
    () =>
      productions.filter((item) => {
        if (hasInvalidDateRange) {
          return false;
        }

        return isDateInSelectedRange(item.deliveryDate);
      }),
    [productions, hasInvalidDateRange, parsedFilterStart, parsedFilterEnd],
  );

  const activeProductions = useMemo(
    () => filteredProductions.filter((item) => !isFinalizedProduction(item.productionStatus)),
    [filteredProductions],
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
    () => {
      if (hasInvalidDateRange) {
        return [] as Budget[];
      }

      return budgets.filter((budget) => {
        if (budget.status !== "approved") {
          return false;
        }

        return isDateInSelectedRange(getApprovedReferenceDate(budget));
      });
    },
    [budgets, hasInvalidDateRange, parsedFilterStart, parsedFilterEnd],
  );

  const preApprovedAppliedCostsTotal = useMemo(() => {
    if (hasInvalidDateRange) {
      return 0;
    }

    return budgets
      .filter((budget) => budget.status === "pre_approved")
      .filter((budget) => isDateInSelectedRange(getPreApprovedReferenceDate(budget)))
      .reduce((sum, budget) => {
        const summaryApplied = Number(
          budget.financialSummary?.costsAppliedValue ?? budget.costsAppliedValue,
        );
        const fallbackApplicable = Number(
          budget.financialSummary?.costsApplicableValue ?? budget.costsApplicableValue,
        );

        const appliedValue =
          Number.isFinite(summaryApplied) && summaryApplied > 0
            ? summaryApplied
            : Number.isFinite(fallbackApplicable)
              ? fallbackApplicable
              : 0;

        return sum + Math.max(0, appliedValue);
      }, 0);
  }, [budgets, hasInvalidDateRange, parsedFilterStart, parsedFilterEnd]);

  const { financialRows, budgetsWithoutMarginCount } = useMemo(() => {
    const rows: FinancialBudgetRow[] = [];

    approvedBudgets.forEach((budget) => {
      const margin =
        typeof budget.profitMargin === "number" ? normalizeMarginValue(budget.profitMargin) : null;

      const totalPrice = Math.max(0, Number(budget.totalPrice) || 0);
      const totalCostFromApi =
        typeof budget.totalCost === "number" && Number.isFinite(budget.totalCost)
          ? Math.max(0, Number(budget.totalCost))
          : null;

      const generalCost =
        totalCostFromApi ??
        (margin !== null && margin > -1 ? Math.max(0, totalPrice / (1 + margin)) : totalPrice);

      const profitFromApi =
        typeof budget.profitValue === "number" && Number.isFinite(budget.profitValue)
          ? Number(budget.profitValue)
          : null;

      const grossProfit = profitFromApi ?? Math.max(0, totalPrice - generalCost);
      const linkedRevenue = generalCost + grossProfit;

      const applicableCostFromSummary = Number(
        budget.financialSummary?.costsApplicableValue ?? budget.costsApplicableValue ?? 0,
      );
      const applicableCostFromList = (budget.applicableCosts || []).reduce(
        (sum, item) => sum + (Number(item.amount) || 0),
        0,
      );
      const applicableCost = Math.max(
        0,
        Number.isFinite(applicableCostFromSummary) && applicableCostFromSummary > 0
          ? applicableCostFromSummary
          : applicableCostFromList,
      );

      const netProfit = grossProfit - applicableCost;

      rows.push({
        id: budget.id,
        clientName: budget.clientName,
        referenceDate: getApprovedReferenceDate(budget),
        linkedRevenue,
        generalCost,
        applicableCost,
        grossProfit,
        netProfit,
      });
    });

    return {
      financialRows: rows,
      budgetsWithoutMarginCount: 0,
    };
  }, [approvedBudgets]);

  const financialTotals = useMemo(
    () =>
      financialRows.reduce(
        (acc, item) => {
          acc.linkedRevenue += item.linkedRevenue;
          acc.generalCost += item.generalCost;
          acc.applicableCost += item.applicableCost;
          acc.grossProfit += item.grossProfit;
          acc.netProfit += item.netProfit;
          return acc;
        },
        {
          linkedRevenue: 0,
          generalCost: 0,
          applicableCost: 0,
          grossProfit: 0,
          netProfit: 0,
        },
      ),
    [financialRows],
  );

  const financialCoverageSummary =
    approvedBudgets.length === 0
      ? "Sem orçamentos aprovados"
      : `${financialRows.length}/${approvedBudgets.length} aprovados oficialmente`;

  const financialCoverageWarning =
    approvedBudgets.length > 0 && budgetsWithoutMarginCount > 0
      ? `Lucro calculado com ${financialRows.length} de ${approvedBudgets.length} orçamentos aprovados.`
      : "";

  const financialByBudgetRows = useMemo(
    () =>
      [...financialRows]
        .sort((a, b) => a.referenceDate.localeCompare(b.referenceDate))
        .slice(0, 8)
        .map((item) => ({
          id: item.id,
          label: buildClientChartLabel(item.clientName),
          generalCost: item.generalCost,
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
          generalCost: item.generalCost,
          grossProfit: item.grossProfit,
          netProfit: item.netProfit,
        });
        return;
      }

      current.generalCost += item.generalCost;
      current.grossProfit += item.grossProfit;
      current.netProfit += item.netProfit;
    });

    return Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [financialRows]);

  const sortedMaterialUsageRows = useMemo(
    () =>
      [...materialUsageRows].sort((a, b) => {
        if (b.totalQuantity !== a.totalQuantity) {
          return b.totalQuantity - a.totalQuantity;
        }

        return b.productionsCount - a.productionsCount;
      }),
    [materialUsageRows],
  );

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

  const closingColumns = [
    { key: "referenceMonth", header: "Mes", render: (item: LogisticsMonthlyClosing) => formatReferenceMonth(item.referenceMonth) },
    { key: "custoGeralAtivo", header: "Custo Geral Ativo", mono: true, render: (item: LogisticsMonthlyClosing) => formatCurrency(item.custoGeralAtivo) },
    { key: "receitaVinculada", header: "Receita Vinculada", mono: true, render: (item: LogisticsMonthlyClosing) => formatCurrency(item.receitaVinculada) },
    { key: "lucroLiquido", header: "Lucro Liquido", mono: true, render: (item: LogisticsMonthlyClosing) => formatCurrency(item.lucroLiquido) },
    { key: "lucroBruto", header: "Lucro Bruto", mono: true, render: (item: LogisticsMonthlyClosing) => formatCurrency(item.lucroBruto) },
    {
      key: "custosAplicadosPreAprovados",
      header: "Custos Aplicados (Pre-aprovados)",
      mono: true,
      render: (item: LogisticsMonthlyClosing) => formatCurrency(item.custosAplicadosPreAprovados),
    },
    { key: "updatedAt", header: "Atualizado em", render: (item: LogisticsMonthlyClosing) => formatDateTime(item.updatedAt), mono: true },
  ];

  const handleMonthlyClosing = async () => {
    if (!canViewFinancials) {
      return;
    }

    if (!/^\d{4}-\d{2}$/.test(referenceMonth)) {
      toast({
        variant: "destructive",
        title: "Mes de referencia invalido",
        description: "Informe o mes no formato YYYY-MM.",
      });
      return;
    }

    const shouldSave = window.confirm(
      `Deseja salvar o fechamento mensal de ${formatReferenceMonth(referenceMonth)}?`,
    );

    if (!shouldSave) {
      return;
    }

    setIsSavingClosing(true);

    try {
      await upsertLogisticsMonthlyClosing({
        referenceMonth,
        custoGeralAtivo: financialTotals.generalCost,
        receitaVinculada: financialTotals.linkedRevenue,
        lucroLiquido: financialTotals.netProfit,
        lucroBruto: financialTotals.grossProfit,
        custosAplicadosPreAprovados: preApprovedAppliedCostsTotal,
      });

      toast({
        title: "Fechamento mensal salvo",
        description: "Fechamento mensal salvo com sucesso.",
      });

      await loadMonthlyClosings(closingFilterMonth);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Nao foi possivel salvar",
        description: getErrorMessage(error, "Nao foi possivel salvar o fechamento mensal."),
      });
    } finally {
      setIsSavingClosing(false);
    }
  };

  return (
    <DashboardLayout title="Logística" subtitle="Entregas e Instalação">
      <div className="animate-fade-in space-y-8">
        <div className="rounded border border-border bg-card p-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <FormField
              label="Data inicial"
              type="date"
              value={filterDateStart}
              onChange={(event) => setFilterDateStart(event.target.value)}
            />
            <FormField
              label="Data final"
              type="date"
              value={filterDateEnd}
              onChange={(event) => setFilterDateEnd(event.target.value)}
            />
            <button
              onClick={() => {
                setFilterDateStart("");
                setFilterDateEnd("");
              }}
              className="h-10 px-3 py-2 text-xs font-bold rounded border border-border hover:bg-secondary transition-colors text-foreground"
            >
              Limpar filtro de data
            </button>

            {canViewFinancials && (
              <>
                <FormField
                  label="Mes de referencia"
                  type="month"
                  value={referenceMonth}
                  onChange={(event) => setReferenceMonth(event.target.value)}
                />

                <button
                  onClick={() => void handleMonthlyClosing()}
                  disabled={isSavingClosing}
                  className="h-10 px-3 py-2 text-xs font-bold rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingClosing ? "Salvando fechamento..." : "Fechamento Mensal"}
                </button>
              </>
            )}
          </div>

          {hasInvalidDateRange ? (
            <p className="mt-2 text-xs text-destructive">
              O período informado é inválido. A data inicial não pode ser maior que a data final.
            </p>
          ) : (filterDateStart || filterDateEnd) ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Filtro ativo para entregas e orçamentos aprovados no período selecionado.
            </p>
          ) : null}
        </div>

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
            value={formatCurrency(financialTotals.generalCost)}
            icon={<DollarSign className="h-4 w-4" />}
            subtitle="Apenas custos dos aprovados oficiais"
          />
          <StatCard
            title="Receita Vinculada"
            value={formatCurrency(financialTotals.linkedRevenue)}
            icon={<DollarSign className="h-4 w-4" />}
            subtitle="Custo total + lucro dos aprovados oficiais"
          />
          <StatCard
            title="Lucro Bruto"
            value={formatCurrency(financialTotals.grossProfit)}
            icon={<DollarSign className="h-4 w-4" />}
            subtitle="Lucro sem descontar custos aplicáveis"
            highlight={financialTotals.grossProfit < 0}
          />
          <StatCard
            title="Lucro Líquido"
            value={formatCurrency(financialTotals.netProfit)}
            icon={<DollarSign className="h-4 w-4" />}
            subtitle="Lucro bruto - custos aplicáveis"
          />
          <StatCard
            title="Custos Aplicados (Pré-aprovados)"
            value={formatCurrency(preApprovedAppliedCostsTotal)}
            icon={<DollarSign className="h-4 w-4" />}
            subtitle="Custos aplicados de orçamentos pré-aprovados"
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
                    <Bar dataKey="generalCost" fill="var(--color-generalCost)" radius={[4, 4, 0, 0]} />
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
                      dataKey="generalCost"
                      stroke="var(--color-generalCost)"
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
            data={sortedMaterialUsageRows}
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

        {canViewFinancials && (
          <div>
            <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <FormField
                label="Filtrar fechamento por mes"
                type="month"
                value={closingFilterMonth}
                onChange={(event) => setClosingFilterMonth(event.target.value)}
              />
              <button
                onClick={() => setClosingFilterMonth("")}
                className="h-10 px-3 py-2 text-xs font-bold rounded border border-border hover:bg-secondary transition-colors text-foreground"
              >
                Limpar filtro de fechamento
              </button>
            </div>

            <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-4">Historico de Fechamentos Mensais</h2>
            <DataTable
              columns={closingColumns}
              data={monthlyClosings}
              emptyMessage={
                isLoadingClosings
                  ? "Carregando fechamentos..."
                  : "Nenhum fechamento mensal encontrado."
              }
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default LogisticsPage;
