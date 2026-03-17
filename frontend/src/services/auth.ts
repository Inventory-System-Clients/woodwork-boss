import type { AuthUser, UserRole } from "@/auth/types";
import { request } from "@/services/api";

interface LoginResponseData {
  token: string;
  user: AuthUser;
}

const normalizeRole = (value: unknown): UserRole => {
  switch (value) {
    case "admin":
    case "gerente":
    case "funcionario":
      return value;
    default:
      return "funcionario";
  }
};

const mapAuthUser = (value: unknown): AuthUser | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;

  if (typeof item.id !== "string" || typeof item.name !== "string" || typeof item.email !== "string") {
    return null;
  }

  return {
    id: item.id,
    name: item.name,
    email: item.email,
    role: normalizeRole(item.role),
  };
};

const extractData = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const container = payload as Record<string, unknown>;
  return container.data;
};

export const loginWithPassword = async (email: string, password: string): Promise<LoginResponseData> => {
  const payload = await request<unknown>(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        email: email.trim(),
        password,
      }),
    },
    { skipAuth: true },
  );

  const data = extractData(payload);

  if (!data || typeof data !== "object") {
    throw new Error("Resposta inválida do login.");
  }

  const body = data as Record<string, unknown>;
  const token = body.token;
  const user = mapAuthUser(body.user);

  if (typeof token !== "string" || !token || !user) {
    throw new Error("Resposta inválida do login.");
  }

  return { token, user };
};

export const fetchMe = async (): Promise<AuthUser> => {
  const payload = await request<unknown>("/auth/me");
  const data = extractData(payload);
  const user = mapAuthUser(data);

  if (!user) {
    throw new Error("Não foi possível restaurar a sessão.");
  }

  return user;
};
