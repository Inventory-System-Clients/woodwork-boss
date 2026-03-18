import { useEffect, useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { FormField } from "@/components/FormField";
import {
  INVENTORY_DATA_CHANGED_EVENT,
  type InventoryDataChangedEventDetail,
} from "@/lib/inventory-events";
import { ApiError } from "@/services/api";
import {
  Product,
  createProduct,
  listProducts,
  updateProduct,
} from "@/services/products";
import { Plus, Pencil } from "lucide-react";

interface ProductFormState {
  name: string;
  stockQuantity: number;
  lowStockAlertQuantity: number;
}

const emptyForm: ProductFormState = {
  name: "",
  stockQuantity: 0,
  lowStockAlertQuantity: 0,
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

const buildProductsRequestErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return "Sessão expirada. Redirecionando para login.";
      case 403:
        return "Acesso negado. Apenas admin e gerente podem acessar Produtos.";
      case 404:
        return "Endpoint /api/products nao encontrado no backend. Confirme se a API de produtos foi publicada.";
      case 500:
        return "Erro interno no servidor ao carregar produtos.";
      default:
        return error.message || "Não foi possível carregar produtos.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Não foi possível carregar produtos.";
};

const buildProductsSaveErrorMessage = (error: unknown, isEditing: boolean) => {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return "Dados inválidos. Revise nome, estoque e limite de alerta.";
      case 403:
        return "Acesso negado para alterar produtos.";
      case 404:
        return isEditing ? "Produto não encontrado." : "Registro não encontrado.";
      case 409:
        return "Já existe um produto com os mesmos dados.";
      case 500:
        return "Erro interno no servidor ao salvar o produto.";
      default:
        return error.message || "Não foi possível salvar o produto.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Não foi possível salvar o produto.";
};

const ProductsPage = () => {
  const [data, setData] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [syncNotice, setSyncNotice] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [formError, setFormError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

  const loadProducts = async (search?: string) => {
    setIsLoading(true);
    setRequestError("");

    try {
      const products = await listProducts(search);
      setData(products);
    } catch (error) {
      setData([]);
      setRequestError(buildProductsRequestErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  useEffect(() => {
    const handleInventoryChange = (event: Event) => {
      const detail = (event as CustomEvent<InventoryDataChangedEventDetail>).detail;

      if (!detail) {
        return;
      }

      setSyncNotice("Produtos atualizados automaticamente apos movimentacao de estoque.");
      void loadProducts(activeSearch);
    };

    window.addEventListener(INVENTORY_DATA_CHANGED_EVENT, handleInventoryChange as EventListener);

    return () => {
      window.removeEventListener(INVENTORY_DATA_CHANGED_EVENT, handleInventoryChange as EventListener);
    };
  }, [activeSearch]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setForm({
      name: product.name,
      stockQuantity: product.stockQuantity,
      lowStockAlertQuantity: product.lowStockAlertQuantity,
    });
    setFormError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setFormError("");
    setForm(emptyForm);
  };

  const applySearch = () => {
    const nextSearch = searchInput.trim();
    setActiveSearch(nextSearch);
    void loadProducts(nextSearch);
  };

  const clearSearch = () => {
    setSearchInput("");
    setActiveSearch("");
    void loadProducts();
  };

  const saveProduct = async () => {
    const name = form.name.trim();
    const lowStockAlertQuantity = Math.trunc(Number(form.lowStockAlertQuantity));

    if (!name) {
      setFormError("Informe o nome do produto.");
      return;
    }

    if (!Number.isFinite(lowStockAlertQuantity) || lowStockAlertQuantity < 0) {
      setFormError("Informe um limite de alerta válido (mínimo 0).");
      return;
    }

    if (!editing && (!Number.isFinite(form.stockQuantity) || form.stockQuantity < 0)) {
      setFormError("Informe um estoque inicial válido.");
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      if (editing) {
        await updateProduct(editing.id, {
          name,
          lowStockAlertQuantity,
        });
      } else {
        await createProduct({
          name,
          stockQuantity: Math.trunc(Number(form.stockQuantity)),
          lowStockAlertQuantity,
        });
      }

      closeModal();
      await loadProducts(activeSearch);
    } catch (error) {
      setFormError(buildProductsSaveErrorMessage(error, Boolean(editing)));

      if (error instanceof ApiError && error.status === 404) {
        await loadProducts(activeSearch);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const columns = [
    { key: "name", header: "Produto" },
    { key: "stockQuantity", header: "Estoque Atual", mono: true },
    { key: "lowStockAlertQuantity", header: "Limite Alerta", mono: true },
    {
      key: "stockAlert",
      header: "Situação",
      render: (item: Product) => {
        const isLowStock = item.stockQuantity <= item.lowStockAlertQuantity;

        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
              isLowStock ? "bg-destructive/20 text-destructive" : "bg-success/20 text-success"
            }`}
          >
            {isLowStock ? "Baixo" : "OK"}
          </span>
        );
      },
    },
    {
      key: "createdAt",
      header: "Criado em",
      mono: true,
      render: (item: Product) => formatDateTime(item.createdAt),
    },
    {
      key: "updatedAt",
      header: "Atualizado em",
      mono: true,
      render: (item: Product) => formatDateTime(item.updatedAt),
    },
    {
      key: "actions",
      header: "",
      render: (item: Product) => (
        <div className="flex gap-2">
          <button
            onClick={(event) => {
              event.stopPropagation();
              openEdit(item);
            }}
            className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"
            title="Editar produto"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout
      title="Produtos"
      subtitle="Cadastro remoto e saldo atual no banco"
      action={
        <button
          onClick={openNew}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> NOVO PRODUTO
        </button>
      }
    >
      <div className="animate-fade-in space-y-6">
        {syncNotice && (
          <div className="border border-success/30 bg-success/10 rounded px-3 py-2 text-sm text-success">
            {syncNotice}
          </div>
        )}

        {requestError && (
          <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
            <span>{requestError}</span>
            <button
              onClick={() => void loadProducts(activeSearch)}
              className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
            >
              TENTAR NOVAMENTE
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full md:max-w-sm">
            <FormField
              label="Buscar produto"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Digite parte do nome"
            />
          </div>

          <button
            onClick={applySearch}
            className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
          >
            Buscar
          </button>

          <button
            onClick={clearSearch}
            className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground"
          >
            Limpar
          </button>

          <div className="ml-auto px-3 py-2 rounded border border-border bg-card text-xs font-mono text-muted-foreground">
            {data.length} registro(s)
          </div>
        </div>

        <DataTable
          columns={columns}
          data={data}
          emptyMessage={
            isLoading
              ? "Carregando produtos do banco..."
              : activeSearch
                ? "Nenhum produto encontrado para o filtro informado."
                : "Nenhum produto cadastrado no banco."
          }
          rowHighlight={(item: Product) =>
            item.stockQuantity <= item.lowStockAlertQuantity
              ? "border-l-2 border-l-destructive"
              : ""
          }
        />
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? "Editar Produto" : "Novo Produto"}
      >
        <div className="space-y-4">
          <FormField
            label="Nome"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Nome do produto"
          />

          {editing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Estoque Atual"
                type="number"
                value={String(editing.stockQuantity)}
                disabled
                readOnly
              />
              <FormField
                label="Limite para alerta"
                type="number"
                min={0}
                value={form.lowStockAlertQuantity}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    lowStockAlertQuantity: Number(event.target.value),
                  }))
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Estoque Inicial"
                type="number"
                min={0}
                value={form.stockQuantity}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    stockQuantity: Number(event.target.value),
                  }))
                }
              />
              <FormField
                label="Limite para alerta"
                type="number"
                min={0}
                value={form.lowStockAlertQuantity}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    lowStockAlertQuantity: Number(event.target.value),
                  }))
                }
              />
            </div>
          )}

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={closeModal}
              className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={() => void saveProduct()}
              disabled={isSaving}
              className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSaving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default ProductsPage;
