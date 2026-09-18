import { parseCollection, request } from "@/services/api";

export interface LogisticsMonthlyClosing {
  id: string;
  referenceMonth: string;
  custoGeralAtivo: number;
  receitaVinculada: number;
  lucroLiquido: number;
  lucroBruto: number;
  custosAplicadosPreAprovados: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertLogisticsMonthlyClosingInput {
  referenceMonth: string;
  custoGeralAtivo: number;
  receitaVinculada: number;
  lucroLiquido: number;
  lucroBruto: number;
  custosAplicadosPreAprovados: number;
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

const normalizeMonthlyClosing = (value: unknown): LogisticsMonthlyClosing | null => {
  const item = toRecord(value);

  if (!item) {
    return null;
  }

  const id = toStringSafe(item.id, "").trim();
  const referenceMonth = toStringSafe(item.referenceMonth ?? item.reference_month, "").trim();

  if (!id || !referenceMonth) {
    return null;
  }

  return {
    id,
    referenceMonth,
    custoGeralAtivo: toNumberSafe(item.custoGeralAtivo ?? item.custo_geral_ativo, 0),
    receitaVinculada: toNumberSafe(item.receitaVinculada ?? item.receita_vinculada, 0),
    lucroLiquido: toNumberSafe(item.lucroLiquido ?? item.lucro_liquido, 0),
    lucroBruto: toNumberSafe(item.lucroBruto ?? item.lucro_bruto, 0),
    custosAplicadosPreAprovados: toNumberSafe(
      item.custosAplicadosPreAprovados ?? item.custos_aplicados_pre_aprovados,
      0,
    ),
    createdAt: toStringSafe(item.createdAt ?? item.created_at, ""),
    updatedAt: toStringSafe(item.updatedAt ?? item.updated_at, ""),
  };
};

const buildMonthlyClosingsPath = (referenceMonth?: string) => {
  const normalizedReferenceMonth = toStringSafe(referenceMonth, "").trim();

  if (!normalizedReferenceMonth) {
    return "/logistics/fechamentos";
  }

  return `/logistics/fechamentos?referenceMonth=${encodeURIComponent(normalizedReferenceMonth)}`;
};

export const upsertLogisticsMonthlyClosing = async (
  input: UpsertLogisticsMonthlyClosingInput,
): Promise<LogisticsMonthlyClosing> => {
  const payload = await request<unknown>("/logistics/fechamentos", {
    method: "POST",
    body: JSON.stringify(input),
  });

  const record = toRecord(payload);
  const normalized = normalizeMonthlyClosing(record?.data ?? payload);

  if (!normalized) {
    throw new Error("Nao foi possivel interpretar o fechamento mensal retornado pela API.");
  }

  return normalized;
};

export const listLogisticsMonthlyClosings = async (
  referenceMonth?: string,
): Promise<LogisticsMonthlyClosing[]> => {
  const payload = await request<unknown>(buildMonthlyClosingsPath(referenceMonth));
  const record = toRecord(payload);

  const source = Array.isArray(record?.data)
    ? record.data
    : parseCollection<unknown>(payload);

  return source
    .map(normalizeMonthlyClosing)
    .filter((item): item is LogisticsMonthlyClosing => Boolean(item));
};
