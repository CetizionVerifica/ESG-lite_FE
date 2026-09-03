
import ReactDOM from "react-dom/client";
import "./index.css";
import AppRoutes from "./routes/AppRoutes.tsx";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { NotificationProvider } from "./context/NotificationContext";

const router = createBrowserRouter(AppRoutes);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <AuthProvider>
      <NotificationProvider>
        <RouterProvider router={router} />
      </NotificationProvider>
    </AuthProvider>
  </ThemeProvider>
);
