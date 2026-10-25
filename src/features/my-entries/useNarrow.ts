import { useSyncExternalStore } from "react";

/** Below Tailwind's `sm` (640 px): phones (#252). */
const NARROW_QUERY = "(max-width: 639px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
}

function snapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(NARROW_QUERY).matches;
}

/** True on a phone-width viewport; follows resizes. */
export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
