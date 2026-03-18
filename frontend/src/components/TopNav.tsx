import { Bell, PanelLeft, Search } from "lucide-react";

interface TopNavProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  onToggleSidebar?: () => void;
}

export function TopNav({ title, subtitle, action, onToggleSidebar }: TopNavProps) {
  return (
    <header className="min-h-14 border-b border-border flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 lg:px-8 py-2 bg-background/50 backdrop-blur-md shrink-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          onClick={onToggleSidebar}
          className="md:hidden p-2 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Abrir menu lateral"
        >
          <PanelLeft className="h-4 w-4" />
        </button>

        <h1 className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
          {subtitle && <span>{subtitle} / </span>}
          <span className="text-foreground">{title}</span>
        </h1>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 shrink-0 w-full sm:w-auto justify-end">
        {action}

        <button className="hidden sm:inline-flex p-2 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
          <Search className="h-4 w-4" />
        </button>

        <button className="hidden sm:inline-flex p-2 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full" />
        </button>
      </div>
    </header>
  );
}
