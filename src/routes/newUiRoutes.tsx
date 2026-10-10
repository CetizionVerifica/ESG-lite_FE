import { Navigate, Outlet, type RouteObject } from "react-router-dom";
import ClientContextProvider from "../lib/ClientContextProvider";
import AppShell, { type ShellHandle } from "../features/shell/AppShell";
import { LegacyRedirectRoute, NotFoundPage, PageErrorPage, RoleGuard, RootRedirect } from "../features/shell/pages";
import { LEGACY_REDIRECTS, SHELL_ROUTES } from "../features/shell/routeMap";
import { ResetPasswordPage, SignInPage, StaffSignInPage } from "../features/sign-in/Page";
import { legacyPages } from "./legacyPages";
import { type ModuleRoutesFile, collectModulePages } from "./pageRegistry";
import ProtectedRoute from "./ProtectedRoute";

/**
 * Routes for the redesigned app. Mounted in front of the legacy routes only
 * when VITE_NEW_UI is on (see withNewUiRoutes in src/lib/featureFlags.ts).
 *
 * Each module registers its shell pages in src/features/<module>/routes.tsx
 * (`export const pages: ModulePages`), picked up here by glob, so page PRs
 * don't touch this file. Routes without a module yet show today's page or a
 * placeholder from ./legacyPages.
 */
const moduleRouteFiles = import.meta.glob<ModuleRoutesFile>("../features/*/routes.tsx", { eager: true });
const pages = collectModulePages(moduleRouteFiles, legacyPages);

const shellRoutes: RouteObject[] = SHELL_ROUTES.flatMap((route) => {
  const element = <RoleGuard route={route}>{pages[route.id]}</RoleGuard>;
  const handle: ShellHandle = { shellRoute: route };
  // "/products/*" must also claim "/products" itself (an exact legacy path
  // outranks a splat in React Router), unless a shell route owns that path.
  const bare = route.path.slice(0, -2);
  const paths = route.path.endsWith("/*") && !SHELL_ROUTES.some((r) => r.path === bare) ? [bare, route.path] : [route.path];
  return paths.map((path) => ({ path, element, handle, errorElement: <PageErrorPage /> }));
});

const newUiRoutes: RouteObject[] = [
  { path: "/", element: <RootRedirect /> },
  // P01: signed-out screens, outside the shell.
  { path: "/login", element: <SignInPage /> },
  { path: "/:clientSlug/login", element: <SignInPage /> },
  { path: "/superadmin/login", element: <StaffSignInPage /> },
  { path: "/admin/login", element: <Navigate to="/superadmin/login" replace /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    element: (
      <ClientContextProvider>
        <Outlet />
      </ClientContextProvider>
    ),
    children: [
      ...LEGACY_REDIRECTS.map((redirect) => ({ path: redirect.from, element: <LegacyRedirectRoute redirect={redirect} /> })),
      {
        element: <ProtectedRoute />,
        children: [{ element: <AppShell />, children: [...shellRoutes, { path: "*", element: <NotFoundPage /> }] }],
      },
    ],
  },
];

export default newUiRoutes;
