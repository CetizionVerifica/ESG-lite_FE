import { useContext } from "react";
import { ThemeContext } from "./themeContext";
import type { ThemeContextValue } from "./themeContext";

/** Current theme: `{ appearance, setAppearance, look, pack, tokens }` (+ deprecated `isDark`). */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
