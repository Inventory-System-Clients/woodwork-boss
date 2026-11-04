import { request } from "@/services/api";

const unwrap = <T>(payload: unknown): T => {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
};

const call = async <T>(path: string, init?: RequestInit) => unwrap<T>(await request<unknown>(path, init));
const send = <T>(path: string, method: string, body?: unknown) =>
  call<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const enc = encodeURIComponent;

// ---------- Client receipts ----------

export interface ClientReceipt {
  id: string;
  projectId: string;
  description: string;
  amount: number;
  dueDate: string | null;
  receivedAt: string | null;
  method: string | null;
  createdAt: string;
}

export interface ProjectReceiptsSummary {
  finalValue: number | null;
  received: number;
  remaining: number | null;
  receipts: ClientReceipt[];
}

export interface ClientReceiptInput {
  description: string;
  amount: number;
  dueDate?: string | null;
  receivedAt?: string | null;
  method?: string | null;
}

export const RECEIPT_METHODS = ["Pix", "Boleto", "Cartão", "Transferência", "Dinheiro", "Cheque"];

const receiptsPath = (projectId: string) => `/projects/${enc(projectId)}/receipts`;

export const getProjectReceipts = (projectId: string) => call<ProjectReceiptsSummary>(receiptsPath(projectId));
export const createReceipt = (projectId: string, input: ClientReceiptInput) =>
  send<ClientReceipt>(receiptsPath(projectId), "POST", input);
export const markReceiptReceived = (projectId: string, id: string, receivedAt?: string) =>
  send<ClientReceipt>(`${receiptsPath(projectId)}/${enc(id)}/receive`, "PATCH", { receivedAt });
export const markReceiptPending = (projectId: string, id: string) =>
  send<ClientReceipt>(`${receiptsPath(projectId)}/${enc(id)}/unreceive`, "PATCH");
export const deleteReceipt = (projectId: string, id: string) =>
  send<unknown>(`${receiptsPath(projectId)}/${enc(id)}`, "DELETE");

// ---------- Company expenses ----------

export const EXPENSE_CATEGORIES = [
  { value: "salario", label: "Salários" },
  { value: "encargos", label: "Encargos" },
  { value: "pro_labore", label: "Pró-labore" },
  { value: "aluguel", label: "Aluguel" },
  { value: "energia_agua", label: "Energia e água" },
  { value: "internet_telefone", label: "Internet e telefone" },
  { value: "contador", label: "Contador" },
  { value: "impostos_simples", label: "Impostos (Simples)" },
  { value: "veiculo", label: "Veículo" },
  { value: "outras", label: "Outras despesas" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];

export const expenseCategoryLabel = (category: string) =>
  EXPENSE_CATEGORIES.find((item) => item.value === category)?.label ?? category;

export interface CompanyExpense {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  competenceMonth: string;
  isPaid: boolean;
  paidAt: string | null;
  employeeId: string | null;
  employeeName: string | null;
  createdAt: string;
}

export interface CompanyExpenseInput {
  category: ExpenseCategory;
  description: string;
  amount: number;
  /** YYYY-MM */
  competenceMonth: string;
  isPaid: boolean;
  paidAt?: string | null;
  employeeId?: string | null;
}

export const listCompanyExpenses = (month: string) => call<CompanyExpense[]>(`/company-expenses?month=${enc(month)}`);
export const createCompanyExpense = (input: CompanyExpenseInput) => send<CompanyExpense>("/company-expenses", "POST", input);
export const updateCompanyExpense = (id: string, input: Partial<Omit<CompanyExpenseInput, "isPaid" | "paidAt">>) =>
  send<CompanyExpense>(`/company-expenses/${enc(id)}`, "PATCH", input);
export const markCompanyExpensePaid = (id: string, paidAt?: string) =>
  send<CompanyExpense>(`/company-expenses/${enc(id)}/pay`, "PATCH", { paidAt });
export const markCompanyExpenseUnpaid = (id: string) => send<CompanyExpense>(`/company-expenses/${enc(id)}/unpay`, "PATCH");
export const deleteCompanyExpense = (id: string) => send<unknown>(`/company-expenses/${enc(id)}`, "DELETE");
/** Moves the selected expenses to another competence month (YYYY-MM). */
export const moveCompanyExpensesToMonth = (ids: string[], month: string) =>
  send<{ moved: number; notFound: string[] }>("/company-expenses/move-month", "POST", { ids, month });
export const copyPreviousMonthExpenses = (month: string) =>
  send<{ copied: number; expenses: CompanyExpense[] }>("/company-expenses/copy-previous", "POST", { month });

// ---------- Fixed assets ----------

export interface FixedAsset {
  id: string;
  name: string;
  purchaseValue: number;
  purchaseDate: string;
  usefulLifeMonths: number;
  disposedAt: string | null;
  disposalValue: number | null;
}

export type FixedAssetInput = Omit<FixedAsset, "id">;

export const listFixedAssets = () => call<FixedAsset[]>("/fixed-assets");
export const createFixedAsset = (input: FixedAssetInput) => send<FixedAsset>("/fixed-assets", "POST", input);
export const updateFixedAsset = (id: string, input: Partial<FixedAssetInput>) =>
  send<FixedAsset>(`/fixed-assets/${enc(id)}`, "PATCH", input);
export const deleteFixedAsset = (id: string) => send<unknown>(`/fixed-assets/${enc(id)}`, "DELETE");

// ---------- Loans ----------

export type LoanMovementType = "entrada" | "amortizacao" | "juros";

export const LOAN_MOVEMENT_LABELS: Record<LoanMovementType, string> = {
  entrada: "Entrada (dinheiro recebido)",
  amortizacao: "Amortização (pagamento do principal)",
  juros: "Juros pagos",
};

export interface LoanMovement {
  id: string;
  loanId: string;
  date: string;
  type: LoanMovementType;
  amount: number;
}

export interface Loan {
  id: string;
  lender: string;
  description: string | null;
  balance: number;
  movements: LoanMovement[];
}

export const listLoans = () => call<Loan[]>("/loans");
export const createLoan = (input: { lender: string; description?: string | null }) => send<Loan>("/loans", "POST", input);
export const deleteLoan = (id: string) => send<unknown>(`/loans/${enc(id)}`, "DELETE");
export const createLoanMovement = (loanId: string, input: { date: string; type: LoanMovementType; amount: number }) =>
  send<LoanMovement>(`/loans/${enc(loanId)}/movements`, "POST", input);
export const deleteLoanMovement = (loanId: string, id: string) =>
  send<unknown>(`/loans/${enc(loanId)}/movements/${enc(id)}`, "DELETE");

// ---------- Owner movements ----------

export type OwnerMovementType = "aporte" | "retirada";

export interface OwnerMovement {
  id: string;
  ownerName: string;
  date: string;
  type: OwnerMovementType;
  amount: number;
  description: string | null;
}

export type OwnerMovementInput = Omit<OwnerMovement, "id">;

export const listOwnerMovements = () => call<OwnerMovement[]>("/owner-movements");
export const createOwnerMovement = (input: OwnerMovementInput) => send<OwnerMovement>("/owner-movements", "POST", input);
export const deleteOwnerMovement = (id: string) => send<unknown>(`/owner-movements/${enc(id)}`, "DELETE");

// ---------- Opening balance ----------

export interface OpeningBalance {
  cutoffDate: string;
  cash: number;
  shareCapital: number;
  retainedEarnings: number;
}

export interface OpeningBalanceState {
  openingBalance: OpeningBalance | null;
  /** Balance check on the eve of the cutoff: diff must be zero. */
  check: { date: string; diff: number; suggestedRetainedEarnings: number } | null;
}

export const getOpeningBalance = () => call<OpeningBalanceState>("/finance/opening-balance");
export const saveOpeningBalance = (input: OpeningBalance) =>
  send<OpeningBalanceState>("/finance/opening-balance", "PUT", input);

// ---------- Statements ----------

export type EntryKind =
  | "project"
  | "project_cost"
  | "client_receipt"
  | "company_expense"
  | "fixed_asset"
  | "loan_movement"
  | "owner_movement"
  | "opening_balance";

export interface StatementEntry {
  kind: EntryKind;
  id: string;
  label: string;
  amount: number;
  date: string | null;
  projectId?: string;
}

export interface StatementLine {
  key: string;
  label: string;
  amount: number;
  entries: StatementEntry[];
}

export interface IncomeStatement {
  from: string;
  to: string;
  revenue: StatementLine;
  costOfProjects: StatementLine;
  grossProfit: number;
  operatingExpenses: StatementLine[];
  totalOperatingExpenses: number;
  depreciation: StatementLine;
  assetDisposalResult: StatementLine;
  interest: StatementLine;
  netIncome: number;
  warnings: string[];
}

export interface BalanceSheet {
  date: string;
  assets: StatementLine[];
  totalAssets: number;
  liabilities: StatementLine[];
  totalLiabilities: number;
  equity: StatementLine[];
  totalEquity: number;
  diff: number;
}

export interface CashFlowGroup {
  key: "operating" | "investing" | "financing";
  label: string;
  lines: StatementLine[];
  total: number;
}

export interface CashFlowStatement {
  from: string;
  to: string;
  openingCash: number;
  groups: CashFlowGroup[];
  netChange: number;
  closingCash: number;
}

export interface RetainedEarningsRow {
  key: string;
  label: string;
  shareCapital: number;
  retainedEarnings: number;
  total: number;
  entries: StatementEntry[];
}

export interface RetainedEarningsStatement {
  from: string;
  to: string;
  rows: RetainedEarningsRow[];
  closingShareCapital: number;
  closingRetainedEarnings: number;
}

export interface FinancialStatements {
  from: string;
  to: string;
  incomeStatement: IncomeStatement;
  retainedEarnings: RetainedEarningsStatement;
  balanceSheet: BalanceSheet;
  cashFlow: CashFlowStatement;
  checks: { balanceDiff: number; cashDiff: number; retainedEarningsDiff: number };
  openingBalance: OpeningBalance | null;
}

export const getFinancialStatements = (from: string, to: string) =>
  call<FinancialStatements>(`/finance/statements?from=${enc(from)}&to=${enc(to)}`);

export interface FinanceSummary {
  /** Date of the cash and receivables (end of the period, or today). */
  date: string;
  from: string;
  to: string;
  month: string;
  /** Net income of the period (current month when no period). */
  netIncome: number;
  cash: number | null;
  receivables: number | null;
  hasOpeningBalance: boolean;
}

export const getFinanceSummary = (period?: { from: string; to: string } | null) =>
  call<FinanceSummary>(period ? `/finance/summary?from=${enc(period.from)}&to=${enc(period.to)}` : "/finance/summary");

// ---------- Dates ----------

/** Today as YYYY-MM-DD in the browser's local time. */
export const todayLocal = () => new Date().toLocaleDateString("en-CA");

export const currentMonth = () => todayLocal().slice(0, 7);

/** YYYY-MM -> { from: first day, to: last day }. */
export const monthRange = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return { from: `${month}-01`, to: last };
};

export const shiftMonth = (month: string, delta: number) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7);
};

export const formatMonthLong = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

/** Accepts "1.234,56", "1234.56" or "1234,56". */
export const parseMoney = (value: string) => {
  const text = value.trim();
  if (!text) return NaN;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  return Number(normalized);
};
