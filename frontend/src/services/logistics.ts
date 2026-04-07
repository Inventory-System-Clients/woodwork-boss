import { parseCollection, request } from "@/services/api";

export interface ActiveProductionMaterialConsumptionRow {
  productId: string;
  productName: string;
  unit: string;
  totalQuantityUsed: number;
  activeProductionsCount: number;
}

export interface ActiveProductionMaterialConsumptionMeta {
  startDate: string | null;
  endDate: string | null;
  totalItems: number;
}

export interface ListActiveProductionMaterialConsumptionResult {
  data: ActiveProductionMaterialConsumptionRow[];
  meta: ActiveProductionMaterialConsumptionMeta;
}

interface ListActiveProductionMaterialConsumptionFilters {
  startDate?: string;
  endDate?: string;
}

export interface LogisticsMonthlyClosing {
  id: string;
  referenceMonth: string;
  custoGeralAtivo: number;
  receitaVinculada: number;
  lucroLiquido: number;
  lucroBruto: number;
  custosAplicadosPreAprovados: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertLogisticsMonthlyClosingInput {
  referenceMonth: string;
  custoGeralAtivo: number;
  receitaVinculada: number;
  lucroLiquido: number;
  lucroBruto: number;
  custosAplicadosPreAprovados: number;
}

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const toStringSafe = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const toNullableString = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toNumberSafe = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeRow = (value: unknown): ActiveProductionMaterialConsumptionRow | null => {
  const item = toRecord(value);

  if (!item) {
    return null;
  }

  const productId = toStringSafe(item.productId ?? item.product_id, "").trim();
  const productName = toStringSafe(item.productName ?? item.product_name, "").trim();

  if (!productId && !productName) {
    return null;
  }

  return {
    productId: productId || productName,
    productName: productName || "Produto",
    unit: toStringSafe(item.unit, "unidade") || "unidade",
    totalQuantityUsed: Math.max(0, toNumberSafe(item.totalQuantityUsed ?? item.total_quantity_used, 0)),
    activeProductionsCount: Math.max(
      0,
      Math.trunc(toNumberSafe(item.activeProductionsCount ?? item.active_productions_count, 0)),
    ),
  };
};

const normalizeMeta = (
  payload: unknown,
  fallbackLength: number,
): ActiveProductionMaterialConsumptionMeta => {
  const record = toRecord(payload);
  const rawMeta = toRecord(record?.meta);

  return {
    startDate: toNullableString(rawMeta?.startDate ?? rawMeta?.start_date),
    endDate: toNullableString(rawMeta?.endDate ?? rawMeta?.end_date),
    totalItems: Math.max(0, Math.trunc(toNumberSafe(rawMeta?.totalItems ?? rawMeta?.total_items, fallbackLength))),
  };
};

const buildPath = (filters?: ListActiveProductionMaterialConsumptionFilters) => {
  const params = new URLSearchParams();

  if (filters?.startDate?.trim()) {
    params.set("startDate", filters.startDate.trim());
  }

  if (filters?.endDate?.trim()) {
    params.set("endDate", filters.endDate.trim());
  }

  const query = params.toString();
  const basePath = "/logistics/active-productions/material-consumption";

  return query ? `${basePath}?${query}` : basePath;
};

const normalizeMonthlyClosing = (value: unknown): LogisticsMonthlyClosing | null => {
  const item = toRecord(value);

  if (!item) {
    return null;
  }

  const id = toStringSafe(item.id, "").trim();
  const referenceMonth = toStringSafe(item.referenceMonth ?? item.reference_month, "").trim();

  if (!id || !referenceMonth) {
    return null;
  }

  return {
    id,
    referenceMonth,
    custoGeralAtivo: toNumberSafe(item.custoGeralAtivo ?? item.custo_geral_ativo, 0),
    receitaVinculada: toNumberSafe(item.receitaVinculada ?? item.receita_vinculada, 0),
    lucroLiquido: toNumberSafe(item.lucroLiquido ?? item.lucro_liquido, 0),
    lucroBruto: toNumberSafe(item.lucroBruto ?? item.lucro_bruto, 0),
    custosAplicadosPreAprovados: toNumberSafe(
      item.custosAplicadosPreAprovados ?? item.custos_aplicados_pre_aprovados,
      0,
    ),
    createdAt: toStringSafe(item.createdAt ?? item.created_at, ""),
    updatedAt: toStringSafe(item.updatedAt ?? item.updated_at, ""),
  };
};

const buildMonthlyClosingsPath = (referenceMonth?: string) => {
  const normalizedReferenceMonth = toStringSafe(referenceMonth, "").trim();

  if (!normalizedReferenceMonth) {
    return "/logistics/fechamentos";
  }

  return `/logistics/fechamentos?referenceMonth=${encodeURIComponent(normalizedReferenceMonth)}`;
};

export const listActiveProductionMaterialConsumption = async (
  filters?: ListActiveProductionMaterialConsumptionFilters,
): Promise<ListActiveProductionMaterialConsumptionResult> => {
  const payload = await request<unknown>(buildPath(filters));
  const record = toRecord(payload);

  const source = Array.isArray(record?.data)
    ? record.data
    : parseCollection<unknown>(payload);

  const data = source
    .map(normalizeRow)
    .filter((item): item is ActiveProductionMaterialConsumptionRow => Boolean(item));

  return {
    data,
    meta: normalizeMeta(payload, data.length),
  };
};

export const upsertLogisticsMonthlyClosing = async (
  input: UpsertLogisticsMonthlyClosingInput,
): Promise<LogisticsMonthlyClosing> => {
  const payload = await request<unknown>("/logistics/fechamentos", {
    method: "POST",
    body: JSON.stringify(input),
  });

  const record = toRecord(payload);
  const normalized = normalizeMonthlyClosing(record?.data ?? payload);

  if (!normalized) {
    throw new Error("Nao foi possivel interpretar o fechamento mensal retornado pela API.");
  }

  return normalized;
};

export const listLogisticsMonthlyClosings = async (
  referenceMonth?: string,
): Promise<LogisticsMonthlyClosing[]> => {
  const payload = await request<unknown>(buildMonthlyClosingsPath(referenceMonth));
  const record = toRecord(payload);

  const source = Array.isArray(record?.data)
    ? record.data
    : parseCollection<unknown>(payload);

  return source
    .map(normalizeMonthlyClosing)
    .filter((item): item is LogisticsMonthlyClosing => Boolean(item));
};
