import { LayoutDashboard, Users, Box, Package, FileText, Hammer, Truck } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";

const navItems = [
  { title: "Painel", url: "/", icon: LayoutDashboard },
  { title: "Clientes", url: "/clients", icon: Users },
  { title: "Produtos", url: "/products", icon: Box },
  { title: "Estoque", url: "/stock", icon: Package },
  { title: "Orçamentos", url: "/budgets", icon: FileText },
  { title: "Produção", url: "/production", icon: Hammer },
  { title: "Logística", url: "/logistics", icon: Truck },
];

export function AppSidebar() {
  const location = useLocation();

  return (
    <aside className="w-60 min-h-screen border-r border-border bg-sidebar flex flex-col shrink-0">
      <div className="h-14 px-5 flex items-center gap-3 border-b border-border">
        <div className="w-6 h-6 bg-primary rounded-sm" />
        <span className="font-bold tracking-tight text-base text-foreground">CERNE</span>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = item.url === "/" ? location.pathname === "/" : location.pathname.startsWith(item.url);
          return (
            <NavLink
              key={item.url}
              to={item.url}
              end={item.url === "/"}
              className={`flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                isActive
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
              activeClassName=""
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.title}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="p-4 border-t border-border">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Marcenaria v1.0</p>
      </div>
    </aside>
  );
}
