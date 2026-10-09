import ReactDOM from "react-dom/client";
import "./index.css";
import AppRoutes from "./routes/AppRoutes.tsx";
import newUiRoutes from "./routes/newUiRoutes.tsx";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { NotificationProvider } from "./context/NotificationContext";
import { withNewUiRoutes } from "./lib/featureFlags";
import { createQueryClient } from "./lib/queryClient";

const router = createBrowserRouter(withNewUiRoutes(AppRoutes, newUiRoutes));
const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <RouterProvider router={router} />
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);
