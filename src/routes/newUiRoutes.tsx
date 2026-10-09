import type { RouteObject } from "react-router-dom";

/**
 * Dev-only routes. Vite drops this branch from production builds.
 * /__ui is the src/ui component gallery (docs: src/ui/CLAUDE.md).
 */
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: "/__ui", lazy: async () => ({ Component: (await import("../ui/demo/UiDemoPage")).default }) }]
  : [];

/**
 * Routes for redesigned pages (src/features/<module>/). Mounted only when
 * VITE_NEW_UI is on; see withNewUiRoutes in src/lib/featureFlags.ts.
 */
const newUiRoutes: RouteObject[] = [...devRoutes];

export default newUiRoutes;
