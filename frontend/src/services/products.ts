import { parseCollection, request } from "@/services/api";

export interface Product {
  id: string;
  name: string;
  stockQuantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductInput {
  name: string;
  stockQuantity: number;
}

export interface UpdateProductInput {
  name: string;
}

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const toStringSafe = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const toNumberSafe = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeProduct = (value: unknown): Product | null => {
  const item = toRecord(value);

  if (!item) {
    return null;
  }

  const id = toStringSafe(item.id, "").trim();
  const name = toStringSafe(item.name, "").trim();

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    stockQuantity: toNumberSafe(item.stockQuantity ?? item.stock_quantity ?? item.stock, 0),
    createdAt: toStringSafe(item.createdAt ?? item.created_at, ""),
    updatedAt: toStringSafe(item.updatedAt ?? item.updated_at, ""),
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

const ensureProduct = (payload: unknown, fallbackMessage: string) => {
  const normalized = normalizeProduct(unwrapDataEnvelope(payload));

  if (!normalized) {
    throw new Error(fallbackMessage);
  }

  return normalized;
};

const toCreatePayload = (input: CreateProductInput) => ({
  name: input.name.trim(),
  stockQuantity: toNumberSafe(input.stockQuantity, 0),
});

const toUpdatePayload = (input: UpdateProductInput) => ({
  name: input.name.trim(),
});

const buildProductsPath = (search?: string) => {
  const query = search?.trim();

  if (!query) {
    return "/products";
  }

  return `/products?search=${encodeURIComponent(query)}`;
};

export const listProducts = async (search?: string) => {
  const payload = await request<unknown>(buildProductsPath(search));
  const unwrapped = unwrapDataEnvelope(payload);

  if (Array.isArray(unwrapped)) {
    return unwrapped
      .map(normalizeProduct)
      .filter((item): item is Product => Boolean(item));
  }

  const collection = parseCollection<unknown>(payload)
    .map(normalizeProduct)
    .filter((item): item is Product => Boolean(item));

  if (collection.length > 0) {
    return collection;
  }

  const maybeSingle = normalizeProduct(unwrapped);
  return maybeSingle ? [maybeSingle] : [];
};

export const getProductById = async (id: string) => {
  const payload = await request<unknown>(`/products/${id}`);
  return ensureProduct(payload, "Nao foi possivel carregar o produto.");
};

export const createProduct = async (input: CreateProductInput) => {
  const payload = await request<unknown>("/products", {
    method: "POST",
    body: JSON.stringify(toCreatePayload(input)),
  });

  return ensureProduct(payload, "Nao foi possivel criar o produto.");
};

export const updateProduct = async (id: string, input: UpdateProductInput) => {
  const payload = await request<unknown>(`/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(toUpdatePayload(input)),
  });

  return ensureProduct(payload, "Nao foi possivel atualizar o produto.");
};
