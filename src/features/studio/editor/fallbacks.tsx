// DS-6 · the shell's own drawers, registered as fallbacks until the owning
// module registers the real one:
//   elements  basic shapes, lines, frames and a photo grid, plus whatever
//             GET /studio/elements returns (DS-4 ElementsPanel replaces it);
//   uploads   the company's images: click fills the selected frame or adds an
//             image, drag drops onto a frame (DS-4 UploadsPanel replaces it);
//   templates, text, charts, ai   a short "arrives with …" note.
// Click adds at the page centre; drag drops at the pointer (dnd.ts).
import { useQuery } from "@tanstack/react-query";
import { LayoutTemplate, Sparkles, BarChart3, Type } from "lucide-react";
import api from "../../../api/axios";
import type { Element, ElementTemplate } from "../../../lib/studio/contracts";
import { fillFrame, takesImage } from "../../../lib/studio/docOps";
import { useStudioCompanyId } from "../../../lib/studio/switch";
import { EmptyState, SkeletonText, cn, focusRing } from "../../../ui";
import { useStudioAssets } from "./api";
import { BASIC_ELEMENTS, bigNumberFor } from "./basicElements";
import { DND_ASSET, DND_ELEMENT, imageFromAsset } from "./dnd";
import { DataPanel } from "../panels/DataPanel";
import { scopeOf } from "./renderInputs";
import type { DrawerProps } from "./registry";

const GROUP_LABEL: Record<string, string> = { shapes: "Shapes", lines: "Lines and arrows", frames: "Frames", grids: "Grids", icons: "Icons", sdg: "SDG", esg: "ESG graphics", data: "Data elements" };

function useElementTemplates() {
  const companyId = useStudioCompanyId();
  return useQuery({
    queryKey: ["studio", "elements", companyId],
    queryFn: async () => {
      const { data } = await api.get<ElementTemplate[]>("/studio/elements", { params: companyId ? { company_id: companyId } : undefined });
      return Array.isArray(data) ? data : [];
    },
    staleTime: 300_000,
  });
}

function Tile({ name, payload, onAdd, disabled }: { name: string; payload: Element; onAdd: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      draggable={!disabled}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData(DND_ELEMENT, JSON.stringify(payload));
      }}
      onClick={onAdd}
      className={cn("flex h-16 flex-col items-center justify-center gap-1 rounded-control border border-line bg-panel px-1 text-center text-xs text-ink hover:bg-tint disabled:opacity-50", focusRing)}
    >
      <span className="line-clamp-2">{name}</span>
    </button>
  );
}

export function BasicElementsPanel({ editor: ed }: DrawerProps) {
  const lib = useElementTemplates();
  const disabled = ed.readOnly || !ed.page;
  const groups = new Map<string, { name: string; payload: Element }[]>();
  for (const b of BASIC_ELEMENTS) groups.set(b.group, [...(groups.get(b.group) ?? []), b]);
  for (const t of lib.data ?? []) {
    const g = GROUP_LABEL[t.group] ?? t.group;
    groups.set(g, [...(groups.get(g) ?? []), { name: t.name, payload: t.payload }]);
  }
  return (
    <div className="space-y-4" data-testid="elements-panel">
      {!ed.page && <p className="text-sm text-muted">Pick a free-form page to add elements to it.</p>}
      {[...groups].map(([g, items]) => (
        <section key={g} aria-label={g} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{g}</h3>
          <div className="grid grid-cols-3 gap-2">
            {items.map((it, i) => (
              <Tile key={`${it.name}-${i}`} name={it.name} payload={it.payload} disabled={disabled} onAdd={() => ed.insertElement(it.payload, { label: `Add ${it.name.toLowerCase()}` })} />
            ))}
          </div>
        </section>
      ))}
      {lib.isPending && <SkeletonText lines={3} />}
      {lib.isError && <p className="text-xs text-muted">More elements arrive with the element library.</p>}
    </div>
  );
}

export function BasicUploadsPanel({ editor: ed }: DrawerProps) {
  const assets = useStudioAssets();
  const target = ed.selected.length === 1 && takesImage(ed.selected[0]) ? ed.selected[0] : null;
  if (assets.isPending) return <SkeletonText lines={4} />;
  if (assets.isError) return <EmptyState variant="error" compact title="Your images couldn't be loaded." description="Try again in a moment." />;
  const images = (assets.data ?? []).filter((a) => a.kind !== "logo");
  if (!images.length) return <EmptyState compact title="No images yet." description="Uploading arrives with the asset library." />;
  return (
    <div className="space-y-3" data-testid="uploads-panel">
      <p className="text-xs text-muted">{target ? "Click an image to put it in the selected frame, or drag it onto any frame." : "Click to add an image, or drag it onto a frame on the page."}</p>
      <ul className="grid grid-cols-2 gap-2">
        {images.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              disabled={ed.readOnly || !ed.page}
              draggable={!ed.readOnly}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData(DND_ASSET, JSON.stringify({ id: a.id, w: a.w, h: a.h, alt: a.alt }));
              }}
              onClick={() => {
                if (target && ed.page) ed.commit(fillFrame(ed.doc, ed.page.id, target.id, a), "Add image to frame");
                else ed.insertElement(imageFromAsset(a), { label: "Add image" });
              }}
              aria-label={`Image: ${a.alt || a.id}`}
              className={cn("flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-control border border-line bg-tint", focusRing)}
            >
              <img src={a.url} alt="" className="size-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SOON: Record<"templates" | "text" | "charts" | "ai", { icon: typeof Type; title: string; body: string }> = {
  templates: { icon: LayoutTemplate, title: "Templates arrive with the template library.", body: "Use the + under a page to add a page from a layout." },
  text: { icon: Type, title: "Text presets arrive with text editing.", body: "Headings, body text and data values will be added from here." },
  charts: { icon: BarChart3, title: "Charts arrive with chart editing.", body: "Add numbers from the Data panel meanwhile." },
  ai: { icon: Sparkles, title: "The AI panel arrives soon.", body: "It will suggest text and layouts; nothing changes without your Accept." },
};

function ComingSoon({ id }: { id: keyof typeof SOON }) {
  const s = SOON[id];
  return <EmptyState compact icon={s.icon} title={s.title} description={s.body} />;
}
export const TemplatesSoon = () => <ComingSoon id="templates" />;
export const TextSoon = () => <ComingSoon id="text" />;
export const ChartsSoon = () => <ComingSoon id="charts" />;
export const AiSoon = () => <ComingSoon id="ai" />;

/** DS-2's Data panel in the drawer: rows insert a big number on the page in view. */
export function DataDrawer({ docId, editor }: DrawerProps) {
  return <DataPanel scope={scopeOf(editor.doc)} docId={docId} onInsert={(b, item) => editor.insertElement(bigNumberFor(b, item.label), { label: `Add ${item.label}` })} />;
}
