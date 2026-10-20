// DS-6 · plug-in points of the editor shell. Modules register their drawers
// and toolbars once (at import time) and never touch the shell:
//
//   registerDrawer('data', DataDrawer)            a rail tab's drawer (DS-2, DS-3, DS-4, DS-8, DS-9)
//   registerToolbar('chart', ChartToolbar)        the contextual toolbar for an element type (DS-7, DS-8)
//   registerCommentHandler(fn)                    C + click drops a pin (DS-13; a stub until then)
//
// Registration order doesn't matter: a `fallback` registration (the shell's
// own placeholders) never replaces a real one.
import type { ComponentType } from "react";
import type { Element, ElementType, ReportDoc } from "../../../lib/studio/contracts";
import type { StudioPanelProps } from "../panels/types";
import type { EditorApi } from "./EditorContext";
import type { DrawerId } from "./state";

/** What a drawer gets: the DS-3 panel props plus the editor's API. */
export interface DrawerProps extends StudioPanelProps {
  docId: number;
  editor: EditorApi;
}

/** What a contextual toolbar gets. */
export interface ToolbarProps {
  doc: ReportDoc;
  pageId: string;
  /** The selected elements (all of the registered type, or mixed for "multi"). */
  elements: Element[];
  editor: EditorApi;
  /** True when the toolbar is drawn inside the ⋯ overflow (narrow screens). */
  compact?: boolean;
}

interface Registered<P> {
  component: ComponentType<P>;
  fallback: boolean;
}

const drawers = new Map<DrawerId, Registered<DrawerProps>>();
const toolbars = new Map<string, Registered<ToolbarProps>>();
const listeners = new Set<() => void>();
let version = 0;

const changed = () => {
  version += 1;
  listeners.forEach((l) => l());
};

/** Registers the drawer for a rail tab. A fallback never replaces a real drawer. */
export function registerDrawer(id: DrawerId, component: ComponentType<DrawerProps>, opts: { fallback?: boolean } = {}): void {
  const cur = drawers.get(id);
  if (opts.fallback && cur && !cur.fallback) return;
  drawers.set(id, { component, fallback: !!opts.fallback });
  changed();
}

export const getDrawer = (id: DrawerId): ComponentType<DrawerProps> | null => drawers.get(id)?.component ?? null;
export const isFallbackDrawer = (id: DrawerId): boolean => drawers.get(id)?.fallback ?? true;

/**
 * Toolbar keys: an element type, "page" (nothing selected) or "multi"
 * (several types selected). A fallback never replaces a real toolbar.
 */
export type ToolbarKey = ElementType | "page" | "multi";

export function registerToolbar(key: ToolbarKey, component: ComponentType<ToolbarProps>, opts: { fallback?: boolean } = {}): void {
  const cur = toolbars.get(key);
  if (opts.fallback && cur && !cur.fallback) return;
  toolbars.set(key, { component, fallback: !!opts.fallback });
  changed();
}

export const getToolbar = (key: ToolbarKey): ComponentType<ToolbarProps> | null => toolbars.get(key)?.component ?? null;

/** Which toolbar a selection shows: "page" for none, the type when all share it, else "multi". */
export function toolbarKeyFor(elements: Pick<Element, "type">[]): ToolbarKey {
  if (!elements.length) return "page";
  const t = elements[0].type;
  return elements.every((e) => e.type === t) ? t : "multi";
}

export interface CommentPin {
  docId: number;
  pageId: string;
  /** Page mm. */
  x: number;
  y: number;
  elementId: string | null;
}
type CommentHandler = (pin: CommentPin, editor: EditorApi) => void;
let commentHandler: CommentHandler | null = null;

/** DS-13 sets the thread UI for C + click; until then the shell's stub runs. */
export function registerCommentHandler(fn: CommentHandler, opts: { fallback?: boolean } = {}): void {
  if (opts.fallback && commentHandler && !(commentHandler as CommentHandler & { fallback?: boolean }).fallback) return;
  commentHandler = Object.assign(fn, { fallback: !!opts.fallback });
  changed();
}
export const getCommentHandler = (): CommentHandler | null => commentHandler;

/** Subscribe to registry changes (useSyncExternalStore). */
export const subscribeRegistry = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const registryVersion = (): number => version;

/** Test hook. */
export function resetRegistry(): void {
  drawers.clear();
  toolbars.clear();
  commentHandler = null;
  changed();
}
