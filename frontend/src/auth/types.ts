export type UserRole = "admin" | "funcionario";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export const isManagerRole = (role?: UserRole | null) => role === "admin";
