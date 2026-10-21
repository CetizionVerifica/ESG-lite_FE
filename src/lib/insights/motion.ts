// IN-8 · Insights motion (05-ux §6). Calm and purposeful: one orchestrated
// entrance per panel, count-up on the hero's first load, morph only between
// linked views (Pathway ⇄ What moved), and a 2 s pulse on a `?panel=` target.
// Every helper returns the static (no-op) form under
// `prefers-reduced-motion: reduce`, read once per page load. Panels use these
// and nothing else for motion: no CSS keyframes and no animation options of
// their own.

let reduced: boolean | null = null;

/** True when the viewer asked for less motion (or there's no window: tests without matchMedia, print). Read once. */
export function prefersReducedMotion(): boolean {
  if (reduced !== null) return reduced;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") reduced = true;
  else reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reduced;
}

/** Tests and print: forget the cached preference (or force one). */
export function resetMotionPreference(force: boolean | null = null): void {
  reduced = force;
}

export const ENTRANCE_MS = 700;
export const STAGGER_MS = 80;
export const COUNT_UP_MS = 600;
export const MORPH_MS = 500;
export const PULSE_MS = 2000;
export const FADE_MS = 400;

export interface EntranceOptions {
  animation: boolean;
  animationDuration?: number;
  animationEasing?: string;
  animationDelay?: (idx: number) => number;
  animationDurationUpdate?: number;
  animationEasingUpdate?: string;
}

/**
 * `entrance`: series draw in over 700 ms with `cubicOut`, staggered 80 ms
 * (per series via `stagger(i)`, and per data item up to the series count).
 * Spread into the chart option: `{ ...entrance(series.length), series }`.
 */
export function entrance(seriesCount = 1): EntranceOptions {
  if (prefersReducedMotion()) return { animation: false };
  const cap = Math.max(1, seriesCount);
  return {
    animation: true,
    animationDuration: ENTRANCE_MS,
    animationEasing: "cubicOut",
    animationDelay: (idx: number) => Math.min(idx, cap) * STAGGER_MS,
    animationDurationUpdate: MORPH_MS,
    animationEasingUpdate: "cubicInOut",
  };
}

/** Per-series delay to spread into a series: `{ ...stagger(i), type: "line", … }`. Nothing under reduced motion. */
export function stagger(seriesIndex: number): { animationDelay?: number } {
  return prefersReducedMotion() ? {} : { animationDelay: seriesIndex * STAGGER_MS };
}

/** `countUp`: hero numbers count up from 0 over 600 ms (first load only; the hook decides). Static: the value at once. */
export function countUp(value: number): { from: number; to: number; durationMs: number } {
  if (prefersReducedMotion()) return { from: value, to: value, durationMs: 0 };
  return { from: 0, to: value, durationMs: COUNT_UP_MS };
}

/**
 * `morph`: ECharts `universalTransition` between linked views (bars keep their
 * identity through the shared `id` / `groupId` the panels give them). Spread
 * into each series that takes part.
 */
export function morph(): { universalTransition: { enabled: boolean; divideShape?: "clone" | "split" } } {
  if (prefersReducedMotion()) return { universalTransition: { enabled: false } };
  return { universalTransition: { enabled: true, divideShape: "clone" } };
}

/** `pulse`: the static outline of a `?panel=` target (the class stays; `pulseElement` animates it once). */
export function pulse(active: boolean): string {
  return active ? "ring-2 ring-brand ring-offset-2 ring-offset-canvas" : "";
}

/** Runs the 2 s outline pulse on a panel (Web Animations API, so no CSS keyframes). No-op under reduced motion. */
export function pulseElement(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion() || typeof el.animate !== "function") return;
  el.animate([{ boxShadow: "0 0 0 0 var(--t-brand)" }, { boxShadow: "0 0 0 8px transparent" }, { boxShadow: "0 0 0 0 var(--t-brand)" }, { boxShadow: "0 0 0 8px transparent" }], { duration: PULSE_MS, easing: "ease-out" });
}

/** Panel fade-in: from opacity 0.6 (never 0) to 1, once. The resting style is fully visible. */
export function panelFade(): { opacity: number } {
  return { opacity: 1 };
}

/** Runs the panel fade (0.6 → 1). No-op under reduced motion. */
export function fadeInElement(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion() || typeof el.animate !== "function") return;
  el.animate([{ opacity: 0.6 }, { opacity: 1 }], { duration: FADE_MS, easing: "ease-out" });
}
