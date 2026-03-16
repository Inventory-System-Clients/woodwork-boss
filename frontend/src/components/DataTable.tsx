import { ReactNode } from "react";

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
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  onRowClick,
  emptyMessage = "Sem dados. Clique para adicionar o primeiro item.",
  rowHighlight,
}: DataTableProps<T>) {
  return (
    <div className="w-full overflow-hidden border border-border rounded bg-card">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border bg-secondary/30">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-[10px] uppercase tracking-widest text-muted-foreground font-bold"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground text-sm">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={row.id}
                className={`hover:bg-surface-hover transition-colors ${
                  onRowClick ? "cursor-pointer" : ""
                } ${rowHighlight ? rowHighlight(row) : ""}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-sm ${
                      col.mono ? "font-mono tabular-nums" : ""
                    } text-foreground/90 ${col.className || ""}`}
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
