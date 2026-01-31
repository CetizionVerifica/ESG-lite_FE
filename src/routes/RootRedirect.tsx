import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const RootRedirect = () => {
    const { role, isAuthenticated, loading } = useAuth();

    console.log("RootRedirect: State", { role, isAuthenticated, loading });

    if (loading) return <div>Loading Auth...</div>; // Visible loading state

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (role === "Superadmin") {
        return <Navigate to="/admin/dashboard" replace />;
    }

    if (role === "Admin" || role === "Manager") {
        return <Navigate to="/company/dashboard" replace />;
    }

    if (role === "User") {
        return <Navigate to="/data-entry" replace />; // Or /my-emissions
    }

    // Default fallback
    return <Navigate to="/admin/dashboard" replace />;
};

export default RootRedirect;
