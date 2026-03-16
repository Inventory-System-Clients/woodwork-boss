import { ReactNode } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { TopNav } from "@/components/TopNav";

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function DashboardLayout({ children, title, subtitle, action }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopNav title={title} subtitle={subtitle} action={action} />
        <main className="flex-1 p-8 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
