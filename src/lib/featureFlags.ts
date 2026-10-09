import type { RouteObject } from "react-router-dom";

type Env = Record<string, string | boolean | undefined>;

/**
 * True when the redesign is switched on with VITE_NEW_UI=1 (or "true").
 * Read at build time by Vite, so changing it needs a dev-server restart.
 */
export function isNewUiEnabled(env: Env = import.meta.env): boolean {
  const value = String(env.VITE_NEW_UI ?? "").trim().toLowerCase();
  return value === "1" || value === "true";
}

/**
 * Puts the new-UI routes in front of the legacy ones when the flag is on.
 * React Router ranks equally specific paths by order, so a new route with
 * the same path as a legacy one wins while the flag is on.
 */
export function withNewUiRoutes(
  legacyRoutes: RouteObject[],
  newRoutes: RouteObject[],
  enabled: boolean = isNewUiEnabled(),
): RouteObject[] {
  return enabled ? [...newRoutes, ...legacyRoutes] : legacyRoutes;
}
