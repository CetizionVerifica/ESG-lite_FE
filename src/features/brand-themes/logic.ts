// Pure logic of the brand theme builder (P18): the editable draft, what a
// save sends, and the contrast gate across all three looks.

import {
  PLANETPULSE,
  type ContrastPair,
  type Look,
  type StatusName,
  type ThemePack,
  type ThemeTokens,
  accentIsFillOnly,
  buildTheme,
  contrastReport,
  packFromBrand,
  ramp,
  statusClashes,
} from "../../theme";
import type { Brand, BrandUpdate } from "../../services/brandService";

export const LOOKS: Look[] = ["classic", "light", "night"];
export const LOOK_LABELS: Record<Look, string> = { classic: "Classic", light: "Light", night: "Night" };

export type Screen = "overview" | "sign-in" | "report" | "email";

export const SCREENS: { value: Screen; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "sign-in", label: "Sign in" },
  { value: "report", label: "Report cover" },
  { value: "email", label: "Email" },
];

const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColour = (v: string) => HEX.test(v);

/** What the editor changes. Logos are staged files until Save. */
export interface BrandDraft {
  name: string;
  primary: string;
  accent: string;
  coverFrom: string;
  coverTo: string;
  defaultLook: Look;
  /** null = derived from the primary by the theme engine. */
  scope3Colour: string | null;
  logoFile: File | null;
  darkLogoFile: File | null;
  /** Remove the saved dark logo on Save. */
  removeDarkLogo: boolean;
}

/** The saved brand the draft started from (as GET /brands/:companyId returns it). */
export type SavedBrand = Pick<Brand, "companyId" | "name" | "primary" | "accent" | "coverFrom" | "coverTo" | "logoUrl"> &
  Pick<Brand, "logoOnDarkUrl" | "defaultLook" | "scope3Colour" | "updatedAt">;

export function draftFromBrand(brand: SavedBrand): BrandDraft {
  // packFromBrand fills in defaults for missing or invalid fields.
  const pack = packFromBrand(brand);
  return {
    name: brand.name ?? "",
    primary: pack.primary,
    accent: pack.accent,
    coverFrom: pack.coverFrom,
    coverTo: pack.coverTo,
    // A brand row without B1's column reads "classic" on the backend.
    defaultLook: brand.defaultLook ?? "classic",
    scope3Colour: pack.scope3Colour,
    logoFile: null,
    darkLogoFile: null,
    removeDarkLogo: false,
  };
}

/** Rule "Reset to PlanetPulse defaults": colours and look only; name and logos stay. */
export function resetToDefaults(draft: BrandDraft): BrandDraft {
  return {
    ...draft,
    primary: PLANETPULSE.primary,
    accent: PLANETPULSE.accent,
    coverFrom: PLANETPULSE.coverFrom,
    coverTo: PLANETPULSE.coverTo,
    defaultLook: PLANETPULSE.defaultLook,
    scope3Colour: null,
  };
}

const FIELDS = ["name", "primary", "accent", "coverFrom", "coverTo", "defaultLook", "scope3Colour"] as const;

export function isDirty(draft: BrandDraft, saved: BrandDraft): boolean {
  return (
    FIELDS.some((k) => draft[k] !== saved[k]) ||
    draft.logoFile !== null ||
    draft.darkLogoFile !== null ||
    draft.removeDarkLogo
  );
}

/** Body of PUT /brands/:companyId. */
export function toUpdate(draft: BrandDraft): BrandUpdate {
  const body: BrandUpdate = {
    name: draft.name.trim(),
    primary: draft.primary.toLowerCase(),
    accent: draft.accent.toLowerCase(),
    coverFrom: draft.coverFrom.toLowerCase(),
    coverTo: draft.coverTo.toLowerCase(),
    defaultLook: draft.defaultLook,
    scope3Colour: draft.scope3Colour ? draft.scope3Colour.toLowerCase() : null,
  };
  if (draft.removeDarkLogo && !draft.darkLogoFile) body.logoOnDarkUrl = null;
  return body;
}

/** Field errors that stop a save (the engine fixes contrast; it can't fix bad input). */
export function validate(draft: BrandDraft): Partial<Record<keyof BrandDraft, string>> {
  const errors: Partial<Record<keyof BrandDraft, string>> = {};
  if (!draft.name.trim()) errors.name = "Enter the name shown in the app and on reports";
  for (const k of ["primary", "accent", "coverFrom", "coverTo"] as const) {
    if (!isHexColour(draft[k])) errors[k] = "Use a 6-digit hex colour, like #1f2a44";
  }
  if (draft.scope3Colour !== null && !isHexColour(draft.scope3Colour)) {
    errors.scope3Colour = "Use a 6-digit hex colour, like #1f2a44";
  }
  return errors;
}

/** The pack the preview renders: the draft, with staged logos shown in place of saved ones. */
export function previewPack(
  companyId: number,
  draft: BrandDraft,
  logos: { logoUrl: string | null; logoOnDarkUrl: string | null },
): ThemePack {
  return packFromBrand({
    companyId,
    name: draft.name || "Client",
    primary: draft.primary,
    accent: draft.accent,
    coverFrom: draft.coverFrom,
    coverTo: draft.coverTo,
    logoUrl: logos.logoUrl,
    logoOnDarkUrl: logos.logoOnDarkUrl,
    defaultLook: draft.defaultLook,
    scope3Colour: draft.scope3Colour,
  });
}

/** Tokens for one look of the preview; Night is the dark appearance. */
export function lookTokens(pack: ThemePack, look: Look): ThemeTokens {
  return look === "night" ? buildTheme(pack, "classic", "dark") : buildTheme(pack, look, "light");
}

export interface Adjustment {
  look: Look;
  text: string;
  /** Colour the engine used instead of the input. */
  colour?: string;
}

export interface GateResult {
  /** Pairs checked in the look being previewed. */
  pairs: ContrastPair[];
  /** Pairs that fail in any look; Save is blocked while there are any. */
  failing: (ContrastPair & { look: Look })[];
  adjustments: Adjustment[];
  fillOnlyAccent: boolean;
  clashes: StatusName[];
}

const STATUS_LABEL: Record<StatusName, string> = { good: "Approved", warn: "Pending", bad: "Rejected" };

/**
 * F1 rule 5 run live: every pair in every look. The engine moves a failing
 * colour until it passes; those moves are reported as adjustments. Anything
 * still failing after that can't be fixed automatically and blocks Save.
 */
export function contrastGate(pack: ThemePack, look: Look): GateResult {
  const failing: GateResult["failing"] = [];
  const adjustments: Adjustment[] = [];
  let pairs: ContrastPair[] = [];
  for (const l of LOOKS) {
    const tokens = lookTokens(pack, l);
    const report = contrastReport(tokens);
    if (l === look) pairs = report;
    for (const p of report) if (p.ratio < p.min) failing.push({ ...p, look: l });
    adjustments.push(...adjustmentsFor(pack, l, tokens));
  }
  const lightTokens = lookTokens(pack, "light");
  const fillOnlyAccent = accentIsFillOnly(lightTokens);
  return { pairs, failing, adjustments, fillOnlyAccent, clashes: statusClashes(pack) };
}

function adjustmentsFor(pack: ThemePack, look: Look, t: ThemeTokens): Adjustment[] {
  const out: Adjustment[] = [];
  const primary = pack.primary.toLowerCase();
  const accent = pack.accent.toLowerCase();
  // Night always lifts brand colours by design (F1 rule 3); that is not an adjustment.
  if (look === "night") return out;
  if (t.brand !== primary) out.push({ look, text: "Primary darkened so text on buttons reads", colour: t.brand });
  if (t.accent !== accent) out.push({ look, text: "Accent darkened so text on it reads", colour: t.accent });
  if (t["brand-text"] !== ramp(pack.primary)[600]) out.push({ look, text: "Brand text darkened to pass AA on white", colour: t["brand-text"] });
  if (look === "classic" && t.chrome !== primary) out.push({ look, text: "Top bar darkened so white text reads", colour: t.chrome });
  return out;
}

export function clashMessage(clashes: StatusName[]): string | null {
  if (clashes.length === 0) return null;
  const names = clashes.map((c) => STATUS_LABEL[c]).join(" and ");
  return `The brand colours are close to the ${names} status colour. Status pills keep their icon and label, so they still read.`;
}

/**
 * "Suggest from logo": the 2–3 most common distinct colours in RGBA pixel
 * data (e.g. from a canvas). Transparent, near-white and near-grey pixels are
 * skipped so the background of a logo is never suggested.
 */
export function dominantColours(data: ArrayLike<number>, max = 3): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (data[i + 3] < 128) continue;
    const hi = Math.max(r, g, b);
    const lo = Math.min(r, g, b);
    if (lo > 235) continue; // near white
    if (hi - lo < 18 && hi > 40) continue; // grey (keep near-black: dark wordmarks are brand colours)
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map((x) => [x.r / x.n, x.g / x.n, x.b / x.n] as const);
  const picked: (readonly [number, number, number])[] = [];
  for (const c of ranked) {
    // Distinct: at least ~48 apart in RGB space from every colour already picked.
    if (picked.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > 48)) picked.push(c);
    if (picked.length === max) break;
  }
  return picked.map((c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""));
}

/** Latest report years to offer, newest first. */
export function reportYears(now: Date, count = 5): number[] {
  const y = now.getFullYear();
  return Array.from({ length: count }, (_, i) => y - i);
}
