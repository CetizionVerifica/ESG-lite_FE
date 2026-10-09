import { createContext } from "react";
import type { StatusName } from "./buildTheme";
import type { Appearance, Look, ResolvedAppearance, ThemePack } from "./packs";
import type { ThemeTokens } from "./tokens";

export interface ThemeContextValue {
  /** The user's choice: light, dark or follow the OS. */
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
  /** The look on screen: the pack's default look, or "night" when the appearance is dark. */
  look: Look;
  /** PlanetPulse, or the signed-in company's brand. */
  pack: ThemePack;
  /** Every --t-* colour currently applied to <html>. */
  tokens: ThemeTokens;
  resolvedAppearance: ResolvedAppearance;
  /** Statuses whose hue is close to the brand's (F1 rule 6). */
  statusClashes: StatusName[];
  /** @deprecated Use tokens (bg-panel, text-ink, …) instead. Removed once no page reads it. */
  isDark: boolean;
  /** @deprecated Use appearance. */
  theme: ResolvedAppearance;
  /** @deprecated Use setAppearance. */
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
