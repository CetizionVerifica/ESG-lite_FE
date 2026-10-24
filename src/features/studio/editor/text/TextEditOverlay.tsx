// DS-7 · in-place text editing (RS-7 §1). Double-click a text box or callout:
// TipTap mounts over the sheet at the element's position, inside a shadow root
// that holds the renderer's own CSS and the element's own rendered box (theme
// variables, page colours, text style), so what you type looks as it prints.
// Esc, a click outside, or editing another element commits one history step.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorContent } from "@tiptap/react";
import type { RenderDoc, RenderFreeformPage } from "../../../../lib/studio/render";
import { renderSheet } from "../../../../lib/studio/render";
import type { Element, FreeformPage, TextDoc } from "../../../../lib/studio/contracts";
import { mmToPx } from "../../../../lib/studio/geometry";
import { useEditor as useStudioEditor } from "../EditorContext";
import { sheetRoot } from "../canvasUtil";
import type { PageOverlayProps } from "../registry";
import { scopeOf } from "../renderInputs";
import { ChipDataProvider } from "./ChipDataProvider";
import { fromTiptap, sameText, type PmJson } from "./convert";
import { clearEditing, setActiveEditor, useEditingTarget } from "./editing";
import { footnoteBaseOf, isTextElement, setElementText } from "./ops";
import { OverflowTag } from "./OverflowLayer";
import { TriggerPicker } from "./TriggerPicker";
import { useStudioText } from "./useStudioText";

/** Editor-only rules inside the shadow root (ProseMirror's own CSS can't reach it). */
const EDITOR_CSS = `
.ProseMirror{outline:none;white-space:pre-wrap;word-wrap:break-word;-webkit-font-variant-ligatures:none;font-variant-ligatures:none;min-height:1em;caret-color:currentColor;}
.ProseMirror>*:first-child{margin-top:0;}.ProseMirror>*:last-child{margin-bottom:0;}
.ProseMirror .ds-fn-mark{text-decoration:underline dotted;text-underline-offset:0.15em;}
.ProseMirror-selectednode{outline:none;}
.ds-edit-el{pointer-events:auto;outline:1.5px solid color-mix(in srgb,var(--primary) 70%,transparent);outline-offset:0.6mm;}
`;

const KEEP = '[role="toolbar"],[data-ds-text-keep],[role="dialog"],[role="menu"],[role="listbox"],[role="tooltip"]';

/** Paints the element (text emptied) on a transparent copy of its page and returns the box TipTap goes into. */
function paintShell(host: HTMLDivElement, page: FreeformPage, el: Element, doc: RenderDoc, brand: Parameters<typeof renderSheet>[4]): HTMLElement | null {
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const empty: TextDoc = { type: "doc", content: [] };
  const only = { ...page, background: { color: page.background.color }, guides: [], elements: [{ ...el, hidden: false, opacity: undefined, props: { ...el.props, doc: empty } }] } as unknown as RenderFreeformPage;
  const r = renderSheet(only, doc, null, { mode: "sheet" }, brand);
  root.innerHTML = `<style>:host{display:block;}${r.css}${EDITOR_CSS}</style>${r.html}`;
  const sheet = root.querySelector<HTMLElement>(".ds-sheet");
  if (sheet) {
    sheet.style.backgroundColor = "transparent";
    sheet.style.boxShadow = "none";
    sheet.style.pointerEvents = "none";
    sheet.style.overflow = "visible";
  }
  root.querySelector(".ds-footnotes")?.remove();
  const box = root.querySelector<HTMLElement>(`[data-el-id]`);
  box?.classList.add("ds-edit-el");
  return root.querySelector<HTMLElement>(".ds-text-in, .ds-callout-text");
}

/** Hides the rendered element under the editor (again after every re-render of the sheet). */
function useHideRendered(pageId: string, elementId: string) {
  useEffect(() => {
    const root = sheetRoot(pageId);
    if (!root) return;
    const sel = `[data-el-id="${elementId.replace(/["\\]/g, "\\$&")}"]`;
    const hide = () => {
      const n = root.querySelector<HTMLElement>(sel);
      if (n && n.style.visibility !== "hidden") n.style.visibility = "hidden";
    };
    hide();
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(hide) : null;
    mo?.observe(root, { childList: true, subtree: true });
    return () => {
      mo?.disconnect();
      const n = root.querySelector<HTMLElement>(sel);
      if (n) n.style.visibility = "";
    };
  }, [pageId, elementId]);
}

export function TextEditOverlay({ page, zoom, wMm }: PageOverlayProps) {
  const target = useEditingTarget();
  if (!target || target.pageId !== page.id) return null;
  const el = page.elements.find((e) => e.id === target.elementId);
  if (!isTextElement(el)) return null;
  return <InPlaceEditor key={el.id} page={page} el={el} zoom={zoom} wMm={wMm} selectAll={!!target.selectAll} />;
}

function InPlaceEditor({ page, el, zoom, wMm, selectAll }: { page: FreeformPage; el: Element; zoom: number; wMm: number; selectAll: boolean }) {
  const ed = useStudioEditor();
  const scope = useMemo(() => scopeOf(ed.doc), [ed.doc]);
  return (
    <ChipDataProvider scope={scope} data={ed.render.data}>
      <InPlaceBody page={page} el={el} zoom={zoom} wMm={wMm} selectAll={selectAll} scope={scope} />
    </ChipDataProvider>
  );
}

function InPlaceBody({ page, el, zoom, wMm, selectAll, scope }: { page: FreeformPage; el: Element; zoom: number; wMm: number; selectAll: boolean; scope: ReturnType<typeof scopeOf> }) {
  const ed = useStudioEditor();
  const edRef = useRef(ed);
  edRef.current = ed;
  const host = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<HTMLElement | null>(null);
  const initial = isTextElement(el) ? el.props.doc : undefined;
  const done = useRef(false);
  const [overflow, setOverflow] = useState(0);
  useHideRendered(page.id, el.id);

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    const e = editorRef.current;
    if (e && !e.isDestroyed) {
      const next = fromTiptap(e.getJSON() as PmJson);
      const cur = edRef.current;
      if (!sameText(initial, next) && !cur.readOnly) cur.commit(setElementText(cur.doc, page.id, el.id, next), "Edit text", { select: [el.id], pageId: page.id });
    }
    clearEditing();
  }, [initial, page.id, el.id]);

  const { editor, trigger, keyRef } = useStudioText({ initial, footnoteBase: footnoteBaseOf(page, el.id), onEscape: finish });
  const editorRef = useRef(editor);
  editorRef.current = editor;

  // The shell box (renderer markup) inside the shadow root; repainted when the element's look changes.
  const look = JSON.stringify({ f: el.frame, p: { ...el.props, doc: null }, bg: page.background.color, t: ed.doc.design.theme, b: ed.render.brand });
  useLayoutEffect(() => {
    if (!host.current) return;
    setBox(paintShell(host.current, page, el, ed.doc as unknown as RenderDoc, ed.render.brand));
    // `look` stands for what the shell reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look]);

  // Register with the toolbar, focus, and select all for a fresh box.
  useEffect(() => {
    if (!editor) return;
    setActiveEditor(editor, finish);
    window.setTimeout(() => {
      if (editor.isDestroyed) return;
      if (selectAll) editor.commands.selectAll();
      editor.commands.focus(selectAll ? undefined : "end");
    }, 0);
    return () => {
      // Unmounted without Esc or a click outside (page change, undo, delete): commit.
      if (!done.current) finish();
    };
  }, [editor, finish, selectAll]);

  // Selecting something else, or another page, ends editing.
  const selected = ed.ui.selection.includes(el.id) && ed.ui.pageId === page.id;
  useEffect(() => {
    if (!selected) finish();
  }, [selected, finish]);

  // A click outside the text (and outside the toolbar, the drawer's text tools and popovers) commits.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const path = e.composedPath();
      if (wrap.current && path.includes(wrap.current)) return;
      if (path.some((n) => n instanceof window.Element && n.matches(KEEP))) return;
      finish();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [finish]);

  // Live overflow while typing (the same comparison as render/measure.ts).
  useEffect(() => {
    if (!editor || !box) return;
    const measure = () => {
      const frame = box.closest<HTMLElement>(".ds-text, .ds-callout") ?? box;
      const over = (box.scrollHeight - frame.clientHeight) / mmToPx(1);
      setOverflow(over > 0.3 ? over : 0);
    };
    measure();
    editor.on("update", measure);
    return () => {
      editor.off("update", measure);
    };
  }, [editor, box]);

  return (
    <div
      ref={wrap}
      className="pointer-events-none absolute inset-0"
      data-testid="text-edit-overlay"
      data-ds-text-keep=""
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <div ref={host} style={{ width: `${wMm}mm`, transform: `scale(${zoom})`, transformOrigin: "0 0" }} />
      {box && editor && createPortal(<EditorContent editor={editor} className="ds-edit-content" />, box)}
      <TriggerPicker editor={editor} trigger={trigger} keyRef={keyRef} scope={scope} />
      {overflow > 0 && <OverflowTag el={el} overflowMm={overflow} zoom={zoom} format={ed.doc.format} live />}
    </div>
  );
}
