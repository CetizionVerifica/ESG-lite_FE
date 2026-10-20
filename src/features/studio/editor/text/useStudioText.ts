// DS-7 · one TipTap editor for report text (in place on a sheet, or the
// narrative editor in the drawer): the contract schema, live chips, footnote
// numbers from the element's base, and the `{{` data picker.
import { useEffect, useRef, useState } from "react";
import { closeHistory } from "@tiptap/pm/history";
import { useEditor, type Editor } from "@tiptap/react";
import type { DataItem, TextDoc } from "../../../../lib/studio/contracts";
import { chipName, primeChip, useChipData } from "./chipData";
import { cleanChipAttrs, toTiptap } from "./convert";
import { dataChipView } from "./chipView";
import { studioTextExtensions, triggerKey, type TriggerState } from "./extensions";
import { chipFor } from "./picker";

const IDLE: TriggerState = { active: false, from: 0, to: 0, query: "" };

export interface StudioTextOptions {
  initial: TextDoc | undefined;
  footnoteBase?: number;
  editable?: boolean;
  onEscape?: () => void;
  onUpdate?: (editor: Editor) => void;
}

export function useStudioText({ initial, footnoteBase = 1, editable = true, onEscape, onUpdate }: StudioTextOptions) {
  const chips = useChipData();
  const chipsRef = useRef(chips);
  chipsRef.current = chips;
  const baseRef = useRef(footnoteBase);
  baseRef.current = footnoteBase;
  const keyRef = useRef<(e: KeyboardEvent) => boolean>(() => false);
  const escRef = useRef(onEscape);
  escRef.current = onEscape;
  const updRef = useRef(onUpdate);
  updRef.current = onUpdate;

  const editor = useEditor(
    {
      extensions: studioTextExtensions({
        chipView: dataChipView(),
        chipText: (a) => {
          const attrs = cleanChipAttrs(a);
          return attrs && chipsRef.current ? chipsRef.current.text(attrs) : "…";
        },
        footnoteBase: () => baseRef.current,
        onTriggerKey: (e) => keyRef.current(e),
      }),
      content: toTiptap(initial) as never,
      editable,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: { "aria-label": "Text", spellcheck: "true" },
        handleKeyDown: (view, e) => {
          if (e.key === "Escape" && !triggerKey.getState(view.state)?.active && escRef.current) {
            escRef.current();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: e }) => updRef.current?.(e as Editor),
    },
    [],
  );

  // Footnote numbers follow the base (a move above or below renumbers).
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta("dsFootnoteBase", footnoteBase));
  }, [editor, footnoteBase]);
  // Chips redraw when their values arrive.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta("dsChipData", true));
  }, [editor, chips]);
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(editable);
  }, [editor, editable]);

  const [trigger, setTrigger] = useState<TriggerState>(IDLE);
  useEffect(() => {
    if (!editor) return;
    const f = () => {
      const s = triggerKey.getState(editor.state);
      setTrigger((prev) => (s && (s.active !== prev.active || s.from !== prev.from || s.query !== prev.query) ? { active: s.active, from: s.from, to: s.to, query: s.query } : prev));
    };
    editor.on("transaction", f);
    return () => {
      editor.off("transaction", f);
    };
  }, [editor]);

  return { editor, trigger, keyRef };
}

/** Puts a chip for a picked item at the range (the `{{query`) or the selection, then a space. */
export function insertChip(editor: Editor, item: DataItem, range?: { from: number; to: number }): void {
  const attrs = chipFor(item);
  primeChip(attrs, { ...item.resolved, source: item.binding.source }, chipName(attrs, item.label));
  const content = [{ type: "data", attrs }, { type: "text", text: " " }];
  // A chip is its own undo step: undo after deleting it brings it back, not the typing before.
  editor.view.dispatch(closeHistory(editor.state.tr));
  const chain = editor.chain().focus();
  (range ? chain.insertContentAt(range, content) : chain.insertContent(content)).run();
  editor.view.dispatch(closeHistory(editor.state.tr));
}
