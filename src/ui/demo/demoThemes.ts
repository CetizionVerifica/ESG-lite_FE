export const DEMO_THEMES = ["light", "dark", "classic"] as const;
export type DemoTheme = (typeof DEMO_THEMES)[number];

export const DEMO_THEME_LABEL: Record<DemoTheme, string> = {
  light: "PlanetPulse light",
  dark: "PlanetPulse dark",
  classic: "Midal Classic",
};
