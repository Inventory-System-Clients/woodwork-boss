import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/ui/use-toast";
import {
  createFixedAsset,
  createLoan,
  createLoanMovement,
  createOwnerMovement,
  deleteFixedAsset,
  deleteLoan,
  deleteLoanMovement,
  deleteOwnerMovement,
  getOpeningBalance,
  listFixedAssets,
  listLoans,
  listOwnerMovements,
  LOAN_MOVEMENT_LABELS,
  parseMoney,
  saveOpeningBalance,
  todayLocal,
  updateFixedAsset,
  type FixedAsset,
  type Loan,
  type LoanMovementType,
  type OpeningBalanceState,
  type OwnerMovement,
  type OwnerMovementType,
} from "@/services/finance";
import { formatCurrency, formatDateOnly } from "@/services/projects";

const TABS = [
  { key: "bens", label: "Bens" },
  { key: "emprestimos", label: "Empréstimos" },
  { key: "socios", label: "Sócios" },
  { key: "saldo-inicial", label: "Saldo inicial" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const notifyError = (title: string, cause: unknown) =>
  toast({ variant: "destructive", title, description: cause instanceof Error ? cause.message : undefined });

const errorMessage = (cause: unknown, fallback: string) => (cause instanceof Error ? cause.message : fallback);

function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">{title}</h2>
      {action}
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90"
    >
      <Plus className="h-4 w-4" /> {label}
    </button>
  );
}

function FormActions({ onCancel, isSaving, label }: { onCancel: () => void; isSaving: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary">
        Cancelar
      </button>
      <button type="submit" disabled={isSaving} className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium disabled:opacity-60">
        {isSaving ? "Salvando..." : label}
      </button>
    </div>
  );
}

function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-secondary"
      aria-label={label}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

// ---------- Fixed assets ----------

const emptyAssetForm = { name: "", purchaseValue: "", purchaseDate: todayLocal(), usefulLifeMonths: "120" };

function FixedAssetsTab() {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(emptyAssetForm);
  const [isSaving, setIsSaving] = useState(false);
  const [disposing, setDisposing] = useState<FixedAsset | null>(null);
  const [disposal, setDisposal] = useState({ date: todayLocal(), value: "" });

  const load = async () => {
    try {
      setAssets(await listFixedAssets());
      setError("");
    } catch (loadError) {
      setError(errorMessage(loadError, "Falha ao carregar os bens."));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const purchaseValue = parseMoney(form.purchaseValue);
    const usefulLifeMonths = Number(form.usefulLifeMonths);

    if (!form.name.trim() || !(purchaseValue >= 0) || !form.purchaseDate || !(usefulLifeMonths > 0)) {
      toast({ variant: "destructive", title: "Informe nome, valor, data da compra e vida útil." });
      return;
    }

    setIsSaving(true);

    try {
      await createFixedAsset({
        name: form.name.trim(),
        purchaseValue,
        purchaseDate: form.purchaseDate,
        usefulLifeMonths: Math.round(usefulLifeMonths),
        disposedAt: null,
        disposalValue: null,
      });
      setIsModalOpen(false);
      setForm({ ...emptyAssetForm, purchaseDate: todayLocal() });
      await load();
    } catch (saveError) {
      notifyError("Não foi possível cadastrar o bem", saveError);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDisposal = async (event: FormEvent) => {
    event.preventDefault();
    if (!disposing) return;
    const value = disposal.value.trim() === "" ? 0 : parseMoney(disposal.value);

    if (!(value >= 0) || !disposal.date) {
      toast({ variant: "destructive", title: "Informe a data e um valor válido (0 se foi descartado)." });
      return;
    }

    try {
      await updateFixedAsset(disposing.id, { disposedAt: disposal.date, disposalValue: value });
      setDisposing(null);
      await load();
    } catch (saveError) {
      notifyError("Não foi possível dar baixa no bem", saveError);
    }
  };

  const undoDisposal = async (asset: FixedAsset) => {
    try {
      await updateFixedAsset(asset.id, { disposedAt: null, disposalValue: null });
      await load();
    } catch (saveError) {
      notifyError("Não foi possível desfazer a baixa", saveError);
    }
  };

  const remove = async (asset: FixedAsset) => {
    if (!window.confirm(`Excluir o bem “${asset.name}”? Para venda ou descarte use “Dar baixa”.`)) return;

    try {
      await deleteFixedAsset(asset.id);
      await load();
    } catch (removeError) {
      notifyError("Não foi possível excluir o bem", removeError);
    }
  };

  return (
    <section className="space-y-3">
      <SectionHeader title="Máquinas, ferramentas e veículos" action={<AddButton label="Cadastrar bem" onClick={() => setIsModalOpen(true)} />} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DataTable
        data={assets}
        emptyMessage="Nenhum bem cadastrado."
        columns={[
          { key: "name", header: "Bem" },
          { key: "purchaseDate", header: "Compra", render: (asset) => formatDateOnly(asset.purchaseDate) },
          { key: "purchaseValue", header: "Valor", mono: true, render: (asset) => formatCurrency(asset.purchaseValue) },
          {
            key: "usefulLifeMonths",
            header: "Depreciação / mês",
            mono: true,
            render: (asset) => `${formatCurrency(asset.purchaseValue / asset.usefulLifeMonths)} · ${asset.usefulLifeMonths} meses`,
          },
          {
            key: "disposedAt",
            header: "Situação",
            render: (asset) =>
              asset.disposedAt ? (
                <span className="text-xs text-muted-foreground">
                  Baixado em {formatDateOnly(asset.disposedAt)} por {formatCurrency(asset.disposalValue ?? 0)}
                </span>
              ) : (
                <span className="text-xs text-success font-bold">Em uso</span>
              ),
          },
          {
            key: "actions",
            header: "",
            render: (asset) => (
              <div className="flex items-center justify-end gap-1">
                {asset.disposedAt ? (
                  <button onClick={() => void undoDisposal(asset)} className="px-2 py-1 text-[11px] rounded border border-border hover:bg-secondary">
                    Desfazer baixa
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setDisposal({ date: todayLocal(), value: "" });
                      setDisposing(asset);
                    }}
                    className="px-2 py-1 text-[11px] rounded border border-border hover:bg-secondary"
                  >
                    Dar baixa / vender
                  </button>
                )}
                <DeleteButton label="Excluir bem" onClick={() => void remove(asset)} />
              </div>
            ),
          },
        ]}
      />
      <p className="text-xs text-muted-foreground">
        A compra sai do caixa na data da compra; o custo vira despesa aos poucos (depreciação mensal = valor ÷ vida útil).
      </p>

      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} title="Cadastrar bem">
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Nome" value={form.name} onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))} placeholder="Ex.: Serra esquadrejadeira" autoFocus />
          <FormField label="Valor de compra (R$)" type="number" inputMode="decimal" min={0} step="0.01" value={form.purchaseValue} onChange={(event) => setForm((c) => ({ ...c, purchaseValue: event.target.value }))} />
          <FormField label="Data da compra" type="date" value={form.purchaseDate} onChange={(event) => setForm((c) => ({ ...c, purchaseDate: event.target.value }))} />
          <FormField label="Vida útil (meses)" type="number" min={1} step="1" value={form.usefulLifeMonths} onChange={(event) => setForm((c) => ({ ...c, usefulLifeMonths: event.target.value }))} />
          <FormActions onCancel={() => setIsModalOpen(false)} isSaving={isSaving} label="Cadastrar" />
        </form>
      </Modal>

      <Modal open={Boolean(disposing)} onClose={() => setDisposing(null)} title="Dar baixa / vender" width="max-w-sm">
        <form onSubmit={confirmDisposal} className="space-y-4">
          <p className="text-sm text-muted-foreground">{disposing?.name}</p>
          <FormField label="Data da venda ou descarte" type="date" value={disposal.date} onChange={(event) => setDisposal((c) => ({ ...c, date: event.target.value }))} />
          <FormField label="Valor recebido (R$, 0 se descartado)" type="number" inputMode="decimal" min={0} step="0.01" value={disposal.value} onChange={(event) => setDisposal((c) => ({ ...c, value: event.target.value }))} />
          <FormActions onCancel={() => setDisposing(null)} isSaving={false} label="Confirmar" />
        </form>
      </Modal>
    </section>
  );
}

// ---------- Loans ----------

function LoanMovements({ loan, onChange }: { loan: Loan; onChange: () => Promise<void> }) {
  const [form, setForm] = useState({ date: todayLocal(), type: "amortizacao" as LoanMovementType, amount: "" });
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amount = parseMoney(form.amount);

    if (!(amount > 0) || !form.date) {
      toast({ variant: "destructive", title: "Informe data e valor." });
      return;
    }

    setIsSaving(true);

    try {
      await createLoanMovement(loan.id, { date: form.date, type: form.type, amount });
      setForm((current) => ({ ...current, amount: "" }));
      await onChange();
    } catch (saveError) {
      notifyError("Não foi possível lançar o movimento", saveError);
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (movementId: string) => {
    if (!window.confirm("Excluir este movimento?")) return;

    try {
      await deleteLoanMovement(loan.id, movementId);
      await onChange();
    } catch (removeError) {
      notifyError("Não foi possível excluir o movimento", removeError);
    }
  };

  return (
    <div className="space-y-3" onClick={(event) => event.stopPropagation()}>
      {loan.movements.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum movimento. Lance a entrada do dinheiro primeiro.</p>
      ) : (
        <ul className="text-xs divide-y divide-border/50">
          {loan.movements.map((movement) => (
            <li key={movement.id} className="flex items-center justify-between gap-3 py-1.5">
              <span>
                {formatDateOnly(movement.date)} · {LOAN_MOVEMENT_LABELS[movement.type]}
              </span>
              <span className="flex items-center gap-2 font-mono">
                {formatCurrency(movement.amount)}
                <DeleteButton label="Excluir movimento" onClick={() => void remove(movement.id)} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
        <FormField label="Data" type="date" value={form.date} onChange={(event) => setForm((c) => ({ ...c, date: event.target.value }))} />
        <FormField
          label="Tipo"
          as="select"
          value={form.type}
          onChange={(event) => setForm((c) => ({ ...c, type: (event.target.value || "amortizacao") as LoanMovementType }))}
          options={(Object.keys(LOAN_MOVEMENT_LABELS) as LoanMovementType[]).map((type) => ({ value: type, label: LOAN_MOVEMENT_LABELS[type] }))}
        />
        <FormField label="Valor (R$)" type="number" inputMode="decimal" min={0} step="0.01" value={form.amount} onChange={(event) => setForm((c) => ({ ...c, amount: event.target.value }))} />
        <button type="submit" disabled={isSaving} className="px-3 py-2 text-xs font-bold rounded bg-primary text-primary-foreground disabled:opacity-60">
          {isSaving ? "SALVANDO..." : "LANÇAR MOVIMENTO"}
        </button>
      </form>
    </div>
  );
}

function LoansTab() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ lender: "", description: "" });
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    try {
      setLoans(await listLoans());
      setError("");
    } catch (loadError) {
      setError(errorMessage(loadError, "Falha ao carregar os empréstimos."));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!form.lender.trim()) {
      toast({ variant: "destructive", title: "Informe o credor (banco ou pessoa)." });
      return;
    }

    setIsSaving(true);

    try {
      await createLoan({ lender: form.lender.trim(), description: form.description.trim() || null });
      setIsModalOpen(false);
      setForm({ lender: "", description: "" });
      await load();
    } catch (saveError) {
      notifyError("Não foi possível cadastrar o empréstimo", saveError);
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (loan: Loan) => {
    if (!window.confirm(`Excluir o empréstimo de “${loan.lender}” e todos os seus movimentos?`)) return;

    try {
      await deleteLoan(loan.id);
      await load();
    } catch (removeError) {
      notifyError("Não foi possível excluir o empréstimo", removeError);
    }
  };

  return (
    <section className="space-y-3">
      <SectionHeader title="Empréstimos" action={<AddButton label="Cadastrar empréstimo" onClick={() => setIsModalOpen(true)} />} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DataTable
        data={loans}
        emptyMessage="Nenhum empréstimo cadastrado."
        renderExpanded={(loan) => <LoanMovements loan={loan} onChange={load} />}
        columns={[
          { key: "lender", header: "Credor" },
          { key: "description", header: "Descrição", render: (loan) => loan.description || "—" },
          { key: "balance", header: "Saldo devedor", mono: true, render: (loan) => formatCurrency(loan.balance) },
          { key: "movements", header: "Movimentos", render: (loan) => loan.movements.length },
          { key: "actions", header: "", render: (loan) => <DeleteButton label="Excluir empréstimo" onClick={() => void remove(loan)} /> },
        ]}
      />
      <p className="text-xs text-muted-foreground">
        Clique no empréstimo para lançar movimentos. Amortização não é despesa (só reduz a dívida); juros são despesa.
      </p>

      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} title="Cadastrar empréstimo">
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Credor" value={form.lender} onChange={(event) => setForm((c) => ({ ...c, lender: event.target.value }))} placeholder="Ex.: Banco do Brasil" autoFocus />
          <FormField label="Descrição (opcional)" value={form.description} onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))} placeholder="Ex.: Capital de giro, 24x" />
          <FormActions onCancel={() => setIsModalOpen(false)} isSaving={isSaving} label="Cadastrar" />
        </form>
      </Modal>
    </section>
  );
}

// ---------- Owner movements ----------

const emptyOwnerForm = { ownerName: "", date: todayLocal(), type: "retirada" as OwnerMovementType, amount: "", description: "" };

function OwnersTab() {
  const [movements, setMovements] = useState<OwnerMovement[]>([]);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(emptyOwnerForm);
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    try {
      setMovements(await listOwnerMovements());
      setError("");
    } catch (loadError) {
      setError(errorMessage(loadError, "Falha ao carregar os movimentos dos sócios."));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amount = parseMoney(form.amount);

    if (!form.ownerName.trim() || !form.date || !(amount > 0)) {
      toast({ variant: "destructive", title: "Informe sócio, data e valor." });
      return;
    }

    setIsSaving(true);

    try {
      await createOwnerMovement({
        ownerName: form.ownerName.trim(),
        date: form.date,
        type: form.type,
        amount,
        description: form.description.trim() || null,
      });
      setIsModalOpen(false);
      setForm({ ...emptyOwnerForm, date: todayLocal() });
      await load();
    } catch (saveError) {
      notifyError("Não foi possível lançar o movimento", saveError);
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (movement: OwnerMovement) => {
    if (!window.confirm("Excluir este movimento?")) return;

    try {
      await deleteOwnerMovement(movement.id);
      await load();
    } catch (removeError) {
      notifyError("Não foi possível excluir o movimento", removeError);
    }
  };

  return (
    <section className="space-y-3">
      <SectionHeader title="Aportes e retiradas dos sócios" action={<AddButton label="Lançar movimento" onClick={() => setIsModalOpen(true)} />} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DataTable
        data={movements}
        emptyMessage="Nenhum aporte ou retirada lançado."
        columns={[
          { key: "date", header: "Data", render: (movement) => formatDateOnly(movement.date) },
          { key: "ownerName", header: "Sócio" },
          {
            key: "type",
            header: "Tipo",
            render: (movement) =>
              movement.type === "aporte" ? (
                <span className="text-success text-xs font-bold">Aporte de capital</span>
              ) : (
                <span className="text-amber-300 text-xs font-bold">Retirada de lucro</span>
              ),
          },
          { key: "amount", header: "Valor", mono: true, render: (movement) => formatCurrency(movement.amount) },
          { key: "description", header: "Obs.", render: (movement) => movement.description || "—" },
          { key: "actions", header: "", render: (movement) => <DeleteButton label="Excluir movimento" onClick={() => void remove(movement)} /> },
        ]}
      />
      <p className="text-xs text-muted-foreground">
        Retirada aqui é distribuição de lucro (não é despesa). Pró-labore é despesa e vai em Despesas fixas.
      </p>

      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} title="Lançar movimento de sócio">
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Sócio" value={form.ownerName} onChange={(event) => setForm((c) => ({ ...c, ownerName: event.target.value }))} autoFocus />
          <FormField
            label="Tipo"
            as="select"
            value={form.type}
            onChange={(event) => setForm((c) => ({ ...c, type: (event.target.value || "retirada") as OwnerMovementType }))}
            options={[
              { value: "retirada", label: "Retirada de lucro" },
              { value: "aporte", label: "Aporte de capital" },
            ]}
          />
          <FormField label="Data" type="date" value={form.date} onChange={(event) => setForm((c) => ({ ...c, date: event.target.value }))} />
          <FormField label="Valor (R$)" type="number" inputMode="decimal" min={0} step="0.01" value={form.amount} onChange={(event) => setForm((c) => ({ ...c, amount: event.target.value }))} />
          <FormField label="Observação (opcional)" value={form.description} onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))} />
          <FormActions onCancel={() => setIsModalOpen(false)} isSaving={isSaving} label="Lançar" />
        </form>
      </Modal>
    </section>
  );
}

// ---------- Opening balance ----------

function OpeningBalanceTab() {
  const [state, setState] = useState<OpeningBalanceState | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ cutoffDate: "2026-10-01", cash: "", shareCapital: "", retainedEarnings: "" });
  const [isSaving, setIsSaving] = useState(false);

  const apply = (next: OpeningBalanceState) => {
    setState(next);

    if (next.openingBalance) {
      setForm({
        cutoffDate: next.openingBalance.cutoffDate,
        cash: String(next.openingBalance.cash),
        shareCapital: String(next.openingBalance.shareCapital),
        retainedEarnings: String(next.openingBalance.retainedEarnings),
      });
    }
  };

  useEffect(() => {
    void getOpeningBalance()
      .then(apply)
      .catch((loadError) => setError(errorMessage(loadError, "Falha ao carregar o saldo inicial.")));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const values = [form.cash, form.shareCapital, form.retainedEarnings].map((value) => (value.trim() === "" ? 0 : parseMoney(value)));

    if (!form.cutoffDate || values.some((value) => !Number.isFinite(value))) {
      toast({ variant: "destructive", title: "Informe a data de corte e valores válidos." });
      return;
    }

    setIsSaving(true);

    try {
      apply(
        await saveOpeningBalance({
          cutoffDate: form.cutoffDate,
          cash: values[0],
          shareCapital: values[1],
          retainedEarnings: values[2],
        }),
      );
      toast({ title: "Saldo inicial salvo" });
    } catch (saveError) {
      notifyError("Não foi possível salvar o saldo inicial", saveError);
    } finally {
      setIsSaving(false);
    }
  };

  const check = state?.check;

  return (
    <section className="space-y-4 max-w-2xl">
      <SectionHeader title="Saldo inicial" />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-sm text-muted-foreground">
        Valores no início da data de corte. Tudo antes dessa data vem daqui; tudo a partir dela é calculado pelos
        lançamentos. Contas a receber, obras em andamento, fornecedores, bens e empréstimos são sempre recalculados a
        partir dos cadastros.
      </p>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Data de corte" type="date" value={form.cutoffDate} onChange={(event) => setForm((c) => ({ ...c, cutoffDate: event.target.value }))} />
        <FormField label="Caixa e bancos (R$)" type="number" step="0.01" value={form.cash} onChange={(event) => setForm((c) => ({ ...c, cash: event.target.value }))} />
        <FormField label="Capital social (R$)" type="number" step="0.01" value={form.shareCapital} onChange={(event) => setForm((c) => ({ ...c, shareCapital: event.target.value }))} />
        <FormField label="Lucros acumulados (R$)" type="number" step="0.01" value={form.retainedEarnings} onChange={(event) => setForm((c) => ({ ...c, retainedEarnings: event.target.value }))} />
        <div className="sm:col-span-2 flex justify-end">
          <button type="submit" disabled={isSaving} className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium disabled:opacity-60">
            {isSaving ? "Salvando..." : "Salvar saldo inicial"}
          </button>
        </div>
      </form>

      {check && (
        <div
          className={`rounded border px-3 py-2 text-sm ${
            Math.abs(check.diff) < 0.01 ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {Math.abs(check.diff) < 0.01 ? (
            <span>Conferência em {formatDateOnly(check.date)}: o saldo inicial bate com os lançamentos.</span>
          ) : (
            <div className="space-y-2">
              <p>
                Conferência em {formatDateOnly(check.date)}: Ativo − (Passivo + PL) = {formatCurrency(check.diff)}. Para fechar, os
                lucros acumulados iniciais deveriam ser {formatCurrency(check.suggestedRetainedEarnings)} (ou revise o caixa e
                os lançamentos anteriores ao corte).
              </p>
              <button
                type="button"
                onClick={() => setForm((c) => ({ ...c, retainedEarnings: String(check.suggestedRetainedEarnings) }))}
                className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/40 hover:bg-destructive/20"
              >
                USAR VALOR SUGERIDO
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const FinanceRegistersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("aba");
  const tab: TabKey = TABS.some((item) => item.key === requested) ? (requested as TabKey) : "bens";

  return (
    <DashboardLayout title="Bens, empréstimos e sócios" subtitle="Financeiro">
      <div className="animate-fade-in space-y-6">
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => setSearchParams({ aba: item.key }, { replace: true })}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 -mb-px whitespace-nowrap transition-colors ${
                tab === item.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "bens" && <FixedAssetsTab />}
        {tab === "emprestimos" && <LoansTab />}
        {tab === "socios" && <OwnersTab />}
        {tab === "saldo-inicial" && <OpeningBalanceTab />}
      </div>
    </DashboardLayout>
  );
};

export default FinanceRegistersPage;
