import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Bell, Check, CheckCheck, BellOff, X, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
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

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const PAGE_TITLES: Record<string, string> = {
  "superadmin": "Dashboard",
  "admin/dashboard": "Dashboard",
  "countries": "Countries",
  "companies": "Companies",
  "categories": "Categories",
  "sites": "Sites",
  "users": "Users",
  "emission-factors": "Emission Factors",
  "category-mappings": "Category Mappings",
  "columns": "Columns",
  "column-configs": "Column Configurations",
  "units": "Units",
  "products": "Products",
  "upload-data": "Upload Data",
  "data-entry": "Data Entry",
  "my-emissions": "My Emissions",
  "production-data": "Production Data",
  "manager-dashboard": "Dashboard",
  "company/dashboard": "Dashboard",
  "data-manage": "Emissions Data",
  "manage-production-data": "Production Data",
  "manage-users": "User Access",
  "ede-reports": "EDE Reports",
  "sbti-commitment": "SBTi Commitment",
  "ghg-reports": "GHG Report",
  "notifications": "Notifications",
  "settings": "Settings",
};

interface TypeStyle {
  icon: React.ReactNode;
  iconBg: string;
  darkIconBg: string;
  iconColor: string;
  darkIconColor: string;
}

function getTypeStyle(type: string): TypeStyle {
  if (type.includes("APPROVED")) return {
    icon: <CheckCircle size={16} />,
    iconBg: "bg-emerald-100", darkIconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-600", darkIconColor: "text-emerald-400",
  };
  if (type.includes("REJECTED")) return {
    icon: <XCircle size={16} />,
    iconBg: "bg-red-100", darkIconBg: "bg-red-500/15",
    iconColor: "text-red-600", darkIconColor: "text-red-400",
  };
  if (type.includes("REMINDER")) return {
    icon: <Clock size={16} />,
    iconBg: "bg-amber-100", darkIconBg: "bg-amber-500/15",
    iconColor: "text-amber-600", darkIconColor: "text-amber-400",
  };
  if (type.includes("ESCALATION")) return {
    icon: <AlertTriangle size={16} />,
    iconBg: "bg-amber-100", darkIconBg: "bg-amber-500/15",
    iconColor: "text-amber-600", darkIconColor: "text-amber-400",
  };
  return {
    icon: <Bell size={16} />,
    iconBg: "bg-gray-100", darkIconBg: "bg-slate-700",
    iconColor: "text-gray-600", darkIconColor: "text-slate-400",
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

const TopBar = () => {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const { unreadCount, latestNotification, refresh } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Bell shake animation
  const [bellShake, setBellShake] = useState(false);

  // Toast notification
  const [toast, setToast] = useState<NotificationItem | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Derive page title from route
  const pathSegment = location.pathname.replace(/^\/+/, "").split("/").slice(0, 2).join("/");
  const pageTitle = PAGE_TITLES[pathSegment] || PAGE_TITLES[pathSegment.split("/")[0]] || "";

  const firstName = user?.name?.split(" ")[0] || "";

  // Handle new notification from SSE — bell shake + toast
  useEffect(() => {
    if (!latestNotification) return;
    setNotifications((prev) => [latestNotification, ...prev].slice(0, 8));

    // Shake the bell
    setBellShake(true);
    setTimeout(() => setBellShake(false), 800);

    // Show toast (don't show if dropdown is already open)
    if (!open) {
      setToast(latestNotification);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => setToast(null), 5000);
    }
  }, [latestNotification]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissToast = () => {
    setToast(null);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  };

  const handleToastClick = async () => {
    if (!toast) return;
    if (!toast.read) {
      await markAsRead(toast.id);
      refresh();
    }
    dismissToast();
    if (toast.link) navigate(toast.link);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Fetch only UNREAD notifications when dropdown opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getNotifications(1, 20)
      .then((res) => {
        // Only show unread in dropdown
        setNotifications(res.notifications.filter((n) => !n.read).slice(0, 8));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const handleMarkRead = async (id: number) => {
    await markAsRead(id);
    // Remove from dropdown (not just mark as read — it's a "new only" view)
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    refresh();
  };

  const handleClearAll = async () => {
    await markAllAsRead();
    setNotifications([]);
    refresh();
  };

  const handleClick = async (notification: NotificationItem) => {
    if (!notification.read) await handleMarkRead(notification.id);
    setOpen(false);
    if (notification.link) navigate(notification.link);
  };

  return (
    <>
      <div
        className={`h-16 flex items-center justify-between px-6 border-b shrink-0 z-30 ${
          isDark
            ? "bg-[#0f1923] border-[#1e2d40]"
            : "bg-white border-gray-200"
        }`}
      >
        {/* Left: Page context */}
        <div className="flex items-center gap-3">
          {pageTitle && (
            <h1 className={`text-sm font-semibold ${isDark ? "text-[#e2e8f0]" : "text-gray-900"}`}>
              {pageTitle}
            </h1>
          )}
          {pageTitle && firstName && (
            <span className={`hidden sm:inline-block w-px h-4 ${isDark ? "bg-[#253449]" : "bg-gray-300"}`} />
          )}
          {firstName && (
            <span className={`hidden sm:inline text-sm ${isDark ? "text-[#64748b]" : "text-gray-500"}`}>
              {getGreeting()}, <span className={isDark ? "text-[#94a3b8]" : "text-gray-700"}>{firstName}</span>
            </span>
          )}
        </div>

        {/* Right: Bell icon */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setOpen(!open)}
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
            className={`relative p-2 rounded-xl transition-all duration-200 cursor-pointer ${
              open
                ? isDark
                  ? "bg-[#1e2d40] text-[#e2e8f0]"
                  : "bg-gray-200 text-gray-900"
                : isDark
                  ? "text-[#64748b] hover:bg-[#1a2332] hover:text-[#94a3b8]"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <Bell
              size={20}
              className={bellShake ? "animate-[bell-shake_0.6s_ease-in-out]" : ""}
            />
            {unreadCount > 0 && (
              <span className={`absolute -top-1 -right-1 min-w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 ${isDark ? "ring-2 ring-[#0f1923]" : "ring-2 ring-white"}`}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {open && (
            <div
              className={`absolute right-0 top-full mt-2 w-100 rounded-2xl shadow-2xl border z-50 overflow-hidden ${
                isDark
                  ? "bg-[#131c2a] border-[#1e2d40] shadow-black/50"
                  : "bg-white border-gray-200 shadow-gray-300/50"
              }`}
            >
              {/* Header */}
              <div className={`flex items-center justify-between px-5 py-3.5 ${isDark ? "bg-[#131c2a]" : "bg-white"}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`text-sm font-semibold ${isDark ? "text-[#e2e8f0]" : "text-gray-900"}`}>
                    Notifications
                  </span>
                  {unreadCount > 0 && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700"
                    }`}>
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {notifications.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className={`flex items-center gap-1 text-xs font-medium cursor-pointer rounded-lg px-2.5 py-1 transition-colors ${
                      isDark
                        ? "text-[#64748b] hover:text-[#94a3b8] hover:bg-[#1e2d40]"
                        : "text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                    }`}
                  >
                    <CheckCheck size={14} />
                    Clear all
                  </button>
                )}
              </div>

              <div className={`h-px ${isDark ? "bg-[#1e2d40]" : "bg-gray-100"}`} />

              {/* List */}
              <div className="max-h-105 overflow-y-auto">
                {loading ? (
                  <div className={`py-10 text-center text-sm ${isDark ? "text-[#64748b]" : "text-gray-400"}`}>
                    <div className={`w-5 h-5 border-2 rounded-full mx-auto mb-2 animate-spin ${isDark ? "border-[#253449] border-t-blue-400" : "border-gray-200 border-t-blue-600"}`} />
                    Loading...
                  </div>
                ) : notifications.length === 0 ? (
                  <div className={`py-14 text-center ${isDark ? "text-[#64748b]" : "text-gray-400"}`}>
                    <BellOff size={28} className="mx-auto mb-3 opacity-40" />
                    <p className="text-sm font-medium">No new notifications</p>
                    <p className={`text-xs mt-1 ${isDark ? "text-[#475569]" : "text-gray-400"}`}>You're all caught up</p>
                  </div>
                ) : (
                  notifications.map((n) => {
                    const ts = getTypeStyle(n.type);
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleClick(n)}
                        className={`w-full flex items-start gap-3 px-5 py-3.5 text-left transition-all duration-150 cursor-pointer group ${
                          !n.read
                            ? isDark
                              ? "bg-[#1a2332] hover:bg-[#1e2d40]"
                              : "bg-blue-50/50 hover:bg-blue-50"
                            : isDark
                              ? "hover:bg-[#1a2332]/60"
                              : "hover:bg-gray-50"
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          isDark ? `${ts.darkIconBg} ${ts.darkIconColor}` : `${ts.iconBg} ${ts.iconColor}`
                        }`}>
                          {ts.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[13px] font-semibold truncate ${isDark ? "text-[#e2e8f0]" : "text-gray-900"}`}>
                              {n.title}
                            </span>
                            {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
                          </div>
                          <p className={`text-xs mt-0.5 line-clamp-2 leading-relaxed ${isDark ? "text-[#94a3b8]" : "text-gray-600"}`}>
                            {n.message}
                          </p>
                          <span className={`text-[11px] mt-1 block ${isDark ? "text-[#64748b]" : "text-gray-400"}`}>
                            {timeAgo(n.created_at)}
                          </span>
                        </div>
                        {!n.read && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id); }}
                            className={`p-1.5 rounded-lg shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${
                              isDark
                                ? "text-[#64748b] hover:text-[#94a3b8] hover:bg-[#1e2d40]"
                                : "text-gray-300 hover:text-blue-600 hover:bg-blue-50"
                            }`}
                            title="Mark as read"
                          >
                            <Check size={14} />
                          </button>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <>
                  <div className={`h-px ${isDark ? "bg-[#1e2d40]" : "bg-gray-100"}`} />
                  <div className="px-5 py-3 text-center">
                    <button
                      onClick={() => { setOpen(false); navigate("/notifications"); }}
                      className={`text-xs font-semibold cursor-pointer transition-colors ${
                        isDark ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-700"
                      }`}
                    >
                      View all notifications
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Toast notification — slides in from bottom-right */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 w-96 rounded-2xl shadow-2xl border overflow-hidden animate-[toast-in_0.4s_ease-out] ${
            isDark
              ? "bg-[#131c2a] border-[#253449] shadow-black/50"
              : "bg-white border-gray-200 shadow-gray-300/60"
          }`}
        >
          <button
            onClick={handleToastClick}
            className="w-full flex items-start gap-3 p-4 text-left cursor-pointer"
          >
            {(() => {
              const ts = getTypeStyle(toast.type);
              return (
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isDark ? `${ts.darkIconBg} ${ts.darkIconColor}` : `${ts.iconBg} ${ts.iconColor}`
                }`}>
                  {ts.icon}
                </div>
              );
            })()}
            <div className="flex-1 min-w-0">
              <div className={`text-[13px] font-semibold ${isDark ? "text-[#e2e8f0]" : "text-gray-900"}`}>
                {toast.title}
              </div>
              <p className={`text-xs mt-0.5 line-clamp-2 leading-relaxed ${isDark ? "text-[#94a3b8]" : "text-gray-600"}`}>
                {toast.message}
              </p>
              <span className={`text-[11px] mt-1 block ${isDark ? "text-[#64748b]" : "text-gray-400"}`}>
                just now
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); dismissToast(); }}
              className={`p-1 rounded-lg shrink-0 cursor-pointer ${
                isDark ? "text-[#64748b] hover:text-[#94a3b8] hover:bg-[#1e2d40]" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              }`}
            >
              <X size={14} />
            </button>
          </button>
          {/* Auto-dismiss progress bar */}
          <div className={`h-0.5 ${isDark ? "bg-[#1e2d40]" : "bg-gray-100"}`}>
            <div className="h-full bg-blue-500 animate-[progress-shrink_5s_linear]" />
          </div>
        </div>
      )}

      {/* Keyframe styles — injected once */}
      <style>{`
        @keyframes bell-shake {
          0% { transform: rotate(0deg); }
          15% { transform: rotate(14deg); }
          30% { transform: rotate(-12deg); }
          45% { transform: rotate(10deg); }
          60% { transform: rotate(-8deg); }
          75% { transform: rotate(4deg); }
          90% { transform: rotate(-2deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes toast-in {
          0% { opacity: 0; transform: translateY(16px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes progress-shrink {
          0% { width: 100%; }
          100% { width: 0%; }
        }
      `}</style>
    </>
  );
};

export default TopBar;
