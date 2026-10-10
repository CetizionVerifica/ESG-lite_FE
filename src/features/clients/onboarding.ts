// P17 Onboard client: pure logic (draft, per-step validation, payloads, logo colour). No React here.
import { BLACK, hueSat, isHex, mix, normalizeHex } from "../../theme/color";

export const INDUSTRIES = [
  "Metals and mining",
  "Manufacturing",
  "Chemicals",
  "Energy and utilities",
  "Oil and gas",
  "Construction and real estate",
  "Food and beverage",
  "Textiles and apparel",
  "Logistics and transport",
  "Retail",
  "Healthcare",
  "Technology",
  "Financial services",
  "Other",
] as const;

export const REGIONS = ["GCC", "Middle East and Africa", "India", "Asia-Pacific", "Europe", "Americas"] as const;

export const PASSWORD_MIN = 8;

export type OnboardDraft = {
  companyName: string;
  industry: string;
  region: string;
  employeeRange: string;
  cinNumber: string;
  address: string;
  contactPerson: string;
  email: string;
  phoneNumber: string;
  password: string;
  esgMitraAccess: boolean;
  /** false = "Skip for now" (PlanetPulse theme). */
  brandOn: boolean;
  primary: string;
  accent: string;
  logo: File | null;
  logoDark: File | null;
};
export type OnboardField = keyof OnboardDraft;

export const EMPTY_ONBOARD: OnboardDraft = {
  companyName: "",
  industry: "",
  region: "",
  employeeRange: "",
  cinNumber: "",
  address: "",
  contactPerson: "",
  email: "",
  phoneNumber: "",
  password: "",
  esgMitraAccess: false,
  brandOn: true,
  primary: "",
  accent: "",
  logo: null,
  logoDark: null,
};

export const STEPS = [
  { id: "company", label: "Company" },
  { id: "admin", label: "Admin user" },
  { id: "access", label: "Access" },
  { id: "brand", label: "Brand", optional: true },
  { id: "review", label: "Review" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Errors for one step's fields. */
export function validateStep(step: StepId, d: OnboardDraft): Partial<Record<OnboardField, string>> {
  const e: Partial<Record<OnboardField, string>> = {};
  if (step === "company") {
    if (!d.companyName.trim()) e.companyName = "Enter the company's name.";
  }
  if (step === "admin") {
    if (!d.contactPerson.trim()) e.contactPerson = "Enter the admin's name.";
    if (!d.email.trim()) e.email = "Enter the admin's email.";
    else if (!EMAIL.test(d.email.trim())) e.email = "Enter a valid email address.";
    if (!d.password) e.password = "Set a password.";
    else if (d.password.length < PASSWORD_MIN) e.password = `Use at least ${PASSWORD_MIN} characters.`;
  }
  if (step === "brand" && d.brandOn) {
    if (!isHex(d.primary)) e.primary = "Pick a primary colour, or skip the brand for now.";
    if (d.accent && !isHex(d.accent)) e.accent = "Enter a hex colour like #1EA79A.";
  }
  return e;
}

/** First step (in order) with an error, or null when everything is valid. */
export function firstInvalidStep(d: OnboardDraft): StepId | null {
  for (const s of STEPS) if (Object.keys(validateStep(s.id, d)).length) return s.id;
  return null;
}

/** True once anything differs from the empty form (drives the unsaved-changes guard). */
export function isOnboardDirty(d: OnboardDraft): boolean {
  return (Object.keys(EMPTY_ONBOARD) as OnboardField[]).some((k) => d[k] !== EMPTY_ONBOARD[k]);
}

/** Multipart body for POST /admin/onboarding/company (field names as the backend reads them). */
export function toOnboardForm(d: OnboardDraft): FormData {
  const f = new FormData();
  const text: [string, string][] = [
    ["companyName", d.companyName],
    ["industry", d.industry],
    ["region", d.region],
    ["employeeRange", d.employeeRange],
    ["cinNumber", d.cinNumber],
    ["address", d.address],
    ["contactPerson", d.contactPerson],
    ["email", d.email],
    ["phoneNumber", d.phoneNumber],
  ];
  for (const [k, v] of text) f.append(k, v.trim());
  // Sent as is: a password's spaces are part of it.
  f.append("password", d.password);
  // The backend treats presence as true.
  if (d.esgMitraAccess) f.append("esgMitraAccess", "true");
  if (d.brandOn && d.logo) f.append("logo", d.logo);
  return f;
}

/** Cover gradient for a primary colour: a deep shade of it into the colour itself. */
export function coverFor(primary: string): { coverFrom: string; coverTo: string } {
  const p = normalizeHex(primary);
  return { coverFrom: mix(p, BLACK, 0.55), coverTo: p };
}

/** Accent when none is picked: the primary's hue turned 150°, kept in a usable saturation and lightness. */
export function defaultAccent(primary: string): string {
  const { hue, sat, light } = hueSat(normalizeHex(primary));
  return hslToHex((hue + 150) % 360, Math.max(sat, 0.45), Math.min(Math.max(light, 0.35), 0.55));
}

/** PUT /brands/:id body for the Brand step, or null when the brand is skipped. */
export function toBrandUpdate(d: OnboardDraft): { name: string; primary: string; accent: string; coverFrom: string; coverTo: string } | null {
  if (!d.brandOn || !isHex(d.primary)) return null;
  const primary = normalizeHex(d.primary);
  const accent = isHex(d.accent) ? normalizeHex(d.accent) : defaultAccent(primary);
  return { name: d.companyName.trim(), primary, accent, ...coverFor(primary) };
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

/**
 * "Suggest from logo": the two most common distinct colours among a logo's
 * pixels (RGBA), ignoring transparent, near-white, near-black and grey ones.
 * Returns null when the logo has no such colour (e.g. a black-and-white mark).
 */
export function suggestFromPixels(rgba: Uint8ClampedArray): { primary: string; accent: string | null } | null {
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const [r, g, b, a] = [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
    if (a < 128) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 240 && min > 240) continue; // white
    if (max < 25) continue; // black
    if (max - min < 30) continue; // grey
    // 4 levels per channel: groups shades of one colour together.
    const key = `${r >> 6}${g >> 6}${b >> 6}`;
    const cur = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    buckets.set(key, { n: cur.n + 1, r: cur.r + r, g: cur.g + g, b: cur.b + b });
  }
  const ranked = [...buckets.values()].sort((x, y) => y.n - x.n);
  if (!ranked.length) return null;
  const hex = (c: { n: number; r: number; g: number; b: number }) =>
    "#" + [c.r, c.g, c.b].map((v) => Math.round(v / c.n).toString(16).padStart(2, "0")).join("");
  const primary = hex(ranked[0]);
  const second = ranked.slice(1).find((c) => c.n >= ranked[0].n * 0.05);
  return { primary, accent: second ? hex(second) : null };
}
