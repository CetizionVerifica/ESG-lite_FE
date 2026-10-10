import type { ReactNode } from "react";
import { SHELL_ROUTES, type ShellRouteId } from "../features/shell/routeMap";

/** Shell route ids a module renders, mapped to its page element. */
export type ModulePages = Partial<Record<ShellRouteId, ReactNode>>;

/** What a src/features/<module>/routes.tsx file exports. */
export interface ModuleRoutesFile {
  pages?: ModulePages;
}

const KNOWN_IDS = new Set<string>(SHELL_ROUTES.map((route) => route.id));

/**
 * Merges every module's `pages` over the fallback (today's page or a
 * placeholder). A route id claimed by two modules, or one the route map
 * doesn't know, is a bug, so it throws rather than picking one silently.
 */
export function collectModulePages(
  files: Record<string, ModuleRoutesFile>,
  fallback: Record<ShellRouteId, ReactNode>,
): Record<ShellRouteId, ReactNode> {
  const owners = new Map<string, string>();
  const merged: Record<string, ReactNode> = { ...fallback };
  for (const [file, { pages = {} }] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    for (const [id, element] of Object.entries(pages)) {
      if (!KNOWN_IDS.has(id)) throw new Error(`${file} registers unknown shell route "${id}" (see src/features/shell/routeMap.ts)`);
      const owner = owners.get(id);
      if (owner) throw new Error(`Shell route "${id}" is registered by both ${owner} and ${file}`);
      owners.set(id, file);
      merged[id] = element;
    }
  }
  return merged as Record<ShellRouteId, ReactNode>;
}
