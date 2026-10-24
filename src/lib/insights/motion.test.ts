import { afterEach, describe, expect, it, vi } from "vitest";
import { COUNT_UP_MS, ENTRANCE_MS, countUp, entrance, fadeInElement, morph, panelFade, prefersReducedMotion, pulse, pulseElement, resetMotionPreference, stagger } from "./motion";

afterEach(() => resetMotionPreference(null));

describe("motion (IN-8)", () => {
  it("is static under reduced motion: no animation, final values at once", () => {
    resetMotionPreference(true);
    expect(entrance(3)).toEqual({ animation: false });
    expect(stagger(2)).toEqual({});
    expect(countUp(41_280)).toEqual({ from: 41_280, to: 41_280, durationMs: 0 });
    expect(morph()).toEqual({ universalTransition: { enabled: false } });
    expect(panelFade()).toEqual({ opacity: 1 });
    const el = { animate: vi.fn() } as unknown as HTMLElement;
    pulseElement(el);
    fadeInElement(el);
    expect(el.animate).not.toHaveBeenCalled();
  });

  it("animates calmly otherwise: 700 ms cubicOut entrance staggered 80 ms, 600 ms count-up, morph on", () => {
    resetMotionPreference(false);
    const e = entrance(3);
    expect(e).toMatchObject({ animation: true, animationDuration: ENTRANCE_MS, animationEasing: "cubicOut" });
    expect(e.animationDelay?.(0)).toBe(0);
    expect(e.animationDelay?.(2)).toBe(160);
    expect(e.animationDelay?.(50)).toBe(240);
    expect(stagger(2)).toEqual({ animationDelay: 160 });
    expect(countUp(10)).toEqual({ from: 0, to: 10, durationMs: COUNT_UP_MS });
    expect(morph().universalTransition.enabled).toBe(true);
    const el = { animate: vi.fn() } as unknown as HTMLElement;
    pulseElement(el);
    fadeInElement(el);
    expect(el.animate).toHaveBeenCalledTimes(2);
  });

  it("pulse marks the targeted panel only", () => {
    expect(pulse(false)).toBe("");
    expect(pulse(true)).toContain("ring-2");
  });

  it("reads prefers-reduced-motion safely and once", () => {
    resetMotionPreference(null);
    const first = prefersReducedMotion();
    expect(typeof first).toBe("boolean");
    expect(prefersReducedMotion()).toBe(first);
  });
});
