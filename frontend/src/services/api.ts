import { getSessionToken, handleUnauthorized } from "@/auth/session";

const rawApiUrl = (import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");

const apiBaseUrl = rawApiUrl
  ? (rawApiUrl.endsWith("/api") ? rawApiUrl : `${rawApiUrl}/api`)
  : "/api";

const isHtmlLike = (body: string) => /^\s*</.test(body);

const getFriendlyStatusMessage = (status: number) => {
  switch (status) {
    case 400:
      return "Não foi possível concluir a operação. Verifique os dados informados.";
    case 401:
      return "Sessão expirada ou inválida. Faça login novamente.";
    case 403:
      return "Acesso negado para esta operação.";
    case 404:
      return "Registro não encontrado.";
    case 409:
      return "Já existe um registro com os mesmos dados. Revise e tente novamente.";
    case 500:
      return "Erro interno no servidor. Tente novamente em instantes.";
    default:
      return `Erro HTTP ${status}.`;
  }
};

const normalizeKnownApiMessage = (status: number, message: string) => {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();

  if (status === 409) {
    if (lower.includes("email") || lower.includes("e-mail")) {
      return "Já existe um registro com este e-mail.";
    }

    if (lower.includes("phone") || lower.includes("telefone")) {
      return "Já existe um registro com este telefone.";
    }

    if (lower.includes("name") || lower.includes("nome")) {
      return "Já existe um registro com este nome.";
    }

    if (
      lower.includes("already exists") ||
      lower.includes("duplicate") ||
      lower.includes("unique") ||
      lower.includes("conflito") ||
      lower.includes("já existe")
    ) {
      return "Já existe um registro com os mesmos dados. Revise e tente novamente.";
    }
  }

  if (status === 400 && lower.includes("validation")) {
    return "Alguns campos são inválidos. Revise os dados informados.";
  }

  return normalized;
};

const getPayloadMessage = (payload: unknown) => {
  if (typeof payload === "string") {
    const message = payload.trim();
    return message ? message : null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = payload as Record<string, unknown>;
  const message = data.message ?? data.error;

  if (typeof message === "string" && message.trim()) {
    return message;
  }

  return null;
};

const parsePayload = async (response: Response) => {
  const raw = await response.text();

  if (!raw.trim()) {
    return null;
  }

  if (isHtmlLike(raw)) {
    throw new ApiError(
      response.status || 500,
      "A API retornou HTML em vez de JSON. Verifique VITE_API_URL e o proxy /api no Vite.",
    );
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
};

const ensureLeadingSlash = (path: string) => (path.startsWith("/") ? path : `/${path}`);

interface RequestOptions {
  skipAuth?: boolean;
}

export class ApiError extends Error {
  status: number;
  payload?: unknown;

  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export const apiConfig = {
  baseUrl: apiBaseUrl,
  hasCustomBaseUrl: Boolean(rawApiUrl),
};

export const parseCollection = <T>(payload: unknown): T[] => {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (payload && typeof payload === "object") {
    const collection = payload as Record<string, unknown>;

    if (Array.isArray(collection.items)) {
      return collection.items as T[];
    }

    if (Array.isArray(collection.data)) {
      return collection.data as T[];
    }
  }

  return [];
};

export const toNullableString = (value: string | null | undefined) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export const request = async <T>(path: string, init: RequestInit = {}, options: RequestOptions = {}) => {
  const url = `${apiBaseUrl}${ensureLeadingSlash(path)}`;
  const headers = new Headers(init.headers || {});
  const token = getSessionToken();

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (!options.skipAuth && token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(url, { ...init, headers });
  } catch {
    throw new ApiError(
      0,
      "Não foi possível conectar ao backend. Verifique VITE_API_URL e se a API está disponível.",
    );
  }

  const payload = await parsePayload(response);

  if (!response.ok) {
    if (response.status === 401 && !options.skipAuth) {
      handleUnauthorized();
    }

    const rawMessage = getPayloadMessage(payload) || getFriendlyStatusMessage(response.status);
    const message = normalizeKnownApiMessage(response.status, rawMessage);
    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
};
