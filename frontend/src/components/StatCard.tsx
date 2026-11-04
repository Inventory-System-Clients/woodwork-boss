import { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  subtitle?: string;
  highlight?: boolean;
  /** Makes the card clickable (e.g. to open a detail report). */
  onClick?: () => void;
}

export function StatCard({ title, value, icon, subtitle, highlight, onClick }: StatCardProps) {
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`border border-border rounded bg-card p-5 text-left w-full ${highlight ? "border-l-2 border-l-primary" : ""} ${
        onClick ? "cursor-pointer hover:bg-surface-hover transition-colors focus:outline-none focus:ring-1 focus:ring-ring" : ""
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{title}</p>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className="text-2xl font-bold font-mono tabular-nums text-foreground">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </Wrapper>
  );
}
