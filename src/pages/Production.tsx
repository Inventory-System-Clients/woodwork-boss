import { useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { orders as initialOrders, Order } from "@/data/mockData";

const statuses: Order["productionStatus"][] = ["cutting", "assembly", "finishing", "quality_check", "delivered"];

const ProductionPage = () => {
  const [data, setData] = useState<Order[]>(initialOrders);

  const advanceStatus = (order: Order) => {
    const idx = statuses.indexOf(order.productionStatus);
    if (idx < statuses.length - 1) {
      setData(d => d.map(o => o.id === order.id ? { ...o, productionStatus: statuses[idx + 1] } : o));
    }
  };

  const columns = [
    { key: "clientName", header: "Client" },
    { key: "description", header: "Description" },
    { key: "productionStatus", header: "Status", render: (o: Order) => <StatusBadge status={o.productionStatus} /> },
    { key: "deliveryDate", header: "Delivery", mono: true },
    { key: "installationTeam", header: "Team" },
    {
      key: "actions", header: "",
      render: (o: Order) => o.productionStatus !== "delivered" ? (
        <button
          onClick={(e) => { e.stopPropagation(); advanceStatus(o); }}
          className="px-2 py-1 text-[11px] font-bold rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
        >
          ADVANCE →
        </button>
      ) : (
        <span className="text-[11px] text-success font-bold">✓ DONE</span>
      ),
    },
  ];

  return (
    <DashboardLayout title="Production" subtitle="Order Tracking">
      <div className="animate-fade-in space-y-6">
        <div className="flex gap-3 flex-wrap">
          {statuses.map(s => {
            const count = data.filter(o => o.productionStatus === s).length;
            return (
              <div key={s} className="flex items-center gap-2 px-3 py-1.5 border border-border rounded bg-card text-sm">
                <StatusBadge status={s} />
                <span className="font-mono text-xs text-muted-foreground">{count}</span>
              </div>
            );
          })}
        </div>
        <DataTable columns={columns} data={data} />
      </div>
    </DashboardLayout>
  );
};

export default ProductionPage;
