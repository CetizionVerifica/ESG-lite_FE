import { Suspense, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useMatches, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { useClientContext } from "../../lib/clientContext";
import { useTheme } from "../../theme";
import { CommandPalette } from "../../ui";
import { shellUser } from "./account";
import { brandForUser } from "./brand";
import { type Command, routeCommands } from "./commands";
import ContextBar from "./components/ContextBar";
import MobileNav from "./components/MobileNav";
import TopBar from "./components/TopBar";
import { useCommandPalette } from "./hooks/useCommandPalette";
import { usePreviewStyle } from "./hooks/usePreviewStyle";
import { navFor } from "./nav";
import { type ShellRoute, asRole, clientIdFromRoute, homeFor, pathForClient } from "./routeMap";
import { signOutSession } from "./signOut";

/** Route `handle` the shell reads to find the current page's metadata. */
export interface ShellHandle {
  shellRoute: ShellRoute;
}

function isShellHandle(handle: unknown): handle is ShellHandle {
  return typeof handle === "object" && handle !== null && "shellRoute" in handle;
}

function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading page" className="space-y-4 py-6">
      <div className="h-7 w-56 animate-pulse rounded-(--r-md) bg-(--t-tint)" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-(--r-lg) bg-(--t-tint)" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-(--r-lg) bg-(--t-tint)" />
    </div>
  );
}

/** F2 app shell: top bar, < 1024px drawer, ⌘K palette and the page frame. */
export default function AppShell() {
  const { role: rawRole, user, logout } = useAuth();
  const role = asRole(rawRole);
  const { clientId, setClientId } = useClientContext();
  const { appearance, setAppearance, look, pack, resolvedAppearance } = useTheme();
  const palette = useCommandPalette();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const params = useParams();
  const matches = useMatches();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const route = matches.map((m) => m.handle).filter(isShellHandle).pop()?.shellRoute ?? null;
  const clientScoped = role === "Superadmin" && Boolean(route?.clientContext);
  const urlClientId = clientIdFromRoute(route, params);

  useEffect(() => setDrawerOpen(false), [pathname]);

  // A deep link to /clients/7/brand makes client 7 the context; only routes
  // with a :clientId param do this (/capture/forms/5 is not client 5).
  useEffect(() => {
    if (role === "Superadmin" && urlClientId !== null && urlClientId !== clientId) {
      setClientId(urlClientId);
    }
  }, [role, urlClientId, clientId, setClientId]);

  const previewStyle = usePreviewStyle(clientId, clientScoped, resolvedAppearance);
  const nav = navFor(role);
  const commands = useMemo(() => routeCommands(role, clientId), [role, clientId]);
  const account = shellUser(user, rawRole);

  const onClientPicked = (id: number) => {
    const to = pathForClient(route, id);
    if (to) navigate(to);
  };

  const runCommand = (command: Command) => {
    palette.remember(command.id);
    palette.setOpen(false);
    navigate(command.to);
  };

  const signOut = () =>
    signOutSession({
      logout,
      setClientId,
      clearQueries: () => queryClient.clear(),
      navigate: (to) => navigate(to, { replace: true }),
    });

  return (
    <div style={previewStyle} className="min-h-screen bg-(--t-page) text-(--t-ink)">
      <a
        href="#main"
        className="sr-only z-50 rounded-(--r-md) bg-(--t-panel) px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
      >
        Skip to content
      </a>
      <TopBar
        brand={brandForUser(rawRole, user, pack)}
        look={look}
        home={homeFor(role) ?? "/"}
        nav={nav}
        clientId={clientId}
        user={account}
        appearance={appearance}
        onAppearance={setAppearance}
        onOpenDrawer={() => setDrawerOpen(true)}
        onOpenSearch={() => palette.setOpen(true)}
        onSignOut={signOut}
        drawerOpen={drawerOpen}
      />
      <MobileNav
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={nav}
        clientId={clientId}
        user={account}
        appearance={appearance}
        onAppearance={setAppearance}
        onSearch={() => palette.setOpen(true)}
        onSignOut={signOut}
      />
      <CommandPalette
        open={palette.open}
        onClose={() => palette.setOpen(false)}
        commands={commands}
        recent={palette.recent}
        onRun={runCommand}
        placeholder="Search pages…"
        inputLabel="Search pages"
      />
      <main id="main" tabIndex={-1} className="mx-auto max-w-[1440px] px-4 pb-10 outline-none sm:px-6">
        <ContextBar showClientSwitcher={clientScoped} onClientPicked={onClientPicked} />
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
