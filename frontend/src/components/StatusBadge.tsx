const statusStyles: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-amber-500/20 text-amber-300",
  pre_approved: "bg-blue-500/20 text-blue-300",
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
  entrada: "bg-success/20 text-success",
  saida: "bg-destructive/20 text-destructive",
};

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  pending: "Pendente",
  pre_approved: "Pre-aprovado",
  sent: "Enviado",
  approved: "Aprovado",
  rejected: "Rejeitado",
  cutting: "Corte",
  assembly: "Montagem",
  finishing: "Acabamento",
  quality_check: "Controle",
  delivered: "Entregue",
  entry: "Entrada",
  exit: "Saída",
  entrada: "Entrada",
  saida: "Saída",
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
