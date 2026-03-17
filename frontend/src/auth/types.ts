export type UserRole = "admin" | "gerente" | "funcionario";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export const isManagerRole = (role?: UserRole | null) => role === "admin" || role === "gerente";
