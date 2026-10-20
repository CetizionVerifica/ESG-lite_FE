// DS-9 · the AI panel's client state, outside React so it survives the drawer
// closing: one chat thread per design, the card being previewed on the page
// (ghost preview), and requests other parts of the editor send to the panel
// (the text toolbar's "AI ▾" menu, the chart toolbar's "Suggest a title").
// UI state only: the doc changes only in a card's Accept handler.
import { useSyncExternalStore } from "react";
import type { AiRequest, AiTarget, Suggestion } from "../../../lib/studio/contracts";
import type { EditorApi } from "../editor/EditorContext";

export type CardStatus = "open" | "accepted" | "discarded";

export interface Card {
  id: string;
  suggestion: Suggestion;
  /** What the suggestion is about (the selection when it was asked). */
  target: AiTarget | null;
  status: CardStatus;
  /** Try again is running. */
  retrying?: boolean;
  error?: string;
}

export interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards: Card[];
  pending?: boolean;
  error?: string;
}

export interface PendingRequest {
  id: string;
  /** What the thread shows as the person's ask ("Make it shorter"). */
  prompt: string;
  request: AiRequest;
}

interface DocAi {
  turns: Turn[];
  queue: PendingRequest[];
}

export interface Ghost {
  docId: number;
  cardId: string;
  pageId: string;
  ids: string[];
}

const docs = new Map<number, DocAi>();
let ghost: Ghost | null = null;
let version = 0;
const listeners = new Set<() => void>();
const changed = () => {
  version += 1;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  // data-loss-reviewed: removes an entry from an in-memory Set/Map, no record is deleted.
  return () => listeners.delete(l);
};

const EMPTY: DocAi = { turns: [], queue: [] };
const get = (docId: number): DocAi => docs.get(docId) ?? EMPTY;
const set = (docId: number, next: DocAi) => {
  docs.set(docId, next);
  changed();
};

let seq = 0;
export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq += 1)}`;

export function useAiThread(docId: number): DocAi {
  return useSyncExternalStore(subscribe, () => get(docId), () => get(docId));
}
export const threadOf = (docId: number): DocAi => get(docId);

export function addTurn(docId: number, turn: Turn): void {
  const d = get(docId);
  set(docId, { ...d, turns: [...d.turns, turn] });
}
export function updateTurn(docId: number, turnId: string, patch: Partial<Turn>): void {
  const d = get(docId);
  set(docId, { ...d, turns: d.turns.map((t) => (t.id === turnId ? { ...t, ...patch } : t)) });
}
export function updateCard(docId: number, cardId: string, patch: Partial<Card>): void {
  const d = get(docId);
  set(docId, { ...d, turns: d.turns.map((t) => (t.cards.some((c) => c.id === cardId) ? { ...t, cards: t.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)) } : t)) });
}
export function clearThread(docId: number): void {
  set(docId, { ...get(docId), turns: [] });
}

/** Queues an ask for the panel (it runs it when it's open) and opens the AI drawer. */
export function requestAi(docId: number, prompt: string, request: AiRequest): void {
  const d = get(docId);
  set(docId, { ...d, queue: [...d.queue, { id: uid("req"), prompt, request }] });
  bridge?.openDrawer("ai");
}
/** The panel takes the queued asks. */
export function takeQueue(docId: number): PendingRequest[] {
  const d = get(docId);
  if (!d.queue.length) return [];
  docs.set(docId, { ...d, queue: [] });
  changed();
  return d.queue;
}

export function setGhost(next: Ghost | null): void {
  if (ghost === next || (ghost && next && ghost.cardId === next.cardId && ghost.ids.join() === next.ids.join())) return;
  ghost = next;
  changed();
}
/** The card previewed right now (cleanups read it outside React). */
export const ghostNow = (): Ghost | null => ghost;
export const useGhost = (): Ghost | null => useSyncExternalStore(subscribe, () => ghost, () => ghost);

/** The editor API, kept by the ghost overlay, so toolbar items outside the drawer can open it. */
let bridge: EditorApi | null = null;
export const setEditorBridge = (e: EditorApi | null): void => {
  bridge = e;
};
export const editorBridge = (): EditorApi | null => bridge;

export const aiStoreVersion = (): number => version;

/** Test hook. */
export function resetAiStore(): void {
  docs.clear();
  ghost = null;
  bridge = null;
  changed();
}
