import { describe, expect, it } from "vitest";
import { countUp, entrance, morph, panelFade, prefersReducedMotion, pulse } from "./motion";

describe("motion stubs (IN-0; IN-8 fills them in)", () => {
  it("are static: no animation, final values at once", () => {
    expect(entrance(3)).toEqual({ animation: false });
    expect(countUp(41_280)).toEqual({ from: 41_280, to: 41_280, durationMs: 0 });
    expect(morph()).toEqual({ universalTransition: { enabled: false } });
    expect(panelFade()).toEqual({ opacity: 1 });
  });

  it("pulse marks the targeted panel only", () => {
    expect(pulse(false)).toBe("");
    expect(pulse(true)).toContain("ring-2");
  });

  it("reads prefers-reduced-motion safely", () => {
    expect(typeof prefersReducedMotion()).toBe("boolean");
  });
});
