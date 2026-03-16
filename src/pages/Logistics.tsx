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
    { key: "clientName", header: "Client" },
    { key: "description", header: "Description" },
    { key: "productionStatus", header: "Production", render: (o: Order) => <StatusBadge status={o.productionStatus} /> },
    { key: "deliveryDate", header: "Delivery Date", mono: true },
    { key: "installationTeam", header: "Install Team" },
  ];

  return (
    <DashboardLayout title="Logistics" subtitle="Deliveries & Installation">
      <div className="animate-fade-in space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Pending Deliveries" value={pendingDeliveries.length} icon={<Truck className="h-4 w-4" />} highlight />
          <StatCard title="Delivered" value={delivered.length} icon={<Calendar className="h-4 w-4" />} />
          <StatCard title="Teams Active" value={new Set(data.map(o => o.installationTeam)).size} icon={<Users className="h-4 w-4" />} />
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-4">Pending Deliveries</h2>
          <DataTable columns={columns} data={pendingDeliveries} emptyMessage="All orders delivered." />
        </div>

        {delivered.length > 0 && (
          <div>
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-4">Delivered</h2>
            <DataTable columns={columns} data={delivered} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default LogisticsPage;
