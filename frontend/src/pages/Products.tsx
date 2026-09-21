import { useEffect, useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { FormField } from "@/components/FormField";
import { ApiError } from "@/services/api";
import { Product, createProduct, listProducts, updateProduct } from "@/services/products";
import { Plus, Pencil } from "lucide-react";

const buildProductsRequestErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return "Sessão expirada. Redirecionando para login.";
      case 403:
        return "Acesso negado. Apenas admin podem acessar Materiais.";
      case 500:
        return "Erro interno no servidor ao carregar materiais.";
      default:
        return error.message || "Não foi possível carregar materiais.";
    }
  }

  return error instanceof Error ? error.message : "Não foi possível carregar materiais.";
};

const buildProductsSaveErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return "Dados inválidos. Revise o nome e o fornecedor do material.";
      case 403:
        return "Acesso negado para alterar materiais.";
      case 404:
        return "Material não encontrado.";
      case 409:
        return "Já existe um material com este nome.";
      case 500:
        return "Erro interno no servidor ao salvar o material.";
      default:
        return error.message || "Não foi possível salvar o material.";
    }
  }

  return error instanceof Error ? error.message : "Não foi possível salvar o material.";
};

const ProductsPage = () => {
  const [data, setData] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [requestError, setRequestError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [name, setName] = useState("");
  const [supplier, setSupplier] = useState("");
  const [formError, setFormError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

  const loadProducts = async (search?: string) => {
    setIsLoading(true);
    setRequestError("");

    try {
      setData(await listProducts(search));
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

  const openNew = () => {
    setEditing(null);
    setName("");
    setSupplier("");
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setName(product.name);
    setSupplier(product.supplier || "");
    setFormError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setName("");
    setSupplier("");
    setFormError("");
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
    const trimmedName = name.trim();

    if (!trimmedName) {
      setFormError("Informe o nome do material.");
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      if (editing) {
        await updateProduct(editing.id, { name: trimmedName, supplier: supplier.trim() || null });
      } else {
        await createProduct({ name: trimmedName, supplier: supplier.trim() || null });
      }

      closeModal();
      await loadProducts(activeSearch);
    } catch (error) {
      setFormError(buildProductsSaveErrorMessage(error));

      if (error instanceof ApiError && error.status === 404) {
        await loadProducts(activeSearch);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const columns = [
    { key: "name", header: "Material" },
    { key: "supplier", header: "Fornecedor (marca)", render: (item: Product) => item.supplier || "-" },
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
            title="Editar material"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout
      title="Materiais"
      subtitle="Materiais usados nas produções e seus fornecedores"
      action={
        <button
          onClick={openNew}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> NOVO MATERIAL
        </button>
      }
    >
      <div className="animate-fade-in space-y-6">
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
              label="Buscar material"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Digite parte do nome ou da marca"
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
              ? "Carregando materiais..."
              : activeSearch
                ? "Nenhum material encontrado para o filtro informado."
                : "Nenhum material cadastrado."
          }
        />
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? "Editar Material" : "Novo Material"}>
        <div className="space-y-4">
          <FormField
            label="Nome"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nome do material"
          />

          <FormField
            label="Fornecedor (marca)"
            value={supplier}
            onChange={(event) => setSupplier(event.target.value)}
            placeholder="Ex.: Duratex, Blum (opcional)"
          />

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
