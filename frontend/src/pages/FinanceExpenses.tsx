import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/ui/use-toast";
import { listEmployees, type Employee } from "@/services/employees";
import {
  copyPreviousMonthExpenses,
  createCompanyExpense,
  currentMonth,
  deleteCompanyExpense,
  EXPENSE_CATEGORIES,
  expenseCategoryLabel,
  formatMonthLong,
  listCompanyExpenses,
  markCompanyExpensePaid,
  markCompanyExpenseUnpaid,
  parseMoney,
  shiftMonth,
  todayLocal,
  type CompanyExpense,
  type ExpenseCategory,
} from "@/services/finance";
import { formatCurrency, formatDateOnly } from "@/services/projects";

const emptyForm = {
  category: "aluguel" as ExpenseCategory | "",
  description: "",
  amount: "",
  isPaid: "nao",
  paidAt: todayLocal(),
  employeeId: "",
};

const FinanceExpensesPage = () => {
  const [month, setMonth] = useState(currentMonth());
  const [expenses, setExpenses] = useState<CompanyExpense[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [paying, setPaying] = useState<CompanyExpense | null>(null);
  const [payDate, setPayDate] = useState(todayLocal());
  const [employees, setEmployees] = useState<Employee[]>([]);

  const load = async () => {
    setIsLoading(true);
    setError("");

    try {
      setExpenses(await listCompanyExpenses(month));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar as despesas.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [month]);

  useEffect(() => {
    if (isModalOpen && employees.length === 0) {
      void listEmployees()
        .then((list) => setEmployees(list.filter((employee) => employee.isActive)))
        .catch(() => setEmployees([]));
    }
  }, [isModalOpen]);

  const notifyError = (title: string, cause: unknown) =>
    toast({ variant: "destructive", title, description: cause instanceof Error ? cause.message : undefined });

  const totals = useMemo(() => {
    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const paid = expenses.filter((expense) => expense.isPaid).reduce((sum, expense) => sum + expense.amount, 0);
    const byCategory = EXPENSE_CATEGORIES.map((category) => ({
      ...category,
      amount: expenses.filter((expense) => expense.category === category.value).reduce((sum, expense) => sum + expense.amount, 0),
    })).filter((category) => category.amount > 0);

    return { total, paid, toPay: total - paid, byCategory };
  }, [expenses]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amount = parseMoney(form.amount);

    if (!form.category || !form.description.trim() || !(amount >= 0)) {
      toast({ variant: "destructive", title: "Informe categoria, descrição e um valor válido." });
      return;
    }

    setIsSaving(true);

    try {
      const isPaid = form.isPaid === "sim";
      await createCompanyExpense({
        category: form.category,
        description: form.description.trim(),
        amount,
        competenceMonth: month,
        isPaid,
        paidAt: isPaid ? form.paidAt || null : null,
        employeeId: form.employeeId || null,
      });
      setIsModalOpen(false);
      setForm({ ...emptyForm, paidAt: todayLocal() });
      await load();
    } catch (saveError) {
      notifyError("Não foi possível lançar a despesa", saveError);
    } finally {
      setIsSaving(false);
    }
  };

  const copyPrevious = async () => {
    setIsCopying(true);

    try {
      const result = await copyPreviousMonthExpenses(month);
      toast({
        title: result.copied > 0 ? `${result.copied} despesas copiadas` : "O mês anterior não tem despesas",
        description: result.copied > 0 ? "Todas entram como “a pagar”. Ajuste valores se mudaram." : undefined,
      });
      setExpenses(result.expenses);
    } catch (copyError) {
      notifyError("Não foi possível copiar o mês anterior", copyError);
    } finally {
      setIsCopying(false);
    }
  };

  const confirmPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!paying) return;

    try {
      await markCompanyExpensePaid(paying.id, payDate || undefined);
      setPaying(null);
      await load();
    } catch (payError) {
      notifyError("Não foi possível marcar como paga", payError);
    }
  };

  const unpay = async (expense: CompanyExpense) => {
    try {
      await markCompanyExpenseUnpaid(expense.id);
      await load();
    } catch (unpayError) {
      notifyError("Não foi possível desfazer o pagamento", unpayError);
    }
  };

  const remove = async (expense: CompanyExpense) => {
    if (!window.confirm(`Excluir a despesa “${expense.description}”?`)) return;

    try {
      await deleteCompanyExpense(expense.id);
      await load();
    } catch (removeError) {
      notifyError("Não foi possível excluir a despesa", removeError);
    }
  };

  return (
    <DashboardLayout title="Despesas fixas" subtitle="Financeiro">
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMonth(shiftMonth(month, -1))}
              className="p-2 rounded border border-border hover:bg-secondary"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="month"
              value={month}
              onChange={(event) => event.target.value && setMonth(event.target.value)}
              className="px-3 py-2 bg-secondary/50 border border-border rounded text-sm"
            />
            <button
              onClick={() => setMonth(shiftMonth(month, 1))}
              className="p-2 rounded border border-border hover:bg-secondary"
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="text-sm text-muted-foreground capitalize hidden sm:inline">{formatMonthLong(month)}</span>
          </div>
          <div className="flex items-center gap-2">
            {expenses.length === 0 && !isLoading && (
              <button
                onClick={() => void copyPrevious()}
                disabled={isCopying}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm rounded border border-border hover:bg-secondary disabled:opacity-60"
              >
                <Copy className="h-4 w-4" /> {isCopying ? "Copiando..." : "Copiar mês anterior"}
              </button>
            )}
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Lançar despesa
            </button>
          </div>
        </div>

        {error && (
          <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            ["Total do mês", totals.total],
            ["Pago", totals.paid],
            ["A pagar", totals.toPay],
          ].map(([label, value]) => (
            <div key={label} className="border border-border rounded bg-card p-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{label}</p>
              <p className="text-xl font-bold font-mono tabular-nums">{formatCurrency(Number(value))}</p>
            </div>
          ))}
        </div>

        <DataTable
          data={expenses}
          emptyMessage={isLoading ? "Carregando..." : "Nenhuma despesa neste mês. Lance uma ou copie o mês anterior."}
          columns={[
            { key: "category", header: "Categoria", render: (expense) => expenseCategoryLabel(expense.category) },
            {
              key: "description",
              header: "Descrição",
              render: (expense) => (
                <span>
                  {expense.description}
                  {expense.employeeName && <span className="ml-2 text-xs text-muted-foreground">· {expense.employeeName}</span>}
                </span>
              ),
            },
            { key: "amount", header: "Valor", mono: true, render: (expense) => formatCurrency(expense.amount) },
            {
              key: "isPaid",
              header: "Pago?",
              render: (expense) =>
                expense.isPaid ? (
                  <span className="text-success text-xs font-bold">Pago em {formatDateOnly(expense.paidAt)}</span>
                ) : (
                  <span className="text-amber-300 text-xs font-bold">A pagar</span>
                ),
            },
            {
              key: "actions",
              header: "",
              render: (expense) => (
                <div className="flex items-center justify-end gap-1">
                  {expense.isPaid ? (
                    <button onClick={() => void unpay(expense)} className="px-2 py-1 text-[11px] rounded border border-border hover:bg-secondary">
                      Desfazer
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setPayDate(todayLocal());
                        setPaying(expense);
                      }}
                      className="px-2 py-1 text-[11px] font-bold rounded border border-success/40 text-success hover:bg-success/10"
                    >
                      Marcar como pago
                    </button>
                  )}
                  <button
                    onClick={() => void remove(expense)}
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-secondary"
                    aria-label="Excluir despesa"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ),
            },
          ]}
        />

        {totals.byCategory.length > 0 && (
          <section className="border border-border rounded bg-card p-4 space-y-2">
            <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Por categoria</h2>
            <ul className="text-sm divide-y divide-border/50">
              {totals.byCategory.map((category) => (
                <li key={category.value} className="flex justify-between py-1.5">
                  <span>{category.label}</span>
                  <span className="font-mono tabular-nums">{formatCurrency(category.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-xs text-muted-foreground">
          O mês aqui é o mês de competência: o salário de outubro é lançado em outubro mesmo que seja pago em 5 de
          novembro. Pró-labore é despesa; retirada de lucro dos sócios vai em Financeiro → Cadastros → Sócios.
        </p>
      </div>

      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Lançar despesa · ${formatMonthLong(month)}`}>
        <form onSubmit={submit} className="space-y-4">
          <FormField
            label="Categoria"
            as="select"
            value={form.category}
            onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as ExpenseCategory }))}
            options={EXPENSE_CATEGORIES.map((category) => ({ value: category.value, label: category.label }))}
          />
          <FormField
            label="Descrição"
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="Ex.: Aluguel do galpão"
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
          {(form.category === "salario" || form.category === "encargos") && (
            <FormField
              label="Funcionário (opcional)"
              as="select"
              value={form.employeeId}
              onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))}
              options={employees.map((employee) => ({ value: employee.id, label: employee.name }))}
            />
          )}
          <FormField
            label="Pago?"
            as="select"
            value={form.isPaid}
            onChange={(event) => setForm((current) => ({ ...current, isPaid: event.target.value || "nao" }))}
            options={[
              { value: "nao", label: "Não" },
              { value: "sim", label: "Sim" },
            ]}
          />
          {form.isPaid === "sim" && (
            <FormField
              label="Data do pagamento"
              type="date"
              value={form.paidAt}
              onChange={(event) => setForm((current) => ({ ...current, paidAt: event.target.value }))}
            />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium disabled:opacity-60">
              {isSaving ? "Salvando..." : "Lançar"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(paying)} onClose={() => setPaying(null)} title="Marcar como pago" width="max-w-sm">
        <form onSubmit={confirmPayment} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {paying?.description} — {paying ? formatCurrency(paying.amount) : ""}
          </p>
          <FormField label="Data do pagamento" type="date" value={payDate} onChange={(event) => setPayDate(event.target.value)} autoFocus />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setPaying(null)} className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary">
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

export default FinanceExpensesPage;
