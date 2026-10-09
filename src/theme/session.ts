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

/** The parts of a MediaQueryList used to follow the system appearance. */
export interface MediaQueryLike {
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
}

/**
 * Subscribes to a media query's changes and returns the unsubscribe function.
 * Safari < 14 only has the deprecated addListener/removeListener pair.
 */
export function subscribeMediaQuery(mq: MediaQueryLike, onChange: () => void): () => void {
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }
  if (typeof mq.addListener === "function") {
    mq.addListener(onChange);
    return () => mq.removeListener?.(onChange);
  }
  return () => {};
}

/** What to do with the account's appearance (B2) once it has loaded. */
export type AppearanceSync = { apply: Appearance } | { push: Appearance } | null;

/**
 * The account's saved appearance wins, so the choice follows the user across
 * devices. An account still on the server default ("system") picks up a choice
 * already made on this device instead, which carries over the legacy toggle.
 */
export function reconcileAppearance(server: unknown, local: Appearance): AppearanceSync {
  if (!isAppearance(server)) return null;
  if (server !== "system") return server === local ? null : { apply: server };
  return local === "system" ? null : { push: local };
}

/** Last brand this browser loaded, so a reload paints it at once instead of PlanetPulse first. */
export const BRAND_CACHE_KEY = "esglite.brand";

/** The cached brand, only when it belongs to `companyId`. */
export function readCachedBrand(storage: Pick<Storage, "getItem"> | null, companyId: number | null): BrandLike | null {
  if (!storage || companyId === null) return null;
  try {
    const raw = storage.getItem(BRAND_CACHE_KEY);
    if (!raw) return null;
    const brand = JSON.parse(raw) as BrandLike | null;
    return brand && typeof brand === "object" && brand.companyId === companyId ? brand : null;
  } catch {
    return null;
  }
}

/** Stores the brand just loaded from the API, or forgets it (null) when there is none. */
export function writeCachedBrand(storage: Pick<Storage, "setItem" | "removeItem"> | null, brand: BrandLike | null): void {
  if (!storage) return;
  try {
    if (brand) storage.setItem(BRAND_CACHE_KEY, JSON.stringify(brand));
    else storage.removeItem(BRAND_CACHE_KEY);
  } catch {
    // Storage full or blocked: the next reload shows PlanetPulse until the brand loads.
  }
}
