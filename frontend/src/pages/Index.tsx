import { DashboardLayout } from "@/layouts/DashboardLayout";
import { StatCard } from "@/components/StatCard";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { budgets, orders, products, getLowStockProducts, getMonthlyRevenue } from "@/data/mockData";
import { FileText, Hammer, AlertTriangle, DollarSign } from "lucide-react";
import type { Order, Product } from "@/data/mockData";

const Dashboard = () => {
  const lowStock = getLowStockProducts(products);
  const revenue = getMonthlyRevenue(budgets);

  const orderColumns = [
    { key: "clientName", header: "Cliente" },
    { key: "description", header: "Descrição" },
    {
      key: "productionStatus",
      header: "Status",
      render: (o: Order) => <StatusBadge status={o.productionStatus} />,
    },
    { key: "deliveryDate", header: "Entrega", mono: true },
    { key: "installationTeam", header: "Equipe" },
  ];

  const lowStockColumns = [
    { key: "name", header: "Material" },
    { key: "stock", header: "Atual", mono: true },
    { key: "minStock", header: "Mínimo", mono: true },
    { key: "supplier", header: "Fornecedor" },
  ];

  return (
    <DashboardLayout title="Painel" subtitle="Visão Geral">
      <div className="space-y-8 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total de Orçamentos"
            value={budgets.length}
            icon={<FileText className="h-4 w-4" />}
            subtitle={`${budgets.filter(b => b.status === "approved").length} aprovados`}
          />
          <StatCard
            title="Produção Ativa"
            value={orders.length}
            icon={<Hammer className="h-4 w-4" />}
            subtitle={`${orders.filter(o => o.productionStatus !== "delivered").length} em andamento`}
            highlight
          />
          <StatCard
            title="Alertas de Estoque"
            value={lowStock.length}
            icon={<AlertTriangle className="h-4 w-4" />}
            subtitle="Materiais abaixo do mínimo"
            highlight={lowStock.length > 0}
          />
          <StatCard
            title="Receita Mensal"
            value={`R$ ${revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
            icon={<DollarSign className="h-4 w-4" />}
            subtitle="De orçamentos aprovados"
          />
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-4">Pedidos Ativos</h2>
          <DataTable columns={orderColumns} data={orders} />
        </div>

        {lowStock.length > 0 && (
          <div>
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-4">Alertas de Estoque Baixo</h2>
            <DataTable
              columns={lowStockColumns}
              data={lowStock}
              rowHighlight={(p: Product) => p.stock < p.minStock ? "border-l-2 border-l-primary" : ""}
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
