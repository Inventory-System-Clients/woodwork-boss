import { parseCollection, request, toNullableString } from "@/services/api";

export interface Client {
  id: string;
  name: string;
  companyName: string | null;
  document: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  secondaryPhone: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  notes: string | null;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ListClientsFilters {
  search?: string;
  isActive?: boolean;
}

export interface CreateClientInput {
  name: string;
  companyName?: string | null;
  document?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  secondaryPhone?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  notes?: string | null;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

export type UpdateClientInput = Partial<CreateClientInput>;

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const toStringSafe = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const toStringOrNull = (value: unknown) => (typeof value === "string" ? value : null);

const toClientMetadata = (value: unknown): Record<string, unknown> => {
  const record = toRecord(value);
  return record || {};
};

const normalizeClient = (value: unknown): Client | null => {
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
    companyName: toStringOrNull(item.companyName ?? item.company_name),
    document: toStringOrNull(item.document),
    contactName: toStringOrNull(item.contactName ?? item.contact_name),
    email: toStringOrNull(item.email),
    phone: toStringOrNull(item.phone),
    secondaryPhone: toStringOrNull(item.secondaryPhone ?? item.secondary_phone),
    street: toStringOrNull(item.street),
    number: toStringOrNull(item.number),
    complement: toStringOrNull(item.complement),
    neighborhood: toStringOrNull(item.neighborhood),
    city: toStringOrNull(item.city),
    state: toStringOrNull(item.state),
    postalCode: toStringOrNull(item.postalCode ?? item.postal_code),
    notes: toStringOrNull(item.notes),
    isActive: typeof item.isActive === "boolean" ? item.isActive : true,
    metadata: toClientMetadata(item.metadata),
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

const ensureClient = (payload: unknown, fallbackMessage: string) => {
  const normalized = normalizeClient(unwrapDataEnvelope(payload));

  if (!normalized) {
    throw new Error(fallbackMessage);
  }

  return normalized;
};

const buildClientsPath = (filters?: ListClientsFilters) => {
  const params = new URLSearchParams();

  if (filters?.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (typeof filters?.isActive === "boolean") {
    params.set("isActive", String(filters.isActive));
  }

  const query = params.toString();
  return query ? `/clients?${query}` : "/clients";
};

const toPayload = (input: CreateClientInput | UpdateClientInput, partial = false) => {
  const payload: Record<string, unknown> = {};

  if (!partial || input.name !== undefined) {
    payload.name = toStringSafe(input.name, "").trim();
  }

  if (!partial || input.companyName !== undefined) {
    payload.companyName = toNullableString(input.companyName);
  }

  if (!partial || input.document !== undefined) {
    payload.document = toNullableString(input.document);
  }

  if (!partial || input.contactName !== undefined) {
    payload.contactName = toNullableString(input.contactName);
  }

  if (!partial || input.email !== undefined) {
    payload.email = toNullableString(input.email);
  }

  if (!partial || input.phone !== undefined) {
    payload.phone = toNullableString(input.phone);
  }

  if (!partial || input.secondaryPhone !== undefined) {
    payload.secondaryPhone = toNullableString(input.secondaryPhone);
  }

  if (!partial || input.street !== undefined) {
    payload.street = toNullableString(input.street);
  }

  if (!partial || input.number !== undefined) {
    payload.number = toNullableString(input.number);
  }

  if (!partial || input.complement !== undefined) {
    payload.complement = toNullableString(input.complement);
  }

  if (!partial || input.neighborhood !== undefined) {
    payload.neighborhood = toNullableString(input.neighborhood);
  }

  if (!partial || input.city !== undefined) {
    payload.city = toNullableString(input.city);
  }

  if (!partial || input.state !== undefined) {
    payload.state = toNullableString(input.state);
  }

  if (!partial || input.postalCode !== undefined) {
    payload.postalCode = toNullableString(input.postalCode);
  }

  if (!partial || input.notes !== undefined) {
    payload.notes = toNullableString(input.notes);
  }

  if (!partial || input.isActive !== undefined) {
    payload.isActive = Boolean(input.isActive);
  }

  if (!partial || input.metadata !== undefined) {
    payload.metadata = toClientMetadata(input.metadata);
  }

  return payload;
};

export const listClients = async (filters?: ListClientsFilters) => {
  const payload = await request<unknown>(buildClientsPath(filters));
  const unwrapped = unwrapDataEnvelope(payload);

  if (Array.isArray(unwrapped)) {
    return unwrapped
      .map(normalizeClient)
      .filter((item): item is Client => Boolean(item));
  }

  const collection = parseCollection<unknown>(payload)
    .map(normalizeClient)
    .filter((item): item is Client => Boolean(item));

  if (collection.length > 0) {
    return collection;
  }

  const maybeSingle = normalizeClient(unwrapped);
  return maybeSingle ? [maybeSingle] : [];
};

export const getClientById = async (id: string) => {
  const payload = await request<unknown>(`/clients/${id.trim()}`);
  return ensureClient(payload, "Nao foi possivel carregar o cliente.");
};

export const createClient = async (input: CreateClientInput) => {
  const payload = await request<unknown>("/clients", {
    method: "POST",
    body: JSON.stringify(toPayload(input)),
  });

  return ensureClient(payload, "Nao foi possivel criar o cliente.");
};

export const updateClient = async (id: string, input: UpdateClientInput) => {
  const payload = await request<unknown>(`/clients/${id.trim()}`, {
    method: "PATCH",
    body: JSON.stringify(toPayload(input, true)),
  });

  return ensureClient(payload, "Nao foi possivel atualizar o cliente.");
};

export const deleteClient = async (id: string) => {
  await request<unknown>(`/clients/${id.trim()}`, {
    method: "DELETE",
  });
};
