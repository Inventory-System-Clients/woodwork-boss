import { LayoutDashboard, Users, User, Briefcase, Box, Package, FileText, Hammer, Truck } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/auth/AuthProvider";
import type { UserRole } from "@/auth/types";
import { useLocation } from "react-router-dom";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  allowedRoles: UserRole[];
}

const navItems = [
  { title: "Painel", url: "/", icon: LayoutDashboard, allowedRoles: ["admin", "gerente", "funcionario"] },
  { title: "Clientes", url: "/clients", icon: Users, allowedRoles: ["admin", "gerente"] },
  { title: "Funcionários", url: "/employees", icon: User, allowedRoles: ["admin", "gerente"] },
  { title: "Equipes", url: "/teams", icon: Briefcase, allowedRoles: ["admin", "gerente"] },
  { title: "Produtos", url: "/products", icon: Box, allowedRoles: ["admin", "gerente"] },
  { title: "Estoque", url: "/stock", icon: Package, allowedRoles: ["admin", "gerente"] },
  { title: "Orçamentos", url: "/budgets", icon: FileText, allowedRoles: ["admin", "gerente"] },
  { title: "Produção", url: "/production", icon: Hammer, allowedRoles: ["admin", "gerente", "funcionario"] },
  { title: "Logística", url: "/logistics", icon: Truck, allowedRoles: ["admin", "gerente", "funcionario"] },
] satisfies NavItem[];

export function AppSidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();

  const visibleItems = navItems.filter((item) => {
    if (!user) {
      return false;
    }

    return item.allowedRoles.includes(user.role);
  });

  return (
    <aside className="w-60 min-h-screen border-r border-border bg-sidebar flex flex-col shrink-0">
      <div className="h-14 px-5 flex items-center gap-3 border-b border-border">
        <img
          src="/image.png"
          alt="Logo Mais Quiosque"
          className="w-12 h-12 rounded-sm object-cover"
        />
        <span className="font-bold tracking-tight text-base bg-gradient-to-r from-[#F9E27D] via-[#D4AF37] to-[#A67C00] bg-clip-text text-transparent drop-shadow-[0_1px_2px_rgba(94,61,0,0.45)]">
          Mais Quiosque
        </span>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {visibleItems.map((item) => {
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
        {user && (
          <div className="mb-3">
            <p className="text-xs font-medium text-foreground truncate">{user.name}</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{user.role}</p>
          </div>
        )}

        <button
          onClick={logout}
          className="w-full mb-2 px-3 py-2 text-xs rounded border border-border hover:bg-secondary transition-colors text-muted-foreground"
        >
          Sair
        </button>

        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Marcenaria v1.0</p>
      </div>
    </aside>
  );
}
