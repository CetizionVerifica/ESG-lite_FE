import { useLayoutEffect, useMemo, type ReactNode } from "react";
import { PLANETPULSE, STORED_BRANDS, buildTheme, toCssVars, useTheme } from "../../theme";
import { ThemeContext, type ThemeContextValue } from "../../theme/themeContext";
import type { DemoTheme } from "./demoThemes";

/**
 * Theme switching for the /__ui gallery only. It previews a pack without
 * touching the signed-in user's saved appearance: tokens are applied to <html>
 * while the gallery is open and the app's own theme is restored on leaving.
 */
const MIDAL = STORED_BRANDS[1];

export function DemoThemeScope({ theme, children }: { theme: DemoTheme; children: ReactNode }) {
  const app = useTheme();
  const value: ThemeContextValue = useMemo(() => {
    const pack = theme === "classic" ? MIDAL : PLANETPULSE;
    const look = theme === "classic" ? "classic" : theme === "dark" ? "night" : "light";
    const resolvedAppearance = theme === "dark" ? "dark" : "light";
    return {
      ...app,
      pack,
      look,
      resolvedAppearance,
      tokens: buildTheme(pack, look, resolvedAppearance),
      isDark: resolvedAppearance === "dark",
      theme: resolvedAppearance,
    };
  }, [theme, app]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const apply = (vars: Record<string, string>, dark: boolean, look: string, pack: string) => {
      for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
      root.classList.toggle("dark", dark);
      root.dataset.look = look;
      root.dataset.pack = pack;
    };
    apply(toCssVars(value.tokens), value.isDark, value.look, value.pack.id);
    return () => apply(toCssVars(app.tokens), app.isDark, app.look, app.pack.id);
  }, [value, app]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
