// DS-7 · which text is being edited in place, and the live TipTap editor, so
// the contextual toolbar and the Text drawer act on the selection inside it.
// A small external store (useSyncExternalStore): the DS-6 editor state stays
// the doc + UI; text editing is a transient mode on top of it.
import { useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/core";

export interface EditTarget {
  pageId: string;
  elementId: string;
  /** Select all text on start (a just-added "Add a heading"). */
  selectAll?: boolean;
}

interface Store {
  target: EditTarget | null;
  editor: Editor | null;
  /** Commits and ends editing (set by the overlay that owns the TipTap editor). */
  finish: (() => void) | null;
}

let store: Store = { target: null, editor: null, finish: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function startEditing(target: EditTarget): void {
  // Another element being edited commits first.
  if (store.target && (store.target.elementId !== target.elementId || store.target.pageId !== target.pageId)) store.finish?.();
  store = { ...store, target };
  emit();
}

/** Ends editing without committing (the overlay calls it after its own commit). */
export function clearEditing(): void {
  if (!store.target && !store.editor) return;
  store = { target: null, editor: null, finish: null };
  emit();
}

/** Commits the edit in progress, if any. */
export function finishEditing(): void {
  if (store.finish) store.finish();
  else clearEditing();
}

export function setActiveEditor(editor: Editor | null, finish: (() => void) | null): void {
  store = { ...store, editor, finish };
  emit();
}

export const editingTarget = (): EditTarget | null => store.target;
export const activeTextEditor = (): Editor | null => store.editor;

export const useEditingTarget = (): EditTarget | null => useSyncExternalStore(subscribe, () => store.target);
export const useActiveTextEditor = (): Editor | null => useSyncExternalStore(subscribe, () => store.editor);
