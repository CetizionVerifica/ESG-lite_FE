import { useSyncExternalStore } from "react";

/** Below Tailwind's `sm` (640 px): phones, where wide charts start as tables (05-ux §3). */
export const NARROW_QUERY = "(max-width: 639px)";

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

/** True on a narrow (phone) viewport; follows resizes. Kept tiny so tests can mock it. */
export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
