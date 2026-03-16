const statusStyles: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/20 text-primary",
  approved: "bg-success/20 text-success",
  rejected: "bg-destructive/20 text-destructive",
  cutting: "bg-primary/20 text-primary",
  assembly: "bg-blue-500/20 text-blue-400",
  finishing: "bg-purple-500/20 text-purple-400",
  quality_check: "bg-cyan-500/20 text-cyan-400",
  delivered: "bg-success/20 text-success",
  entry: "bg-success/20 text-success",
  exit: "bg-destructive/20 text-destructive",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  approved: "Approved",
  rejected: "Rejected",
  cutting: "Cutting",
  assembly: "Assembly",
  finishing: "Finishing",
  quality_check: "QC",
  delivered: "Delivered",
  entry: "Entry",
  exit: "Exit",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
        statusStyles[status] || "bg-muted text-muted-foreground"
      }`}
    >
      {statusLabels[status] || status}
    </span>
  );
}
