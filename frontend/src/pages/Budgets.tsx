import { useEffect, useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { FormField } from "@/components/FormField";
import { StatusBadge } from "@/components/StatusBadge";
import { calculateBudget } from "@/data/mockData";
import { ApiError } from "@/services/api";
import { dispatchInventoryDataChanged } from "@/lib/inventory-events";
import {
  ApproveBudgetError,
  ApproveBudgetStockDetail,
  type BudgetApplicableCost as ApiBudgetApplicableCost,
  approveBudget,
  type BudgetExpenseDepartment as ApiBudgetExpenseDepartment,
  createBudget,
  type ExpenseDepartmentCatalogItem,
  formatApproveBudgetDetailMessage,
  getBudgetById,
  listBudgets,
  listExpenseDepartments,
  updateBudget,
  type Budget as ApiBudget,
  type BudgetCategory,
  type BudgetMaterial as ApiBudgetMaterial,
  type BudgetStatus,
} from "@/services/budgets";
import { Client, listClients } from "@/services/clients";
import { Product, listProducts } from "@/services/products";
import { Plus, Trash2 } from "lucide-react";

type MaterialInputMode = "existing" | "new";

const imageDataUrlCache: Record<string, string | null | undefined> = {};

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const formatStatus = (status: BudgetRow["status"]) => {
  switch (status) {
    case "draft":
      return "Rascunho";
    case "pre_approved":
      return "Pre-aprovado";
    case "pending":
      return "Pendente";
    case "approved":
      return "Aprovado";
    case "rejected":
      return "Rejeitado";
    default:
      return status;
  }
};

const formatCategory = (category: BudgetCategory) => {
  switch (category) {
    case "arquitetonico":
      return "Projeto arquitetonico";
    case "executivo":
      return "Projeto executivo";
    default:
      return category;
  }
};

const sanitizeFileName = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Falha ao converter logo para data URL."));
      }
    };

    reader.onerror = () => reject(new Error("Falha ao carregar logo para PDF."));
    reader.readAsDataURL(blob);
  });

const loadImageDataUrl = async (imagePath: string) => {
  const cacheKey = imagePath;

  if (imageDataUrlCache[cacheKey] !== undefined) {
    return imageDataUrlCache[cacheKey] ?? null;
  }

  try {
    const response = await fetch(imagePath);

    if (!response.ok) {
      imageDataUrlCache[cacheKey] = null;
      return null;
    }

    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    imageDataUrlCache[cacheKey] = dataUrl;
    return dataUrl;
  } catch {
    imageDataUrlCache[cacheKey] = null;
    return null;
  }
};

const loadLogoDataUrl = async () => loadImageDataUrl("/image.png");

type ProposalSectionLine = {
  text: string;
  indentLevel: number;
};

const PROPOSAL_DESCRIPTION_PLACEHOLDER = [
  "Arquitetura:",
  "  - Projeto conforme layout aprovado.",
  "  - A.R.T do sistema de deteccao de incendio.",
  "  - Compatibilizacao com projeto eletrico.",
].join("\n");

const PROPOSAL_NOTES_PLACEHOLDER = [
  "Alvenaria:",
  "  - Demolicao completa do forro existente.",
  "  - Instalacao de forro drywall novo.",
  "  - Pintura final conforme projeto aprovado.",
].join("\n");

const DEFAULT_ARCHITECTURE_LINES: ProposalSectionLine[] = [
  { text: "Projeto ou laudo conforme layout aprovado.", indentLevel: 0 },
  { text: "A.R.T. do sistema e da execucao da obra.", indentLevel: 0 },
  { text: "Projeto eletrico e compatibilizacao tecnica.", indentLevel: 0 },
  { text: "Alinhamento final com comunicacao visual.", indentLevel: 0 },
];

const DEFAULT_ALVENARIA_LINES: ProposalSectionLine[] = [
  { text: "Demolicao e preparacao da area existente.", indentLevel: 0 },
  { text: "Instalacoes de base conforme projeto executivo.", indentLevel: 0 },
  { text: "Acabamentos finais de acordo com a aprovacao do cliente.", indentLevel: 0 },
];

const parseProposalSectionLines = (
  value: string | null | undefined,
  fallback: ProposalSectionLine[],
): ProposalSectionLine[] => {
  const parsed = (value || "")
    .split(/\r?\n/)
    .map((line) => {
      const leadingSpaces = line.match(/^\s*/)?.[0].length || 0;
      const indentLevel = Math.min(3, Math.floor(leadingSpaces / 2));
      const text = line.trim().replace(/^[-*•]\s*/, "");
      return {
        text,
        indentLevel,
      };
    })
    .filter((line) => line.text.length > 0);

  return parsed.length > 0 ? parsed : fallback;
};

interface BudgetItemRow {
  productId?: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
}

interface BudgetExpenseDepartmentRow {
  expenseDepartmentId?: string;
  name: string;
  sector: string;
  amount: number;
}

interface BudgetApplicableCostRow {
  applicableCostId?: string;
  name: string;
  amount: number;
}

interface BudgetRow {
  id: string;
  clientId: string;
  clientName: string;
  category: BudgetCategory;
  description: string;
  status: BudgetStatus;
  estimatedDeliveryBusinessDays: number | null;
  deliveryDate: string;
  notes: string | null;
  approvedAt: string | null;
  costsApplicableValue: number;
  costsAppliedAt: string | null;
  costsAppliedValue: number;
  remainingCostToApply: number;
  createdAt: string;
  updatedAt: string;
  items: BudgetItemRow[];
  expenseDepartments: BudgetExpenseDepartmentRow[];
  applicableCosts: BudgetApplicableCostRow[];
  materialCost: number;
  expenseDepartmentsCost: number;
  applicableCostsCost: number;
  laborCost: number;
  totalCost: number;
  profitMargin: number;
  finalPrice: number;
}

const normalizeDateOnly = (value: string | null | undefined) => {
  if (!value || typeof value !== "string") {
    return "";
  }

  return value.includes("T") ? value.split("T")[0] : value;
};

const parseBusinessDaysInput = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return Number.NaN;
  }

  return parsed;
};

const formatBusinessDaysLabel = (value: number | null | undefined) => {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
    return "-";
  }

  const normalized = Math.trunc(Number(value));
  return `${normalized} ${normalized === 1 ? "dia util" : "dias uteis"}`;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

const normalizeName = (value: string) => value.trim().toLowerCase();

const findClientByName = (clientsCatalog: Client[], clientName: string) => {
  const normalized = normalizeName(clientName);

  if (!normalized) {
    return undefined;
  }

  return clientsCatalog.find((client) => normalizeName(client.name) === normalized);
};

const buildClientAddress = (client: Client | undefined) => {
  if (!client) {
    return "";
  }

  const streetLine = [client.street, client.number].filter(Boolean).join(", ");
  const districtLine = [
    client.neighborhood,
    client.city && client.state ? `${client.city}/${client.state}` : client.city || client.state,
  ]
    .filter(Boolean)
    .join(" - ");
  const trailing = [client.complement, districtLine, client.postalCode ? `CEP ${client.postalCode}` : ""]
    .filter(Boolean)
    .join(" • ");

  return [streetLine, trailing].filter(Boolean).join(" | ");
};

const normalizeBudgetError = (error: unknown, fallback: string) => {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "Sessao expirada. Redirecionando para login.";
    }

    if (error.status === 403) {
      return "Acesso negado. Somente admin e gerente podem gerenciar orçamentos.";
    }

    if (error.status === 409) {
      return "Conflito de produto duplicado para este material. Selecione um produto existente no catálogo.";
    }

    if (error.status === 500) {
      return "Erro interno ao processar orçamentos. Tente novamente.";
    }

    if (error.status === 400) {
      return `Erro de validação: ${error.message}`;
    }

    return error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

const extractExpenseDepartmentsFieldErrors = (error: unknown) => {
  if (!(error instanceof ApiError) || error.status !== 400) {
    return {} as Record<string, string>;
  }

  const payload = error.payload;

  if (!payload || typeof payload !== "object") {
    return {} as Record<string, string>;
  }

  const output: Record<string, string> = {};
  const candidates: Array<{ path?: string; message?: string }> = [];

  const record = payload as Record<string, unknown>;

  const collectCandidate = (value: unknown) => {
    if (!value || typeof value !== "object") {
      return;
    }

    const item = value as Record<string, unknown>;
    candidates.push({
      path: typeof item.path === "string" ? item.path : typeof item.field === "string" ? item.field : undefined,
      message:
        typeof item.message === "string"
          ? item.message
          : typeof item.msg === "string"
            ? item.msg
            : undefined,
    });
  };

  if (Array.isArray(record.errors)) {
    record.errors.forEach(collectCandidate);
  }

  if (Array.isArray(record.details)) {
    record.details.forEach(collectCandidate);
  }

  const expensePathRegex = /expense(?:_|)departments?\[(\d+)\]\.(name|sector|amount)/i;

  candidates.forEach((candidate) => {
    if (!candidate.path) {
      return;
    }

    const match = candidate.path.match(expensePathRegex);

    if (!match) {
      return;
    }

    const [, index, field] = match;
    output[`${index}-${field.toLowerCase()}`] = candidate.message || "Campo invalido.";
  });

  return output;
};

const extractApplicableCostsFieldErrors = (error: unknown) => {
  if (!(error instanceof ApiError) || error.status !== 400) {
    return {} as Record<string, string>;
  }

  const payload = error.payload;

  if (!payload || typeof payload !== "object") {
    return {} as Record<string, string>;
  }

  const output: Record<string, string> = {};
  const candidates: Array<{ path?: string; message?: string }> = [];

  const record = payload as Record<string, unknown>;

  const collectCandidate = (value: unknown) => {
    if (!value || typeof value !== "object") {
      return;
    }

    const item = value as Record<string, unknown>;
    candidates.push({
      path: typeof item.path === "string" ? item.path : typeof item.field === "string" ? item.field : undefined,
      message:
        typeof item.message === "string"
          ? item.message
          : typeof item.msg === "string"
            ? item.msg
            : undefined,
    });
  };

  if (Array.isArray(record.errors)) {
    record.errors.forEach(collectCandidate);
  }

  if (Array.isArray(record.details)) {
    record.details.forEach(collectCandidate);
  }

  const applicablePathRegex = /applicable(?:_|)costs?\[(\d+)\]\.(name|amount)/i;

  candidates.forEach((candidate) => {
    if (!candidate.path) {
      return;
    }

    const match = candidate.path.match(applicablePathRegex);

    if (!match) {
      return;
    }

    const [, index, field] = match;
    output[`${index}-${field.toLowerCase()}`] = candidate.message || "Campo invalido.";
  });

  return output;
};

const extractStatusFieldError = (error: unknown) => {
  if (!(error instanceof ApiError) || error.status !== 400) {
    return "";
  }

  const payload = error.payload;

  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;
  const candidates: Array<{ path?: string; message?: string }> = [];

  const collectCandidate = (value: unknown) => {
    if (!value || typeof value !== "object") {
      return;
    }

    const item = value as Record<string, unknown>;
    candidates.push({
      path:
        typeof item.path === "string"
          ? item.path
          : typeof item.field === "string"
            ? item.field
            : undefined,
      message:
        typeof item.message === "string"
          ? item.message
          : typeof item.msg === "string"
            ? item.msg
            : undefined,
    });
  };

  if (Array.isArray(record.errors)) {
    record.errors.forEach(collectCandidate);
  }

  if (Array.isArray(record.details)) {
    record.details.forEach(collectCandidate);
  }

  const statusError = candidates.find(
    (candidate) => typeof candidate.path === "string" && /(^|\.)status$/i.test(candidate.path),
  );

  return statusError?.message || "";
};

const mapBudgetItemFromApi = (item: ApiBudgetMaterial): BudgetItemRow => ({
  productId: item.productId || undefined,
  productName: item.productName,
  quantity: Number(item.quantity) || 0,
  unit: item.unit || "unidade",
  unitPrice: Number(item.unitPrice) || 0,
  subtotal: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
});

const mapBudgetExpenseDepartmentFromApi = (
  department: ApiBudgetExpenseDepartment,
): BudgetExpenseDepartmentRow => ({
  expenseDepartmentId: department.expenseDepartmentId || undefined,
  name: department.name,
  sector: department.sector,
  amount: Math.max(0, Number(department.amount) || 0),
});

const mapBudgetApplicableCostFromApi = (
  cost: ApiBudgetApplicableCost,
): BudgetApplicableCostRow => ({
  applicableCostId: cost.applicableCostId || undefined,
  name: cost.name,
  amount: Math.max(0, Number(cost.amount) || 0),
});

const createEmptyMaterialInput = (mode: MaterialInputMode = "existing") => ({
  mode,
  productId: "",
  productName: "",
  quantity: 1,
  unit: "unidade",
  unitPrice: 0,
});

const createEmptyExpenseDepartment = (): BudgetExpenseDepartmentRow => ({
  expenseDepartmentId: undefined,
  name: "",
  sector: "",
  amount: 0,
});

const createEmptyApplicableCost = (): BudgetApplicableCostRow => ({
  applicableCostId: undefined,
  name: "",
  amount: 0,
});

const formatExpenseDepartmentSuggestion = (department: ExpenseDepartmentCatalogItem) =>
  `${department.name} - ${department.sector} (${formatCurrency(department.defaultAmount)})`;

const getStockBadge = (stockQuantity: number) => {
  if (stockQuantity <= 0) {
    return {
      label: "Precisa comprar",
      className: "bg-destructive/20 text-destructive",
    };
  }

  return {
    label: "Em estoque",
    className: "bg-success/20 text-success",
  };
};

const mapBudgetFromApi = (budget: ApiBudget, clientsCatalog: Client[] = []): BudgetRow => {
  const items = budget.materials.map(mapBudgetItemFromApi);
  const expenseDepartments = budget.expenseDepartments.map(mapBudgetExpenseDepartmentFromApi);
  const applicableCosts = (budget.applicableCosts || []).map(mapBudgetApplicableCostFromApi);
  const materialCost = items.reduce((sum, item) => sum + item.subtotal, 0);
  const applicableCostsFromList = applicableCosts.reduce((sum, cost) => sum + cost.amount, 0);
  const costsApplicableValueFromApi = Number(
    budget.financialSummary?.costsApplicableValue ?? budget.costsApplicableValue,
  );
  const hasCostsApplicableValueFromApi = Number.isFinite(costsApplicableValueFromApi);
  const costsApplicableValue = hasCostsApplicableValueFromApi
    ? Math.max(0, costsApplicableValueFromApi)
    : Number.isFinite(Number(budget.financialSummary?.applicableCostsCost))
      ? Math.max(0, Number(budget.financialSummary?.applicableCostsCost))
      : applicableCostsFromList;
  const expenseDepartmentsCost = Number.isFinite(Number(budget.financialSummary?.expenseDepartmentsCost))
    ? Math.max(0, Number(budget.financialSummary?.expenseDepartmentsCost))
    : expenseDepartments.reduce((sum, department) => sum + department.amount, 0);
  const applicableCostsCost = costsApplicableValue;
  const apiTotalCost = Number(budget.totalCost);
  const apiLaborCost = Number(budget.laborCost);
  const finalPrice = Number(budget.totalPrice) || 0;
  const laborCost = Number.isFinite(apiLaborCost)
    ? Math.max(0, apiLaborCost)
    : Math.max(
        0,
        Number.isFinite(apiTotalCost)
          ? apiTotalCost - materialCost - expenseDepartmentsCost - applicableCostsCost
          : 0,
      );
  const totalCost = Number.isFinite(apiTotalCost)
    ? Math.max(0, apiTotalCost)
    : materialCost + laborCost + expenseDepartmentsCost + applicableCostsCost;
  const profitMargin = totalCost > 0 ? Math.max(0, (finalPrice - totalCost) / totalCost) : 0;

  const linkedClient = findClientByName(clientsCatalog, budget.clientName);
  const costsAppliedAt =
    budget.financialSummary?.costsAppliedAt ?? budget.costsAppliedAt ?? null;
  const costsAppliedValue = Math.max(
    0,
    Number(
      budget.financialSummary?.costsAppliedValue ?? budget.costsAppliedValue ?? 0,
    ) || 0,
  );
  const remainingCostToApply = Math.max(
    0,
    Number(budget.financialSummary?.remainingCostToApply ?? 0) || 0,
  );

  return {
    id: budget.id,
    clientId: linkedClient?.id || "",
    clientName: budget.clientName,
    category: budget.category,
    description: budget.description,
    status: budget.status,
    estimatedDeliveryBusinessDays:
      Number.isFinite(Number(budget.estimatedDeliveryBusinessDays))
        ? Math.max(0, Math.trunc(Number(budget.estimatedDeliveryBusinessDays)))
        : null,
    deliveryDate: normalizeDateOnly(budget.deliveryDate),
    notes: budget.notes,
    approvedAt: budget.approvedAt,
    costsApplicableValue,
    costsAppliedAt,
    costsAppliedValue,
    remainingCostToApply,
    createdAt: normalizeDateOnly(budget.createdAt),
    updatedAt: normalizeDateOnly(budget.updatedAt),
    items,
    expenseDepartments,
    applicableCosts,
    materialCost,
    expenseDepartmentsCost,
    applicableCostsCost,
    laborCost,
    totalCost,
    profitMargin,
    finalPrice,
  };
};

interface ContractFormState {
  contratanteName: string;
  operationName: string;
  projectAddress: string;
  kioskWidthMeters: number;
  kioskDepthMeters: number;
  contractValue: number;
  signatureCity: string;
  signatureDate: string;
  clauses: ContractClause[];
}

interface ContractClause {
  id: string;
  title: string;
  content: string;
}

const DEFAULT_CONTRACT_CLAUSES: Array<Pick<ContractClause, "title" | "content">> = [
  {
    title: "CLÁUSULA 1 — DO OBJETO",
    content: [
      "O objeto deste contrato consiste na execução dos seguintes serviços:",
      "• Projeto de Arquitetura",
      "• Projeto Executivo",
      "• Projeto Elétrico",
      "• Projeto Hidrossanitário",
      "• ARTs de todos os projetos e da execução",
      "• Estrutura metálica em metalon 100x100 galvanizado, conforme projeto a ser apresentado",
      "• Piso cimentício",
      "• Acabamento de piso em porcelanato 30x30",
      "• Telhas modelo sanduíche, com pintura interna a definir conforme projeto",
      "• Iluminação completa conforme projeto",
      "• Acabamento interno em pintura, conforme projeto a ser aprovado",
      "• Pintura da estrutura metálica",
      "• Parede de fundo do quiosque (parte externa) em ACM, com revestimento em adesivo",
      "• Parede de fundo do quiosque (parte interna) em ACM, com desenvolvimento de armários suspensos",
      "• Passarela externa em lona marrom",
      "• Fechamentos laterais e frontais em ACM, conforme projeto a ser aprovado",
      "• Contorno frontal e caixa em granito",
      "• Fechamentos laterais e frontais com pintura na cor Azul Tiffany",
      "• Elétrica completa: iluminação, tomadas, interruptores e quadro elétrico, conforme projeto a ser aprovado pelo Mall",
      "• Comunicação visual completa, conforme orientação e aprovação da marca",
      "",
      "Não incluso:",
      "• Equipamentos eletroeletrônicos",
      "• Equipamentos próprios da operação do cliente",
    ].join("\n"),
  },
  {
    title: "CLÁUSULA 2 — DO VALOR",
    content: [
      "A CONTRATANTE pagará à CONTRATADA o valor unitário de {{valor_contrato}}.",
      "O pagamento deverá ser efetuado da seguinte forma:",
      "(a) 50% (cinquenta por cento) na aprovação do projeto e início da produção;",
      "(b) 50% (cinquenta por cento) dois dias antes da entrega e instalação do quiosque no endereço da obra.",
    ].join("\n"),
  },
  {
    title: "CLÁUSULA 4 — DA GARANTIA",
    content:
      "A contratada oferece 90 (noventa) dias de garantia contra defeitos de fabricação ou instalação, não cobrindo danos decorrentes de mau uso, acidentes, intervenções de terceiros ou eventos naturais.",
  },
  {
    title: "CLÁUSULA 5 — DAS ALTERAÇÕES",
    content:
      "Qualquer alteração após o início da produção poderá gerar custos adicionais e prorrogação de prazo. Alterações somente serão feitas mediante autorização expressa.",
  },
  {
    title: "CLÁUSULA 6 — DA RESCISÃO",
    content:
      "A contratante poderá rescindir antes do início da produção, mediante multa de 20% do valor total. Após a aprovação do projeto e início da produção, não haverá reembolso dos valores pagos.",
  },
];

const createClauseId = () => `clause-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createDefaultContractClauses = (): ContractClause[] =>
  DEFAULT_CONTRACT_CLAUSES.map((clause) => ({
    id: createClauseId(),
    title: clause.title,
    content: clause.content,
  }));

const getTodayInputDate = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const formatLongDate = (inputDate: string) => {
  const date = new Date(`${inputDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return inputDate;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

const replaceContractPlaceholders = (value: string, contractValue: number) =>
  value.replace(/\{\{\s*valor_contrato\s*\}\}/gi, formatCurrency(contractValue));

const createInitialBudgetForm = () => ({
  clientId: "",
  category: "arquitetonico" as BudgetCategory,
  status: "draft" as BudgetStatus,
  description: "",
  estimatedDeliveryBusinessDays: "",
  notes: "",
  laborCost: 0,
  costsApplicableValue: 0,
  profitMargin: 0.35,
  items: [] as BudgetItemRow[],
  expenseDepartments: [] as BudgetExpenseDepartmentRow[],
  applicableCosts: [] as BudgetApplicableCostRow[],
});

const createInitialDetailForm = () => ({
  clientName: "",
  category: "arquitetonico" as BudgetCategory,
  description: "",
  estimatedDeliveryBusinessDays: "",
  notes: "",
  status: "draft" as BudgetStatus,
  totalPrice: 0,
  costsApplicableValue: 0,
  items: [] as BudgetItemRow[],
  expenseDepartments: [] as BudgetExpenseDepartmentRow[],
  applicableCosts: [] as BudgetApplicableCostRow[],
});

const BudgetsPage = () => {
  const [data, setData] = useState<BudgetRow[]>([]);
  const [modal, setModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [requestError, setRequestError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [statusFieldError, setStatusFieldError] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [preApprovingId, setPreApprovingId] = useState<string | null>(null);
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [selectedBudgetForContract, setSelectedBudgetForContract] = useState<BudgetRow | null>(null);
  const [isGeneratingContract, setIsGeneratingContract] = useState(false);
  const [contractFormError, setContractFormError] = useState("");
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<BudgetRow | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isUpdatingDetail, setIsUpdatingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailStatusFieldError, setDetailStatusFieldError] = useState("");
  const [productsCatalog, setProductsCatalog] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [expenseDepartmentsCatalog, setExpenseDepartmentsCatalog] = useState<ExpenseDepartmentCatalogItem[]>([]);
  const [isLoadingExpenseDepartmentsCatalog, setIsLoadingExpenseDepartmentsCatalog] = useState(false);
  const [expenseDepartmentsCatalogError, setExpenseDepartmentsCatalogError] = useState("");
  const [expenseDepartmentsSearch, setExpenseDepartmentsSearch] = useState("");
  const [detailExpenseDepartmentsSearch, setDetailExpenseDepartmentsSearch] = useState("");
  const [expenseDepartmentsFieldErrors, setExpenseDepartmentsFieldErrors] = useState<Record<string, string>>({});
  const [detailExpenseDepartmentsFieldErrors, setDetailExpenseDepartmentsFieldErrors] = useState<Record<string, string>>({});
  const [applicableCostsFieldErrors, setApplicableCostsFieldErrors] = useState<Record<string, string>>({});
  const [detailApplicableCostsFieldErrors, setDetailApplicableCostsFieldErrors] = useState<Record<string, string>>({});
  const [selectedToPreApprove, setSelectedToPreApprove] = useState<BudgetRow | null>(null);
  const [selectedToApprove, setSelectedToApprove] = useState<BudgetRow | null>(null);
  const [approvalError, setApprovalError] = useState("");
  const [approvalDetails, setApprovalDetails] = useState<ApproveBudgetStockDetail[]>([]);
  const [clientsCatalog, setClientsCatalog] = useState<Client[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [clientsError, setClientsError] = useState("");
  const [detailForm, setDetailForm] = useState(createInitialDetailForm());
  const [form, setForm] = useState(createInitialBudgetForm);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    scope: "create" | "detail";
    previousStatus: BudgetStatus;
  } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<"all" | BudgetCategory>("all");
  const [newItem, setNewItem] = useState(createEmptyMaterialInput);
  const [detailNewItem, setDetailNewItem] = useState(createEmptyMaterialInput);
  const [contractForm, setContractForm] = useState<ContractFormState>({
    contratanteName: "",
    operationName: "",
    projectAddress: "",
    kioskWidthMeters: 3,
    kioskDepthMeters: 4,
    contractValue: 0,
    signatureCity: "São Paulo",
    signatureDate: getTodayInputDate(),
    clauses: createDefaultContractClauses(),
  });

  const loadBudgetsFromApi = async (
    availableClients: Client[] = clientsCatalog,
    activeCategoryFilter: "all" | BudgetCategory = categoryFilter,
  ) => {
    setIsLoading(true);
    setRequestError("");

    try {
      const budgets = await listBudgets(activeCategoryFilter === "all" ? undefined : activeCategoryFilter);
      setData(budgets.map((budget) => mapBudgetFromApi(budget, availableClients)));
    } catch (error) {
      setData([]);
      setRequestError(normalizeBudgetError(error, "Não foi possível carregar os orçamentos."));
    } finally {
      setIsLoading(false);
    }
  };

  const loadClientsForForms = async () => {
    setIsLoadingClients(true);
    setClientsError("");

    try {
      const clients = await listClients();
      setClientsCatalog(clients);
      return clients;
    } catch (error) {
      setClientsCatalog([]);
      setClientsError(normalizeBudgetError(error, "Nao foi possivel carregar clientes para o formulario."));
      return [] as Client[];
    } finally {
      setIsLoadingClients(false);
    }
  };

  useEffect(() => {
    void loadClientsForForms();
    void loadBudgetsFromApi();
  }, []);

  useEffect(() => {
    void loadBudgetsFromApi(clientsCatalog, categoryFilter);
  }, [categoryFilter]);

  useEffect(() => {
    if (clientsCatalog.length === 0) {
      return;
    }

    setData((current) =>
      current.map((budget) => {
        if (budget.clientId) {
          return budget;
        }

        const linkedClient = findClientByName(clientsCatalog, budget.clientName);

        if (!linkedClient) {
          return budget;
        }

        return {
          ...budget,
          clientId: linkedClient.id,
        };
      }),
    );
  }, [clientsCatalog]);

  const loadProductsForForm = async () => {
    setIsLoadingProducts(true);
    setProductsError("");

    try {
      const products = await listProducts();
      setProductsCatalog(products);
    } catch (error) {
      setProductsCatalog([]);
      setProductsError(normalizeBudgetError(error, "Nao foi possivel carregar produtos para o formulario."));
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const loadExpenseDepartmentsCatalog = async (search = "") => {
    setIsLoadingExpenseDepartmentsCatalog(true);
    setExpenseDepartmentsCatalogError("");

    try {
      const departments = await listExpenseDepartments(search);
      setExpenseDepartmentsCatalog(departments);
    } catch (error) {
      setExpenseDepartmentsCatalog([]);
      setExpenseDepartmentsCatalogError(
        normalizeBudgetError(error, "Nao foi possivel carregar departamentos de gasto."),
      );
    } finally {
      setIsLoadingExpenseDepartmentsCatalog(false);
    }
  };

  const openCreateModal = () => {
    setModal(true);
    setFormError("");
    setStatusFieldError("");
    setExpenseDepartmentsFieldErrors({});
    setApplicableCostsFieldErrors({});
    setExpenseDepartmentsSearch("");
    void loadClientsForForms();
    void loadProductsForForm();
    void loadExpenseDepartmentsCatalog();
  };

  useEffect(() => {
    if (!modal) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadExpenseDepartmentsCatalog(expenseDepartmentsSearch);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [expenseDepartmentsSearch, modal]);

  useEffect(() => {
    if (!detailModalOpen) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadExpenseDepartmentsCatalog(detailExpenseDepartmentsSearch);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [detailExpenseDepartmentsSearch, detailModalOpen]);

  const requestStatusChange = (scope: "create" | "detail", nextStatus: BudgetStatus) => {
    if (nextStatus !== "pre_approved") {
      if (scope === "create") {
        setForm((current) => ({ ...current, status: nextStatus }));
        setStatusFieldError("");
      } else {
        setDetailForm((current) => ({ ...current, status: nextStatus }));
        setDetailStatusFieldError("");
      }
      return;
    }

    const previousStatus = scope === "create" ? form.status : detailForm.status;

    if (previousStatus === "pre_approved") {
      return;
    }

    setPendingStatusChange({
      scope,
      previousStatus,
    });
  };

  const cancelPreApprovedStatusChange = () => {
    if (pendingStatusChange?.scope === "create") {
      setForm((current) => ({ ...current, status: pendingStatusChange.previousStatus }));
    }

    if (pendingStatusChange?.scope === "detail") {
      setDetailForm((current) => ({ ...current, status: pendingStatusChange.previousStatus }));
    }

    setPendingStatusChange(null);
  };

  const confirmPreApprovedStatusChange = () => {
    if (!pendingStatusChange) {
      return;
    }

    if (pendingStatusChange.scope === "create") {
      setForm((current) => ({ ...current, status: "pre_approved" }));
      setStatusFieldError("");
    } else {
      setDetailForm((current) => ({ ...current, status: "pre_approved" }));
      setDetailStatusFieldError("");
    }

    setPendingStatusChange(null);
  };

  const clearApprovalFeedback = () => {
    setApprovalError("");
    setApprovalDetails([]);
  };

  const openPreApproveModal = (budget: BudgetRow) => {
    if (preApprovingId || budget.status === "pre_approved" || budget.status === "approved") {
      return;
    }

    setRequestError("");
    const shouldUseDetailCostsApplicableValue =
      detailModalOpen && selectedBudget?.id === budget.id;

    if (shouldUseDetailCostsApplicableValue) {
      setSelectedToPreApprove({
        ...budget,
        costsApplicableValue: Math.max(0, Number(detailForm.costsApplicableValue) || 0),
      });
      return;
    }

    setSelectedToPreApprove(budget);
  };

  const closePreApproveModal = () => {
    if (preApprovingId) {
      return;
    }

    setSelectedToPreApprove(null);
  };

  const confirmPreApproveBudget = async () => {
    if (!selectedToPreApprove || preApprovingId) {
      return;
    }

    const budgetId = selectedToPreApprove.id;
    setPreApprovingId(budgetId);
    setRequestError("");

    try {
      const preApprovePayload: {
        status: BudgetStatus;
        costsApplicableValue?: number;
      } = { status: "pre_approved" };

      const shouldUseDetailCostsApplicableValue =
        detailModalOpen && selectedBudget?.id === budgetId;

      if (shouldUseDetailCostsApplicableValue) {
        preApprovePayload.costsApplicableValue = Math.max(0, Number(detailForm.costsApplicableValue) || 0);
      } else {
        preApprovePayload.costsApplicableValue = Math.max(
          0,
          Number(selectedToPreApprove.costsApplicableValue) || 0,
        );
      }

      const updated = mapBudgetFromApi(
        await updateBudget(budgetId, preApprovePayload),
        clientsCatalog,
      );

      setData((current) => current.map((item) => (item.id === updated.id ? updated : item)));

      setSelectedBudget((current) => {
        if (!current || current.id !== updated.id) {
          return current;
        }

        return updated;
      });

      setDetailForm((current) => {
        if (!selectedBudget || selectedBudget.id !== updated.id) {
          return current;
        }

        return {
          ...current,
          status: updated.status,
          costsApplicableValue: updated.costsApplicableValue,
        };
      });

      closePreApproveModal();
      await loadBudgetsFromApi();
    } catch (error) {
      setRequestError(normalizeBudgetError(error, "Nao foi possivel pre-aprovar o orçamento."));
    } finally {
      setPreApprovingId(null);
    }
  };

  const openApproveModal = (budget: BudgetRow) => {
    if (approvingId || budget.status !== "pre_approved") {
      return;
    }

    clearApprovalFeedback();
    setSelectedToApprove(budget);
  };

  const closeApproveModal = (force = false) => {
    if (!force && approvingId) {
      return;
    }

    setSelectedToApprove(null);
    clearApprovalFeedback();
  };

  const addItem = () => {
    const quantity = Number(newItem.quantity);
    const unitPrice = Number(newItem.unitPrice);
    const unit = newItem.unit.trim() || "unidade";
    const isExistingMode = newItem.mode === "existing";

    const product = isExistingMode ? productsCatalog.find((p) => p.id === newItem.productId) : undefined;
    const productName = isExistingMode ? product?.name || "" : newItem.productName.trim();

    if (!productName) {
      setFormError(
        isExistingMode
          ? "Selecione um produto valido."
          : "Informe o nome do material novo.",
      );
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setFormError("Informe uma quantidade valida para o material.");
      return;
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setFormError("Informe um valor unitario valido para o material.");
      return;
    }

    const item: BudgetItemRow = {
      productId: product?.id,
      productName,
      quantity,
      unit,
      unitPrice,
      subtotal: unitPrice * quantity,
    };

    setForm((current) => ({ ...current, items: [...current.items, item] }));
    setFormError("");
    setNewItem(createEmptyMaterialInput(newItem.mode));
  };

  const addDetailItem = () => {
    if (!selectedBudget) {
      return;
    }

    const quantity = Number(detailNewItem.quantity);
    const unitPrice = Number(detailNewItem.unitPrice);
    const unit = detailNewItem.unit.trim() || "unidade";
    const isExistingMode = detailNewItem.mode === "existing";

    const product = isExistingMode
      ? productsCatalog.find((p) => p.id === detailNewItem.productId)
      : undefined;
    const productName = isExistingMode ? product?.name || "" : detailNewItem.productName.trim();

    if (!productName) {
      setDetailError(
        isExistingMode
          ? "Selecione um produto valido."
          : "Informe o nome do material novo.",
      );
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setDetailError("Informe uma quantidade valida para o material.");
      return;
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setDetailError("Informe um valor unitario valido para o material.");
      return;
    }

    const item: BudgetItemRow = {
      productId: product?.id,
      productName,
      quantity,
      unit,
      unitPrice,
      subtotal: unitPrice * quantity,
    };

    const nextItems = [...selectedBudget.items, item];

    setSelectedBudget((current) =>
      current
        ? {
            ...current,
            items: nextItems,
          }
        : current,
    );
    setDetailForm((current) => ({ ...current, items: nextItems }));
    setDetailError("");
    setDetailNewItem(createEmptyMaterialInput(detailNewItem.mode));
  };

  const removeItem = (idx: number) => {
    setForm((current) => ({ ...current, items: current.items.filter((_, i) => i !== idx) }));
  };

  const addExpenseDepartment = () => {
    setForm((current) => ({
      ...current,
      expenseDepartments: [...current.expenseDepartments, createEmptyExpenseDepartment()],
    }));
  };

  const addDetailExpenseDepartment = () => {
    if (!selectedBudget) {
      return;
    }

    const nextDepartments = [...selectedBudget.expenseDepartments, createEmptyExpenseDepartment()];

    setSelectedBudget((current) =>
      current
        ? {
            ...current,
            expenseDepartments: nextDepartments,
          }
        : current,
    );
    setDetailForm((current) => ({ ...current, expenseDepartments: nextDepartments }));
  };

  const addApplicableCost = () => {
    setForm((current) => ({
      ...current,
      applicableCosts: [...current.applicableCosts, createEmptyApplicableCost()],
    }));
  };

  const addDetailApplicableCost = () => {
    if (!selectedBudget) {
      return;
    }

    const nextApplicableCosts = [...selectedBudget.applicableCosts, createEmptyApplicableCost()];

    setSelectedBudget((current) =>
      current
        ? {
            ...current,
            applicableCosts: nextApplicableCosts,
          }
        : current,
    );
    setDetailForm((current) => ({ ...current, applicableCosts: nextApplicableCosts }));
  };

  const removeExpenseDepartment = (index: number) => {
    setForm((current) => ({
      ...current,
      expenseDepartments: current.expenseDepartments.filter((_, departmentIndex) => departmentIndex !== index),
    }));
    setExpenseDepartmentsFieldErrors((current) => {
      const nextEntries = Object.entries(current).filter(
        ([key]) => !key.startsWith(`${index}-`),
      );
      return Object.fromEntries(nextEntries);
    });
  };

  const removeDetailExpenseDepartment = (index: number) => {
    setSelectedBudget((current) => {
      if (!current) {
        return current;
      }

      const nextDepartments = current.expenseDepartments.filter(
        (_, departmentIndex) => departmentIndex !== index,
      );

      setDetailForm((detailCurrent) => ({ ...detailCurrent, expenseDepartments: nextDepartments }));

      return {
        ...current,
        expenseDepartments: nextDepartments,
      };
    });

    setDetailExpenseDepartmentsFieldErrors((current) => {
      const nextEntries = Object.entries(current).filter(
        ([key]) => !key.startsWith(`${index}-`),
      );
      return Object.fromEntries(nextEntries);
    });
  };

  const removeApplicableCost = (index: number) => {
    setForm((current) => ({
      ...current,
      applicableCosts: current.applicableCosts.filter((_, costIndex) => costIndex !== index),
    }));

    setApplicableCostsFieldErrors((current) => {
      const nextEntries = Object.entries(current).filter(
        ([key]) => !key.startsWith(`${index}-`),
      );
      return Object.fromEntries(nextEntries);
    });
  };

  const removeDetailApplicableCost = (index: number) => {
    setSelectedBudget((current) => {
      if (!current) {
        return current;
      }

      const nextApplicableCosts = current.applicableCosts.filter(
        (_, costIndex) => costIndex !== index,
      );

      setDetailForm((detailCurrent) => ({ ...detailCurrent, applicableCosts: nextApplicableCosts }));

      return {
        ...current,
        applicableCosts: nextApplicableCosts,
      };
    });

    setDetailApplicableCostsFieldErrors((current) => {
      const nextEntries = Object.entries(current).filter(
        ([key]) => !key.startsWith(`${index}-`),
      );
      return Object.fromEntries(nextEntries);
    });
  };

  const updateExpenseDepartmentField = (
    index: number,
    field: keyof BudgetExpenseDepartmentRow,
    value: string | number,
  ) => {
    setForm((current) => ({
      ...current,
      expenseDepartments: current.expenseDepartments.map((department, departmentIndex) => {
        if (departmentIndex !== index) {
          return department;
        }

        if (field === "amount") {
          return {
            ...department,
            amount: Math.max(0, Number(value) || 0),
          };
        }

        if (field === "expenseDepartmentId") {
          return {
            ...department,
            expenseDepartmentId: typeof value === "string" && value ? value : undefined,
          };
        }

        return {
          ...department,
          [field]: typeof value === "string" ? value : String(value),
        };
      }),
    }));

    setExpenseDepartmentsFieldErrors((current) => {
      if (!current[`${index}-${field}`]) {
        return current;
      }

      const next = { ...current };
      delete next[`${index}-${field}`];
      return next;
    });
  };

  const updateDetailExpenseDepartmentField = (
    index: number,
    field: keyof BudgetExpenseDepartmentRow,
    value: string | number,
  ) => {
    if (!selectedBudget) {
      return;
    }

    const nextDepartments = selectedBudget.expenseDepartments.map((department, departmentIndex) => {
      if (departmentIndex !== index) {
        return department;
      }

      if (field === "amount") {
        return {
          ...department,
          amount: Math.max(0, Number(value) || 0),
        };
      }

      if (field === "expenseDepartmentId") {
        return {
          ...department,
          expenseDepartmentId: typeof value === "string" && value ? value : undefined,
        };
      }

      return {
        ...department,
        [field]: typeof value === "string" ? value : String(value),
      };
    });

    setSelectedBudget((current) =>
      current
        ? {
            ...current,
            expenseDepartments: nextDepartments,
          }
        : current,
    );
    setDetailForm((current) => ({ ...current, expenseDepartments: nextDepartments }));

    setDetailExpenseDepartmentsFieldErrors((current) => {
      if (!current[`${index}-${field}`]) {
        return current;
      }

      const next = { ...current };
      delete next[`${index}-${field}`];
      return next;
    });
  };

  const updateApplicableCostField = (
    index: number,
    field: keyof BudgetApplicableCostRow,
    value: string | number,
  ) => {
    setForm((current) => ({
      ...current,
      applicableCosts: current.applicableCosts.map((cost, costIndex) => {
        if (costIndex !== index) {
          return cost;
        }

        if (field === "amount") {
          return {
            ...cost,
            amount: Math.max(0, Number(value) || 0),
          };
        }

        if (field === "applicableCostId") {
          return {
            ...cost,
            applicableCostId: typeof value === "string" && value ? value : undefined,
          };
        }

        return {
          ...cost,
          [field]: typeof value === "string" ? value : String(value),
        };
      }),
    }));

    setApplicableCostsFieldErrors((current) => {
      if (!current[`${index}-${field}`]) {
        return current;
      }

      const next = { ...current };
      delete next[`${index}-${field}`];
      return next;
    });
  };

  const updateDetailApplicableCostField = (
    index: number,
    field: keyof BudgetApplicableCostRow,
    value: string | number,
  ) => {
    if (!selectedBudget) {
      return;
    }

    const nextApplicableCosts = selectedBudget.applicableCosts.map((cost, costIndex) => {
      if (costIndex !== index) {
        return cost;
      }

      if (field === "amount") {
        return {
          ...cost,
          amount: Math.max(0, Number(value) || 0),
        };
      }

      if (field === "applicableCostId") {
        return {
          ...cost,
          applicableCostId: typeof value === "string" && value ? value : undefined,
        };
      }

      return {
        ...cost,
        [field]: typeof value === "string" ? value : String(value),
      };
    });

    setSelectedBudget((current) =>
      current
        ? {
            ...current,
            applicableCosts: nextApplicableCosts,
          }
        : current,
    );
    setDetailForm((current) => ({ ...current, applicableCosts: nextApplicableCosts }));

    setDetailApplicableCostsFieldErrors((current) => {
      if (!current[`${index}-${field}`]) {
        return current;
      }

      const next = { ...current };
      delete next[`${index}-${field}`];
      return next;
    });
  };

  const applyCatalogToExpenseDepartment = (index: number, catalogId: string) => {
    const selectedCatalog = expenseDepartmentsCatalog.find((department) => department.id === catalogId);

    if (!selectedCatalog) {
      return;
    }

    setForm((current) => ({
      ...current,
      expenseDepartments: current.expenseDepartments.map((department, departmentIndex) =>
        departmentIndex === index
          ? {
              expenseDepartmentId: selectedCatalog.id,
              name: selectedCatalog.name,
              sector: selectedCatalog.sector,
              amount: selectedCatalog.defaultAmount,
            }
          : department,
      ),
    }));
  };

  const applyCatalogToDetailExpenseDepartment = (index: number, catalogId: string) => {
    const selectedCatalog = expenseDepartmentsCatalog.find((department) => department.id === catalogId);

    if (!selectedCatalog || !selectedBudget) {
      return;
    }

    const nextDepartments = selectedBudget.expenseDepartments.map((department, departmentIndex) =>
      departmentIndex === index
        ? {
            expenseDepartmentId: selectedCatalog.id,
            name: selectedCatalog.name,
            sector: selectedCatalog.sector,
            amount: selectedCatalog.defaultAmount,
          }
        : department,
    );

    setSelectedBudget((current) =>
      current
        ? {
            ...current,
            expenseDepartments: nextDepartments,
          }
        : current,
    );
    setDetailForm((current) => ({ ...current, expenseDepartments: nextDepartments }));
  };

  const validateExpenseDepartments = (departments: BudgetExpenseDepartmentRow[]) => {
    const errors: Record<string, string> = {};

    departments.forEach((department, index) => {
      if (!department.name.trim()) {
        errors[`${index}-name`] = "Nome obrigatorio.";
      }

      if (!department.sector.trim()) {
        errors[`${index}-sector`] = "Setor obrigatorio.";
      }

      if (!Number.isFinite(department.amount) || department.amount < 0) {
        errors[`${index}-amount`] = "Valor deve ser maior ou igual a zero.";
      }
    });

    return errors;
  };

  const validateApplicableCosts = (costs: BudgetApplicableCostRow[]) => {
    const errors: Record<string, string> = {};

    costs.forEach((cost, index) => {
      if (!cost.name.trim()) {
        errors[`${index}-name`] = "Nome obrigatorio.";
      }

      if (!Number.isFinite(cost.amount) || cost.amount < 0) {
        errors[`${index}-amount`] = "Valor deve ser maior ou igual a zero.";
      }
    });

    return errors;
  };

  const calc = calculateBudget(
    form.items.map((item) => ({
      ...item,
      productId: item.productId || "new-material",
    })),
    form.laborCost,
    form.profitMargin,
  );

  const expenseDepartmentsCost = form.expenseDepartments.reduce(
    (sum, department) => sum + (Number(department.amount) || 0),
    0,
  );
  const applicableCostsListCost = form.applicableCosts.reduce(
    (sum, cost) => sum + (Number(cost.amount) || 0),
    0,
  );

  const costsApplicableValue = Math.max(0, Number(form.costsApplicableValue) || 0);

  const totalCostWithExpenses = calc.materialCost + form.laborCost + expenseDepartmentsCost + costsApplicableValue;
  const finalPriceWithExpenses = totalCostWithExpenses * (1 + form.profitMargin);

  const detailMaterialCost = (selectedBudget?.items || []).reduce(
    (sum, item) => sum + (Number(item.subtotal) || 0),
    0,
  );

  const detailExpenseDepartmentsCost = detailForm.expenseDepartments.reduce(
    (sum, department) => sum + (Number(department.amount) || 0),
    0,
  );
  const detailApplicableCostsCost = Math.max(0, Number(detailForm.costsApplicableValue) || 0);

  const detailLaborCost = Math.max(0, Number(selectedBudget?.laborCost) || 0);
  const detailProfitMargin = Math.max(0, Number(selectedBudget?.profitMargin) || 0);
  const detailTotalCostWithExpenses =
    detailMaterialCost + detailLaborCost + detailExpenseDepartmentsCost + detailApplicableCostsCost;
  const detailFinalPriceWithExpenses = detailTotalCostWithExpenses * (1 + detailProfitMargin);

  const closeCreateModal = () => {
    setModal(false);
    setFormError("");
    setStatusFieldError("");
    setForm(createInitialBudgetForm());
    setProductsError("");
    setExpenseDepartmentsCatalogError("");
    setExpenseDepartmentsSearch("");
    setExpenseDepartmentsFieldErrors({});
    setApplicableCostsFieldErrors({});
    setNewItem(createEmptyMaterialInput());
    setPendingStatusChange((current) => (current?.scope === "create" ? null : current));
  };

  const saveBudget = async () => {
    const client = clientsCatalog.find((item) => item.id === form.clientId);

    if (!client) {
      setFormError("Selecione um cliente válido.");
      return;
    }

    if (!form.description.trim()) {
      setFormError("Informe a descrição do orçamento.");
      return;
    }

    if (!form.category) {
      setFormError("Selecione a categoria do orcamento.");
      return;
    }

    if (!form.status) {
      setStatusFieldError("Selecione um status para o orçamento.");
      setFormError("Selecione um status valido.");
      return;
    }

    const parsedBusinessDays = parseBusinessDaysInput(form.estimatedDeliveryBusinessDays);

    if (Number.isNaN(parsedBusinessDays)) {
      setFormError("Informe um prazo previsto valido em dias uteis (numero inteiro maior que zero).");
      return;
    }

    const normalizedFormCostsApplicableValue = Number(form.costsApplicableValue ?? 0);
    if (!Number.isFinite(normalizedFormCostsApplicableValue) || normalizedFormCostsApplicableValue < 0) {
      setFormError("Informe um custo aplicavel valido (maior ou igual a zero).");
      return;
    }

    if (form.items.length === 0) {
      setFormError("Adicione ao menos um material no orçamento.");
      return;
    }

    const departmentErrors = validateExpenseDepartments(form.expenseDepartments);
    const applicableCostsErrors = validateApplicableCosts(form.applicableCosts);

    if (Object.keys(departmentErrors).length > 0) {
      setExpenseDepartmentsFieldErrors(departmentErrors);
      setFormError("Revise os campos obrigatorios em departamentos de gasto.");
      return;
    }

    if (Object.keys(applicableCostsErrors).length > 0) {
      setApplicableCostsFieldErrors(applicableCostsErrors);
      setFormError("Revise os campos obrigatorios em custos aplicaveis.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    setStatusFieldError("");
    setExpenseDepartmentsFieldErrors({});
    setApplicableCostsFieldErrors({});

    try {
      const created = await createBudget({
        clientName: client.name,
        category: form.category,
        description: form.description.trim(),
        deliveryDate: null,
        estimatedDeliveryBusinessDays: parsedBusinessDays,
        totalPrice: finalPriceWithExpenses,
        costsApplicableValue,
        notes: form.notes.trim() ? form.notes.trim() : null,
        status: form.status,
        materials: form.items.map((item) => {
          const payloadItem = {
            productName: item.productName,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
          };

          if (item.productId) {
            return {
              ...payloadItem,
              productId: item.productId,
            };
          }

          return payloadItem;
        }),
        expenseDepartments: form.expenseDepartments.map((department) => ({
          expenseDepartmentId: department.expenseDepartmentId,
          name: department.name.trim(),
          sector: department.sector.trim(),
          amount: Math.max(0, Number(department.amount) || 0),
        })),
        applicableCosts: form.applicableCosts.map((cost) => ({
          applicableCostId: cost.applicableCostId,
          name: cost.name.trim(),
          amount: Math.max(0, Number(cost.amount) || 0),
        })),
      });

      setData((current) => [mapBudgetFromApi(created, clientsCatalog), ...current]);
      await Promise.all([loadBudgetsFromApi(), loadProductsForForm()]);
      closeCreateModal();
    } catch (error) {
      const apiFieldErrors = extractExpenseDepartmentsFieldErrors(error);
      const apiApplicableCostsErrors = extractApplicableCostsFieldErrors(error);
      const apiStatusError = extractStatusFieldError(error);

      if (Object.keys(apiFieldErrors).length > 0) {
        setExpenseDepartmentsFieldErrors(apiFieldErrors);
      }

      if (Object.keys(apiApplicableCostsErrors).length > 0) {
        setApplicableCostsFieldErrors(apiApplicableCostsErrors);
      }

      if (apiStatusError) {
        setStatusFieldError(apiStatusError);
      }

      setFormError(normalizeBudgetError(error, "Não foi possível criar o orçamento."));
    } finally {
      setIsSaving(false);
    }
  };

  const openBudgetDetail = async (budgetId: string) => {
    setDetailModalOpen(true);
    setDetailError("");
    setDetailStatusFieldError("");
    setIsLoadingDetail(true);

    try {
      const budget = mapBudgetFromApi(await getBudgetById(budgetId), clientsCatalog);
      setSelectedBudget(budget);
      setDetailForm({
        clientName: budget.clientName,
        category: budget.category,
        description: budget.description,
        estimatedDeliveryBusinessDays:
          budget.estimatedDeliveryBusinessDays !== null && budget.estimatedDeliveryBusinessDays !== undefined
            ? String(budget.estimatedDeliveryBusinessDays)
            : "",
        notes: budget.notes || "",
        status: budget.status,
        totalPrice: budget.finalPrice,
        costsApplicableValue: Math.max(0, Number(budget.costsApplicableValue) || 0),
        items: budget.items,
        expenseDepartments: budget.expenseDepartments,
        applicableCosts: budget.applicableCosts,
      });
      void loadProductsForForm();
      void loadExpenseDepartmentsCatalog();
    } catch (error) {
      setSelectedBudget(null);
      setDetailError(normalizeBudgetError(error, "Não foi possível carregar os detalhes do orçamento."));
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const closeDetailModal = () => {
    setDetailModalOpen(false);
    setSelectedBudget(null);
    setDetailError("");
    setDetailStatusFieldError("");
    setDetailForm(createInitialDetailForm());
    setDetailNewItem(createEmptyMaterialInput());
    setDetailExpenseDepartmentsSearch("");
    setDetailExpenseDepartmentsFieldErrors({});
    setDetailApplicableCostsFieldErrors({});
    setPendingStatusChange((current) => (current?.scope === "detail" ? null : current));
  };

  const saveBudgetDetail = async () => {
    if (!selectedBudget) {
      return;
    }

    if (!detailForm.clientName.trim() || !detailForm.description.trim()) {
      setDetailError("Cliente e descricao sao obrigatorios.");
      return;
    }

    if (!detailForm.category) {
      setDetailError("Selecione a categoria do orcamento.");
      return;
    }

    if (!detailForm.status) {
      setDetailStatusFieldError("Selecione um status para o orçamento.");
      setDetailError("Selecione um status valido.");
      return;
    }

    const parsedDetailBusinessDays = parseBusinessDaysInput(detailForm.estimatedDeliveryBusinessDays);

    if (Number.isNaN(parsedDetailBusinessDays)) {
      setDetailError("Informe um prazo previsto valido em dias uteis (numero inteiro maior que zero).");
      return;
    }

    const normalizedDetailCostsApplicableValue = Number(detailForm.costsApplicableValue ?? 0);
    if (!Number.isFinite(normalizedDetailCostsApplicableValue) || normalizedDetailCostsApplicableValue < 0) {
      setDetailError("Informe um custo aplicavel valido (maior ou igual a zero).");
      return;
    }

    const departmentErrors = validateExpenseDepartments(detailForm.expenseDepartments);
    const applicableCostsErrors = validateApplicableCosts(detailForm.applicableCosts);

    if (Object.keys(departmentErrors).length > 0) {
      setDetailExpenseDepartmentsFieldErrors(departmentErrors);
      setDetailError("Revise os campos obrigatorios em departamentos de gasto.");
      return;
    }

    if (Object.keys(applicableCostsErrors).length > 0) {
      setDetailApplicableCostsFieldErrors(applicableCostsErrors);
      setDetailError("Revise os campos obrigatorios em custos aplicaveis.");
      return;
    }

    setIsUpdatingDetail(true);
    setDetailError("");
    setDetailStatusFieldError("");
    setDetailExpenseDepartmentsFieldErrors({});
    setDetailApplicableCostsFieldErrors({});

    try {
      const updated = mapBudgetFromApi(
        await updateBudget(selectedBudget.id, {
          clientName: detailForm.clientName.trim(),
          category: detailForm.category,
          description: detailForm.description.trim(),
          deliveryDate: null,
          estimatedDeliveryBusinessDays: parsedDetailBusinessDays,
          notes: detailForm.notes.trim() ? detailForm.notes.trim() : null,
          status: detailForm.status,
          totalPrice: detailFinalPriceWithExpenses,
          costsApplicableValue: Math.max(0, Number(detailForm.costsApplicableValue) || 0),
          materials: selectedBudget.items.map((item) => {
            const payloadItem = {
              productName: item.productName,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
            };

            if (item.productId) {
              return {
                ...payloadItem,
                productId: item.productId,
              };
            }

            return payloadItem;
          }),
          expenseDepartments: detailForm.expenseDepartments.map((department) => ({
            expenseDepartmentId: department.expenseDepartmentId,
            name: department.name.trim(),
            sector: department.sector.trim(),
            amount: Math.max(0, Number(department.amount) || 0),
          })),
          applicableCosts: detailForm.applicableCosts.map((cost) => ({
            applicableCostId: cost.applicableCostId,
            name: cost.name.trim(),
            amount: Math.max(0, Number(cost.amount) || 0),
          })),
        }),
        clientsCatalog,
      );

      setData((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      await Promise.all([loadBudgetsFromApi(), loadProductsForForm()]);
      closeDetailModal();
    } catch (error) {
      const apiFieldErrors = extractExpenseDepartmentsFieldErrors(error);
      const apiApplicableCostsErrors = extractApplicableCostsFieldErrors(error);
      const apiStatusError = extractStatusFieldError(error);

      if (Object.keys(apiFieldErrors).length > 0) {
        setDetailExpenseDepartmentsFieldErrors(apiFieldErrors);
      }

      if (Object.keys(apiApplicableCostsErrors).length > 0) {
        setDetailApplicableCostsFieldErrors(apiApplicableCostsErrors);
      }

      if (apiStatusError) {
        setDetailStatusFieldError(apiStatusError);
      }

      setDetailError(normalizeBudgetError(error, "Não foi possível atualizar o orçamento."));
    } finally {
      setIsUpdatingDetail(false);
    }
  };

  const confirmApproveBudget = async () => {
    if (!selectedToApprove || approvingId) {
      return;
    }

    const budgetId = selectedToApprove.id;

    setApprovingId(budgetId);
    setRequestError("");
    clearApprovalFeedback();

    try {
      const approved = mapBudgetFromApi(await approveBudget(budgetId), clientsCatalog);
      setData((current) => current.map((item) => (item.id === approved.id ? approved : item)));
      closeApproveModal(true);

      dispatchInventoryDataChanged({
        source: "budget-approve",
        referenceId: budgetId,
      });

      await loadBudgetsFromApi();
    } catch (error) {
      if (error instanceof ApproveBudgetError) {
        setApprovalError(error.message);
        setApprovalDetails(error.details);
        return;
      }

      setApprovalError(normalizeBudgetError(error, "Não foi possível aprovar o orçamento."));
    } finally {
      setApprovingId(null);
    }
  };

  const addClause = () => {
    setContractForm((current) => {
      const nextNumber = current.clauses.length + 1;

      return {
        ...current,
        clauses: [
          ...current.clauses,
          {
            id: createClauseId(),
            title: `CLÁUSULA ${nextNumber} — NOVA CLÁUSULA`,
            content: "",
          },
        ],
      };
    });
  };

  const updateClause = (clauseId: string, patch: Partial<ContractClause>) => {
    setContractForm((current) => ({
      ...current,
      clauses: current.clauses.map((clause) =>
        clause.id === clauseId ? { ...clause, ...patch } : clause,
      ),
    }));
  };

  const removeClause = (clauseId: string) => {
    setContractForm((current) => {
      if (current.clauses.length <= 1) {
        return current;
      }

      return {
        ...current,
        clauses: current.clauses.filter((clause) => clause.id !== clauseId),
      };
    });
  };

  const closeContractModal = () => {
    setContractModalOpen(false);
    setSelectedBudgetForContract(null);
    setContractFormError("");
  };

  const openContractModal = (budget: BudgetRow) => {
    const linkedClient =
      clientsCatalog.find((client) => client.id === budget.clientId) ||
      findClientByName(clientsCatalog, budget.clientName);

    setSelectedBudgetForContract(budget);
    setContractFormError("");
    setContractForm({
      contratanteName: linkedClient?.name || budget.clientName || "",
      operationName: budget.clientName || linkedClient?.name || "",
      projectAddress: buildClientAddress(linkedClient),
      kioskWidthMeters: 3,
      kioskDepthMeters: 4,
      contractValue: Number(budget.finalPrice.toFixed(2)),
      signatureCity: "São Paulo",
      signatureDate: getTodayInputDate(),
      clauses: createDefaultContractClauses(),
    });
    setContractModalOpen(true);
  };

  const generateBudgetPdf = async (budget: BudgetRow) => {
    setGeneratingPdfId(budget.id);

    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const contentWidth = 154;
      const marginX = (pageWidth - contentWidth) / 2;
      const bottomLimit = pageHeight - 16;

      let y = 12;
      const logoDataUrl = await loadLogoDataUrl();
      if (logoDataUrl) {
        pdf.addImage(logoDataUrl, "PNG", marginX, y, 30, 30);
      }

      const headerX = logoDataUrl ? marginX + 36 : marginX;
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(15);
      pdf.text("Mais Quiosque Galpao Producao", headerX, y + 8);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.8);
      pdf.text("Rua Professor Athanassof, 28 Cid.Patriarca", headerX, y + 15);
      pdf.text("CEP 03552-110 Sao Paulo - SP", headerX, y + 20);

      y += 36;

      const issueDate = normalizeDateOnly(budget.createdAt) || "-";
      const proposalTitle = `Proposta comercial: ${budget.clientName}`;
      const proposalSubtitle = "Desenvolvimento, construcao e montagem de loja conforme projeto enviado previamente.";

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9.5);
      pdf.text(proposalTitle, marginX, y);

      y += 4.5;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      const subtitleLines = pdf.splitTextToSize(proposalSubtitle, contentWidth);
      pdf.text(subtitleLines, marginX, y);
      y += subtitleLines.length * 3.8 + 3;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text(`Data de emissao: ${issueDate}`, marginX, y);
      y += 5;

      const ensureSpace = (neededHeight: number) => {
        if (y + neededHeight <= bottomLimit) {
          return;
        }

        pdf.addPage();
        y = 14;
      };

      const writeSectionTitle = (title: string) => {
        ensureSpace(8);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9.5);
        pdf.text(title, marginX + 4, y);
        y += 4.5;
      };

      const writeBulletLine = (line: ProposalSectionLine) => {
        const bulletX = marginX + 4 + line.indentLevel * 4;
        const textX = bulletX + 3;
        const wrapped = pdf.splitTextToSize(line.text, contentWidth - (textX - marginX) - 2) as string[];
        const blockHeight = Math.max(4.2, wrapped.length * 3.8 + 0.8);
        ensureSpace(blockHeight + 0.8);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.3);
        pdf.text("•", bulletX, y);
        pdf.text(wrapped, textX, y);
        y += blockHeight;
      };

      const architectureLines = parseProposalSectionLines(budget.description, DEFAULT_ARCHITECTURE_LINES);
      const alvenariaLines = parseProposalSectionLines(budget.notes, DEFAULT_ALVENARIA_LINES);

      writeSectionTitle("Arquitetura:");
      architectureLines.forEach(writeBulletLine);

      y += 2;
      writeSectionTitle("Alvenaria:");
      alvenariaLines.forEach(writeBulletLine);

      y += 4;
      ensureSpace(40);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.8);
      pdf.text(`Valor unitario: ${formatCurrency(budget.finalPrice)}`, marginX, y);

      y += 5;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      const deliveryLeadTime =
        budget.estimatedDeliveryBusinessDays && budget.estimatedDeliveryBusinessDays > 0
          ? `${budget.estimatedDeliveryBusinessDays} dias uteis apos confirmacao do orcamento`
          : "60 dias";
      const paymentLines = pdf.splitTextToSize(
        `Pagamento: 50% fechamento e assinatura de contrato 50% restante a serem pagos 30 dias apos inicio da obra. Prazo previsto para entrega: ${deliveryLeadTime}. Proposta valida por 5 dias.`,
        contentWidth,
      ) as string[];
      pdf.text(paymentLines, marginX, y);
      y += paymentLines.length * 3.8 + 2.5;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.7);
      const disclaimer = pdf.splitTextToSize(
        "Este e um orcamento previo, podem haver mudancas de valores caso no ato do projeto seja aprovado itens nao inclusos neste orcamento.",
        contentWidth,
      ) as string[];
      pdf.text(disclaimer, marginX, y);
      y += disclaimer.length * 3.6 + 4;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.text("Atenciosamente,", marginX, y);
      y += 4;
      pdf.text("Claudinei Cosso", marginX, y);
      y += 4;
      pdf.text("Executivo Comercial", marginX, y);
      y += 4;
      pdf.text("+55 11 98327 0902", marginX, y);
      y += 4;
      pdf.text("Escritorio: Av Cochoeiro Paulista, 17 Cidade Patriarca Cep 03551-000 Sao Paulo - SP", marginX, y);

      const safeClientName = sanitizeFileName(budget.clientName) || "cliente";
      pdf.save(`orcamento-${budget.id}-${safeClientName}.pdf`);
    } catch {
      window.alert("Não foi possível gerar o PDF deste orçamento. Tente novamente.");
    } finally {
      setGeneratingPdfId(null);
    }
  };

  const generateContractPdf = async () => {
    if (!selectedBudgetForContract) {
      return;
    }

    if (!contractForm.contratanteName.trim()) {
      setContractFormError("Informe o nome da contratante.");
      return;
    }

    if (!contractForm.operationName.trim()) {
      setContractFormError("Informe o nome da operação/cliente final.");
      return;
    }

    if (contractForm.contractValue <= 0) {
      setContractFormError("Informe um valor válido para o contrato.");
      return;
    }

    if (contractForm.kioskWidthMeters <= 0 || contractForm.kioskDepthMeters <= 0) {
      setContractFormError("Informe dimensões válidas para o quiosque.");
      return;
    }

    if (!contractForm.signatureDate) {
      setContractFormError("Informe a data de assinatura.");
      return;
    }

    if (contractForm.clauses.length === 0) {
      setContractFormError("Adicione ao menos uma cláusula para gerar o contrato.");
      return;
    }

    const invalidClause = contractForm.clauses.find(
      (clause) => !clause.title.trim() || !clause.content.trim(),
    );

    if (invalidClause) {
      setContractFormError("Todas as cláusulas devem ter nome e conteúdo.");
      return;
    }

    setIsGeneratingContract(true);
    setContractFormError("");

    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const contentWidth = 162;
      const marginX = (pageWidth - contentWidth) / 2;
      const bottomLimit = pageHeight - 18;
      const lineHeight = 4.3;

      let y = 14;

      const ensureSpace = (requiredHeight: number) => {
        if (y + requiredHeight <= bottomLimit) {
          return;
        }

        pdf.addPage();
        y = 16;
      };

      const writeLine = (text: string, opts: { bold?: boolean; size?: number; indent?: number } = {}) => {
        const { bold = false, size = 10, indent = 0 } = opts;
        const x = marginX + indent;
        const wrapped = pdf.splitTextToSize(text, contentWidth - indent) as string[];
        ensureSpace(wrapped.length * lineHeight + 1);
        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(size);
        pdf.text(wrapped, x, y);
        y += wrapped.length * lineHeight;
      };

      const addGap = (value = 2) => {
        y += value;
      };

      const separator = () => {
        ensureSpace(4);
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.8);
        pdf.line(marginX, y, marginX + contentWidth, y);
        y += 5;
      };

      const logoDataUrl = await loadLogoDataUrl();
      const logoMaxW = 34;
      const logoMaxH = 24;
      let logoW = logoMaxW;
      let logoH = logoMaxH;

      if (logoDataUrl) {
        try {
          const logoProps = pdf.getImageProperties(logoDataUrl);
          const ratio = logoProps.width / logoProps.height;

          logoW = logoMaxW;
          logoH = logoW / ratio;

          if (logoH > logoMaxH) {
            logoH = logoMaxH;
            logoW = logoH * ratio;
          }
        } catch {
          logoW = logoMaxW;
          logoH = logoMaxH;
        }

        pdf.addImage(logoDataUrl, "PNG", marginX, y, logoW, logoH);
      }

      const titleX = marginX + logoW + 8;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10.8);
      pdf.text("CONTRATO DE PRESTACAO DE SERVICOS", titleX, y + 8);
      pdf.text("DE MONTAGEM DE QUIOSQUE COMERCIAL", titleX, y + 14);

      y += logoH + 6;
      separator();

      writeLine(`CONTRATANTE: ${contractForm.contratanteName}, inscrita no CPF/CNPJ sob n.o ____________, residente na cidade de ____________, doravante denominada simplesmente CONTRATANTE.`, { bold: true });
      addGap(2);
      separator();

      writeLine("CONTRATADA: GIRA KIDS COMERCIO DE DOCES, BRINQUEDOS E JOGOS ELETRONICOS LTDA, pessoa juridica de direito privado, inscrita no CNPJ sob o n.o 07.313.928/0001-75, com sede na Avenida Cachoeira Paulista, 17 - Cidade Patriarca - Cep: 03551-000, doravante denominada simplesmente CONTRATADA.", { bold: true });
      addGap(2);
      separator();

      writeLine("Considerando que:", { bold: true });
      addGap(1);
      writeLine("a) A CONTRATANTE deseja contratar os servicos da CONTRATADA para desenvolvimento, construcao e montagem de loja, conforme especificacoes deste instrumento.", { indent: 1 });
      addGap(1);
      writeLine("b) A CONTRATADA declara possuir expertise e capacidade tecnica para a execucao dos servicos ora contratados.", { indent: 1 });
      addGap(2);

      writeLine("As partes acima identificadas tem entre si justo e acordado o presente Contrato de Construcao e Montagem de Loja, mediante as seguintes clausulas e condicoes:");
      addGap(2);

      contractForm.clauses.forEach((clause, index) => {
        const clauseTitle = clause.title.trim() || `Clausula ${index + 1}`;
        writeLine(clauseTitle, { bold: true, size: 11 });
        addGap(1);

        const processedContent = replaceContractPlaceholders(clause.content, contractForm.contractValue);
        const contentLines = processedContent.split(/\r?\n/);

        contentLines.forEach((rawLine) => {
          const line = rawLine.trim();

          if (!line) {
            addGap(1);
            return;
          }

          if (/^[-*•]/.test(line)) {
            writeLine(`• ${line.replace(/^[-*•]\s*/, "")}`, { indent: 3.5 });
            return;
          }

          writeLine(line, { indent: 1.2 });
        });

        addGap(2);
      });

      if (contractForm.projectAddress.trim()) {
        writeLine(`Endereco da obra: ${contractForm.projectAddress.trim()}`, { bold: true });
        addGap(2);
      }

      writeLine(
        `${contractForm.signatureCity}, ${formatLongDate(contractForm.signatureDate)}.`,
        { size: 10.5 },
      );
      addGap(9);

      ensureSpace(24);
      const signatureLineWidth = 72;
      const leftSignatureX = marginX;
      const rightSignatureX = marginX + contentWidth - signatureLineWidth;

      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.35);
      pdf.line(leftSignatureX, y, leftSignatureX + signatureLineWidth, y);
      pdf.line(rightSignatureX, y, rightSignatureX + signatureLineWidth, y);

      y += 5;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.2);
      pdf.text(contractForm.contratanteName, leftSignatureX, y);
      pdf.text("CONTRATANTE", leftSignatureX, y + 4.2);

      pdf.text("GIRA KIDS COMERCIO DE DOCES", rightSignatureX, y);
      pdf.text("CONTRATADA", rightSignatureX, y + 4.2);

      const safeClientName = sanitizeFileName(contractForm.operationName || selectedBudgetForContract.clientName) || "cliente";
      pdf.save(`contrato-${selectedBudgetForContract.id}-${safeClientName}.pdf`);
      closeContractModal();
    } catch {
      setContractFormError("Não foi possível gerar o contrato em PDF. Tente novamente.");
    } finally {
      setIsGeneratingContract(false);
    }
  };

  const detailClientOptions = clientsCatalog.map((client) => ({
    value: client.name,
    label: client.companyName ? `${client.name} • ${client.companyName}` : client.name,
  }));

  const resolveItemStockStatus = (item: BudgetItemRow) => {
    const matchingProduct = item.productId
      ? productsCatalog.find((product) => product.id === item.productId)
      : productsCatalog.find((product) => normalizeName(product.name) === normalizeName(item.productName));

    const stockQuantity = matchingProduct?.stockQuantity ?? 0;
    return getStockBadge(stockQuantity);
  };

  const removeDetailItem = (idx: number) => {
    setSelectedBudget((current) => {
      if (!current) {
        return current;
      }

      const nextItems = current.items.filter((_, itemIndex) => itemIndex !== idx);
      setDetailForm((detailCurrent) => ({ ...detailCurrent, items: nextItems }));

      return {
        ...current,
        items: nextItems,
      };
    });
  };

  if (detailForm.clientName && !detailClientOptions.some((option) => option.value === detailForm.clientName)) {
    detailClientOptions.unshift({
      value: detailForm.clientName,
      label: `${detailForm.clientName} (não cadastrado)`,
    });
  }

  const columns = [
    { key: "createdAt", header: "Data", mono: true },
    { key: "clientName", header: "Cliente" },
    {
      key: "category",
      header: "Categoria",
      render: (b: BudgetRow) => (
        <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-secondary text-secondary-foreground">
          {formatCategory(b.category)}
        </span>
      ),
    },
    { key: "description", header: "Descrição" },
    {
      key: "costsAppliedValue",
      header: "Custos aplicados",
      render: (b: BudgetRow) => formatCurrency(b.costsAppliedValue),
    },
    {
      key: "remainingCostToApply",
      header: "Custo restante",
      render: (b: BudgetRow) => formatCurrency(b.remainingCostToApply),
    },
    { key: "finalPrice", header: "Preço Final", mono: true, render: (b: BudgetRow) => `R$ ${b.finalPrice.toFixed(2)}` },
    {
      key: "estimatedDeliveryBusinessDays",
      header: "Prazo previsto",
      mono: true,
      render: (b: BudgetRow) =>
        b.estimatedDeliveryBusinessDays !== null
          ? formatBusinessDaysLabel(b.estimatedDeliveryBusinessDays)
          : b.deliveryDate
            ? b.deliveryDate
            : "-",
    },
    { key: "status", header: "Status", render: (b: BudgetRow) => <StatusBadge status={b.status} /> },
    {
      key: "actions", header: "",
      render: (b: BudgetRow) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              void openBudgetDetail(b.id);
            }}
            className="px-2 py-1 text-[11px] font-bold rounded border border-border text-foreground hover:bg-secondary transition-colors"
          >
            DETALHE
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              void generateBudgetPdf(b);
            }}
            disabled={generatingPdfId === b.id}
            className="px-2 py-1 text-[11px] font-bold rounded border border-primary/30 text-primary hover:bg-primary/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {generatingPdfId === b.id ? "GERANDO..." : "PDF"}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              openContractModal(b);
            }}
            className="px-2 py-1 text-[11px] font-bold rounded border border-border text-foreground hover:bg-secondary transition-colors"
          >
            CONTRATO
          </button>

          {(b.status === "draft" || b.status === "pending") && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                openPreApproveModal(b);
              }}
              disabled={Boolean(preApprovingId) || Boolean(approvingId)}
              className="px-2 py-1 text-[11px] font-bold rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {preApprovingId === b.id ? "APLICANDO..." : "PRÉ-APROVAR"}
            </button>
          )}

          {b.status === "pre_approved" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                openApproveModal(b);
              }}
              disabled={Boolean(approvingId)}
              className="px-2 py-1 text-[11px] font-bold rounded bg-success/20 text-success hover:bg-success/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {approvingId === b.id ? "APROVANDO..." : "APROVAR OFICIALMENTE"}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout
      title="Orçamentos"
      action={
        <button onClick={openCreateModal} className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> NOVO ORÇAMENTO
        </button>
      }
    >
      <div className="animate-fade-in space-y-4">
        <div className="w-full md:w-80">
          <FormField
            label="Filtrar por categoria"
            as="select"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as "all" | BudgetCategory)}
            options={[
              { value: "all", label: "Todas as categorias" },
              { value: "arquitetonico", label: formatCategory("arquitetonico") },
              { value: "executivo", label: formatCategory("executivo") },
            ]}
          />
        </div>

        {requestError && (
          <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
            <span>{requestError}</span>
            <button
              onClick={() => void loadBudgetsFromApi(clientsCatalog, categoryFilter)}
              className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
            >
              TENTAR NOVAMENTE
            </button>
          </div>
        )}

        <DataTable
          columns={columns}
          data={data}
          onRowClick={(row) => {
            void openBudgetDetail(row.id);
          }}
          emptyMessage={isLoading ? "Carregando orçamentos..." : "Nenhum orçamento encontrado."}
        />
      </div>

      <Modal open={modal} onClose={closeCreateModal} title="Novo Orçamento" width="max-w-5xl">
        <div className="flex max-h-[72dvh] flex-col">
          <div className="space-y-6 overflow-y-auto pr-1">
          {clientsError && (
            <div className="mb-3 border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
              <span>{clientsError}</span>
              <button
                onClick={() => void loadClientsForForms()}
                className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
              >
                TENTAR NOVAMENTE
              </button>
            </div>
          )}

          <FormField
            label="Cliente"
            as="select"
            value={form.clientId}
            onChange={e => setForm({ ...form, clientId: e.target.value })}
            options={clientsCatalog.map((client) => ({
              value: client.id,
              label: client.companyName ? `${client.name} • ${client.companyName}` : client.name,
            }))}
          />

          <FormField
            label="Categoria do orcamento"
            as="select"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as BudgetCategory })}
            options={[
              { value: "arquitetonico", label: formatCategory("arquitetonico") },
              { value: "executivo", label: formatCategory("executivo") },
            ]}
          />

          <FormField
            label="Status"
            as="select"
            value={form.status}
            onChange={(e) => requestStatusChange("create", e.target.value as BudgetStatus)}
            error={statusFieldError}
            options={[
              { value: "draft", label: "Rascunho" },
              { value: "pre_approved", label: "Pre-aprovado (aplica somente custos aplicaveis)" },
              { value: "approved", label: "Aprovado (oficial, aplica custos restantes)" },
              { value: "pending", label: "Pendente (administrativo)" },
              { value: "rejected", label: "Rejeitado (administrativo)" },
            ]}
          />

          {!isLoadingClients && clientsCatalog.length === 0 && (
            <p className="text-xs text-destructive">Nenhum cliente cadastrado no banco para selecionar.</p>
          )}

          <FormField
            label="Descrição"
            as="textarea"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={PROPOSAL_DESCRIPTION_PLACEHOLDER}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Prazo previsto (dias uteis apos confirmacao)"
              type="number"
              min={1}
              step="1"
              value={form.estimatedDeliveryBusinessDays}
              onChange={(e) => setForm({ ...form, estimatedDeliveryBusinessDays: e.target.value })}
              placeholder="Ex.: 30"
            />
            <FormField
              label="Observações"
              as="textarea"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={PROPOSAL_NOTES_PLACEHOLDER}
            />
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-3">Itens</p>

            {productsError && (
              <div className="mb-3 border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
                <span>{productsError}</span>
                <button
                  onClick={() => void loadProductsForForm()}
                  className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
                >
                  TENTAR NOVAMENTE
                </button>
              </div>
            )}

            {form.items.length > 0 && (
              <div className="border border-border rounded mb-3 divide-y divide-border/50">
                {form.items.map((item, i) => (
                  <div key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span>{item.productName} × {item.quantity} {item.unit}</span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${resolveItemStockStatus(item).className}`}
                      >
                        {resolveItemStockStatus(item).label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs">R$ {item.subtotal.toFixed(2)}</span>
                      <button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setNewItem((current) => ({ ...createEmptyMaterialInput("existing"), mode: "existing" }))}
                className={`px-3 py-1 text-[11px] font-bold rounded border transition-colors ${
                  newItem.mode === "existing"
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                Selecionar produto existente
              </button>
              <button
                type="button"
                onClick={() => setNewItem((current) => ({ ...createEmptyMaterialInput("new"), mode: "new" }))}
                className={`px-3 py-1 text-[11px] font-bold rounded border transition-colors ${
                  newItem.mode === "new"
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                Cadastrar material novo
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="flex-1">
                {newItem.mode === "existing" ? (
                  <FormField
                    label="Produto"
                    as="select"
                    value={newItem.productId}
                    onChange={e => setNewItem({ ...newItem, productId: e.target.value })}
                    options={productsCatalog.map((product) => ({
                      value: product.id,
                      label: `${product.name} (Saldo: ${product.stockQuantity})`,
                    }))}
                  />
                ) : (
                  <FormField
                    label="Novo material"
                    value={newItem.productName}
                    onChange={e => setNewItem({ ...newItem, productName: e.target.value })}
                    placeholder="Ex.: MDF Branco 15mm"
                  />
                )}
              </div>
              <div className="w-full md:w-24">
                <FormField
                  label="Qtd."
                  type="number"
                  min={1}
                  value={newItem.quantity}
                  onChange={e => setNewItem({ ...newItem, quantity: Number(e.target.value) })}
                />
              </div>
              <div className="w-full md:w-28">
                <FormField
                  label="Unid."
                  value={newItem.unit}
                  onChange={e => setNewItem({ ...newItem, unit: e.target.value })}
                />
              </div>
              <div className="w-full md:w-32">
                <FormField
                  label="Vlr Unit."
                  type="number"
                  min={0}
                  step="0.01"
                  value={newItem.unitPrice}
                  onChange={e => setNewItem({ ...newItem, unitPrice: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={addItem}
                  disabled={newItem.mode === "existing" && (isLoadingProducts || productsCatalog.length === 0)}
                  className="px-3 py-2 text-xs font-bold rounded border border-border hover:bg-secondary transition-colors text-foreground disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {newItem.mode === "existing" && isLoadingProducts ? "CARREGANDO..." : "ADICIONAR"}
                </button>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Departamentos de gasto</p>
              <button
                type="button"
                onClick={addExpenseDepartment}
                className="px-3 py-1 text-[11px] font-bold rounded border border-border hover:bg-secondary transition-colors text-foreground"
              >
                Adicionar departamento
              </button>
            </div>

            {expenseDepartmentsCatalogError && (
              <div className="mb-3 border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
                <span>{expenseDepartmentsCatalogError}</span>
                <button
                  onClick={() => void loadExpenseDepartmentsCatalog(expenseDepartmentsSearch)}
                  className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
                >
                  TENTAR NOVAMENTE
                </button>
              </div>
            )}

            <div className="mb-3">
              <FormField
                label="Buscar no catalogo de departamentos"
                value={expenseDepartmentsSearch}
                onChange={(event) => setExpenseDepartmentsSearch(event.target.value)}
                placeholder="Digite nome ou setor"
              />
            </div>

            {form.expenseDepartments.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum departamento adicionado.</p>
            ) : (
              <div className="space-y-3">
                {form.expenseDepartments.map((department, index) => (
                  <div key={`expense-create-${index}`} className="rounded border border-border p-3 space-y-3 bg-secondary/10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <FormField
                        label="Reusar do catalogo (opcional)"
                        as="select"
                        value={department.expenseDepartmentId || ""}
                        onChange={(event) => {
                          const catalogId = event.target.value;
                          updateExpenseDepartmentField(index, "expenseDepartmentId", catalogId);

                          if (catalogId) {
                            applyCatalogToExpenseDepartment(index, catalogId);
                          }
                        }}
                        options={expenseDepartmentsCatalog.map((catalogItem) => ({
                          value: catalogItem.id,
                          label: formatExpenseDepartmentSuggestion(catalogItem),
                        }))}
                      />

                      <FormField
                        label="Valor"
                        type="number"
                        min={0}
                        step="0.01"
                        value={department.amount}
                        onChange={(event) =>
                          updateExpenseDepartmentField(index, "amount", Number(event.target.value))
                        }
                        error={expenseDepartmentsFieldErrors[`${index}-amount`]}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <FormField
                        label="Nome"
                        value={department.name}
                        onChange={(event) => updateExpenseDepartmentField(index, "name", event.target.value)}
                        placeholder="Ex.: Terceirizado eletrica"
                        error={expenseDepartmentsFieldErrors[`${index}-name`]}
                      />

                      <FormField
                        label="Setor"
                        value={department.sector}
                        onChange={(event) => updateExpenseDepartmentField(index, "sector", event.target.value)}
                        placeholder="Ex.: Eletrica"
                        error={expenseDepartmentsFieldErrors[`${index}-sector`]}
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeExpenseDepartment(index)}
                        className="px-3 py-1 text-[11px] font-bold rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40"
                      >
                        Remover departamento
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
              label="Custo aplicavel (R$)"
              type="number"
              min={0}
              step="0.01"
              value={form.costsApplicableValue ?? 0}
              onChange={e => setForm({ ...form, costsApplicableValue: Math.max(0, Number(e.target.value) || 0) })}
            />
            <FormField label="Mão de Obra (R$)" type="number" step="0.01" value={form.laborCost} onChange={e => setForm({ ...form, laborCost: Number(e.target.value) })} />
            <FormField label="Margem de Lucro (%)" type="number" step="1" value={form.profitMargin * 100} onChange={e => setForm({ ...form, profitMargin: Number(e.target.value) / 100 })} />
          </div>

          <div className="border border-border rounded p-4 bg-secondary/20">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Materiais</p>
                <p className="font-mono font-bold text-foreground">R$ {calc.materialCost.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Deptos. gasto</p>
                <p className="font-mono font-bold text-foreground">R$ {expenseDepartmentsCost.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Custos aplic.</p>
                <p className="font-mono font-bold text-foreground">R$ {costsApplicableValue.toFixed(2)}</p>
                {applicableCostsListCost > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">Itens: {formatCurrency(applicableCostsListCost)}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Custo Total</p>
                <p className="font-mono font-bold text-foreground">R$ {totalCostWithExpenses.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Preço Final</p>
                <p className="font-mono font-bold text-primary text-lg">R$ {finalPriceWithExpenses.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <div className="sticky bottom-0 z-10 mt-4 pt-3 border-t border-border bg-card/95 backdrop-blur flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
            <button onClick={closeCreateModal} className="w-full sm:w-auto px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground">Cancelar</button>
            <button
              onClick={() => void saveBudget()}
              disabled={isSaving || isLoadingProducts || isLoadingClients || clientsCatalog.length === 0}
              className="w-full sm:w-auto px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSaving ? "Salvando..." : "Criar Orçamento"}
            </button>
          </div>
        </div>
      </Modal>

      {pendingStatusChange && (
        <Modal
          open={Boolean(pendingStatusChange)}
          onClose={cancelPreApprovedStatusChange}
          title="Aplicar custos aplicaveis agora?"
          width="max-w-lg"
        >
          <div className="space-y-4">
            <p className="text-sm text-foreground/90">
              Ao pre-aprovar, somente os custos aplicaveis deste orcamento serao aplicados como gasto.
            </p>
            <p className="text-xs text-muted-foreground">
              Materiais, departamentos de gasto e mao de obra serao aplicados apenas na aprovacao oficial.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={cancelPreApprovedStatusChange}
                className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={confirmPreApprovedStatusChange}
                className="px-4 py-2 text-sm rounded bg-blue-500 text-white font-medium hover:opacity-90 transition-opacity"
              >
                Confirmar pre-aprovacao
              </button>
            </div>
          </div>
        </Modal>
      )}

      {selectedToPreApprove && (
        <Modal
          open={Boolean(selectedToPreApprove)}
          onClose={closePreApproveModal}
          title="Pre-aprovar e aplicar custos aplicaveis?"
          width="max-w-xl"
        >
          <div className="space-y-4">
            <p className="text-sm text-foreground/90">
              Ao pre-aprovar, somente os custos aplicaveis serao aplicados agora.
            </p>
            <p className="text-xs text-muted-foreground">
              Materiais, departamentos de gasto e mao de obra serao aplicados somente na aprovacao oficial.
            </p>

            <div className="rounded border border-border bg-secondary/20 px-3 py-2 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Cliente:</span> {selectedToPreApprove.clientName}
              </p>
              <p>
                <span className="text-muted-foreground">Descricao:</span> {selectedToPreApprove.description}
              </p>
              <p>
                <span className="text-muted-foreground">Custos aplicaveis (agora):</span> {formatCurrency(selectedToPreApprove.costsApplicableValue)}
              </p>
              <p>
                <span className="text-muted-foreground">Custo restante (apos pre-aprovacao):</span> {formatCurrency(selectedToPreApprove.remainingCostToApply)}
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={closePreApproveModal}
                disabled={preApprovingId === selectedToPreApprove.id}
                className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                onClick={() => void confirmPreApproveBudget()}
                disabled={preApprovingId === selectedToPreApprove.id}
                className="px-4 py-2 text-sm rounded bg-blue-500 text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {preApprovingId === selectedToPreApprove.id ? "Aplicando..." : "Pre-aprovar e aplicar custos aplicaveis"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {selectedToApprove && (
        <Modal
          open={Boolean(selectedToApprove)}
          onClose={() => closeApproveModal()}
          title="Aprovar oficialmente"
          width="max-w-xl"
        >
          <div className="space-y-4">
            <p className="text-sm text-foreground/90">
              Esta acao finaliza o orcamento como aprovado/oficial e aplica os custos restantes (materiais, departamentos de gasto e mao de obra).
            </p>
            <p className="text-xs text-muted-foreground">
              Os custos aplicaveis ja lancados na pre-aprovacao serao mantidos.
            </p>

            <div className="rounded border border-border bg-secondary/20 px-3 py-2 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Cliente:</span> {selectedToApprove.clientName}
              </p>
              <p>
                <span className="text-muted-foreground">Descricao:</span> {selectedToApprove.description}
              </p>
              <p>
                <span className="text-muted-foreground">Itens:</span> {selectedToApprove.items.length}
              </p>
              <p>
                <span className="text-muted-foreground">Custo restante para aplicar:</span> {formatCurrency(selectedToApprove.remainingCostToApply)}
              </p>
            </div>

            {approvalError && (
              <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive space-y-2">
                <p>{approvalError}</p>

                {approvalDetails.length > 0 && (
                  <ul className="list-disc pl-4 space-y-1 text-xs">
                    {approvalDetails.map((detail, index) => (
                      <li key={`${detail.productId}-${index}`}>{formatApproveBudgetDetailMessage(detail)}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => closeApproveModal()}
                disabled={approvingId === selectedToApprove.id}
                className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                onClick={() => void confirmApproveBudget()}
                disabled={approvingId === selectedToApprove.id}
                className="px-4 py-2 text-sm rounded bg-success text-success-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {approvingId === selectedToApprove.id ? "Aprovando..." : "Confirmar aprovacao oficial"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <Modal
        open={detailModalOpen}
        onClose={closeDetailModal}
        title={`Detalhe do Orçamento ${selectedBudget ? `#${selectedBudget.id}` : ""}`}
        width="max-w-2xl"
      >
        {isLoadingDetail ? (
          <p className="text-sm text-muted-foreground">Carregando detalhes...</p>
        ) : (
          <div className="space-y-4">
            {detailError && (
              <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive">
                {detailError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Cliente"
                as="select"
                value={detailForm.clientName}
                onChange={(e) => setDetailForm((current) => ({ ...current, clientName: e.target.value }))}
                options={detailClientOptions}
              />

              <FormField
                label="Categoria do orcamento"
                as="select"
                value={detailForm.category}
                onChange={(e) =>
                  setDetailForm((current) => ({
                    ...current,
                    category: e.target.value as BudgetCategory,
                  }))
                }
                options={[
                  { value: "arquitetonico", label: formatCategory("arquitetonico") },
                  { value: "executivo", label: formatCategory("executivo") },
                ]}
              />
            </div>

            {selectedBudget && (
              <div className="rounded border border-border bg-secondary/20 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Categoria:</span>{" "}
                <span className="font-medium text-foreground">{formatCategory(detailForm.category)}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Status"
                as="select"
                value={detailForm.status}
                onChange={(e) => requestStatusChange("detail", e.target.value as BudgetStatus)}
                error={detailStatusFieldError}
                options={[
                  { value: "draft", label: "Rascunho" },
                  { value: "pre_approved", label: "Pre-aprovado (aplica somente custos aplicaveis)" },
                  { value: "approved", label: "Aprovado (oficial, aplica custos restantes)" },
                  { value: "pending", label: "Pendente" },
                  { value: "rejected", label: "Rejeitado" },
                ]}
              />
            </div>

            {selectedBudget && selectedBudget.costsAppliedAt && (
              <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                Custos aplicaveis ja aplicados em {formatDateTime(selectedBudget.costsAppliedAt)} com base no valor salvo em Custo aplicavel. Alteracoes devem considerar o impacto financeiro ja registrado.
              </div>
            )}

            {selectedBudget && (
              <div className="rounded border border-border bg-secondary/20 p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">
                  Indicadores de custos aplicados
                </p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Custo aplicavel (base)</p>
                    <p className="font-mono font-bold text-foreground">{formatCurrency(selectedBudget.costsApplicableValue)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Custos aplicados</p>
                    <p className="font-mono font-bold text-foreground">{formatCurrency(selectedBudget.costsAppliedValue)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Data da aplicacao</p>
                    <p className="font-medium text-foreground">{formatDateTime(selectedBudget.costsAppliedAt)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Custo restante para aplicar</p>
                    <p className="font-mono font-bold text-foreground">{formatCurrency(selectedBudget.remainingCostToApply)}</p>
                  </div>
                </div>
              </div>
            )}

            <FormField
              label="Descrição"
              as="textarea"
              value={detailForm.description}
              onChange={(e) => setDetailForm((current) => ({ ...current, description: e.target.value }))}
              placeholder={PROPOSAL_DESCRIPTION_PLACEHOLDER}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                label="Prazo previsto (dias uteis apos confirmacao)"
                type="number"
                min={1}
                step="1"
                value={detailForm.estimatedDeliveryBusinessDays}
                onChange={(e) =>
                  setDetailForm((current) => ({
                    ...current,
                    estimatedDeliveryBusinessDays: e.target.value,
                  }))
                }
                placeholder="Ex.: 30"
              />

              <FormField
                label="Custo aplicavel (R$)"
                type="number"
                min={0}
                step="0.01"
                value={detailForm.costsApplicableValue ?? 0}
                onChange={(e) =>
                  setDetailForm((current) => ({
                    ...current,
                    costsApplicableValue: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
              />

              <FormField
                label="Preço Total (R$)"
                type="number"
                min={0}
                step="0.01"
                value={Number(detailFinalPriceWithExpenses.toFixed(2))}
                disabled
              />
            </div>

            {selectedBudget && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-3">Materiais</p>

                {selectedBudget.items.length > 0 && (
                  <div className="border border-border rounded mb-3 divide-y divide-border/50">
                    {selectedBudget.items.map((item, i) => (
                      <div key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span>{item.productName} × {item.quantity} {item.unit}</span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${resolveItemStockStatus(item).className}`}
                          >
                            {resolveItemStockStatus(item).label}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs">R$ {item.subtotal.toFixed(2)}</span>
                          <button
                            onClick={() => removeDetailItem(i)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailNewItem((current) => ({ ...createEmptyMaterialInput("existing"), mode: "existing" }))}
                    className={`px-3 py-1 text-[11px] font-bold rounded border transition-colors ${
                      detailNewItem.mode === "existing"
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    Selecionar produto existente
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailNewItem((current) => ({ ...createEmptyMaterialInput("new"), mode: "new" }))}
                    className={`px-3 py-1 text-[11px] font-bold rounded border transition-colors ${
                      detailNewItem.mode === "new"
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    Cadastrar material novo
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div className="flex-1">
                    {detailNewItem.mode === "existing" ? (
                      <FormField
                        label="Produto"
                        as="select"
                        value={detailNewItem.productId}
                        onChange={e => setDetailNewItem({ ...detailNewItem, productId: e.target.value })}
                        options={productsCatalog.map((product) => ({
                          value: product.id,
                          label: `${product.name} (Saldo: ${product.stockQuantity})`,
                        }))}
                      />
                    ) : (
                      <FormField
                        label="Novo material"
                        value={detailNewItem.productName}
                        onChange={e => setDetailNewItem({ ...detailNewItem, productName: e.target.value })}
                        placeholder="Ex.: MDF Branco 15mm"
                      />
                    )}
                  </div>
                  <div className="w-full md:w-24">
                    <FormField
                      label="Qtd."
                      type="number"
                      min={1}
                      value={detailNewItem.quantity}
                      onChange={e => setDetailNewItem({ ...detailNewItem, quantity: Number(e.target.value) })}
                    />
                  </div>
                  <div className="w-full md:w-28">
                    <FormField
                      label="Unid."
                      value={detailNewItem.unit}
                      onChange={e => setDetailNewItem({ ...detailNewItem, unit: e.target.value })}
                    />
                  </div>
                  <div className="w-full md:w-32">
                    <FormField
                      label="Vlr Unit."
                      type="number"
                      min={0}
                      step="0.01"
                      value={detailNewItem.unitPrice}
                      onChange={e => setDetailNewItem({ ...detailNewItem, unitPrice: Number(e.target.value) })}
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={addDetailItem}
                      disabled={detailNewItem.mode === "existing" && (isLoadingProducts || productsCatalog.length === 0)}
                      className="px-3 py-2 text-xs font-bold rounded border border-border hover:bg-secondary transition-colors text-foreground disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {detailNewItem.mode === "existing" && isLoadingProducts ? "CARREGANDO..." : "ADICIONAR"}
                    </button>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Departamentos de gasto</p>
                    <button
                      type="button"
                      onClick={addDetailExpenseDepartment}
                      className="px-3 py-1 text-[11px] font-bold rounded border border-border hover:bg-secondary transition-colors text-foreground"
                    >
                      Adicionar departamento
                    </button>
                  </div>

                  {expenseDepartmentsCatalogError && (
                    <div className="mb-3 border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
                      <span>{expenseDepartmentsCatalogError}</span>
                      <button
                        onClick={() => void loadExpenseDepartmentsCatalog(detailExpenseDepartmentsSearch)}
                        className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
                      >
                        TENTAR NOVAMENTE
                      </button>
                    </div>
                  )}

                  <div className="mb-3">
                    <FormField
                      label="Buscar no catalogo de departamentos"
                      value={detailExpenseDepartmentsSearch}
                      onChange={(event) => setDetailExpenseDepartmentsSearch(event.target.value)}
                      placeholder="Digite nome ou setor"
                    />
                  </div>

                  {detailForm.expenseDepartments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum departamento adicionado.</p>
                  ) : (
                    <div className="space-y-3">
                      {detailForm.expenseDepartments.map((department, index) => (
                        <div key={`expense-detail-${index}`} className="rounded border border-border p-3 space-y-3 bg-secondary/10">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <FormField
                              label="Reusar do catalogo (opcional)"
                              as="select"
                              value={department.expenseDepartmentId || ""}
                              onChange={(event) => {
                                const catalogId = event.target.value;
                                updateDetailExpenseDepartmentField(index, "expenseDepartmentId", catalogId);

                                if (catalogId) {
                                  applyCatalogToDetailExpenseDepartment(index, catalogId);
                                }
                              }}
                              options={expenseDepartmentsCatalog.map((catalogItem) => ({
                                value: catalogItem.id,
                                label: formatExpenseDepartmentSuggestion(catalogItem),
                              }))}
                            />

                            <FormField
                              label="Valor"
                              type="number"
                              min={0}
                              step="0.01"
                              value={department.amount}
                              onChange={(event) =>
                                updateDetailExpenseDepartmentField(index, "amount", Number(event.target.value))
                              }
                              error={detailExpenseDepartmentsFieldErrors[`${index}-amount`]}
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <FormField
                              label="Nome"
                              value={department.name}
                              onChange={(event) => updateDetailExpenseDepartmentField(index, "name", event.target.value)}
                              placeholder="Ex.: Terceirizado eletrica"
                              error={detailExpenseDepartmentsFieldErrors[`${index}-name`]}
                            />

                            <FormField
                              label="Setor"
                              value={department.sector}
                              onChange={(event) => updateDetailExpenseDepartmentField(index, "sector", event.target.value)}
                              placeholder="Ex.: Eletrica"
                              error={detailExpenseDepartmentsFieldErrors[`${index}-sector`]}
                            />
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => removeDetailExpenseDepartment(index)}
                              className="px-3 py-1 text-[11px] font-bold rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40"
                            >
                              Remover departamento
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-6 border border-border rounded p-4 bg-secondary/20">
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 text-center">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Materiais</p>
                      <p className="font-mono font-bold text-foreground">{formatCurrency(detailMaterialCost)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Deptos. gasto</p>
                      <p className="font-mono font-bold text-foreground">{formatCurrency(detailExpenseDepartmentsCost)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Custos aplic.</p>
                      <p className="font-mono font-bold text-foreground">{formatCurrency(detailApplicableCostsCost)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Custo total</p>
                      <p className="font-mono font-bold text-foreground">{formatCurrency(detailTotalCostWithExpenses)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Preço total</p>
                      <p className="font-mono font-bold text-primary">{formatCurrency(detailFinalPriceWithExpenses)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <FormField
              label="Observações"
              as="textarea"
              value={detailForm.notes}
              onChange={(e) => setDetailForm((current) => ({ ...current, notes: e.target.value }))}
              placeholder={PROPOSAL_NOTES_PLACEHOLDER}
            />

            <div className="flex justify-end gap-3">
              {selectedBudget && (selectedBudget.status === "draft" || selectedBudget.status === "pending") && (
                <button
                  onClick={() => openPreApproveModal(selectedBudget)}
                  disabled={Boolean(preApprovingId) || isUpdatingDetail || isLoadingDetail}
                  className="px-4 py-2 text-sm rounded bg-blue-500 text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {preApprovingId === selectedBudget.id ? "Aplicando custos..." : "Pre-aprovar e aplicar custos aplicaveis"}
                </button>
              )}

              {selectedBudget && selectedBudget.status === "pre_approved" && (
                <button
                  onClick={() => openApproveModal(selectedBudget)}
                  disabled={Boolean(approvingId) || isUpdatingDetail || isLoadingDetail}
                  className="px-4 py-2 text-sm rounded bg-success text-success-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {approvingId === selectedBudget.id ? "Aprovando..." : "Aprovar oficialmente"}
                </button>
              )}

              <button
                onClick={closeDetailModal}
                className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground"
              >
                Fechar
              </button>
              <button
                onClick={() => void saveBudgetDetail()}
                disabled={isUpdatingDetail || isLoadingDetail}
                className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isUpdatingDetail ? "Salvando..." : "Salvar Alterações"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={contractModalOpen}
        onClose={closeContractModal}
        title={`Contrato • ${selectedBudgetForContract?.clientName || "Cliente"}`}
        width="max-w-3xl"
      >
        <div className="space-y-5 max-h-[72vh] overflow-y-auto pr-1">
          <div className="border border-border rounded p-3 bg-secondary/20">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">Informações Fixas da Contratada</p>
            <p className="text-sm text-foreground">MAIS QUIOSQUE GALPÃO PRODUÇÃO</p>
            <p className="text-xs text-muted-foreground">Rua Professor Athanassof, 28 • Cid. Patriarca • São Paulo/SP</p>
            <p className="text-xs text-muted-foreground">CNPJ 07.313.928/0001-75 • +55 11 98327-0902 • maisquiosque@hotmail.com</p>
            <p className="text-xs text-muted-foreground mt-1">Assinatura fixa da contratada: Daniel De Souza (Executivo Comercial).</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Nome da Contratante"
              value={contractForm.contratanteName}
              onChange={(e) => setContractForm((current) => ({ ...current, contratanteName: e.target.value }))}
              placeholder="Ex.: Do Coco ao Cacau LTDA"
            />
            <FormField
              label="Nome da Operação/Cliente"
              value={contractForm.operationName}
              onChange={(e) => setContractForm((current) => ({ ...current, operationName: e.target.value }))}
              placeholder="Ex.: Do Coco ao Cacau"
            />
          </div>

          <FormField
            label="Endereço da Obra"
            value={contractForm.projectAddress}
            onChange={(e) => setContractForm((current) => ({ ...current, projectAddress: e.target.value }))}
            placeholder="Endereço de entrega/instalação"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Largura do Quiosque (m)"
              type="number"
              min={0.1}
              step="0.1"
              value={contractForm.kioskWidthMeters}
              onChange={(e) =>
                setContractForm((current) => ({
                  ...current,
                  kioskWidthMeters: Number(e.target.value),
                }))
              }
            />
            <FormField
              label="Profundidade do Quiosque (m)"
              type="number"
              min={0.1}
              step="0.1"
              value={contractForm.kioskDepthMeters}
              onChange={(e) =>
                setContractForm((current) => ({
                  ...current,
                  kioskDepthMeters: Number(e.target.value),
                }))
              }
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
              label="Valor do Contrato (R$)"
              type="number"
              min={0}
              step="0.01"
              value={contractForm.contractValue}
              onChange={(e) =>
                setContractForm((current) => ({
                  ...current,
                  contractValue: Number(e.target.value),
                }))
              }
            />
            <FormField
              label="Cidade da Assinatura"
              value={contractForm.signatureCity}
              onChange={(e) => setContractForm((current) => ({ ...current, signatureCity: e.target.value }))}
            />
            <FormField
              label="Data da Assinatura"
              type="date"
              value={contractForm.signatureDate}
              onChange={(e) => setContractForm((current) => ({ ...current, signatureDate: e.target.value }))}
            />
          </div>

          <div className="border border-border rounded p-3 bg-secondary/20 space-y-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Cláusulas Editáveis
            </p>

            <p className="text-xs text-muted-foreground -mt-2">
              Dica: use {'{{valor_contrato}}'} no conteúdo para inserir automaticamente o valor do contrato.
            </p>

            <div className="space-y-4">
              {contractForm.clauses.map((clause, index) => (
                <div key={clause.id} className="rounded border border-border bg-background/60 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                      Cláusula {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeClause(clause.id)}
                      disabled={contractForm.clauses.length <= 1}
                      className="px-3 py-1 text-xs rounded border border-border text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Excluir
                    </button>
                  </div>

                  <FormField
                    label="Nome da Cláusula"
                    value={clause.title}
                    onChange={(e) => updateClause(clause.id, { title: e.target.value })}
                  />

                  <FormField
                    as="textarea"
                    rows={6}
                    label="Conteúdo da Cláusula"
                    value={clause.content}
                    onChange={(e) => updateClause(clause.id, { content: e.target.value })}
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={addClause}
                className="px-3 py-1.5 text-xs rounded border border-border text-muted-foreground hover:bg-secondary transition-colors"
              >
                Adicionar Cláusula
              </button>
            </div>
          </div>

          {contractFormError && <p className="text-sm text-destructive">{contractFormError}</p>}

          <div className="flex justify-end gap-3">
            <button
              onClick={closeContractModal}
              className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={() => void generateContractPdf()}
              disabled={isGeneratingContract}
              className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isGeneratingContract ? "Gerando contrato..." : "Gerar Contrato PDF"}
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default BudgetsPage;
