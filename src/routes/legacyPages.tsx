import { type ReactNode, lazy } from "react";
import { PlaceholderPage } from "../features/shell/pages";
import { SHELL_ROUTES, type ShellRouteId, getShellRoute } from "../features/shell/routeMap";

/**
 * What each shell route shows until its redesigned page lands: today's page
 * inside the new shell, or a placeholder. A module's own
 * src/features/<module>/routes.tsx overrides its entry, so page PRs don't
 * edit this file. Only routes no module owns yet are listed; every other id
 * falls back to a placeholder. Entries a module has since taken over are
 * removed in an occasional sweep (last: 2026-10-10).
 */

// Today's pages, loaded on demand so they stay out of the shell's bundle.
const Legacy = {
  UserDataEntry: lazy(() => import("../pages/UserDataEntryPage")),
  Upload: lazy(() => import("../pages/UploadPage")),
};

const placeholder = (id: ShellRouteId) => <PlaceholderPage route={getShellRoute(id)} />;

const todaysPages: Partial<Record<ShellRouteId, ReactNode>> = {
  "add-data-classic": <Legacy.UserDataEntry />,
  "bulk-upload": <Legacy.Upload />,
};

export const legacyPages = Object.fromEntries(
  SHELL_ROUTES.map((route) => [route.id, todaysPages[route.id] ?? placeholder(route.id)]),
) as Record<ShellRouteId, ReactNode>;
