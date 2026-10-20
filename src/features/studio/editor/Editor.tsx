// DS-6 · <Editor docId>: the Canva-style editor (05-ux anatomy). The route
// (DS-5 owns /studio/:id) mounts it. It loads the doc, keeps it in the undo
// history, autosaves 1 s after idle (409 → the conflict dialog), and lays out
// the top bar, rail + drawer, contextual toolbar, canvas (scroll, strip or
// grid view) and status bar. Below 1280 px it is view-only (RS R16).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { FontId, ReportDoc, StudioDocResponse } from "../../../lib/studio/contracts";
import { loadHistory, saveHistory } from "../../../lib/studio/history";
import { ensureStudioFonts } from "../../../lib/studio/renderHost";
import { Button, Callout, EmptyState, Loading, Modal, Skeleton } from "../../../ui";
import { conflictRev, dsCode, editorErrorMessage, getStudioDoc, useSaveStudioDoc, useStudioDoc } from "./api";
import { Canvas } from "./Canvas";
import { ChartsHost } from "./charts/ChartsHost"; // DS-8
import { ContextMenu } from "./ContextMenu";
import { ContextToolbar } from "./ContextToolbar";
import { EditorContext, useEditor, useEditorApi, useEditorStore, type EditorApi } from "./EditorContext";
import { GridView } from "./GridView";
import { registerEditorPlugins } from "./plugins";
import { useRenderInputs } from "./renderInputs";
import { commandFor, isTypingTarget, runCommand, SHORTCUT_HELP, type Command } from "./shortcuts";
import { DrawerHost, SideRail } from "./SideRail";
import { ChecksPanelHost } from "../checks/ChecksPanel"; // DS-12
import { ReviewPanelHost } from "../review/ReviewPanel"; // DS-13
import { ApprovalBar } from "../review/ApprovalBar"; // DS-13
import { DriftBanner } from "../review/DriftBanner"; // DS-13
import { ReviewLinks } from "../review/ReviewLinks"; // DS-13
import { STUDIO_REV_EVENT } from "../panels/data/api"; // DS-12
import { StatusBar } from "./StatusBar";
import { TopBar, type SaveState } from "./TopBar";
import { useStudioCompanyId } from "../../../lib/studio/switch";

/** Narrower than this, the editor is view-only (RS R16). */
export const EDIT_MIN_WIDTH = 1280;
/** Autosave waits this long after the last change (layer rule 3). */
export const AUTOSAVE_MS = 1000;

function useWindowWidth(): number {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1600 : window.innerWidth));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

export function Editor({ docId }: { docId: number }) {
  registerEditorPlugins();
  const q = useStudioDoc(docId);
  if (q.isPending)
    return (
      <Loading label="Opening the design" className="flex h-full flex-col gap-3 p-6">
        <Skeleton className="h-12" />
        <Skeleton className="h-[60vh]" />
      </Loading>
    );
  if (q.isError)
    return (
      <div className="p-6">
        <EmptyState variant="error" title="This design couldn't be opened." description={editorErrorMessage(q.error)} action={dsCode(q.error) === "DS_DOC_NOT_FOUND" ? undefined : <Button size="sm" onClick={() => void q.refetch()}>Try again</Button>} />
      </div>
    );
  return <LoadedEditor key={`${docId}`} docId={docId} initial={q.data} />;
}

function LoadedEditor({ docId, initial }: { docId: number; initial: StudioDocResponse }) {
  const width = useWindowWidth();
  const readOnly = width < EDIT_MIN_WIDTH || initial.status === "final";
  const [state, dispatch] = useEditorStore(initial.doc, useMemo(() => loadHistory<ReportDoc>(docId, initial.rev), [docId, initial.rev]));
  const shown = state.ui.preview ?? state.history.present;
  const render = useRenderInputs(shown, docId);
  const ed = useEditorApi(state, dispatch, { docId, readOnly, render });
  const save = useAutosave(docId, initial, state.history.present, readOnly, (doc) => dispatch({ type: "reset", doc }));
  const [help, setHelp] = useState(false);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);

  // Undo survives a reload: the stack is kept per doc and rev (debounced).
  useEffect(() => {
    const t = window.setTimeout(() => saveHistory(docId, save.rev, state.history), 1500);
    return () => window.clearTimeout(t);
  }, [docId, save.rev, state.history]);

  // The report's faces (theme fonts) load once into document.fonts.
  const fonts = state.history.present.design.theme.fonts;
  useEffect(() => {
    const ids = [fonts?.heading, fonts?.body, render.brand?.fontHeading, render.brand?.fontBody].filter((f): f is FontId => !!f);
    void ensureStudioFonts(ids);
  }, [fonts?.heading, fonts?.body, render.brand?.fontHeading, render.brand?.fontBody]);

  // Shortcuts on the window; never while typing in a field, menu or dialog.
  const edRef = useRef<EditorApi>(ed);
  edRef.current = ed;
  const run = useCallback((cmd: Command) => runCommand(cmd, edRef.current, { openHelp: () => setHelp(true) }), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      const cmd = commandFor(e);
      if (cmd && run(cmd)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run]);

  return (
    <EditorContext.Provider value={ed}>
      <div data-testid="studio-editor" className="flex h-[calc(100vh-4rem)] min-h-[560px] flex-col overflow-hidden rounded-card border border-line bg-page text-ink">
        <TopBar save={save.state} status={initial.status} onHelp={() => setHelp(true)} />
        <ApprovalBar /> {/* DS-13: approval requested / approved / changes requested */}
        <DriftBanner /> {/* DS-13: texts written before the data changed */}
        <ReviewLinks /> {/* DS-13: ?comment= and ?approval= from a notification */}
        {width < EDIT_MIN_WIDTH && (
          <Callout tone="info" className="m-2">
            Editing needs a screen at least 1,280 px wide. You can view the pages, comment and download here.
          </Callout>
        )}
        <div className="flex min-h-0 flex-1">
          <SideRail />
          <DrawerHost />
          <ChecksPanelHost /> {/* DS-12: the checks panel */}
          <ReviewPanelHost /> {/* DS-13: comments, tasks, data changes */}
          <section className="flex min-w-0 flex-1 flex-col" aria-label="Pages">
            {state.ui.view === "grid" ? (
              <GridView />
            ) : (
              <>
                <ContextToolbar />
                <div
                  className="relative flex min-h-0 flex-1 flex-col"
                  onContextMenu={(e) => {
                    if (!(e.target as HTMLElement).closest("[data-overlay-page]")) return;
                    e.preventDefault();
                    // Let the overlay update the selection first.
                    window.setTimeout(() => setMenuAt({ x: e.clientX, y: e.clientY }), 0);
                  }}
                >
                  <Canvas />
                  <FiguresNotice />
                </div>
              </>
            )}
            <StatusBar />
          </section>
        </div>
        {menuAt && <ContextMenu at={menuAt} onClose={() => setMenuAt(null)} run={(c) => void run(c)} />}
        {/* DS-8: figure choice and the chart / table dialogs. */}
        <ChartsHost />
        <Modal open={help} onClose={() => setHelp(false)} title="Keyboard shortcuts" cancelLabel="Close">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {SHORTCUT_HELP.map((s) => (
              <div key={s.keys} className="contents">
                <dt className="font-num text-ink">{s.keys}</dt>
                <dd className="text-muted">{s.what}</dd>
              </div>
            ))}
          </dl>
        </Modal>
        <Modal
          open={save.state === "conflict"}
          onClose={() => undefined}
          title="This design changed somewhere else"
          description="Someone saved a newer version while you were editing. Load theirs, or keep yours and replace it."
          primaryAction={{ label: "Keep my changes", onClick: save.keepMine }}
          cancelLabel={null}
        >
          <Button variant="secondary" size="sm" onClick={() => void save.loadTheirs()}>
            Load the saved version
          </Button>
        </Modal>
      </div>
    </EditorContext.Provider>
  );
}

/** While /studio/resolve hasn't answered: "Loading figures…"; when it failed: an error with Try again. */
function FiguresNotice() {
  const { render } = useEditor();
  if (!render.hasFigures || render.status === "ready") return null;
  if (render.status === "loading")
    return (
      <div role="status" data-testid="figures-loading" className="pointer-events-none absolute left-1/2 top-3 z-20 inline-flex -translate-x-1/2 items-center gap-2 rounded-chip border border-line bg-panel px-3 py-1 text-xs text-muted shadow-sm">
        <Skeleton className="size-2 rounded-full" />
        Loading figures…
      </div>
    );
  return (
    <Callout
      tone="warn"
      title="The figures couldn't load."
      className="absolute left-1/2 top-3 z-20 w-[420px] max-w-[90%] -translate-x-1/2 shadow-md"
      action={
        <Button size="sm" variant="secondary" onClick={render.retry}>
          Try again
        </Button>
      }
    >
      Linked values show "Couldn't load" until they do. Nothing in the design changed.
    </Callout>
  );
}

interface Autosave {
  state: SaveState;
  rev: number;
  keepMine: () => void;
  loadTheirs: () => Promise<void>;
}

/**
 * PATCHes the doc 1 s after the last change. One request at a time; a change
 * made during a save is saved after it. A 409 stops saving until the user
 * picks a side; other errors retry on the next change or after 5 s.
 */
function useAutosave(docId: number, initial: StudioDocResponse, doc: ReportDoc, readOnly: boolean, replace: (doc: ReportDoc) => void): Autosave {
  const mutation = useSaveStudioDoc(docId);
  const qc = useQueryClient();
  const companyId = useStudioCompanyId();
  const rev = useRef(initial.rev);
  const saved = useRef<ReportDoc>(initial.doc);
  const latest = useRef(doc);
  const busy = useRef(false);
  const serverRev = useRef<number | null>(null);
  const [state, setState] = useState<SaveState>("saved");
  const [revState, setRevState] = useState(initial.rev);
  latest.current = doc;

  const flush = useCallback(async () => {
    if (busy.current || readOnly) return;
    const doc = latest.current;
    if (doc === saved.current) {
      setState("saved");
      return;
    }
    busy.current = true;
    setState("saving");
    try {
      const r = await mutation.mutateAsync({ rev: rev.current, doc });
      rev.current = r.rev;
      setRevState(r.rev);
      saved.current = doc;
      busy.current = false;
      if (latest.current !== doc) void flush();
      else setState("saved");
    } catch (e) {
      busy.current = false;
      if (dsCode(e) === "DS_VERSION_CONFLICT") {
        serverRev.current = conflictRev(e);
        setState("conflict");
      } else setState("error");
    }
    // `mutation` is stable enough: mutateAsync reads the latest options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  useEffect(() => {
    if (readOnly || state === "conflict" || doc === saved.current) return;
    setState((s) => (s === "saving" ? s : "unsaved"));
    const t = window.setTimeout(() => void flush(), AUTOSAVE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, readOnly]);

  // DS-12: report details saved elsewhere (Data drawer, "Mark as excluded…") moved the rev from ours: follow it.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ docId: number; from: number; rev: number }>).detail;
      if (!d || d.docId !== docId || d.from !== rev.current) return;
      rev.current = d.rev;
      setRevState(d.rev);
    };
    window.addEventListener(STUDIO_REV_EVENT, on);
    return () => window.removeEventListener(STUDIO_REV_EVENT, on);
  }, [docId]);

  useEffect(() => {
    if (state !== "error") return;
    const t = window.setTimeout(() => void flush(), 5000);
    return () => window.clearTimeout(t);
  }, [state, flush]);

  // Ask before leaving with unsaved changes.
  const dirty = state === "unsaved" || state === "saving" || state === "error";
  useEffect(() => {
    if (!dirty) return;
    const on = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", on);
    return () => window.removeEventListener("beforeunload", on);
  }, [dirty]);

  return {
    state,
    rev: revState,
    keepMine: () => {
      if (serverRev.current !== null) rev.current = serverRev.current;
      setState("unsaved");
      void flush();
    },
    loadTheirs: async () => {
      const r = await qc.fetchQuery({ queryKey: ["studio", "docs", docId, "editor-reload", companyId], queryFn: () => getStudioDoc(docId, companyId), staleTime: 0 });
      rev.current = r.rev;
      setRevState(r.rev);
      saved.current = r.doc;
      latest.current = r.doc;
      replace(r.doc);
      setState("saved");
    },
  };
}
