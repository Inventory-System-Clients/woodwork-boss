import { Navigate } from "react-router-dom";
import { useRoleAccess } from "@/auth/AuthProvider";
import LogisticsPage from "./Logistics.tsx";

/**
 * Home of the app. Managers land on Logistics (it replaced the old dashboard);
 * employees have a simplified area whose home is the daily hours page.
 */
const Index = () => {
  const { isEmployee } = useRoleAccess();

  if (isEmployee) {
    return <Navigate to="/hours" replace />;
  }

  return <LogisticsPage />;
};

export default Index;
