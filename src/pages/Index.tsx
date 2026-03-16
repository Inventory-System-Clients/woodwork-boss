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
    { key: "clientName", header: "Client" },
    { key: "description", header: "Description" },
    {
      key: "productionStatus",
      header: "Status",
      render: (o: Order) => <StatusBadge status={o.productionStatus} />,
    },
    { key: "deliveryDate", header: "Delivery", mono: true },
    { key: "installationTeam", header: "Team" },
  ];

  const lowStockColumns = [
    { key: "name", header: "Material" },
    { key: "stock", header: "Current", mono: true },
    { key: "minStock", header: "Minimum", mono: true },
    { key: "supplier", header: "Supplier" },
  ];

  return (
    <DashboardLayout title="Dashboard" subtitle="Overview">
      <div className="space-y-8 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Budgets"
            value={budgets.length}
            icon={<FileText className="h-4 w-4" />}
            subtitle={`${budgets.filter(b => b.status === "approved").length} approved`}
          />
          <StatCard
            title="Active Production"
            value={orders.length}
            icon={<Hammer className="h-4 w-4" />}
            subtitle={`${orders.filter(o => o.productionStatus !== "delivered").length} in progress`}
            highlight
          />
          <StatCard
            title="Low Stock Alerts"
            value={lowStock.length}
            icon={<AlertTriangle className="h-4 w-4" />}
            subtitle="Materials below minimum"
            highlight={lowStock.length > 0}
          />
          <StatCard
            title="Monthly Revenue"
            value={`R$ ${revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
            icon={<DollarSign className="h-4 w-4" />}
            subtitle="From approved budgets"
          />
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-4">Active Orders</h2>
          <DataTable columns={orderColumns} data={orders} />
        </div>

        {lowStock.length > 0 && (
          <div>
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-4">Low Stock Alerts</h2>
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
