import { useEffect, useRef, useState } from "react";
import { countUp } from "../../../lib/insights/motion";

/**
 * 05-ux §6 `countUp`: a hero number counts up from `motion.countUp`'s start
 * over its duration, on the first value only (later values show at once).
 * Only the display moves; it always lands on the server's value. Static when
 * `countUp` says so (reduced motion, IN-0 stub).
 */
export function useCountUp(value: number | null | undefined): number | null {
  const first = useRef(true);
  const [shown, setShown] = useState<number | null>(() => {
    if (value === null || value === undefined) return null;
    return countUp(value).from;
  });

  useEffect(() => {
    if (value === null || value === undefined) {
      setShown(null);
      return;
    }
    const plan = countUp(value);
    if (!first.current || plan.durationMs <= 0 || typeof requestAnimationFrame !== "function") {
      first.current = false;
      setShown(value);
      return;
    }
    first.current = false;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / plan.durationMs);
      const eased = 1 - (1 - p) ** 3;
      setShown(p >= 1 ? plan.to : plan.from + (plan.to - plan.from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      setShown(value);
    };
  }, [value]);

  return shown;
}
