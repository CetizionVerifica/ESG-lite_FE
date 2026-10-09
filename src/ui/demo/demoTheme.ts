/**
 * Theme switching for the /__ui demo only. Until F1's ThemeProvider lands this
 * flips the `dark` class the current tokens key off; it moves to F1's API then.
 */
export const DEMO_THEMES = ["light", "dark", "classic"] as const;
export type DemoTheme = (typeof DEMO_THEMES)[number];

export const DEMO_THEME_LABEL: Record<DemoTheme, string> = {
  light: "PlanetPulse light",
  dark: "PlanetPulse dark",
  classic: "Midal Classic",
};

export function applyDemoTheme(theme: DemoTheme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.uiDemoTheme = theme;
}
