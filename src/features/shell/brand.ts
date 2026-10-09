import type { Look, ThemePack } from "../../theme";
import { asRole } from "./routeMap";

/** Logo slot: logoOnDarkUrl on dark chrome (Classic, Night), logoUrl on Light. */
export type { Look };

export interface ShellBrand {
  name: string;
  logoUrl?: string | null;
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
 * Brand in the logo slot. Staff (Superadmin) always see PlanetPulse ESGLite.
 * Client users see their company's brand pack (name and logos from
 * GET /brands/mine); until it loads, or if it can't, their company name.
 */
export function brandForUser(role: string | null, user: SessionUser | null | undefined, pack: ThemePack): ShellBrand {
  if (asRole(role) === "Superadmin" || !user) return PLATFORM_BRAND;
  if (pack.id !== "planetpulse") return { name: pack.name, logoUrl: pack.logoUrl, logoOnDarkUrl: pack.logoOnDarkUrl };
  const name = user.site?.company?.name ?? user.sites?.find((s) => s.company?.name)?.company?.name;
  return name ? { name } : PLATFORM_BRAND;
}
