// DS-7 · a flow section's settings and text, in the Text drawer when a flow
// page is selected (RS-7 §5, DS-7 §4). Flow sections paginate when printed:
// long GHG tables continue on the next page with their header repeated.
//   every type      name, start on a right-hand page
//   text types      columns (1 or 2)
//   scope3_categories   which categories, show data quality, show method
//   data_tables     years, group by, show evidence (sustainability)
//   all             the section's text (intro or narrative), with data chips,
//                   footnotes (numbered per section) and the {{ picker
import { useEffect, useMemo, useRef } from "react";
import { EditorContent } from "@tiptap/react";
import type { FlowSection } from "../../../../lib/studio/contracts";
import { renamePage } from "../../../../lib/studio/docOps";
import { GHG_CATEGORIES } from "../../../../lib/scope3/contracts";
import { Badge, Callout, SegmentedControl, Select, TextField, Toggle, cn, focusRing } from "../../../../ui";
import type { EditorApi } from "../EditorContext";
import { scopeOf } from "../renderInputs";
import { ChipDataProvider } from "./ChipDataProvider";
import { FLOW_TYPE_LABELS, TABLE_TYPES, TEXT_TYPES } from "./flowLabels";
import { fromTiptap, sameText, type PmJson } from "./convert";
import { setFlowContent, setFlowOptions, shownCategories, toggleCategory } from "./ops";
import { TriggerPicker } from "./TriggerPicker";
import { useStudioText } from "./useStudioText";

export function FlowPanel({ section, editor: ed }: { section: FlowSection; editor: EditorApi }) {
  const ro = ed.readOnly;
  const set = (patch: Partial<FlowSection["options"]>, label: string, mergeKey?: string) => ed.commit(setFlowOptions(ed.doc, section.id, patch), label, mergeKey ? { mergeKey } : undefined);
  const o = section.options;
  const shown = shownCategories(section);
  return (
    <section aria-label="Flow section" className="space-y-4" data-testid="flow-panel" data-ds-text-keep="">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">Flow section</h3>
          <Badge tone="info">{FLOW_TYPE_LABELS[section.flowType] ?? section.flowType}</Badge>
        </div>
        <p className="text-xs text-muted">{TABLE_TYPES.has(section.flowType) ? "Flows over as many pages as it needs. Long tables continue on the next page with their header repeated." : "Flows over as many pages as it needs when printed."}</p>
      </header>
      <NameField key={section.id} section={section} editor={ed} />
      {TEXT_TYPES.has(section.flowType) && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-ink">Columns</span>
          <SegmentedControl
            label="Columns"
            value={String(o.columns ?? 1)}
            onChange={(v) => !ro && set({ columns: v === "2" ? 2 : undefined }, "Columns")}
            options={[
              { value: "1", label: "One" },
              { value: "2", label: "Two" },
            ]}
          />
        </div>
      )}
      {section.flowType === "scope3_categories" && (
        <fieldset className="space-y-2" disabled={ro}>
          <legend className="text-xs font-medium text-ink">Categories shown</legend>
          <p className="text-xs text-muted">{shown.length === 15 ? "All 15 categories, reported or excluded with the reason." : `${shown.length} of 15 categories.`}</p>
          <ul className="grid grid-cols-1 gap-1">
            {GHG_CATEGORIES.map((c) => (
              <li key={c.n}>
                <label className={cn("flex cursor-pointer items-center gap-2 rounded-control px-1 py-0.5 text-xs text-ink hover:bg-tint", focusRing)}>
                  <input type="checkbox" checked={shown.includes(c.n)} onChange={() => set({ categories: toggleCategory(section, c.n) }, "Scope 3 categories")} className="size-3.5 accent-brand" />
                  Category {c.n} · {c.name}
                </label>
              </li>
            ))}
          </ul>
          <Toggle label="Show data quality" checked={o.showDq !== false} onChange={(v) => set({ showDq: v ? undefined : false }, "Show data quality")} />
          <Toggle label="Show method" checked={o.showMethod !== false} onChange={(v) => set({ showMethod: v ? undefined : false }, "Show method")} />
        </fieldset>
      )}
      {section.flowType === "data_tables" && (
        <div className="space-y-3">
          <Select label="Years" value={String(o.years?.last ?? 3)} disabled={ro} onChange={(v) => v && set({ years: { last: Number(v) } }, "Years")} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: n === 1 ? "This year" : `Last ${n} years` }))} />
          <Select label="Group by" value={o.groupBy ?? "topic"} disabled={ro} onChange={(v) => v && set({ groupBy: v as "pillar" | "topic" }, "Group by")} options={[{ value: "topic", label: "Topic" }, { value: "pillar", label: "Pillar (E, S, G)" }]} />
          <Toggle label="Show evidence" checked={!!o.showEvidence} onChange={(v) => set({ showEvidence: v || undefined }, "Show evidence")} disabled={ro} />
        </div>
      )}
      <Toggle label="Start on a right-hand page" checked={!!o.startOnRight} onChange={(v) => set({ startOnRight: v || undefined }, "Start on a right-hand page")} disabled={ro} />
      {section.flowType !== "toc" && <SectionText key={section.id} section={section} editor={ed} />}
    </section>
  );
}

function NameField({ section, editor: ed }: { section: FlowSection; editor: EditorApi }) {
  return (
    <TextField
      label="Section name"
      value={section.name}
      disabled={ed.readOnly}
      onChange={(v) => v.trim() && ed.commit(renamePage(ed.doc, section.id, v), "Rename section", { mergeKey: `flow-name:${section.id}` })}
    />
  );
}

function SectionText({ section, editor: ed }: { section: FlowSection; editor: EditorApi }) {
  const scope = useMemo(() => scopeOf(ed.doc), [ed.doc]);
  return (
    <ChipDataProvider scope={scope} data={ed.render.data}>
      <SectionTextBody section={section} editor={ed} scope={scope} />
    </ChipDataProvider>
  );
}

function SectionTextBody({ section, editor: ed, scope }: { section: FlowSection; editor: EditorApi; scope: ReturnType<typeof scopeOf> }) {
  const edRef = useRef(ed);
  edRef.current = ed;
  const last = useRef(section.content);
  const timer = useRef<number | undefined>(undefined);
  const save = (json: PmJson) => {
    const next = fromTiptap(json);
    if (sameText(last.current, next)) return;
    last.current = next;
    const cur = edRef.current;
    const empty = next.content.length === 1 && next.content[0].type === "paragraph" && !next.content[0].content;
    cur.commit(setFlowContent(cur.doc, section.id, empty ? undefined : next), "Edit section text", { mergeKey: `flow-text:${section.id}` });
  };
  const { editor, trigger, keyRef } = useStudioText({
    initial: section.content,
    editable: !ed.readOnly,
    onUpdate: (e) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => save(e.getJSON() as PmJson), 400);
    },
  });
  // Undo / redo from outside: show the doc's text again.
  useEffect(() => {
    if (!editor || editor.isFocused || sameText(section.content, last.current)) return;
    last.current = section.content;
    editor.commands.setContent((section.content ?? { type: "doc", content: [{ type: "paragraph" }] }) as never, { emitUpdate: false });
  }, [editor, section.content]);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (editor && !editor.isDestroyed) save(editor.getJSON() as PmJson);
    },
    // Save once on unmount with the latest text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  );
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-ink">{TEXT_TYPES.has(section.flowType) ? "Section text" : "Introduction"}</span>
      <div
        className={cn(
          "min-h-40 rounded-control border border-line bg-panel px-3 py-2 text-sm text-ink focus-within:ring-2 focus-within:ring-brand/40",
          "[&_.ProseMirror]:min-h-36 [&_.ProseMirror]:outline-none [&_.ProseMirror_p]:mb-2 [&_.ProseMirror_h2]:mb-1 [&_.ProseMirror_h2]:text-base [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ds-fn-mark]:underline [&_.ds-fn-mark]:decoration-dotted [&_.ds-fn-ref]:text-[0.7em] [&_mark]:bg-accent-100",
        )}
        data-testid="flow-text"
      >
        <EditorContent editor={editor} />
      </div>
      <p className="text-xs text-muted">Type {"{{"} to insert a data value. Footnotes number per section.</p>
      <TriggerPicker editor={editor} trigger={trigger} keyRef={keyRef} scope={scope} />
      {ed.readOnly && <Callout tone="info">This design is view-only here.</Callout>}
    </div>
  );
}
