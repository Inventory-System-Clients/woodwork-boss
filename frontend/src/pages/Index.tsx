import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { StatCard } from "@/components/StatCard";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { useRoleAccess } from "@/auth/AuthProvider";
import { ApiError } from "@/services/api";
import { Budget, listBudgets } from "@/services/budgets";
import { EmployeeProduction, listProductions } from "@/services/productions";
import { FileText, Hammer, DollarSign } from "lucide-react";

const isValidDate = (value: string) => {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
};

const isInCurrentMonth = (value: string) => {
  if (!isValidDate(value)) {
    return false;
  }

  const current = new Date();
  const target = new Date(value);

  return (
    target.getFullYear() === current.getFullYear() &&
    target.getMonth() === current.getMonth()
  );
};

const getApprovedReferenceDate = (budget: Budget) =>
  budget.approvedAt || budget.updatedAt || budget.createdAt;

const toCurrency = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const buildRequestErrorMessage = (label: string, error: unknown) => {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return `${label}: sessao expirada. Faca login novamente.`;
      case 403:
        return `${label}: acesso negado para seu perfil.`;
      case 404:
        return `${label}: endpoint nao encontrado no backend.`;
      case 500:
        return `${label}: erro interno no servidor.`;
      default:
        return `${label}: ${error.message || "falha ao carregar dados."}`;
    }
  }

  if (error instanceof Error) {
    return `${label}: ${error.message}`;
  }

  return `${label}: falha ao carregar dados.`;
};

const Index = () => {
  const { isEmployee } = useRoleAccess();

  // Employees have a simplified area: their home is the daily hours page.
  if (isEmployee) {
    return <Navigate to="/hours" replace />;
  }

  return <Dashboard />;
};

const Dashboard = () => {
  const { canViewFinancials } = useRoleAccess();

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [productions, setProductions] = useState<EmployeeProduction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [requestErrors, setRequestErrors] = useState<string[]>([]);

  const loadDashboardData = async () => {
    setIsLoading(true);
    setRequestErrors([]);

    const results = await Promise.allSettled([
      canViewFinancials ? listBudgets() : Promise.resolve([] as Budget[]),
      listProductions(),
    ]);

    const nextErrors: string[] = [];

    const budgetsResult = results[0];
    if (budgetsResult.status === "fulfilled") {
      setBudgets(budgetsResult.value);
    } else {
      setBudgets([]);

      if (canViewFinancials) {
        nextErrors.push(buildRequestErrorMessage("Orcamentos", budgetsResult.reason));
      }
    }

    const productionsResult = results[1];
    if (productionsResult.status === "fulfilled") {
      setProductions(productionsResult.value);
    } else {
      setProductions([]);
      nextErrors.push(buildRequestErrorMessage("Producoes", productionsResult.reason));
    }

    setRequestErrors(nextErrors);
    setIsLoading(false);
  };

  useEffect(() => {
    void loadDashboardData();
  }, [canViewFinancials]);

  const approvedBudgets = useMemo(
    () => budgets.filter((budget) => budget.status === "approved"),
    [budgets],
  );

  const approvedBudgetsInMonth = useMemo(
    () => approvedBudgets.filter((budget) => isInCurrentMonth(getApprovedReferenceDate(budget))),
    [approvedBudgets],
  );

  const monthlyRevenue = useMemo(
    () => approvedBudgetsInMonth.reduce((sum, budget) => sum + Number(budget.totalPrice || 0), 0),
    [approvedBudgetsInMonth],
  );

  const activeProductions = useMemo(
    () =>
      productions.filter(
        (production) =>
          production.productionStatus !== "approved" &&
          production.productionStatus !== "delivered",
      ),
    [productions],
  );

  const orderColumns = [
    { key: "clientName", header: "Cliente" },
    { key: "description", header: "Descrição" },
    {
      key: "productionStatus",
      header: "Status",
      render: (item: EmployeeProduction) => <StatusBadge status={item.productionStatus} />,
    },
    { key: "deliveryDate", header: "Entrega", mono: true },
    { key: "installationTeam", header: "Equipe" },
  ];

  return (
    <DashboardLayout title="Painel" subtitle="Visão Geral">
      <div className="space-y-8 animate-fade-in">
        {requestErrors.length > 0 && (
          <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive space-y-2">
            {requestErrors.map((message, index) => (
              <p key={`${message}-${index}`}>{message}</p>
            ))}
            <button
              onClick={() => void loadDashboardData()}
              className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
            >
              TENTAR NOVAMENTE
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {canViewFinancials && (
            <StatCard
              title="Total de Orçamentos"
              value={budgets.length}
              icon={<FileText className="h-4 w-4" />}
              subtitle={`${approvedBudgets.length} aprovados`}
            />
          )}
          <StatCard
            title="Produção Ativa"
            value={activeProductions.length}
            icon={<Hammer className="h-4 w-4" />}
            subtitle={`${productions.length} no total`}
            highlight={activeProductions.length > 0}
          />
          {canViewFinancials && (
            <StatCard
              title="Receita Mensal"
              value={toCurrency(monthlyRevenue)}
              icon={<DollarSign className="h-4 w-4" />}
              subtitle={`${approvedBudgetsInMonth.length} orçamento(s) aprovado(s) no mês`}
            />
          )}
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-4">Pedidos Ativos</h2>
          <DataTable
            columns={orderColumns}
            data={activeProductions}
            emptyMessage={
              isLoading
                ? "Carregando produções..."
                : "Nenhuma produção ativa encontrada no banco."
            }
          />
        </div>

      </div>
    </DashboardLayout>
  );
};

export default Index;
