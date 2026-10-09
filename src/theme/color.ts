// Colour maths for the theme engine: hex parsing, mixing, WCAG contrast, hue.
// Pure functions only; everything works on 6-digit hex strings ("#1f2a44").

type Rgb = [number, number, number];

export const WHITE = "#ffffff";
export const BLACK = "#000000";

export function parseHex(hex: string): Rgb {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Not a hex colour: ${hex}`);
  }
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

export function isHex(value: string | null | undefined): value is string {
  return !!value && /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function toHex(rgb: Rgb): string {
  return (
    "#" +
    rgb
      .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Normalises any accepted hex form to lowercase "#rrggbb". */
export function normalizeHex(hex: string): string {
  return toHex(parseHex(hex));
}

/** Linear mix in sRGB: t = 0 returns `a`, t = 1 returns `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb);
}

/** WCAG 2.x relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Hue in degrees (0–360) and HSL saturation (0–1). */
export function hueSat(hex: string): { hue: number; sat: number; light: number } {
  const [r, g, b] = parseHex(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { hue: 0, sat: 0, light };
  const sat = d / (1 - Math.abs(2 * light - 1));
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { hue, sat, light };
}

export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Moves `color` toward black (direction "darken") or white ("lighten") in
 * small steps until it reaches `min` contrast against every background.
 * Returns the first passing colour, or the end of the walk if none passes.
 */
export function ensureContrast(
  color: string,
  backgrounds: string[],
  min: number,
  direction: "darken" | "lighten",
): string {
  const target = direction === "darken" ? BLACK : WHITE;
  const passes = (c: string) => backgrounds.every((bg) => contrast(c, bg) >= min);
  for (let step = 0; step <= 20; step++) {
    const candidate = step === 0 ? normalizeHex(color) : mix(color, target, step * 0.05);
    if (passes(candidate)) return candidate;
  }
  return target;
}
