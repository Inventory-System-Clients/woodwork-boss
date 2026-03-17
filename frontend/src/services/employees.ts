import { parseCollection, request, toNullableString } from "@/services/api";
import type { UserRole } from "@/auth/types";

export interface Employee {
  id: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmployeeInput {
  name: string;
  position: string | null;
  phone: string | null;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
}

export interface UpdateEmployeeInput {
  name?: string;
  position?: string | null;
  phone?: string | null;
  email?: string;
  password?: string;
  role?: UserRole;
  isActive?: boolean;
}

const toStringOrNull = (value: unknown) => (typeof value === "string" ? value : null);

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

const normalizeEmployee = (value: unknown): Employee | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  const id = item.id;
  const name = item.name;

  if (typeof id !== "string" || typeof name !== "string") {
    return null;
  }

  return {
    id,
    name,
    position: toStringOrNull(item.position),
    phone: toStringOrNull(item.phone),
    email: typeof item.email === "string" ? item.email : "",
    role: normalizeRole(item.role),
    isActive: typeof item.isActive === "boolean" ? item.isActive : true,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
  };
};

const parseEmployeePayload = (payload: unknown) => normalizeEmployee(payload);

const toCreatePayload = (input: CreateEmployeeInput) => ({
  name: input.name.trim(),
  position: toNullableString(input.position),
  phone: toNullableString(input.phone),
  email: input.email.trim(),
  password: input.password,
  role: input.role,
  isActive: Boolean(input.isActive),
});

const toUpdatePayload = (input: UpdateEmployeeInput) => {
  const payload: Record<string, unknown> = {};

  if (input.name !== undefined) {
    payload.name = input.name.trim();
  }

  if (input.position !== undefined) {
    payload.position = toNullableString(input.position);
  }

  if (input.phone !== undefined) {
    payload.phone = toNullableString(input.phone);
  }

  if (input.email !== undefined) {
    payload.email = input.email.trim();
  }

  if (input.password !== undefined) {
    payload.password = input.password;
  }

  if (input.role !== undefined) {
    payload.role = input.role;
  }

  if (input.isActive !== undefined) {
    payload.isActive = input.isActive;
  }

  return payload;
};

export const listEmployees = async () => {
  const payload = await request<unknown>("/employees");

  return parseCollection<unknown>(payload)
    .map(normalizeEmployee)
    .filter((item): item is Employee => Boolean(item));
};

export const getEmployee = async (employeeId: string) => {
  const payload = await request<unknown>(`/employees/${employeeId}`);
  return parseEmployeePayload(payload);
};

export const createEmployee = async (input: CreateEmployeeInput) => {
  const payload = await request<unknown>("/employees", {
    method: "POST",
    body: JSON.stringify(toCreatePayload(input)),
  });

  return parseEmployeePayload(payload);
};

export const updateEmployee = async (employeeId: string, input: UpdateEmployeeInput) => {
  const payload = await request<unknown>(`/employees/${employeeId}`, {
    method: "PATCH",
    body: JSON.stringify(toUpdatePayload(input)),
  });

  return parseEmployeePayload(payload);
};

export const deleteEmployee = async (employeeId: string) => {
  await request<unknown>(`/employees/${employeeId}`, {
    method: "DELETE",
  });
};
