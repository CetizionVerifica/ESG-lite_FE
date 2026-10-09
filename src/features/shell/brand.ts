import { asRole } from "./routeMap";

/** Logo slot: logoOnDarkUrl on dark chrome (Classic, Night), logoUrl on Light. */
export type Look = "classic" | "light" | "night";

export interface ShellBrand {
  name: string;
  logoUrl?: string | null;
  /** Proposed Brand field (entity map B1); absent from the API today. */
  logoOnDarkUrl?: string | null;
}

export type LogoSlot = { kind: "image"; src: string; alt: string } | { kind: "name"; name: string };

export function pickLogo(brand: ShellBrand, look: Look): LogoSlot {
  // A light-surface logo on dark chrome is often invisible, so dark chrome
  // falls back to the name rather than to logoUrl.
  const src = look === "light" ? brand.logoUrl : brand.logoOnDarkUrl;
  return src ? { kind: "image", src, alt: brand.name } : { kind: "name", name: brand.name };
}

export const PLATFORM_BRAND: ShellBrand = { name: "ESGLite" };

interface SessionSite {
  company?: { name?: string | null } | null;
}

interface SessionUser {
  site?: SessionSite | null;
  sites?: SessionSite[] | null;
}

/**
 * Company shown in the logo slot. Staff (Superadmin) always see PlanetPulse
 * ESGLite; everyone else sees their company name until /brands is readable
 * by non-staff (entity map B1) and F1's theme pack carries the logos.
 */
export function brandForUser(role: string | null, user: SessionUser | null | undefined): ShellBrand {
  if (asRole(role) === "Superadmin" || !user) return PLATFORM_BRAND;
  const name = user.site?.company?.name ?? user.sites?.find((s) => s.company?.name)?.company?.name;
  return name ? { name } : PLATFORM_BRAND;
}
