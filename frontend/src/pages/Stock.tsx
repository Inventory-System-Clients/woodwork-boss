import { useEffect, useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { FormField } from "@/components/FormField";
import { StatusBadge } from "@/components/StatusBadge";
import {
  INVENTORY_DATA_CHANGED_EVENT,
  dispatchInventoryDataChanged,
  type InventoryDataChangedEventDetail,
} from "@/lib/inventory-events";
import { ApiError } from "@/services/api";
import { Product, listProducts } from "@/services/products";
import {
  ListStockMovementsFilters,
  StockMovement,
  StockMovementConflictError,
  StockMovementType,
  createStockMovement,
  listStockMovements,
} from "@/services/stock";
import { Plus, ArrowUpCircle, ArrowDownCircle } from "lucide-react";

interface StockFormState {
  productId: string;
  movementType: StockMovementType;
  quantity: number;
  unit: string;
  reason: string;
  referenceType: string;
  referenceId: string;
}

const emptyForm: StockFormState = {
  productId: "",
  movementType: "entrada",
  quantity: 1,
  unit: "",
  reason: "",
  referenceType: "",
  referenceId: "",
};

const formatDateTime = (value: string) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("pt-BR");
};

const formatConflictDetails = (error: StockMovementConflictError) => {
  if (error.details.length === 0) {
    return "Estoque insuficiente para concluir a saida.";
  }

  const detail = error.details[0];
  const productName = detail.productName || "Produto";

  return `${productName}: solicitado ${detail.requestedQuantity}, disponivel ${detail.availableStock}.`;
};

const buildStockRequestErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return "Sessao expirada. Redirecionando para login.";
      case 403:
        return "Acesso negado. Apenas admin e gerente podem acessar Estoque.";
      case 404:
        return "Endpoint de estoque nao encontrado no backend. Confirme se /api/stock/movements foi publicado.";
      case 500:
        return "Erro interno no servidor ao carregar movimentacoes.";
      default:
        return error.message || "Nao foi possivel carregar movimentacoes.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel carregar movimentacoes.";
};

const buildStockSaveErrorMessage = (error: unknown) => {
  if (error instanceof StockMovementConflictError) {
    return formatConflictDetails(error);
  }

  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return "Dados invalidos. Revise os campos da movimentacao.";
      case 403:
        return "Acesso negado para registrar movimentacoes.";
      case 404:
        return "Produto nao encontrado.";
      case 409:
        return "Estoque insuficiente para concluir a saida.";
      case 500:
        return "Erro interno no servidor ao registrar movimentacao.";
      default:
        return error.message || "Nao foi possivel registrar a movimentacao.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel registrar a movimentacao.";
};

const StockPage = () => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [requestError, setRequestError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<StockFormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const [total, setTotal] = useState(0);
  const [productFilter, setProductFilter] = useState("");
  const [movementTypeFilter, setMovementTypeFilter] = useState<"" | StockMovementType>("");

  const buildFilters = (): ListStockMovementsFilters => {
    const filters: ListStockMovementsFilters = {
      limit: 50,
      offset: 0,
    };

    if (productFilter.trim()) {
      filters.productId = productFilter.trim();
    }

    if (movementTypeFilter) {
      filters.movementType = movementTypeFilter;
    }

    return filters;
  };

  const loadProductsData = async () => {
    const items = await listProducts();
    setProducts(items);
  };

  const loadMovements = async () => {
    const response = await listStockMovements(buildFilters());
    setMovements(response.data);
    setTotal(response.meta.total);
  };

  const loadPageData = async () => {
    setIsLoading(true);
    setRequestError("");

    try {
      await Promise.all([loadProductsData(), loadMovements()]);
    } catch (error) {
      setProducts([]);
      setMovements([]);
      setTotal(0);
      setRequestError(buildStockRequestErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPageData();
  }, []);

  useEffect(() => {
    const handleInventoryChange = (event: Event) => {
      const detail = (event as CustomEvent<InventoryDataChangedEventDetail>).detail;

      if (!detail) {
        return;
      }

      setSyncNotice("Movimentacoes e saldo atualizados automaticamente.");
      void Promise.all([loadProductsData(), loadMovements()]);
    };

    window.addEventListener(INVENTORY_DATA_CHANGED_EVENT, handleInventoryChange as EventListener);

    return () => {
      window.removeEventListener(INVENTORY_DATA_CHANGED_EVENT, handleInventoryChange as EventListener);
    };
  }, [productFilter, movementTypeFilter]);

  const applyFilters = async () => {
    setIsLoading(true);
    setRequestError("");

    try {
      await loadMovements();
    } catch (error) {
      setMovements([]);
      setTotal(0);
      setRequestError(buildStockRequestErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const clearFilters = () => {
    setProductFilter("");
    setMovementTypeFilter("");

    void (async () => {
      setIsLoading(true);
      setRequestError("");

      try {
        const response = await listStockMovements({ limit: 50, offset: 0 });
        setMovements(response.data);
        setTotal(response.meta.total);
      } catch (error) {
        setMovements([]);
        setTotal(0);
        setRequestError(buildStockRequestErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    })();
  };

  const closeModal = () => {
    setModalOpen(false);
    setForm(emptyForm);
    setFormError("");
  };

  const createMovement = async () => {
    if (!form.productId) {
      setFormError("Selecione o produto.");
      return;
    }

    if (!Number.isFinite(form.quantity) || form.quantity < 1) {
      setFormError("Informe uma quantidade valida (minimo 1).");
      return;
    }

    if (!form.reason.trim()) {
      setFormError("Informe o motivo da movimentacao.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    setSyncNotice("");

    try {
      const created = await createStockMovement({
        productId: form.productId,
        movementType: form.movementType,
        quantity: Math.trunc(form.quantity),
        unit: form.unit,
        reason: form.reason,
        referenceType: form.referenceType,
        referenceId: form.referenceId,
      });

      closeModal();
      await Promise.all([loadProductsData(), loadMovements()]);
      setSyncNotice("Movimentacao registrada com sucesso e estoque atualizado no banco.");
      dispatchInventoryDataChanged({
        source: "stock-movement-create",
        referenceId: created.id,
      });
    } catch (error) {
      setFormError(buildStockSaveErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const columns = [
    {
      key: "createdAt",
      header: "Data",
      mono: true,
      render: (item: StockMovement) => formatDateTime(item.createdAt),
    },
    { key: "productName", header: "Material" },
    {
      key: "movementType",
      header: "Tipo",
      render: (item: StockMovement) => <StatusBadge status={item.movementType} />,
    },
    {
      key: "quantity",
      header: "Qtd.",
      mono: true,
      render: (item: StockMovement) => (
      <span className="flex items-center gap-1.5">
        {item.movementType === "entrada" ? (
          <ArrowUpCircle className="h-3.5 w-3.5 text-success" />
        ) : (
          <ArrowDownCircle className="h-3.5 w-3.5 text-destructive" />
        )}
        {item.quantity}
      </span>
    )
    },
    { key: "currentStock", header: "Saldo", mono: true },
    {
      key: "reason",
      header: "Motivo",
      className: "max-w-[320px] truncate",
      render: (item: StockMovement) => item.reason || "-",
    },
    {
      key: "reference",
      header: "Referencia",
      render: (item: StockMovement) => {
        const type = item.referenceType || "";
        const id = item.referenceId || "";

        if (!type && !id) {
          return "-";
        }

        if (type && id) {
          return `${type} #${id}`;
        }

        return type || id;
      },
    },
  ];

  return (
    <DashboardLayout
      title="Estoque"
      subtitle="Movimentacoes persistidas no banco"
      action={
        <button
          onClick={() => {
            setFormError("");
            setModalOpen(true);
          }}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> NOVA MOVIMENTAÇÃO
        </button>
      }
    >
      <div className="animate-fade-in space-y-6">
        {requestError && (
          <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
            <span>{requestError}</span>
            <button
              onClick={() => void loadPageData()}
              className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
            >
              TENTAR NOVAMENTE
            </button>
          </div>
        )}

        {syncNotice && (
          <div className="mb-4 border border-success/30 bg-success/10 rounded px-3 py-2 text-sm text-success">
            {syncNotice}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FormField
            label="Filtrar por produto"
            as="select"
            value={productFilter}
            onChange={(event) => setProductFilter(event.target.value)}
            options={products.map((product) => ({
              value: product.id,
              label: `${product.name} (Saldo: ${product.stockQuantity})`,
            }))}
          />

          <FormField
            label="Filtrar por tipo"
            as="select"
            value={movementTypeFilter}
            onChange={(event) =>
              setMovementTypeFilter(event.target.value as "" | StockMovementType)
            }
            options={[
              { value: "entrada", label: "Entrada" },
              { value: "saida", label: "Saida" },
            ]}
          />

          <div className="flex items-end gap-2">
            <button
              onClick={() => void applyFilters()}
              className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
            >
              Aplicar
            </button>
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground"
            >
              Limpar
            </button>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded bg-card text-sm">
            <span className="text-muted-foreground">Total no banco</span>
            <span className="font-mono text-xs">{total}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded bg-card text-sm">
            <span className="text-muted-foreground">Exibidos</span>
            <span className="font-mono text-xs">{movements.length}</span>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={movements}
          emptyMessage={
            isLoading
              ? "Carregando movimentacoes do banco..."
              : "Nenhuma movimentacao encontrada para os filtros informados."
          }
        />
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title="Nova Movimentacao de Estoque"
      >
        <div className="space-y-4">
          <FormField
            label="Produto"
            as="select"
            value={form.productId}
            onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))}
            options={products.map((product) => ({
              value: product.id,
              label: `${product.name} (Saldo: ${product.stockQuantity})`,
            }))}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Tipo"
              as="select"
              value={form.movementType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  movementType: event.target.value as StockMovementType,
                }))
              }
              options={[
                { value: "entrada", label: "Entrada" },
                { value: "saida", label: "Saida" },
              ]}
            />

            <FormField
              label="Quantidade"
              type="number"
              min={1}
              value={form.quantity}
              onChange={(event) =>
                setForm((current) => ({ ...current, quantity: Number(event.target.value) }))
              }
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Unidade (opcional)"
              value={form.unit}
              onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))}
              placeholder="Ex.: unidade"
            />

            <FormField
              label="Motivo"
              value={form.reason}
              onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
              placeholder="Ex.: compra de reposicao"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Tipo de referencia (opcional)"
              value={form.referenceType}
              onChange={(event) =>
                setForm((current) => ({ ...current, referenceType: event.target.value }))
              }
              placeholder="Ex.: ordem_producao"
            />

            <FormField
              label="ID de referencia (opcional)"
              value={form.referenceId}
              onChange={(event) =>
                setForm((current) => ({ ...current, referenceId: event.target.value }))
              }
              placeholder="Ex.: op-2026-001"
            />
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={closeModal}
              className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={() => void createMovement()}
              disabled={isSaving}
              className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSaving ? "Registrando..." : "Registrar"}
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default StockPage;
