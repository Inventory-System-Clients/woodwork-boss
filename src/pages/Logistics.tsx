import { useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { orders as initialOrders, Order } from "@/data/mockData";
import { Truck, Calendar, Users } from "lucide-react";
import { StatCard } from "@/components/StatCard";

const LogisticsPage = () => {
  const [data] = useState<Order[]>(initialOrders);

  const pendingDeliveries = data.filter(o => o.productionStatus !== "delivered");
  const delivered = data.filter(o => o.productionStatus === "delivered");

  const columns = [
    { key: "clientName", header: "Cliente" },
    { key: "description", header: "Descrição" },
    { key: "productionStatus", header: "Produção", render: (o: Order) => <StatusBadge status={o.productionStatus} /> },
    { key: "deliveryDate", header: "Data de Entrega", mono: true },
    { key: "installationTeam", header: "Equipe de Instalação" },
  ];

  return (
    <DashboardLayout title="Logística" subtitle="Entregas e Instalação">
      <div className="animate-fade-in space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Entregas Pendentes" value={pendingDeliveries.length} icon={<Truck className="h-4 w-4" />} highlight />
          <StatCard title="Entregues" value={delivered.length} icon={<Calendar className="h-4 w-4" />} />
          <StatCard title="Equipes Ativas" value={new Set(data.map(o => o.installationTeam)).size} icon={<Users className="h-4 w-4" />} />
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-4">Entregas Pendentes</h2>
          <DataTable columns={columns} data={pendingDeliveries} emptyMessage="Todos os pedidos foram entregues." />
        </div>

        {delivered.length > 0 && (
          <div>
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-4">Entregues</h2>
            <DataTable columns={columns} data={delivered} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default LogisticsPage;
