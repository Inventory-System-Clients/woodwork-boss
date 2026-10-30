import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight, Download } from "lucide-react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { toast } from "@/components/ui/use-toast";
import { exportStatementsToExcel } from "@/lib/financeExcel";
import {
  currentMonth,
  getFinancialStatements,
  monthRange,
  type FinancialStatements,
  type StatementEntry,
  type StatementLine,
} from "@/services/finance";
import { formatCurrency, formatDateOnly } from "@/services/projects";

const TABS = [
  { key: "dre", label: "DRE" },
  { key: "lucros", label: "Lucros Acumulados" },
  { key: "balanco", label: "Balanço" },
  { key: "caixa", label: "Fluxo de Caixa" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** One printed row of a statement. Rows with a `line` can be expanded to show the records behind them. */
interface Row {
  label: string;
  amount?: number | null;
  line?: StatementLine;
  kind?: "title" | "total" | "grand" | "spacer";
  indent?: boolean;
}

const ENTRY_KIND_LABELS: Record<StatementEntry["kind"], string> = {
  project: "Projeto",
  project_cost: "Custo",
  client_receipt: "Recebimento",
  company_expense: "Despesa",
  fixed_asset: "Bem",
  loan_movement: "Empréstimo",
  owner_movement: "Sócio",
  opening_balance: "Saldo inicial",
};

const isOff = (value: number) => Math.abs(value) >= 0.01;

function money(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  return <span className={value < 0 ? "text-destructive" : ""}>{formatCurrency(value)}</span>;
}

function EntryList({ entries }: { entries: StatementEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum lançamento.</p>;
  }

  return (
    <ul className="text-xs divide-y divide-border/40 max-h-72 overflow-y-auto">
      {entries.map((entry, index) => (
        <li key={`${entry.kind}-${entry.id}-${index}`} className="flex items-center justify-between gap-3 py-1">
          <span className="min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-2">{ENTRY_KIND_LABELS[entry.kind]}</span>
            {entry.projectId ? (
              <Link to={`/projects/${entry.projectId}`} className="hover:underline">
                {entry.label}
              </Link>
            ) : (
              entry.label
            )}
            {entry.date && <span className="text-muted-foreground"> · {formatDateOnly(entry.date)}</span>}
          </span>
          <span className="font-mono tabular-nums shrink-0">{money(entry.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

function StatementTable({ rows, columns = ["Valor"] }: { rows: Row[]; columns?: string[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="w-full overflow-x-auto border border-border rounded bg-card">
      <table className="w-full min-w-[480px] text-sm border-collapse">
        <tbody className="divide-y divide-border/40">
          {rows.map((row, index) => {
            if (row.kind === "spacer") {
              return (
                <tr key={index}>
                  <td colSpan={columns.length + 1} className="h-3" />
                </tr>
              );
            }

            const key = `${index}-${row.label}`;
            const canExpand = Boolean(row.line);
            const isExpanded = expanded === key;

            return (
              <Fragment key={key}>
                <tr
                  onClick={() => canExpand && setExpanded(isExpanded ? null : key)}
                  className={`${canExpand ? "cursor-pointer hover:bg-surface-hover" : ""} ${
                    row.kind === "title" ? "bg-secondary/30" : ""
                  } ${row.kind === "grand" ? "bg-primary/10" : ""}`}
                >
                  <td
                    className={`px-3 sm:px-4 py-2 ${row.indent ? "pl-8 sm:pl-10" : ""} ${
                      row.kind === "title" ? "text-[11px] uppercase tracking-widest font-bold text-muted-foreground" : ""
                    } ${row.kind === "total" || row.kind === "grand" ? "font-bold" : ""}`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {canExpand && (
                        <ChevronRight
                          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        />
                      )}
                      {row.label}
                    </span>
                  </td>
                  <td
                    className={`px-3 sm:px-4 py-2 text-right font-mono tabular-nums whitespace-nowrap ${
                      row.kind === "total" || row.kind === "grand" ? "font-bold" : ""
                    }`}
                  >
                    {money(row.amount)}
                  </td>
                </tr>
                {isExpanded && row.line && (
                  <tr className="bg-secondary/10">
                    <td colSpan={columns.length + 1} className="px-3 sm:px-10 py-2">
                      <EntryList entries={row.line.entries} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const lineRow = (line: StatementLine, indent = false): Row => ({ label: line.label, amount: line.amount, line, indent });
const spacer: Row = { label: "", kind: "spacer" };

function IncomeStatementView({ data }: { data: FinancialStatements }) {
  const dre = data.incomeStatement;

  return (
    <StatementTable
      rows={[
        lineRow(dre.revenue),
        lineRow(dre.costOfProjects),
        { label: "(=) Lucro bruto", amount: dre.grossProfit, kind: "total" },
        spacer,
        { label: "Despesas operacionais", kind: "title" },
        ...(dre.operatingExpenses.length > 0
          ? dre.operatingExpenses.map((line) => lineRow(line, true))
          : [{ label: "Nenhuma despesa fixa lançada no período", amount: 0, indent: true }]),
        { label: "(=) Total de despesas operacionais", amount: dre.totalOperatingExpenses, kind: "total" },
        lineRow(dre.depreciation),
        ...(dre.assetDisposalResult.entries.length > 0 ? [lineRow(dre.assetDisposalResult)] : []),
        lineRow(dre.interest),
        spacer,
        { label: "(=) Lucro líquido", amount: dre.netIncome, kind: "grand" },
      ]}
    />
  );
}

function RetainedEarningsView({ data }: { data: FinancialStatements }) {
  const statement = data.retainedEarnings;

  return (
    <div className="w-full overflow-x-auto border border-border rounded bg-card">
      <table className="w-full min-w-[560px] text-sm border-collapse">
        <thead>
          <tr className="border-b border-border bg-secondary/30">
            {["", "Capital social", "Lucros acumulados", "Total"].map((header) => (
              <th key={header} className="px-3 sm:px-4 py-2 text-[10px] uppercase tracking-widest text-muted-foreground font-bold text-right first:text-left">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {statement.rows.map((row) => {
            const strong = row.key === "opening" || row.key === "closing";

            return (
              <tr key={row.key} className={row.key === "closing" ? "bg-primary/10" : ""}>
                <td className={`px-3 sm:px-4 py-2 ${strong ? "font-bold" : ""}`}>
                  {row.label}
                  {row.entries.length > 0 && (
                    <span className="block text-xs text-muted-foreground">
                      {row.entries.map((entry) => `${entry.label} (${formatDateOnly(entry.date)}) ${formatCurrency(entry.amount)}`).join(" · ")}
                    </span>
                  )}
                </td>
                {[row.shareCapital, row.retainedEarnings, row.total].map((value, index) => (
                  <td key={index} className={`px-3 sm:px-4 py-2 text-right font-mono tabular-nums ${strong ? "font-bold" : ""}`}>
                    {money(value)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BalanceSheetView({ data }: { data: FinancialStatements }) {
  const balance = data.balanceSheet;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Posição em {formatDateOnly(balance.date)} (fim do período).</p>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <StatementTable
          rows={[
            { label: "Ativo", kind: "title" },
            ...balance.assets.map((line) => lineRow(line, true)),
            { label: "Total do ativo", amount: balance.totalAssets, kind: "grand" },
          ]}
        />
        <StatementTable
          rows={[
            { label: "Passivo", kind: "title" },
            ...balance.liabilities.map((line) => lineRow(line, true)),
            { label: "Total do passivo", amount: balance.totalLiabilities, kind: "total" },
            { label: "Patrimônio líquido", kind: "title" },
            ...balance.equity.map((line) => lineRow(line, true)),
            { label: "Total do patrimônio líquido", amount: balance.totalEquity, kind: "total" },
            { label: "Total do passivo + PL", amount: balance.totalLiabilities + balance.totalEquity, kind: "grand" },
          ]}
        />
      </div>
    </div>
  );
}

function CashFlowView({ data }: { data: FinancialStatements }) {
  const flow = data.cashFlow;

  return (
    <StatementTable
      rows={[
        { label: "Saldo inicial de caixa", amount: flow.openingCash, kind: "total" },
        ...flow.groups.flatMap<Row>((group) => [
          spacer,
          { label: group.label, kind: "title" },
          ...group.lines.map((line) => lineRow(line, true)),
          { label: `Total ${group.label.toLowerCase()}`, amount: group.total, kind: "total" },
        ]),
        spacer,
        { label: "Variação do caixa no período", amount: flow.netChange, kind: "total" },
        { label: "Saldo final de caixa", amount: flow.closingCash, kind: "grand" },
      ]}
    />
  );
}

const FinanceStatementsPage = () => {
  const initial = monthRange(currentMonth());
  const [period, setPeriod] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [tab, setTab] = useState<TabKey>("dre");
  const [data, setData] = useState<FinancialStatements | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError("");

    try {
      setData(await getFinancialStatements(period.from, period.to));
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : "Falha ao calcular as demonstrações.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [period.from, period.to]);

  const applyDraft = () => {
    if (!draft.from || !draft.to || draft.from > draft.to) {
      toast({ variant: "destructive", title: "Informe um período válido (início antes do fim)." });
      return;
    }

    setPeriod(draft);
  };

  const exportExcel = async () => {
    if (!data) return;
    setIsExporting(true);

    try {
      await exportStatementsToExcel(data);
    } catch (exportError) {
      toast({
        variant: "destructive",
        title: "Não foi possível gerar o Excel",
        description: exportError instanceof Error ? exportError.message : undefined,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const checks = data?.checks;
  const hasCheckProblem = checks && (isOff(checks.balanceDiff) || isOff(checks.cashDiff) || isOff(checks.retainedEarningsDiff));

  return (
    <DashboardLayout title="Demonstrações financeiras" subtitle="Financeiro">
      <div className="animate-fade-in space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <span className="block text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Mês</span>
              <input
                type="month"
                value={draft.from.slice(0, 7) === draft.to.slice(0, 7) ? draft.from.slice(0, 7) : ""}
                onChange={(event) => {
                  if (!event.target.value) return;
                  const range = monthRange(event.target.value);
                  setDraft(range);
                  setPeriod(range);
                }}
                className="px-3 py-2 bg-secondary/50 border border-border rounded text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-[11px] uppercase tracking-wider text-muted-foreground font-medium">De</span>
              <input type="date" value={draft.from} onChange={(event) => setDraft((c) => ({ ...c, from: event.target.value }))} className="px-3 py-2 bg-secondary/50 border border-border rounded text-sm" />
            </label>
            <label className="space-y-1">
              <span className="block text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Até</span>
              <input type="date" value={draft.to} onChange={(event) => setDraft((c) => ({ ...c, to: event.target.value }))} className="px-3 py-2 bg-secondary/50 border border-border rounded text-sm" />
            </label>
            <button onClick={applyDraft} className="px-3 py-2 text-xs font-bold rounded border border-border hover:bg-secondary">
              APLICAR
            </button>
          </div>
          <button
            onClick={() => void exportExcel()}
            disabled={!data || isExporting}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            <Download className="h-4 w-4" /> {isExporting ? "GERANDO..." : "EXPORTAR EXCEL"}
          </button>
        </div>

        {hasCheckProblem && checks && (
          <div className="flex items-start gap-2 rounded border border-destructive bg-destructive/15 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold">A conferência das demonstrações não deu zero.</p>
              <p className="text-xs">
                Ativo − (Passivo + PL): {formatCurrency(checks.balanceDiff)} · Caixa do fluxo − caixa do balanço:{" "}
                {formatCurrency(checks.cashDiff)} · Lucros acumulados: {formatCurrency(checks.retainedEarningsDiff)}. Revise o{" "}
                <Link to="/finance/registers?aba=saldo-inicial" className="underline">
                  saldo inicial
                </Link>
                .
              </p>
            </div>
          </div>
        )}

        {data && !data.openingBalance && (
          <div className="rounded border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            Saldo inicial não configurado: o caixa e o patrimônio estão sendo calculados desde o primeiro lançamento.{" "}
            <Link to="/finance/registers?aba=saldo-inicial" className="underline font-bold">
              Configurar saldo inicial
            </Link>
          </div>
        )}

        {data?.incomeStatement.warnings.map((warning) => (
          <div key={warning} className="rounded border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            {warning}
          </div>
        ))}

        {error && (
          <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => void load()} className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20">
              TENTAR NOVAMENTE
            </button>
          </div>
        )}

        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 -mb-px whitespace-nowrap transition-colors ${
                tab === item.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {isLoading && !data && <p className="text-sm text-muted-foreground animate-pulse">Calculando...</p>}

        {data && (
          <div className={isLoading ? "opacity-60 transition-opacity" : ""}>
            <p className="text-xs text-muted-foreground mb-2">
              Período: {formatDateOnly(data.from)} a {formatDateOnly(data.to)}. Clique numa linha para ver os lançamentos que a
              compõem.
            </p>
            {tab === "dre" && <IncomeStatementView data={data} />}
            {tab === "lucros" && <RetainedEarningsView data={data} />}
            {tab === "balanco" && <BalanceSheetView data={data} />}
            {tab === "caixa" && <CashFlowView data={data} />}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default FinanceStatementsPage;
