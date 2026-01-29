import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Sidebar = () => {
  const { role, logout } = useAuth();
  const navigate = useNavigate();
  const linkClass = "block px-4 py-2 rounded text-gray-700 hover:bg-gray-100";

  const activeClass = "bg-blue-600 text-white hover:bg-blue-600";

  return (
    <aside className="w-64 min-h-screen bg-white border-r">
      {role === "Superadmin" && (
        <div className="p-4 text-xl font-semibold border-b">
          Super Admin Panel
        </div>
      )}

      {role === "Superadmin" && (
        <nav className="p-4 space-y-1">
          <NavLink
            to="countries"
            className={({ isActive }) =>
              isActive ? `${linkClass} ${activeClass}` : linkClass
            }
          >
            Countries
          </NavLink>

          <NavLink
            to="companies"
            className={({ isActive }) =>
              isActive ? `${linkClass} ${activeClass}` : linkClass
            }
          >
            Companies
          </NavLink>
          <NavLink
            to="categories"
            className={({ isActive }) =>
              isActive ? `${linkClass} ${activeClass}` : linkClass
            }
          >
            Categories
          </NavLink>

          <NavLink
            to="sites"
            className={({ isActive }) =>
              isActive ? `${linkClass} ${activeClass}` : linkClass
            }
          >
            Sites
          </NavLink>

          <NavLink
            to="users"
            className={({ isActive }) =>
              isActive ? `${linkClass} ${activeClass}` : linkClass
            }
          >
            Users
          </NavLink>
          <NavLink
            to="emission-factors"
            className={({ isActive }) =>
              isActive ? `${linkClass} ${activeClass}` : linkClass
            }
          >
            Emission Factors
          </NavLink>
          <NavLink
            to="manage-columns"
            className={({ isActive }) =>
              isActive ? `${linkClass} ${activeClass}` : linkClass
            }
          >
            Manage Columns
          </NavLink>
          <NavLink
            to="column-config"
            className={({ isActive }) =>
              isActive ? `${linkClass} ${activeClass}` : linkClass
            }
          >
            Column Config
          </NavLink>
          <NavLink
            to="units"
            className={({ isActive }) =>
              isActive ? `${linkClass} ${activeClass}` : linkClass
            }
          >
            Manage Units
          </NavLink>
          <NavLink
            to="products"
            className={({ isActive }) =>
              isActive ? `${linkClass} ${activeClass}` : linkClass
            }
          >
            Products
          </NavLink>
          <NavLink
            to="upload-data"
            className={({ isActive }) =>
              isActive ? `${linkClass} ${activeClass}` : linkClass
            }
          >
            Upload Data
          </NavLink>
        </nav>
      )}
      {role === "User" && (
        <nav className="p-4 space-y-1">
          <NavLink
            to="data-entry"
            className={({ isActive }) =>
              isActive ? `${linkClass} ${activeClass}` : linkClass
            }
          >
            Data Entry
          </NavLink>
          <NavLink
            to="my-emissions"
            className={({ isActive }) =>
              isActive ? `${linkClass} ${activeClass}` : linkClass
            }
          >
            My Emissions
          </NavLink>
          <NavLink
            to="production-data"
            className={({ isActive }) =>
              isActive ? `${linkClass} ${activeClass}` : linkClass
            }
          >
            Production Data
          </NavLink>
        </nav>
      )}
      {role === "Manager" && (
        <nav className="p-4 space-y-1">
          <NavLink
            to="manager-dashboard"
            className={({ isActive }) =>
              isActive ? `${linkClass} ${activeClass}` : linkClass
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="data-manage"
            className={({ isActive }) =>
              isActive ? `${linkClass} ${activeClass}` : linkClass
            }
          >
            Emissions Data
          </NavLink>
          <NavLink
            to="manage-production-data"
            className={({ isActive }) =>
              isActive ? `${linkClass} ${activeClass}` : linkClass
            }
          >
            Production Data
          </NavLink>
        </nav>
      )}
      <div>
        <button
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          Log out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
