import type { ReactNode } from "react";
import { PlaceholderPage } from "../features/shell/pages";
import { SHELL_ROUTES, type ShellRouteId, getShellRoute } from "../features/shell/routeMap";

/**
 * What a shell route shows until a module claims it: a placeholder. A
 * module's own src/features/<module>/routes.tsx overrides its entry, so page
 * PRs don't edit this file. Today only the PCF slot (/products) has no page.
 */
export const legacyPages = Object.fromEntries(
  SHELL_ROUTES.map((route) => [route.id, <PlaceholderPage route={getShellRoute(route.id)} />]),
) as Record<ShellRouteId, ReactNode>;
