import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { FormField } from "@/components/FormField";
import { StatusBadge } from "@/components/StatusBadge";
import { ApiError } from "@/services/api";
import type { UserRole } from "@/auth/types";
import {
  Employee,
  createEmployee,
  deleteEmployee,
  listEmployees,
  updateEmployee,
} from "@/services/employees";
import { EmployeeProduction, listProductionsByEmployee } from "@/services/productions";
import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";

interface EmployeeFormState {
  name: string;
  position: string;
  phone: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
}

const emptyForm: EmployeeFormState = {
  name: "",
  position: "",
  phone: "",
  email: "",
  password: "",
  role: "funcionario",
  isActive: true,
};

const toNullable = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeText = (value: string) => value.trim().toLowerCase();

const normalizePhone = (value: string) => value.replace(/\D/g, "");

const formatDeliveryDate = (value: string) => {
  if (!value) {
    return "-";
  }

  if (value.includes("T")) {
    return value.split("T")[0];
  }

  return value;
};

const EmployeesPage = () => {
  const [data, setData] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeFormState>(emptyForm);
  const [formError, setFormError] = useState("");

  const [productionsModalOpen, setProductionsModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeProductions, setEmployeeProductions] = useState<EmployeeProduction[]>([]);
  const [isLoadingEmployeeProductions, setIsLoadingEmployeeProductions] = useState(false);
  const [employeeProductionsError, setEmployeeProductionsError] = useState("");

  const activeCount = useMemo(() => data.filter((item) => item.isActive).length, [data]);

  const loadEmployees = async () => {
    setIsLoading(true);
    setRequestError("");

    try {
      const employees = await listEmployees();
      setData(employees);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar funcionários.";
      setData([]);
      setRequestError(`Não foi possível carregar funcionários: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadEmployees();
  }, []);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setFormError("");
    setForm(emptyForm);
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (employee: Employee) => {
    setEditing(employee);
    setForm({
      name: employee.name,
      position: employee.position || "",
      phone: employee.phone || "",
      email: employee.email,
      password: "",
      role: employee.role,
      isActive: employee.isActive,
    });
    setFormError("");
    setModalOpen(true);
  };

  const loadEmployeeProductions = async (employee: Employee) => {
    setIsLoadingEmployeeProductions(true);
    setEmployeeProductionsError("");

    try {
      const productions = await listProductionsByEmployee(employee.id);
      setEmployeeProductions(productions);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar produções do funcionário.";
      setEmployeeProductions([]);
      setEmployeeProductionsError(`Não foi possível carregar produções: ${message}`);
    } finally {
      setIsLoadingEmployeeProductions(false);
    }
  };

  const openEmployeeProductions = (employee: Employee) => {
    setSelectedEmployee(employee);
    setEmployeeProductions([]);
    setEmployeeProductionsError("");
    setProductionsModalOpen(true);
    void loadEmployeeProductions(employee);
  };

  const closeEmployeeProductionsModal = () => {
    setProductionsModalOpen(false);
    setSelectedEmployee(null);
    setEmployeeProductions([]);
    setEmployeeProductionsError("");
  };

  const saveEmployee = async () => {
    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    const password = form.password.trim();

    if (!name) {
      setFormError("Informe o nome do funcionário.");
      return;
    }

    if (!email) {
      setFormError("Informe o e-mail do funcionário.");
      return;
    }

    if (!editing && password.length < 6) {
      setFormError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    if (editing && password && password.length < 6) {
      setFormError("Se informada, a senha deve ter no mínimo 6 caracteres.");
      return;
    }

    const normalizedEmail = normalizeText(email);
    const normalizedPhone = normalizePhone(phone);

    if (normalizedEmail) {
      const duplicatedEmail = data.some(
        (employee) =>
          employee.id !== editing?.id &&
          Boolean(employee.email) &&
          normalizeText(employee.email || "") === normalizedEmail,
      );

      if (duplicatedEmail) {
        setFormError("Já existe um funcionário com este e-mail.");
        return;
      }
    }

    if (normalizedPhone) {
      const duplicatedPhone = data.some(
        (employee) =>
          employee.id !== editing?.id &&
          Boolean(employee.phone) &&
          normalizePhone(employee.phone || "") === normalizedPhone,
      );

      if (duplicatedPhone) {
        setFormError("Já existe um funcionário com este telefone.");
        return;
      }
    }

    setIsSaving(true);
    setFormError("");

    try {
      if (editing) {
        await updateEmployee(editing.id, {
          name,
          position: toNullable(form.position),
          phone: toNullable(phone),
          email,
          password: password || undefined,
          role: form.role,
          isActive: form.isActive,
        });
      } else {
        await createEmployee({
          name,
          position: toNullable(form.position),
          phone: toNullable(phone),
          email,
          password,
          role: form.role,
          isActive: form.isActive,
        });
      }

      closeModal();
      await loadEmployees();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFormError("Já existe um funcionário com os mesmos dados. Revise nome, e-mail e telefone.");
        void loadEmployees();
        return;
      }

      const message = error instanceof Error ? error.message : "Falha ao salvar funcionário.";
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const removeEmployeeById = async (employeeId: string) => {
    const confirmed = window.confirm("Deseja excluir este funcionário?");

    if (!confirmed) {
      return;
    }

    setDeletingId(employeeId);
    setRequestError("");

    try {
      await deleteEmployee(employeeId);
      setData((current) => current.filter((item) => item.id !== employeeId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao excluir funcionário.";
      setRequestError(`Não foi possível excluir funcionário: ${message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const columns = [
    { key: "name", header: "Nome" },
    { key: "role", header: "Perfil", render: (item: Employee) => item.role },
    { key: "position", header: "Cargo", render: (item: Employee) => item.position || "-" },
    { key: "phone", header: "Telefone", mono: true, render: (item: Employee) => item.phone || "-" },
    { key: "email", header: "E-mail", render: (item: Employee) => item.email || "-" },
    {
      key: "isActive",
      header: "Status",
      render: (item: Employee) => (
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
      render: (item: Employee) => (
        <div className="flex gap-2">
          <button
            onClick={(event) => {
              event.stopPropagation();
              openEmployeeProductions(item);
            }}
            className="p-1 hover:bg-primary/20 rounded text-muted-foreground hover:text-primary"
            title="Minhas produções"
          >
            <ClipboardList className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              openEdit(item);
            }}
            className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"
            title="Editar funcionário"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              void removeEmployeeById(item.id);
            }}
            disabled={deletingId === item.id}
            className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
            title="Excluir funcionário"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  const employeeProductionColumns = [
    { key: "clientName", header: "Cliente" },
    { key: "description", header: "Descrição" },
    {
      key: "productionStatus",
      header: "Status",
      render: (item: EmployeeProduction) => <StatusBadge status={item.productionStatus} />,
    },
    {
      key: "deliveryDate",
      header: "Entrega",
      mono: true,
      render: (item: EmployeeProduction) => formatDeliveryDate(item.deliveryDate),
    },
    { key: "installationTeam", header: "Equipe" },
  ];

  return (
    <DashboardLayout
      title="Funcionários"
      subtitle="Cadastro e gestão da equipe"
      action={
        <button
          onClick={openNew}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> NOVO FUNCIONÁRIO
        </button>
      }
    >
      <div className="animate-fade-in space-y-6">
        {requestError && (
          <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
            <span>{requestError}</span>
            <button
              onClick={() => void loadEmployees()}
              className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
            >
              TENTAR NOVAMENTE
            </button>
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded bg-card text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-mono text-xs">{data.length}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded bg-card text-sm">
            <span className="text-muted-foreground">Ativos</span>
            <span className="font-mono text-xs text-success">{activeCount}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded bg-card text-sm">
            <span className="text-muted-foreground">Inativos</span>
            <span className="font-mono text-xs">{data.length - activeCount}</span>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={data}
          emptyMessage={isLoading ? "Carregando funcionários..." : "Nenhum funcionário cadastrado."}
        />
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? "Editar Funcionário" : "Novo Funcionário"}
      >
        <div className="space-y-4">
          <FormField
            label="Nome"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Nome completo"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Cargo"
              value={form.position}
              onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))}
              placeholder="Ex.: Marceneiro"
            />
            <FormField
              label="Telefone"
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="(00) 00000-0000"
            />
          </div>

          <FormField
            label="E-mail"
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="nome@empresa.com"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Perfil"
              as="select"
              value={form.role}
              onChange={(event) =>
                setForm((current) => ({ ...current, role: event.target.value as UserRole }))
              }
              options={[
                { value: "admin", label: "Admin" },
                { value: "gerente", label: "Gerente" },
                { value: "funcionario", label: "Funcionário" },
              ]}
            />
            <FormField
              label={editing ? "Senha (opcional)" : "Senha"}
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              placeholder={editing ? "Deixe em branco para não alterar" : "Mínimo 6 caracteres"}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              className="h-4 w-4 rounded border-border"
            />
            Funcionário ativo
          </label>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={closeModal}
              className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={() => void saveEmployee()}
              disabled={isSaving}
              className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSaving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={productionsModalOpen}
        onClose={closeEmployeeProductionsModal}
        title={selectedEmployee ? `Minhas Produções • ${selectedEmployee.name}` : "Minhas Produções"}
        width="max-w-5xl"
      >
        <div className="space-y-4">
          {employeeProductionsError && (
            <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
              <span>{employeeProductionsError}</span>
              {selectedEmployee && (
                <button
                  onClick={() => void loadEmployeeProductions(selectedEmployee)}
                  className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
                >
                  TENTAR NOVAMENTE
                </button>
              )}
            </div>
          )}

          <DataTable
            columns={employeeProductionColumns}
            data={employeeProductions}
            emptyMessage={
              isLoadingEmployeeProductions
                ? "Carregando produções do funcionário..."
                : "Este funcionário não possui produções vinculadas às equipes dele."
            }
          />

          <div className="flex justify-end">
            <button
              onClick={closeEmployeeProductionsModal}
              className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground"
            >
              Fechar
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default EmployeesPage;
