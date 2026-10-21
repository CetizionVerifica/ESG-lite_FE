// PE-2 · whether the find and replace panel is open (⌘⇧F, the toolbar button).
// One small external store: the shortcut runner, the toolbars and the panel share it.
import { useSyncExternalStore } from "react";

let open = false;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Opens the panel (again: `focus` changes, so the Find field takes focus). */
export function openFindReplace(): void {
  open = true;
  seq += 1;
  emit();
}
export function closeFindReplace(): void {
  if (!open) return;
  open = false;
  emit();
}
export const toggleFindReplace = (): void => (open ? closeFindReplace() : openFindReplace());

const subscribe = (l: () => void) => {
  listeners.add(l);
  // data-loss-reviewed: removes an entry from an in-memory Set/Map, no record is deleted.
  return () => listeners.delete(l);
};
const snapshot = () => (open ? seq : 0);

/** 0 when closed, else a number that changes each time the panel is asked to open. */
export const useFindReplaceOpen = (): number => useSyncExternalStore(subscribe, snapshot, snapshot);
