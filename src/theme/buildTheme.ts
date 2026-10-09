// The theme engine: (pack, look, appearance) → every --t-* colour token.
// Pure and synchronous; spec in ./CLAUDE.md ("Generation rules").

import {
  BLACK,
  WHITE,
  contrast,
  ensureContrast,
  hueDistance,
  hueSat,
  mix,
  normalizeHex,
} from "./color";
import type { Look, ResolvedAppearance, ThemePack } from "./packs";
import { RAMP_STEPS, TOKEN_NAMES } from "./tokens";
import type { RampStep, ThemeTokens, TokenName } from "./tokens";

/** WCAG AA thresholds. */
export const AA_TEXT = 4.5;
export const AA_UI = 3;

// Status colours are fixed and never derived from a brand (rule: "Status").
export const STATUS = {
  light: {
    good: "#16794c", "good-soft": "#e1f3ea",
    warn: "#9a6300", "warn-soft": "#fdf5e3",
    bad: "#b4321f", "bad-soft": "#fbe5e1",
    info: "#1d5fb8", "info-soft": "#e3edfb",
  },
  dark: {
    good: "#4ccf8f", "good-soft": "#123527",
    warn: "#f0b955", "warn-soft": "#3a2d12",
    bad: "#f38b7a", "bad-soft": "#3d1c17",
    info: "#7fb2f0", "info-soft": "#15284a",
  },
} as const;

const SURFACE_DARK = {
  page: "#0b1222",
  panel: "#121b30",
  ink: "#e4eaf4",
  muted: "#97a3b8",
  line: "#22304a",
  tint: "#1a2742",
};

const SURFACE_LIGHT = {
  panel: WHITE,
  ink: "#16202e",
  muted: "#5f6b7c",
  lineGrey: "#e5e7eb",
};

const CHROME_DARK = {
  chrome: "#0e1730",
  "chrome-fg": WHITE,
  "chrome-muted": "#97a3b8",
  "chrome-line": "#22304a",
  "chrome-active": "#1d2b4a",
};

/** Text placed on light fills (light accents, lifted Night brand). */
const DARK_ON = "#08101f";

/** Below this saturation a lifted primary reads as grey in Night. */
const MIN_NIGHT_SAT = 0.3;

/** Neutral the Scope 3 colour leans to when the pack has none. */
const S3_NEUTRAL = "#9ca3af";

// Categorical palette for sites/categories; same in every pack.
const SERIES = {
  light: ["#2a6fdb", "#c2621a", "#1b8a78", "#c2417a", "#6e56cf", "#5f7f1f", "#b5452c", "#3d7ea6"],
  dark: ["#6aa6f8", "#f0a05a", "#4cc9b0", "#ec7fae", "#a593f0", "#9cc35a", "#ef8a6f", "#7fb6d9"],
};

// Mix amounts per ramp step: toward white for 50–400, toward black for 600–900.
const RAMP_MIX = [0.92, 0.84, 0.68, 0.5, 0.28, 0, -0.18, -0.36, -0.54, -0.7];

/** Rule 1: ten steps from one colour; 500 is the input. */
export function ramp(color: string): Record<RampStep, string> {
  const out = {} as Record<RampStep, string>;
  RAMP_STEPS.forEach((step, i) => {
    const t = RAMP_MIX[i];
    out[step] = t > 0 ? mix(color, WHITE, t) : t < 0 ? mix(color, BLACK, -t) : normalizeHex(color);
  });
  return out;
}

/** Effective look: dark appearance always renders the Night look. */
export function resolveLook(look: Look, appearance: ResolvedAppearance): Look {
  return appearance === "dark" ? "night" : look;
}

/** White or near-black text, whichever reads on `fill`; null if neither passes. */
function textOn(fill: string, min = AA_TEXT): string | null {
  const white = contrast(WHITE, fill);
  const dark = contrast(DARK_ON, fill);
  if (white >= min && white >= dark) return WHITE;
  if (dark >= min) return DARK_ON;
  if (white >= min) return WHITE;
  return null;
}

/**
 * A fill colour plus its text colour. The fill must stand out from the
 * surfaces as a UI element (3:1); if no text colour reads on it, the fill is
 * moved step by step (darker in light looks, lighter in Night) until one does.
 */
function fillWithText(
  fill: string,
  surfaces: string[],
  dark: boolean,
): { fill: string; on: string } {
  const direction = dark ? "lighten" : "darken";
  let f = ensureContrast(fill, surfaces, AA_UI, direction);
  for (let i = 0; i < 20; i++) {
    const on = textOn(f);
    if (on) return { fill: f, on };
    f = mix(f, dark ? WHITE : BLACK, 0.05);
  }
  return { fill: f, on: dark ? DARK_ON : WHITE };
}

/** First ramp step (walking toward the surface's opposite) that reaches `min`. */
function liftFromRamp(
  r: Record<RampStep, string>,
  steps: RampStep[],
  surfaces: string[],
  min: number,
): string {
  for (const s of steps) {
    if (surfaces.every((bg) => contrast(r[s], bg) >= min)) return r[s];
  }
  return ensureContrast(r[steps[steps.length - 1]], surfaces, min, "lighten");
}

/**
 * Builds every colour token for one pack in one look.
 * `appearance` must already be resolved ("system" → light/dark).
 */
export function buildTheme(
  pack: ThemePack,
  look: Look,
  appearance: ResolvedAppearance,
): ThemeTokens {
  const effective = resolveLook(look, appearance);
  const dark = effective === "night";
  const br = ramp(pack.primary);
  const ac = ramp(pack.accent);

  // Surfaces
  const page = dark ? SURFACE_DARK.page : mix(br[50], WHITE, 0.55);
  const panel = dark ? SURFACE_DARK.panel : SURFACE_LIGHT.panel;
  const ink = dark ? SURFACE_DARK.ink : SURFACE_LIGHT.ink;
  const tint = dark ? SURFACE_DARK.tint : br[50];
  const line = dark ? SURFACE_DARK.line : mix(br[100], SURFACE_LIGHT.lineGrey, 0.5);
  const surfaces = [page, panel];
  const textSurfaces = [page, panel, tint];
  const muted = ensureContrast(
    dark ? SURFACE_DARK.muted : SURFACE_LIGHT.muted,
    textSurfaces,
    AA_TEXT,
    dark ? "lighten" : "darken",
  );

  // Brand and accent (rules 2, 3, 5)
  const lift: RampStep[] = [400, 300, 200, 100, 50];
  // Very dark primaries (navy, bottle green) wash out to grey when lifted;
  // Night then takes its brand colours from the accent ramp instead.
  const nightRamp =
    dark && hueSat(liftFromRamp(br, lift, surfaces, AA_UI)).sat < MIN_NIGHT_SAT ? ac : br;
  let brandFill: { fill: string; on: string };
  let accentFill: { fill: string; on: string };
  let brandText: string;
  if (dark) {
    brandFill = fillWithText(liftFromRamp(nightRamp, lift, surfaces, AA_UI), surfaces, true);
    accentFill = fillWithText(liftFromRamp(ac, lift, surfaces, AA_UI), surfaces, true);
    brandText = liftFromRamp(nightRamp, [300, 200, 100, 50], textSurfaces, AA_TEXT);
  } else {
    brandFill = fillWithText(pack.primary, surfaces, false);
    // Accent is a fill (avatars, AI tags); it may be lighter than 3:1 on white
    // as long as its text colour reads on it.
    const accentOn = textOn(pack.accent);
    accentFill = accentOn
      ? { fill: normalizeHex(pack.accent), on: accentOn }
      : fillWithText(pack.accent, [], false);
    brandText = ensureContrast(br[600], textSurfaces, AA_TEXT, "darken");
  }

  // Chrome (rule 4)
  let chrome: Pick<ThemeTokens, "chrome" | "chrome-fg" | "chrome-muted" | "chrome-line" | "chrome-active">;
  if (dark) {
    chrome = { ...CHROME_DARK };
  } else if (effective === "classic") {
    // Chrome text is white (rule 4): darken the bar until white reads on it.
    const bar = ensureContrast(pack.primary, [WHITE], AA_TEXT, "darken");
    const active = mix(bar, BLACK, 0.2);
    chrome = {
      chrome: bar,
      "chrome-fg": WHITE,
      "chrome-muted": ensureContrast(mix(bar, WHITE, 0.72), [bar, active], AA_TEXT, "lighten"),
      "chrome-line": mix(bar, WHITE, 0.2),
      "chrome-active": active,
    };
  } else {
    chrome = {
      chrome: WHITE,
      "chrome-fg": ink,
      "chrome-muted": muted,
      "chrome-line": line,
      "chrome-active": tint,
    };
  }

  // Data colours: graphics need 3:1 against the panel.
  const dataDir = dark ? "lighten" : "darken";
  const s3Base = pack.scope3Colour ?? mix(br[300], S3_NEUTRAL, 0.7);
  const s1 = ensureContrast(dark ? nightRamp[200] : br[700], surfaces, AA_UI, dataDir);
  const s2 = ensureContrast(dark ? ac[400] : ac[500], surfaces, AA_UI, dataDir);
  const s3 = ensureContrast(s3Base, surfaces, AA_UI, dataDir);
  const series = (dark ? SERIES.dark : SERIES.light).map((c) =>
    ensureContrast(c, surfaces, AA_UI, dataDir),
  );

  const tokens = {
    page, panel, ink, muted, line, tint,
    brand: brandFill.fill,
    "on-brand": brandFill.on,
    "brand-text": brandText,
    accent: accentFill.fill,
    "on-accent": accentFill.on,
    ...chrome,
    s1, s2, s3,
    ...STATUS[dark ? "dark" : "light"],
    "cover-from": normalizeHex(pack.coverFrom),
    "cover-to": normalizeHex(pack.coverTo),
  } as Partial<ThemeTokens>;
  RAMP_STEPS.forEach((s) => {
    tokens[`brand-${s}`] = br[s];
    tokens[`accent-${s}`] = ac[s];
  });
  series.forEach((c, i) => {
    tokens[`series-${i + 1}` as TokenName] = c;
  });
  return tokens as ThemeTokens;
}

/** `{ "--t-page": "#…" }` for applying tokens to an element's style. */
export function toCssVars(tokens: ThemeTokens): Record<`--t-${TokenName}`, string> {
  const out = {} as Record<`--t-${TokenName}`, string>;
  for (const name of TOKEN_NAMES) out[`--t-${name}`] = tokens[name];
  return out;
}

export interface ContrastPair {
  fg: TokenName;
  bg: TokenName;
  min: number;
  ratio: number;
}

// Every text/background (4.5:1) and graphic/background (3:1) pair the UI uses.
const TEXT_PAIRS: [TokenName, TokenName][] = [
  ["ink", "page"], ["ink", "panel"], ["ink", "tint"],
  ["muted", "page"], ["muted", "panel"], ["muted", "tint"],
  ["brand-text", "page"], ["brand-text", "panel"], ["brand-text", "tint"],
  ["on-brand", "brand"], ["on-accent", "accent"],
  ["chrome-fg", "chrome"], ["chrome-muted", "chrome"], ["chrome-fg", "chrome-active"],
  ["chrome-muted", "chrome-active"],
  ["good", "panel"], ["warn", "panel"], ["bad", "panel"], ["info", "panel"],
  ["good", "good-soft"], ["warn", "warn-soft"], ["bad", "bad-soft"], ["info", "info-soft"],
];
const UI_PAIRS: [TokenName, TokenName][] = [
  ["brand", "panel"], ["brand", "page"],
  ["s1", "panel"], ["s2", "panel"], ["s3", "panel"],
  ...Array.from({ length: 8 }, (_, i) => [`series-${i + 1}` as TokenName, "panel" as TokenName] as [TokenName, TokenName]),
];

/** Contrast of every checked pair; the gate passes when each ratio ≥ min. */
export function contrastReport(tokens: ThemeTokens): ContrastPair[] {
  const pair = (min: number) => ([fg, bg]: [TokenName, TokenName]): ContrastPair => ({
    fg, bg, min, ratio: contrast(tokens[fg], tokens[bg]),
  });
  return [...TEXT_PAIRS.map(pair(AA_TEXT)), ...UI_PAIRS.map(pair(AA_UI))];
}

/**
 * Rule 5: accent that cannot pass as text on the panel is a fill only.
 * Text that needs brand colour uses --t-brand-text instead.
 */
export function accentIsFillOnly(tokens: ThemeTokens): boolean {
  return contrast(tokens.accent, tokens.panel) < AA_TEXT;
}

export type StatusName = "good" | "warn" | "bad";
const STATUS_HUES: Record<StatusName, number> = {
  good: hueSat(STATUS.light.good).hue,
  warn: hueSat(STATUS.light.warn).hue,
  bad: hueSat(STATUS.light.bad).hue,
};

/**
 * Rule 6: statuses whose hue is close to the pack's primary or accent.
 * Status pills then always carry an icon + label (F3 StatusPill does).
 */
export function statusClashes(pack: ThemePack, maxDistance = 25): StatusName[] {
  const brandHues = [pack.primary, pack.accent]
    .map((c) => hueSat(c))
    .filter((h) => h.sat >= 0.25);
  return (Object.keys(STATUS_HUES) as StatusName[]).filter((name) =>
    brandHues.some((h) => hueDistance(h.hue, STATUS_HUES[name]) <= maxDistance),
  );
}
