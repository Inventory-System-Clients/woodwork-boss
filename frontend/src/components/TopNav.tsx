import { Bell, Search } from "lucide-react";

interface TopNavProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function TopNav({ title, subtitle, action }: TopNavProps) {
  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-8 bg-background/50 backdrop-blur-md shrink-0">
      <div>
        <h1 className="text-sm font-medium text-muted-foreground">
          {subtitle && <span>{subtitle} / </span>}
          <span className="text-foreground">{title}</span>
        </h1>
      </div>
      <div className="flex items-center gap-3">
        {action}
        <button className="p-2 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
          <Search className="h-4 w-4" />
        </button>
        <button className="p-2 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full" />
        </button>
      </div>
    </header>
  );
}
