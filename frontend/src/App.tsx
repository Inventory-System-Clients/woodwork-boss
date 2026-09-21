import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/auth/AuthProvider";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { RequireAuth, RequireRoles } from "@/auth/guards";
import Index from "./pages/Index.tsx";
import LoginPage from "./pages/Login.tsx";
import ForbiddenPage from "./pages/Forbidden.tsx";
import NotFound from "./pages/NotFound.tsx";
import ClientsPage from "./pages/Clients.tsx";
import EmployeesPage from "./pages/Employees.tsx";
import TeamsPage from "./pages/Teams.tsx";
import ProductsPage from "./pages/Products.tsx";
import BudgetsPage from "./pages/Budgets.tsx";
import ProductionPage from "./pages/Production.tsx";
import ProductionTrackingPublicPage from "./pages/ProductionTrackingPublic.tsx";
import WorkHoursPage from "./pages/WorkHours.tsx";
import ProjectsPage from "./pages/Projects.tsx";
import ProjectDetailPage from "./pages/ProjectDetail.tsx";
import HoursReportPage from "./pages/HoursReport.tsx";
import LogisticsPage from "./pages/Logistics.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <LanguageProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/acompanhar-producao/:token" element={<ProductionTrackingPublicPage />} />

              <Route element={<RequireAuth />}>
                <Route path="/" element={<Index />} />
                <Route path="/production" element={<ProductionPage />} />
                <Route path="/forbidden" element={<ForbiddenPage />} />

                <Route path="/hours" element={<WorkHoursPage />} />

                <Route element={<RequireRoles allowedRoles={["admin"]} />}>
                  <Route path="/projects" element={<ProjectsPage />} />
                  <Route path="/projects/:id" element={<ProjectDetailPage />} />
                  <Route path="/hours-report" element={<HoursReportPage />} />
                  <Route path="/logistics" element={<LogisticsPage />} />
                  <Route path="/clients" element={<ClientsPage />} />
                  <Route path="/employees" element={<EmployeesPage />} />
                  <Route path="/teams" element={<TeamsPage />} />
                  <Route path="/products" element={<ProductsPage />} />
                  <Route path="/budgets" element={<BudgetsPage />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </LanguageProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
