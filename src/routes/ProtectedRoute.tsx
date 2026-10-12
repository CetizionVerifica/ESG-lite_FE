import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ProtectedRoute = () => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // or spinner

  // Sign-in sends the person back here afterwards (useSignIn reads `from`),
  // e.g. the Connect Claude consent page with its request id.
  const from = `${location.pathname}${location.search}`;
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace state={{ from }} />;
};

export default ProtectedRoute;
