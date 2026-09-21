import { request } from "@/services/api";

export const PROJECT_STATUSES = ["Em andamento", "Pausado", "Finalizado"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface ProjectListItem {
  id: string;
  name: string;
  clientName: string;
  deadline: string | null;
  status: ProjectStatus;
  /** Only present for admins. */
  totalCost: number | null;
}

export interface ProjectTotals {
  totalPaid: number;
  totalToPay: number;
  totalCost: number;
}

export interface ProjectCost {
  id: string;
  projectId: string;
  description: string;
  amount: number;
  supplier: string | null;
  isPaid: boolean;
  paidAt: string | null;
  createdAt: string;
  isCommission: boolean;
  commissionEmployeeId: string | null;
  commissionEmployeeName: string | null;
  commissionPercent: number | null;
}

export interface ProjectHoursByEmployee {
  employeeId: string;
  employeeName: string;
  minutes: number;
}

export interface ProjectDetail {
  id: string;
  name: string;
  clientName: string;
  deadline: string | null;
  status: ProjectStatus;
  lastUpdateNote: string | null;
  lastUpdateAt: string | null;
  laborValue: number;
  discountValue: number;
  /** Price charged to the client; null until registered. */
  finalValue: number | null;
  createdAt: string | null;
  finishedAt: string | null;
  totals: ProjectTotals;
  totalMinutes: number;
  hoursByEmployee: ProjectHoursByEmployee[];
  costs: ProjectCost[];
}

export interface ProjectDashboard {
  activeProjects: number;
  totalProjects: number;
  overdueProjects: number;
  totals: ProjectTotals;
  hoursMonthMinutes: number;
  monthLabel: string;
  topProjects: { id: string; name: string; clientName: string; totalCost: number; totalMinutes: number }[];
  monthly: ProjectMonthlyPoint[];
}

export interface ProjectMonthlyPoint {
  /** YYYY-MM */
  month: string;
  expenses: number;
  commissions: number;
  profit: number;
  /** Highest number of projects running on the same day of the month. */
  peakProjects: number;
}

export interface CreateProjectCostInput {
  description?: string;
  amount?: number;
  supplier?: string;
  isPaid: boolean;
  paidAt?: string;
  isCommission?: boolean;
  /** Percentage of the project's other costs, or a fixed value (uses amount). */
  commissionMode?: "percent" | "value";
  commissionPercent?: number;
  commissionEmployeeId?: string;
}

export interface UpdateProjectInput {
  name?: string;
  clientName?: string;
  deadline?: string | null;
  status?: ProjectStatus;
  lastUpdateNote?: string | null;
  laborValue?: number;
  discountValue?: number;
  finalValue?: number | null;
}

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

/** YYYY-MM-DD -> DD/MM/YYYY (no timezone shifts). */
export const formatDateOnly = (value: string | null | undefined) => {
  if (!value) {
    return "—";
  }

  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "—";
};

const unwrap = <T>(payload: unknown): T => {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
};

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value: unknown): ProjectStatus =>
  (PROJECT_STATUSES as readonly string[]).includes(String(value)) ? (value as ProjectStatus) : "Em andamento";

const mapTotals = (value: Partial<ProjectTotals> | undefined): ProjectTotals => ({
  totalPaid: num(value?.totalPaid),
  totalToPay: num(value?.totalToPay),
  totalCost: num(value?.totalCost),
});

const mapListItem = (item: ProjectListItem): ProjectListItem => ({
  id: String(item.id),
  name: item.name ?? "",
  clientName: item.clientName ?? "",
  deadline: item.deadline ?? null,
  status: normalizeStatus(item.status),
  totalCost: item.totalCost === undefined || item.totalCost === null ? null : num(item.totalCost),
});

const mapCost = (item: ProjectCost): ProjectCost => ({
  ...item,
  amount: num(item.amount),
  isCommission: Boolean(item.isCommission),
  commissionEmployeeId: item.commissionEmployeeId ?? null,
  commissionEmployeeName: item.commissionEmployeeName ?? null,
  commissionPercent: item.commissionPercent === null || item.commissionPercent === undefined ? null : num(item.commissionPercent),
});

const mapDetail = (item: ProjectDetail): ProjectDetail => ({
  ...item,
  status: normalizeStatus(item.status),
  lastUpdateNote: item.lastUpdateNote ?? null,
  lastUpdateAt: item.lastUpdateAt ?? null,
  laborValue: num(item.laborValue),
  discountValue: num(item.discountValue),
  finalValue: item.finalValue === null || item.finalValue === undefined ? null : num(item.finalValue),
  createdAt: item.createdAt ?? null,
  finishedAt: item.finishedAt ?? null,
  totals: mapTotals(item.totals),
  totalMinutes: num(item.totalMinutes),
  hoursByEmployee: (item.hoursByEmployee ?? []).map((row) => ({ ...row, minutes: num(row.minutes) })),
  costs: (item.costs ?? []).map(mapCost),
});

export const listProjects = async () =>
  (unwrap<ProjectListItem[]>(await request<unknown>("/projects")) ?? []).map(mapListItem);

export const getProject = async (id: string) =>
  mapDetail(unwrap<ProjectDetail>(await request<unknown>(`/projects/${encodeURIComponent(id)}`)));

export const createProject = async (input: { name: string; clientName: string; status: ProjectStatus }) =>
  mapDetail(
    unwrap<ProjectDetail>(await request<unknown>("/projects", { method: "POST", body: JSON.stringify(input) })),
  );

export const updateProject = async (id: string, input: UpdateProjectInput) =>
  mapDetail(
    unwrap<ProjectDetail>(
      await request<unknown>(`/projects/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    ),
  );

export const addProjectCost = async (projectId: string, input: CreateProjectCostInput) =>
  mapCost(
    unwrap<ProjectCost>(
      await request<unknown>(`/projects/${encodeURIComponent(projectId)}/costs`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ),
  );

export const markProjectCostPaid = async (projectId: string, costId: string, paidAt?: string) =>
  mapCost(
    unwrap<ProjectCost>(
      await request<unknown>(
        `/projects/${encodeURIComponent(projectId)}/costs/${encodeURIComponent(costId)}/pay`,
        { method: "PATCH", body: JSON.stringify({ paidAt }) },
      ),
    ),
  );

export const markProjectCostUnpaid = async (projectId: string, costId: string) =>
  mapCost(
    unwrap<ProjectCost>(
      await request<unknown>(
        `/projects/${encodeURIComponent(projectId)}/costs/${encodeURIComponent(costId)}/unpay`,
        { method: "PATCH" },
      ),
    ),
  );

export const deleteProjectCost = async (projectId: string, costId: string) => {
  await request<unknown>(`/projects/${encodeURIComponent(projectId)}/costs/${encodeURIComponent(costId)}`, {
    method: "DELETE",
  });
};

export const getProjectDashboard = async (): Promise<ProjectDashboard> => {
  const data = unwrap<ProjectDashboard>(await request<unknown>("/projects/dashboard"));

  return {
    activeProjects: num(data.activeProjects),
    totalProjects: num(data.totalProjects),
    overdueProjects: num(data.overdueProjects),
    totals: mapTotals(data.totals),
    hoursMonthMinutes: num(data.hoursMonthMinutes),
    monthLabel: data.monthLabel ?? "",
    topProjects: (data.topProjects ?? []).map((row) => ({
      ...row,
      totalCost: num(row.totalCost),
      totalMinutes: num(row.totalMinutes),
    })),
    monthly: (data.monthly ?? []).map((row) => ({
      month: row.month,
      expenses: num(row.expenses),
      commissions: num(row.commissions),
      profit: num(row.profit),
      peakProjects: num(row.peakProjects),
    })),
  };
};
