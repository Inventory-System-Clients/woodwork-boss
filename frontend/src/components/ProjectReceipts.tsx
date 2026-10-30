import { FormEvent, useEffect, useState } from "react";
import { Banknote, Check, Hourglass, Plus, Trash2 } from "lucide-react";
import { DataTable } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { Modal } from "@/components/Modal";
import { StatCard } from "@/components/StatCard";
import { toast } from "@/components/ui/use-toast";
import {
  createReceipt,
  deleteReceipt,
  getProjectReceipts,
  markReceiptPending,
  markReceiptReceived,
  parseMoney,
  RECEIPT_METHODS,
  todayLocal,
  type ClientReceipt,
  type ProjectReceiptsSummary,
} from "@/services/finance";
import { formatCurrency, formatDateOnly } from "@/services/projects";

const emptyForm = {
  description: "",
  amount: "",
  dueDate: "",
  method: "Pix",
  isReceived: "nao",
  receivedAt: todayLocal(),
};

interface ProjectReceiptsProps {
  projectId: string;
  /** Reloads the summary when the project's final value changes. */
  finalValue: number | null;
}

/** Installments paid by the client: list, "mark as received" and the received / remaining totals. */
export function ProjectReceipts({ projectId, finalValue }: ProjectReceiptsProps) {
  const [summary, setSummary] = useState<ProjectReceiptsSummary | null>(null);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [receiving, setReceiving] = useState<ClientReceipt | null>(null);
  const [receiveDate, setReceiveDate] = useState(todayLocal());

  const load = async () => {
    setError("");

    try {
      setSummary(await getProjectReceipts(projectId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar os recebimentos.");
    }
  };

  useEffect(() => {
    void load();
  }, [projectId, finalValue]);

  const notifyError = (title: string, cause: unknown) =>
    toast({ variant: "destructive", title, description: cause instanceof Error ? cause.message : undefined });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amount = parseMoney(form.amount);

    if (!form.description.trim() || !(amount > 0)) {
      toast({ variant: "destructive", title: "Informe a descrição e um valor maior que zero." });
      return;
    }

    setIsSaving(true);

    try {
      await createReceipt(projectId, {
        description: form.description.trim(),
        amount,
        dueDate: form.dueDate || null,
        method: form.method || null,
        receivedAt: form.isReceived === "sim" ? form.receivedAt || todayLocal() : null,
      });
      setIsModalOpen(false);
      setForm({ ...emptyForm, receivedAt: todayLocal() });
      await load();
    } catch (saveError) {
      notifyError("Não foi possível adicionar o recebimento", saveError);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmReceive = async (event: FormEvent) => {
    event.preventDefault();
    if (!receiving) return;

    try {
      await markReceiptReceived(projectId, receiving.id, receiveDate || undefined);
      setReceiving(null);
      await load();
    } catch (receiveError) {
      notifyError("Não foi possível marcar como recebido", receiveError);
    }
  };

  const undo = async (receipt: ClientReceipt) => {
    try {
      await markReceiptPending(projectId, receipt.id);
      await load();
    } catch (undoError) {
      notifyError("Não foi possível desfazer o recebimento", undoError);
    }
  };

  const remove = async (receipt: ClientReceipt) => {
    if (!window.confirm(`Excluir o recebimento “${receipt.description}”?`)) return;

    try {
      await deleteReceipt(projectId, receipt.id);
      await load();
    } catch (removeError) {
      notifyError("Não foi possível excluir o recebimento", removeError);
    }
  };

  const today = todayLocal();
  const scheduled = (summary?.receipts ?? []).reduce((total, receipt) => total + receipt.amount, 0);

  return (
    <section className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Valor final"
          value={summary?.finalValue != null ? formatCurrency(summary.finalValue) : "Não informado"}
          icon={<Banknote className="h-4 w-4" />}
        />
        <StatCard title="Recebido" value={formatCurrency(summary?.received ?? 0)} icon={<Check className="h-4 w-4" />} />
        <StatCard
          title="Falta receber"
          value={summary?.remaining != null ? formatCurrency(summary.remaining) : "—"}
          subtitle={summary?.finalValue == null ? "informe o valor final do projeto" : undefined}
          icon={<Hourglass className="h-4 w-4" />}
          highlight
        />
      </div>

      {summary?.finalValue != null && Math.abs(scheduled - summary.finalValue) >= 0.01 && summary.receipts.length > 0 && (
        <p className="text-xs text-amber-300">
          As parcelas cadastradas somam {formatCurrency(scheduled)}, diferente do valor final (
          {formatCurrency(summary.finalValue)}).
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Parcelas do cliente</h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Adicionar recebimento
        </button>
      </div>

      <DataTable
        data={summary?.receipts ?? []}
        emptyMessage="Nenhuma parcela cadastrada. Use “Adicionar recebimento”."
        columns={[
          { key: "description", header: "Descrição" },
          { key: "dueDate", header: "Vencimento", render: (receipt) => formatDateOnly(receipt.dueDate) },
          { key: "amount", header: "Valor", mono: true, render: (receipt) => formatCurrency(receipt.amount) },
          { key: "method", header: "Forma", render: (receipt) => receipt.method || "—" },
          {
            key: "receivedAt",
            header: "Situação",
            render: (receipt) =>
              receipt.receivedAt ? (
                <span className="text-success text-xs font-bold">Recebido em {formatDateOnly(receipt.receivedAt)}</span>
              ) : receipt.dueDate && receipt.dueDate < today ? (
                <span className="text-destructive text-xs font-bold">Vencido</span>
              ) : (
                <span className="text-amber-300 text-xs font-bold">A receber</span>
              ),
          },
          {
            key: "actions",
            header: "",
            render: (receipt) => (
              <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                {receipt.receivedAt ? (
                  <button
                    onClick={() => void undo(receipt)}
                    className="px-2 py-1 text-[11px] rounded border border-border hover:bg-secondary"
                  >
                    Desfazer
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setReceiveDate(todayLocal());
                      setReceiving(receipt);
                    }}
                    className="px-2 py-1 text-[11px] font-bold rounded border border-success/40 text-success hover:bg-success/10"
                  >
                    Marcar como recebido
                  </button>
                )}
                <button
                  onClick={() => void remove(receipt)}
                  className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-secondary"
                  aria-label="Excluir recebimento"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ),
          },
        ]}
      />
      <p className="text-xs text-muted-foreground">
        Dinheiro recebido antes da entrega é adiantamento do cliente (uma dívida), não receita. A receita entra no mês em
        que o projeto é finalizado.
      </p>

      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} title="Adicionar recebimento">
        <form onSubmit={submit} className="space-y-4">
          <FormField
            label="Descrição"
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="Ex.: Sinal, Parcela 2/3"
            autoFocus
          />
          <FormField
            label="Valor (R$)"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={form.amount}
            onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
          />
          <FormField
            label="Vencimento combinado"
            type="date"
            value={form.dueDate}
            onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
          />
          <FormField
            label="Forma de pagamento"
            as="select"
            value={form.method}
            onChange={(event) => setForm((current) => ({ ...current, method: event.target.value }))}
            options={RECEIPT_METHODS.map((method) => ({ value: method, label: method }))}
          />
          <FormField
            label="Já recebido?"
            as="select"
            value={form.isReceived}
            onChange={(event) => setForm((current) => ({ ...current, isReceived: event.target.value || "nao" }))}
            options={[
              { value: "nao", label: "Não" },
              { value: "sim", label: "Sim" },
            ]}
          />
          {form.isReceived === "sim" && (
            <FormField
              label="Data em que caiu na conta"
              type="date"
              value={form.receivedAt}
              onChange={(event) => setForm((current) => ({ ...current, receivedAt: event.target.value }))}
            />
          )}
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
              {isSaving ? "Salvando..." : "Adicionar"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(receiving)} onClose={() => setReceiving(null)} title="Marcar como recebido" width="max-w-sm">
        <form onSubmit={confirmReceive} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {receiving?.description} — {receiving ? formatCurrency(receiving.amount) : ""}
          </p>
          <FormField
            label="Data em que caiu na conta"
            type="date"
            value={receiveDate}
            onChange={(event) => setReceiveDate(event.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setReceiving(null)}
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
    </section>
  );
}
