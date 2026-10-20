// DS-13 · what the review pieces of the editor share, per doc: whether the
// review panel is open and on which tab, the thread to show, and the pin a
// C + click dropped (the new comment's spot). A small external store, as the
// checks keep theirs (checks/store.ts).
import { useSyncExternalStore } from "react";

export type ReviewTab = "comments" | "changes";

export interface DraftPin {
  pageId: string;
  elementId: string | null;
  x: number;
  y: number;
}

export interface ReviewState {
  open: boolean;
  tab: ReviewTab;
  /** Thread (root comment id) to scroll to and highlight. */
  focus: number | null;
  /** Where the next comment goes (C + click); null = the page in view. */
  pin: DraftPin | null;
}

const EMPTY: ReviewState = { open: false, tab: "comments", focus: null, pin: null };
const states = new Map<number, ReviewState>();
const listeners = new Set<() => void>();

export const getReviewState = (docId: number): ReviewState => states.get(docId) ?? EMPTY;

export function setReviewState(docId: number, patch: Partial<ReviewState>): void {
  const prev = getReviewState(docId);
  const next = { ...prev, ...patch };
  if (Object.keys(patch).every((k) => prev[k as keyof ReviewState] === next[k as keyof ReviewState])) return;
  states.set(docId, next);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useReviewState(docId: number): ReviewState {
  return useSyncExternalStore(
    subscribe,
    () => getReviewState(docId),
    () => getReviewState(docId),
  );
}

export const openReview = (docId: number, patch: Partial<Omit<ReviewState, "open">> = {}) => setReviewState(docId, { tab: "comments", focus: null, ...patch, open: true });
export const closeReview = (docId: number) => setReviewState(docId, { open: false, focus: null, pin: null });

/** Test hook. */
export const resetReviewStore = (): void => {
  states.clear();
  listeners.forEach((l) => l());
};
