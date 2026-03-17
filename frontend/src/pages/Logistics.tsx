import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { orders as mockOrders } from "@/data/mockData";
import { listProductions, EmployeeProduction } from "@/services/productions";
import { listTeams } from "@/services/teams";
import { listEmployees } from "@/services/employees";
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

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const apiBaseUrl = (import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");
const isDevelopment = import.meta.env.DEV;
const isApiConfigured = Boolean(apiBaseUrl);

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

const createMockProductionsSnapshot = (): EmployeeProduction[] =>
  mockOrders.map((order) => ({
    ...order,
    materials: order.materials.map((material) => ({ ...material })),
  }));

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const normalizeDeliveryDate = (value: string) => {
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

const LogisticsPage = () => {
  const [productions, setProductions] = useState<EmployeeProduction[]>([]);
  const [teamCount, setTeamCount] = useState(0);
  const [activeEmployeesCount, setActiveEmployeesCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requestError, setRequestError] = useState("");
  const [modeNotice, setModeNotice] = useState("");
  const [secondaryWarning, setSecondaryWarning] = useState("");

  const loadLogisticsData = async () => {
    setIsLoading(true);
    setRequestError("");
    setModeNotice("");
    setSecondaryWarning("");

    if (isDevelopment && !isApiConfigured) {
      const fallbackProductions = createMockProductionsSnapshot();
      setProductions(fallbackProductions);
      setTeamCount(new Set(fallbackProductions.map((item) => item.installationTeam).filter(Boolean)).size);
      setActiveEmployeesCount(null);
      setModeNotice(
        "Modo local ativo: usando dados mock de produções. A contagem de funcionários ativos exige API de funcionários.",
      );
      setIsLoading(false);
      return;
    }

    try {
      const [productionsResult, teamsResult, employeesResult] = await Promise.allSettled([
        listProductions(),
        listTeams(),
        listEmployees(),
      ]);

      let nextProductions: EmployeeProduction[] = [];

      if (productionsResult.status === "fulfilled") {
        nextProductions = productionsResult.value;
      } else if (isDevelopment) {
        nextProductions = createMockProductionsSnapshot();
        setModeNotice("Backend de produções indisponível. Exibindo dados mock para desenvolvimento.");
      } else {
        throw new Error(getErrorMessage(productionsResult.reason, "Falha ao carregar produções."));
      }

      setProductions(nextProductions);

      const warnings: string[] = [];

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
    () => productions.filter((item) => item.productionStatus !== "delivered"),
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
        {modeNotice && (
          <div className="border border-amber-300/50 bg-amber-50 rounded px-3 py-2 text-sm text-amber-900">
            {modeNotice}
          </div>
        )}

        {secondaryWarning && (
          <div className="border border-amber-300/40 bg-amber-50/70 rounded px-3 py-2 text-sm text-amber-900">
            {secondaryWarning}
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

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
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
