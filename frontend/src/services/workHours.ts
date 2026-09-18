import { request } from "@/services/api";

export interface WorkHoursEntry {
  id: string;
  employeeId: string;
  productionId: string;
  productionLabel: string | null;
  workDate: string;
  minutes: number;
}

export interface DayWorkHours {
  date: string;
  today: string;
  yesterday: string;
  totalMinutes: number;
  entries: WorkHoursEntry[];
}

export interface EmployeeWorkHoursReport {
  employeeId: string;
  from: string;
  to: string;
  totalMinutes: number;
  entries: WorkHoursEntry[];
}

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const toStringSafe = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const unwrap = (payload: unknown) => {
  const record = toRecord(payload);
  return record.data !== undefined ? toRecord(record.data) : record;
};

const mapEntry = (value: unknown): WorkHoursEntry | null => {
  const item = toRecord(value);
  const id = toStringSafe(item.id).trim();

  if (!id) {
    return null;
  }

  return {
    id,
    employeeId: toStringSafe(item.employeeId),
    productionId: toStringSafe(item.productionId),
    productionLabel: toStringSafe(item.productionLabel).trim() || null,
    workDate: toStringSafe(item.workDate),
    minutes: toNumber(item.minutes),
  };
};

const mapEntries = (value: unknown): WorkHoursEntry[] =>
  (Array.isArray(value) ? value : []).map(mapEntry).filter((item): item is WorkHoursEntry => Boolean(item));

const mapDay = (payload: unknown): DayWorkHours => {
  const data = unwrap(payload);

  return {
    date: toStringSafe(data.date),
    today: toStringSafe(data.today),
    yesterday: toStringSafe(data.yesterday),
    totalMinutes: toNumber(data.totalMinutes),
    entries: mapEntries(data.entries),
  };
};

export const formatMinutes = (minutes: number) => {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;

  if (hours === 0) {
    return `${rest}min`;
  }

  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, "0")}min`;
};

/** Hours logged by the signed-in employee for a day. Only today or yesterday are accepted (default: today). */
export const getMyWorkHours = async (date?: string) =>
  mapDay(await request<unknown>(`/work-hours/me${date ? `?date=${encodeURIComponent(date)}` : ""}`));

export const setMyWorkHours = async (productionId: string, minutes: number, date?: string) =>
  mapDay(
    await request<unknown>("/work-hours/me", {
      method: "PUT",
      body: JSON.stringify({ productionId, minutes, date }),
    }),
  );

export const getEmployeeWorkHours = async (
  employeeId: string,
  range: { from?: string; to?: string } = {},
): Promise<EmployeeWorkHoursReport> => {
  const params = new URLSearchParams();

  if (range.from) {
    params.set("from", range.from);
  }

  if (range.to) {
    params.set("to", range.to);
  }

  const query = params.toString();
  const data = unwrap(
    await request<unknown>(`/employees/${encodeURIComponent(employeeId)}/work-hours${query ? `?${query}` : ""}`),
  );

  return {
    employeeId: toStringSafe(data.employeeId, employeeId),
    from: toStringSafe(data.from),
    to: toStringSafe(data.to),
    totalMinutes: toNumber(data.totalMinutes),
    entries: mapEntries(data.entries),
  };
};
