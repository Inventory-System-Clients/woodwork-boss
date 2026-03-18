import { useEffect, useRef, useState } from "react";
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
import {
  advanceProductionStatus,
  CompleteProductionError,
  CompleteProductionStockDetail,
  EmployeeProduction,
  ProductionShareError,
  ProductionStatus,
  createProductionShareLink,
  createProduction,
  formatStockDetailMessage,
  listProductions,
} from "@/services/productions";
import { Plus, Share2, Trash2 } from "lucide-react";

const statuses: ProductionStatus[] = ["pending", "cutting", "assembly", "finishing", "quality_check", "approved", "delivered"];
const statusLabels: Record<ProductionStatus, string> = {
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

const isFinalizedStatus = (status: ProductionStatus) => status === "delivered";

const getNextStatus = (status: ProductionStatus): ProductionStatus | null => {
  const currentIndex = statuses.indexOf(status);

  if (currentIndex < 0 || currentIndex >= statuses.length - 1) {
    return null;
  }

  return statuses[currentIndex + 1];
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

interface TeamOption {
  id: string;
  name: string;
}

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
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [clientsError, setClientsError] = useState("");
  const [productsError, setProductsError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(createInitialForm);
  const [newMaterial, setNewMaterial] = useState({ productId: "", quantity: 1, unit: "unidade" });
  const [selectedToComplete, setSelectedToComplete] = useState<EmployeeProduction | null>(null);
  const [completionError, setCompletionError] = useState("");
  const [completionErrorStatus, setCompletionErrorStatus] = useState<number | null>(null);
  const [completionDetails, setCompletionDetails] = useState<CompleteProductionStockDetail[]>([]);
  const completionInFlightRef = useRef<string | null>(null);

  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
  }, [canCreateProduction, isEmployee, user?.id]);

  useEffect(() => {
    if (!modal) {
      return;
    }

    void loadProductsForForm();
    void loadClientsForForm();
  }, [modal, canCreateProduction]);

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

  const openCompleteModal = (order: EmployeeProduction) => {
    if (updatingId || isFinalizedStatus(order.productionStatus)) {
      return;
    }

    clearCompletionFeedback();
    setSelectedToComplete(order);
  };

  const closeCompleteModal = (force = false) => {
    if (!force && updatingId) {
      return;
    }

    setSelectedToComplete(null);
    clearCompletionFeedback();
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

  const completeProject = async () => {
    if (!canCompleteProduction || !selectedToComplete) {
      return;
    }

    const orderId = selectedToComplete.id;
    const currentStatus = selectedToComplete.productionStatus;
    const nextStatus = getNextStatus(currentStatus);

    if (!nextStatus) {
      toast({
        title: "Fluxo finalizado",
        description: "Esta producao ja esta na etapa Entregue.",
      });
      closeCompleteModal(true);
      return;
    }

    if (completionInFlightRef.current) {
      return;
    }

    completionInFlightRef.current = orderId;

    setRequestError("");
    clearCompletionFeedback();
    setUpdatingId(orderId);

    if (isMockMode) {
      setData((current) =>
        current.map((order) =>
          order.id === orderId ? { ...order, productionStatus: nextStatus } : order,
        ),
      );
      closeCompleteModal(true);
      toast({
        title: "Etapa avancada",
        description: `Status atualizado para ${statusLabels[nextStatus]}.`,
      });
      completionInFlightRef.current = null;
      setUpdatingId(null);
      return;
    }

    try {
      const updated = await advanceProductionStatus(orderId);

      setData((current) =>
        current.map((order) =>
          order.id === orderId ? updated : order,
        ),
      );

      await loadProductions();

      if (updated.productionStatus === "approved" && currentStatus !== "approved") {
        dispatchInventoryRefresh({
          productionId: orderId,
          source: "production-advance-status",
          status: "approved",
          materials: updated.materials.length > 0 ? updated.materials : selectedToComplete.materials,
        });
      }

      closeCompleteModal(true);
      toast({
        title: "Etapa avancada",
        description: `Status atualizado para ${statusLabels[updated.productionStatus]}.`,
      });
    } catch (error) {
      if (error instanceof CompleteProductionError) {
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

  const isCompletingSelected = Boolean(selectedToComplete && updatingId === selectedToComplete.id);
  const selectedNextStatus = selectedToComplete
    ? getNextStatus(selectedToComplete.productionStatus)
    : null;

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
      render: (o: EmployeeProduction) => <StatusBadge status={o.productionStatus} />,
    },
    { key: "deliveryDate", header: "Entrega", mono: true },
    { key: "installationTeam", header: "Equipe" },
    ...(canCompleteProduction
      ? [
          {
            key: "actions",
            header: "",
            render: (o: EmployeeProduction) => {
              const nextStatus = getNextStatus(o.productionStatus);
              const isSharingCurrent = sharingId === o.id;
              const isAdvancingCurrent = updatingId === o.id;

              return (
                <div className="flex flex-wrap items-center gap-2">
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

                  {!isFinalizedStatus(o.productionStatus) && nextStatus ? (
                    <button
                      disabled={Boolean(updatingId) || Boolean(sharingId)}
                      onClick={(e) => {
                        e.stopPropagation();
                        openCompleteModal(o);
                      }}
                      className="px-2 py-1 text-[11px] font-bold rounded bg-success/20 text-success hover:bg-success/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isAdvancingCurrent ? "AVANCANDO..." : `AVANCAR ETAPA (${statusLabels[nextStatus].toUpperCase()})`}
                    </button>
                  ) : (
                    <span className="text-[11px] text-success font-bold">✓ ENTREGUE</span>
                  )}
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
          {statuses.map((s) => {
            const count = data.filter((o) => o.productionStatus === s).length;
            return (
              <div key={s} className="flex items-center gap-2 px-3 py-1.5 border border-border rounded bg-card text-sm">
                <StatusBadge status={s} />
                <span className="font-mono text-xs text-muted-foreground">{count}</span>
              </div>
            );
          })}
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

      {canCompleteProduction && selectedToComplete && (
        <Modal
          open={Boolean(selectedToComplete)}
          onClose={() => closeCompleteModal()}
          title="Avancar Etapa da Producao"
          width="max-w-xl"
        >
          <div className="space-y-4">
            <p className="text-sm text-foreground/90">
              O backend segue o fluxo oficial de etapas. Ao atingir Aprovado, o estoque e baixado automaticamente.
            </p>

            <div className="rounded border border-border bg-secondary/20 px-3 py-2 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Cliente:</span> {selectedToComplete.clientName}
              </p>
              <p>
                <span className="text-muted-foreground">Projeto:</span> {selectedToComplete.description}
              </p>
              <p>
                <span className="text-muted-foreground">Status atual:</span> {statusLabels[selectedToComplete.productionStatus]}
              </p>
              <p>
                <span className="text-muted-foreground">Proxima etapa:</span>{" "}
                {selectedNextStatus ? statusLabels[selectedNextStatus] : "Fluxo finalizado"}
              </p>
            </div>

            {completionError && (
              <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive space-y-2">
                <p>{completionError}</p>

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
                        void completeProject();
                      }}
                      disabled={isCompletingSelected}
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
                onClick={() => closeCompleteModal()}
                disabled={isCompletingSelected}
                className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void completeProject();
                }}
                disabled={isCompletingSelected || !selectedNextStatus}
                className="px-4 py-2 text-sm rounded bg-success text-success-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isCompletingSelected
                  ? "Avancando..."
                  : selectedNextStatus
                    ? `Avancar para ${statusLabels[selectedNextStatus]}`
                    : "Fluxo finalizado"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </DashboardLayout>
  );
};

export default ProductionPage;
