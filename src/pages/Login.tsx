import { useActionState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const Login = () => {
  const navigate = useNavigate()
  const { login} = useAuth();
  const [_formState, formAction] = useActionState(
    async (_prevData: any, data: any) => {
      // Handle form submission logic here
      try {
      const role = await login(data.get("email"), data.get("password"));
         switch (role) {
          case "Superadmin":
            navigate("/home/superadmin");
            break;
          case "User":
            navigate("/home/data-entry");
            break;
          case "Admin":
            navigate("/home/admin");
            break;
          case "Employee":
            navigate("/home/expenses");
            break;
          case "Manager":
            navigate("/home/data-manage");
            break;
          default:
            break;
        }
      } catch (error) {
          console.log(error);
          
      }

    },
    null,
  );
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form
        action={formAction}
        className="w-full max-w-sm bg-white p-6 rounded-lg shadow"
      >
        <h2 className="text-2xl font-semibold text-center mb-6">Login</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            name="email"
            required
            className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            name="password"
            required
            className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
          />
        </div>

        <button className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-60">
          Login
        </button>
      </form>
    </div>
  );
};

export default Login;
