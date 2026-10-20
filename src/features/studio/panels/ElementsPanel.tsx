import { useMemo, useState, type DragEvent } from "react";
import { Shapes } from "lucide-react";
import { ELEMENT_GROUPS, type ElementGroup, type ElementTemplate, type FreeformPage, type ReportDoc } from "../../../lib/studio/contracts";
import { ELEMENT_DRAG_TYPE, elementDragData, insertElement } from "../../../lib/studio/libraryOps";
import { Button, EmptyState, Loading, Skeleton, TextField, cn, focusRing } from "../../../ui";
import { libraryErrorMessage, useElements } from "./library/api";
import { elementPreview, useRenderBrand } from "./library/preview";
import { SheetThumb } from "./library/SheetThumb";
import type { StudioPanelProps } from "./types";

const GROUP_LABELS: Record<ElementGroup, string> = {
  shapes: "Shapes",
  lines: "Lines and arrows",
  frames: "Frames",
  grids: "Grids",
  icons: "Icons",
  sdg: "SDG",
  esg: "ESG graphics",
  data: "Data elements",
};
/** Items per group in the overview; "See all" opens the group. */
const PREVIEW_COUNT = 6;
/** Items per page inside a group or a search; "Show more" adds this many. */
const PAGE_SIZE = 48;
const TILE = 72;

function ElementTile({ el, doc, onAdd, disabled }: { el: ElementTemplate; doc: ReportDoc; onAdd: (el: ElementTemplate) => void; disabled: boolean }) {
  const brand = useRenderBrand();
  const preview = useMemo(() => elementPreview(doc, el.payload), [doc, el.payload]);
  const onDragStart = (e: DragEvent<HTMLButtonElement>) => {
    e.dataTransfer.setData(ELEMENT_DRAG_TYPE, elementDragData({ payload: el.payload }));
    e.dataTransfer.setData("text/plain", el.name);
    e.dataTransfer.effectAllowed = "copy";
  };
  return (
    <button
      type="button"
      draggable={!disabled}
      onDragStart={onDragStart}
      onClick={() => onAdd(el)}
      disabled={disabled}
      title={el.name}
      aria-label={`Add ${el.name}`}
      data-testid={`element-${el.id}`}
      className={cn("flex h-[84px] w-full items-center justify-center overflow-hidden rounded-control border border-line bg-panel p-1.5 hover:border-brand disabled:cursor-not-allowed disabled:opacity-60", focusRing)}
    >
      <SheetThumb doc={preview.doc} page={preview.page} crop={preview.crop} width={TILE} maxHeight={TILE} brand={brand} label={el.name} />
    </button>
  );
}

/**
 * DS-4 · the Elements drawer (05-ux rail tab "Elements"): search (name and
 * tags) and groups: shapes, lines and arrows, frames, grids, icons, SDG, ESG
 * graphics and data elements. Click adds the element at the centre of the
 * page in view; drag drops it at a point (the canvas, DS-6, reads
 * `ELEMENT_DRAG_TYPE`). Previews are drawn by the renderer in this doc's look
 * and brand. DS-6 mounts it with `registerDrawer('elements', ElementsPanel)`.
 */
export function ElementsPanel({ doc, pageId, commit, onInserted }: Pick<StudioPanelProps, "doc" | "pageId" | "commit"> & { onInserted?: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<ElementGroup | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const query = q.trim();
  const list = useElements({ group: group ?? undefined, q: query || undefined });
  const page = doc.pages.find((p): p is FreeformPage => p.id === pageId && p.kind === "freeform");

  const add = (el: ElementTemplate) => {
    if (!page) return;
    const r = insertElement(doc, page.id, el.payload);
    commit(r.doc, `Add ${el.name}`);
    onInserted?.(r.ids);
  };
  const pick = (g: ElementGroup | null) => {
    setGroup(g);
    setLimit(PAGE_SIZE);
  };

  const byGroup = useMemo(() => {
    const m = new Map<ElementGroup, ElementTemplate[]>();
    for (const e of list.data ?? []) m.set(e.group, [...(m.get(e.group) ?? []), e]);
    return m;
  }, [list.data]);
  const overview = !group && !query;

  const grid = (items: ElementTemplate[]) => (
    <ul className="grid grid-cols-3 gap-2">
      {items.map((el) => (
        <li key={el.id}>
          <ElementTile el={el} doc={doc} onAdd={add} disabled={!page} />
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-label="Elements" className="flex h-full min-h-0 flex-col gap-3" data-testid="studio-elements-panel">
      <TextField label="Search elements" hideLabel placeholder="Search shapes, icons, SDGs…" value={q} onChange={(v) => (setQ(v), setLimit(PAGE_SIZE))} type="search" />
      <div role="group" aria-label="Element groups" className="flex flex-wrap gap-1.5">
        {[null, ...ELEMENT_GROUPS].map((g) => (
          <button
            key={g ?? "all"}
            type="button"
            aria-pressed={group === g}
            onClick={() => pick(g)}
            className={cn("rounded-full border px-2.5 py-1 text-xs", group === g ? "border-brand bg-tint text-brand-text" : "border-line text-muted hover:text-ink", focusRing)}
          >
            {g ? GROUP_LABELS[g] : "All"}
          </button>
        ))}
      </div>
      {!page && <p className="text-xs text-muted">Go to a free-form page to add elements. Flow sections lay themselves out.</p>}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {list.isError ? (
          <EmptyState variant="error" compact title="Elements couldn't be loaded." description={libraryErrorMessage(list.error)} action={<Button size="sm" onClick={() => void list.refetch()}>Try again</Button>} />
        ) : list.isPending ? (
          <Loading label="Loading elements" className="grid grid-cols-3 gap-2">
            {Array.from({ length: 9 }, (_, i) => (
              <Skeleton key={i} className="h-[84px]" />
            ))}
          </Loading>
        ) : !list.data.length ? (
          <EmptyState compact icon={Shapes} title="No elements match." description="Try another word, such as arrow, leaf, truck or scope." />
        ) : overview ? (
          ELEMENT_GROUPS.filter((g) => byGroup.has(g)).map((g) => {
            const items = byGroup.get(g) ?? [];
            return (
              <section key={g} aria-label={GROUP_LABELS[g]} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{GROUP_LABELS[g]}</h3>
                  {items.length > PREVIEW_COUNT && (
                    <button type="button" onClick={() => pick(g)} className={cn("text-xs text-brand-text hover:underline", focusRing)}>
                      See all {items.length}
                    </button>
                  )}
                </div>
                {grid(items.slice(0, PREVIEW_COUNT))}
              </section>
            );
          })
        ) : (
          <>
            {grid(list.data.slice(0, limit))}
            {list.data.length > limit && (
              <Button size="sm" variant="ghost" className="w-full" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                Show more ({list.data.length - limit})
              </Button>
            )}
          </>
        )}
      </div>
      <p className="text-xs text-muted">Click to add to the middle of the page, or drag onto the page.</p>
    </section>
  );
}
