import { LayoutDashboard, Users, User, Briefcase, Box, Package, FileText, Hammer, Truck } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/auth/AuthProvider";
import type { UserRole } from "@/auth/types";
import { useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";

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
  { title: "Estoque", url: "/products", icon: Box, allowedRoles: ["admin", "gerente"] },
  { title: "Movimentação de Estoque", url: "/stock", icon: Package, allowedRoles: ["admin", "gerente"] },
  { title: "Orçamentos", url: "/budgets", icon: FileText, allowedRoles: ["admin", "gerente"] },
  { title: "Produção", url: "/production", icon: Hammer, allowedRoles: ["admin", "gerente", "funcionario"] },
  { title: "Logística", url: "/logistics", icon: Truck, allowedRoles: ["admin", "gerente", "funcionario"] },
] satisfies NavItem[];

interface AppSidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function AppSidebar({ mobileOpen = false, onCloseMobile }: AppSidebarProps) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const previousPathRef = useRef(location.pathname);

  const visibleItems = navItems.filter((item) => {
    if (!user) {
      return false;
    }

    return item.allowedRoles.includes(user.role);
  });

  useEffect(() => {
    if (previousPathRef.current !== location.pathname && mobileOpen) {
      onCloseMobile?.();
    }

    previousPathRef.current = location.pathname;
  }, [location.pathname, mobileOpen, onCloseMobile]);

  const handleLogout = () => {
    onCloseMobile?.();
    logout();
  };

  const renderSidebarContent = (isMobile = false) => (
    <>
      <div className="h-14 px-4 sm:px-5 flex items-center gap-3 border-b border-border">
        <img
          src="/image.png"
          alt="Logo Mais Quiosque"
          className="w-10 h-10 sm:w-12 sm:h-12 rounded-sm object-cover"
        />
        <span className="font-bold tracking-tight text-sm sm:text-base bg-gradient-to-r from-[#F9E27D] via-[#D4AF37] to-[#A67C00] bg-clip-text text-transparent drop-shadow-[0_1px_2px_rgba(94,61,0,0.45)]">
          Mais Quiosque
        </span>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive = item.url === "/" ? location.pathname === "/" : location.pathname.startsWith(item.url);

          return (
            <NavLink
              key={item.url}
              to={item.url}
              end={item.url === "/"}
              onClick={() => {
                if (isMobile) {
                  onCloseMobile?.();
                }
              }}
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
          onClick={handleLogout}
          className="w-full mb-2 px-3 py-2 text-xs rounded border border-border hover:bg-secondary transition-colors text-muted-foreground"
        >
          Sair
        </button>

        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Marcenaria v1.0</p>
      </div>
    </>
  );

  return (
    <>
      <aside className="hidden md:flex w-60 min-h-screen border-r border-border bg-sidebar flex-col shrink-0">
        {renderSidebarContent()}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 bg-black/50"
            onClick={onCloseMobile}
            aria-label="Fechar menu"
          />

          <aside className="relative h-full w-[85vw] max-w-72 border-r border-border bg-sidebar flex flex-col shadow-2xl animate-fade-in">
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}
    </>
  );
}
