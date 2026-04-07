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
import StockPage from "./pages/Stock.tsx";
import BudgetsPage from "./pages/Budgets.tsx";
import ProductionPage from "./pages/Production.tsx";
import LogisticsPage from "./pages/Logistics.tsx";
import ProductionTrackingPublicPage from "./pages/ProductionTrackingPublic.tsx";

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
                <Route path="/logistics" element={<LogisticsPage />} />
                <Route path="/forbidden" element={<ForbiddenPage />} />

                <Route element={<RequireRoles allowedRoles={["admin", "gerente"]} />}>
                  <Route path="/clients" element={<ClientsPage />} />
                  <Route path="/employees" element={<EmployeesPage />} />
                  <Route path="/teams" element={<TeamsPage />} />
                  <Route path="/products" element={<ProductsPage />} />
                  <Route path="/stock" element={<StockPage />} />
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
