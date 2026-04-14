import { ApiError, parseCollection, request, toNullableString } from "@/services/api";

export type BudgetStatus = "draft" | "pending" | "pre_approved" | "approved" | "rejected";
export type BudgetCategory = "arquitetonico" | "executivo";

export interface BudgetMaterial {
  productId?: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export interface BudgetExpenseDepartment {
  expenseDepartmentId?: string;
  name: string;
  sector: string;
  amount: number;
}

export interface BudgetApplicableCost {
  applicableCostId?: string;
  name: string;
  amount: number;
}

export interface ExpenseDepartmentCatalogItem {
  id: string;
  name: string;
  sector: string;
  defaultAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetFinancialSummary {
  costsApplicableValue?: number;
  expenseDepartmentsCost?: number;
  applicableCostsCost?: number;
  costsAppliedAt?: string | null;
  costsAppliedValue?: number;
  remainingCostToApply?: number;
}

export interface Budget {
  id: string;
  clientName: string;
  category: BudgetCategory;
  description: string;
  status: BudgetStatus;
  deliveryDate: string | null;
  estimatedDeliveryBusinessDays?: number | null;
  totalPrice: number;
  totalCost?: number;
  laborCost?: number;
  profitMargin?: number;
  profitValue?: number;
  notes: string | null;
  approvedAt: string | null;
  costsApplicableValue?: number;
  costsAppliedAt?: string | null;
  costsAppliedValue?: number;
  createdAt: string;
  updatedAt: string;
  materials: BudgetMaterial[];
  expenseDepartments: BudgetExpenseDepartment[];
  applicableCosts: BudgetApplicableCost[];
  financialSummary?: BudgetFinancialSummary;
}

export interface CreateBudgetInput {
  clientName: string;
  category: BudgetCategory;
  description: string;
  deliveryDate: string | null;
  estimatedDeliveryBusinessDays?: number | null;
  totalPrice: number;
  costsApplicableValue?: number;
  notes: string | null;
  status: BudgetStatus;
  materials: BudgetMaterial[];
  expenseDepartments?: BudgetExpenseDepartment[];
  applicableCosts?: BudgetApplicableCost[];
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

const toOptionalNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toOptionalMargin = (value: unknown) => {
  const numeric = toOptionalNumber(value);

  if (numeric === undefined) {
    return undefined;
  }

  if (numeric > 1 && numeric <= 100) {
    return numeric / 100;
  }

  return numeric;
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
    case "pre_approved":
    case "approved":
    case "rejected":
      return value;
    default:
      return "draft";
  }
};

const normalizeCategory = (value: unknown): BudgetCategory => {
  switch (value) {
    case "arquitetonico":
    case "executivo":
      return value;
    default:
      return "arquitetonico";
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

const normalizeBudgetExpenseDepartment = (value: unknown): BudgetExpenseDepartment | null => {
  const item = toRecord(value);

  if (!item) {
    return null;
  }

  const name = toStringSafe(item.name, "").trim();
  const sector = toStringSafe(item.sector, "").trim();

  if (!name || !sector) {
    return null;
  }

  const expenseDepartmentId = toStringSafe(
    item.expenseDepartmentId ?? item.expense_department_id,
    "",
  );

  return {
    expenseDepartmentId: expenseDepartmentId || undefined,
    name,
    sector,
    amount: Math.max(0, toNumberSafe(item.amount, 0)),
  };
};

const normalizeBudgetApplicableCost = (value: unknown): BudgetApplicableCost | null => {
  const item = toRecord(value);

  if (!item) {
    return null;
  }

  const name = toStringSafe(item.name, "").trim();

  if (!name) {
    return null;
  }

  const applicableCostId = toStringSafe(
    item.applicableCostId ?? item.applicable_cost_id,
    "",
  );

  return {
    applicableCostId: applicableCostId || undefined,
    name,
    amount: Math.max(0, toNumberSafe(item.amount, 0)),
  };
};

const normalizeExpenseDepartmentCatalogItem = (value: unknown): ExpenseDepartmentCatalogItem | null => {
  const item = toRecord(value);

  if (!item) {
    return null;
  }

  const id = toStringSafe(item.id, "");
  const name = toStringSafe(item.name, "").trim();
  const sector = toStringSafe(item.sector, "").trim();

  if (!id || !name || !sector) {
    return null;
  }

  return {
    id,
    name,
    sector,
    defaultAmount: Math.max(0, toNumberSafe(item.defaultAmount ?? item.default_amount, 0)),
    createdAt: toStringSafe(item.createdAt ?? item.created_at, ""),
    updatedAt: toStringSafe(item.updatedAt ?? item.updated_at, ""),
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
  const rawExpenseDepartments = (
    Array.isArray(item.expenseDepartments ?? item.expense_departments)
      ? (item.expenseDepartments ?? item.expense_departments)
      : []
  ) as unknown[];
  const rawApplicableCosts = (
    Array.isArray(item.applicableCosts ?? item.applicable_costs)
      ? (item.applicableCosts ?? item.applicable_costs)
      : []
  ) as unknown[];
  const financialSummary = toRecord(item.financialSummary ?? item.financial_summary);
  const totalCost = toOptionalNumber(item.totalCost ?? item.total_cost ?? item.cost ?? item.cost_price);
  const laborCost = toOptionalNumber(item.laborCost ?? item.labor_cost);
  const profitMargin =
    toOptionalMargin(
      item.profitMargin ??
        item.profit_margin ??
        item.margin ??
        item.marginPercent ??
        item.margin_percent,
    ) ??
    (toRecord(item.financialSummary)
      ? toOptionalMargin(
          toRecord(item.financialSummary)?.profitMargin ??
            toRecord(item.financialSummary)?.profit_margin ??
            toRecord(item.financialSummary)?.margin,
        )
      : undefined);
  const profitValue =
    toOptionalNumber(item.profitValue ?? item.profit_value ?? item.profit) ??
    (toRecord(item.financialSummary)
      ? toOptionalNumber(
          toRecord(item.financialSummary)?.profitValue ??
            toRecord(item.financialSummary)?.profit_value ??
            toRecord(item.financialSummary)?.profit,
        )
      : undefined);

  return {
    id,
    clientName: toStringSafe(item.clientName ?? item.client_name, "Cliente não informado"),
    category: normalizeCategory(item.category),
    description: toStringSafe(item.description, ""),
    status: normalizeStatus(item.status),
    deliveryDate: toNullableIsoString(item.deliveryDate ?? item.delivery_date),
    estimatedDeliveryBusinessDays: toOptionalNumber(
      item.estimatedDeliveryBusinessDays ??
        item.estimated_delivery_business_days ??
        item.deliveryBusinessDays ??
        item.delivery_business_days,
    ),
    totalPrice: toNumberSafe(item.totalPrice ?? item.total_price, 0),
    totalCost,
    laborCost,
    profitMargin,
    profitValue,
    notes: toNullableString(toStringSafe(item.notes, "")),
    approvedAt: toNullableIsoString(item.approvedAt ?? item.approved_at),
    costsApplicableValue: toOptionalNumber(
      item.costsApplicableValue ?? item.costs_applicable_value,
    ),
    costsAppliedAt: toNullableIsoString(item.costsAppliedAt ?? item.costs_applied_at),
    costsAppliedValue: toOptionalNumber(item.costsAppliedValue ?? item.costs_applied_value),
    createdAt: toStringSafe(item.createdAt ?? item.created_at, ""),
    updatedAt: toStringSafe(item.updatedAt ?? item.updated_at, ""),
    materials: rawMaterials
      .map(normalizeBudgetMaterial)
      .filter((material): material is BudgetMaterial => Boolean(material)),
    expenseDepartments: rawExpenseDepartments
      .map(normalizeBudgetExpenseDepartment)
      .filter((department): department is BudgetExpenseDepartment => Boolean(department)),
    applicableCosts: rawApplicableCosts
      .map(normalizeBudgetApplicableCost)
      .filter((cost): cost is BudgetApplicableCost => Boolean(cost)),
    financialSummary: financialSummary
      ? {
          costsApplicableValue: toOptionalNumber(
            financialSummary.costsApplicableValue ?? financialSummary.costs_applicable_value,
          ),
          expenseDepartmentsCost: toOptionalNumber(
            financialSummary.expenseDepartmentsCost ??
              financialSummary.expense_departments_cost,
          ),
          applicableCostsCost: toOptionalNumber(
            financialSummary.applicableCostsCost ??
              financialSummary.applicable_costs_cost,
          ),
          costsAppliedAt: toNullableIsoString(
            financialSummary.costsAppliedAt ?? financialSummary.costs_applied_at,
          ),
          costsAppliedValue: toOptionalNumber(
            financialSummary.costsAppliedValue ?? financialSummary.costs_applied_value,
          ),
          remainingCostToApply: toOptionalNumber(
            financialSummary.remainingCostToApply ?? financialSummary.remaining_cost_to_apply,
          ),
        }
      : undefined,
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

  if (!partial || input.category !== undefined) {
    payload.category = normalizeCategory(input.category);
  }

  if (!partial || input.description !== undefined) {
    payload.description = toStringSafe(input.description, "").trim();
  }

  if (!partial || input.deliveryDate !== undefined) {
    payload.deliveryDate = input.deliveryDate ?? null;
  }

  if (!partial || input.estimatedDeliveryBusinessDays !== undefined) {
    const value = toOptionalNumber(input.estimatedDeliveryBusinessDays);
    payload.estimatedDeliveryBusinessDays = value === undefined ? null : Math.max(0, Math.trunc(value));
  }

  if (!partial || input.totalPrice !== undefined) {
    payload.totalPrice = toNumberSafe(input.totalPrice, 0);
  }

  if (!partial || input.costsApplicableValue !== undefined) {
    payload.costsApplicableValue = Math.max(0, toNumberSafe(input.costsApplicableValue, 0));
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

  if (!partial || input.expenseDepartments !== undefined) {
    payload.expenseDepartments = (input.expenseDepartments || []).map((department) => ({
      expenseDepartmentId: toNullableString(department.expenseDepartmentId),
      name: toStringSafe(department.name, "").trim(),
      sector: toStringSafe(department.sector, "").trim(),
      amount: Math.max(0, toNumberSafe(department.amount, 0)),
    }));
  }

  if (!partial || input.applicableCosts !== undefined) {
    payload.applicableCosts = (input.applicableCosts || []).map((cost) => ({
      applicableCostId: toNullableString(cost.applicableCostId),
      name: toStringSafe(cost.name, "").trim(),
      amount: Math.max(0, toNumberSafe(cost.amount, 0)),
    }));
  }

  return payload;
};

export const listBudgets = async (category?: BudgetCategory) => {
  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  const payload = await request<unknown>(`/budgets${query}`);
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

export const listExpenseDepartments = async (search?: string) => {
  const normalizedSearch = toStringSafe(search, "").trim();
  const query = normalizedSearch ? `?search=${encodeURIComponent(normalizedSearch)}` : "";
  const payload = await request<unknown>(`/budgets/expense-departments${query}`);
  const unwrapped = unwrapDataEnvelope(payload);

  if (Array.isArray(unwrapped)) {
    return unwrapped
      .map(normalizeExpenseDepartmentCatalogItem)
      .filter((item): item is ExpenseDepartmentCatalogItem => Boolean(item));
  }

  return parseCollection<unknown>(payload)
    .map(normalizeExpenseDepartmentCatalogItem)
    .filter((item): item is ExpenseDepartmentCatalogItem => Boolean(item));
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
