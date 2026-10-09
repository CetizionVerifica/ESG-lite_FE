// Pure helpers the ThemeProvider uses to pick a pack and appearance for the
// signed-in user. Kept free of React and the DOM so they can be unit-tested.

import { PLANETPULSE, packFromBrand } from "./packs";
import type { Appearance, BrandLike, ResolvedAppearance, ThemePack } from "./packs";

export const APPEARANCE_KEY = "appearance";
/** Key the legacy ThemeContext wrote ("light" | "dark"); read once to migrate. */
export const LEGACY_THEME_KEY = "theme";

const SUPERADMIN = "Superadmin";

interface SessionCompany {
  company_id?: number | null;
}
interface SessionSite {
  company?: SessionCompany | null;
}
/** The parts of the /auth/login and /auth/me user the theme needs. */
export interface SessionUser {
  site?: SessionSite | null;
  sites?: SessionSite[] | null;
}

/** Company of the signed-in user: their site's company, else their first site's. */
export function companyIdFromUser(user: SessionUser | null | undefined): number | null {
  if (!user) return null;
  const sites = [user.site, ...(user.sites ?? [])];
  for (const site of sites) {
    const id = site?.company?.company_id;
    if (typeof id === "number" && id > 0) return id;
  }
  return null;
}

/** Whether to fetch a brand at all: only signed-in client users; Superadmin (PlanetPulse staff) never does. */
export function shouldLoadBrand(role: string | null, signedIn: boolean): boolean {
  return signedIn && !!role && role !== SUPERADMIN;
}

/** PlanetPulse unless the user is a client user and their brand loaded. */
export function selectPack(role: string | null, brand: BrandLike | null | undefined): ThemePack {
  if (role === SUPERADMIN || !brand) return PLANETPULSE;
  return packFromBrand(brand);
}

export function isAppearance(value: unknown): value is Appearance {
  return value === "light" || value === "dark" || value === "system";
}

/** Stored appearance, migrating the legacy "theme" key; "system" when unset. */
export function readStoredAppearance(storage: Pick<Storage, "getItem"> | null): Appearance {
  if (!storage) return "system";
  try {
    const stored = storage.getItem(APPEARANCE_KEY);
    if (isAppearance(stored)) return stored;
    const legacy = storage.getItem(LEGACY_THEME_KEY);
    if (legacy === "light" || legacy === "dark") return legacy;
  } catch {
    // Storage can throw in private mode; fall through to the default.
  }
  return "system";
}

export function resolveAppearance(appearance: Appearance, systemDark: boolean): ResolvedAppearance {
  if (appearance === "system") return systemDark ? "dark" : "light";
  return appearance;
}
