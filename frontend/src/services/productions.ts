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

export interface ProductionStageStatus {
  id: string;
  stageId?: string;
  stageName: string;
  teamId: string;
  teamName: string;
  createdAt: string;
}

export interface ProductionStatusOption {
  id: string;
  name: string;
  normalizedName: string;
  usageCount: number;
}

export interface EmployeeProduction {
  id: string;
  clientName: string;
  description: string;
  productionStatus: string;
  deliveryDate: string;
  installationTeam: string;
  installationTeamId?: string;
  budgetId?: string;
  budgetTotalPrice?: number;
  initialCost: number;
  materials: ProductionMaterial[];
  statuses: ProductionStageStatus[];
}

export interface ProductionImage {
  id: string;
  productionId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  url?: string;
}

export interface SharedProductionImage extends Omit<ProductionImage, "productionId"> {
  productionId?: string;
  url: string;
}

export interface SharedProductionSnapshot extends EmployeeProduction {
  observations: string;
  updatedAt: string;
  images: SharedProductionImage[];
}

export interface CreateProductionInput {
  clientName: string;
  description: string;
  deliveryDate: string | null;
  installationTeamId: string;
  initialCost: number;
  materials: ProductionMaterial[];
}

export type AdvanceProductionStatusInput =
  | {
      stageId: string;
      teamId: string;
      stageName?: never;
    }
  | {
      stageName: string;
      teamId: string;
      stageId?: never;
    };

export type ReplaceProductionStatusesInput = {
  statuses: AdvanceProductionStatusInput[];
};

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

export type ProductionImageErrorCode =
  | "bad_request"
  | "payload_too_large"
  | "unsupported_media_type"
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

interface ProductionImageErrorInput {
  status: number;
  code: ProductionImageErrorCode;
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

export class ProductionImageError extends Error {
  status: number;
  code: ProductionImageErrorCode;

  constructor({ status, code, message }: ProductionImageErrorInput) {
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

const toOptionalNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

const MAX_IMAGES_PER_UPLOAD = 10;
const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

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

const sendAdvanceStatusWithPayloadRequest = async (
  productionId: string,
  input: AdvanceProductionStatusInput,
) => {
  return request<unknown>(`/productions/${productionId}/advance-status`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
};

const sendReplaceStatusesRequest = async (
  productionId: string,
  input: ReplaceProductionStatusesInput,
) => {
  return request<unknown>(`/productions/${productionId}/statuses`, {
    method: "PUT",
    body: JSON.stringify(input),
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
    case 401:
      return new CompleteProductionError({
        status: 401,
        code: "unknown",
        message: "Sessao expirada ou invalida. Faca login novamente.",
      });
    case 400:
      return new CompleteProductionError({
        status: 400,
        code: "invalid_material_data",
        message: "Etapa ou equipe invalida. Revise os dados e tente novamente.",
      });
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

const mapProductionImageError = (error: ApiError) => {
  switch (error.status) {
    case 400:
      return new ProductionImageError({
        status: 400,
        code: "bad_request",
        message: "Falha ao enviar imagens. Verifique tipo, tamanho e quantidade dos arquivos.",
      });
    case 401:
      return new ProductionImageError({
        status: 401,
        code: "unauthorized",
        message: "Sessao expirada ou invalida. Faca login novamente.",
      });
    case 403:
      return new ProductionImageError({
        status: 403,
        code: "forbidden",
        message: "Acesso negado. Apenas admin e gerente podem gerenciar imagens da producao.",
      });
    case 404:
      return new ProductionImageError({
        status: 404,
        code: "not_found",
        message: "Producao nao encontrada.",
      });
    case 413:
      return new ProductionImageError({
        status: 413,
        code: "payload_too_large",
        message: "Arquivo muito grande. O limite por imagem e 8MB.",
      });
    case 415:
      return new ProductionImageError({
        status: 415,
        code: "unsupported_media_type",
        message: "Formato de arquivo invalido. Envie apenas arquivos de imagem.",
      });
    case 500:
      return new ProductionImageError({
        status: 500,
        code: "server_error",
        message: "Erro interno ao processar imagens da producao.",
      });
    default:
      return new ProductionImageError({
        status: error.status,
        code: "unknown",
        message: error.message || "Nao foi possivel processar imagens da producao.",
      });
  }
};

const mapProductionImage = (value: unknown): ProductionImage | null => {
  const image = toRecord(value);

  if (!image) {
    return null;
  }

  const id = toStringSafe(image.id ?? image.imageId ?? image.image_id, "").trim();

  if (!id) {
    return null;
  }

  const fileName = toStringSafe(image.fileName ?? image.file_name, "").trim();
  const mimeType = toStringSafe(image.mimeType ?? image.mime_type, "").trim();
  const createdAt = toStringSafe(image.createdAt ?? image.created_at, "").trim();
  const productionId = toStringSafe(image.productionId ?? image.production_id, "").trim();
  const url = toStringSafe(image.url ?? image.fileUrl ?? image.file_url, "").trim();

  return {
    id,
    productionId,
    fileName: fileName || `imagem-${id}`,
    mimeType: mimeType || "image/*",
    fileSize: toNumber(image.fileSize ?? image.file_size),
    createdAt,
    ...(url ? { url } : {}),
  };
};

const mapSharedProductionImage = (value: unknown): SharedProductionImage | null => {
  const parsed = mapProductionImage(value);

  if (!parsed) {
    return null;
  }

  return {
    ...parsed,
    productionId: parsed.productionId || undefined,
    url: toStringSafe(parsed.url, "").trim(),
  };
};

const mapProductionImageCollection = (payload: unknown): ProductionImage[] => {
  return parseCollection<unknown>(unwrapDataEnvelope(payload))
    .map(mapProductionImage)
    .filter((item): item is ProductionImage => Boolean(item));
};

const validateUploadImages = (files: File[]) => {
  if (!files.length) {
    throw new ProductionImageError({
      status: 400,
      code: "bad_request",
      message: "Selecione ao menos uma imagem para enviar.",
    });
  }

  if (files.length > MAX_IMAGES_PER_UPLOAD) {
    throw new ProductionImageError({
      status: 400,
      code: "bad_request",
      message: `Envie no maximo ${MAX_IMAGES_PER_UPLOAD} imagens por envio.`,
    });
  }

  const invalidTypeFile = files.find((file) => !file.type || !file.type.startsWith("image/"));

  if (invalidTypeFile) {
    throw new ProductionImageError({
      status: 400,
      code: "bad_request",
      message: `Arquivo invalido: ${invalidTypeFile.name}. Envie apenas imagens.`,
    });
  }

  const oversizedFile = files.find((file) => file.size > MAX_IMAGE_SIZE_BYTES);

  if (oversizedFile) {
    throw new ProductionImageError({
      status: 400,
      code: "bad_request",
      message: `Arquivo muito grande: ${oversizedFile.name}. O limite por imagem e 8MB.`,
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

const mapProductionStageStatus = (value: unknown): ProductionStageStatus | null => {
  const item = toRecord(value);

  if (!item) {
    return null;
  }

  const id = toStringSafe(item.id, "").trim();
  const stageName = toStringSafe(item.stageName ?? item.stage_name ?? item.name, "").trim();
  const teamId = toStringSafe(item.teamId ?? item.team_id, "").trim();
  const teamName = toStringSafe(item.teamName ?? item.team_name, "").trim();

  if (!id || !stageName || !teamId) {
    return null;
  }

  const stageId = toStringSafe(item.stageId ?? item.stage_id, "").trim();

  return {
    id,
    stageId: stageId || undefined,
    stageName,
    teamId,
    teamName: teamName || "Equipe nao informada",
    createdAt: toStringSafe(item.createdAt ?? item.created_at, "").trim(),
  };
};

const mapProductionStatusOption = (value: unknown): ProductionStatusOption | null => {
  const item = toRecord(value);

  if (!item) {
    return null;
  }

  const id = toStringSafe(item.id, "").trim();
  const name = toStringSafe(item.name, "").trim();

  if (!id || !name) {
    return null;
  }

  const normalizedName = toStringSafe(item.normalizedName ?? item.normalized_name, "").trim();

  return {
    id,
    name,
    normalizedName: normalizedName || name.toLowerCase(),
    usageCount: toNumber(item.usageCount ?? item.usage_count),
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
  const sourceStatuses = Array.isArray(item.statuses) ? item.statuses : [];

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

  const rawBudget = toRecord(item.budget ?? item.budgetData ?? item.budget_data);
  const budgetId = toStringSafe(
    item.budgetId ??
      item.budget_id ??
      (rawBudget ? rawBudget.id : ""),
    "",
  );

  const budgetTotalPrice =
    toOptionalNumber(
      item.budgetTotalPrice ??
        item.budget_total_price ??
        item.totalPrice ??
        item.total_price,
    ) ?? (rawBudget ? toOptionalNumber(rawBudget.totalPrice ?? rawBudget.total_price) : null);

  return {
    id,
    clientName: toStringSafe(item.clientName ?? item.client_name, "Cliente não informado"),
    description: toStringSafe(item.description, ""),
    productionStatus: toStringSafe(item.productionStatus ?? item.production_status, "pending").trim() || "pending",
    deliveryDate: normalizeDeliveryDate(item.deliveryDate ?? item.delivery_date),
    installationTeam,
    installationTeamId: installationTeamId || undefined,
    budgetId: budgetId || undefined,
    budgetTotalPrice: budgetTotalPrice === null ? undefined : budgetTotalPrice,
    initialCost: toNumber(item.initialCost ?? item.initial_cost),
    materials: sourceMaterials.map(mapMaterial).filter((material): material is ProductionMaterial => Boolean(material)),
    statuses: sourceStatuses
      .map(mapProductionStageStatus)
      .filter((status): status is ProductionStageStatus => Boolean(status)),
  };
};

const mapSharedProduction = (value: unknown, token: string): SharedProductionSnapshot | null => {
  const production = mapProduction(value);

  if (!production || !value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  const sourceImages = Array.isArray(item.images) ? item.images : [];
  const encodedToken = encodeURIComponent(token.trim());
  const fallbackBasePath = encodedToken
    ? `/api/public/productions/${encodedToken}/images`
    : "";

  const images = sourceImages
    .map(mapSharedProductionImage)
    .filter((image): image is SharedProductionImage => Boolean(image))
    .map((image) => ({
      ...image,
      url: image.url || (fallbackBasePath ? `${fallbackBasePath}/${encodeURIComponent(image.id)}` : ""),
    }))
    .filter((image) => Boolean(image.url));

  return {
    ...production,
    observations: toStringSafe(item.observations ?? item.notes ?? item.note ?? item.description, "").trim(),
    updatedAt: toStringSafe(item.updatedAt ?? item.updated_at, ""),
    images,
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

export const listProductionStatusOptions = async () => {
  const payload = await request<unknown>("/productions/status-options");
  const data = unwrapDataEnvelope(payload);

  if (Array.isArray(data)) {
    return data
      .map(mapProductionStatusOption)
      .filter((item): item is ProductionStatusOption => Boolean(item));
  }

  return parseCollection<unknown>(payload)
    .map(mapProductionStatusOption)
    .filter((item): item is ProductionStatusOption => Boolean(item));
};

export const createProduction = async (input: CreateProductionInput) => {
  const payload = await request<unknown>("/productions", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return ensureProduction(payload, "Nao foi possivel criar a producao.");
};

export const listProductionImages = async (productionId: string): Promise<ProductionImage[]> => {
  const normalizedId = productionId.trim();

  if (!normalizedId) {
    throw new ProductionImageError({
      status: 400,
      code: "not_found",
      message: "ID da producao invalido para consulta de imagens.",
    });
  }

  try {
    const payload = await request<unknown>(`/productions/${normalizedId}/images`);
    return mapProductionImageCollection(payload);
  } catch (error) {
    if (error instanceof ProductionImageError) {
      throw error;
    }

    if (error instanceof ApiError) {
      throw mapProductionImageError(error);
    }

    if (error instanceof Error) {
      throw new ProductionImageError({
        status: 0,
        code: "unknown",
        message: error.message,
      });
    }

    throw new ProductionImageError({
      status: 0,
      code: "unknown",
      message: "Falha inesperada ao listar imagens da producao.",
    });
  }
};

export const uploadProductionImages = async (productionId: string, files: File[]): Promise<ProductionImage[]> => {
  const normalizedId = productionId.trim();

  if (!normalizedId) {
    throw new ProductionImageError({
      status: 400,
      code: "not_found",
      message: "ID da producao invalido para upload de imagens.",
    });
  }

  validateUploadImages(files);

  const formData = new FormData();

  files.forEach((file) => {
    formData.append("images", file);
  });

  try {
    const payload = await request<unknown>(`/productions/${normalizedId}/images`, {
      method: "POST",
      body: formData,
    });

    return mapProductionImageCollection(payload);
  } catch (error) {
    if (error instanceof ProductionImageError) {
      throw error;
    }

    if (error instanceof ApiError) {
      throw mapProductionImageError(error);
    }

    if (error instanceof Error) {
      throw new ProductionImageError({
        status: 0,
        code: "unknown",
        message: error.message,
      });
    }

    throw new ProductionImageError({
      status: 0,
      code: "unknown",
      message: "Falha inesperada ao enviar imagens da producao.",
    });
  }
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

export const getPublicProductionByToken = async (token: string) => {
  const normalizedToken = token.trim();

  try {
    const payload = await fetchPublicProductionByToken(normalizedToken);
    const normalized = mapSharedProduction(unwrapDataEnvelope(payload), normalizedToken);

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

export const getSharedProductionSnapshot = getPublicProductionByToken;

export const advanceProductionStatus = async (
  productionId: string,
  input?: AdvanceProductionStatusInput,
) => {
  try {
    const payload = input
      ? await sendAdvanceStatusWithPayloadRequest(productionId, input)
      : await sendAdvanceStatusRequest(productionId);
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

export const replaceProductionStatuses = async (
  productionId: string,
  input: ReplaceProductionStatusesInput,
) => {
  try {
    const payload = await sendReplaceStatusesRequest(productionId, input);
    return ensureProduction(payload, "Nao foi possivel atualizar as etapas da producao.");
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
      message: "Falha inesperada ao atualizar etapas da producao.",
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
