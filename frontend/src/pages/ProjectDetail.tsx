import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Plus, Trash2, Undo2 } from "lucide-react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { Modal } from "@/components/Modal";
import { StatCard } from "@/components/StatCard";
import { toast } from "@/components/ui/use-toast";
import {
  addProjectCost,
  deleteProjectCost,
  formatCurrency,
  formatDateOnly,
  getProject,
  markProjectCostPaid,
  markProjectCostUnpaid,
  PROJECT_STATUSES,
  updateProject,
  type ProjectCost,
  type ProjectDetail,
  type ProjectStatus,
  type UpdateProjectInput,
} from "@/services/projects";
import { formatMinutes } from "@/services/workHours";
import { ProjectStatusBadge } from "./Projects";

const todayLocal = () => new Date().toLocaleDateString("en-CA");

const emptyCostForm = { description: "", amount: "", supplier: "", isPaid: "nao", paidAt: todayLocal() };

interface EditableTextProps {
  label: string;
  value: string;
  type?: "text" | "date";
  display?: string;
  onSave: (value: string) => Promise<void>;
}

/** Shows the value as text; one click turns it into an input that saves on Enter/blur. */
function EditableText({ label, value, type = "text", display, onSave }: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = async () => {
    setIsEditing(false);

    if (draft.trim() === value) {
      return;
    }

    try {
      await onSave(draft.trim());
    } catch {
      setDraft(value);
    }
  };

  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{label}</p>
      {isEditing ? (
        <input
          autoFocus
          type={type}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(value);
              setIsEditing(false);
            }
          }}
          className="w-full px-2 py-1 bg-secondary/50 border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      ) : (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          title="Clique para editar"
          className="text-left text-sm sm:text-base font-medium text-foreground hover:bg-secondary/60 rounded px-1 -mx-1 py-0.5 transition-colors"
        >
          {display ?? (value || "—")}
        </button>
      )}
    </div>
  );
}

const ProjectDetailPage = () => {
  const { id = "" } = useParams();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCostModalOpen, setIsCostModalOpen] = useState(false);
  const [costForm, setCostForm] = useState(emptyCostForm);
  const [isSavingCost, setIsSavingCost] = useState(false);
  const [payingCost, setPayingCost] = useState<ProjectCost | null>(null);
  const [payDate, setPayDate] = useState(todayLocal());

  const load = async () => {
    setIsLoading(true);
    setError("");

    try {
      setProject(await getProject(id));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o projeto.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const notifyError = (title: string, cause: unknown) =>
    toast({
      variant: "destructive",
      title,
      description: cause instanceof Error ? cause.message : undefined,
    });

  const saveField = async (input: UpdateProjectInput) => {
    try {
      setProject(await updateProject(id, input));
    } catch (saveError) {
      notifyError("Não foi possível salvar", saveError);
      throw saveError;
    }
  };

  const submitCost = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(costForm.amount.replace(",", "."));

    if (!costForm.description.trim() || !Number.isFinite(amount) || amount < 0 || costForm.amount.trim() === "") {
      toast({ variant: "destructive", title: "Informe o que comprou e um valor válido." });
      return;
    }

    setIsSavingCost(true);

    try {
      const isPaid = costForm.isPaid === "sim";

      await addProjectCost(id, {
        description: costForm.description.trim(),
        amount,
        supplier: costForm.supplier.trim() || undefined,
        isPaid,
        paidAt: isPaid ? costForm.paidAt || undefined : undefined,
      });

      setIsCostModalOpen(false);
      setCostForm({ ...emptyCostForm, paidAt: todayLocal() });
      await load();
    } catch (saveError) {
      notifyError("Não foi possível adicionar o custo", saveError);
    } finally {
      setIsSavingCost(false);
    }
  };

  const confirmPayment = async (event: FormEvent) => {
    event.preventDefault();

    if (!payingCost) return;

    try {
      await markProjectCostPaid(id, payingCost.id, payDate || undefined);
      setPayingCost(null);
      await load();
    } catch (payError) {
      notifyError("Não foi possível marcar como pago", payError);
    }
  };

  const unpay = async (cost: ProjectCost) => {
    try {
      await markProjectCostUnpaid(id, cost.id);
      await load();
    } catch (unpayError) {
      notifyError("Não foi possível desfazer o pagamento", unpayError);
    }
  };

  const removeCost = async (cost: ProjectCost) => {
    if (!window.confirm(`Excluir o custo “${cost.description}”?`)) return;

    try {
      await deleteProjectCost(id, cost.id);
      await load();
    } catch (removeError) {
      notifyError("Não foi possível excluir o custo", removeError);
    }
  };

  return (
    <DashboardLayout title={project?.name ?? "Projeto"} subtitle="Projetos">
      <div className="animate-fade-in space-y-6">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar para projetos
        </Link>

        {error && (
          <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
            <span>{error}</span>
            <button
              onClick={() => void load()}
              className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
            >
              TENTAR NOVAMENTE
            </button>
          </div>
        )}

        {isLoading && !project && <p className="text-sm text-muted-foreground animate-pulse">Carregando...</p>}

        {project && (
          <>
            <section className="border border-border rounded bg-card p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <EditableText
                label="Projeto"
                value={project.name}
                onSave={(value) => (value ? saveField({ name: value }) : Promise.resolve())}
              />
              <EditableText
                label="Cliente"
                value={project.clientName}
                onSave={(value) => (value ? saveField({ clientName: value }) : Promise.resolve())}
              />
              <EditableText
                label="Prazo de entrega"
                type="date"
                value={project.deadline ?? ""}
                display={formatDateOnly(project.deadline)}
                onSave={(value) => saveField({ deadline: value || null })}
              />
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Status</p>
                <div className="flex items-center gap-2">
                  <ProjectStatusBadge status={project.status} />
                  <select
                    value={project.status}
                    onChange={(event) => void saveField({ status: event.target.value as ProjectStatus }).catch(() => undefined)}
                    className="px-2 py-1 bg-secondary/50 border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    aria-label="Alterar status"
                  >
                    {PROJECT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard title="Total pago" value={formatCurrency(project.totals.totalPaid)} icon={<Check className="h-4 w-4" />} />
              <StatCard title="Total a pagar" value={formatCurrency(project.totals.totalToPay)} icon={<Undo2 className="h-4 w-4" />} />
              <StatCard title="Custo total" value={formatCurrency(project.totals.totalCost)} icon={<Plus className="h-4 w-4" />} highlight />
            </div>

            <section className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
                  Horas trabalhadas
                </h2>
                <span className="font-mono text-sm font-bold text-primary">{formatMinutes(project.totalMinutes)}</span>
              </div>
              <DataTable
                data={project.hoursByEmployee.map((row) => ({ ...row, id: row.employeeId }))}
                emptyMessage="Nenhuma hora lançada neste projeto."
                columns={[
                  { key: "employeeName", header: "Funcionário" },
                  { key: "minutes", header: "Horas", mono: true, render: (row) => formatMinutes(row.minutes) },
                ]}
              />
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Custos</h2>
                <button
                  onClick={() => setIsCostModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90"
                >
                  <Plus className="h-4 w-4" /> Adicionar custo
                </button>
              </div>

              <DataTable
                data={project.costs}
                emptyMessage="Nenhum custo lançado. Use “Adicionar custo”."
                columns={[
                  { key: "description", header: "O que comprou?" },
                  { key: "supplier", header: "Fornecedor", render: (cost) => cost.supplier || "—" },
                  { key: "amount", header: "Valor", mono: true, render: (cost) => formatCurrency(cost.amount) },
                  {
                    key: "isPaid",
                    header: "Pago?",
                    render: (cost) =>
                      cost.isPaid ? (
                        <span className="text-success text-xs font-bold">Pago em {formatDateOnly(cost.paidAt)}</span>
                      ) : (
                        <span className="text-amber-300 text-xs font-bold">A pagar</span>
                      ),
                  },
                  {
                    key: "actions",
                    header: "",
                    render: (cost) => (
                      <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                        {cost.isPaid ? (
                          <button
                            onClick={() => void unpay(cost)}
                            className="px-2 py-1 text-[11px] rounded border border-border hover:bg-secondary"
                          >
                            Desfazer
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setPayDate(todayLocal());
                              setPayingCost(cost);
                            }}
                            className="px-2 py-1 text-[11px] font-bold rounded border border-success/40 text-success hover:bg-success/10"
                          >
                            Marcar como pago
                          </button>
                        )}
                        <button
                          onClick={() => void removeCost(cost)}
                          className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-secondary"
                          aria-label="Excluir custo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ),
                  },
                ]}
              />
            </section>
          </>
        )}
      </div>

      <Modal open={isCostModalOpen} onClose={() => setIsCostModalOpen(false)} title="Adicionar custo">
        <form onSubmit={submitCost} className="space-y-4">
          <FormField
            label="O que comprou?"
            value={costForm.description}
            onChange={(event) => setCostForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="Ex.: MDF branco 18mm"
            autoFocus
          />
          <FormField
            label="Valor (R$)"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={costForm.amount}
            onChange={(event) => setCostForm((current) => ({ ...current, amount: event.target.value }))}
            placeholder="2500"
          />
          <FormField
            label="Fornecedor (opcional)"
            value={costForm.supplier}
            onChange={(event) => setCostForm((current) => ({ ...current, supplier: event.target.value }))}
            placeholder="Ex.: Madeireira X"
          />
          <FormField
            label="Pago?"
            as="select"
            value={costForm.isPaid}
            onChange={(event) => setCostForm((current) => ({ ...current, isPaid: event.target.value || "nao" }))}
            options={[
              { value: "nao", label: "Não" },
              { value: "sim", label: "Sim" },
            ]}
          />
          {costForm.isPaid === "sim" && (
            <FormField
              label="Data do pagamento"
              type="date"
              value={costForm.paidAt}
              onChange={(event) => setCostForm((current) => ({ ...current, paidAt: event.target.value }))}
            />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCostModalOpen(false)}
              className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSavingCost}
              className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium disabled:opacity-60"
            >
              {isSavingCost ? "Salvando..." : "Adicionar"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(payingCost)} onClose={() => setPayingCost(null)} title="Marcar como pago" width="max-w-sm">
        <form onSubmit={confirmPayment} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {payingCost?.description} — {payingCost ? formatCurrency(payingCost.amount) : ""}
          </p>
          <FormField
            label="Data do pagamento"
            type="date"
            value={payDate}
            onChange={(event) => setPayDate(event.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPayingCost(null)}
              className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary"
            >
              Cancelar
            </button>
            <button type="submit" className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium">
              Confirmar
            </button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
};

export default ProjectDetailPage;
