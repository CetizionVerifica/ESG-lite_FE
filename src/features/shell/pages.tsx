import type { ReactNode } from "react";
import { Navigate, useLocation, useRouteError } from "react-router-dom";
import { RotateCw } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useClientContext } from "../../lib/clientContext";
import StatusPage from "./components/StatusPage";
import { type LegacyRedirect, type Role, type ShellRoute, asRole, canAccess, homeFor, resolveLegacyRedirect } from "./routeMap";

/** Route-level pages the shell owns: guard, 403/404, placeholders, redirects. */

function useRole(): Role | null {
  return asRole(useAuth().role);
}

export function ForbiddenPage() {
  const home = homeFor(useRole());
  return (
    <StatusPage
      code="403"
      title="You don't have access to this page"
      body="Your role can't open this page. If you need it, ask your company admin to change your access."
      action={home ? { label: "Go to your home page", to: home } : { label: "Sign in again", to: "/login" }}
    />
  );
}

export function NotFoundPage() {
  const home = homeFor(useRole());
  return (
    <StatusPage
      code="404"
      title="Page not found"
      body="This link may be old or mistyped."
      action={home ? { label: "Go to your home page", to: home } : undefined}
    />
  );
}

/** For new paths whose redesigned page has not been built yet. */
export function PlaceholderPage({ route }: { route: ShellRoute }) {
  return (
    <StatusPage
      title={route.title}
      body={
        <>
          This page is being redesigned and isn't available yet.
          <span className="mt-1 block text-xs">Spec {route.spec}</span>
        </>
      }
    />
  );
}

/** Shows the route only to its roles; others get the 403 page, not the login. */
export function RoleGuard({ route, children }: { route: ShellRoute; children: ReactNode }) {
  const role = useRole();
  const redirect = role ? route.roleRedirect?.[role] : undefined;
  if (redirect) return <Navigate to={redirect} replace />;
  return canAccess(role, route) ? <>{children}</> : <ForbiddenPage />;
}

/** `/` → the role's home. */
export function RootRedirect() {
  const { role, isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const home = homeFor(asRole(role));
  return home ? <Navigate to={home} replace /> : <Navigate to="/login" replace />;
}

/** Old path → new path, keeping query and hash. */
export function LegacyRedirectRoute({ redirect }: { redirect: LegacyRedirect }) {
  const { search, hash } = useLocation();
  const { clientId } = useClientContext();
  return <Navigate to={resolveLegacyRedirect(redirect, search, hash, clientId)} replace />;
}

/** Inline error for a page that crashed; the shell around it keeps working. */
export function PageErrorPage() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);
  return (
    <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-(--r-md) border border-(--t-bad) bg-(--t-bad-soft) px-4 py-3 text-sm text-(--t-bad)">
      <span>Something went wrong on this page.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1 rounded-(--r-sm) font-medium outline-none focus-visible:ring-2 focus-visible:ring-(--t-bad)"
      >
        <RotateCw size={14} aria-hidden /> Reload
      </button>
    </div>
  );
}
