import { useEffect, useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Modal } from "@/components/Modal";
import { FormField } from "@/components/FormField";
import { clients, products, Order, ProductionMaterial } from "@/data/mockData";
import { Plus, Trash2 } from "lucide-react";

const statuses: Order["productionStatus"][] = ["pending", "cutting", "assembly", "finishing", "quality_check", "delivered"];
const apiBaseUrl = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

const buildApiUrl = (path: string) => `${apiBaseUrl}${path}`;

const normalizeStatus = (status: unknown): Order["productionStatus"] => {
  switch (status) {
    case "pending":
    case "cutting":
    case "assembly":
    case "finishing":
    case "quality_check":
    case "delivered":
      return status;
    default:
      return "pending";
  }
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toStringSafe = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const mapApiMaterial = (value: unknown): ProductionMaterial | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const material = value as Record<string, unknown>;

  return {
    productId: toStringSafe(material.productId ?? material.product_id, ""),
    productName: toStringSafe(material.productName ?? material.product_name, "Material"),
    quantity: toNumber(material.quantity),
    unit: toStringSafe(material.unit, "unidade"),
  };
};

const mapApiOrder = (value: unknown): Order | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  const sourceMaterials = Array.isArray(item.materials) ? item.materials : [];
  const materials = sourceMaterials.map(mapApiMaterial).filter((m): m is ProductionMaterial => Boolean(m));

  return {
    id: String(item.id ?? ""),
    budgetId: toStringSafe(item.budgetId ?? item.budget_id, "") || undefined,
    clientName: toStringSafe(item.clientName ?? item.client_name, "Cliente não informado"),
    description: toStringSafe(item.description, ""),
    productionStatus: normalizeStatus(item.productionStatus ?? item.production_status),
    deliveryDate: toStringSafe(item.deliveryDate ?? item.delivery_date, ""),
    installationTeam: toStringSafe(item.installationTeam ?? item.installation_team, "A definir"),
    initialCost: toNumber(item.initialCost ?? item.initial_cost),
    materials,
  };
};

const parseApiList = (payload: unknown) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const maybeCollection = payload as Record<string, unknown>;
    if (Array.isArray(maybeCollection.items)) {
      return maybeCollection.items;
    }
    if (Array.isArray(maybeCollection.data)) {
      return maybeCollection.data;
    }
  }

  return [];
};

const isHtmlLike = (body: string) => /^\s*</.test(body);

const parseJsonFromResponse = async (response: Response) => {
  const body = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (!body.trim()) {
    return null;
  }

  if (isHtmlLike(body)) {
    throw new Error(
      "A API retornou HTML em vez de JSON. Configure VITE_API_URL com a URL do backend ou proxy /api no Vite.",
    );
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error(
      `Resposta inválida da API (content-type: ${contentType || "desconhecido"}).`,
    );
  }
};

const parseErrorMessage = async (response: Response) => {
  const body = await response.text();

  if (!body.trim()) {
    return `Erro HTTP ${response.status}`;
  }

  if (isHtmlLike(body)) {
    return "A API retornou HTML em vez de JSON. Verifique se o frontend está apontando para o backend correto.";
  }

  try {
    const payload = JSON.parse(body) as unknown;
    if (payload && typeof payload === "object") {
      const body = payload as Record<string, unknown>;
      const message = body.message ?? body.error;
      if (typeof message === "string" && message.trim()) {
        return message;
      }
    }
  } catch {
    // Ignore JSON parse errors and fallback to status text.
  }

  return `Erro HTTP ${response.status}`;
};

const createInitialForm = () => ({
  clientId: "",
  description: "",
  deliveryDate: "",
  installationTeam: "",
  initialCost: 0,
  materials: [] as ProductionMaterial[],
});

const ProductionPage = () => {
  const [data, setData] = useState<Order[]>([]);
  const [modal, setModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(createInitialForm);
  const [newMaterial, setNewMaterial] = useState({ productId: "", quantity: 1 });

  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const loadProductions = async () => {
    setIsLoading(true);
    setRequestError("");

    try {
      const response = await fetch(buildApiUrl("/api/productions"));

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

        const payload = await parseJsonFromResponse(response);
      const list = parseApiList(payload)
        .map(mapApiOrder)
        .filter((o): o is Order => Boolean(o));

      setData(list);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar produções.";
      setRequestError(`Não foi possível carregar dados do banco: ${message}`);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadProductions();
  }, []);

  const addMaterial = () => {
    const product = products.find((p) => p.id === newMaterial.productId);
    const quantity = Number(newMaterial.quantity);

    if (!product || !Number.isFinite(quantity) || quantity <= 0) {
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
            unit: product.unit,
          },
        ],
      };
    });

    setNewMaterial({ productId: "", quantity: 1 });
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
    setForm(createInitialForm());
    setNewMaterial({ productId: "", quantity: 1 });
  };

  const saveProduction = async () => {
    if (
      !form.clientId ||
      !form.description.trim() ||
      !form.deliveryDate ||
      form.initialCost <= 0 ||
      form.materials.length === 0
    ) {
      setFormError("Preencha cliente, descrição, prazo, custo inicial e pelo menos um material.");
      return;
    }

    const client = clients.find((c) => c.id === form.clientId);

    setIsSaving(true);
    setFormError("");

    try {
      const response = await fetch(buildApiUrl("/api/productions"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: form.clientId,
          clientName: client?.name || "Cliente não informado",
          description: form.description.trim(),
          deliveryDate: form.deliveryDate,
          installationTeam: form.installationTeam.trim() || "A definir",
          initialCost: Number(form.initialCost),
          productionStatus: "pending",
          materials: form.materials,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      closeModal();
      await loadProductions();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao salvar produção.";
      setFormError(`Erro ao salvar no banco: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const completeProject = async (orderId: string) => {
    setUpdatingId(orderId);
    setRequestError("");

    try {
      const response = await fetch(buildApiUrl(`/api/productions/${orderId}/complete`), {
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      await loadProductions();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao concluir projeto.";
      setRequestError(`Não foi possível atualizar no banco: ${message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const columns = [
    { key: "clientName", header: "Cliente" },
    { key: "description", header: "Descrição" },
    {
      key: "materials",
      header: "Materiais",
      render: (o: Order) => (
        <span className="text-xs text-foreground/80">
          {o.materials.map((m) => `${m.productName} (${m.quantity} ${m.unit})`).join(", ")}
        </span>
      ),
    },
    {
      key: "initialCost",
      header: "Custo Inicial",
      mono: true,
      render: (o: Order) => formatCurrency(o.initialCost),
    },
    { key: "productionStatus", header: "Status", render: (o: Order) => <StatusBadge status={o.productionStatus} /> },
    { key: "deliveryDate", header: "Entrega", mono: true },
    { key: "installationTeam", header: "Equipe" },
    {
      key: "actions", header: "",
      render: (o: Order) => o.productionStatus !== "delivered" ? (
        <button
          disabled={updatingId === o.id}
          onClick={(e) => {
            e.stopPropagation();
            void completeProject(o.id);
          }}
          className="px-2 py-1 text-[11px] font-bold rounded bg-success/20 text-success hover:bg-success/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {updatingId === o.id ? "SALVANDO..." : "CONCLUIR"}
        </button>
      ) : (
        <span className="text-[11px] text-success font-bold">✓ CONCLUÍDO</span>
      ),
    },
  ];

  return (
    <DashboardLayout
      title="Produção"
      subtitle="Acompanhamento de Pedidos"
      action={
        <button
          onClick={() => setModal(true)}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> NOVA PRODUÇÃO
        </button>
      }
    >
      <div className="animate-fade-in space-y-6">
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

      <Modal open={modal} onClose={closeModal} title="Nova Produção" width="max-w-3xl">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Cliente"
              as="select"
              value={form.clientId}
              onChange={(e) => setForm((current) => ({ ...current, clientId: e.target.value }))}
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
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
                value={form.installationTeam}
                onChange={(e) => setForm((current) => ({ ...current, installationTeam: e.target.value }))}
                placeholder="Ex.: Equipe Alpha"
              />
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

            {form.materials.length > 0 && (
              <div className="border border-border rounded mb-3 divide-y divide-border/50">
                {form.materials.map((item, idx) => (
                  <div key={`${item.productId}-${idx}`} className="flex items-center justify-between px-3 py-2 text-sm">
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

            <div className="flex gap-3">
              <div className="flex-1">
                <FormField
                  label="Material"
                  as="select"
                  value={newMaterial.productId}
                  onChange={(e) => setNewMaterial((current) => ({ ...current, productId: e.target.value }))}
                  options={products.map((p) => ({
                    value: p.id,
                    label: `${p.name} (${p.unit})`,
                  }))}
                />
              </div>
              <div className="w-28">
                <FormField
                  label="Quantidade"
                  type="number"
                  min={1}
                  step="1"
                  value={newMaterial.quantity}
                  onChange={(e) => setNewMaterial((current) => ({ ...current, quantity: Number(e.target.value) }))}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={addMaterial}
                  className="px-3 py-2 text-xs font-bold rounded border border-border hover:bg-secondary transition-colors text-foreground"
                >
                  ADICIONAR
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

          <div className="flex justify-end gap-3">
            <button
              onClick={closeModal}
              className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={() => void saveProduction()}
              disabled={isSaving}
              className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSaving ? "Salvando..." : "Criar Produção"}
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default ProductionPage;
