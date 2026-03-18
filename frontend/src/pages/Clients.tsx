import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { FormField } from "@/components/FormField";
import { ApiError } from "@/services/api";
import {
  Client,
  CreateClientInput,
  ListClientsFilters,
  createClient,
  deleteClient,
  getClientById,
  listClients,
  updateClient,
} from "@/services/clients";
import { Plus, Pencil, Trash2 } from "lucide-react";

type ClientStatusFilter = "all" | "active" | "inactive";

interface ClientFormState {
  name: string;
  companyName: string;
  document: string;
  contactName: string;
  email: string;
  phone: string;
  secondaryPhone: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  notes: string;
  isActive: boolean;
  metadataText: string;
}

const emptyForm: ClientFormState = {
  name: "",
  companyName: "",
  document: "",
  contactName: "",
  email: "",
  phone: "",
  secondaryPhone: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  postalCode: "",
  notes: "",
  isActive: true,
  metadataText: "{}",
};

const toNullable = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const toMetadataText = (metadata: Record<string, unknown>) => {
  try {
    if (Object.keys(metadata).length === 0) {
      return "{}";
    }

    return JSON.stringify(metadata, null, 2);
  } catch {
    return "{}";
  }
};

const toFormState = (client: Client): ClientFormState => ({
  name: client.name,
  companyName: client.companyName || "",
  document: client.document || "",
  contactName: client.contactName || "",
  email: client.email || "",
  phone: client.phone || "",
  secondaryPhone: client.secondaryPhone || "",
  street: client.street || "",
  number: client.number || "",
  complement: client.complement || "",
  neighborhood: client.neighborhood || "",
  city: client.city || "",
  state: client.state || "",
  postalCode: client.postalCode || "",
  notes: client.notes || "",
  isActive: client.isActive,
  metadataText: toMetadataText(client.metadata),
});

const parseMetadata = (value: string): Record<string, unknown> => {
  const trimmed = value.trim();

  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Metadata deve ser um objeto JSON valido.");
    }

    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("Metadata deve ser um objeto JSON valido.");
  }
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

const buildClientsRequestErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return "Sessao expirada. Redirecionando para login.";
      case 403:
        return "Acesso negado. Somente admin e gerente podem acessar Clientes.";
      case 404:
        return "Endpoint /api/clients nao encontrado no backend.";
      case 500:
        return "Erro interno no servidor ao carregar clientes.";
      default:
        return error.message || "Nao foi possivel carregar clientes.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel carregar clientes.";
};

const buildClientDetailErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 403:
        return "Acesso negado para visualizar os dados completos do cliente.";
      case 404:
        return "Cliente nao encontrado.";
      case 500:
        return "Erro interno no servidor ao buscar detalhes do cliente.";
      default:
        return error.message || "Nao foi possivel carregar os detalhes do cliente.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel carregar os detalhes do cliente.";
};

const buildClientSaveErrorMessage = (error: unknown, isEditing: boolean) => {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return "Erro de validacao. Revise os dados informados.";
      case 403:
        return "Acesso negado para alterar clientes.";
      case 404:
        return isEditing ? "Cliente nao encontrado." : "Registro nao encontrado.";
      case 409:
        return "E-mail ou documento ja esta em uso por outro cliente.";
      case 500:
        return "Erro interno no servidor ao salvar cliente.";
      default:
        return error.message || "Nao foi possivel salvar o cliente.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel salvar o cliente.";
};

const buildClientDeleteErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 403:
        return "Acesso negado para excluir clientes.";
      case 404:
        return "Cliente nao encontrado.";
      case 500:
        return "Erro interno no servidor ao excluir cliente.";
      default:
        return error.message || "Nao foi possivel excluir o cliente.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel excluir o cliente.";
};

const ClientsPage = () => {
  const [data, setData] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientFormState>(emptyForm);
  const [formError, setFormError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>("all");

  const activeCount = useMemo(() => data.filter((item) => item.isActive).length, [data]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 450);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  const buildCurrentFilters = useCallback((): ListClientsFilters => {
    const filters: ListClientsFilters = {};

    if (debouncedSearch) {
      filters.search = debouncedSearch;
    }

    if (statusFilter !== "all") {
      filters.isActive = statusFilter === "active";
    }

    return filters;
  }, [debouncedSearch, statusFilter]);

  const loadClients = useCallback(async () => {
    setIsLoading(true);
    setRequestError("");

    try {
      const clients = await listClients(buildCurrentFilters());
      setData(clients);
    } catch (error) {
      setData([]);
      setRequestError(buildClientsRequestErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [buildCurrentFilters]);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setIsLoadingDetail(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = async (client: Client) => {
    setEditing(client);
    setForm(toFormState(client));
    setFormError("");
    setModalOpen(true);
    setIsLoadingDetail(true);

    try {
      const detailedClient = await getClientById(client.id);
      setEditing(detailedClient);
      setForm(toFormState(detailedClient));
    } catch (error) {
      setFormError(buildClientDetailErrorMessage(error));

      if (error instanceof ApiError && error.status === 404) {
        await loadClients();
      }
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const saveClient = async () => {
    const name = form.name.trim();
    const email = form.email.trim();

    if (!name) {
      setFormError("Informe o nome do cliente.");
      return;
    }

    if (email && !isValidEmail(email)) {
      setFormError("Informe um e-mail valido.");
      return;
    }

    let metadata: Record<string, unknown>;

    try {
      metadata = parseMetadata(form.metadataText);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Metadata invalida.");
      return;
    }

    const payload: CreateClientInput = {
      name,
      companyName: toNullable(form.companyName),
      document: toNullable(form.document),
      contactName: toNullable(form.contactName),
      email: toNullable(email),
      phone: toNullable(form.phone),
      secondaryPhone: toNullable(form.secondaryPhone),
      street: toNullable(form.street),
      number: toNullable(form.number),
      complement: toNullable(form.complement),
      neighborhood: toNullable(form.neighborhood),
      city: toNullable(form.city),
      state: toNullable(form.state),
      postalCode: toNullable(form.postalCode),
      notes: toNullable(form.notes),
      isActive: form.isActive,
      metadata,
    };

    setIsSaving(true);
    setFormError("");

    try {
      if (editing) {
        await updateClient(editing.id, payload);
      } else {
        await createClient(payload);
      }

      closeModal();
      await loadClients();
    } catch (error) {
      setFormError(buildClientSaveErrorMessage(error, Boolean(editing)));

      if (error instanceof ApiError && error.status === 404) {
        await loadClients();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const removeClientById = async (clientId: string) => {
    const confirmed = window.confirm("Deseja excluir este cliente permanentemente?");

    if (!confirmed) {
      return;
    }

    setDeletingId(clientId);
    setRequestError("");

    try {
      await deleteClient(clientId);
      setData((current) => current.filter((item) => item.id !== clientId));
    } catch (error) {
      setRequestError(buildClientDeleteErrorMessage(error));

      if (error instanceof ApiError && error.status === 404) {
        setData((current) => current.filter((item) => item.id !== clientId));
      }
    } finally {
      setDeletingId(null);
    }
  };

  const clearSearch = () => {
    setSearchInput("");
  };

  const columns = [
    { key: "name", header: "Nome" },
    {
      key: "companyName",
      header: "Empresa",
      render: (item: Client) => item.companyName || "-",
    },
    {
      key: "document",
      header: "Documento",
      mono: true,
      render: (item: Client) => item.document || "-",
    },
    {
      key: "contactName",
      header: "Contato",
      render: (item: Client) => item.contactName || "-",
    },
    {
      key: "phone",
      header: "Telefone",
      mono: true,
      render: (item: Client) => item.phone || "-",
    },
    {
      key: "email",
      header: "E-mail",
      render: (item: Client) => item.email || "-",
    },
    {
      key: "cityState",
      header: "Cidade/UF",
      render: (item: Client) => {
        if (!item.city && !item.state) {
          return "-";
        }

        if (!item.city) {
          return item.state;
        }

        if (!item.state) {
          return item.city;
        }

        return `${item.city}/${item.state}`;
      },
    },
    {
      key: "isActive",
      header: "Status",
      render: (item: Client) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
            item.isActive ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"
          }`}
        >
          {item.isActive ? "Ativo" : "Inativo"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (item: Client) => (
        <div className="flex gap-2">
          <button
            onClick={(event) => {
              event.stopPropagation();
              void openEdit(item);
            }}
            className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"
            title="Editar cliente"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              void removeClientById(item.id);
            }}
            disabled={deletingId === item.id}
            className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
            title="Excluir cliente"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout
      title="Clientes"
      subtitle="Cadastro persistido no banco via API"
      action={
        <button
          onClick={openNew}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> NOVO CLIENTE
        </button>
      }
    >
      <div className="animate-fade-in space-y-6">
        {requestError && (
          <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
            <span>{requestError}</span>
            <button
              onClick={() => void loadClients()}
              className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
            >
              TENTAR NOVAMENTE
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full md:max-w-sm space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Buscar cliente
            </label>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Nome, empresa, documento, e-mail ou telefone"
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            />
          </div>

          <div className="w-full md:w-52 space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ClientStatusFilter)}
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            >
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </div>

          <button
            onClick={clearSearch}
            className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground"
          >
            Limpar busca
          </button>

          <div className="ml-auto flex gap-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded border border-border bg-card text-xs">
              <span className="text-muted-foreground">Total</span>
              <span className="font-mono">{data.length}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded border border-border bg-card text-xs">
              <span className="text-muted-foreground">Ativos</span>
              <span className="font-mono text-success">{activeCount}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded border border-border bg-card text-xs">
              <span className="text-muted-foreground">Inativos</span>
              <span className="font-mono">{data.length - activeCount}</span>
            </div>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={data}
          emptyMessage={
            isLoading
              ? "Carregando clientes do banco..."
              : debouncedSearch || statusFilter !== "all"
                ? "Nenhum cliente encontrado para os filtros informados."
                : "Nenhum cliente cadastrado no banco."
          }
          rowHighlight={(item: Client) => (item.isActive ? "" : "opacity-80")}
        />
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? "Editar Cliente" : "Novo Cliente"}
        width="max-w-6xl"
      >
        <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
          {isLoadingDetail && (
            <div className="border border-border rounded px-3 py-2 text-xs text-muted-foreground bg-secondary/40">
              Atualizando dados mais recentes do cliente...
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Nome"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Nome do cliente"
            />
            <FormField
              label="Empresa"
              value={form.companyName}
              onChange={(event) =>
                setForm((current) => ({ ...current, companyName: event.target.value }))
              }
              placeholder="Razao social"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
              label="Documento"
              value={form.document}
              onChange={(event) => setForm((current) => ({ ...current, document: event.target.value }))}
              placeholder="CPF/CNPJ"
            />
            <FormField
              label="Contato"
              value={form.contactName}
              onChange={(event) =>
                setForm((current) => ({ ...current, contactName: event.target.value }))
              }
              placeholder="Nome do contato"
            />
            <FormField
              label="E-mail"
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="contato@empresa.com"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Telefone"
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="(00) 00000-0000"
            />
            <FormField
              label="Telefone secundario"
              value={form.secondaryPhone}
              onChange={(event) =>
                setForm((current) => ({ ...current, secondaryPhone: event.target.value }))
              }
              placeholder="(00) 00000-0000"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <FormField
                label="Rua"
                value={form.street}
                onChange={(event) => setForm((current) => ({ ...current, street: event.target.value }))}
                placeholder="Rua/Avenida"
              />
            </div>
            <FormField
              label="Numero"
              value={form.number}
              onChange={(event) => setForm((current) => ({ ...current, number: event.target.value }))}
              placeholder="123"
            />
            <FormField
              label="Complemento"
              value={form.complement}
              onChange={(event) => setForm((current) => ({ ...current, complement: event.target.value }))}
              placeholder="Sala, bloco..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <FormField
              label="Bairro"
              value={form.neighborhood}
              onChange={(event) =>
                setForm((current) => ({ ...current, neighborhood: event.target.value }))
              }
              placeholder="Bairro"
            />
            <FormField
              label="Cidade"
              value={form.city}
              onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
              placeholder="Cidade"
            />
            <FormField
              label="Estado"
              value={form.state}
              onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))}
              placeholder="UF"
            />
            <FormField
              label="CEP"
              value={form.postalCode}
              onChange={(event) => setForm((current) => ({ ...current, postalCode: event.target.value }))}
              placeholder="00000-000"
            />
          </div>

          <FormField
            label="Observacoes"
            as="textarea"
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Observacoes adicionais"
          />

          <FormField
            label="Metadata (JSON)"
            as="textarea"
            value={form.metadataText}
            onChange={(event) =>
              setForm((current) => ({ ...current, metadataText: event.target.value }))
            }
            placeholder='{"origem":"indicacao"}'
          />

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) =>
                setForm((current) => ({ ...current, isActive: event.target.checked }))
              }
              className="h-4 w-4 rounded border-border"
            />
            Cliente ativo
          </label>

          {editing && (
            <p className="text-xs text-muted-foreground">
              Criado em: {formatDateTime(editing.createdAt)} | Atualizado em: {formatDateTime(editing.updatedAt)}
            </p>
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
              onClick={() => void saveClient()}
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

export default ClientsPage;
