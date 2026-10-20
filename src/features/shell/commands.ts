import { navLinks, resolveNavTo } from "./nav";
import type { FeatureFlags, Role } from "./routeMap";

/** DS-0: Design Studio shortcuts (01-contracts §9). Sustainability designs also need KPI tracking. */
const STUDIO_ROLES: readonly Role[] = ["Manager", "Admin", "Superadmin"];
function studioCommands(role: Role, flags: FeatureFlags): Command[] {
  if (!STUDIO_ROLES.includes(role) || flags.studio !== true) return [];
  const out: Command[] = [
    { id: "studio:new-ghg", label: "New GHG report design", group: "Design Studio", to: "/studio/new?kind=ghg", keywords: "design studio new ghg report design inventory emissions" },
  ];
  if (flags.kpi === true) {
    out.push({ id: "studio:new-sustainability", label: "New sustainability report design", group: "Design Studio", to: "/studio/new?kind=sustainability", keywords: "design studio new sustainability annual report design esg" });
  }
  return out;
}

/**
 * ⌘K registry. Today it holds the routes a role can open; entity search
 * (sites, categories, emission factors) plugs in later as more providers.
 */
export interface Command {
  id: string;
  label: string;
  /** Section shown in the palette, e.g. "Data" for Approvals. */
  group: string;
  to: string;
  keywords: string;
}

/** Pages a role can open from the nav; items behind a switch that's off (KPI-1) aren't offered. */
export function routeCommands(role: Role | null, clientId: number | null, flags: FeatureFlags = {}): Command[] {
  if (!role) return [];
  const pages = navLinks(role, flags).map((l) => ({
    id: `route:${l.to}`,
    label: l.palette ?? l.label,
    group: l.group ?? "Pages",
    to: resolveNavTo(l.to, clientId),
    keywords: `${l.group ?? ""} ${l.label} ${l.palette ?? ""}`.toLowerCase().trim(),
  }));
  return [
    ...pages,
    ...studioCommands(role, flags), // DS-0
    { id: "route:/notifications", label: "Notifications", group: "Account", to: "/notifications", keywords: "notifications bell alerts" },
    { id: "route:/settings", label: "Settings", group: "Account", to: "/settings", keywords: "settings preferences profile password" },
  ];
}

export const MAX_RECENT = 5;

export function pushRecent(recent: string[], id: string, max: number = MAX_RECENT): string[] {
  return [id, ...recent.filter((r) => r !== id)].slice(0, max);
}
