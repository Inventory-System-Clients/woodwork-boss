import { useEffect, useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { FormField } from "@/components/FormField";
import { StatusBadge } from "@/components/StatusBadge";
import { clients, calculateBudget } from "@/data/mockData";
import { ApiError } from "@/services/api";
import { dispatchInventoryDataChanged } from "@/lib/inventory-events";
import {
  ApproveBudgetError,
  ApproveBudgetStockDetail,
  approveBudget,
  createBudget,
  formatApproveBudgetDetailMessage,
  getBudgetById,
  listBudgets,
  updateBudget,
  type Budget as ApiBudget,
  type BudgetMaterial as ApiBudgetMaterial,
  type BudgetStatus,
} from "@/services/budgets";
import { Product, listProducts } from "@/services/products";
import { Plus, Trash2 } from "lucide-react";

const imageDataUrlCache: Record<string, string | null | undefined> = {};

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const formatPercent = (value: number) => `${(value * 100).toFixed(0)}%`;

const formatStatus = (status: BudgetRow["status"]) => {
  switch (status) {
    case "draft":
      return "Rascunho";
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

const loadContractTopBannerDataUrl = async () => loadImageDataUrl("/partecima.png");

const loadContractBottomBannerDataUrl = async () => loadImageDataUrl("/partebaixo_.png");

interface BudgetItemRow {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
}

interface BudgetRow {
  id: string;
  clientId: string;
  clientName: string;
  description: string;
  status: BudgetStatus;
  deliveryDate: string;
  notes: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: BudgetItemRow[];
  materialCost: number;
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

const normalizeBudgetError = (error: unknown, fallback: string) => {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "Acesso negado. Somente admin e gerente podem gerenciar orçamentos.";
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

const mapBudgetItemFromApi = (item: ApiBudgetMaterial): BudgetItemRow => ({
  productId: item.productId || "",
  productName: item.productName,
  quantity: Number(item.quantity) || 0,
  unit: item.unit || "unidade",
  unitPrice: Number(item.unitPrice) || 0,
  subtotal: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
});

const mapBudgetFromApi = (budget: ApiBudget): BudgetRow => {
  const items = budget.materials.map(mapBudgetItemFromApi);
  const materialCost = items.reduce((sum, item) => sum + item.subtotal, 0);
  const totalCost = materialCost;
  const finalPrice = Number(budget.totalPrice) || 0;
  const laborCost = Math.max(0, totalCost - materialCost);
  const profitMargin = totalCost > 0 ? Math.max(0, (finalPrice - totalCost) / totalCost) : 0;

  const linkedClient = clients.find((client) => client.name === budget.clientName);

  return {
    id: budget.id,
    clientId: linkedClient?.id || "",
    clientName: budget.clientName,
    description: budget.description,
    status: budget.status,
    deliveryDate: normalizeDateOnly(budget.deliveryDate),
    notes: budget.notes,
    approvedAt: budget.approvedAt,
    createdAt: normalizeDateOnly(budget.createdAt),
    updatedAt: normalizeDateOnly(budget.updatedAt),
    items,
    materialCost,
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
  description: "",
  deliveryDate: "",
  notes: "",
  laborCost: 0,
  profitMargin: 0.35,
  items: [] as BudgetItemRow[],
});

const createInitialDetailForm = () => ({
  clientName: "",
  description: "",
  deliveryDate: "",
  notes: "",
  status: "draft" as BudgetStatus,
  totalPrice: 0,
});

const BudgetsPage = () => {
  const [data, setData] = useState<BudgetRow[]>([]);
  const [modal, setModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [requestError, setRequestError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);
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
  const [productsCatalog, setProductsCatalog] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [selectedToApprove, setSelectedToApprove] = useState<BudgetRow | null>(null);
  const [approvalError, setApprovalError] = useState("");
  const [approvalDetails, setApprovalDetails] = useState<ApproveBudgetStockDetail[]>([]);
  const [detailForm, setDetailForm] = useState(createInitialDetailForm());
  const [form, setForm] = useState(createInitialBudgetForm);
  const [newItem, setNewItem] = useState({
    productId: "",
    quantity: 1,
    unit: "unidade",
    unitPrice: 0,
  });
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

  const loadBudgetsFromApi = async () => {
    setIsLoading(true);
    setRequestError("");

    try {
      const budgets = await listBudgets();
      setData(budgets.map(mapBudgetFromApi));
    } catch (error) {
      setData([]);
      setRequestError(normalizeBudgetError(error, "Não foi possível carregar os orçamentos."));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadBudgetsFromApi();
  }, []);

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

  const openCreateModal = () => {
    setModal(true);
    setFormError("");
    void loadProductsForForm();
  };

  const clearApprovalFeedback = () => {
    setApprovalError("");
    setApprovalDetails([]);
  };

  const openApproveModal = (budget: BudgetRow) => {
    if (approvingId) {
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
    const product = productsCatalog.find((p) => p.id === newItem.productId);
    const quantity = Number(newItem.quantity);
    const unitPrice = Number(newItem.unitPrice);
    const unit = newItem.unit.trim() || "unidade";

    if (!product) {
      setFormError("Selecione um produto valido.");
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
      productId: product.id,
      productName: product.name,
      quantity,
      unit,
      unitPrice,
      subtotal: unitPrice * quantity,
    };

    setForm((current) => ({ ...current, items: [...current.items, item] }));
    setFormError("");
    setNewItem({ productId: "", quantity: 1, unit: "unidade", unitPrice: 0 });
  };

  const removeItem = (idx: number) => {
    setForm((current) => ({ ...current, items: current.items.filter((_, i) => i !== idx) }));
  };

  const calc = calculateBudget(form.items, form.laborCost, form.profitMargin);

  const closeCreateModal = () => {
    setModal(false);
    setFormError("");
    setForm(createInitialBudgetForm());
    setProductsError("");
    setNewItem({ productId: "", quantity: 1, unit: "unidade", unitPrice: 0 });
  };

  const saveBudget = async () => {
    const client = clients.find((item) => item.id === form.clientId);

    if (!client) {
      setFormError("Selecione um cliente válido.");
      return;
    }

    if (!form.description.trim()) {
      setFormError("Informe a descrição do orçamento.");
      return;
    }

    if (form.items.length === 0) {
      setFormError("Adicione ao menos um material no orçamento.");
      return;
    }

    const hasMaterialWithoutProduct = form.items.some((item) => !item.productId);

    if (hasMaterialWithoutProduct) {
      setFormError("Todos os materiais devem estar vinculados a um produto do banco.");
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      const created = await createBudget({
        clientName: client.name,
        description: form.description.trim(),
        deliveryDate: form.deliveryDate ? new Date(`${form.deliveryDate}T00:00:00`).toISOString() : null,
        totalPrice: calc.finalPrice,
        notes: form.notes.trim() ? form.notes.trim() : null,
        status: "draft",
        materials: form.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
        })),
      });

      setData((current) => [mapBudgetFromApi(created), ...current]);
      closeCreateModal();
    } catch (error) {
      setFormError(normalizeBudgetError(error, "Não foi possível criar o orçamento."));
    } finally {
      setIsSaving(false);
    }
  };

  const openBudgetDetail = async (budgetId: string) => {
    setDetailModalOpen(true);
    setDetailError("");
    setIsLoadingDetail(true);

    try {
      const budget = mapBudgetFromApi(await getBudgetById(budgetId));
      setSelectedBudget(budget);
      setDetailForm({
        clientName: budget.clientName,
        description: budget.description,
        deliveryDate: budget.deliveryDate,
        notes: budget.notes || "",
        status: budget.status,
        totalPrice: budget.finalPrice,
      });
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
    setDetailForm(createInitialDetailForm());
  };

  const saveBudgetDetail = async () => {
    if (!selectedBudget) {
      return;
    }

    if (!detailForm.clientName.trim() || !detailForm.description.trim()) {
      setDetailError("Cliente e descrição são obrigatórios.");
      return;
    }

    setIsUpdatingDetail(true);
    setDetailError("");

    try {
      const updated = mapBudgetFromApi(
        await updateBudget(selectedBudget.id, {
          clientName: detailForm.clientName.trim(),
          description: detailForm.description.trim(),
          deliveryDate: detailForm.deliveryDate
            ? new Date(`${detailForm.deliveryDate}T00:00:00`).toISOString()
            : null,
          notes: detailForm.notes.trim() ? detailForm.notes.trim() : null,
          status: detailForm.status,
          totalPrice: detailForm.totalPrice,
        }),
      );

      setData((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      closeDetailModal();
    } catch (error) {
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
      const approved = mapBudgetFromApi(await approveBudget(budgetId));
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
      clients.find((client) => client.id === budget.clientId) ||
      clients.find((client) => client.name === budget.clientName);

    setSelectedBudgetForContract(budget);
    setContractFormError("");
    setContractForm({
      contratanteName: linkedClient?.name || budget.clientName || "",
      operationName: budget.clientName || linkedClient?.name || "",
      projectAddress: linkedClient?.address || "",
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
      const marginX = 14;
      const contentWidth = pageWidth - marginX * 2;

      let y = 16;

      const logoDataUrl = await loadLogoDataUrl();
      if (logoDataUrl) {
        pdf.addImage(logoDataUrl, "PNG", marginX, y - 3, 14, 14);
      }

      pdf.setTextColor(166, 124, 0);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(20);
      pdf.text("Mais Quioque", logoDataUrl ? marginX + 18 : marginX, y + 5);

      pdf.setTextColor(90, 90, 90);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text("Proposta comercial para cliente", logoDataUrl ? marginX + 18 : marginX, y + 10);

      y += 16;
      pdf.setDrawColor(210, 210, 210);
      pdf.line(marginX, y, pageWidth - marginX, y);

      y += 8;
      pdf.setTextColor(30, 30, 30);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text(`Orçamento #${budget.id}`, marginX, y);

      y += 6;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(`Cliente: ${budget.clientName}`, marginX, y);

      y += 5;
      pdf.text(`Data de emissão: ${budget.createdAt}`, marginX, y);

      y += 5;
      pdf.text(`Status: ${formatStatus(budget.status)}`, marginX, y);

      y += 10;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text("Itens do orçamento", marginX, y);

      y += 5;
      const drawItemsHeader = () => {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.setDrawColor(190, 190, 190);
        pdf.rect(marginX, y, contentWidth, 7);
        pdf.text("Item", marginX + 2, y + 4.6);
        pdf.text("Qtd.", 114, y + 4.6, { align: "right" });
        pdf.text("Valor Unit.", 148, y + 4.6, { align: "right" });
        pdf.text("Subtotal", pageWidth - marginX - 2, y + 4.6, { align: "right" });
        y += 7;
      };

      drawItemsHeader();

      for (const item of budget.items) {
        const itemLines = pdf.splitTextToSize(item.productName, 86);
        const rowHeight = Math.max(7, itemLines.length * 4.5 + 2.5);

        if (y + rowHeight > pageHeight - 38) {
          pdf.addPage();
          y = 20;
          drawItemsHeader();
        }

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.rect(marginX, y, contentWidth, rowHeight);
        pdf.text(itemLines, marginX + 2, y + 4.2);
        pdf.text(String(item.quantity), 114, y + 4.2, { align: "right" });
        pdf.text(formatCurrency(item.unitPrice), 148, y + 4.2, { align: "right" });
        pdf.text(formatCurrency(item.subtotal), pageWidth - marginX - 2, y + 4.2, { align: "right" });

        y += rowHeight;
      }

      y += 8;
      const summaryWidth = 78;
      const summaryX = pageWidth - marginX - summaryWidth;

      if (y + 34 > pageHeight - 18) {
        pdf.addPage();
        y = 20;
      }

      pdf.setDrawColor(190, 190, 190);
      pdf.rect(summaryX, y, summaryWidth, 34);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);

      const summaryRows: Array<[string, string]> = [
        ["Materiais", formatCurrency(budget.materialCost)],
        ["Mão de obra", formatCurrency(budget.laborCost)],
        ["Custo total", formatCurrency(budget.totalCost)],
        ["Margem", formatPercent(budget.profitMargin)],
      ];

      let summaryY = y + 6;
      summaryRows.forEach(([label, value]) => {
        pdf.setTextColor(50, 50, 50);
        pdf.text(label, summaryX + 2, summaryY);
        pdf.text(value, summaryX + summaryWidth - 2, summaryY, { align: "right" });
        summaryY += 6;
      });

      pdf.setTextColor(166, 124, 0);
      pdf.setFont("helvetica", "bold");
      pdf.text("Preço final", summaryX + 2, summaryY);
      pdf.text(formatCurrency(budget.finalPrice), summaryX + summaryWidth - 2, summaryY, { align: "right" });

      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(110, 110, 110);
      pdf.setFontSize(8);
      pdf.text("Documento gerado automaticamente pelo sistema Mais Quioque.", marginX, pageHeight - 10);

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
      const marginX = 14;
      const contentWidth = pageWidth - marginX * 2;
      const bottomMargin = 10;

      const lineHeightFor = (fontSize: number) => Number((fontSize * 0.45).toFixed(2));

      const resolveBannerHeight = (
        bannerDataUrl: string | null,
        minHeight: number,
        maxHeight: number,
      ) => {
        if (!bannerDataUrl) {
          return 0;
        }

        try {
          const properties = pdf.getImageProperties(bannerDataUrl);
          const ratio = properties.height / properties.width;
          const suggestedHeight = pageWidth * ratio;
          return Math.min(maxHeight, Math.max(minHeight, Number(suggestedHeight.toFixed(2))));
        } catch {
          return minHeight;
        }
      };

      const topBannerDataUrl = await loadContractTopBannerDataUrl();
      const bottomBannerDataUrl = await loadContractBottomBannerDataUrl();
      const topBannerHeight = resolveBannerHeight(topBannerDataUrl, 26, 62);
      const bottomBannerHeight = resolveBannerHeight(bottomBannerDataUrl, 18, 46);
      const reservedBottomDecoration = bottomBannerDataUrl ? bottomBannerHeight + 3 : 0;
      const contentBottomLimit = pageHeight - bottomMargin - reservedBottomDecoration;

      if (topBannerDataUrl) {
        pdf.addImage(topBannerDataUrl, "PNG", 0, 0, pageWidth, topBannerHeight);
      }

      let y = topBannerDataUrl ? topBannerHeight + 8 : 16;

      const ensureSpace = (requiredHeight: number) => {
        if (y + requiredHeight <= contentBottomLimit) {
          return;
        }

        pdf.addPage();
        y = 16;
      };

      const writeParagraph = (
        text: string,
        options: {
          fontStyle?: "normal" | "bold";
          fontSize?: number;
          marginBottom?: number;
        } = {},
      ) => {
        const { fontStyle = "normal", fontSize = 10, marginBottom = 1.6 } = options;
        const lines = pdf.splitTextToSize(text, contentWidth) as string[];
        const lineHeight = lineHeightFor(fontSize);
        const blockHeight = Math.max(lineHeight, lines.length * lineHeight);

        ensureSpace(blockHeight + marginBottom);

        pdf.setFont("helvetica", fontStyle);
        pdf.setFontSize(fontSize);
        pdf.text(lines, marginX, y);
        y += blockHeight + marginBottom;
      };

      const writeSectionTitle = (title: string) => {
        y += 1;
        writeParagraph(title, { fontStyle: "bold", fontSize: 11, marginBottom: 2 });
      };

      const writeTextBlock = (text: string, marginBottom = 2) => {
        const lines = text.split("\n");

        lines.forEach((rawLine, index) => {
          const line = rawLine.trim();

          if (!line) {
            y += 1;
            return;
          }

          if (/^[-•]\s+/.test(line)) {
            writeBullet(line.replace(/^[-•]\s+/, ""));
            return;
          }

          writeParagraph(line, {
            marginBottom: index === lines.length - 1 ? marginBottom : 1,
          });
        });
      };

      const writeBullet = (text: string) => {
        const fontSize = 10;
        const lineHeight = lineHeightFor(fontSize);
        const lines = pdf.splitTextToSize(text, contentWidth - 9) as string[];
        const blockHeight = Math.max(lineHeight, lines.length * lineHeight) + 1;

        ensureSpace(blockHeight);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(fontSize);

        lines.forEach((line, index) => {
          const prefix = index === 0 ? "• " : "";
          const x = index === 0 ? marginX + 1 : marginX + 6;
          pdf.text(`${prefix}${line}`, x, y + index * lineHeight);
        });

        y += lines.length * lineHeight + 1;
      };

      pdf.setTextColor(35, 35, 35);
      writeParagraph("CONTRATO DE PRESTACAO DE SERVICOS", { fontStyle: "bold", fontSize: 12, marginBottom: 2.4 });

      writeParagraph(
        `Direcionada a desenvolvimento, criação e montagem de quiosque medindo ${contractForm.kioskWidthMeters}x${contractForm.kioskDepthMeters} metros destinado ao cliente ${contractForm.operationName}.`,
        { marginBottom: 2.5 },
      );

      y += 1;
      writeParagraph("CONTRATADA:", { fontStyle: "bold", marginBottom: 1.2 });
      writeParagraph(
        "MAIS QUIOSQUE, situada na Rua Professor Athanassof, 28 - Cidade Patriarca - São Paulo/SP, inscrita no CNPJ nº 07.313.928/0001-75 (Gira Kids),",
        { marginBottom: 1 },
      );
      writeParagraph("E-mail: maisquiosque@hotmail.com", { marginBottom: 1 });
      writeParagraph("Telefone: +55 11 98327-0902", { marginBottom: 2.2 });

      writeParagraph(`CONTRATANTE: ${contractForm.contratanteName}`, {
        fontStyle: "bold",
        marginBottom: 2.2,
      });

      writeParagraph(
        "As partes acima identificadas acordam a presente Proposta Comercial de Prestação de Serviços, que será regida pelas cláusulas a seguir:",
        { marginBottom: 2.2 },
      );

      contractForm.clauses.forEach((clause, index) => {
        writeSectionTitle(clause.title.trim());
        writeTextBlock(
          replaceContractPlaceholders(clause.content, contractForm.contractValue),
          index === contractForm.clauses.length - 1 ? 2.5 : 2,
        );
      });

      if (contractForm.projectAddress.trim()) {
        writeParagraph(`Endereço da obra: ${contractForm.projectAddress.trim()}`, {
          fontStyle: "bold",
          marginBottom: 3,
        });
      }

      const dateFontSize = 10;
      const dateMarginBottom = 8;
      const signatureOffsetAfterDate = 8;
      const signatureBottomOffset = 15;
      const signatureSectionHeight =
        lineHeightFor(dateFontSize) + dateMarginBottom + signatureOffsetAfterDate + signatureBottomOffset;
      const footerTopY = bottomBannerDataUrl ? pageHeight - bottomBannerHeight : pageHeight - bottomMargin;
      const signatureGapToFooter = 3;

      ensureSpace(signatureSectionHeight + 1);

      const targetSignatureStartY = footerTopY - signatureGapToFooter - signatureSectionHeight;
      if (targetSignatureStartY > y) {
        y = targetSignatureStartY;
      }

      writeParagraph(`${contractForm.signatureCity}, ${formatLongDate(contractForm.signatureDate)}.`, { marginBottom: 8 });

      const signatureLineWidth = 74;
      const leftSignatureX = marginX;
      const rightSignatureX = pageWidth - marginX - signatureLineWidth;
      const lineY = y + signatureOffsetAfterDate;

      pdf.setDrawColor(140, 140, 140);
      pdf.line(leftSignatureX, lineY, leftSignatureX + signatureLineWidth, lineY);
      pdf.line(rightSignatureX, lineY, rightSignatureX + signatureLineWidth, lineY);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(30, 30, 30);
      pdf.text(contractForm.contratanteName, leftSignatureX, lineY + 5);
      pdf.text("Contratante", leftSignatureX, lineY + 10);

      pdf.text("Daniel De Souza", rightSignatureX, lineY + 5);
      pdf.text("Executivo Comercial - Mais Quiosque", rightSignatureX, lineY + 10);
      pdf.text("Contratada", rightSignatureX, lineY + 15);

      if (bottomBannerDataUrl) {
        pdf.addImage(bottomBannerDataUrl, "PNG", 0, pageHeight - bottomBannerHeight, pageWidth, bottomBannerHeight);
      }

      const safeClientName = sanitizeFileName(contractForm.operationName || selectedBudgetForContract.clientName) || "cliente";
      pdf.save(`contrato-${selectedBudgetForContract.id}-${safeClientName}.pdf`);
      closeContractModal();
    } catch {
      setContractFormError("Não foi possível gerar o contrato em PDF. Tente novamente.");
    } finally {
      setIsGeneratingContract(false);
    }
  };

  const columns = [
    { key: "createdAt", header: "Data", mono: true },
    { key: "clientName", header: "Cliente" },
    { key: "description", header: "Descrição" },
    { key: "finalPrice", header: "Preço Final", mono: true, render: (b: BudgetRow) => `R$ ${b.finalPrice.toFixed(2)}` },
    { key: "deliveryDate", header: "Entrega", mono: true, render: (b: BudgetRow) => b.deliveryDate || "-" },
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
                openApproveModal(b);
              }}
              disabled={Boolean(approvingId)}
              className="px-2 py-1 text-[11px] font-bold rounded bg-success/20 text-success hover:bg-success/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {approvingId === b.id ? "APROVANDO..." : "APROVAR"}
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
        {requestError && (
          <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
            <span>{requestError}</span>
            <button
              onClick={() => void loadBudgetsFromApi()}
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

      <Modal open={modal} onClose={closeCreateModal} title="Novo Orçamento" width="max-w-2xl">
        <div className="space-y-6">
          <FormField label="Cliente" as="select" value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })} options={clients.map(c => ({ value: c.id, label: c.name }))} />

          <FormField
            label="Descrição"
            as="textarea"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Descreva o orçamento"
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Entrega"
              type="date"
              value={form.deliveryDate}
              onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })}
            />
            <FormField
              label="Observações"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Opcional"
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
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>{item.productName} × {item.quantity} {item.unit}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs">R$ {item.subtotal.toFixed(2)}</span>
                      <button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="flex-1">
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
              </div>
              <div className="w-24">
                <FormField
                  label="Qtd."
                  type="number"
                  min={1}
                  value={newItem.quantity}
                  onChange={e => setNewItem({ ...newItem, quantity: Number(e.target.value) })}
                />
              </div>
              <div className="w-28">
                <FormField
                  label="Unid."
                  value={newItem.unit}
                  onChange={e => setNewItem({ ...newItem, unit: e.target.value })}
                />
              </div>
              <div className="w-32">
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
                  disabled={isLoadingProducts || productsCatalog.length === 0}
                  className="px-3 py-2 text-xs font-bold rounded border border-border hover:bg-secondary transition-colors text-foreground disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoadingProducts ? "CARREGANDO..." : "ADICIONAR"}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Mão de Obra (R$)" type="number" step="0.01" value={form.laborCost} onChange={e => setForm({ ...form, laborCost: Number(e.target.value) })} />
            <FormField label="Margem de Lucro (%)" type="number" step="1" value={form.profitMargin * 100} onChange={e => setForm({ ...form, profitMargin: Number(e.target.value) / 100 })} />
          </div>

          <div className="border border-border rounded p-4 bg-secondary/20">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Materiais</p>
                <p className="font-mono font-bold text-foreground">R$ {calc.materialCost.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Custo Total</p>
                <p className="font-mono font-bold text-foreground">R$ {calc.totalCost.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Preço Final</p>
                <p className="font-mono font-bold text-primary text-lg">R$ {calc.finalPrice.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <div className="flex justify-end gap-3">
            <button onClick={closeCreateModal} className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground">Cancelar</button>
            <button
              onClick={() => void saveBudget()}
              disabled={isSaving || isLoadingProducts}
              className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSaving ? "Salvando..." : "Criar Orçamento"}
            </button>
          </div>
        </div>
      </Modal>

      {selectedToApprove && (
        <Modal
          open={Boolean(selectedToApprove)}
          onClose={() => closeApproveModal()}
          title="Aprovar Orcamento"
          width="max-w-xl"
        >
          <div className="space-y-4">
            <p className="text-sm text-foreground/90">
              Ao aprovar, o backend vai baixar estoque dos produtos usados no orcamento e registrar movimentacoes de saida automaticamente.
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
                {approvingId === selectedToApprove.id ? "Aprovando..." : "Confirmar Aprovacao"}
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
                value={detailForm.clientName}
                onChange={(e) => setDetailForm((current) => ({ ...current, clientName: e.target.value }))}
              />

              <FormField
                label="Status"
                as="select"
                value={detailForm.status}
                onChange={(e) =>
                  setDetailForm((current) => ({
                    ...current,
                    status: e.target.value as BudgetStatus,
                  }))
                }
                options={[
                  { value: "draft", label: "Rascunho" },
                  { value: "pending", label: "Pendente" },
                  { value: "approved", label: "Aprovado" },
                  { value: "rejected", label: "Rejeitado" },
                ]}
              />
            </div>

            <FormField
              label="Descrição"
              as="textarea"
              value={detailForm.description}
              onChange={(e) => setDetailForm((current) => ({ ...current, description: e.target.value }))}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Entrega"
                type="date"
                value={detailForm.deliveryDate}
                onChange={(e) => setDetailForm((current) => ({ ...current, deliveryDate: e.target.value }))}
              />

              <FormField
                label="Preço Total (R$)"
                type="number"
                min={0}
                step="0.01"
                value={detailForm.totalPrice}
                onChange={(e) =>
                  setDetailForm((current) => ({
                    ...current,
                    totalPrice: Number(e.target.value),
                  }))
                }
              />
            </div>

            <FormField
              label="Observações"
              as="textarea"
              value={detailForm.notes}
              onChange={(e) => setDetailForm((current) => ({ ...current, notes: e.target.value }))}
            />

            <div className="flex justify-end gap-3">
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
