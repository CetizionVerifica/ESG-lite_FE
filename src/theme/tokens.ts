// Token names: the contract between the theme engine, tokens.css and every
// component. Spec: ./CLAUDE.md ("Token set"). CSS variable = `--t-<name>`.

export const RAMP_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type RampStep = (typeof RAMP_STEPS)[number];

export const TOKEN_NAMES = [
  // Surface
  "page", "panel", "ink", "muted", "line", "tint",
  // Brand
  "brand", "on-brand", "brand-text", "accent", "on-accent",
  ...RAMP_STEPS.map((s) => `brand-${s}` as const),
  ...RAMP_STEPS.map((s) => `accent-${s}` as const),
  // Chrome (top bar)
  "chrome", "chrome-fg", "chrome-muted", "chrome-line", "chrome-active",
  // Data
  "s1", "s2", "s3",
  "series-1", "series-2", "series-3", "series-4",
  "series-5", "series-6", "series-7", "series-8",
  // ESG pillars (wave E, fixed): identity marks for Environment / Social / Governance
  "pillar-e", "pillar-s", "pillar-g",
  // Heat ramp (wave E, fixed): one hue, low → high, with the text colour for each step
  "heat-1", "heat-2", "heat-3", "heat-4", "heat-5",
  "on-heat-1", "on-heat-2", "on-heat-3", "on-heat-4", "on-heat-5",
  // Status (fixed)
  "good", "good-soft", "warn", "warn-soft", "bad", "bad-soft", "info", "info-soft",
  // Cover
  "cover-from", "cover-to",
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];
export type ThemeTokens = Record<TokenName, string>;
