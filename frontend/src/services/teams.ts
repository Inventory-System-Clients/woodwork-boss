import { parseCollection, request, toNullableString } from "@/services/api";

export interface TeamMember {
  employeeId: string;
  name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  members: TeamMember[];
}

export interface CreateTeamInput {
  name: string;
  description: string | null;
  memberIds: string[];
}

export interface UpdateTeamInput {
  name?: string;
  description?: string | null;
}

const toStringOrNull = (value: unknown) => (typeof value === "string" ? value : null);

const toEmployeeIds = (employeeIds: string[]) =>
  Array.from(
    new Set(
      employeeIds
        .map((id) => id.trim())
        .filter((id) => Boolean(id)),
    ),
  );

const normalizeMember = (value: unknown): TeamMember | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  const employeeId = item.employeeId;
  const name = item.name;

  if (typeof employeeId !== "string" || typeof name !== "string") {
    return null;
  }

  return {
    employeeId,
    name,
    position: toStringOrNull(item.position),
    email: toStringOrNull(item.email),
    phone: toStringOrNull(item.phone),
    isActive: typeof item.isActive === "boolean" ? item.isActive : true,
  };
};

const normalizeTeam = (value: unknown): Team | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  const id = item.id;
  const name = item.name;

  if (typeof id !== "string" || typeof name !== "string") {
    return null;
  }

  const rawMembers = Array.isArray(item.members) ? item.members : [];

  return {
    id,
    name,
    description: toStringOrNull(item.description),
    createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
    members: rawMembers.map(normalizeMember).filter((member): member is TeamMember => Boolean(member)),
  };
};

const parseTeamPayload = (payload: unknown) => normalizeTeam(payload);

const toCreatePayload = (input: CreateTeamInput) => ({
  name: input.name.trim(),
  description: toNullableString(input.description),
  memberIds: toEmployeeIds(input.memberIds),
});

const toUpdatePayload = (input: UpdateTeamInput) => {
  const payload: Record<string, unknown> = {};

  if (input.name !== undefined) {
    payload.name = input.name.trim();
  }

  if (input.description !== undefined) {
    payload.description = toNullableString(input.description);
  }

  return payload;
};

export const listTeams = async () => {
  const payload = await request<unknown>("/teams");

  return parseCollection<unknown>(payload)
    .map(normalizeTeam)
    .filter((item): item is Team => Boolean(item));
};

export const getTeam = async (teamId: string) => {
  const payload = await request<unknown>(`/teams/${teamId}`);
  return parseTeamPayload(payload);
};

export const createTeam = async (input: CreateTeamInput) => {
  const payload = await request<unknown>("/teams", {
    method: "POST",
    body: JSON.stringify(toCreatePayload(input)),
  });

  return parseTeamPayload(payload);
};

export const updateTeam = async (teamId: string, input: UpdateTeamInput) => {
  const payload = await request<unknown>(`/teams/${teamId}`, {
    method: "PATCH",
    body: JSON.stringify(toUpdatePayload(input)),
  });

  return parseTeamPayload(payload);
};

export const updateTeamMembers = async (teamId: string, employeeIds: string[]) => {
  const payload = await request<unknown>(`/teams/${teamId}/members`, {
    method: "PUT",
    body: JSON.stringify({ employeeIds: toEmployeeIds(employeeIds) }),
  });

  return parseTeamPayload(payload);
};

export const deleteTeam = async (teamId: string) => {
  await request<unknown>(`/teams/${teamId}`, {
    method: "DELETE",
  });
};
