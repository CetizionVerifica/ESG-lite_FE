import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, CheckCheck, BellOff, Filter, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useNotifications } from "../context/NotificationContext";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  NotificationItem,
} from "../services/notificationService";

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0 && date.getDate() === now.getDate()) return "Today";
  if (diffDays <= 1 && date.getDate() === now.getDate() - 1) return "Yesterday";
  if (diffDays < 7) return "This Week";
  if (diffDays < 30) return "This Month";
  return "Earlier";
}

interface TypeStyle {
  icon: React.ReactNode;
  bg: string; darkBg: string;
  color: string; darkColor: string;
  border: string; darkBorder: string;
}

function getTypeStyle(type: string): TypeStyle {
  if (type.includes("APPROVED")) return {
    icon: <CheckCircle size={18} />,
    bg: "bg-emerald-100", darkBg: "bg-emerald-500/15",
    color: "text-emerald-600", darkColor: "text-emerald-400",
    border: "border-l-emerald-500", darkBorder: "border-l-emerald-400",
  };
  if (type.includes("REJECTED")) return {
    icon: <XCircle size={18} />,
    bg: "bg-red-100", darkBg: "bg-red-500/15",
    color: "text-red-600", darkColor: "text-red-400",
    border: "border-l-red-500", darkBorder: "border-l-red-400",
  };
  if (type.includes("REMINDER")) return {
    icon: <Clock size={18} />,
    bg: "bg-amber-100", darkBg: "bg-amber-500/15",
    color: "text-amber-600", darkColor: "text-amber-400",
    border: "border-l-amber-500", darkBorder: "border-l-amber-400",
  };
  if (type.includes("ESCALATION")) return {
    icon: <AlertTriangle size={18} />,
    bg: "bg-amber-100", darkBg: "bg-amber-500/15",
    color: "text-amber-600", darkColor: "text-amber-400",
    border: "border-l-amber-500", darkBorder: "border-l-amber-400",
  };
  return {
    icon: <Bell size={18} />,
    bg: "bg-gray-100", darkBg: "bg-[#1e2d40]",
    color: "text-gray-600", darkColor: "text-[#64748b]",
    border: "border-l-gray-400", darkBorder: "border-l-[#475569]",
  };
}

type ReadFilter = "all" | "unread";
type TypeFilter = "all" | "approved" | "rejected" | "reminder";

// ─── Component ──────────────────────────────────────────────────────────────

const NotificationsPage = () => {
  const { isDark: d } = useTheme();
  const { refresh } = useNotifications();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const limit = 30;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNotifications(page, limit);
      setNotifications(res.notifications);
      setTotal(res.total);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleMarkRead = async (id: number) => {
    await markAsRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    refresh();
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    refresh();
  };

  const handleClick = async (n: NotificationItem) => {
    if (!n.read) await handleMarkRead(n.id);
    if (n.link) navigate(n.link);
  };

  // Filters
  let filtered = notifications;
  if (readFilter === "unread") filtered = filtered.filter((n) => !n.read);
  if (typeFilter === "approved") filtered = filtered.filter((n) => n.type.includes("APPROVED"));
  if (typeFilter === "rejected") filtered = filtered.filter((n) => n.type.includes("REJECTED"));
  if (typeFilter === "reminder") filtered = filtered.filter((n) => n.type.includes("DEADLINE") || n.type.includes("ESCALATION"));

  // Group by date
  const groups: { label: string; items: NotificationItem[] }[] = [];
  for (const n of filtered) {
    const label = getDateGroup(n.created_at);
    const existing = groups.find((g) => g.label === label);
    if (existing) existing.items.push(n);
    else groups.push({ label, items: [n] });
  }

  const totalPages = Math.ceil(total / limit);
  const unreadInView = notifications.filter((n) => !n.read).length;

  const filterBtn = (active: boolean) =>
    `px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
      active
        ? d
          ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30"
          : "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
        : d
          ? "text-[#64748b] hover:bg-[#1a2332] hover:text-[#94a3b8]"
          : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
    }`;

  return (
    <div className={`min-h-screen ${d ? "bg-[#0b1120]" : "bg-gray-50"}`}>
      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Header card */}
        <div className={`rounded-2xl p-6 mb-6 ${d ? "bg-[#131c2a] border border-[#1e2d40]" : "bg-white border border-gray-200 shadow-sm"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${d ? "bg-blue-500/15" : "bg-blue-50"}`}>
                <Bell size={22} className={d ? "text-blue-400" : "text-blue-600"} />
              </div>
              <div>
                <h1 className={`text-lg font-bold ${d ? "text-white" : "text-gray-900"}`}>Notifications</h1>
                <p className={`text-sm ${d ? "text-[#94a3b8]" : "text-gray-500"}`}>
                  {total} total{unreadInView > 0 ? ` \u00B7 ${unreadInView} unread` : ""}
                </p>
              </div>
            </div>
            {unreadInView > 0 && (
              <button
                onClick={handleMarkAllRead}
                className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl cursor-pointer transition-colors ${
                  d
                    ? "text-blue-400 hover:bg-blue-500/10 ring-1 ring-blue-500/20"
                    : "text-blue-600 hover:bg-blue-50 ring-1 ring-blue-200"
                }`}
              >
                <CheckCheck size={16} />
                Mark all read
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className={`flex items-center gap-5 mb-6 pb-4 border-b ${d ? "border-[#1e2d40]" : "border-gray-200"}`}>
          <div className="flex gap-1.5">
            {(["all", "unread"] as ReadFilter[]).map((f) => (
              <button key={f} onClick={() => setReadFilter(f)} className={filterBtn(readFilter === f)}>
                {f === "all" ? "All" : "Unread"}
              </button>
            ))}
          </div>
          <span className={`w-px h-5 ${d ? "bg-[#1e2d40]" : "bg-gray-200"}`} />
          <div className="flex items-center gap-1.5">
            <Filter size={14} className={d ? "text-[#475569]" : "text-gray-400"} />
            {(["all", "approved", "rejected", "reminder"] as TypeFilter[]).map((f) => (
              <button key={f} onClick={() => setTypeFilter(f)} className={filterBtn(typeFilter === f)}>
                {f === "all" ? "All types" : f === "approved" ? "Approvals" : f === "rejected" ? "Rejections" : "Reminders"}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className={`py-20 text-center ${d ? "text-[#64748b]" : "text-gray-400"}`}>
            <div className={`w-6 h-6 border-2 rounded-full mx-auto mb-3 animate-spin ${d ? "border-[#253449] border-t-blue-400" : "border-gray-200 border-t-blue-600"}`} />
            <p className="text-sm">Loading notifications...</p>
          </div>
        ) : groups.length === 0 ? (
          <div className={`py-24 text-center`}>
            <div className={`w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center ${d ? "bg-[#131c2a]" : "bg-gray-100"}`}>
              <BellOff size={28} className={d ? "text-[#475569]" : "text-gray-300"} />
            </div>
            <p className={`text-base font-semibold ${d ? "text-[#94a3b8]" : "text-gray-500"}`}>
              {readFilter === "unread" ? "No unread notifications" : typeFilter !== "all" ? `No ${typeFilter} notifications` : "No notifications yet"}
            </p>
            <p className={`text-sm mt-1 ${d ? "text-[#475569]" : "text-gray-400"}`}>
              {readFilter === "unread" ? "You're all caught up" : "Notifications will appear here when your data is reviewed"}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <div key={group.label}>
                {/* Date group header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className={`text-[11px] font-bold uppercase tracking-widest ${d ? "text-[#475569]" : "text-gray-400"}`}>
                    {group.label}
                  </span>
                  <div className={`flex-1 h-px ${d ? "bg-[#1e2d40]" : "bg-gray-200"}`} />
                </div>

                {/* Cards */}
                <div className="space-y-2.5">
                  {group.items.map((n) => {
                    const ts = getTypeStyle(n.type);
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleClick(n)}
                        className={`w-full flex items-start gap-4 px-5 py-4 text-left rounded-2xl border-l-[3px] transition-all duration-150 cursor-pointer group ${
                          d ? ts.darkBorder : ts.border
                        } ${
                          !n.read
                            ? d
                              ? "bg-[#131c2a] hover:bg-[#1a2332] ring-1 ring-[#1e2d40]"
                              : "bg-white hover:bg-blue-50/30 ring-1 ring-gray-200 shadow-sm"
                            : d
                              ? "bg-[#0f1923] hover:bg-[#131c2a] ring-1 ring-[#1a2332]/50"
                              : "bg-gray-50/80 hover:bg-white ring-1 ring-gray-100"
                        }`}
                      >
                        {/* Icon */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          d ? `${ts.darkBg} ${ts.darkColor}` : `${ts.bg} ${ts.color}`
                        }`}>
                          {ts.icon}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-sm font-bold ${d ? "text-white" : "text-gray-900"}`}>
                              {n.title}
                            </span>
                            {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                            <span className={`ml-auto text-[11px] font-medium shrink-0 ${d ? "text-[#475569]" : "text-gray-400"}`}>
                              {timeAgo(n.created_at)}
                            </span>
                          </div>
                          <p className={`text-[13px] leading-relaxed ${d ? "text-[#94a3b8]" : "text-gray-600"}`}>
                            {n.message}
                          </p>
                          <span className={`text-[11px] mt-1.5 block opacity-0 group-hover:opacity-100 transition-opacity ${d ? "text-[#475569]" : "text-gray-400"}`}>
                            {formatDate(n.created_at)}
                          </span>
                        </div>

                        {/* Mark read */}
                        {!n.read && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id); }}
                            className={`p-1.5 rounded-lg shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${
                              d
                                ? "text-[#475569] hover:text-[#94a3b8] hover:bg-[#1e2d40]"
                                : "text-gray-300 hover:text-blue-600 hover:bg-blue-50"
                            }`}
                            title="Mark as read"
                          >
                            <Check size={16} />
                          </button>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-10">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className={`px-4 py-2 text-sm rounded-xl font-semibold disabled:opacity-30 cursor-pointer transition-colors ${
                d ? "bg-[#131c2a] text-[#94a3b8] hover:bg-[#1a2332] ring-1 ring-[#1e2d40]" : "bg-white text-gray-700 hover:bg-gray-100 ring-1 ring-gray-200"
              }`}
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const pageNum = page <= 3 ? i + 1 : page - 2 + i;
                if (pageNum > totalPages || pageNum < 1) return null;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-9 h-9 text-sm rounded-lg font-semibold cursor-pointer transition-colors ${
                      pageNum === page
                        ? "bg-blue-500/20 text-blue-400"
                        : d
                          ? "text-[#64748b] hover:bg-[#1a2332]"
                          : "text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className={`px-4 py-2 text-sm rounded-xl font-semibold disabled:opacity-30 cursor-pointer transition-colors ${
                d ? "bg-[#131c2a] text-[#94a3b8] hover:bg-[#1a2332] ring-1 ring-[#1e2d40]" : "bg-white text-gray-700 hover:bg-gray-100 ring-1 ring-gray-200"
              }`}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;
