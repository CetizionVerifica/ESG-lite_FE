// DS-7 · the contextual toolbar for text and callouts (05-ux "text"):
//   Style ▾ (the design's nine text styles: they set font, size and weight from
//   the theme), alignment, colour, bold, italic, highlight, link, lists,
//   footnote, Insert data value, Edit text, AI ▾ (DS-9 registers it here),
//   and "Mark as reviewed" for AI-written text (RS-7 §6).
// While a box is edited the marks act on the selection inside it; otherwise
// on all of its text.
import { useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, BadgeCheck, Bold, Database, Highlighter, Italic, Link2, List, ListOrdered, PencilLine, Superscript } from "lucide-react";
import { MAX_FOOTNOTE_CHARS, TEXT_STYLE_IDS, type Element, type TextDoc, type TextMark } from "../../../../lib/studio/contracts";
import { freeformPage, updateProps } from "../../../../lib/studio/docOps";
import { Button, Popover, Select, TextField, cn } from "../../../../ui";
import { themeSwatches } from "../actions";
import type { ToolbarProps } from "../registry";
import { ColourButton, Sep, TbButton, TbLabel } from "../toolbars";
import { scopeOf } from "../renderInputs";
import { ChipDataProvider } from "./ChipDataProvider";
import { TEXT_STYLE_LABELS, textToolbarItems } from "./toolbarSlots";
import { DataPicker } from "./DataPicker";
import { startEditing, useActiveTextEditor, useEditingTarget } from "./editing";
import { hasMarkAll, isTextElement, markAll, markReviewed } from "./ops";
import { insertChip } from "./useStudioText";

const ALIGNS = [
  { v: "left", icon: AlignLeft, label: "Align left" },
  { v: "center", icon: AlignCenter, label: "Align centre" },
  { v: "right", icon: AlignRight, label: "Align right" },
  { v: "justify", icon: AlignJustify, label: "Justify" },
] as const;

/** Selects the word around an empty cursor, so a footnote or link has text to sit on. */
function selectWord(editor: Editor): void {
  const { state } = editor;
  if (!state.selection.empty) return;
  const $p = state.selection.$from;
  const text = $p.parent.textBetween(0, $p.parent.content.size, undefined, "￼");
  let a = $p.parentOffset;
  let b = $p.parentOffset;
  while (a > 0 && /[\p{L}\p{N}₀-₉’'%.-]/u.test(text[a - 1])) a--;
  while (b < text.length && /[\p{L}\p{N}₀-₉’'%.-]/u.test(text[b])) b++;
  if (a === b && a > 0) a = Math.max(0, a - 1);
  editor.commands.setTextSelection({ from: $p.start() + a, to: $p.start() + b });
}

function FootnoteButton({ editor, onAll, disabled }: { editor: Editor | null; onAll: (note: string | null) => void; disabled: boolean }) {
  const current = editor?.getAttributes("footnote").note as string | undefined;
  const [note, setNote] = useState("");
  return (
    <Popover
      label="Footnote"
      trigger={(t) => (
        <TbButton {...t} disabled={disabled} active={!!current} icon={<Superscript aria-hidden className="size-4" />} aria-label="Footnote" title="Footnote: a numbered note at the foot of the page">
          <TbLabel>Footnote</TbLabel>
        </TbButton>
      )}
    >
      {(close) => (
        <form
          className="w-80 space-y-2 p-1"
          data-ds-text-keep=""
          onSubmit={(e) => {
            e.preventDefault();
            const n = note.trim().slice(0, MAX_FOOTNOTE_CHARS);
            if (!n) return;
            if (editor) {
              selectWord(editor);
              editor.chain().focus().setMark("footnote", { note: n }).run();
            } else onAll(n);
            setNote("");
            close();
          }}
        >
          <TextField label="Footnote text" help="For factor sources and methodology notes. Numbered at the foot of the page." value={note || current || ""} onChange={setNote} maxLength={MAX_FOOTNOTE_CHARS} autoFocus />
          <div className="flex justify-between gap-2">
            {current || (!editor && note === "") ? (
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => {
                  if (editor) editor.chain().focus().extendMarkRange("footnote").unsetMark("footnote").run();
                  else onAll(null);
                  close();
                }}
              >
                Remove footnote
              </Button>
            ) : (
              <span />
            )}
            <Button size="sm" type="submit">
              {current ? "Update" : "Add footnote"}
            </Button>
          </div>
        </form>
      )}
    </Popover>
  );
}

function LinkButton({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  const current = editor?.getAttributes("link").href as string | undefined;
  const [href, setHref] = useState("");
  const ok = /^(https?:\/\/|mailto:)\S+$/i.test(href.trim());
  return (
    <Popover
      label="Link"
      trigger={(t) => <TbButton {...t} disabled={disabled || !editor} active={!!current} aria-label="Link" title={editor ? "Link" : "Edit the text to add a link"} icon={<Link2 aria-hidden className="size-4" />} />}
    >
      {(close) => (
        <form
          className="w-80 space-y-2 p-1"
          data-ds-text-keep=""
          onSubmit={(e) => {
            e.preventDefault();
            if (!editor || !ok) return;
            selectWord(editor);
            editor.chain().focus().setLink({ href: href.trim() }).run();
            close();
          }}
        >
          <TextField label="Link address" placeholder="https://" value={href || current || ""} onChange={setHref} autoFocus error={href && !ok ? "Use a web address (https://…) or mailto:" : undefined} />
          <div className="flex justify-between gap-2">
            {current ? (
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => {
                  editor?.chain().focus().extendMarkRange("link").unsetLink().run();
                  close();
                }}
              >
                Remove link
              </Button>
            ) : (
              <span />
            )}
            <Button size="sm" type="submit" disabled={!ok}>
              Apply
            </Button>
          </div>
        </form>
      )}
    </Popover>
  );
}

/** "Insert data value": at the cursor while editing, else as a new body text box. */
export function InsertDataButton({ props, editor, label = "Insert data value" }: { props: ToolbarProps; editor: Editor | null; label?: string }) {
  const ed = props.editor;
  const scope = scopeOf(ed.doc);
  return (
    <Popover
      label={label}
      trigger={(t) => (
        <TbButton {...t} title={label} disabled={ed.readOnly} icon={<Database aria-hidden className="size-4" />}>
          <TbLabel>{label}</TbLabel>
        </TbButton>
      )}
    >
      {(close) => (
        <div className="w-80 p-1" data-ds-text-keep="">
          <ChipDataProvider scope={scope} data={ed.render.data}>
            <DataPicker
              scope={scope}
              onPick={(item) => {
                if (editor) insertChip(editor, item);
                close();
              }}
            />
          </ChipDataProvider>
        </div>
      )}
    </Popover>
  );
}

export function TextToolbar(props: ToolbarProps) {
  const { doc, pageId, elements, editor: ed } = props;
  const el = elements[0];
  const target = useEditingTarget();
  const live = useActiveTextEditor();
  const editing = !!el && !!target && target.elementId === el.id && target.pageId === pageId ? live : null;
  const marks = useEditorState({
    editor: editing,
    selector: (s) => (s.editor ? { bold: s.editor.isActive("bold"), italic: s.editor.isActive("italic"), highlight: s.editor.isActive("highlight"), bullet: s.editor.isActive("bulletList"), ordered: s.editor.isActive("orderedList") } : null),
  });
  if (!isTextElement(el)) return null;
  const locked = !!el.locked || !!el.templateLocked || ed.readOnly;
  const ids = elements.filter((e) => e.type === el.type).map((e) => e.id);
  const setDocAll = (fn: (d: TextDoc) => TextDoc, label: string) =>
    ed.commit(
      ids.reduce((d, id) => {
        const e = freeformPage(d, pageId)?.elements.find((x: Element) => x.id === id);
        return isTextElement(e) ? updateProps(d, pageId, [id], e.type, { doc: fn(e.props.doc) } as never) : d;
      }, ed.doc),
      label,
    );
  const toggle = (type: "bold" | "italic" | "highlight") => {
    if (editing) {
      editing.chain().focus().toggleMark(type).run();
      return;
    }
    const on = !hasMarkAll(el.props.doc, type);
    setDocAll((d) => markAll(d, { type } as TextMark, on), on ? `Add ${type}` : `Remove ${type}`);
  };
  const active = (type: "bold" | "italic" | "highlight") => (marks ? marks[type] : hasMarkAll(el.props.doc, type));
  const aiUnreviewed = el.source === "ai" && el.reviewed !== true;

  return (
    <>
      {el.type === "text" && (
        <Select
          label="Text style"
          hideLabel
          className="w-36 flex-none"
          value={el.props.style}
          disabled={locked}
          onChange={(v) => v && ed.commit(updateProps(ed.doc, pageId, ids, "text", { style: v }), "Text style")}
          options={TEXT_STYLE_IDS.map((s) => ({ value: s, label: TEXT_STYLE_LABELS[s] }))}
        />
      )}
      {el.type === "text" &&
        ALIGNS.map((a) => (
          <TbButton key={a.v} aria-label={a.label} title={a.label} active={el.props.align === a.v} disabled={locked} onClick={() => ed.commit(updateProps(ed.doc, pageId, ids, "text", { align: a.v }), a.label)} icon={<a.icon aria-hidden className="size-4" />} />
        ))}
      <ColourButton label="Text colour" value={el.props.color} swatches={themeSwatches(doc)} allowNone onChange={(c) => ed.commit(updateProps(ed.doc, pageId, ids, el.type, { color: c } as never), "Text colour")} />
      <Sep />
      <TbButton aria-label="Bold" title="Bold (⌘B)" active={active("bold")} disabled={locked} onMouseDown={(e) => e.preventDefault()} onClick={() => toggle("bold")} icon={<Bold aria-hidden className="size-4" />} />
      <TbButton aria-label="Italic" title="Italic (⌘I)" active={active("italic")} disabled={locked} onMouseDown={(e) => e.preventDefault()} onClick={() => toggle("italic")} icon={<Italic aria-hidden className="size-4" />} />
      <TbButton aria-label="Highlight" title="Highlight" active={active("highlight")} disabled={locked} onMouseDown={(e) => e.preventDefault()} onClick={() => toggle("highlight")} icon={<Highlighter aria-hidden className="size-4" />} />
      <LinkButton editor={editing} disabled={locked} />
      {editing && (
        <>
          <TbButton aria-label="Bulleted list" active={!!marks?.bullet} onMouseDown={(e) => e.preventDefault()} onClick={() => editing.chain().focus().toggleBulletList().run()} icon={<List aria-hidden className="size-4" />} />
          <TbButton aria-label="Numbered list" active={!!marks?.ordered} onMouseDown={(e) => e.preventDefault()} onClick={() => editing.chain().focus().toggleOrderedList().run()} icon={<ListOrdered aria-hidden className="size-4" />} />
        </>
      )}
      <FootnoteButton editor={editing} disabled={locked} onAll={(note) => setDocAll((d) => markAll(d, { type: "footnote", attrs: { note: note ?? "" } }, !!note), note ? "Add footnote" : "Remove footnote")} />
      <Sep />
      {editing ? (
        <InsertDataButton props={props} editor={editing} />
      ) : (
        <TbButton icon={<PencilLine aria-hidden className="size-4" />} disabled={locked} onClick={() => startEditing({ pageId, elementId: el.id })}>
          Edit text
        </TbButton>
      )}
      {textToolbarItems().map(([id, Slot]) => (
        <Slot key={id} {...props} textEditor={editing} />
      ))}
      {aiUnreviewed && (
        <TbButton className={cn("text-warn")} icon={<BadgeCheck aria-hidden className="size-4" />} disabled={ed.readOnly} onClick={() => ed.commit(markReviewed(ed.doc, pageId, ids), "Mark as reviewed")} title="Written by AI and not reviewed yet">
          Mark as reviewed
        </TbButton>
      )}
    </>
  );
}
