import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { getMyBrand } from "../services/brandService";
import { buildTheme, resolveLook, statusClashes, toCssVars } from "./buildTheme";
import type { Appearance } from "./packs";
import {
  APPEARANCE_KEY,
  companyIdFromUser,
  readStoredAppearance,
  resolveAppearance,
  selectPack,
  shouldLoadBrand,
} from "./session";
import { ThemeContext } from "./themeContext";
import type { ThemeContextValue } from "./themeContext";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia?.(DARK_QUERY).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(DARK_QUERY);
    if (!mq) return;
    const onChange = () => setDark(mq.matches);
    mq.addEventListener("change", onChange);
    // Catch a change between the first render and subscribing.
    onChange();
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return dark;
}

/**
 * Resolves pack × look × appearance and applies the --t-* tokens to <html>.
 * Client users get their own company's brand (GET /brands/mine, ESG-lite B1)
 * after login; Superadmin, signed-out screens and companies whose brand can't be
 * loaded get PlanetPulse. Must sit inside AuthProvider and QueryClientProvider.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { role, user, isAuthenticated } = useAuth();
  const loadBrand = shouldLoadBrand(role, isAuthenticated);

  const brandQuery = useQuery({
    // Keyed by company so switching accounts never shows the previous brand.
    queryKey: ["brand", "mine", companyIdFromUser(user), role],
    queryFn: getMyBrand,
    enabled: loadBrand,
    staleTime: Infinity,
    retry: false,
  });
  const pack = useMemo(
    () => selectPack(role, loadBrand && brandQuery.isSuccess ? brandQuery.data : null),
    [role, loadBrand, brandQuery.isSuccess, brandQuery.data],
  );

  const [appearance, setAppearanceState] = useState<Appearance>(() =>
    readStoredAppearance(safeStorage()),
  );
  const systemDark = useSystemDark();
  const resolvedAppearance = resolveAppearance(appearance, systemDark);
  const look = resolveLook(pack.defaultLook, resolvedAppearance);
  const tokens = useMemo(
    () => buildTheme(pack, pack.defaultLook, resolvedAppearance),
    [pack, resolvedAppearance],
  );

  const setAppearance = useCallback((next: Appearance) => {
    setAppearanceState(next);
    try {
      safeStorage()?.setItem(APPEARANCE_KEY, next);
    } catch {
      // Not persisted in private mode; the choice still applies this session.
    }
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(toCssVars(tokens))) {
      root.style.setProperty(name, value);
    }
    root.dataset.look = look;
    root.dataset.pack = pack.id;
    // Legacy pages and Tailwind dark: variants key off this class.
    root.classList.toggle("dark", resolvedAppearance === "dark");
  }, [tokens, look, pack.id, resolvedAppearance]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      appearance,
      setAppearance,
      look,
      pack,
      tokens,
      resolvedAppearance,
      statusClashes: statusClashes(pack),
      isDark: resolvedAppearance === "dark",
      theme: resolvedAppearance,
      toggleTheme: () => setAppearance(resolvedAppearance === "dark" ? "light" : "dark"),
    }),
    [appearance, setAppearance, look, pack, tokens, resolvedAppearance],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export default ThemeProvider;
