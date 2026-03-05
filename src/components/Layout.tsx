import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

const Layout = () => {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="ml-16 min-h-screen">
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;
