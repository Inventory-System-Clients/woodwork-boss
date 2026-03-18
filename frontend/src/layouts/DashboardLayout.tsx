import { ReactNode, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { TopNav } from "@/components/TopNav";

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function DashboardLayout({ children, title, subtitle, action }: DashboardLayoutProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground overflow-hidden">
      <AppSidebar
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopNav
          title={title}
          subtitle={subtitle}
          action={action}
          onToggleSidebar={() => setMobileSidebarOpen((current) => !current)}
        />
        <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
