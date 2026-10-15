import { useRef } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ProtectedRoute = () => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  // Set once this guard has shown the app to a signed-in person. Losing the
  // session after that is a sign-out, not a signed-out deep link.
  const wasSignedIn = useRef(false);
  if (isAuthenticated) wasSignedIn.current = true;

  if (loading) return null; // or spinner
  if (isAuthenticated) return <Outlet />;

  // Sign-in sends the person back here afterwards (useSignIn reads `from`),
  // e.g. the Connect Claude consent page with its request id. Not after a
  // sign-out: the page belonged to the last person, and whoever signs in next
  // (often another role) would land on its 403 instead of their own home.
  if (wasSignedIn.current) return <Navigate to="/login" replace />;
  const from = `${location.pathname}${location.search}`;
  return <Navigate to="/login" replace state={{ from }} />;
};

export default ProtectedRoute;
