// DS-6 · the editor store and the API every part of the shell (and every
// registered drawer and toolbar) uses. One reducer holds the doc history and
// the UI; `EditorApi` wraps it so callers never dispatch raw actions.
import { createContext, useContext, useMemo, useReducer, type Dispatch } from "react";
import type { Element, FreeformPage, ReportDoc } from "../../../lib/studio/contracts";
import { addElement, freeformPage, newId, type IdFn } from "../../../lib/studio/docOps";
import type { Point } from "../../../lib/studio/geometry";
import { canRedo, canUndo, redoLabel, undoLabel, type History } from "../../../lib/studio/history";
import type { RenderInputs } from "./renderInputs";
import { editorReducer, initialState, type CropTarget, type DrawerId, type EditorAction, type EditorState, type EditorUi, type PositionTab, type ShowKey, type ViewMode } from "./state";

export interface CommitOptions {
  mergeKey?: string;
  /** Selection after the change. */
  select?: string[];
  pageId?: string;
}

export interface EditorApi {
  docId: number;
  /** The doc as saved in history (never the hover preview). */
  doc: ReportDoc;
  /** What the sheets draw: the preview while a drawer hovers, else the doc. */
  shown: ReportDoc;
  ui: EditorUi;
  /** Below 1280 px, or a final: view, comment and download only. */
  readOnly: boolean;
  render: RenderInputs;
  /** The page in view, when it's a free-form page. */
  page: FreeformPage | undefined;
  /** Selected elements on that page, in page order. */
  selected: Element[];

  commit: (next: ReportDoc, label: string, opts?: CommitOptions) => void;
  preview: (next: ReportDoc | null) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;

  select: (ids: string[], pageId?: string) => void;
  enterGroup: (groupId: string | null) => void;
  setPage: (pageId: string) => void;
  openDrawer: (id: DrawerId | null, toggle?: boolean) => void;
  openPosition: (tab: PositionTab | null) => void;
  setZoom: (zoom: number, fit?: boolean) => void;
  setView: (view: ViewMode) => void;
  toggleShow: (key: ShowKey, value?: boolean) => void;
  startCrop: (target: CropTarget | null) => void;
  setCommentMode: (on: boolean) => void;
  setGridSelection: (ids: string[]) => void;
  setClip: (clip: EditorUi["clip"]) => void;
  setNotesOpen: (open: boolean) => void;
  /** Adds an element (from a drawer) on the page in view: at its centre, or at a drop point. Returns the new id. */
  insertElement: (template: Element, opts?: { pageId?: string; at?: Point; label?: string }) => string | null;
  /** Ids for new elements and pages (tests swap it). */
  newId: IdFn;
}

export const EditorContext = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
  const v = useContext(EditorContext);
  if (!v) throw new Error("useEditor outside <EditorProvider>");
  return v;
}

/** The store; `Editor` passes the API down through EditorContext. */
export function useEditorStore(doc: ReportDoc, history: History<ReportDoc> | null): [EditorState, Dispatch<EditorAction>] {
  return useReducer(editorReducer, undefined, () => initialState(doc, history));
}

export function useEditorApi(state: EditorState, dispatch: Dispatch<EditorAction>, opts: { docId: number; readOnly: boolean; render: RenderInputs; ids?: IdFn }): EditorApi {
  const { history, ui } = state;
  const { docId, readOnly, render } = opts;
  const ids = opts.ids ?? newId;
  return useMemo<EditorApi>(() => {
    const doc = history.present;
    const page = freeformPage(doc, ui.pageId);
    const sel = new Set(ui.selection);
    const selected = page ? page.elements.filter((e) => sel.has(e.id)) : [];
    const commit = (next: ReportDoc, label: string, o: CommitOptions = {}) => {
      if (readOnly) return;
      dispatch({ type: "commit", doc: next, label, mergeKey: o.mergeKey, select: o.select, pageId: o.pageId });
    };
    return {
      docId,
      doc,
      shown: ui.preview ?? doc,
      ui,
      readOnly,
      render,
      page,
      selected,
      commit,
      preview: (next) => dispatch({ type: "preview", doc: next }),
      undo: () => !readOnly && dispatch({ type: "undo" }),
      redo: () => !readOnly && dispatch({ type: "redo" }),
      canUndo: !readOnly && canUndo(history),
      canRedo: !readOnly && canRedo(history),
      undoLabel: undoLabel(history),
      redoLabel: redoLabel(history),
      select: (selIds, pageId) => dispatch({ type: "select", ids: selIds, pageId }),
      enterGroup: (groupId) => dispatch({ type: "enterGroup", groupId }),
      setPage: (pageId) => dispatch({ type: "page", pageId }),
      openDrawer: (id, toggle) => dispatch({ type: "drawer", drawer: id, toggle }),
      openPosition: (tab) => dispatch({ type: "position", tab }),
      setZoom: (zoom, fit) => dispatch({ type: "zoom", zoom, fit }),
      setView: (view) => dispatch({ type: "view", view }),
      toggleShow: (key, value) => dispatch({ type: "show", key, value }),
      startCrop: (target) => !readOnly && dispatch({ type: "crop", target }),
      setCommentMode: (on) => dispatch({ type: "commentMode", on }),
      setGridSelection: (gIds) => dispatch({ type: "gridSelection", ids: gIds }),
      setClip: (clip) => dispatch({ type: "clip", clip }),
      setNotesOpen: (open) => dispatch({ type: "notes", open }),
      insertElement: (template, o = {}) => {
        if (readOnly) return null;
        const pageId = o.pageId ?? (page ? page.id : doc.pages.find((p) => p.kind === "freeform")?.id);
        if (!pageId) return null;
        const r = addElement(doc, pageId, template, { at: o.at, newId: ids });
        if (!r.id) return null;
        commit(r.doc, o.label ?? "Add element", { select: [r.id], pageId });
        return r.id;
      },
      newId: ids,
    };
  }, [history, ui, dispatch, docId, readOnly, render, ids]);
}
