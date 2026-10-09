import { navLinks, resolveNavTo } from "./nav";
import type { Role } from "./routeMap";

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

export function routeCommands(role: Role | null, clientId: number | null): Command[] {
  if (!role) return [];
  const pages = navLinks(role).map((l) => ({
    id: `route:${l.to}`,
    label: l.label,
    group: l.group ?? "Pages",
    to: resolveNavTo(l.to, clientId),
    keywords: `${l.group ?? ""} ${l.label}`.toLowerCase(),
  }));
  return [
    ...pages,
    { id: "route:/notifications", label: "Notifications", group: "Account", to: "/notifications", keywords: "notifications bell alerts" },
    { id: "route:/settings", label: "Settings", group: "Account", to: "/settings", keywords: "settings preferences profile password" },
  ];
}

/** Every word of the query must appear in the label or keywords. */
export function filterCommands(commands: Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return commands;
  return commands.filter((c) => {
    const haystack = `${c.label.toLowerCase()} ${c.keywords}`;
    return words.every((w) => haystack.includes(w));
  });
}

export const MAX_RECENT = 5;

export function pushRecent(recent: string[], id: string, max: number = MAX_RECENT): string[] {
  return [id, ...recent.filter((r) => r !== id)].slice(0, max);
}

/** Recent commands first (only those still allowed), then the rest. */
export function withRecentFirst(commands: Command[], recent: string[]): { recent: Command[]; rest: Command[] } {
  const byId = new Map(commands.map((c) => [c.id, c]));
  const recentCommands = recent.map((id) => byId.get(id)).filter((c): c is Command => Boolean(c));
  const recentIds = new Set(recentCommands.map((c) => c.id));
  return { recent: recentCommands, rest: commands.filter((c) => !recentIds.has(c.id)) };
}
