import { ApiError, parseCollection, request } from "@/services/api";
import type { ProductionMaterial } from "@/data/mockData";

export type ProductionStatus =
  | "pending"
  | "cutting"
  | "assembly"
  | "finishing"
  | "quality_check"
  | "approved"
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

export interface SharedProductionSnapshot extends EmployeeProduction {
  observations: string;
  updatedAt: string;
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

export interface CompleteProductionStockDetail {
  productId: string;
  productName: string;
  requestedQuantity: number;
  availableStock: number;
}

export type CompleteProductionErrorCode =
  | "insufficient_stock"
  | "invalid_material_data"
  | "stock_configuration_missing"
  | "forbidden"
  | "not_found"
  | "server_error"
  | "unknown";

export type ProductionShareErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "server_error"
  | "unknown";

interface CompleteProductionErrorInput {
  status: number;
  code: CompleteProductionErrorCode;
  message: string;
  details?: CompleteProductionStockDetail[];
}

interface ProductionShareErrorInput {
  status: number;
  code: ProductionShareErrorCode;
  message: string;
}

export interface ProductionShareLink {
  token: string;
  url: string;
  expiresAt: string;
}

export class CompleteProductionError extends Error {
  status: number;
  code: CompleteProductionErrorCode;
  details: CompleteProductionStockDetail[];

  constructor({ status, code, message, details = [] }: CompleteProductionErrorInput) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ProductionShareError extends Error {
  status: number;
  code: ProductionShareErrorCode;

  constructor({ status, code, message }: ProductionShareErrorInput) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const toStringSafe = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const getWindowOrigin = () => {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.origin.replace(/\/$/, "");
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

const normalizeStatus = (status: unknown): ProductionStatus => {
  switch (status) {
    case "pending":
    case "cutting":
    case "assembly":
    case "finishing":
    case "quality_check":
    case "approved":
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

const mapStockDetail = (value: unknown): CompleteProductionStockDetail | null => {
  const detail = toRecord(value);

  if (!detail) {
    return null;
  }

  const productId = toStringSafe(detail.productId ?? detail.product_id, "");
  const productName = toStringSafe(detail.productName ?? detail.product_name, "");
  const requestedQuantity = toNumber(detail.requestedQuantity ?? detail.requested_quantity);
  const availableStock = toNumber(detail.availableStock ?? detail.available_stock);

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

const extractStockDetails = (payload: unknown): CompleteProductionStockDetail[] => {
  const data = toRecord(payload);

  if (!data) {
    return [];
  }

  const rawDetails = data.details ?? data.detail;

  if (Array.isArray(rawDetails)) {
    return rawDetails
      .map(mapStockDetail)
      .filter((detail): detail is CompleteProductionStockDetail => Boolean(detail));
  }

  const fromDetails = mapStockDetail(rawDetails);

  if (fromDetails) {
    return [fromDetails];
  }

  const fromPayload = mapStockDetail(data);

  if (fromPayload) {
    return [fromPayload];
  }

  return [];
};

const formatQuantity = (value: number) =>
  Number.isInteger(value)
    ? String(value)
    : value.toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      });

export const formatStockDetailMessage = (detail: CompleteProductionStockDetail) => {
  const productName = detail.productName || "Produto sem nome";
  const productId = detail.productId || "sem-id";

  return `Produto ${productName} (id: ${productId}): solicitado ${formatQuantity(detail.requestedQuantity)}, disponivel ${formatQuantity(detail.availableStock)}`;
};

const mapCompleteProductionError = (error: ApiError) => {
  const details = extractStockDetails(error.payload);

  switch (error.status) {
    case 409:
      return new CompleteProductionError({
        status: 409,
        code: "insufficient_stock",
        message: "Estoque insuficiente para concluir a producao",
        details,
      });
    case 400:
      return new CompleteProductionError({
        status: 400,
        code: "invalid_material_data",
        message: "Dados inconsistentes na producao/orcamento. Revise os materiais vinculados ao produto.",
        details,
      });
    case 500:
      return new CompleteProductionError({
        status: 500,
        code: "stock_configuration_missing",
        message: "Configuracao de estoque do servidor nao aplicada. Contate o suporte.",
      });
    default:
      return new CompleteProductionError({
        status: error.status,
        code: "unknown",
        message: error.message || "Falha ao aprovar/concluir producao.",
        details,
      });
  }
};

const shouldFallbackToLegacyComplete = (error: ApiError) =>
  error.status === 404 || error.status === 405;

const sendApproveRequest = async (productionId: string) => {
  await request<unknown>(`/productions/${productionId}/approve`, {
    method: "PATCH",
  });
};

const sendCompleteRequest = async (productionId: string) => {
  await request<unknown>(`/productions/${productionId}/complete`, {
    method: "PATCH",
  });
};

const sendAdvanceStatusRequest = async (productionId: string) => {
  return request<unknown>(`/productions/${productionId}/advance-status`, {
    method: "PATCH",
  });
};

const sendCreateShareLinkRequest = async (productionId: string) => {
  try {
    return await request<unknown>(`/productions/${productionId}/share-link`, {
      method: "POST",
    });
  } catch (error) {
    if (!(error instanceof ApiError) || (error.status !== 404 && error.status !== 405)) {
      throw error;
    }

    return request<unknown>(`/productions/${productionId}/share`, {
      method: "POST",
    });
  }
};

const fetchPublicProductionByToken = async (token: string) => {
  const normalizedToken = token.trim();

  if (!normalizedToken) {
    throw new ProductionShareError({
      status: 400,
      code: "not_found",
      message: "Token de compartilhamento invalido.",
    });
  }

  try {
    return await request<unknown>(`/public/productions/${encodeURIComponent(normalizedToken)}`, undefined, {
      skipAuth: true,
    });
  } catch (error) {
    if (!(error instanceof ApiError) || (error.status !== 404 && error.status !== 405)) {
      throw error;
    }
  }

  try {
    return await request<unknown>(`/productions/public/${encodeURIComponent(normalizedToken)}`, undefined, {
      skipAuth: true,
    });
  } catch (error) {
    if (!(error instanceof ApiError) || (error.status !== 404 && error.status !== 405)) {
      throw error;
    }
  }

  return request<unknown>(`/productions/shared/${encodeURIComponent(normalizedToken)}`, undefined, {
    skipAuth: true,
  });
};

const mapAdvanceProductionError = (error: ApiError) => {
  const details = extractStockDetails(error.payload);

  switch (error.status) {
    case 403:
      return new CompleteProductionError({
        status: 403,
        code: "forbidden",
        message: "Acesso negado. Apenas admin e gerente podem alterar o status da producao.",
      });
    case 404:
      return new CompleteProductionError({
        status: 404,
        code: "not_found",
        message: "Producao nao encontrada.",
      });
    case 409:
      return new CompleteProductionError({
        status: 409,
        code: "insufficient_stock",
        message: "Estoque insuficiente para avancar para a etapa de aprovacao.",
        details,
      });
    case 500:
      return new CompleteProductionError({
        status: 500,
        code: "server_error",
        message: "Erro interno no servidor ao avancar a etapa da producao.",
      });
    default:
      return new CompleteProductionError({
        status: error.status,
        code: "unknown",
        message: error.message || "Falha ao avancar etapa da producao.",
        details,
      });
  }
};

const mapShareProductionError = (error: ApiError) => {
  switch (error.status) {
    case 401:
      return new ProductionShareError({
        status: 401,
        code: "unauthorized",
        message: "Sessao expirada ou invalida. Faca login novamente.",
      });
    case 403:
      return new ProductionShareError({
        status: 403,
        code: "forbidden",
        message: "Acesso negado. Apenas admin e gerente podem compartilhar producao.",
      });
    case 404:
      return new ProductionShareError({
        status: 404,
        code: "not_found",
        message: "Producao nao encontrada para compartilhamento.",
      });
    case 500:
      return new ProductionShareError({
        status: 500,
        code: "server_error",
        message: "Erro interno no servidor ao gerar link de compartilhamento.",
      });
    default:
      return new ProductionShareError({
        status: error.status,
        code: "unknown",
        message: error.message || "Nao foi possivel compartilhar a producao.",
      });
  }
};

const mapPublicProductionError = (error: ApiError) => {
  switch (error.status) {
    case 404:
      return new ProductionShareError({
        status: 404,
        code: "not_found",
        message: "Link de acompanhamento invalido ou expirado.",
      });
    case 500:
      return new ProductionShareError({
        status: 500,
        code: "server_error",
        message: "Erro interno ao carregar o acompanhamento da producao.",
      });
    default:
      return new ProductionShareError({
        status: error.status,
        code: "unknown",
        message: error.message || "Nao foi possivel carregar o acompanhamento da producao.",
      });
  }
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
  const id = String(item.id ?? "").trim();

  if (!id) {
    return null;
  }

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
    id,
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

const mapSharedProduction = (value: unknown): SharedProductionSnapshot | null => {
  const production = mapProduction(value);

  if (!production || !value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;

  return {
    ...production,
    observations: toStringSafe(item.observations ?? item.notes ?? item.note ?? item.description, "").trim(),
    updatedAt: toStringSafe(item.updatedAt ?? item.updated_at, ""),
  };
};

const ensureProduction = (payload: unknown, fallbackMessage: string) => {
  const normalized = mapProduction(unwrapDataEnvelope(payload));

  if (!normalized) {
    throw new Error(fallbackMessage);
  }

  return normalized;
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

  return ensureProduction(payload, "Nao foi possivel criar a producao.");
};

export const createProductionShareLink = async (productionId: string): Promise<ProductionShareLink> => {
  const normalizedId = productionId.trim();

  if (!normalizedId) {
    throw new ProductionShareError({
      status: 400,
      code: "not_found",
      message: "ID da producao invalido para compartilhamento.",
    });
  }

  try {
    const payload = await sendCreateShareLinkRequest(normalizedId);
    const data = unwrapDataEnvelope(payload);
    const record = toRecord(data);

    if (!record) {
      throw new ProductionShareError({
        status: 500,
        code: "server_error",
        message: "Resposta invalida ao gerar link de compartilhamento.",
      });
    }

    const token = toStringSafe(record.token ?? record.shareToken ?? record.share_token, "").trim();
    const receivedUrl = toStringSafe(record.url ?? record.shareUrl ?? record.share_url ?? record.link, "").trim();
    const expiresAt = toStringSafe(record.expiresAt ?? record.expires_at, "").trim();

    const fallbackUrl = token
      ? `${getWindowOrigin()}/acompanhar-producao/${encodeURIComponent(token)}`
      : "";

    const url = (() => {
      if (!receivedUrl) {
        return fallbackUrl;
      }

      if (/^https?:\/\//i.test(receivedUrl)) {
        return receivedUrl;
      }

      if (receivedUrl.startsWith("/")) {
        const origin = getWindowOrigin();
        return origin ? `${origin}${receivedUrl}` : receivedUrl;
      }

      return receivedUrl;
    })();

    if (!token && !url) {
      throw new ProductionShareError({
        status: 500,
        code: "server_error",
        message: "Nao foi possivel montar o link de compartilhamento da producao.",
      });
    }

    const safeToken = token || (() => {
      try {
        const parsed = new URL(url);
        const fromPath = parsed.pathname.split("/").filter(Boolean).pop();
        return fromPath ? decodeURIComponent(fromPath) : "";
      } catch {
        return "";
      }
    })();

    return {
      token: safeToken,
      url,
      expiresAt,
    };
  } catch (error) {
    if (error instanceof ProductionShareError) {
      throw error;
    }

    if (error instanceof ApiError) {
      throw mapShareProductionError(error);
    }

    if (error instanceof Error) {
      throw new ProductionShareError({
        status: 0,
        code: "unknown",
        message: error.message,
      });
    }

    throw new ProductionShareError({
      status: 0,
      code: "unknown",
      message: "Falha inesperada ao compartilhar producao.",
    });
  }
};

export const getSharedProductionSnapshot = async (token: string) => {
  try {
    const payload = await fetchPublicProductionByToken(token);
    const normalized = mapSharedProduction(unwrapDataEnvelope(payload));

    if (!normalized) {
      throw new ProductionShareError({
        status: 500,
        code: "server_error",
        message: "Nao foi possivel interpretar os dados da producao compartilhada.",
      });
    }

    return normalized;
  } catch (error) {
    if (error instanceof ProductionShareError) {
      throw error;
    }

    if (error instanceof ApiError) {
      throw mapPublicProductionError(error);
    }

    if (error instanceof Error) {
      throw new ProductionShareError({
        status: 0,
        code: "unknown",
        message: error.message,
      });
    }

    throw new ProductionShareError({
      status: 0,
      code: "unknown",
      message: "Falha inesperada ao consultar acompanhamento publico da producao.",
    });
  }
};

export const advanceProductionStatus = async (productionId: string) => {
  try {
    const payload = await sendAdvanceStatusRequest(productionId);
    return ensureProduction(payload, "Nao foi possivel avancar etapa da producao.");
  } catch (error) {
    if (error instanceof ApiError) {
      throw mapAdvanceProductionError(error);
    }

    if (error instanceof Error) {
      throw new CompleteProductionError({
        status: 0,
        code: "unknown",
        message: error.message,
      });
    }

    throw new CompleteProductionError({
      status: 0,
      code: "unknown",
      message: "Falha inesperada ao avancar etapa da producao.",
    });
  }
};

export const completeProduction = async (productionId: string) => {
  try {
    try {
      await sendApproveRequest(productionId);
    } catch (error) {
      if (error instanceof ApiError && shouldFallbackToLegacyComplete(error)) {
        await sendCompleteRequest(productionId);
      } else {
        throw error;
      }
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw mapCompleteProductionError(error);
    }

    if (error instanceof Error) {
      throw new CompleteProductionError({
        status: 0,
        code: "unknown",
        message: error.message,
      });
    }

    throw new CompleteProductionError({
      status: 0,
      code: "unknown",
      message: "Falha inesperada ao aprovar/concluir producao.",
    });
  }
};
