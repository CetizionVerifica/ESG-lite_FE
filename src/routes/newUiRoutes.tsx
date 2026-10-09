import type { RouteObject } from "react-router-dom";

/**
 * Routes for redesigned pages (src/features/<module>/). Mounted only when
 * VITE_NEW_UI is on; see withNewUiRoutes in src/lib/featureFlags.ts.
 * Empty until the first module ships.
 */
const newUiRoutes: RouteObject[] = [];

export default newUiRoutes;
