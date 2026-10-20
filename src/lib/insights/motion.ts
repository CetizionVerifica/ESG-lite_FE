// IN-0 stubs of the Insights motion helpers (05-ux §6). IN-8 fills them in.
// Every helper returns ECharts / style options only, never runs a timer itself,
// and returns the static (no-op) form under `prefers-reduced-motion: reduce`.
// Panels use these and nothing else for motion: no CSS keyframes in panels.

/** True when the viewer asked for less motion (or there's no window: tests, print). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface EntranceOptions {
  animation: boolean;
  animationDuration?: number;
  animationEasing?: string;
  animationDelay?: (idx: number) => number;
}

/** `entrance`: series draw in (IN-8: 700 ms, 80 ms stagger, cubicOut). IN-0 stub: static. */
export function entrance(_seriesCount = 1): EntranceOptions {
  return { animation: false };
}

/** `countUp`: hero numbers count up on first load (IN-8: 600 ms). IN-0 stub: the final value at once. */
export function countUp(value: number): { from: number; to: number; durationMs: number } {
  return { from: value, to: value, durationMs: 0 };
}

/** `morph`: ECharts universalTransition between linked views (IN-8: 500 ms). IN-0 stub: off. */
export function morph(): { universalTransition: { enabled: boolean } } {
  return { universalTransition: { enabled: false } };
}

/** `pulse`: a 2 s outline on a `?panel=` target (IN-8). IN-0 stub: a static outline class, no animation. */
export function pulse(active: boolean): string {
  return active ? "ring-2 ring-brand ring-offset-2 ring-offset-canvas" : "";
}

/** Panel fade-in: from opacity 0.6 (never 0) to 1 (IN-8). IN-0 stub: fully visible. */
export function panelFade(): { opacity: number } {
  return { opacity: 1 };
}
