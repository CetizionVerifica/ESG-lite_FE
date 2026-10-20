// DS-6 · editor state: one ReportDoc (inside the undo history) plus the UI
// around it (layer rule 3). Every doc change is a `commit` through docOps;
// selection, zoom, view, drawer and toggles are UI state and never undo.
import type { ReportDoc } from "../../../lib/studio/contracts";
import { freeformPage } from "../../../lib/studio/docOps";
import type { StyleClip } from "../../../lib/studio/docOps";
import { commit, createHistory, redo, reset, undo, type History } from "../../../lib/studio/history";

export const DRAWER_IDS = ["templates", "elements", "text", "brand", "uploads", "data", "charts", "ai", "pages"] as const;
export type DrawerId = (typeof DRAWER_IDS)[number];
export type ViewMode = "scroll" | "strip" | "grid";
export type PositionTab = "arrange" | "layers";
export type ShowKey = "rulers" | "margins" | "bleed" | "guides";

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;
export const clampZoom = (z: number): number => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;

export interface CropTarget {
  pageId: string;
  elementId: string;
  cell?: number;
}

export interface EditorUi {
  /** The page in view (selection lives on it). */
  pageId: string | null;
  selection: string[];
  /** A group entered by double-click: clicks select single members. */
  enteredGroup: string | null;
  zoom: number;
  /** Zoom follows the canvas width (Fit). */
  fit: boolean;
  view: ViewMode;
  /** Open drawer tab; null = drawer closed. */
  drawer: DrawerId | null;
  /** The Position panel replaces the drawer content while open. */
  position: PositionTab | null;
  show: Record<ShowKey, boolean>;
  crop: CropTarget | null;
  /** C: the next click on a page drops a comment pin. */
  commentMode: boolean;
  /** Pages picked in grid view. */
  gridSelection: string[];
  clip: StyleClip | null;
  /** A hover preview from a drawer (Styles): drawn instead of the doc, never saved. */
  preview: ReportDoc | null;
  notesOpen: boolean;
}

export interface EditorState {
  history: History<ReportDoc>;
  ui: EditorUi;
}

export const initialUi = (doc: ReportDoc): EditorUi => ({
  pageId: doc.pages[0]?.id ?? null,
  selection: [],
  enteredGroup: null,
  zoom: 1,
  fit: true,
  view: "scroll",
  drawer: null,
  position: null,
  show: { rulers: true, margins: true, bleed: false, guides: true },
  crop: null,
  commentMode: false,
  gridSelection: [],
  clip: null,
  preview: null,
  notesOpen: false,
});

export const initialState = (doc: ReportDoc, history?: History<ReportDoc> | null): EditorState => ({ history: history ?? createHistory(doc), ui: initialUi(history?.present ?? doc) });

export type EditorAction =
  | { type: "commit"; doc: ReportDoc; label: string; mergeKey?: string; select?: string[]; pageId?: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; doc: ReportDoc }
  | { type: "select"; ids: string[]; pageId?: string }
  | { type: "enterGroup"; groupId: string | null }
  | { type: "page"; pageId: string }
  | { type: "zoom"; zoom: number; fit?: boolean }
  | { type: "view"; view: ViewMode }
  | { type: "drawer"; drawer: DrawerId | null; toggle?: boolean }
  | { type: "position"; tab: PositionTab | null }
  | { type: "show"; key: ShowKey; value?: boolean }
  | { type: "crop"; target: CropTarget | null }
  | { type: "commentMode"; on: boolean }
  | { type: "gridSelection"; ids: string[] }
  | { type: "clip"; clip: StyleClip | null }
  | { type: "preview"; doc: ReportDoc | null }
  | { type: "notes"; open: boolean };

/** Drops selection ids that no longer exist (after undo, delete, page change). */
function cleanUi(ui: EditorUi, doc: ReportDoc): EditorUi {
  const pageId = ui.pageId && doc.pages.some((p) => p.id === ui.pageId) ? ui.pageId : (doc.pages[0]?.id ?? null);
  const page = freeformPage(doc, pageId);
  const ids = new Set(page?.elements.map((e) => e.id) ?? []);
  const selection = ui.selection.filter((id) => ids.has(id));
  const gridSelection = ui.gridSelection.filter((id) => doc.pages.some((p) => p.id === id));
  const crop = ui.crop && freeformPage(doc, ui.crop.pageId)?.elements.some((e) => e.id === ui.crop?.elementId) ? ui.crop : null;
  if (pageId === ui.pageId && selection.length === ui.selection.length && gridSelection.length === ui.gridSelection.length && crop === ui.crop) return ui;
  return { ...ui, pageId, selection, gridSelection, crop };
}

export function editorReducer(state: EditorState, a: EditorAction): EditorState {
  const { history, ui } = state;
  switch (a.type) {
    case "commit": {
      const h = commit(history, a.doc, a.label, { mergeKey: a.mergeKey });
      const next = { ...ui, pageId: a.pageId ?? ui.pageId, selection: a.select ?? ui.selection, preview: null };
      return { history: h, ui: cleanUi(next, h.present) };
    }
    case "undo": {
      const h = undo(history);
      return h === history ? state : { history: h, ui: cleanUi({ ...ui, preview: null }, h.present) };
    }
    case "redo": {
      const h = redo(history);
      return h === history ? state : { history: h, ui: cleanUi({ ...ui, preview: null }, h.present) };
    }
    case "reset": {
      const h = reset(history, a.doc);
      return { history: h, ui: cleanUi(ui, a.doc) };
    }
    case "select":
      return { ...state, ui: { ...ui, selection: a.ids, pageId: a.pageId ?? ui.pageId, enteredGroup: a.ids.length ? ui.enteredGroup : null, crop: null } };
    case "enterGroup":
      return { ...state, ui: { ...ui, enteredGroup: a.groupId } };
    case "page":
      return a.pageId === ui.pageId ? state : { ...state, ui: { ...ui, pageId: a.pageId, selection: [], enteredGroup: null, crop: null } };
    case "zoom":
      return { ...state, ui: { ...ui, zoom: clampZoom(a.zoom), fit: a.fit ?? false } };
    case "view":
      return { ...state, ui: { ...ui, view: a.view, gridSelection: a.view === "grid" ? ui.gridSelection : [] } };
    case "drawer": {
      const drawer = a.toggle && ui.drawer === a.drawer && !ui.position ? null : a.drawer;
      return { ...state, ui: { ...ui, drawer, position: null } };
    }
    case "position":
      return { ...state, ui: { ...ui, position: a.tab } };
    case "show":
      return { ...state, ui: { ...ui, show: { ...ui.show, [a.key]: a.value ?? !ui.show[a.key] } } };
    case "crop":
      return { ...state, ui: { ...ui, crop: a.target, selection: a.target ? [a.target.elementId] : ui.selection, pageId: a.target?.pageId ?? ui.pageId } };
    case "commentMode":
      return { ...state, ui: { ...ui, commentMode: a.on } };
    case "gridSelection":
      return { ...state, ui: { ...ui, gridSelection: a.ids } };
    case "clip":
      return { ...state, ui: { ...ui, clip: a.clip } };
    case "preview":
      return { ...state, ui: { ...ui, preview: a.doc } };
    case "notes":
      return { ...state, ui: { ...ui, notesOpen: a.open } };
  }
}
