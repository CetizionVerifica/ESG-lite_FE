// Theme packs: the per-company inputs the engine turns into tokens.
// The only place besides buildTheme.ts where raw colour values live.

import type { Brand } from "../services/brandService";
import { isHex, normalizeHex } from "./color";

export type Look = "classic" | "light" | "night";
export type Appearance = "light" | "dark" | "system";
/** Appearance after "system" has been resolved against the OS setting. */
export type ResolvedAppearance = "light" | "dark";

export interface ThemePack {
  /** "planetpulse" or "company-<id>". */
  id: string;
  name: string;
  primary: string;
  accent: string;
  coverFrom: string;
  coverTo: string;
  logoUrl: string | null;
  /** Proposed backend field (B1); null until the API returns it. */
  logoOnDarkUrl: string | null;
  /** Proposed backend field (B1); "light" until the API returns it. */
  defaultLook: Look;
  /** Optional Scope 3 colour; a neutral is derived from the primary when null. */
  scope3Colour: string | null;
}

export const PLANETPULSE: ThemePack = {
  id: "planetpulse",
  name: "PlanetPulse",
  primary: "#2572c0",
  accent: "#1ea79a",
  coverFrom: "#123c6b",
  coverTo: "#2572c0",
  logoUrl: null,
  logoOnDarkUrl: null,
  defaultLook: "light",
  scope3Colour: "#f39a2b",
};

/** Backend defaults for a company without a brand row (brand.controller.ts). */
const BRAND_DEFAULTS = {
  primary: "#1f2a44",
  accent: "#3b82f6",
  coverFrom: "#0d1526",
  coverTo: "#1f2a44",
};

const LOOKS: Look[] = ["classic", "light", "night"];

/** Brand as returned by GET /brands/:companyId, plus the proposed B1 fields. */
export type BrandLike = Pick<Brand, "companyId" | "name"> &
  Partial<Pick<Brand, "primary" | "accent" | "coverFrom" | "coverTo" | "logoUrl">> & {
    logoOnDarkUrl?: string | null;
    defaultLook?: string | null;
    scope3Colour?: string | null;
  };

function hexOr(value: string | null | undefined, fallback: string): string {
  return isHex(value) ? normalizeHex(value) : fallback;
}

/** Turns an API brand into a theme pack, falling back field by field. */
export function packFromBrand(brand: BrandLike): ThemePack {
  const look = LOOKS.find((l) => l === brand.defaultLook);
  return {
    id: `company-${brand.companyId}`,
    name: brand.name,
    primary: hexOr(brand.primary, BRAND_DEFAULTS.primary),
    accent: hexOr(brand.accent, BRAND_DEFAULTS.accent),
    coverFrom: hexOr(brand.coverFrom, BRAND_DEFAULTS.coverFrom),
    coverTo: hexOr(brand.coverTo, BRAND_DEFAULTS.coverTo),
    logoUrl: brand.logoUrl ?? null,
    logoOnDarkUrl: brand.logoOnDarkUrl ?? null,
    defaultLook: look ?? "light",
    scope3Colour: isHex(brand.scope3Colour) ? normalizeHex(brand.scope3Colour) : null,
  };
}

/**
 * The four brands stored today (ESG-lite brand-assets/<companyId>/theme.json).
 * Used by the contrast tests and the dev preview route; the app reads the
 * live values from GET /brands/:companyId.
 */
export const STORED_BRANDS: Record<1 | 2 | 3 | 6, ThemePack> = {
  1: packFromBrand({
    companyId: 1,
    name: "Midal Cables",
    primary: "#0b2e5c",
    accent: "#2f6fb0",
    coverFrom: "#061933",
    coverTo: "#0b2e5c",
    defaultLook: "classic",
  }),
  2: packFromBrand({
    companyId: 2,
    name: "Harman Finochem",
    primary: "#0f5132",
    accent: "#12b76a",
    coverFrom: "#06281d",
    coverTo: "#0f5132",
  }),
  3: packFromBrand({
    companyId: 3,
    name: "Glochem Industries",
    primary: "#7a1f2b",
    accent: "#b03a4a",
    coverFrom: "#3a0d14",
    coverTo: "#7a1f2b",
  }),
  6: packFromBrand({
    companyId: 6,
    name: "Chieron",
    primary: "#1f8a99",
    accent: "#f2a01e",
    coverFrom: "#0c3b43",
    coverTo: "#1f8a99",
  }),
};
