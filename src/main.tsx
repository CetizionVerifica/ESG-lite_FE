
import ReactDOM from "react-dom/client";
import "./index.css";
import AppRoutes from "./routes/AppRoutes.tsx";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";

const router = createBrowserRouter(AppRoutes);

ReactDOM.createRoot(document.getElementById("root")!).render(

    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
);
