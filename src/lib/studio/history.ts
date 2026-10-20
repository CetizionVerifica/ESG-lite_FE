// DS-6 · undo/redo (pure). A stack of whole docs: docs are immutable and
// docOps keeps untouched pages and elements by identity, so a step costs
// only what changed. 100 steps; continuous edits with the same `mergeKey`
// inside a second (a drag, a nudge, a slider) are one step. The stack can be
// written to sessionStorage, so a reload keeps undo.

export interface HistoryEntry<T> {
  value: T;
  label: string;
}

export interface History<T> {
  past: HistoryEntry<T>[];
  present: T;
  /** Label of the step that made `present` ("" for the start). */
  label: string;
  future: HistoryEntry<T>[];
  /** Merging: the key and time of the last commit. */
  mergeKey?: string | null;
  at?: number;
}

export const HISTORY_LIMIT = 100;
export const MERGE_MS = 1000;

export const createHistory = <T,>(value: T): History<T> => ({ past: [], present: value, label: "", future: [], mergeKey: null, at: 0 });

export interface CommitOptions {
  /** Same key as the last commit, within MERGE_MS: replaces that step instead of adding one. */
  mergeKey?: string;
  now?: number;
}

/** Adds a step. A commit that changes nothing (same reference) is ignored. */
export function commit<T>(h: History<T>, value: T, label: string, opts: CommitOptions = {}): History<T> {
  if (value === h.present) return h;
  const now = opts.now ?? Date.now();
  const merge = !!opts.mergeKey && opts.mergeKey === h.mergeKey && now - (h.at ?? 0) <= MERGE_MS && h.past.length > 0;
  if (merge) return { ...h, present: value, label, future: [], at: now };
  const past = [...h.past, { value: h.present, label: h.label }];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, present: value, label, future: [], mergeKey: opts.mergeKey ?? null, at: now };
}

export const canUndo = (h: History<unknown>): boolean => h.past.length > 0;
export const canRedo = (h: History<unknown>): boolean => h.future.length > 0;
/** What Undo would undo ("Move", "Delete page" …). */
export const undoLabel = (h: History<unknown>): string | null => (h.past.length ? h.label : null);
export const redoLabel = (h: History<unknown>): string | null => (h.future.length ? h.future[0].label : null);

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  const prev = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: prev.value, label: prev.label, future: [{ value: h.present, label: h.label }, ...h.future], mergeKey: null, at: 0 };
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, { value: h.present, label: h.label }], present: next.value, label: next.label, future: rest, mergeKey: null, at: 0 };
}

/** Replaces the present without a step (a server reload, a conflict resolved). Clears redo. */
export const reset = <T,>(h: History<T>, value: T, keepPast = false): History<T> => ({ ...(keepPast ? h : createHistory(value)), present: value, future: [], mergeKey: null, at: 0 });

// ---------------------------------------------------------------------------
// Reload safety
// ---------------------------------------------------------------------------

const KEY = (docId: number | string) => `studio:history:${docId}`;

interface Stored<T> {
  v: 1;
  rev: number;
  h: Pick<History<T>, "past" | "present" | "label" | "future">;
}

/** Writes the stack for a doc at `rev`. Fails quietly (private mode, quota). */
export function saveHistory<T>(docId: number | string, rev: number, h: History<T>, store: Pick<Storage, "setItem"> | null = safeSession()): void {
  if (!store) return;
  try {
    const body: Stored<T> = { v: 1, rev, h: { past: h.past.slice(-HISTORY_LIMIT), present: h.present, label: h.label, future: h.future } };
    store.setItem(KEY(docId), JSON.stringify(body));
  } catch {
    // Too big or storage blocked: undo just doesn't survive a reload.
  }
}

/**
 * Reads the stack back when it was saved for the same doc at the same `rev`
 * (the server's doc hasn't moved since); otherwise null.
 */
export function loadHistory<T>(docId: number | string, rev: number, store: Pick<Storage, "getItem"> | null = safeSession()): History<T> | null {
  if (!store) return null;
  try {
    const raw = store.getItem(KEY(docId));
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored<T>;
    if (s.v !== 1 || s.rev !== rev) return null;
    return { ...s.h, mergeKey: null, at: 0 };
  } catch {
    return null;
  }
}

function safeSession(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}
