// DS-7 · the Text drawer (05-ux rail tab "Text", mockup Editor):
//   "Add a heading", "Add a subheading", "Add body text" (added at the page
//   centre, ready to type over);
//   text presets drawn by the renderer in this report's theme (kicker + title,
//   big number + caption, quote + attribution, section opener);
//   "Insert data value": into the text being edited, else as a new text box;
//   on a flow page: the section's settings and text (FlowPanel).
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Database, Type } from "lucide-react";
import type { DataItem, ElementGroupPayload, FreeformPage, ReportDoc } from "../../../lib/studio/contracts";
import { insertElement as insertLibraryElement } from "../../../lib/studio/libraryOps";
import { renderSheet, tokenKey, type RenderBrand, type RenderData, type RenderDoc, type RenderFreeformPage } from "../../../lib/studio/render";
import { mmToPx } from "../../../lib/studio/geometry";
import { Button, EmptyState, cn, focusRing } from "../../../ui";
import type { DrawerProps } from "../editor/registry";
import { scopeOf } from "../editor/renderInputs";
import { ChipDataProvider } from "../editor/text/ChipDataProvider";
import { DataPicker } from "../editor/text/DataPicker";
import { chipFor, pickerItems } from "../editor/text/picker";
import { startEditing, useActiveTextEditor } from "../editor/text/editing";
import { FlowPanel } from "../editor/text/FlowPanel";
import { flowSection } from "../editor/text/ops";
import { ADD_TEXT, presetFigure, textPresets, type TextPreset } from "../editor/text/presets";
import { insertChip } from "../editor/text/useStudioText";
import { useDataCatalog } from "./data/api";
import { primeChip, chipName } from "../editor/text/chipData";

const ADD_LOOK: Record<string, string> = { heading: "text-xl font-semibold", subheading: "text-base font-semibold", body: "text-sm" };

/** A preset drawn by the renderer at thumbnail size, in the report's theme. */
function PresetPreview({ preset, doc, brand, figure }: { preset: TextPreset; doc: ReportDoc; brand: RenderBrand | null; figure: DataItem | null }) {
  const host = useRef<HTMLDivElement>(null);
  const width = 132;
  const k = width / mmToPx(preset.payload.w);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const page = { id: `preview-${preset.id}`, kind: "freeform", name: preset.name, background: {}, elements: preset.payload.elements.map((e) => ({ ...e, id: `${preset.id}-${e.id}` })) } as unknown as RenderFreeformPage;
    const data: RenderData = { values: {}, tokens: figure ? { [tokenKey(chipFor(figure) as never)]: { ...figure.resolved, source: figure.binding.source } as never } : {} };
    const r = renderSheet(page, doc as unknown as RenderDoc, data, { mode: "sheet" }, brand);
    const root = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    // Trusted: the renderer escapes every text and attribute it emits.
    root.innerHTML = `<style>:host{display:block;}.ds-sheet{background:transparent!important;}</style><style>${r.css}</style>${r.html}`;
  }, [preset, doc.design.theme, doc.format, brand, figure, doc]);
  return (
    <div aria-hidden className="pointer-events-none overflow-hidden" style={{ width, height: mmToPx(preset.payload.h) * k }}>
      <div ref={host} style={{ transform: `scale(${k})`, transformOrigin: "0 0", width: `${preset.payload.w}mm` }} />
    </div>
  );
}

export function TextPanel({ editor: ed }: DrawerProps) {
  const page: FreeformPage | undefined = ed.page;
  const flow = flowSection(ed.doc, ed.ui.pageId);
  const scope = useMemo(() => scopeOf(ed.doc), [ed.doc]);
  const catalog = useDataCatalog(scope);
  const figure = useMemo(() => presetFigure(pickerItems(catalog.data?.groups ?? [], "").map((p) => p.item)), [catalog.data]);
  const presets = useMemo(() => textPresets(figure), [figure]);
  const live = useActiveTextEditor();
  const [picking, setPicking] = useState(false);
  const disabled = ed.readOnly || !page;

  const addText = (id: (typeof ADD_TEXT)[number]["id"]) => {
    const t = ADD_TEXT.find((a) => a.id === id);
    if (!t || !page) return;
    const newId = ed.insertElement(t.element, { label: t.label });
    if (newId) startEditing({ pageId: page.id, elementId: newId, selectAll: true });
  };
  const addPreset = (p: TextPreset) => {
    if (!page) return;
    if (figure) primeChip(chipFor(figure), { ...figure.resolved, source: figure.binding.source }, chipName(chipFor(figure), figure.label));
    const r = insertLibraryElement(ed.doc, page.id, p.payload as ElementGroupPayload, { newId: ed.newId });
    if (r.ids.length) ed.commit(r.doc, `Add ${p.name.toLowerCase()}`, { select: r.ids, pageId: page.id });
  };
  const insertData = (item: DataItem) => {
    setPicking(false);
    if (live) return insertChip(live, item);
    if (!page) return;
    const attrs = chipFor(item);
    primeChip(attrs, { ...item.resolved, source: item.binding.source }, chipName(attrs, item.label));
    ed.insertElement({ id: "data-text", type: "text", frame: { x: 0, y: 0, w: 60, h: 12, rotation: 0 }, z: 0, source: "user", props: { style: "body", align: "left", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "data", attrs }] }] } } }, { label: `Add ${item.label}` });
  };

  return (
    <div className="space-y-5" data-testid="text-panel" data-ds-text-keep="">
      {flow && <FlowPanel section={flow} editor={ed} />}
      {!page && !flow && <EmptyState compact icon={Type} title="Pick a page to add text to it." />}
      {page && (
        <>
          <section aria-label="Add text" className="space-y-2">
            {ADD_TEXT.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={disabled}
                onClick={() => addText(t.id)}
                className={cn("block w-full rounded-control border border-line bg-panel px-3 py-2 text-left text-ink hover:bg-tint disabled:opacity-50", ADD_LOOK[t.id], focusRing)}
              >
                {t.label}
              </button>
            ))}
          </section>

          <section aria-label="Insert data value" className="space-y-2">
            <Button size="sm" variant="secondary" className="w-full" disabled={ed.readOnly} icon={<Database aria-hidden className="size-4" />} onClick={() => setPicking((p) => !p)} aria-expanded={picking}>
              Insert data value
            </Button>
            <p className="text-xs text-muted">{live ? "Goes in at the cursor of the text you're editing." : "Adds a text box with a live value. In any text, type {{ to insert one."}</p>
            {picking && (
              <ChipDataProvider scope={scope} data={ed.render.data}>
                <DataPicker scope={scope} onPick={insertData} className="rounded-control border border-line p-2" />
              </ChipDataProvider>
            )}
          </section>

          <section aria-label="Text presets" className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Text presets</h3>
            <ul className="grid grid-cols-2 gap-2">
              {presets.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => addPreset(p)}
                    className={cn("flex h-full w-full flex-col items-start gap-1.5 rounded-control border border-line bg-panel p-2 text-left hover:border-brand disabled:opacity-50", focusRing)}
                    style={{ background: page.background.color }}
                    aria-label={`Add ${p.name.toLowerCase()}`}
                    data-testid={`preset-${p.id}`}
                  >
                    <PresetPreview preset={p} doc={ed.doc} brand={ed.render.brand} figure={figure} />
                    <span className="rounded-chip bg-panel/90 px-1 text-[11px] text-muted">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">Presets take this report's fonts and colours.</p>
          </section>
        </>
      )}
    </div>
  );
}
