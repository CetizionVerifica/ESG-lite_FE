import { useActionState, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const AdminLogin = () => {
    const navigate = useNavigate();
    const { login } = useAuth();

    const [error, setError] = useState<string | null>(null);

    const [_formState, formAction] = useActionState(
        async (_prevData: any, data: any) => {
            setError(null);
            try {
                const role = await login(data.get("email"), data.get("password"));
                if (role === "Superadmin") {
                    navigate("/admin/dashboard");
                } else {
                    setError("Access Restricted. Only SuperAdmins allowed.");
                    // Optionally logout or clear state if login successful but wrong role
                }
            } catch (err: any) {
                console.error(err);
                setError("Invalid credentials or server error");
            }
        },
        null
    );

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <form
                action={formAction}
                className="w-full max-w-sm bg-white p-8 rounded-lg shadow-lg"
            >
                <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">SuperAdmin Login</h2>

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
                        {error}
                    </div>
                )}

                <div className="mb-4">
                    <label className="block text-sm font-medium mb-1 text-gray-700">Email</label>
                    <input
                        type="email"
                        name="email"
                        required
                        className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="superadmin@example.com"
                    />
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-medium mb-1 text-gray-700">Password</label>
                    <input
                        type="password"
                        name="password"
                        required
                        className="w-full border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="••••••••"
                    />
                </div>

                <button className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-60">
                    Login
                </button>
            </form>
        </div>
    );
};

export default AdminLogin;
