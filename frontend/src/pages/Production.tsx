import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Modal } from "@/components/Modal";
import { FormField } from "@/components/FormField";
import { toast } from "@/components/ui/use-toast";
import { dispatchInventoryRefresh } from "@/lib/inventory-events";
import { useAuth, useRoleAccess } from "@/auth/AuthProvider";
import { orders as mockOrders, ProductionMaterial } from "@/data/mockData";
import { Client, listClients } from "@/services/clients";
import { Product, listProducts } from "@/services/products";
import { listTeams } from "@/services/teams";
import { Budget, listBudgets } from "@/services/budgets";
import {
  AdvanceProductionStatusInput,
  advanceProductionStatus,
  CompleteProductionError,
  CompleteProductionStockDetail,
  EmployeeProduction,
  ProductionImage,
  ProductionImageError,
  ProductionStatusOption,
  ProductionShareError,
  createProductionShareLink,
  createProduction,
  formatStockDetailMessage,
  listProductionImages,
  listProductionStatusOptions,
  listProductions,
  replaceProductionStatuses,
  uploadProductionImages,
} from "@/services/productions";
import { ImagePlus, Pencil, Plus, Share2, Trash2 } from "lucide-react";

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  cutting: "Corte",
  assembly: "Montagem",
  finishing: "Acabamento",
  quality_check: "Controle",
  approved: "Aprovado",
  delivered: "Entregue",
};
const apiBaseUrl = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const isDevelopment = import.meta.env.DEV;
const isApiConfigured = Boolean(apiBaseUrl);
const MAX_IMAGES_PER_REQUEST = 10;
const MAX_IMAGE_SIZE_MB = 8;

const formatStageLabel = (value: string) => {
  const normalized = value.trim();

  if (!normalized) {
    return "Etapa";
  }

  return statusLabels[normalized] || normalized;
};

const copyText = async (value: string) => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard indisponivel neste ambiente.");
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textArea);
  }
};

const buildShareErrorMessage = (error: unknown) => {
  if (error instanceof ProductionShareError) {
    switch (error.status) {
      case 401:
        return "Sessao expirada. Faca login novamente.";
      case 403:
        return "Acesso negado. Apenas admin e gerente podem compartilhar producao.";
      case 404:
        return "Producao nao encontrada para compartilhamento.";
      case 500:
        return "Erro interno ao gerar link de compartilhamento.";
      default:
        return error.message || "Nao foi possivel compartilhar esta producao.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel compartilhar esta producao.";
};

const formatImageDateTime = (value: string) => {
  if (!value) {
    return "Data nao informada";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("pt-BR");
};

const formatImageSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const kb = bytes / 1024;

  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(kb / 1024).toFixed(1)} MB`;
};

const buildImageErrorMessage = (error: unknown) => {
  if (error instanceof ProductionImageError) {
    switch (error.status) {
      case 400:
        return "Nao foi possivel enviar imagens. Verifique tipo, tamanho (maximo 8MB) e limite de 10 arquivos.";
      case 401:
        return "Sessao expirada. Faca login novamente.";
      case 403:
        return "Acesso negado. Apenas admin e gerente podem gerenciar imagens.";
      case 404:
        return "Producao nao encontrada para gerenciar imagens.";
      case 413:
        return "Arquivo muito grande. O limite por imagem e 8MB.";
      case 415:
        return "Formato invalido. Envie somente arquivos de imagem.";
      case 500:
        return "Erro interno ao processar imagens da producao.";
      default:
        return error.message || "Nao foi possivel processar imagens desta producao.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel processar imagens desta producao.";
};

interface TeamOption {
  id: string;
  name: string;
}

type StageInputMode = "existing" | "new";

interface StatusEditorRow {
  key: string;
  mode: StageInputMode;
  stageId: string;
  stageName: string;
  teamId: string;
}

const createStatusEditorRow = (): StatusEditorRow => ({
  key: `stage-row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  mode: "existing",
  stageId: "",
  stageName: "",
  teamId: "",
});

const createMockOrdersSnapshot = () =>
  mockOrders.map((order) => ({
    ...order,
    materials: order.materials.map((material) => ({ ...material })),
  }));

const createMockTeamsSnapshot = (): TeamOption[] => {
  const names = Array.from(new Set(mockOrders.map((order) => order.installationTeam).filter(Boolean)));

  return names.map((name, index) => ({
    id: `mock-team-${index + 1}`,
    name,
  }));
};

const createMockClientsSnapshot = (): Client[] => {
  const names = Array.from(new Set(mockOrders.map((order) => order.clientName).filter(Boolean)));

  return names.map((name, index) => ({
    id: `mock-client-${index + 1}`,
    name,
    companyName: null,
    document: null,
    contactName: null,
    email: null,
    phone: null,
    secondaryPhone: null,
    street: null,
    number: null,
    complement: null,
    neighborhood: null,
    city: null,
    state: null,
    postalCode: null,
    notes: null,
    isActive: true,
    metadata: {},
    createdAt: "",
    updatedAt: "",
  }));
};

const createInitialForm = () => ({
  budgetId: "",
  clientId: "",
  description: "",
  deliveryDate: "",
  installationTeamId: "",
  initialCost: 0,
  materials: [] as ProductionMaterial[],
});

const ProductionPage = () => {
  const { user } = useAuth();
  const { canCreateProduction, canCompleteProduction, isEmployee } = useRoleAccess();

  const [data, setData] = useState<EmployeeProduction[]>([]);
  const [modal, setModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingTeams, setIsLoadingTeams] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState("");
  const [modeNotice, setModeNotice] = useState("");
  const [isMockMode, setIsMockMode] = useState(false);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [clientsCatalog, setClientsCatalog] = useState<Client[]>([]);
  const [productsCatalog, setProductsCatalog] = useState<Product[]>([]);
  const [approvedBudgetsCatalog, setApprovedBudgetsCatalog] = useState<Budget[]>([]);
  const [statusOptions, setStatusOptions] = useState<ProductionStatusOption[]>([]);
  const [isLoadingStatusOptions, setIsLoadingStatusOptions] = useState(false);
  const [statusOptionsError, setStatusOptionsError] = useState("");
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(false);
  const [clientsError, setClientsError] = useState("");
  const [productsError, setProductsError] = useState("");
  const [budgetsError, setBudgetsError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(createInitialForm);
  const [newMaterial, setNewMaterial] = useState({ productId: "", quantity: 1, unit: "unidade" });
  const [selectedToAdvance, setSelectedToAdvance] = useState<EmployeeProduction | null>(null);
  const [advanceMode, setAdvanceMode] = useState<StageInputMode>("existing");
  const [advanceStageId, setAdvanceStageId] = useState("");
  const [advanceStageName, setAdvanceStageName] = useState("");
  const [advanceTeamId, setAdvanceTeamId] = useState("");
  const [advanceError, setAdvanceError] = useState("");
  const [selectedToEditStatuses, setSelectedToEditStatuses] = useState<EmployeeProduction | null>(null);
  const [statusEditorRows, setStatusEditorRows] = useState<StatusEditorRow[]>([]);
  const [statusEditorError, setStatusEditorError] = useState("");
  const [completionError, setCompletionError] = useState("");
  const [completionErrorStatus, setCompletionErrorStatus] = useState<number | null>(null);
  const [completionDetails, setCompletionDetails] = useState<CompleteProductionStockDetail[]>([]);
  const [selectedForImages, setSelectedForImages] = useState<EmployeeProduction | null>(null);
  const [productionImages, setProductionImages] = useState<ProductionImage[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [imagesError, setImagesError] = useState("");
  const completionInFlightRef = useRef<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const normalizeDateOnly = (value: string | null | undefined) => {
    if (!value || typeof value !== "string") {
      return "";
    }

    return value.includes("T") ? value.split("T")[0] : value;
  };

  const normalizeName = (value: string) => value.trim().toLowerCase();

  const findClientByName = (clientName: string) => {
    const normalized = normalizeName(clientName);
    return clientsCatalog.find((client) => normalizeName(client.name) === normalized);
  };

  const findProductByName = (productName: string) => {
    const normalized = normalizeName(productName);
    return productsCatalog.find((product) => normalizeName(product.name) === normalized);
  };

  const resolveBudgetApplicableCost = (budget: Budget) => {
    const fromSummary = Number(
      budget.financialSummary?.costsApplicableValue ?? budget.costsApplicableValue ?? 0,
    );

    if (Number.isFinite(fromSummary) && fromSummary > 0) {
      return Math.max(0, fromSummary);
    }

    return Math.max(
      0,
      (budget.applicableCosts || []).reduce((sum, cost) => sum + (Number(cost.amount) || 0), 0),
    );
  };

  const resolveBudgetTotalCost = (budget: Budget) => {
    const apiTotalCost = Number(budget.totalCost);

    if (Number.isFinite(apiTotalCost) && apiTotalCost > 0) {
      return Math.max(0, apiTotalCost);
    }

    const materialCost = (budget.materials || []).reduce(
      (sum, material) => sum + (Number(material.unitPrice) || 0) * (Number(material.quantity) || 0),
      0,
    );
    const departmentsCost = (budget.expenseDepartments || []).reduce(
      (sum, department) => sum + (Number(department.amount) || 0),
      0,
    );
    const laborCost = Math.max(0, Number(budget.laborCost) || 0);
    const applicableCost = resolveBudgetApplicableCost(budget);

    return Math.max(0, materialCost + departmentsCost + laborCost + applicableCost);
  };

  const resolveBudgetProfit = (budget: Budget) => {
    const apiProfitValue = Number(budget.profitValue);

    if (Number.isFinite(apiProfitValue)) {
      return apiProfitValue;
    }

    return (Number(budget.totalPrice) || 0) - resolveBudgetTotalCost(budget);
  };

  const loadProductions = async () => {
    setIsLoading(true);
    setRequestError("");

    if (isDevelopment && !isApiConfigured) {
      setData(createMockOrdersSnapshot());
      setIsMockMode(true);
      setModeNotice("Modo local ativo: usando dados mock porque VITE_API_URL não está configurado.");
      setIsLoading(false);
      return;
    }

    if (isEmployee && !user?.id) {
      setData([]);
      setIsMockMode(false);
      setModeNotice("");
      setIsLoading(false);
      return;
    }

    try {
      const employeeId = isEmployee ? user?.id : undefined;
      const list = await listProductions(employeeId ? { employeeId } : undefined);
      setData(list);
      setIsMockMode(false);
      setModeNotice("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar produções.";

      if (isDevelopment) {
        setData(createMockOrdersSnapshot());
        setIsMockMode(true);
        setModeNotice("Backend indisponível. Exibindo dados mock para continuar em desenvolvimento.");
      } else {
        setRequestError(`Não foi possível carregar dados do banco: ${message}`);
        setData([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadTeams = async () => {
    if (!canCreateProduction) {
      setTeams([]);
      setIsLoadingTeams(false);
      return;
    }

    setIsLoadingTeams(true);

    try {
      const teamsData = await listTeams();
      const nextTeams = teamsData.map((team) => ({ id: team.id, name: team.name }));
      setTeams(nextTeams);
    } catch {
      if (isDevelopment) {
        setTeams(createMockTeamsSnapshot());
      } else {
        setTeams([]);
      }
    } finally {
      setIsLoadingTeams(false);
    }
  };

  const loadStatusOptions = async () => {
    if (!canCompleteProduction) {
      setStatusOptions([]);
      setStatusOptionsError("");
      return;
    }

    setIsLoadingStatusOptions(true);
    setStatusOptionsError("");

    try {
      const options = await listProductionStatusOptions();
      setStatusOptions(options);
    } catch (error) {
      setStatusOptions([]);
      const message = error instanceof Error ? error.message : "Falha ao carregar etapas.";
      setStatusOptionsError(`Nao foi possivel carregar opcoes de etapas: ${message}`);
    } finally {
      setIsLoadingStatusOptions(false);
    }
  };

  const loadProductsForForm = async () => {
    if (!canCreateProduction) {
      setProductsCatalog([]);
      setProductsError("");
      setIsLoadingProducts(false);
      return;
    }

    setIsLoadingProducts(true);
    setProductsError("");

    try {
      const products = await listProducts();
      setProductsCatalog(products);
    } catch (error) {
      setProductsCatalog([]);
      const message = error instanceof Error ? error.message : "Falha ao carregar produtos.";
      setProductsError(`Nao foi possivel carregar produtos: ${message}`);
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const loadApprovedBudgetsForForm = async () => {
    if (!canCreateProduction) {
      setApprovedBudgetsCatalog([]);
      setBudgetsError("");
      setIsLoadingBudgets(false);
      return;
    }

    setIsLoadingBudgets(true);
    setBudgetsError("");

    try {
      const budgets = await listBudgets();
      setApprovedBudgetsCatalog(
        budgets.filter((budget) => budget.status === "approved"),
      );
    } catch (error) {
      setApprovedBudgetsCatalog([]);
      const message = error instanceof Error ? error.message : "Falha ao carregar orcamentos aprovados.";
      setBudgetsError(`Nao foi possivel carregar orcamentos aprovados: ${message}`);
    } finally {
      setIsLoadingBudgets(false);
    }
  };

  const loadClientsForForm = async () => {
    if (!canCreateProduction) {
      setClientsCatalog([]);
      setClientsError("");
      setIsLoadingClients(false);
      return;
    }

    setIsLoadingClients(true);
    setClientsError("");

    try {
      const clients = await listClients();
      setClientsCatalog(clients);
    } catch (error) {
      if (isDevelopment) {
        setClientsCatalog(createMockClientsSnapshot());
        setClientsError("");
      } else {
        setClientsCatalog([]);
        const message = error instanceof Error ? error.message : "Falha ao carregar clientes.";
        setClientsError(`Nao foi possivel carregar clientes: ${message}`);
      }
    } finally {
      setIsLoadingClients(false);
    }
  };

  useEffect(() => {
    void loadProductions();
    void loadTeams();
    void loadStatusOptions();
  }, [canCreateProduction, canCompleteProduction, isEmployee, user?.id]);

  useEffect(() => {
    if (!modal) {
      return;
    }

    void loadProductsForForm();
    void loadClientsForForm();
    void loadApprovedBudgetsForForm();
  }, [modal, canCreateProduction]);

  const selectedApprovedBudget = useMemo(
    () => approvedBudgetsCatalog.find((budget) => budget.id === form.budgetId) || null,
    [approvedBudgetsCatalog, form.budgetId],
  );

  const applyApprovedBudgetToForm = (budgetId: string) => {
    const selectedBudget = approvedBudgetsCatalog.find((budget) => budget.id === budgetId);

    if (!selectedBudget) {
      setForm((current) => ({
        ...current,
        budgetId,
      }));
      return;
    }

    const linkedClient = findClientByName(selectedBudget.clientName);
    const unresolvedMaterials: string[] = [];

    const mappedMaterials = selectedBudget.materials
      .map((material) => {
        const linkedProduct = material.productId
          ? productsCatalog.find((product) => product.id === material.productId)
          : findProductByName(material.productName);

        if (!linkedProduct) {
          unresolvedMaterials.push(material.productName);
          return null;
        }

        return {
          productId: linkedProduct.id,
          productName: linkedProduct.name,
          quantity: Number(material.quantity) || 0,
          unit: material.unit || "unidade",
        };
      })
      .filter((material): material is ProductionMaterial => Boolean(material) && material.quantity > 0);

    setForm((current) => ({
      ...current,
      budgetId,
      clientId: linkedClient?.id || current.clientId,
      description: selectedBudget.description || current.description,
      deliveryDate: normalizeDateOnly(selectedBudget.deliveryDate) || current.deliveryDate,
      initialCost: resolveBudgetTotalCost(selectedBudget),
      materials: mappedMaterials,
    }));

    if (unresolvedMaterials.length > 0) {
      setFormError(
        `Alguns materiais do orcamento nao foram encontrados no catalogo de produtos e nao puderam ser vinculados: ${unresolvedMaterials.join(", ")}.`,
      );
      return;
    }

    setFormError("");
  };

  const addMaterial = () => {
    const product = productsCatalog.find((p) => p.id === newMaterial.productId);
    const quantity = Number(newMaterial.quantity);
    const unit = newMaterial.unit.trim() || "unidade";

    if (!product) {
      setFormError("Selecione um produto valido.");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setFormError("Informe uma quantidade valida para o material.");
      return;
    }

    setForm((current) => {
      const existingIdx = current.materials.findIndex((m) => m.productId === product.id);

      if (existingIdx >= 0) {
        const updated = [...current.materials];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + quantity,
        };
        return { ...current, materials: updated };
      }

      return {
        ...current,
        materials: [
          ...current.materials,
          {
            productId: product.id,
            productName: product.name,
            quantity,
            unit,
          },
        ],
      };
    });

    setFormError("");
    setNewMaterial({ productId: "", quantity: 1, unit });
  };

  const removeMaterial = (idx: number) => {
    setForm((current) => ({
      ...current,
      materials: current.materials.filter((_, i) => i !== idx),
    }));
  };

  const closeModal = () => {
    setModal(false);
    setFormError("");
    setProductsError("");
    setForm(createInitialForm());
    setNewMaterial({ productId: "", quantity: 1, unit: "unidade" });
  };

  const openCreateModal = () => {
    setModal(true);
    setFormError("");
    void loadClientsForForm();
    void loadProductsForForm();
  };

  const clearCompletionFeedback = () => {
    setCompletionError("");
    setCompletionErrorStatus(null);
    setCompletionDetails([]);
  };

  const openAdvanceModal = (order: EmployeeProduction) => {
    if (updatingId) {
      return;
    }

    const initialTeamId = order.statuses[0]?.teamId || teams[0]?.id || "";

    clearCompletionFeedback();
    setAdvanceError("");
    setAdvanceMode("existing");
    setAdvanceStageId("");
    setAdvanceStageName("");
    setAdvanceTeamId(initialTeamId);
    setSelectedToAdvance(order);
  };

  const closeAdvanceModal = (force = false) => {
    if (!force && updatingId) {
      return;
    }

    setSelectedToAdvance(null);
    setAdvanceError("");
    clearCompletionFeedback();
  };

  const openEditStatusesModal = (order: EmployeeProduction) => {
    if (updatingId) {
      return;
    }

    const rows = order.statuses.length
      ? order.statuses.map((status) => ({
          key: `${status.id}-${Math.random().toString(36).slice(2, 6)}`,
          mode: status.stageId ? "existing" : "new",
          stageId: status.stageId || "",
          stageName: status.stageName,
          teamId: status.teamId,
        }))
      : [createStatusEditorRow()];

    setStatusEditorRows(rows);
    setStatusEditorError("");
    setSelectedToEditStatuses(order);
  };

  const closeEditStatusesModal = (force = false) => {
    if (!force && updatingId) {
      return;
    }

    setSelectedToEditStatuses(null);
    setStatusEditorRows([]);
    setStatusEditorError("");
  };

  const addStatusEditorRow = () => {
    setStatusEditorRows((current) => [...current, createStatusEditorRow()]);
  };

  const removeStatusEditorRow = (rowKey: string) => {
    setStatusEditorRows((current) => {
      const next = current.filter((row) => row.key !== rowKey);
      return next.length > 0 ? next : [createStatusEditorRow()];
    });
  };

  const updateStatusEditorRow = (
    rowKey: string,
    patch: Partial<StatusEditorRow>,
  ) => {
    setStatusEditorRows((current) =>
      current.map((row) => {
        if (row.key !== rowKey) {
          return row;
        }

        const next = { ...row, ...patch };

        if (patch.mode === "existing") {
          next.stageName = "";
        }

        if (patch.mode === "new") {
          next.stageId = "";
        }

        return next;
      }),
    );
  };

  const clearSelectedFiles = () => {
    setSelectedFiles([]);

    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  };

  const closeImagesModal = () => {
    if (isUploadingImages) {
      return;
    }

    setSelectedForImages(null);
    setProductionImages([]);
    setImagesError("");
    setIsLoadingImages(false);
    clearSelectedFiles();
  };

  const loadImagesForProduction = async (productionId: string) => {
    setIsLoadingImages(true);
    setImagesError("");

    try {
      const images = await listProductionImages(productionId);
      setProductionImages(images);
    } catch (error) {
      if (error instanceof ProductionImageError && error.status === 401) {
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.assign("/login");
        }

        return;
      }

      setProductionImages([]);
      setImagesError(buildImageErrorMessage(error));
    } finally {
      setIsLoadingImages(false);
    }
  };

  const openImagesModal = (order: EmployeeProduction) => {
    if (Boolean(sharingId) || Boolean(updatingId)) {
      return;
    }

    setSelectedForImages(order);
    setProductionImages([]);
    setImagesError("");
    clearSelectedFiles();

    if (isMockMode) {
      setImagesError("No modo local/mock, o upload de imagens nao esta disponivel.");
      return;
    }

    void loadImagesForProduction(order.id);
  };

  const handleSelectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setImagesError("");
    setSelectedFiles(files);
  };

  const submitImages = async () => {
    if (!selectedForImages || isUploadingImages) {
      return;
    }

    if (isMockMode) {
      setImagesError("No modo local/mock, o upload de imagens nao esta disponivel.");
      return;
    }

    if (!selectedFiles.length) {
      setImagesError("Selecione ao menos uma imagem para enviar.");
      return;
    }

    setIsUploadingImages(true);
    setImagesError("");

    try {
      await uploadProductionImages(selectedForImages.id, selectedFiles);
      const refreshedImages = await listProductionImages(selectedForImages.id);
      setProductionImages(refreshedImages);
      clearSelectedFiles();

      toast({
        title: "Imagens enviadas",
        description: `${selectedFiles.length} arquivo(s) enviado(s) com sucesso.`,
      });
    } catch (error) {
      if (error instanceof ProductionImageError && error.status === 401) {
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.assign("/login");
        }

        return;
      }

      const message = buildImageErrorMessage(error);
      setImagesError(message);

      toast({
        variant: "destructive",
        title: "Nao foi possivel enviar imagens",
        description: message,
      });
    } finally {
      setIsUploadingImages(false);
    }
  };

  const saveProduction = async () => {
    if (!canCreateProduction) {
      setFormError("Seu perfil não possui permissão para criar produção.");
      return;
    }

    if (
      !form.clientId ||
      !form.description.trim() ||
      !form.deliveryDate ||
      !form.installationTeamId ||
      form.initialCost <= 0 ||
      form.materials.length === 0
    ) {
      setFormError("Preencha cliente, descrição, prazo, equipe, custo inicial e pelo menos um material.");
      return;
    }

    const hasInvalidMaterial = form.materials.some(
      (material) => !material.productId || !material.productName,
    );

    if (hasInvalidMaterial) {
      setFormError("Todos os materiais devem estar vinculados a um produto do banco.");
      return;
    }

    const client = clientsCatalog.find((c) => c.id === form.clientId);

    if (!client) {
      setFormError("Selecione um cliente valido cadastrado no banco.");
      return;
    }

    const selectedTeam = teams.find((team) => team.id === form.installationTeamId);

    if (isMockMode) {
      const newOrder: EmployeeProduction = {
        id: `mock-${Date.now()}`,
        clientName: client.name,
        description: form.description.trim(),
        productionStatus: "pending",
        deliveryDate: form.deliveryDate,
        installationTeam: selectedTeam?.name || "A definir",
        initialCost: Number(form.initialCost),
        materials: form.materials.map((material) => ({ ...material })),
      };

      setData((current) => [newOrder, ...current]);
      closeModal();
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      await createProduction({
        clientName: client.name,
        description: form.description.trim(),
        deliveryDate: form.deliveryDate ? new Date(`${form.deliveryDate}T00:00:00`).toISOString() : null,
        installationTeamId: form.installationTeamId,
        budgetId: form.budgetId || undefined,
        initialCost: Number(form.initialCost),
        materials: form.materials,
      });

      closeModal();
      await loadProductions();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao salvar produção.";
      setFormError(`Erro ao salvar no banco: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmAdvanceStage = async () => {
    if (!canCompleteProduction || !selectedToAdvance) {
      return;
    }

    if (!advanceTeamId) {
      setAdvanceError("Selecione uma equipe responsavel para a etapa.");
      return;
    }

    if (advanceMode === "existing" && !advanceStageId) {
      setAdvanceError("Selecione uma etapa existente.");
      return;
    }

    if (advanceMode === "new" && !advanceStageName.trim()) {
      setAdvanceError("Informe o nome da nova etapa.");
      return;
    }

    const orderId = selectedToAdvance.id;
    const payload: AdvanceProductionStatusInput = advanceMode === "existing"
      ? { stageId: advanceStageId, teamId: advanceTeamId }
      : { stageName: advanceStageName.trim(), teamId: advanceTeamId };

    if (completionInFlightRef.current) {
      return;
    }

    completionInFlightRef.current = orderId;

    setRequestError("");
    clearCompletionFeedback();
    setUpdatingId(orderId);

    if (isMockMode) {
      const selectedStageName =
        advanceMode === "existing"
          ? statusOptions.find((option) => option.id === advanceStageId)?.name || "Etapa"
          : advanceStageName.trim();
      const selectedTeamName = teams.find((team) => team.id === advanceTeamId)?.name || "Equipe";

      setData((current) =>
        current.map((order) =>
          order.id === orderId
            ? {
                ...order,
                productionStatus: selectedStageName,
                statuses: [
                  ...order.statuses,
                  {
                    id: `mock-status-${Date.now()}`,
                    stageId: advanceMode === "existing" ? advanceStageId : undefined,
                    stageName: selectedStageName,
                    teamId: advanceTeamId,
                    teamName: selectedTeamName,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : order,
        ),
      );

      closeAdvanceModal(true);
      toast({
        title: "Etapa avancada",
        description: `Etapa ${selectedStageName} adicionada com sucesso.`,
      });
      completionInFlightRef.current = null;
      setUpdatingId(null);
      return;
    }

    try {
      const updated = await advanceProductionStatus(orderId, payload);

      setData((current) =>
        current.map((order) =>
          order.id === orderId ? updated : order,
        ),
      );

      await loadProductions();

      if (updated.productionStatus === "approved") {
        dispatchInventoryRefresh({
          productionId: orderId,
          source: "production-advance-status",
          status: "approved",
          materials: updated.materials.length > 0 ? updated.materials : selectedToAdvance.materials,
        });
      }

      closeAdvanceModal(true);
      toast({
        title: "Etapa avancada",
        description: "A etapa foi adicionada na producao com equipe responsavel.",
      });
    } catch (error) {
      if (error instanceof CompleteProductionError) {
        if (error.status === 401) {
          if (typeof window !== "undefined" && window.location.pathname !== "/login") {
            window.location.assign("/login");
          }

          return;
        }

        setAdvanceError(error.message);
        setCompletionError(error.message);
        setCompletionErrorStatus(error.status);
        setCompletionDetails(error.details);

        toast({
          variant: "destructive",
          title: "Nao foi possivel avancar etapa",
          description:
            error.code === "insufficient_stock" && error.details.length > 0
              ? formatStockDetailMessage(error.details[0])
              : error.message,
        });

        return;
      }

      const message = error instanceof Error ? error.message : "Falha ao avancar etapa.";
      setAdvanceError(message);
      setCompletionError(message);
      setCompletionErrorStatus(0);
      toast({
        variant: "destructive",
        title: "Nao foi possivel avancar etapa",
        description: message,
      });
    } finally {
      completionInFlightRef.current = null;
      setUpdatingId(null);
    }
  };

  const saveEditedStatuses = async () => {
    if (!canCompleteProduction || !selectedToEditStatuses) {
      return;
    }

    if (statusEditorRows.length === 0) {
      setStatusEditorError("Adicione ao menos uma etapa.");
      return;
    }

    const parsedRows: AdvanceProductionStatusInput[] = [];

    for (const row of statusEditorRows) {
      if (!row.teamId) {
        setStatusEditorError("Cada etapa precisa de equipe responsavel.");
        return;
      }

      if (row.mode === "existing") {
        if (!row.stageId) {
          setStatusEditorError("Selecione uma etapa existente para todas as linhas em modo existente.");
          return;
        }

        parsedRows.push({ stageId: row.stageId, teamId: row.teamId });
      } else {
        const stageName = row.stageName.trim();

        if (!stageName) {
          setStatusEditorError("Informe o nome da etapa para todas as linhas em modo nova etapa.");
          return;
        }

        parsedRows.push({ stageName, teamId: row.teamId });
      }
    }

    setUpdatingId(selectedToEditStatuses.id);
    setStatusEditorError("");
    setRequestError("");

    try {
      const updated = await replaceProductionStatuses(selectedToEditStatuses.id, {
        statuses: parsedRows,
      });

      setData((current) => current.map((order) => (order.id === updated.id ? updated : order)));
      await loadProductions();
      closeEditStatusesModal(true);

      toast({
        title: "Etapas atualizadas",
        description: "Lista de etapas da producao salva com sucesso.",
      });
    } catch (error) {
      if (error instanceof CompleteProductionError) {
        if (error.status === 401) {
          if (typeof window !== "undefined" && window.location.pathname !== "/login") {
            window.location.assign("/login");
          }

          return;
        }

        setStatusEditorError(error.message);
      } else {
        setStatusEditorError(
          error instanceof Error ? error.message : "Falha ao salvar etapas da producao.",
        );
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const shareProduction = async (order: EmployeeProduction) => {
    if (sharingId || updatingId) {
      return;
    }

    if (isMockMode) {
      toast({
        variant: "destructive",
        title: "Compartilhamento indisponivel",
        description: "No modo local/mock, o link publico nao pode ser gerado.",
      });
      return;
    }

    setSharingId(order.id);

    try {
      const payload = await createProductionShareLink(order.id);

      if (!payload.url) {
        throw new Error("A API nao retornou a URL de compartilhamento.");
      }

      await copyText(payload.url);

      toast({
        title: "Link copiado",
        description: payload.expiresAt
          ? `Link de acompanhamento copiado (expira em ${new Date(payload.expiresAt).toLocaleString("pt-BR")}).`
          : "Link de acompanhamento copiado para a area de transferencia.",
      });
    } catch (error) {
      if (error instanceof ProductionShareError && error.status === 401) {
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.assign("/login");
        }

        return;
      }

      toast({
        variant: "destructive",
        title: "Nao foi possivel compartilhar",
        description: buildShareErrorMessage(error),
      });
    } finally {
      setSharingId(null);
    }
  };

  const isAdvancingSelected = Boolean(selectedToAdvance && updatingId === selectedToAdvance.id);
  const isManagingSelectedImages = Boolean(selectedForImages && (isLoadingImages || isUploadingImages));

  const productionStatusSummary = useMemo(() => {
    const counts = new Map<string, number>();

    data.forEach((order) => {
      const key = order.productionStatus || "pending";
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [data]);

  const columns = [
    { key: "clientName", header: "Cliente" },
    { key: "description", header: "Descrição" },
    {
      key: "materials",
      header: "Materiais",
      render: (o: EmployeeProduction) => (
        <span className="text-xs text-foreground/80">
          {o.materials.map((m) => `${m.productName} (${m.quantity} ${m.unit})`).join(", ")}
        </span>
      ),
    },
    {
      key: "initialCost",
      header: "Custo Inicial",
      mono: true,
      render: (o: EmployeeProduction) => formatCurrency(o.initialCost),
    },
    {
      key: "productionStatus",
      header: "Status",
      render: (o: EmployeeProduction) => <StatusBadge status={String(o.productionStatus || "pending")} />,
    },
    {
      key: "statuses",
      header: "Etapas ativas",
      render: (o: EmployeeProduction) =>
        o.statuses.length === 0 ? (
          <span className="text-xs text-muted-foreground">Sem etapas ativas.</span>
        ) : (
          <div className="flex flex-wrap gap-1.5 max-w-[360px]">
            {o.statuses.map((status) => (
              <span
                key={status.id}
                className="inline-flex flex-col rounded border border-border bg-secondary/20 px-2 py-1"
                title={status.createdAt ? new Date(status.createdAt).toLocaleString("pt-BR") : ""}
              >
                <span className="text-[11px] font-bold text-foreground leading-tight">{formatStageLabel(status.stageName)}</span>
                <span className="text-[10px] text-muted-foreground leading-tight">{status.teamName || "Equipe nao informada"}</span>
              </span>
            ))}
          </div>
        ),
    },
    { key: "deliveryDate", header: "Entrega", mono: true },
    { key: "installationTeam", header: "Equipe" },
    ...(canCompleteProduction
      ? [
          {
            key: "actions",
            header: "",
            render: (o: EmployeeProduction) => {
              const isSharingCurrent = sharingId === o.id;
              const isAdvancingCurrent = updatingId === o.id;
              const isManagingImagesCurrent =
                selectedForImages?.id === o.id && (isLoadingImages || isUploadingImages);

              return (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={Boolean(sharingId) || Boolean(updatingId) || isLoadingImages || isUploadingImages}
                    onClick={(e) => {
                      e.stopPropagation();
                      openImagesModal(o);
                    }}
                    className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold rounded border border-border text-foreground hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ImagePlus className="h-3 w-3" />
                    {isManagingImagesCurrent ? "IMAGENS..." : "IMAGENS"}
                  </button>

                  <button
                    disabled={Boolean(sharingId) || Boolean(updatingId)}
                    onClick={(e) => {
                      e.stopPropagation();
                      void shareProduction(o);
                    }}
                    className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold rounded border border-primary/30 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Share2 className="h-3 w-3" />
                    {isSharingCurrent ? "GERANDO LINK..." : "COMPARTILHAR PRODUCAO"}
                  </button>

                  <button
                    disabled={Boolean(updatingId) || Boolean(sharingId)}
                    onClick={(e) => {
                      e.stopPropagation();
                      openAdvanceModal(o);
                    }}
                    className="px-2 py-1 text-[11px] font-bold rounded bg-success/20 text-success hover:bg-success/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAdvancingCurrent ? "AVANCANDO..." : "AVANCAR ETAPA"}
                  </button>

                  <button
                    disabled={Boolean(updatingId) || Boolean(sharingId)}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditStatusesModal(o);
                    }}
                    className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold rounded border border-border text-foreground hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Pencil className="h-3 w-3" />
                    EDITAR ETAPAS
                  </button>
                </div>
              );
            },
          },
        ]
      : []),
  ];

  return (
    <DashboardLayout
      title="Produção"
      subtitle={isEmployee ? "Minhas produções por funcionário" : "Acompanhamento de Pedidos"}
      action={canCreateProduction ? (
        <button
          onClick={openCreateModal}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> NOVA PRODUÇÃO
        </button>
      ) : undefined}
    >
      <div className="animate-fade-in space-y-6">
        {modeNotice && (
          <div className="border border-amber-300/50 bg-amber-50 rounded px-3 py-2 text-sm text-amber-900">
            {modeNotice}
          </div>
        )}

        {requestError && (
          <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
            <span>{requestError}</span>
            <button
              onClick={() => void loadProductions()}
              className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
            >
              TENTAR NOVAMENTE
            </button>
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          {productionStatusSummary.map(([status, count]) => (
            <div key={status} className="flex items-center gap-2 px-3 py-1.5 border border-border rounded bg-card text-sm">
              <StatusBadge status={status} />
              <span className="font-mono text-xs text-muted-foreground">{count}</span>
            </div>
          ))}
        </div>
        <DataTable
          columns={columns}
          data={data}
          emptyMessage={isLoading ? "Carregando produções do banco..." : "Nenhuma produção cadastrada no banco."}
        />
      </div>

      {canCreateProduction && (
        <Modal open={modal} onClose={closeModal} title="Nova Produção" width="max-w-5xl">
          <div className="flex max-h-[72dvh] flex-col">
            <div className="space-y-6 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Orcamento aprovado (opcional)"
                as="select"
                value={form.budgetId}
                onChange={(e) => applyApprovedBudgetToForm(e.target.value)}
                options={approvedBudgetsCatalog.map((budget) => ({
                  value: budget.id,
                  label: `#${budget.id} - ${budget.clientName} - ${formatCurrency(Number(budget.totalPrice) || 0)}`,
                }))}
              />
            </div>

            {budgetsError && (
              <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
                <span>{budgetsError}</span>
                <button
                  onClick={() => void loadApprovedBudgetsForForm()}
                  className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
                >
                  TENTAR NOVAMENTE
                </button>
              </div>
            )}

            {!isLoadingBudgets && approvedBudgetsCatalog.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum orcamento aprovado oficialmente encontrado para vinculacao automatica.
              </p>
            )}

            {selectedApprovedBudget && (
              <div className="border border-border rounded p-4 bg-secondary/20">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                  Resumo financeiro do orcamento selecionado
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Custo total</p>
                    <p className="font-mono font-bold text-foreground">{formatCurrency(resolveBudgetTotalCost(selectedApprovedBudget))}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Custos aplicaveis</p>
                    <p className="font-mono font-bold text-foreground">{formatCurrency(resolveBudgetApplicableCost(selectedApprovedBudget))}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Lucro</p>
                    <p className="font-mono font-bold text-foreground">{formatCurrency(resolveBudgetProfit(selectedApprovedBudget))}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Preco final</p>
                    <p className="font-mono font-bold text-primary">{formatCurrency(Number(selectedApprovedBudget.totalPrice) || 0)}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Cliente"
                as="select"
                value={form.clientId}
                onChange={(e) => setForm((current) => ({ ...current, clientId: e.target.value }))}
                options={clientsCatalog.map((client) => ({
                  value: client.id,
                  label: client.companyName ? `${client.name} • ${client.companyName}` : client.name,
                }))}
              />
              <FormField
                label="Prazo de Entrega"
                type="date"
                value={form.deliveryDate}
                onChange={(e) => setForm((current) => ({ ...current, deliveryDate: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Descrição do Projeto"
                as="textarea"
                value={form.description}
                onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
                placeholder="Ex.: Armário planejado para cozinha"
              />
              <div className="space-y-4">
                <FormField
                  label="Equipe"
                  as="select"
                  value={form.installationTeamId}
                  onChange={(e) => setForm((current) => ({ ...current, installationTeamId: e.target.value }))}
                  options={teams.map((team) => ({ value: team.id, label: team.name }))}
                />
                {!isLoadingTeams && teams.length === 0 && (
                  <p className="text-xs text-destructive">Nenhuma equipe cadastrada. Cadastre uma equipe antes de criar a produção.</p>
                )}
                <FormField
                  label="Custo Inicial (R$)"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.initialCost}
                  onChange={(e) => setForm((current) => ({ ...current, initialCost: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-3">
                Materiais que serão usados
              </p>

              {clientsError && (
                <div className="mb-3 border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
                  <span>{clientsError}</span>
                  <button
                    onClick={() => void loadClientsForForm()}
                    className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
                  >
                    TENTAR NOVAMENTE
                  </button>
                </div>
              )}

              {!isLoadingClients && clientsCatalog.length === 0 && (
                <p className="mb-3 text-xs text-destructive">
                  Nenhum cliente cadastrado no banco. Cadastre um cliente antes de criar a producao.
                </p>
              )}

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

              {form.materials.length > 0 && (
                <div className="border border-border rounded mb-3 divide-y divide-border/50">
                  {form.materials.map((item, idx) => (
                    <div key={`${item.productId}-${idx}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span>
                        {item.productName} x {item.quantity} {item.unit}
                      </span>
                      <button
                        onClick={() => removeMaterial(idx)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="flex-1">
                  <FormField
                    label="Produto"
                    as="select"
                    value={newMaterial.productId}
                    onChange={(e) => setNewMaterial((current) => ({ ...current, productId: e.target.value }))}
                    options={productsCatalog.map((product) => ({
                      value: product.id,
                      label: `${product.name} (Saldo: ${product.stockQuantity})`,
                    }))}
                  />
                </div>
                <div className="w-full md:w-28">
                  <FormField
                    label="Quantidade"
                    type="number"
                    min={1}
                    step="1"
                    value={newMaterial.quantity}
                    onChange={(e) => setNewMaterial((current) => ({ ...current, quantity: Number(e.target.value) }))}
                  />
                </div>
                <div className="w-full md:w-28">
                  <FormField
                    label="Unidade"
                    value={newMaterial.unit}
                    onChange={(e) => setNewMaterial((current) => ({ ...current, unit: e.target.value }))}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={addMaterial}
                    disabled={isLoadingProducts || productsCatalog.length === 0}
                    className="px-3 py-2 text-xs font-bold rounded border border-border hover:bg-secondary transition-colors text-foreground disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isLoadingProducts ? "CARREGANDO..." : "ADICIONAR"}
                  </button>
                </div>
              </div>
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <div className="flex justify-between items-center border border-border rounded p-4 bg-secondary/20">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Status Inicial</p>
                <StatusBadge status="pending" />
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Custo Inicial Informado</p>
                <p className="font-mono font-bold text-primary text-lg">{formatCurrency(form.initialCost || 0)}</p>
              </div>
            </div>
            </div>

            <div className="sticky bottom-0 z-10 mt-4 pt-3 border-t border-border bg-card/95 backdrop-blur flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
              <button
                onClick={closeModal}
                className="w-full sm:w-auto px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={() => void saveProduction()}
                disabled={
                  isSaving ||
                  isLoadingTeams ||
                  isLoadingClients ||
                  isLoadingProducts ||
                  isLoadingBudgets ||
                  teams.length === 0 ||
                  clientsCatalog.length === 0 ||
                  productsCatalog.length === 0
                }
                className="w-full sm:w-auto px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSaving ? "Salvando..." : "Criar Produção"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {canCompleteProduction && selectedForImages && (
        <Modal
          open={Boolean(selectedForImages)}
          onClose={closeImagesModal}
          title="Gerenciar Imagens da Producao"
          width="max-w-4xl"
        >
          <div className="space-y-4">
            <div className="rounded border border-border bg-secondary/20 px-3 py-2 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Cliente:</span> {selectedForImages.clientName}
              </p>
              <p>
                <span className="text-muted-foreground">Projeto:</span> {selectedForImages.description}
              </p>
              <p>
                <span className="text-muted-foreground">Status:</span> {statusLabels[selectedForImages.productionStatus]}
              </p>
            </div>

            <div className="rounded border border-border p-4 space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Upload de imagens</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Selecione ate {MAX_IMAGES_PER_REQUEST} arquivos por envio. Limite de {MAX_IMAGE_SIZE_MB}MB por imagem.
                </p>
              </div>

              <input
                ref={imageInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleSelectFiles}
                disabled={isUploadingImages}
                className="block w-full text-sm text-foreground file:mr-3 file:rounded file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-bold hover:file:bg-secondary/80 disabled:opacity-60 disabled:cursor-not-allowed"
              />

              {selectedFiles.length > 0 && (
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {selectedFiles.map((file) => (
                    <li key={`${file.name}-${file.size}-${file.lastModified}`} className="rounded border border-border bg-card px-3 py-2 text-xs">
                      <p className="font-medium text-foreground truncate">{file.name}</p>
                      <p className="text-muted-foreground mt-1">{formatImageSize(file.size)}</p>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    void submitImages();
                  }}
                  disabled={isUploadingImages || !selectedFiles.length}
                  className="px-3 py-1.5 text-xs font-bold rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isUploadingImages ? "ENVIANDO..." : "ENVIAR IMAGENS"}
                </button>

                <button
                  onClick={() => {
                    void loadImagesForProduction(selectedForImages.id);
                  }}
                  disabled={isManagingSelectedImages}
                  className="px-3 py-1.5 text-xs font-bold rounded border border-border hover:bg-secondary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoadingImages ? "ATUALIZANDO..." : "ATUALIZAR LISTA"}
                </button>
              </div>

              {isUploadingImages && (
                <p className="text-xs text-muted-foreground animate-pulse">
                  Enviando {selectedFiles.length} arquivo(s)...
                </p>
              )}
            </div>

            {imagesError && (
              <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {imagesError}
              </div>
            )}

            <div className="rounded border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Galeria interna</p>
                <span className="text-xs text-muted-foreground">{productionImages.length} arquivo(s)</span>
              </div>

              {isLoadingImages ? (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-16 rounded border border-border bg-secondary/40 animate-pulse" />
                  ))}
                </div>
              ) : productionImages.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Nenhuma imagem cadastrada para esta producao.</p>
              ) : (
                <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {productionImages.map((image) => (
                    <li key={image.id} className="rounded border border-border bg-card px-3 py-2">
                      <p className="text-sm font-medium text-foreground truncate">{image.fileName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Enviado em {formatImageDateTime(image.createdAt)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {image.mimeType || "image/*"} - {formatImageSize(image.fileSize)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={closeImagesModal}
                disabled={isUploadingImages}
                className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Fechar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {canCompleteProduction && selectedToAdvance && (
        <Modal
          open={Boolean(selectedToAdvance)}
          onClose={() => closeAdvanceModal()}
          title="Avancar etapa"
          width="max-w-xl"
        >
          <div className="space-y-4">
            <p className="text-sm text-foreground/90">
              Escolha uma etapa existente ou crie uma nova etapa e selecione a equipe responsavel.
            </p>

            <div className="rounded border border-border bg-secondary/20 px-3 py-2 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Cliente:</span> {selectedToAdvance.clientName}
              </p>
              <p>
                <span className="text-muted-foreground">Projeto:</span> {selectedToAdvance.description}
              </p>
              <p>
                <span className="text-muted-foreground">Status resumo:</span> {formatStageLabel(selectedToAdvance.productionStatus)}
              </p>
            </div>

            {statusOptionsError && (
              <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
                <span>{statusOptionsError}</span>
                <button
                  onClick={() => {
                    void loadStatusOptions();
                  }}
                  className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/40 hover:bg-destructive/20"
                >
                  TENTAR NOVAMENTE
                </button>
              </div>
            )}

            <div className="mb-1 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAdvanceMode("existing")}
                className={`px-3 py-1 text-[11px] font-bold rounded border transition-colors ${
                  advanceMode === "existing"
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                Usar etapa existente
              </button>
              <button
                type="button"
                onClick={() => setAdvanceMode("new")}
                className={`px-3 py-1 text-[11px] font-bold rounded border transition-colors ${
                  advanceMode === "new"
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                Criar nova etapa
              </button>
            </div>

            {advanceMode === "existing" ? (
              <FormField
                label="Etapa existente"
                as="select"
                value={advanceStageId}
                onChange={(e) => {
                  setAdvanceStageId(e.target.value);
                  setAdvanceError("");
                }}
                options={statusOptions.map((option) => ({
                  value: option.id,
                  label: `${option.name} (${option.usageCount})`,
                }))}
              />
            ) : (
              <FormField
                label="Nova etapa"
                value={advanceStageName}
                onChange={(e) => {
                  setAdvanceStageName(e.target.value);
                  setAdvanceError("");
                }}
                placeholder="Ex.: Eletrica"
              />
            )}

            <FormField
              label="Equipe responsavel"
              as="select"
              value={advanceTeamId}
              onChange={(e) => {
                setAdvanceTeamId(e.target.value);
                setAdvanceError("");
              }}
              options={teams.map((team) => ({ value: team.id, label: team.name }))}
            />

            {!isLoadingTeams && teams.length === 0 && (
              <p className="text-xs text-destructive">Nenhuma equipe cadastrada. Cadastre uma equipe antes de avancar etapa.</p>
            )}

            {(advanceError || completionError) && (
              <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive space-y-2">
                <p>{advanceError || completionError}</p>

                {completionDetails.length > 0 && (
                  <ul className="list-disc pl-4 space-y-1 text-xs">
                    {completionDetails.map((detail, index) => (
                      <li key={`${detail.productId}-${index}`}>{formatStockDetailMessage(detail)}</li>
                    ))}
                  </ul>
                )}

                {(completionErrorStatus === 500 || completionErrorStatus === 0) && (
                  <div className="pt-1">
                    <button
                      onClick={() => {
                        void confirmAdvanceStage();
                      }}
                      disabled={isAdvancingSelected}
                      className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/40 hover:bg-destructive/20 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      TENTAR NOVAMENTE
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => closeAdvanceModal()}
                disabled={isAdvancingSelected}
                className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void confirmAdvanceStage();
                }}
                disabled={isAdvancingSelected || isLoadingTeams || teams.length === 0}
                className="px-4 py-2 text-sm rounded bg-success text-success-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isAdvancingSelected
                  ? "Avancando..."
                  : "Avancar etapa"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {canCompleteProduction && selectedToEditStatuses && (
        <Modal
          open={Boolean(selectedToEditStatuses)}
          onClose={() => closeEditStatusesModal()}
          title="Editar etapas"
          width="max-w-3xl"
        >
          <div className="space-y-4">
            <p className="text-sm text-foreground/90">
              Defina todas as etapas ativas da producao. Cada linha exige etapa e equipe.
            </p>

            <div className="rounded border border-border bg-secondary/20 px-3 py-2 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Cliente:</span> {selectedToEditStatuses.clientName}
              </p>
              <p>
                <span className="text-muted-foreground">Projeto:</span> {selectedToEditStatuses.description}
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={addStatusEditorRow}
                className="px-3 py-1 text-[11px] font-bold rounded border border-border hover:bg-secondary transition-colors"
              >
                Adicionar etapa
              </button>
            </div>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {statusEditorRows.map((row) => (
                <div key={row.key} className="rounded border border-border p-3 space-y-3 bg-secondary/10">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updateStatusEditorRow(row.key, { mode: "existing" })}
                      className={`px-3 py-1 text-[11px] font-bold rounded border transition-colors ${
                        row.mode === "existing"
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      Etapa existente
                    </button>
                    <button
                      type="button"
                      onClick={() => updateStatusEditorRow(row.key, { mode: "new" })}
                      className={`px-3 py-1 text-[11px] font-bold rounded border transition-colors ${
                        row.mode === "new"
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      Nova etapa
                    </button>
                  </div>

                  {row.mode === "existing" ? (
                    <FormField
                      label="Etapa"
                      as="select"
                      value={row.stageId}
                      onChange={(e) => updateStatusEditorRow(row.key, { stageId: e.target.value })}
                      options={statusOptions.map((option) => ({
                        value: option.id,
                        label: `${option.name} (${option.usageCount})`,
                      }))}
                    />
                  ) : (
                    <FormField
                      label="Nova etapa"
                      value={row.stageName}
                      onChange={(e) => updateStatusEditorRow(row.key, { stageName: e.target.value })}
                      placeholder="Ex.: Eletrica"
                    />
                  )}

                  <FormField
                    label="Equipe"
                    as="select"
                    value={row.teamId}
                    onChange={(e) => updateStatusEditorRow(row.key, { teamId: e.target.value })}
                    options={teams.map((team) => ({ value: team.id, label: team.name }))}
                  />

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeStatusEditorRow(row.key)}
                      className="px-3 py-1 text-[11px] font-bold rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40"
                    >
                      Remover etapa
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {statusEditorError && (
              <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {statusEditorError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => closeEditStatusesModal()}
                disabled={Boolean(updatingId)}
                className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void saveEditedStatuses();
                }}
                disabled={Boolean(updatingId) || isLoadingTeams || teams.length === 0}
                className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {updatingId === selectedToEditStatuses.id ? "Salvando..." : "Salvar etapas"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </DashboardLayout>
  );
};

export default ProductionPage;
