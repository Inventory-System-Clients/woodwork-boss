import { ApiError, request, toNullableString } from "@/services/api";

export type StockMovementType = "entrada" | "saida";

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  movementType: StockMovementType;
  quantity: number;
  unit: string | null;
  reason: string;
  referenceType: string | null;
  referenceId: string | null;
  currentStock: number;
  createdAt: string;
}

export interface ListStockMovementsFilters {
  productId?: string;
  movementType?: StockMovementType;
  limit?: number;
  offset?: number;
}

export interface StockMovementsMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface ListStockMovementsResult {
  data: StockMovement[];
  meta: StockMovementsMeta;
}

export interface CreateStockMovementInput {
  productId: string;
  movementType: StockMovementType;
  quantity: number;
  unit?: string | null;
  reason: string;
  referenceType?: string | null;
  referenceId?: string | null;
}

export interface StockMovementConflictDetail {
  productId: string;
  productName: string;
  requestedQuantity: number;
  availableStock: number;
}

export class StockMovementConflictError extends Error {
  status: number;
  details: StockMovementConflictDetail[];

  constructor(message: string, details: StockMovementConflictDetail[]) {
    super(message);
    this.status = 409;
    this.details = details;
  }
}

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const toStringSafe = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const toNullableText = (value: unknown) => {
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

const normalizeMovementType = (value: unknown): StockMovementType => {
  const raw = toStringSafe(value, "").trim().toLowerCase();

  if (raw === "entrada" || raw === "entry") {
    return "entrada";
  }

  if (raw === "saida" || raw === "exit") {
    return "saida";
  }

  return "entrada";
};

const normalizeMovement = (value: unknown): StockMovement | null => {
  const item = toRecord(value);

  if (!item) {
    return null;
  }

  const id = toStringSafe(item.id, "").trim();
  const productId = toStringSafe(item.productId ?? item.product_id, "").trim();

  if (!id || !productId) {
    return null;
  }

  return {
    id,
    productId,
    productName: toStringSafe(item.productName ?? item.product_name, "Produto"),
    movementType: normalizeMovementType(item.movementType ?? item.movement_type ?? item.type),
    quantity: toNumberSafe(item.quantity, 0),
    unit: toNullableText(item.unit),
    reason: toStringSafe(item.reason ?? item.note, ""),
    referenceType: toNullableText(item.referenceType ?? item.reference_type),
    referenceId: toNullableText(item.referenceId ?? item.reference_id),
    currentStock: toNumberSafe(item.currentStock ?? item.current_stock, 0),
    createdAt: toStringSafe(item.createdAt ?? item.created_at ?? item.date, ""),
  };
};

const mapConflictDetail = (value: unknown): StockMovementConflictDetail | null => {
  const item = toRecord(value);

  if (!item) {
    return null;
  }

  return {
    productId: toStringSafe(item.productId ?? item.product_id, ""),
    productName: toStringSafe(item.productName ?? item.product_name, ""),
    requestedQuantity: toNumberSafe(item.requestedQuantity ?? item.requested_quantity, 0),
    availableStock: toNumberSafe(item.availableStock ?? item.available_stock, 0),
  };
};

const extractConflictDetails = (payload: unknown) => {
  const record = toRecord(payload);

  if (!record) {
    return [] as StockMovementConflictDetail[];
  }

  const source = record.details ?? record.detail;

  if (Array.isArray(source)) {
    return source
      .map(mapConflictDetail)
      .filter((item): item is StockMovementConflictDetail => Boolean(item));
  }

  const single = mapConflictDetail(source);
  return single ? [single] : [];
};

const mapStockMeta = (payload: unknown, fallbackLength: number): StockMovementsMeta => {
  const record = toRecord(payload);
  const meta = toRecord(record?.meta);

  return {
    total: toNumberSafe(meta?.total, fallbackLength),
    limit: toNumberSafe(meta?.limit, Math.max(fallbackLength, 1)),
    offset: toNumberSafe(meta?.offset, 0),
  };
};

const buildMovementsPath = (filters?: ListStockMovementsFilters) => {
  const params = new URLSearchParams();

  if (filters?.productId?.trim()) {
    params.set("productId", filters.productId.trim());
  }

  if (filters?.movementType) {
    params.set("movementType", filters.movementType);
  }

  if (typeof filters?.limit === "number" && Number.isFinite(filters.limit)) {
    const clamped = Math.min(Math.max(Math.trunc(filters.limit), 1), 200);
    params.set("limit", String(clamped));
  }

  if (typeof filters?.offset === "number" && Number.isFinite(filters.offset)) {
    params.set("offset", String(Math.max(Math.trunc(filters.offset), 0)));
  }

  const query = params.toString();
  return query ? `/stock/movements?${query}` : "/stock/movements";
};

const toPayload = (input: CreateStockMovementInput) => ({
  productId: input.productId,
  movementType: input.movementType,
  quantity: Math.max(0, Math.trunc(toNumberSafe(input.quantity, 0))),
  unit: toNullableString(input.unit ?? null),
  reason: input.reason.trim(),
  referenceType: toNullableString(input.referenceType ?? null),
  referenceId: toNullableString(input.referenceId ?? null),
});

export const listStockMovements = async (
  filters?: ListStockMovementsFilters,
): Promise<ListStockMovementsResult> => {
  const payload = await request<unknown>(buildMovementsPath(filters));
  const record = toRecord(payload);

  const source = Array.isArray(record?.data)
    ? record.data
    : Array.isArray(payload)
      ? payload
      : [];

  const data = source
    .map(normalizeMovement)
    .filter((item): item is StockMovement => Boolean(item));

  return {
    data,
    meta: mapStockMeta(payload, data.length),
  };
};

export const createStockMovement = async (input: CreateStockMovementInput) => {
  try {
    const payload = await request<unknown>("/stock/movements", {
      method: "POST",
      body: JSON.stringify(toPayload(input)),
    });

    const record = toRecord(payload);
    const normalized = normalizeMovement(record?.data ?? payload);

    if (!normalized) {
      throw new Error("Nao foi possivel interpretar a movimentacao retornada pela API.");
    }

    return normalized;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const details = extractConflictDetails(error.payload);
      throw new StockMovementConflictError(error.message, details);
    }

    throw error;
  }
};
