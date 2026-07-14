import Layout from "../components/Layout";
import CompanyPage from "../pages/CompanyPage";
import CompanyOnboardingPage from "../pages/CompanyOnboardingPage";
import CountryPage from "../pages/CountryPage";
import Login from "../pages/Login";
import AdminLogin from "../pages/AdminLogin";
import ResetPassword from "../pages/ResetPassword";
import SitePage from "../pages/SitePage";
import SuperAdminPage from "../pages/SuperAdminPage";
import ProtectedRoute from "./ProtectedRoute";
import RootRedirect from "./RootRedirect";
import CategoryPage from "../pages/CategoryPage";
import UserPage from "../pages/UserPage";
import EmissionFactorPage from "../pages/EmissionFactorPage";
import ColumnPage from "../pages/ColumnPage";
import ColumnConfig from "../pages/ColumnConfig";
import UserDataEntryPage from "../pages/UserDataEntryPage";
import UnitsPage from "../pages/UnitsPage";
import ManagerPage from "../pages/ManagerPage";
import ManagerDashboard from "../pages/ManagerDashboard/ManagerDashboard";
import ManagerProductionDataPage from "../pages/ManagerProductionDataPage";
import ProductPage from "../pages/ProductPage";
import ProductionDataPage from "../pages/ProductionDataPage";
import UploadPage from "../pages/UploadPage";
import UserEmissionsPage from "../pages/UserEmissionsPage";
import EdeReports from "../pages/Reports/EdePreports";
import SbtiMain from "../pages/sbti/SbtiMain";
import GhgReport from "../pages/GhgReport/GhgReport";
import BrandSettings from "../pages/BrandSettings/BrandSettings";
import CategoryMappingPage from "../pages/CategoryMappingPage";
import ManagerUsersPage from "../pages/ManagerUsers";
import CompanyAdminUsersPage from "../pages/CompanyAdmin/CompanyAdminUsersPage";
import NotificationsPage from "../pages/NotificationsPage";
import SettingsPage from "../pages/SettingsPage";

const routes = [
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/superadmin/login",
    element: <AdminLogin />,
  },
  {
    path: "/reset-password",
    element: <ResetPassword />,
  },
  {
    path: "/",
    element: <RootRedirect />,
  },
  {
    path: "",
    element: <ProtectedRoute />,
    children: [
      {
        path: "",
        element: <Layout />,
        children: [
          {
            path: "superadmin", // Keep original
            element: <SuperAdminPage />,
          },
          {
            path: "admin/dashboard", // Alias for SuperAdmin
            element: <SuperAdminPage />,
          },
          {
            path: "company/dashboard", // Alias for ManagerDashboard
            element: <ManagerDashboard />,
          },
          {
            path: "countries",
            element: <CountryPage />,
          },
          {
            path: "categories",
            element: <CategoryPage />,
          },
          {
            path: "companies",
            element: <CompanyPage />,
          },
          {
            path: "companies/onboard",
            element: <CompanyOnboardingPage />,
          },
          {
            path: "sites",
            element: <SitePage />,
          },
          {
            path: "users",
            element: <UserPage />,
          },
          {
            path: "emission-factors",
            element: <EmissionFactorPage />,
          },
          {
            path: "category-mappings",
            element: <CategoryMappingPage />,
          },
          {
            path: "manage-columns",
            element: <ColumnPage />,
          },
          {
            path: "column-config",
            element: <ColumnConfig />,
          },
          {
            path: "units",
            element: <UnitsPage />,
          },
          {
            path: "data-entry",
            element: <UserDataEntryPage />,
          },
          {
            path: "data-manage",
            element: <ManagerPage />,
          },
          {
            path: "manager-dashboard",
            element: <ManagerDashboard />
          },
          {
            path: "ede-reports",
            element: <EdeReports />
          },
          {
            path : "sbti-commitment",
            element : <SbtiMain/>
          },
          {
            path: "ghg-reports",
            element: <GhgReport />
          },
          {
            path: "brand-settings",
            element: <BrandSettings />
          },
          {
            path: "products",
            element: <ProductPage />
          },
          {
            path: "production-data",
            element: <ProductionDataPage />
          },
          {
            path: "upload-data",
            element: <UploadPage />
          },
          {
            path: "my-emissions",
            element: <UserEmissionsPage />
          },
          {
            path: "manage-production-data",
            element: <ManagerProductionDataPage />
          },
          {
            path: "manage-users",
            element: <ManagerUsersPage />
          },
          {
            path: "admin-company/users",
            element: <CompanyAdminUsersPage />
          },
          {
            path: "notifications",
            element: <NotificationsPage />
          },
          {
            path: "settings",
            element: <SettingsPage />
          }
        ],
      },
    ],
  },
  {
    path: "*",
    element: <Login />,
  },
];

export default routes;
