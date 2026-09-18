import { Fragment, ReactNode, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  mono?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  rowHighlight?: (item: T) => string;
  /** When provided, clicking a row toggles an extra detail row rendered by this function. */
  renderExpanded?: (item: T) => ReactNode;
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  onRowClick,
  emptyMessage = "Sem dados. Clique para adicionar o primeiro item.",
  rowHighlight,
  renderExpanded,
}: DataTableProps<T>) {
  const { t } = useLanguage();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="w-full overflow-x-auto overflow-y-hidden border border-border rounded bg-card">
      <table className="w-full min-w-[640px] text-left border-collapse">
        <thead>
          <tr className="border-b border-border bg-secondary/30">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-3 sm:px-4 py-2 sm:py-3 text-[10px] uppercase tracking-widest text-muted-foreground font-bold"
              >
                {t(col.header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 sm:px-4 py-8 text-center text-muted-foreground text-sm">
                {t(emptyMessage)}
              </td>
            </tr>
          ) : (
            data.map((row) => {
              const isExpanded = expandedId === row.id;
              const isClickable = Boolean(onRowClick || renderExpanded);

              return (
                <Fragment key={row.id}>
                  <tr
                    className={`hover:bg-surface-hover transition-colors ${
                      isClickable ? "cursor-pointer" : ""
                    } ${rowHighlight ? rowHighlight(row) : ""}`}
                    onClick={() => {
                      if (renderExpanded) {
                        setExpandedId(isExpanded ? null : row.id);
                      }

                      onRowClick?.(row);
                    }}
                  >
                    {columns.map((col, index) => (
                      <td
                        key={col.key}
                        className={`px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm ${
                          col.mono ? "font-mono tabular-nums" : ""
                        } text-foreground/90 ${col.className || ""}`}
                      >
                        {index === 0 && renderExpanded ? (
                          <span className="inline-flex items-center gap-1.5">
                            <ChevronRight
                              className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                                isExpanded ? "rotate-90" : ""
                              }`}
                            />
                            {col.render
                              ? col.render(row)
                              : String((row as Record<string, unknown>)[col.key] ?? "")}
                          </span>
                        ) : col.render ? (
                          col.render(row)
                        ) : (
                          String((row as Record<string, unknown>)[col.key] ?? "")
                        )}
                      </td>
                    ))}
                  </tr>
                  {renderExpanded && isExpanded && (
                    <tr className="bg-secondary/10">
                      <td colSpan={columns.length} className="px-3 sm:px-4 py-3">
                        {renderExpanded(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
