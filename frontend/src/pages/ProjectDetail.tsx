import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, FileText, ImagePlus, Link2, Plus, Trash2, Undo2 } from "lucide-react";
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
import { listEmployees, type Employee } from "@/services/employees";
import { createProductionShareLink, listProductionImages, uploadProductionImages, type ProductionImage } from "@/services/productions";
import { printProjectReport } from "@/lib/projectReport";
import { calculateDeliveryTotals, printDeliveryReport } from "@/lib/deliveryReport";
import { listClients } from "@/services/clients";
import { ProjectStatusBadge } from "./Projects";

const todayLocal = () => new Date().toLocaleDateString("en-CA");

const emptyCostForm = {
  description: "",
  amount: "",
  supplier: "",
  isPaid: "nao",
  paidAt: todayLocal(),
  isCommission: "nao",
  commissionMode: "percent",
  commissionPercent: "",
  commissionEmployeeId: "",
};

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();

  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textArea);
  }
};

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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [updateNote, setUpdateNote] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [images, setImages] = useState<ProductionImage[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [deliveryValues, setDeliveryValues] = useState({ labor: "", discount: "", finalValue: "" });
  const [isSavingDelivery, setIsSavingDelivery] = useState(false);

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

  useEffect(() => {
    setUpdateNote(project?.lastUpdateNote ?? "");
  }, [project?.lastUpdateNote]);

  useEffect(() => {
    setDeliveryValues({
      labor: project ? String(project.laborValue) : "",
      discount: project ? String(project.discountValue) : "",
      finalValue: project?.finalValue != null ? String(project.finalValue) : "",
    });
  }, [project?.laborValue, project?.discountValue, project?.finalValue]);

  useEffect(() => {
    void listProductionImages(id).then(setImages).catch(() => setImages([]));
  }, [id]);

  useEffect(() => {
    if (isCostModalOpen && employees.length === 0) {
      void listEmployees()
        .then((list) => setEmployees(list.filter((employee) => employee.isActive)))
        .catch(() => setEmployees([]));
    }
  }, [isCostModalOpen]);

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

  const otherCostsTotal = (project?.costs ?? [])
    .filter((cost) => !cost.isCommission)
    .reduce((sum, cost) => sum + cost.amount, 0);

  const submitCost = async (event: FormEvent) => {
    event.preventDefault();

    const isCommission = costForm.isCommission === "sim";
    const isPercent = isCommission && costForm.commissionMode === "percent";
    const amount = Number(costForm.amount.replace(",", "."));
    const percent = Number(costForm.commissionPercent.replace(",", "."));

    if (isCommission) {
      if (!costForm.commissionEmployeeId) {
        toast({ variant: "destructive", title: "Selecione o funcionário que receberá a comissão." });
        return;
      }

      if (isPercent ? !(percent > 0 && percent <= 100) : !(amount > 0)) {
        toast({
          variant: "destructive",
          title: isPercent ? "Informe uma porcentagem entre 0 e 100." : "Informe o valor da comissão.",
        });
        return;
      }
    } else if (!costForm.description.trim() || !Number.isFinite(amount) || amount < 0 || costForm.amount.trim() === "") {
      toast({ variant: "destructive", title: "Informe o que comprou e um valor válido." });
      return;
    }

    setIsSavingCost(true);

    try {
      const isPaid = costForm.isPaid === "sim";

      await addProjectCost(id, {
        description: costForm.description.trim() || undefined,
        amount: isPercent ? undefined : amount,
        supplier: costForm.supplier.trim() || undefined,
        isPaid,
        paidAt: isPaid ? costForm.paidAt || undefined : undefined,
        isCommission,
        commissionMode: isCommission ? (isPercent ? "percent" : "value") : undefined,
        commissionPercent: isPercent ? percent : undefined,
        commissionEmployeeId: isCommission ? costForm.commissionEmployeeId : undefined,
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

  const saveNote = async () => {
    setIsSavingNote(true);

    try {
      setProject(await updateProject(id, { lastUpdateNote: updateNote.trim() || null }));
      toast({ title: "Atualização salva" });
    } catch (noteError) {
      notifyError("Não foi possível salvar a atualização", noteError);
    } finally {
      setIsSavingNote(false);
    }
  };

  const copyClientLink = async () => {
    setIsSharing(true);

    try {
      const link = await createProductionShareLink(id);

      if (!link.url) {
        throw new Error("A API não retornou a URL de acompanhamento.");
      }

      await copyText(link.url);
      toast({
        title: "Link do cliente copiado",
        description: link.expiresAt ? `Expira em ${new Date(link.expiresAt).toLocaleString("pt-BR")}.` : undefined,
      });
    } catch (shareError) {
      notifyError("Não foi possível gerar o link", shareError);
    } finally {
      setIsSharing(false);
    }
  };

  const uploadImages = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);

    try {
      await uploadProductionImages(id, selectedFiles);
      setSelectedFiles([]);
      setImages(await listProductionImages(id));
      toast({ title: "Fotos enviadas" });
    } catch (uploadError) {
      notifyError("Não foi possível enviar as fotos", uploadError);
    } finally {
      setIsUploading(false);
    }
  };

  const saveDeliveryValues = async () => {
    const labor = Number(deliveryValues.labor.replace(",", ".") || 0);
    const discount = Number(deliveryValues.discount.replace(",", ".") || 0);

    const finalText = deliveryValues.finalValue.trim();
    const finalValue = finalText === "" ? null : Number(finalText.replace(",", "."));

    if (
      !Number.isFinite(labor) ||
      !Number.isFinite(discount) ||
      labor < 0 ||
      discount < 0 ||
      (finalValue !== null && (!Number.isFinite(finalValue) || finalValue < 0))
    ) {
      toast({ variant: "destructive", title: "Informe valores válidos (não negativos)." });
      return;
    }

    setIsSavingDelivery(true);

    try {
      setProject(await updateProject(id, { laborValue: labor, discountValue: discount, finalValue }));
      toast({ title: "Valores de entrega salvos" });
    } catch (saveError) {
      notifyError("Não foi possível salvar os valores", saveError);
    } finally {
      setIsSavingDelivery(false);
    }
  };

  const exportDeliveryPdf = async () => {
    if (!project) return;

    // Client registration data (document, phone, address) is matched by name; the PDF still works without it.
    const clients = await listClients().catch(() => []);
    const wanted = project.clientName.trim().toLowerCase();
    const client = clients.find((item) => item.name.trim().toLowerCase() === wanted) ?? null;

    if (!printDeliveryReport(project, client)) {
      toast({
        variant: "destructive",
        title: "Não foi possível gerar o PDF",
        description: "O navegador bloqueou a janela de impressão. Libere pop-ups para este site.",
      });
    }
  };

  const exportPdf = () => {
    if (project && !printProjectReport(project)) {
      toast({
        variant: "destructive",
        title: "Não foi possível gerar o PDF",
        description: "O navegador bloqueou a janela de impressão. Libere pop-ups para este site.",
      });
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            to="/projects"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar para projetos
          </Link>
          {project && (
            <button
              onClick={exportPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded border border-border hover:bg-secondary transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />
              {project.status === "Finalizado" ? "PDF FINAL (INTERNO)" : "PDF DO PROJETO (INTERNO)"}
            </button>
          )}
          {project && (
            <button
              onClick={() => void exportDeliveryPdf()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <FileText className="h-3.5 w-3.5" />
              {project.status === "Finalizado" ? "PDF DE ENTREGA AO CLIENTE" : "PDF AO CLIENTE (PRÉVIA)"}
            </button>
          )}
        </div>

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
            <section className="border border-border rounded bg-card p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                label="CPF / CNPJ do cliente"
                value={project.clientDocument ?? ""}
                display={project.clientDocument || "Não informado"}
                onSave={(value) => (value ? saveField({ clientDocument: value }) : Promise.resolve())}
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
                  {
                    key: "description",
                    header: "O que comprou?",
                    render: (cost) => (
                      <span>
                        {cost.description}
                        {cost.isCommission && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-bold uppercase">
                            Comissão{cost.commissionEmployeeName ? ` · ${cost.commissionEmployeeName}` : ""}
                            {cost.commissionPercent !== null ? ` · ${cost.commissionPercent}%` : ""}
                          </span>
                        )}
                      </span>
                    ),
                  },
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

            <section className="border border-border rounded bg-card p-4 sm:p-5 space-y-3">
              <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
                Valor final e PDF de entrega ao cliente
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <FormField
                  label="Valor final cobrado (R$)"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={deliveryValues.finalValue}
                  onChange={(event) => setDeliveryValues((current) => ({ ...current, finalValue: event.target.value }))}
                  placeholder="Ex.: 25000"
                />
                <FormField
                  label="Desconto (R$)"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={deliveryValues.discount}
                  onChange={(event) => setDeliveryValues((current) => ({ ...current, discount: event.target.value }))}
                />
                <FormField
                  label="Mão de obra (R$) - se sem valor final"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={deliveryValues.labor}
                  onChange={(event) => setDeliveryValues((current) => ({ ...current, labor: event.target.value }))}
                />
                <button
                  onClick={() => void saveDeliveryValues()}
                  disabled={isSavingDelivery}
                  className="px-3 py-2 text-xs font-bold rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {isSavingDelivery ? "SALVANDO..." : "SALVAR VALORES"}
                </button>
              </div>
              {(() => {
                const totals = calculateDeliveryTotals(project);

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">
                        Valor final {totals.hasFinalValue ? "(informado)" : "(itens + mão de obra − desconto)"}
                      </p>
                      <p className="font-mono font-bold text-foreground">{formatCurrency(totals.total)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Custo total (com comissões)</p>
                      <p className="font-mono font-bold text-foreground">{formatCurrency(project.totals.totalCost)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Lucro (valor final − custos)</p>
                      <p className={`font-mono font-bold ${totals.profit < 0 ? "text-destructive" : "text-success"}`}>
                        {formatCurrency(totals.profit)}
                      </p>
                    </div>
                  </div>
                );
              })()}
              <p className="text-xs text-muted-foreground">
                No PDF do cliente, a mão de obra é calculada para fechar com o valor final informado (valor final +
                desconto − itens). Deixe o valor final vazio para usar a mão de obra digitada.
              </p>
            </section>

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

            <section className="border border-border rounded bg-card p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
                  Acompanhamento do cliente
                </h2>
                <button
                  onClick={() => void copyClientLink()}
                  disabled={isSharing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded border border-border hover:bg-secondary disabled:opacity-60"
                >
                  <Link2 className="h-3.5 w-3.5" /> {isSharing ? "GERANDO..." : "COPIAR LINK DO CLIENTE"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                O cliente vê o status do projeto, os itens cadastrados (sem comissões), as fotos e a última atualização.
              </p>

              <div className="space-y-2">
                <FormField
                  label="Descrição da última atualização"
                  as="textarea"
                  value={updateNote}
                  onChange={(event) => setUpdateNote(event.target.value)}
                  placeholder="Ex.: Corte finalizado, montagem começa na segunda."
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => void saveNote()}
                    disabled={isSavingNote || updateNote.trim() === (project.lastUpdateNote ?? "")}
                    className="px-3 py-2 text-xs font-bold rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    {isSavingNote ? "SALVANDO..." : "SALVAR ATUALIZAÇÃO"}
                  </button>
                  {project.lastUpdateAt && (
                    <span className="text-xs text-muted-foreground">
                      Publicada em {new Date(project.lastUpdateAt).toLocaleString("pt-BR")}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  Fotos do projeto ({images.length})
                </p>
                {images.length > 0 && (
                  <ul className="text-xs text-foreground/80 space-y-0.5">
                    {images.map((image) => (
                      <li key={image.id}>{image.fileName}</li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                    className="text-xs"
                  />
                  <button
                    onClick={() => void uploadImages()}
                    disabled={isUploading || selectedFiles.length === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded border border-border hover:bg-secondary disabled:opacity-60"
                  >
                    <ImagePlus className="h-3.5 w-3.5" /> {isUploading ? "ENVIANDO..." : "ENVIAR FOTOS"}
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      <Modal open={isCostModalOpen} onClose={() => setIsCostModalOpen(false)} title="Adicionar custo">
        <form onSubmit={submitCost} className="space-y-4">
          <FormField
            label="É comissão?"
            as="select"
            value={costForm.isCommission}
            onChange={(event) => setCostForm((current) => ({ ...current, isCommission: event.target.value || "nao" }))}
            options={[
              { value: "nao", label: "Não" },
              { value: "sim", label: "Sim" },
            ]}
          />
          {costForm.isCommission === "sim" && (
            <div className="space-y-4 border border-border rounded p-3 bg-secondary/20">
              <FormField
                label="Funcionário que receberá"
                as="select"
                value={costForm.commissionEmployeeId}
                onChange={(event) => setCostForm((current) => ({ ...current, commissionEmployeeId: event.target.value }))}
                options={employees.map((employee) => ({ value: employee.id, label: employee.name }))}
              />
              <FormField
                label="Comissão em"
                as="select"
                value={costForm.commissionMode}
                onChange={(event) => setCostForm((current) => ({ ...current, commissionMode: event.target.value || "percent" }))}
                options={[
                  { value: "percent", label: "Porcentagem (%)" },
                  { value: "value", label: "Valor (R$)" },
                ]}
              />
              {costForm.commissionMode === "percent" ? (
                <>
                  <FormField
                    label="Porcentagem (%)"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.01"
                    value={costForm.commissionPercent}
                    onChange={(event) => setCostForm((current) => ({ ...current, commissionPercent: event.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Calculada sobre os demais custos do projeto ({formatCurrency(otherCostsTotal)})
                    {Number(costForm.commissionPercent) > 0 &&
                      ` = ${formatCurrency((otherCostsTotal * Number(costForm.commissionPercent)) / 100)}`}
                    . O valor fica registrado no momento do lançamento.
                  </p>
                </>
              ) : (
                <FormField
                  label="Valor da comissão (R$)"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={costForm.amount}
                  onChange={(event) => setCostForm((current) => ({ ...current, amount: event.target.value }))}
                />
              )}
            </div>
          )}
          {costForm.isCommission !== "sim" && (
            <>
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
            </>
          )}
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
