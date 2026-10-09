import ReactDOM from "react-dom/client";
import "./index.css";
import AppRoutes from "./routes/AppRoutes.tsx";
import newUiRoutes from "./routes/newUiRoutes.tsx";
import devRoutes from "./routes/devRoutes.tsx";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./theme/ThemeProvider";
import { NotificationProvider } from "./context/NotificationContext";
import { withNewUiRoutes } from "./lib/featureFlags";
import { createQueryClient } from "./lib/queryClient";
import { ToastProvider } from "./ui/Toast";

const router = createBrowserRouter([
  ...devRoutes,
  ...withNewUiRoutes(AppRoutes, newUiRoutes),
]);
const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider>
        <ToastProvider>
          <NotificationProvider>
            <RouterProvider router={router} />
          </NotificationProvider>
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);
