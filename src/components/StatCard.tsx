import { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  subtitle?: string;
  highlight?: boolean;
}

export function StatCard({ title, value, icon, subtitle, highlight }: StatCardProps) {
  return (
    <div className={`border border-border rounded bg-card p-5 ${highlight ? "border-l-2 border-l-primary" : ""}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{title}</p>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className="text-2xl font-bold font-mono tabular-nums text-foreground">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}
