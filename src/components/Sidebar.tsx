import { useState, useRef, useCallback } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  Globe,
  Building2,
  FolderTree,
  MapPin,
  Users,
  Gauge,
  Columns3,
  Settings,
  Scale,
  Package,
  Upload,
  ClipboardEdit,
  FileSpreadsheet,
  Factory,
  LayoutDashboard,
  LogOut,
  Sun,
  Moon,
  ArrowLeftRight,
  Bell,
  Palette,
} from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const Sidebar = () => {
  const { role, logout, user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
    setIsExpanded(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    collapseTimer.current = setTimeout(() => {
      setIsExpanded(false);
    }, 200);
  }, []);

  // Get user initials for avatar
  const getInitials = (name: string) => {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const superadminLinks: NavItem[] = [
    { to: "countries", label: "Countries", icon: <Globe size={20} /> },
    { to: "companies", label: "Companies", icon: <Building2 size={20} /> },
    { to: "categories", label: "Categories", icon: <FolderTree size={20} /> },
    { to: "sites", label: "Sites", icon: <MapPin size={20} /> },
    { to: "users", label: "Users", icon: <Users size={20} /> },
    { to: "emission-factors", label: "Emission Factors", icon: <Gauge size={20} /> },
    { to: "category-mappings", label: "Category Mappings", icon: <ArrowLeftRight size={20} /> },
    { to: "manage-columns", label: "Manage Columns", icon: <Columns3 size={20} /> },
    { to: "column-config", label: "Column Config", icon: <Settings size={20} /> },
    { to: "units", label: "Manage Units", icon: <Scale size={20} /> },
    { to: "products", label: "Products", icon: <Package size={20} /> },
    { to: "upload-data", label: "Upload Data", icon: <Upload size={20} /> },
    { to : "ede-reports", label: "EDE Reports", icon: <FolderTree size={20} /> },
        { to : "ghg-reports", label : "GHG Report", icon : <FolderTree size={20} />},
    { to: "brand-settings", label: "Brand Settings", icon: <Palette size={20} /> }

  ];

  const userLinks: NavItem[] = [
    { to: "data-entry", label: "Data Entry", icon: <ClipboardEdit size={20} /> },
    { to: "my-emissions", label: "My Emissions", icon: <FileSpreadsheet size={20} /> },
    { to: "production-data", label: "Production Data", icon: <Factory size={20} /> },
    { to: "notifications", label: "Notifications", icon: <Bell size={20} /> },
    { to: "settings", label: "Settings", icon: <Settings size={20} /> },
  ];

  const managerLinks: NavItem[] = [
    { to: "manager-dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
    { to: "data-manage", label: "Emissions Data", icon: <FileSpreadsheet size={20} /> },
    { to: "manage-production-data", label: "Production Data", icon: <Factory size={20} /> },
    { to: "manage-users", label: "User Access", icon: <Users size={20} /> },
    { to : "ede-reports", label: "EDE Report", icon: <FolderTree size={20} /> },
    { to :"sbti-commitment", label : "SBTi Commitment", icon : <FolderTree size={20} />},
    { to : "ghg-reports", label : "GHG Report", icon : <FolderTree size={20} />},
    { to: "notifications", label: "Notifications", icon: <Bell size={20} /> },
    { to: "settings", label: "Settings", icon: <Settings size={20} /> },
  ];

  const adminLinks: NavItem[] = [
    { to: "admin-company/users", label: "Users", icon: <Users size={20} /> },
    { to: "notifications", label: "Notifications", icon: <Bell size={20} /> },
    { to: "settings", label: "Settings", icon: <Settings size={20} /> },
  ];

  const getNavLinks = (): NavItem[] => {
    switch (role) {
      case "Superadmin":
        return superadminLinks;
      case "Admin":
        return adminLinks;
      case "User":
        return userLinks;
      case "Manager":
        return managerLinks;
      default:
        return [];
    }
  };

  const navLinks = getNavLinks();

  return (
    <aside
      className={`
        fixed left-0 top-0 h-screen z-40
        ${isExpanded ? "w-64 shadow-2xl" : "w-16"}
        bg-slate-900 text-slate-300
        transition-[width] duration-200 ease-out
        flex flex-col
      `}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-700 shrink-0">
        <div className={`flex items-center gap-3 overflow-hidden ${isExpanded ? "opacity-100" : "opacity-0"} transition-opacity duration-200`}>
          <img
            src="/logo.png"
            alt="Logo"
            className="w-20 h-20 rounded-lg object-contain shrink-0 mt-3"
          />
          <span className="font-semibold text-white whitespace-nowrap">ESG Lite</span>
        </div>
        {!isExpanded && (
          <img
            src="/logo.png"
            alt="Logo"
            className="w-10 h-10 rounded-lg object-contain mx-auto"
          />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto overflow-x-hidden">
        {navLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
              ${isActive
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`
            }
          >
            <span className="shrink-0">{link.icon}</span>
            <span
              className={`whitespace-nowrap transition-all duration-200 ${
                isExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 absolute"
              }`}
            >
              {link.label}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-slate-700 space-y-1 shrink-0">
        {/* User Profile */}
        {user && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
            <div className="w-8 h-8 bg-linear-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shrink-0">
              <span className="text-white font-semibold text-xs">
                {getInitials(user.name)}
              </span>
            </div>
            <div
              className={`overflow-hidden transition-all duration-200 ${
                isExpanded ? "opacity-100 w-auto" : "opacity-0 w-0 absolute"
              }`}
            >
              <p className="text-sm font-medium text-white truncate max-w-35">
                {user.name}
              </p>
              <p className="text-xs text-slate-400 truncate max-w-35">
                {user.email}
              </p>
            </div>
          </div>
        )}

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
            text-slate-400 hover:bg-slate-800 hover:text-white
            transition-all duration-200
          `}
        >
          {isDark ? (
            <Sun size={20} className="shrink-0 text-amber-400" />
          ) : (
            <Moon size={20} className="shrink-0 text-blue-400" />
          )}
          <span
            className={`whitespace-nowrap transition-all duration-200 ${
              isExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 absolute"
            }`}
          >
            {isDark ? "Light Mode" : "Dark Mode"}
          </span>
        </button>

        {/* Logout */}
        <button
          onClick={() => {
            logout();
            navigate("/login");
          }}
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
            text-slate-400 hover:bg-red-500/10 hover:text-red-400
            transition-all duration-200
          `}
        >
          <LogOut size={20} className="shrink-0" />
          <span
            className={`whitespace-nowrap transition-all duration-200 ${
              isExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 absolute"
            }`}
          >
            Log out
          </span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
