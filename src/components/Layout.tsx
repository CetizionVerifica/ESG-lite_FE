import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { useAuth } from "../context/AuthContext";

const Layout = () => {
  const { role } = useAuth();
  const showTopBar = role !== "Superadmin";

  return (
    <div className="h-screen overflow-hidden">
      <Sidebar />
      <div className="ml-16 h-screen flex flex-col">
        {showTopBar && <TopBar />}
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Layout;
