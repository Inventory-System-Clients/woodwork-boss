import type { ProductionMaterial } from "@/data/mockData";

export const INVENTORY_REFRESH_EVENT = "inventory:refresh-needed";

export interface InventoryRefreshEventDetail {
  productionId: string;
  source: "production-approve" | "production-complete";
  status: "approved" | "delivered";
  materials: ProductionMaterial[];
  happenedAt: string;
}

interface DispatchInventoryRefreshInput {
  productionId: string;
  source: "production-approve" | "production-complete";
  status: "approved" | "delivered";
  materials: ProductionMaterial[];
}

export const dispatchInventoryRefresh = ({
  productionId,
  source,
  status,
  materials,
}: DispatchInventoryRefreshInput) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<InventoryRefreshEventDetail>(INVENTORY_REFRESH_EVENT, {
      detail: {
        productionId,
        source,
        status,
        materials: materials.map((material) => ({ ...material })),
        happenedAt: new Date().toISOString(),
      },
    }),
  );
};
