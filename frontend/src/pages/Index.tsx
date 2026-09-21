import { Navigate } from "react-router-dom";
import { useRoleAccess } from "@/auth/AuthProvider";
import DashboardPage from "./Dashboard.tsx";

/**
 * Home of the app. Admins land on the dashboard (projects, costs and hours);
 * employees have a simplified area whose home is the daily hours page (Bater ponto).
 */
const Index = () => {
  const { isEmployee } = useRoleAccess();

  if (isEmployee) {
    return <Navigate to="/hours" replace />;
  }

  return <DashboardPage />;
};

export default Index;
