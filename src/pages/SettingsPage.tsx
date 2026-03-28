import { useState, useEffect, useRef } from "react";
import { Settings, Bell, Globe, Save, Loader2, Search, Check, ChevronDown } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import {
  getPreferences,
  updatePreferences,
} from "../services/notificationService";

const PREF_OPTIONS: { key: string; label: string; description: string; roles: string[] }[] = [
  { key: "email_approvals", label: "Approval Notifications", description: "Receive emails when your submissions are approved", roles: ["User", "Manager"] },
  { key: "email_rejections", label: "Rejection Notifications", description: "Receive emails when your submissions are rejected", roles: ["User", "Manager"] },
  { key: "email_reminders", label: "Deadline Reminders", description: "Monthly reminders if you haven't submitted data by the 10th", roles: ["User"] },
  { key: "email_escalations", label: "Escalation Alerts", description: "Alerts when users under you haven't submitted data by the 15th", roles: ["Manager"] },
];

// Comprehensive timezone list grouped by region
const ALL_TIMEZONES = [
  "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos", "Africa/Nairobi",
  "America/Anchorage", "America/Bogota", "America/Buenos_Aires", "America/Chicago",
  "America/Denver", "America/Halifax", "America/Los_Angeles", "America/Mexico_City",
  "America/New_York", "America/Phoenix", "America/Santiago", "America/Sao_Paulo",
  "America/Toronto", "America/Vancouver",
  "Asia/Bahrain", "Asia/Bangkok", "Asia/Colombo", "Asia/Dhaka", "Asia/Dubai",
  "Asia/Hong_Kong", "Asia/Istanbul", "Asia/Jakarta", "Asia/Karachi", "Asia/Kolkata",
  "Asia/Kuala_Lumpur", "Asia/Kuwait", "Asia/Manila", "Asia/Muscat", "Asia/Qatar",
  "Asia/Riyadh", "Asia/Seoul", "Asia/Shanghai", "Asia/Singapore", "Asia/Taipei",
  "Asia/Tehran", "Asia/Tokyo",
  "Australia/Melbourne", "Australia/Perth", "Australia/Sydney",
  "Europe/Amsterdam", "Europe/Athens", "Europe/Berlin", "Europe/Brussels",
  "Europe/Dublin", "Europe/Helsinki", "Europe/Istanbul", "Europe/Lisbon",
  "Europe/London", "Europe/Madrid", "Europe/Moscow", "Europe/Paris",
  "Europe/Prague", "Europe/Rome", "Europe/Stockholm", "Europe/Vienna",
  "Europe/Warsaw", "Europe/Zurich",
  "Pacific/Auckland", "Pacific/Fiji", "Pacific/Honolulu",
  "UTC",
];

function getTimezoneOffset(tz: string): string {
  try {
    // Use formatToParts to extract ONLY the GMT offset, not the full time string
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date());
    const gmtPart = parts.find((p) => p.type === "timeZoneName");
    return gmtPart?.value?.replace("GMT", "UTC") || "";
  } catch {
    return "";
  }
}

function formatTzLabel(tz: string): string {
  const offset = getTimezoneOffset(tz);
  const city = tz.split("/").pop()?.replace(/_/g, " ") || tz;
  return `${city} (${offset})`;
}

// ─── Custom Searchable Timezone Dropdown ────────────────────────────────────

const TimezoneSelect = ({
  value,
  onChange,
  isDark,
}: {
  value: string;
  onChange: (tz: string) => void;
  isDark: boolean;
}) => {
  const d = isDark;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const filtered = search.trim()
    ? ALL_TIMEZONES.filter((tz) => {
        const q = search.toLowerCase();
        return tz.toLowerCase().includes(q) || formatTzLabel(tz).toLowerCase().includes(q);
      })
    : ALL_TIMEZONES;

  // Auto-detected timezone
  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm text-left cursor-pointer transition-colors ${
          open
            ? d
              ? "bg-[#1a2332] border-blue-500/50 ring-2 ring-blue-500/20"
              : "bg-white border-blue-400 ring-2 ring-blue-100"
            : d
              ? "bg-[#0f1923] border-[#253449] hover:border-[#2d4060]"
              : "bg-gray-50 border-gray-300 hover:border-gray-400"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Globe size={15} className={d ? "text-emerald-400 shrink-0" : "text-emerald-600 shrink-0"} />
          <span className={`truncate ${d ? "text-white" : "text-gray-900"}`}>
            {value ? formatTzLabel(value) : "Select timezone..."}
          </span>
        </div>
        <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""} ${d ? "text-[#64748b]" : "text-gray-400"}`} />
      </button>

      {/* Dropdown — opens upward to avoid page overflow */}
      {open && (
        <div className={`absolute z-50 bottom-full mb-2 w-full rounded-xl border shadow-2xl overflow-hidden ${
          d
            ? "bg-[#131c2a] border-[#1e2d40] shadow-black/50"
            : "bg-white border-gray-200 shadow-gray-300/50"
        }`}>
          {/* Search */}
          <div className={`px-3 py-2.5 border-b ${d ? "border-[#1e2d40]" : "border-gray-100"}`}>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${d ? "bg-[#0f1923]" : "bg-gray-50"}`}>
              <Search size={14} className={d ? "text-[#64748b]" : "text-gray-400"} />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search timezone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`w-full bg-transparent text-sm outline-none placeholder:${d ? "text-[#475569]" : "text-gray-400"} ${d ? "text-white" : "text-gray-900"}`}
              />
            </div>
          </div>

          {/* Auto-detected suggestion */}
          {!search && detectedTz && (
            <div className={`px-3 py-2 border-b ${d ? "border-[#1e2d40]" : "border-gray-100"}`}>
              <button
                onClick={() => { onChange(detectedTz); setOpen(false); setSearch(""); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm cursor-pointer transition-colors ${
                  value === detectedTz
                    ? d ? "bg-blue-500/15 text-blue-400" : "bg-blue-50 text-blue-700"
                    : d ? "hover:bg-[#1a2332] text-[#94a3b8]" : "hover:bg-gray-50 text-gray-600"
                }`}
              >
                <div>
                  <span className={`text-xs font-semibold uppercase tracking-wider ${d ? "text-[#475569]" : "text-gray-400"}`}>
                    Auto-detected
                  </span>
                  <div className={`mt-0.5 ${value === detectedTz ? "" : d ? "text-white" : "text-gray-900"}`}>
                    {formatTzLabel(detectedTz)}
                  </div>
                </div>
                {value === detectedTz && <Check size={16} className="text-blue-400 shrink-0" />}
              </button>
            </div>
          )}

          {/* List */}
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className={`px-4 py-6 text-center text-sm ${d ? "text-[#475569]" : "text-gray-400"}`}>
                No timezone found for &ldquo;{search}&rdquo;
              </div>
            ) : (
              filtered.map((tz) => {
                const isSelected = tz === value;
                return (
                  <button
                    key={tz}
                    onClick={() => { onChange(tz); setOpen(false); setSearch(""); }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left cursor-pointer transition-colors ${
                      isSelected
                        ? d ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-700"
                        : d ? "text-[#94a3b8] hover:bg-[#1a2332] hover:text-white" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span>{formatTzLabel(tz)}</span>
                    {isSelected && <Check size={16} className="text-blue-400 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Settings Page ──────────────────────────────────────────────────────────

const SettingsPage = () => {
  const { isDark } = useTheme();
  const { role } = useAuth();

  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPreferences()
      .then((data) => {
        setPrefs(data.notification_preferences || {});
        setTimezone(data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = (key: string) => {
    setPrefs((prev) => ({ ...prev, [key]: prev[key] === false ? true : !(prev[key] ?? true) }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updatePreferences({ notification_preferences: prefs, timezone });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const isEnabled = (key: string) => prefs[key] !== false;

  const d = isDark;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className={`animate-spin ${d ? "text-[#64748b]" : "text-gray-400"}`} size={24} />
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${d ? "bg-[#0b1120]" : "bg-gray-50"}`}>
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className={`rounded-2xl p-6 ${d ? "bg-[#131c2a] border border-[#1e2d40]" : "bg-white border border-gray-200 shadow-sm"}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${d ? "bg-blue-500/15" : "bg-blue-50"}`}>
              <Settings size={22} className={d ? "text-blue-400" : "text-blue-600"} />
            </div>
            <div>
              <h1 className={`text-lg font-bold ${d ? "text-white" : "text-gray-900"}`}>Settings</h1>
              <p className={`text-sm ${d ? "text-[#94a3b8]" : "text-gray-500"}`}>Manage your notification preferences</p>
            </div>
          </div>
        </div>

        {/* Email Notifications */}
        <div className={`rounded-2xl p-6 space-y-5 ${d ? "bg-[#131c2a] border border-[#1e2d40]" : "bg-white border border-gray-200 shadow-sm"}`}>
          <div className="flex items-center gap-2.5">
            <Bell size={18} className={d ? "text-purple-400" : "text-purple-600"} />
            <h2 className={`text-base font-bold ${d ? "text-white" : "text-gray-900"}`}>Email Notifications</h2>
          </div>
          <p className={`text-sm leading-relaxed ${d ? "text-[#94a3b8]" : "text-gray-500"}`}>
            Choose which email notifications you want to receive. In-app notifications are always enabled.
          </p>

          <div className="space-y-3">
            {PREF_OPTIONS.filter((opt) => !role || opt.roles.includes(role)).map((opt) => (
              <div
                key={opt.key}
                className={`flex items-center justify-between p-4 rounded-xl transition-colors ${
                  d ? "bg-[#0f1923] hover:bg-[#1a2332]" : "bg-gray-50 hover:bg-gray-100"
                }`}
              >
                <div className="pr-4">
                  <div className={`text-sm font-semibold ${d ? "text-white" : "text-gray-900"}`}>{opt.label}</div>
                  <div className={`text-xs mt-1 leading-relaxed ${d ? "text-[#94a3b8]" : "text-gray-500"}`}>{opt.description}</div>
                </div>
                <button
                  onClick={() => handleToggle(opt.key)}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                    isEnabled(opt.key)
                      ? "bg-blue-500"
                      : d ? "bg-[#253449]" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                      isEnabled(opt.key) ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Timezone */}
        <div className={`rounded-2xl p-6 space-y-4 ${d ? "bg-[#131c2a] border border-[#1e2d40]" : "bg-white border border-gray-200 shadow-sm"}`}>
          <div className="flex items-center gap-2.5">
            <Globe size={18} className={d ? "text-emerald-400" : "text-emerald-600"} />
            <h2 className={`text-base font-bold ${d ? "text-white" : "text-gray-900"}`}>Timezone</h2>
          </div>
          <p className={`text-sm leading-relaxed ${d ? "text-[#94a3b8]" : "text-gray-500"}`}>
            Deadline reminders and escalation emails are sent at 8:00 AM in your local timezone.
          </p>

          <TimezoneSelect
            value={timezone}
            onChange={(tz) => { setTimezone(tz); setSaved(false); }}
            isDark={d}
          />
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 cursor-pointer transition-colors"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Saving..." : "Save Changes"}
          </button>
          {saved && (
            <span className="text-sm text-emerald-400 font-medium">Saved successfully</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
