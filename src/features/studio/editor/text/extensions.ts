// DS-7 · the TipTap schema of report text: exactly the 01-contracts §2 TextDoc
// (paragraph, heading 2–4, lists, hard break; bold, italic, link, highlight,
// footnote) plus the `data` chip node. Node and mark names are the contract's,
// so getJSON() is a TextDoc after `fromTiptap` drops TipTap's defaults.
//
//   studioTextExtensions({ chipView, footnoteBase, onTrigger })
//     chipView      the React node view of a chip (DataChip.tsx); none in pure tests
//     footnoteBase  the number of this text's first footnote on its page (footnotes.ts)
//     trigger       `{{` opens the data picker: the plugin reports {from, to, query}
import { Extension, Mark, Node, mergeAttributes, type AnyExtension, type Editor, type NodeViewRenderer } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import StarterKit from "@tiptap/starter-kit";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PmNode } from "@tiptap/pm/model";
import { MAX_FOOTNOTE_CHARS } from "../../../../lib/studio/contracts";
import { cleanPastedHtml } from "./convert";

// ---------------------------------------------------------------------------
// Data chip: an inline atom carrying a DataToken's attrs
// ---------------------------------------------------------------------------

export interface ChipTextFn {
  (attrs: Record<string, unknown>): string;
}

export const DataChipNode = Node.create<{ view: NodeViewRenderer | null; text: ChipTextFn }>({
  name: "data",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addOptions() {
    return { view: null, text: () => "#" };
  },
  addAttributes() {
    const json = (name: string) => ({
      default: null,
      parseHTML: (el: HTMLElement) => {
        const raw = el.getAttribute(`data-${name}`);
        if (raw === null) return null;
        try {
          return JSON.parse(raw);
        } catch {
          return raw;
        }
      },
      renderHTML: (attrs: Record<string, unknown>) => (attrs[name] === null || attrs[name] === undefined ? {} : { [`data-${name}`]: JSON.stringify(attrs[name]) }),
    });
    return { binding: json("binding"), measure: { ...json("measure"), default: "value" }, format: json("format"), year: json("year") };
  },
  parseHTML() {
    return [{ tag: "span[data-ds-chip]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-ds-chip": "", class: "ds-chip" }), this.options.text(node.attrs)];
  },
  /** Copy as text gives the chip's formatted value (RS-7). */
  renderText({ node }) {
    return this.options.text(node.attrs);
  },
  addNodeView() {
    return this.options.view ?? null;
  },
});

// ---------------------------------------------------------------------------
// Footnote mark + numbering (the renderer's rule, footnotes.ts)
// ---------------------------------------------------------------------------

export const FootnoteMark = Mark.create<{ base: () => number }>({
  name: "footnote",
  // Outermost, so a run over bold and plain text stays one wrapper.
  priority: 1100,
  inclusive: false,
  excludes: "footnote",
  addOptions() {
    return { base: () => 1 };
  },
  addAttributes() {
    return {
      note: {
        default: "",
        parseHTML: (el: HTMLElement) => (el.getAttribute("data-footnote") ?? "").slice(0, MAX_FOOTNOTE_CHARS),
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-footnote": String(attrs.note ?? ""), title: `Footnote: ${String(attrs.note ?? "")}` }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-footnote]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "ds-fn-mark" }), 0];
  },
  addProseMirrorPlugins() {
    const base = this.options.base;
    return [
      new Plugin({
        key: new PluginKey("dsFootnoteNumbers"),
        props: { decorations: (state) => footnoteDecorations(state.doc, base()) },
      }),
    ];
  },
});

const noteOf = (n: PmNode | null | undefined): string | null => {
  if (!n || !n.isText) return null;
  const m = n.marks.find((x) => x.type.name === "footnote");
  const note = typeof m?.attrs.note === "string" ? m.attrs.note.trim() : "";
  return note || null;
};

/** Where each footnote run ends in a ProseMirror doc, with its number (same rule as render/footnotes.ts). */
export function footnoteRunEnds(doc: PmNode, base = 1): { pos: number; n: number; note: string }[] {
  const out: { pos: number; n: number; note: string }[] = [];
  let n = base;
  doc.descendants((block, pos) => {
    if (!block.isTextblock) return true;
    const kids: { node: PmNode; end: number }[] = [];
    block.forEach((child, offset) => kids.push({ node: child, end: pos + 1 + offset + child.nodeSize }));
    kids.forEach((k, i) => {
      const note = noteOf(k.node);
      if (!note) return;
      for (let j = i + 1; j < kids.length; j++) {
        const next = kids[j].node;
        if (next.type.name === "data") continue;
        if (noteOf(next) === note) return;
        break;
      }
      out.push({ pos: k.end, n: n++, note });
    });
    return false;
  });
  return out;
}

function footnoteDecorations(doc: PmNode, base: number): DecorationSet {
  const ends = footnoteRunEnds(doc, base);
  if (!ends.length) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    ends.map((e) =>
      Decoration.widget(
        e.pos,
        () => {
          const sup = document.createElement("sup");
          sup.className = "ds-fn-ref";
          sup.setAttribute("data-fn", String(e.n));
          sup.contentEditable = "false";
          sup.textContent = String(e.n);
          return sup;
        },
        { side: -1, key: `fn-${e.n}-${e.note}` },
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// `{{` opens the data picker
// ---------------------------------------------------------------------------

export interface TriggerState {
  active: boolean;
  /** The range of `{{query` in the doc (replaced by the chip). */
  from: number;
  to: number;
  query: string;
}
const IDLE: TriggerState = { active: false, from: 0, to: 0, query: "" };
export const triggerKey = new PluginKey<TriggerState & { dismissedAt: number | null }>("dsDataTrigger");
const TRIGGER = /\{\{([^{}\n￼]{0,40})$/;

/** The `{{query` before the cursor, if any (pure, for tests). */
export function triggerAt(state: EditorState): TriggerState {
  const sel = state.selection;
  if (!sel.empty) return IDLE;
  const $from = sel.$from;
  if (!$from.parent.isTextblock) return IDLE;
  const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 60), $from.parentOffset, undefined, "￼");
  const m = TRIGGER.exec(before);
  if (!m) return IDLE;
  return { active: true, from: $from.pos - m[0].length, to: $from.pos, query: m[1] };
}

export interface TriggerOptions {
  /** Keys while the picker is open (arrows, Enter, Escape): return true when handled. */
  onKey: (e: KeyboardEvent) => boolean;
}

export const DataTrigger = Extension.create<TriggerOptions>({
  name: "dataTrigger",
  addOptions() {
    return { onKey: () => false };
  },
  addProseMirrorPlugins() {
    const opts = this.options;
    return [
      new Plugin({
        key: triggerKey,
        state: {
          init: (): TriggerState & { dismissedAt: number | null } => ({ ...IDLE, dismissedAt: null }),
          apply(tr, prev, _old, next) {
            const meta = tr.getMeta(triggerKey) as { dismiss?: boolean } | undefined;
            const t = triggerAt(next);
            if (meta?.dismiss) return { ...IDLE, dismissedAt: t.active ? t.from : null };
            if (t.active && prev.dismissedAt === t.from) return { ...IDLE, dismissedAt: prev.dismissedAt };
            return { ...t, dismissedAt: t.active ? null : prev.dismissedAt };
          },
        },
        props: {
          handleKeyDown(view, e) {
            const st = triggerKey.getState(view.state);
            if (!st?.active) return false;
            if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) return opts.onKey(e);
            return false;
          },
        },
      }),
    ];
  },
});

/** Closes the picker until the `{{` is typed again. */
export const dismissTrigger = (editor: Editor): void => {
  editor.view.dispatch(editor.state.tr.setMeta(triggerKey, { dismiss: true }));
};

// ---------------------------------------------------------------------------
// The whole schema
// ---------------------------------------------------------------------------

export interface StudioTextOptions {
  chipView?: NodeViewRenderer | null;
  chipText?: ChipTextFn;
  footnoteBase?: () => number;
  onTriggerKey?: TriggerOptions["onKey"];
  /** Single-line contexts can pass false to drop lists. */
  lists?: boolean;
}

export function studioTextExtensions(o: StudioTextOptions = {}): AnyExtension[] {
  const lists = o.lists !== false;
  return [
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
      underline: false,
      dropcursor: false,
      trailingNode: false,
      heading: { levels: [2, 3, 4] },
      bulletList: lists ? {} : false,
      orderedList: lists ? {} : false,
      listItem: lists ? {} : false,
      listKeymap: lists ? {} : false,
      link: { openOnClick: false, autolink: false, linkOnPaste: true, protocols: [], isAllowedUri: (url: string) => /^(https?:\/\/|mailto:)/i.test(url.trim()) },
    }),
    Highlight.configure({ multicolor: true }),
    DataChipNode.configure({ view: o.chipView ?? null, text: o.chipText ?? (() => "#") }),
    FootnoteMark.configure({ base: o.footnoteBase ?? (() => 1) }),
    DataTrigger.configure({ onKey: o.onTriggerKey ?? (() => false) }),
    Extension.create({
      name: "dsPasteClean",
      addProseMirrorPlugins: () => [new Plugin({ key: new PluginKey("dsPasteClean"), props: { transformPastedHTML: cleanPastedHtml } })],
    }),
  ];
}
