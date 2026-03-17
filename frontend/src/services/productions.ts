import { parseCollection, request } from "@/services/api";
import type { ProductionMaterial } from "@/data/mockData";

export type ProductionStatus =
  | "pending"
  | "cutting"
  | "assembly"
  | "finishing"
  | "quality_check"
  | "delivered";

export interface EmployeeProduction {
  id: string;
  clientName: string;
  description: string;
  productionStatus: ProductionStatus;
  deliveryDate: string;
  installationTeam: string;
  installationTeamId?: string;
  initialCost: number;
  materials: ProductionMaterial[];
}

export interface CreateProductionInput {
  clientName: string;
  description: string;
  deliveryDate: string | null;
  installationTeamId: string;
  initialCost: number;
  materials: ProductionMaterial[];
}

interface ListProductionsParams {
  employeeId?: string;
}

const toStringSafe = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (status: unknown): ProductionStatus => {
  switch (status) {
    case "pending":
    case "cutting":
    case "assembly":
    case "finishing":
    case "quality_check":
    case "delivered":
      return status;
    default:
      return "pending";
  }
};

const normalizeDeliveryDate = (value: unknown) => {
  const raw = toStringSafe(value, "");
  return raw.includes("T") ? raw.split("T")[0] : raw;
};

const mapMaterial = (value: unknown): ProductionMaterial | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const material = value as Record<string, unknown>;

  return {
    productId: toStringSafe(material.productId ?? material.product_id, ""),
    productName: toStringSafe(material.productName ?? material.product_name, "Material"),
    quantity: toNumber(material.quantity),
    unit: toStringSafe(material.unit, "unidade"),
  };
};

const mapProduction = (value: unknown): EmployeeProduction | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  const sourceMaterials = Array.isArray(item.materials) ? item.materials : [];

  const rawInstallationTeam =
    item.installationTeam ??
    item.installation_team ??
    item.installationTeamName ??
    item.installation_team_name;

  const installationTeam =
    typeof rawInstallationTeam === "string"
      ? rawInstallationTeam
      : rawInstallationTeam && typeof rawInstallationTeam === "object"
        ? toStringSafe((rawInstallationTeam as Record<string, unknown>).name, "A definir")
        : "A definir";

  const installationTeamId = toStringSafe(
    item.installationTeamId ??
      item.installation_team_id ??
      (rawInstallationTeam && typeof rawInstallationTeam === "object"
        ? (rawInstallationTeam as Record<string, unknown>).id
        : ""),
    "",
  );

  return {
    id: String(item.id ?? ""),
    clientName: toStringSafe(item.clientName ?? item.client_name, "Cliente não informado"),
    description: toStringSafe(item.description, ""),
    productionStatus: normalizeStatus(item.productionStatus ?? item.production_status),
    deliveryDate: normalizeDeliveryDate(item.deliveryDate ?? item.delivery_date),
    installationTeam,
    installationTeamId: installationTeamId || undefined,
    initialCost: toNumber(item.initialCost ?? item.initial_cost),
    materials: sourceMaterials.map(mapMaterial).filter((material): material is ProductionMaterial => Boolean(material)),
  };
};

const buildProductionsPath = (params?: ListProductionsParams) => {
  if (params?.employeeId) {
    return `/productions?employeeId=${encodeURIComponent(params.employeeId)}`;
  }

  return "/productions";
};

export const listProductions = async (params?: ListProductionsParams) => {
  const payload = await request<unknown>(buildProductionsPath(params));

  return parseCollection<unknown>(payload)
    .map(mapProduction)
    .filter((item): item is EmployeeProduction => Boolean(item));
};

export const listProductionsByEmployee = async (employeeId: string) => {
  return listProductions({ employeeId });
};

export const createProduction = async (input: CreateProductionInput) => {
  const payload = await request<unknown>("/productions", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return mapProduction(payload);
};

export const completeProduction = async (productionId: string) => {
  await request<unknown>(`/productions/${productionId}/complete`, {
    method: "PATCH",
  });
};
