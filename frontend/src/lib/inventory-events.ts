export const INVENTORY_REFRESH_EVENT = "inventory:refresh-needed";
export const INVENTORY_DATA_CHANGED_EVENT = "inventory:data-changed";

export interface InventoryMaterial {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
}

export type InventoryChangeSource =
  | "production-approve"
  | "production-complete"
  | "budget-approve"
  | "stock-movement-create";

export interface InventoryRefreshEventDetail {
  productionId: string;
  source: "production-approve" | "production-complete";
  status: "approved" | "delivered";
  materials: InventoryMaterial[];
  happenedAt: string;
}

export interface InventoryDataChangedEventDetail {
  source: InventoryChangeSource;
  referenceId: string;
  happenedAt: string;
}

interface DispatchInventoryRefreshInput {
  productionId: string;
  source: "production-approve" | "production-complete";
  status: "approved" | "delivered";
  materials: InventoryMaterial[];
}

interface DispatchInventoryDataChangedInput {
  source: InventoryChangeSource;
  referenceId: string;
}

export const dispatchInventoryDataChanged = ({
  source,
  referenceId,
}: DispatchInventoryDataChangedInput) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<InventoryDataChangedEventDetail>(INVENTORY_DATA_CHANGED_EVENT, {
      detail: {
        source,
        referenceId,
        happenedAt: new Date().toISOString(),
      },
    }),
  );
};

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

  dispatchInventoryDataChanged({ source, referenceId: productionId });
};
