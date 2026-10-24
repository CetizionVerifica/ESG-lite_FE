import { useSyncExternalStore } from "react";

/**
 * How many right-side drawers are open, so toasts can keep clear of a drawer's
 * footer (its Approve / Reject buttons sit where toasts stack, bottom-right).
 */
let open = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Call when a right-side drawer opens; the returned function closes it. */
export function rightDrawerOpened(): () => void {
  open += 1;
  emit();
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    open = Math.max(0, open - 1);
    emit();
  };
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l); // data-loss-reviewed: a listener set (UI state), not a record
  };
};

/** True while any right-side drawer is open. */
export const useRightDrawerOpen = (): boolean => useSyncExternalStore(subscribe, () => open > 0, () => false);
