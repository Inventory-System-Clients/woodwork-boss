import { ApiError, parseCollection, request, toNullableString } from "@/services/api";

export type BudgetStatus = "draft" | "pending" | "approved" | "rejected";

export interface BudgetMaterial {
  productId?: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export interface Budget {
  id: string;
  clientName: string;
  description: string;
  status: BudgetStatus;
  deliveryDate: string | null;
  totalPrice: number;
  notes: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  materials: BudgetMaterial[];
}

export interface CreateBudgetInput {
  clientName: string;
  description: string;
  deliveryDate: string | null;
  totalPrice: number;
  notes: string | null;
  status: BudgetStatus;
  materials: BudgetMaterial[];
}

export type UpdateBudgetInput = Partial<CreateBudgetInput>;

export interface ApproveBudgetStockDetail {
  productId: string;
  productName: string;
  requestedQuantity: number;
  availableStock: number;
}

export type ApproveBudgetErrorCode =
  | "insufficient_stock"
  | "invalid_material_data"
  | "stock_schema_missing"
  | "unknown";

interface ApproveBudgetErrorInput {
  status: number;
  code: ApproveBudgetErrorCode;
  message: string;
  details?: ApproveBudgetStockDetail[];
}

export class ApproveBudgetError extends Error {
  status: number;
  code: ApproveBudgetErrorCode;
  details: ApproveBudgetStockDetail[];

  constructor({ status, code, message, details = [] }: ApproveBudgetErrorInput) {
    super(message);
    this.status = status;
    this.code = code;
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

const toNullableIsoString = (value: unknown) => {
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

const mapApproveBudgetDetail = (value: unknown): ApproveBudgetStockDetail | null => {
  const item = toRecord(value);

  if (!item) {
    return null;
  }

  const productId = toStringSafe(item.productId ?? item.product_id, "");
  const productName = toStringSafe(item.productName ?? item.product_name, "");
  const requestedQuantity = toNumberSafe(item.requestedQuantity ?? item.requested_quantity, 0);
  const availableStock = toNumberSafe(item.availableStock ?? item.available_stock, 0);

  if (!productId && !productName && requestedQuantity === 0 && availableStock === 0) {
    return null;
  }

  return {
    productId,
    productName,
    requestedQuantity,
    availableStock,
  };
};

const extractApproveBudgetDetails = (payload: unknown) => {
  const record = toRecord(payload);

  if (!record) {
    return [] as ApproveBudgetStockDetail[];
  }

  const source = record.details ?? record.detail;

  if (Array.isArray(source)) {
    return source
      .map(mapApproveBudgetDetail)
      .filter((item): item is ApproveBudgetStockDetail => Boolean(item));
  }

  const single = mapApproveBudgetDetail(source);

  if (single) {
    return [single];
  }

  const fallback = mapApproveBudgetDetail(record);
  return fallback ? [fallback] : [];
};

const mapApproveBudgetError = (error: ApiError) => {
  const details = extractApproveBudgetDetails(error.payload);

  switch (error.status) {
    case 409:
      return new ApproveBudgetError({
        status: 409,
        code: "insufficient_stock",
        message: "Estoque insuficiente para aprovar este orcamento.",
        details,
      });
    case 400:
      return new ApproveBudgetError({
        status: 400,
        code: "invalid_material_data",
        message: "Dados inconsistentes no orcamento. Revise materiais e produtos vinculados.",
        details,
      });
    case 500:
      return new ApproveBudgetError({
        status: 500,
        code: "stock_schema_missing",
        message: "Configuracao de estoque indisponivel no servidor. Contate o suporte.",
      });
    default:
      return new ApproveBudgetError({
        status: error.status,
        code: "unknown",
        message: error.message || "Nao foi possivel aprovar o orcamento.",
        details,
      });
  }
};

export const formatApproveBudgetDetailMessage = (detail: ApproveBudgetStockDetail) => {
  const productName = detail.productName || "Produto";
  const productId = detail.productId || "sem-id";

  return `Produto ${productName} (id: ${productId}): solicitado ${detail.requestedQuantity}, disponivel ${detail.availableStock}.`;
};

const normalizeStatus = (value: unknown): BudgetStatus => {
  switch (value) {
    case "draft":
    case "pending":
    case "approved":
    case "rejected":
      return value;
    default:
      return "draft";
  }
};

const normalizeBudgetMaterial = (value: unknown): BudgetMaterial | null => {
  const item = toRecord(value);

  if (!item) {
    return null;
  }

  const productName = toStringSafe(item.productName ?? item.product_name, "");

  if (!productName) {
    return null;
  }

  const productId = toStringSafe(item.productId ?? item.product_id, "");

  return {
    productId: productId || undefined,
    productName,
    quantity: toNumberSafe(item.quantity, 0),
    unit: toStringSafe(item.unit, "unidade"),
    unitPrice: toNumberSafe(item.unitPrice ?? item.unit_price, 0),
  };
};

const normalizeBudget = (value: unknown): Budget | null => {
  const item = toRecord(value);

  if (!item) {
    return null;
  }

  const id = toStringSafe(item.id, "");

  if (!id) {
    return null;
  }

  const rawMaterials = Array.isArray(item.materials) ? item.materials : [];

  return {
    id,
    clientName: toStringSafe(item.clientName ?? item.client_name, "Cliente não informado"),
    description: toStringSafe(item.description, ""),
    status: normalizeStatus(item.status),
    deliveryDate: toNullableIsoString(item.deliveryDate ?? item.delivery_date),
    totalPrice: toNumberSafe(item.totalPrice ?? item.total_price, 0),
    notes: toNullableString(toStringSafe(item.notes, "")),
    approvedAt: toNullableIsoString(item.approvedAt ?? item.approved_at),
    createdAt: toStringSafe(item.createdAt ?? item.created_at, ""),
    updatedAt: toStringSafe(item.updatedAt ?? item.updated_at, ""),
    materials: rawMaterials
      .map(normalizeBudgetMaterial)
      .filter((material): material is BudgetMaterial => Boolean(material)),
  };
};

const unwrapDataEnvelope = (payload: unknown) => {
  const record = toRecord(payload);

  if (!record) {
    return payload;
  }

  if (record.data !== undefined) {
    return record.data;
  }

  return payload;
};

const ensureBudget = (payload: unknown, fallbackMessage: string) => {
  const normalized = normalizeBudget(unwrapDataEnvelope(payload));

  if (!normalized) {
    throw new Error(fallbackMessage);
  }

  return normalized;
};

const toBudgetPayload = (input: CreateBudgetInput | UpdateBudgetInput, partial = false) => {
  const payload: Record<string, unknown> = {};

  if (!partial || input.clientName !== undefined) {
    payload.clientName = toStringSafe(input.clientName, "").trim();
  }

  if (!partial || input.description !== undefined) {
    payload.description = toStringSafe(input.description, "").trim();
  }

  if (!partial || input.deliveryDate !== undefined) {
    payload.deliveryDate = input.deliveryDate ?? null;
  }

  if (!partial || input.totalPrice !== undefined) {
    payload.totalPrice = toNumberSafe(input.totalPrice, 0);
  }

  if (!partial || input.notes !== undefined) {
    payload.notes = toNullableString(input.notes);
  }

  if (!partial || input.status !== undefined) {
    payload.status = normalizeStatus(input.status);
  }

  if (!partial || input.materials !== undefined) {
    payload.materials = (input.materials || []).map((material) => ({
      productId: toNullableString(material.productId),
      productName: toStringSafe(material.productName, "").trim(),
      quantity: toNumberSafe(material.quantity, 0),
      unit: toStringSafe(material.unit, "unidade").trim(),
      unitPrice: toNumberSafe(material.unitPrice, 0),
    }));
  }

  return payload;
};

export const listBudgets = async () => {
  const payload = await request<unknown>("/budgets");
  const unwrapped = unwrapDataEnvelope(payload);

  if (Array.isArray(unwrapped)) {
    return unwrapped
      .map(normalizeBudget)
      .filter((budget): budget is Budget => Boolean(budget));
  }

  const collection = parseCollection<unknown>(payload)
    .map(normalizeBudget)
    .filter((budget): budget is Budget => Boolean(budget));

  if (collection.length > 0) {
    return collection;
  }

  const maybeSingle = normalizeBudget(unwrapped);
  return maybeSingle ? [maybeSingle] : [];
};

export const getBudgetById = async (id: string) => {
  const payload = await request<unknown>(`/budgets/${id}`);
  return ensureBudget(payload, "Não foi possível carregar os detalhes do orçamento.");
};

export const createBudget = async (input: CreateBudgetInput) => {
  const payload = await request<unknown>("/budgets", {
    method: "POST",
    body: JSON.stringify(toBudgetPayload(input)),
  });

  return ensureBudget(payload, "Não foi possível criar o orçamento.");
};

export const updateBudget = async (id: string, input: UpdateBudgetInput) => {
  const payload = await request<unknown>(`/budgets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(toBudgetPayload(input, true)),
  });

  return ensureBudget(payload, "Não foi possível atualizar o orçamento.");
};

export const approveBudget = async (id: string) => {
  try {
    const payload = await request<unknown>(`/budgets/${id}/approve`, {
      method: "PATCH",
    });

    return ensureBudget(payload, "Não foi possível aprovar o orçamento.");
  } catch (error) {
    if (error instanceof ApiError) {
      throw mapApproveBudgetError(error);
    }

    throw error;
  }
};
