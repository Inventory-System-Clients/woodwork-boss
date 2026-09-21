import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/ui/use-toast";
import {
  createProject,
  formatCurrency,
  formatDateOnly,
  listProjects,
  PROJECT_STATUSES,
  type ProjectListItem,
  type ProjectStatus,
} from "@/services/projects";

export const projectStatusClass: Record<ProjectStatus, string> = {
  "Em andamento": "bg-primary/20 text-primary",
  Pausado: "bg-amber-500/20 text-amber-300",
  Finalizado: "bg-success/20 text-success",
};

export const ProjectStatusBadge = ({ status }: { status: ProjectStatus }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${projectStatusClass[status]}`}
  >
    {status}
  </span>
);

const emptyForm = { name: "", clientName: "", clientDocument: "", deadline: "", status: "Em andamento" as ProjectStatus };

const isValidDocument = (value: string) => [11, 14].includes(value.replace(/\D/g, "").length);

const ProjectsPage = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError("");

    try {
      setProjects(await listProjects());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar projetos.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!form.name.trim() || !form.clientName.trim()) {
      toast({ variant: "destructive", title: "Informe o nome do projeto e o cliente." });
      return;
    }

    if (!isValidDocument(form.clientDocument)) {
      toast({ variant: "destructive", title: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido do cliente." });
      return;
    }

    setIsSaving(true);

    try {
      const created = await createProject({
        name: form.name.trim(),
        clientName: form.clientName.trim(),
        clientDocument: form.clientDocument.trim(),
        deadline: form.deadline || undefined,
        status: form.status,
      });

      setIsModalOpen(false);
      setForm(emptyForm);
      navigate(`/projects/${created.id}`);
    } catch (saveError) {
      toast({
        variant: "destructive",
        title: "Não foi possível criar o projeto",
        description: saveError instanceof Error ? saveError.message : undefined,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardLayout
      title="Projetos"
      subtitle="Lista"
      action={
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Novo projeto
        </button>
      }
    >
      <div className="animate-fade-in space-y-4">
        {error && (
          <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground animate-pulse">Carregando...</p>
        ) : (
          <DataTable
            data={projects}
            emptyMessage="Nenhum projeto ainda. Clique em “Novo projeto”."
            onRowClick={(project) => navigate(`/projects/${project.id}`)}
            columns={[
              { key: "name", header: "Projeto" },
              { key: "clientName", header: "Cliente" },
              { key: "deadline", header: "Prazo", render: (project) => formatDateOnly(project.deadline) },
              { key: "status", header: "Status", render: (project) => <ProjectStatusBadge status={project.status} /> },
              {
                key: "totalCost",
                header: "Custo Total",
                mono: true,
                render: (project) => formatCurrency(project.totalCost ?? 0),
              },
              {
                key: "grossValue",
                header: "Valor Final (Bruto)",
                mono: true,
                render: (project) => formatCurrency(project.grossValue ?? 0),
              },
              {
                key: "netProfit",
                header: "Lucro Líquido",
                mono: true,
                render: (project) => (
                  <span className={(project.netProfit ?? 0) < 0 ? "text-destructive" : "text-success"}>
                    {formatCurrency(project.netProfit ?? 0)}
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>

      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} title="Novo projeto">
        <form onSubmit={submit} className="space-y-4">
          <FormField
            label="Nome do projeto"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Ex.: Milk Moo Shopping X"
            autoFocus
          />
          <FormField
            label="Cliente"
            value={form.clientName}
            onChange={(event) => setForm((current) => ({ ...current, clientName: event.target.value }))}
            placeholder="Ex.: Milk Moo"
          />
          <FormField
            label="CPF ou CNPJ do cliente"
            value={form.clientDocument}
            onChange={(event) => setForm((current) => ({ ...current, clientDocument: event.target.value }))}
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            inputMode="numeric"
          />
          <FormField
            label="Prazo de entrega (opcional)"
            type="date"
            value={form.deadline}
            onChange={(event) => setForm((current) => ({ ...current, deadline: event.target.value }))}
          />
          <FormField
            label="Status"
            as="select"
            value={form.status}
            onChange={(event) =>
              setForm((current) => ({ ...current, status: (event.target.value || "Em andamento") as ProjectStatus }))
            }
            options={PROJECT_STATUSES.map((status) => ({ value: status, label: status }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium disabled:opacity-60"
            >
              {isSaving ? "Salvando..." : "Criar projeto"}
            </button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
};

export default ProjectsPage;
