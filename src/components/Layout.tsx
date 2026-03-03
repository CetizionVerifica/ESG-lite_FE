import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { Toaster } from "react-hot-toast";

const Layout = () => {
  return (
    <div className="flex min-h-screen">
      <Toaster position="top-center" reverseOrder={false} />
      <div className="sticky top-0 h-screen">
        <Sidebar />
      </div>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;
