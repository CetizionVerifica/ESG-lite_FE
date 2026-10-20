// DS-12 · what the checks pieces of the editor share: the latest answer of
// POST /studio/docs/:id/checks, whether the panel is open, and which row a
// marker asked to show. One small external store per doc (the top bar runs
// the checks; the panel, the page markers and the final dialog read them).
import { useSyncExternalStore } from "react";
import type { ChecksResponse } from "../../../lib/studio/contracts";

export interface ChecksState {
  data: ChecksResponse | null;
  loading: boolean;
  error: string | null;
  open: boolean;
  /** checkKey of the row to scroll to and highlight. */
  focus: string | null;
  /** Bumped to ask the runner for a fresh run now. */
  refresh: number;
}

const EMPTY: ChecksState = { data: null, loading: false, error: null, open: false, focus: null, refresh: 0 };
const states = new Map<number, ChecksState>();
const listeners = new Set<() => void>();

export const getChecksState = (docId: number): ChecksState => states.get(docId) ?? EMPTY;

export function setChecksState(docId: number, patch: Partial<ChecksState>): void {
  const prev = getChecksState(docId);
  const next = { ...prev, ...patch };
  if (Object.keys(patch).every((k) => prev[k as keyof ChecksState] === next[k as keyof ChecksState])) return;
  states.set(docId, next);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  // data-loss-reviewed: removes an entry from an in-memory Set/Map, no record is deleted.
  return () => listeners.delete(l);
};

export function useChecksState(docId: number): ChecksState {
  return useSyncExternalStore(
    subscribe,
    () => getChecksState(docId),
    () => getChecksState(docId),
  );
}

export const openChecks = (docId: number, focus: string | null = null) => setChecksState(docId, { open: true, focus });
export const closeChecks = (docId: number) => setChecksState(docId, { open: false, focus: null });
export const refreshChecks = (docId: number) => setChecksState(docId, { refresh: getChecksState(docId).refresh + 1 });

/** Test hook. */
export const resetChecksStore = (): void => {
  states.clear();
  listeners.forEach((l) => l());
};
