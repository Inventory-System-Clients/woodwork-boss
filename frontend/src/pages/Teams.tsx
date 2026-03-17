import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { FormField } from "@/components/FormField";
import { Employee, listEmployees } from "@/services/employees";
import {
  Team,
  createTeam,
  deleteTeam,
  listTeams,
  updateTeam,
  updateTeamMembers,
} from "@/services/teams";
import { Pencil, Plus, Trash2, Users } from "lucide-react";

interface TeamFormState {
  name: string;
  description: string;
  memberIds: string[];
}

const emptyForm: TeamFormState = {
  name: "",
  description: "",
  memberIds: [],
};

const toNullable = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const memberSummary = (team: Team) => {
  if (!team.members.length) {
    return "Sem membros";
  }

  const names = team.members.map((member) => member.name);
  const firstNames = names.slice(0, 3).join(", ");
  const remaining = names.length - 3;

  return remaining > 0 ? `${firstNames} +${remaining}` : firstNames;
};

const formatDate = (isoDate: string) => {
  if (!isoDate) {
    return "-";
  }

  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("pt-BR");
};

const TeamsPage = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [requestError, setRequestError] = useState("");
  const [formError, setFormError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [form, setForm] = useState<TeamFormState>(emptyForm);

  const employeesByName = useMemo(
    () => [...employees].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [employees],
  );

  const loadData = async () => {
    setIsLoading(true);
    setRequestError("");

    try {
      const [teamsData, employeesData] = await Promise.all([listTeams(), listEmployees()]);
      setTeams(teamsData);
      setEmployees(employeesData);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar equipes.";
      setTeams([]);
      setEmployees([]);
      setRequestError(`Não foi possível carregar equipes: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const refreshEmployeesForSelection = async (selectedIds: string[]) => {
    try {
      const employeesData = await listEmployees();
      const availableIds = new Set(employeesData.map((employee) => employee.id));
      const filteredIds = selectedIds.filter((id) => availableIds.has(id));

      setEmployees(employeesData);
      setForm((current) => ({ ...current, memberIds: filteredIds }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar funcionários para seleção.";
      setFormError(`Não foi possível carregar funcionários para seleção: ${message}`);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
    void refreshEmployeesForSelection([]);
  };

  const openEdit = (team: Team) => {
    const selectedIds = team.members.map((member) => member.employeeId);

    setEditing(team);
    setForm({
      name: team.name,
      description: team.description || "",
      memberIds: selectedIds,
    });
    setFormError("");
    setModalOpen(true);
    void refreshEmployeesForSelection(selectedIds);
  };

  const toggleMember = (employeeId: string) => {
    setForm((current) => ({
      ...current,
      memberIds: current.memberIds.includes(employeeId)
        ? current.memberIds.filter((id) => id !== employeeId)
        : [...current.memberIds, employeeId],
    }));
  };

  const saveTeam = async () => {
    if (!form.name.trim()) {
      setFormError("Informe o nome da equipe.");
      return;
    }

    if (form.memberIds.length === 0) {
      setFormError("Selecione ao menos um funcionário para montar a equipe.");
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      if (editing) {
        await updateTeam(editing.id, {
          name: form.name,
          description: toNullable(form.description),
        });

        await updateTeamMembers(editing.id, form.memberIds);
      } else {
        await createTeam({
          name: form.name,
          description: toNullable(form.description),
          memberIds: form.memberIds,
        });
      }

      closeModal();
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao salvar equipe.";
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const removeTeamById = async (teamId: string) => {
    const confirmed = window.confirm("Deseja excluir esta equipe?");

    if (!confirmed) {
      return;
    }

    setDeletingId(teamId);
    setRequestError("");

    try {
      await deleteTeam(teamId);
      setTeams((current) => current.filter((item) => item.id !== teamId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao excluir equipe.";
      setRequestError(`Não foi possível excluir equipe: ${message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const columns = [
    { key: "name", header: "Equipe" },
    { key: "description", header: "Descrição", render: (item: Team) => item.description || "-" },
    {
      key: "membersCount",
      header: "Membros",
      mono: true,
      render: (item: Team) => item.members.length,
    },
    {
      key: "membersSummary",
      header: "Resumo de Membros",
      className: "max-w-[320px] truncate",
      render: (item: Team) => memberSummary(item),
    },
    {
      key: "updatedAt",
      header: "Atualizado em",
      mono: true,
      render: (item: Team) => formatDate(item.updatedAt),
    },
    {
      key: "actions",
      header: "",
      render: (item: Team) => (
        <div className="flex gap-2">
          <button
            onClick={(event) => {
              event.stopPropagation();
              openEdit(item);
            }}
            className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"
            title="Editar equipe"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              void removeTeamById(item.id);
            }}
            disabled={deletingId === item.id}
            className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
            title="Excluir equipe"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout
      title="Equipes"
      subtitle="Montagem e gestão de membros"
      action={
        <button
          onClick={openNew}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> NOVA EQUIPE
        </button>
      }
    >
      <div className="animate-fade-in space-y-6">
        {requestError && (
          <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
            <span>{requestError}</span>
            <button
              onClick={() => void loadData()}
              className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
            >
              TENTAR NOVAMENTE
            </button>
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded bg-card text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Equipes</span>
            <span className="font-mono text-xs">{teams.length}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded bg-card text-sm">
            <span className="text-muted-foreground">Funcionários disponíveis</span>
            <span className="font-mono text-xs">{employees.length}</span>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={teams}
          emptyMessage={isLoading ? "Carregando equipes..." : "Nenhuma equipe cadastrada."}
        />
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? "Editar Equipe" : "Nova Equipe"}
        width="max-w-3xl"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Nome da Equipe"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ex.: Equipe Alfa"
            />
            <FormField
              label="Descrição"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Ex.: Instalações residenciais"
            />
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">
              Membros da equipe
            </p>

            {employeesByName.length === 0 ? (
              <div className="border border-border rounded px-3 py-4 text-sm text-muted-foreground">
                Nenhum funcionário cadastrado. Cadastre funcionários para montar equipes.
              </div>
            ) : (
              <div className="border border-border rounded divide-y divide-border/50 max-h-64 overflow-y-auto">
                {employeesByName.map((employee) => {
                  const checked = form.memberIds.includes(employee.id);

                  return (
                    <label
                      key={employee.id}
                      className="flex items-start gap-3 px-3 py-2 text-sm hover:bg-secondary/30 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMember(employee.id)}
                        className="mt-0.5 h-4 w-4 rounded border-border"
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{employee.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {employee.position || "Sem cargo"}
                          {!employee.isActive ? " • Inativo" : ""}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border border-border rounded p-3 bg-secondary/20">
            <p className="text-xs text-muted-foreground">Selecionados</p>
            <p className="font-mono text-sm text-foreground">{form.memberIds.length}</p>
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button
              onClick={closeModal}
              className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={() => void saveTeam()}
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

export default TeamsPage;
