import { useActionState, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { forgotPassword } from "../services/authService";

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  // Forgot password modal state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [_formState, formAction] = useActionState(
    async (_prevData: any, data: any) => {
      try {
        const role = await login(data.get("email"), data.get("password"));

        if (role === "Superadmin") {
          // Strictly redirect SuperAdmin to their own login or show error
          // setForgotMessage({ type: "error", text: "Please use /admin/login for SuperAdmin access" });
          // For now, let's just redirect them to the admin login if they try here?
          // Or better, show an error.
          throw new Error("SuperAdmins must login at /admin/login");
        }

        switch (role) {
          case "User":
            navigate("/data-entry");
            break;
          case "Admin":
            navigate("/company/dashboard"); // Changed from /home/admin
            break;
          case "Employee":
            navigate("/expenses");
            break;
          case "Manager":
            navigate("/company/dashboard"); // Changed from /home/data-manage to company dashboard as requested
            break;
          default:
            break;
        }
      } catch (error) {
        console.log(error);
      }
    },
    null
  );

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setForgotMessage({ type: "error", text: "Please enter your email address" });
      return;
    }

    setForgotLoading(true);
    setForgotMessage(null);

    try {
      const response = await forgotPassword(forgotEmail);
      setForgotMessage({ type: "success", text: response.message });
      setForgotEmail("");
    } catch (error: any) {
      setForgotMessage({
        type: "error",
        text: error.response?.data?.message || "Failed to send reset email. Please try again.",
      });
    } finally {
      setForgotLoading(false);
    }
  };

  const closeForgotPasswordModal = () => {
    setShowForgotPassword(false);
    setForgotEmail("");
    setForgotMessage(null);
  };

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

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            name="password"
            required
            className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
          />
        </div>

        <div className="mb-6 text-right">
          <button
            type="button"
            onClick={() => setShowForgotPassword(true)}
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            Forgot Password?
          </button>
        </div>

        <button className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-60">
          Login
        </button>
      </form>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={closeForgotPasswordModal}
          />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <button
              onClick={closeForgotPasswordModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-xl font-semibold mb-2">Forgot Password</h3>
            <p className="text-gray-600 text-sm mb-6">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            <form onSubmit={handleForgotPassword}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Email Address</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full border px-3 py-2 rounded focus:outline-none focus:ring focus:ring-blue-300"
                  required
                />
              </div>

              {forgotMessage && (
                <div
                  className={`mb-4 p-3 rounded text-sm ${forgotMessage.type === "success"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                >
                  {forgotMessage.text}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeForgotPasswordModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {forgotLoading ? "Sending..." : "Send Reset Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
