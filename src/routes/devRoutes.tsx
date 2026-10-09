import { Suspense, lazy } from "react";
import type { RouteObject } from "react-router-dom";

/**
 * Developer tools, mounted only by `npm run dev` (import.meta.env.DEV).
 * The dynamic imports sit inside the DEV branch, so production builds
 * drop them and the pages never ship.
 */
function devOnlyRoutes(): RouteObject[] {
  const ThemePreviewPage = lazy(() => import("../theme/preview/ThemePreviewPage"));
  const UiDemoPage = lazy(() => import("../ui/demo/UiDemoPage"));
  return [
    {
      path: "/dev/theme",
      element: (
        <Suspense fallback={null}>
          <ThemePreviewPage />
        </Suspense>
      ),
    },
    {
      // src/ui component gallery (docs: src/ui/README.md).
      path: "/__ui",
      element: (
        <Suspense fallback={null}>
          <UiDemoPage />
        </Suspense>
      ),
    },
  ];
}

const devRoutes: RouteObject[] = import.meta.env.DEV ? devOnlyRoutes() : [];

export default devRoutes;
