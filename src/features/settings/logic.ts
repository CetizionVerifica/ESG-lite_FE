import type { Look } from "../../theme";

export type SectionId = "profile" | "appearance" | "notifications" | "timezone";

export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "appearance", label: "Appearance" },
  { id: "notifications", label: "Notifications" },
  { id: "timezone", label: "Timezone" },
];

export const sectionDomId = (id: SectionId) => `settings-${id}`;

// ─── Profile ────────────────────────────────────────────────────────────────

interface SiteLike {
  site_id?: number;
  name?: string | null;
}

/** The session user as /auth/me returns it; every field may be missing on an old cache. */
export interface SessionUser {
  name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  site?: SiteLike | null;
  sites?: SiteLike[] | null;
}

export interface ProfileView {
  name: string;
  lastName: string;
  phone: string;
  email: string;
  role: string;
  sites: string[];
}

/** Read-only profile rows. Managers carry `sites`, contributors one `site`; both are merged without repeats. */
export function profileView(user: SessionUser | null | undefined, role: string | null): ProfileView {
  const seen = new Set<string>();
  const sites: string[] = [];
  for (const s of [user?.site, ...(user?.sites ?? [])]) {
    const name = s?.name?.trim();
    if (!name) continue;
    const key = s?.site_id !== undefined ? `id:${s.site_id}` : `name:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sites.push(name);
  }
  sites.sort((a, b) => a.localeCompare(b));
  return {
    name: user?.name?.trim() ?? "",
    lastName: user?.last_name?.trim() ?? "",
    phone: user?.phone_number?.trim() ?? "",
    email: user?.email?.trim() ?? "",
    role: role ?? "",
    sites,
  };
}

// ─── Appearance ─────────────────────────────────────────────────────────────

const LOOK_LABELS: Record<Look, string> = { classic: "Classic", light: "Light", night: "Night" };

/** "Midal Cables · Classic": the client's theme, which users can't change. */
export function clientThemeLabel(packName: string, look: Look): string {
  return `${packName} · ${LOOK_LABELS[look]}`;
}

// ─── Notifications ──────────────────────────────────────────────────────────

export interface NotificationOption {
  key: string;
  label: string;
  description: string;
}

const BY_ROLE: Record<string, NotificationOption[]> = {
  User: [
    { key: "email_approvals", label: "Approvals", description: "When a manager approves something you submitted." },
    { key: "email_rejections", label: "Rejections", description: "When a manager sends an entry back to you." },
    { key: "email_reminders", label: "Deadline reminders", description: "If your month isn't filed by the 10th." },
  ],
  Manager: [
    { key: "email_escalations", label: "Escalations", description: "If people on your sites haven't filed by the 15th." },
  ],
};

/** Email toggles the role can change. Admin and Superadmin have none yet. */
export function notificationOptions(role: string | null): NotificationOption[] {
  return (role && BY_ROLE[role]) || [];
}

/** A preference is on unless the user turned it off; missing keys mean the default (on). */
export function isEnabled(prefs: Record<string, boolean>, key: string): boolean {
  return prefs[key] !== false;
}

/**
 * The body for PUT /notifications/preferences. The server replaces the whole
 * object, so keys this page doesn't show are carried over unchanged.
 */
export function mergePreferences(saved: Record<string, boolean>, edits: Record<string, boolean>): Record<string, boolean> {
  return { ...saved, ...edits };
}

/** True when `edits` would change what is saved. */
export function preferencesDirty(saved: Record<string, boolean>, edits: Record<string, boolean>): boolean {
  return Object.entries(edits).some(([k, v]) => isEnabled(saved, k) !== v);
}

// ─── Timezone ───────────────────────────────────────────────────────────────

// Used when the browser can't list its zones (Intl.supportedValuesOf is newer).
const FALLBACK_ZONES = [
  "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos", "Africa/Nairobi",
  "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Mexico_City",
  "America/New_York", "America/Sao_Paulo", "America/Toronto",
  "Asia/Bahrain", "Asia/Bangkok", "Asia/Dhaka", "Asia/Dubai", "Asia/Hong_Kong",
  "Asia/Jakarta", "Asia/Karachi", "Asia/Kolkata", "Asia/Kuala_Lumpur", "Asia/Kuwait",
  "Asia/Manila", "Asia/Muscat", "Asia/Qatar", "Asia/Riyadh", "Asia/Seoul",
  "Asia/Shanghai", "Asia/Singapore", "Asia/Tokyo",
  "Australia/Melbourne", "Australia/Perth", "Australia/Sydney",
  "Europe/Amsterdam", "Europe/Berlin", "Europe/Istanbul", "Europe/London",
  "Europe/Madrid", "Europe/Moscow", "Europe/Paris", "Europe/Rome", "Europe/Zurich",
  "Pacific/Auckland", "UTC",
];

// Chromium still lists some zones by their pre-rename names. People search for
// today's city names, and Intl accepts both, so the list shows the new one.
const RENAMED: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Europe/Kiev": "Europe/Kyiv",
  "America/Godthab": "America/Nuuk",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
  "Asia/Ulan_Bator": "Asia/Ulaanbaatar",
  "Asia/Thimbu": "Asia/Thimphu",
};

/** Today's name for a zone ("Asia/Calcutta" → "Asia/Kolkata"). */
export function modernZone(tz: string): string;
export function modernZone(tz: string | null): string | null;
export function modernZone(tz: string | null): string | null {
  return tz === null ? null : RENAMED[tz] ?? tz;
}

/** Every IANA zone the browser knows, plus `extra` (a saved zone it doesn't list) so it still shows. */
export function timezoneList(extra: (string | null | undefined)[] = []): string[] {
  let zones: string[];
  try {
    const supported = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    zones = supported ? supported("timeZone") : FALLBACK_ZONES;
  } catch {
    zones = FALLBACK_ZONES;
  }
  const all = new Set(zones.map((z) => modernZone(z)));
  // Browsers list UTC as "UTC" or leave it out; people search for it.
  all.add("UTC");
  for (const z of extra) if (z) all.add(modernZone(z));
  return [...all].sort((a, b) => a.localeCompare(b));
}

/** "UTC+3", "UTC-4:30", "UTC" at `date`; "" if the zone is unknown. */
export function utcOffset(tz: string, date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName");
    // ICU versions differ on zero offset ("GMT", "GMT+0"); both read as "UTC".
    const offset = part?.value.replace("GMT", "UTC") ?? "";
    return /^UTC[+-]0?0?(:00)?$/.test(offset) ? "UTC" : offset;
  } catch {
    return "";
  }
}

/** "Bahrain, Asia (UTC+3)". */
export function timezoneLabel(tz: string, date = new Date()): string {
  const parts = tz.split("/");
  const city = parts[parts.length - 1].replace(/_/g, " ");
  const region = parts.length > 1 ? parts.slice(0, -1).join(" / ").replace(/_/g, " ") : "";
  const offset = utcOffset(tz, date);
  const showOffset = offset && offset !== city;
  return `${city}${region ? `, ${region}` : ""}${showOffset ? ` (${offset})` : ""}`;
}

export function detectedTimezone(): string | null {
  try {
    return modernZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
  } catch {
    return null;
  }
}

// ─── Errors ─────────────────────────────────────────────────────────────────

/** The server's message when it sent one, else `fallback`. */
export function serverMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}
