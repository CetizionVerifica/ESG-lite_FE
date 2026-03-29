import { useState, useEffect } from "react";
import { Users, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import api from "../api/axios";

interface UserStatus {
  user_id: number;
  name: string;
  email: string;
  site_name: string;
  submission_count: number;
  status: "submitted" | "missing";
}

const SubmissionStatusWidget = () => {
  const { isDark } = useTheme();
  const [users, setUsers] = useState<UserStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    // Default to previous month
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  });

  useEffect(() => {
    setLoading(true);
    api
      .get("/manager/submission-status", { params: { month } })
      .then((res) => setUsers(res.data.users || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [month]);

  const submitted = users.filter((u) => u.status === "submitted").length;
  const missing = users.filter((u) => u.status === "missing").length;

  const cardClass = isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200";
  const textClass = isDark ? "text-white" : "text-gray-900";
  const mutedClass = isDark ? "text-slate-400" : "text-gray-500";

  // Generate month options (last 6 months)
  const monthOptions: { value: string; label: string }[] = [];
  for (let i = 1; i <= 6; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    monthOptions.push({ value: val, label });
  }

  return (
    <div className={`rounded-xl border p-5 ${cardClass}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users size={18} className={isDark ? "text-blue-400" : "text-blue-600"} />
          <h3 className={`text-sm font-semibold ${textClass}`}>Submission Status</h3>
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className={`text-xs px-2 py-1 rounded-lg border ${
            isDark
              ? "bg-slate-700 border-slate-600 text-slate-300"
              : "bg-gray-50 border-gray-200 text-gray-700"
          }`}
        >
          {monthOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Summary badges */}
      <div className="flex gap-3 mb-4">
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg ${isDark ? "bg-green-900/30 text-green-400" : "bg-green-50 text-green-700"}`}>
          <CheckCircle size={14} />
          {submitted} submitted
        </div>
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg ${isDark ? "bg-red-900/30 text-red-400" : "bg-red-50 text-red-700"}`}>
          <AlertCircle size={14} />
          {missing} missing
        </div>
      </div>

      {/* User list */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className={`animate-spin ${mutedClass}`} size={20} />
        </div>
      ) : users.length === 0 ? (
        <p className={`text-sm text-center py-4 ${mutedClass}`}>No users found</p>
      ) : (
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
          {users.map((u) => (
            <div
              key={u.user_id}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                isDark ? "hover:bg-slate-700/50" : "hover:bg-gray-50"
              }`}
            >
              <div className="min-w-0">
                <div className={`font-medium truncate ${textClass}`}>{u.name}</div>
                <div className={`text-xs truncate ${mutedClass}`}>{u.site_name}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {u.status === "submitted" ? (
                  <span className={`flex items-center gap-1 text-xs ${isDark ? "text-green-400" : "text-green-600"}`}>
                    <CheckCircle size={14} />
                    {u.submission_count}
                  </span>
                ) : (
                  <span className={`flex items-center gap-1 text-xs ${isDark ? "text-red-400" : "text-red-500"}`}>
                    <AlertCircle size={14} />
                    Missing
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SubmissionStatusWidget;
