// DS-6 · the shell's own contextual toolbars (05-ux), registered as
// fallbacks so DS-7 (text) and DS-8 (charts, tables) replace theirs:
//   page   nothing selected: page Background, Layout ▾, Reset to layout;
//   image, frame, grid   Replace, Crop, corner radius or mask, Alt text;
//   shape, line, divider, icon, qr   Fill / colour, Border, Radius;
//   text, callout        alignment and colour (DS-7 adds fonts and the rest);
//   kpi_tile, big_number, progress, chart, table   Edit data (DS-8 adds more);
//   multi                group / ungroup.
import { useState, type ReactNode } from "react";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Crop, Database, Group, ImagePlus, RotateCcw, Ungroup } from "lucide-react";
import type { Element, FrameMask } from "../../../lib/studio/contracts";
import { FRAME_MASKS } from "../../../lib/studio/contracts";
import { fillFrame, freeformPage, groupElements, resetToLayout, setBackground, ungroupElements, updateProps } from "../../../lib/studio/docOps";
import { Button, ColourField, Menu, NumberField, Popover, Select, TextField, cn, focusRing } from "../../../ui";
import { useStudioAssets, useStudioLayouts } from "./api";
import type { ToolbarProps } from "./registry";
import { themeSwatches } from "./actions";

export const Sep = () => <span aria-hidden className="mx-1 h-5 w-px bg-line" />;

/** A ghost toolbar button. */
/** A toolbar button label that hides (stays for screen readers) when the toolbar is compact (ContextToolbar). */
export const TbLabel = ({ children }: { children: ReactNode }) => <span className="in-data-[tb-compact=true]:sr-only">{children}</span>;

export function TbButton({ children, icon, active, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; active?: boolean }) {
  return (
    <button type="button" {...rest} aria-pressed={active} className={cn("inline-flex h-8 flex-none items-center gap-1.5 whitespace-nowrap rounded-control px-2.5 text-[13px] font-medium text-ink hover:bg-tint disabled:opacity-50", active && "bg-brand-50 text-brand-text", focusRing, rest.className)}>
      {icon}
      {children}
    </button>
  );
}

/** A colour button with swatches and a hex field. Colours here are report data, not app colours. */
export function ColourButton({ label, value, swatches, onChange, allowNone }: { label: string; value: string | undefined; swatches: string[]; onChange: (hex: string | undefined) => void; allowNone?: boolean }) {
  return (
    <Popover
      label={label}
      trigger={(t) => (
        <TbButton {...t} aria-label={label} title={label}>
          <span aria-hidden className="size-4 rounded-[3px] border border-line" style={{ background: value ?? "transparent" }} />
          <TbLabel>{label}</TbLabel>
        </TbButton>
      )}
    >
      {(close) => (
        <div className="w-60 space-y-3 p-1">
          {swatches.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Report colours">
              {swatches.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-label={`Use ${s}`}
                  aria-pressed={value?.toLowerCase() === s}
                  onClick={() => {
                    onChange(s);
                    close();
                  }}
                  className={cn("size-7 rounded-control border border-line", value?.toLowerCase() === s && "ring-2 ring-brand", focusRing)}
                  style={{ background: s }}
                />
              ))}
            </div>
          )}
          <ColourField label="Custom colour" value={value ?? ""} onChange={(v) => /^#[0-9a-f]{6}$/i.test(v) && onChange(v.toLowerCase())} />
          {allowNone && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange(undefined);
                close();
              }}
            >
              Use the theme colour
            </Button>
          )}
        </div>
      )}
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Nothing selected: the page
// ---------------------------------------------------------------------------

export function PageToolbar({ doc, pageId, editor }: ToolbarProps) {
  const page = freeformPage(doc, pageId);
  const layouts = useStudioLayouts(doc.kind, doc.format, !!page);
  if (!page) return <span className="px-2 text-sm text-muted">Flow section: its text and settings are edited in the Text panel.</span>;
  const current = layouts.data?.find((l) => String(l.id) === page.layoutId);
  return (
    <>
      <span className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Page</span>
      <ColourButton label="Background" value={page.background.color} swatches={themeSwatches(doc)} allowNone onChange={(hex) => editor.commit(setBackground(editor.doc, pageId, { ...page.background, color: hex }), "Page background")} />
      <Menu
        label="Layout"
        align="start"
        trigger={(t) => (
          <TbButton {...t} disabled={editor.readOnly}>
            Layout ▾
          </TbButton>
        )}
        items={
          layouts.data?.length
            ? layouts.data.map((l) => ({ label: l.name, checked: String(l.id) === page.layoutId, onSelect: () => editor.commit(resetToLayout(editor.doc, pageId, l.page, String(l.id)), `Layout: ${l.name}`) }))
            : [{ kind: "heading" as const, content: <span className="text-xs text-muted">{layouts.isPending ? "Loading layouts…" : "No layouts for this format yet."}</span> }]
        }
      />
      <TbButton icon={<RotateCcw aria-hidden className="size-4" />} disabled={!current || editor.readOnly} title={current ? `Back to "${current.name}"` : "This page isn't from a layout"} onClick={() => current && editor.commit(resetToLayout(editor.doc, pageId, current.page, String(current.id)), "Reset to layout")}>
        Reset to layout
      </TbButton>
    </>
  );
}

// ---------------------------------------------------------------------------
// Images, frames and grids
// ---------------------------------------------------------------------------

function AssetPicker({ onPick }: { onPick: (a: { id: string; w: number; h: number; alt: string }) => void }) {
  const assets = useStudioAssets();
  const images = (assets.data ?? []).filter((a) => a.kind !== "logo");
  if (assets.isPending) return <p className="p-2 text-xs text-muted">Loading your images…</p>;
  if (assets.isError) return <p className="p-2 text-xs text-bad">Your images couldn't be loaded.</p>;
  if (!images.length) return <p className="p-2 text-xs text-muted">No images yet. Add some in Uploads.</p>;
  return (
    <ul className="grid max-h-72 w-72 grid-cols-3 gap-2 overflow-auto p-1" aria-label="Your images">
      {images.map((a) => (
        <li key={a.id}>
          <button type="button" onClick={() => onPick(a)} className={cn("flex aspect-square w-full items-center justify-center overflow-hidden rounded-control border border-line bg-tint", focusRing)} aria-label={`Use ${a.alt || a.id}`}>
            <img src={a.url} alt="" className="size-full object-cover" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function MediaToolbar({ pageId, elements, editor }: ToolbarProps) {
  const el = elements[0];
  const [cell, setCell] = useState(0);
  if (!el || (el.type !== "image" && el.type !== "frame" && el.type !== "grid")) return null;
  const locked = !!el.locked || editor.readOnly;
  const hasPicture = el.type === "grid" ? !!el.props.cells[cell]?.assetId : !!el.props.assetId;
  const cropping = editor.ui.crop?.elementId === el.id;
  const alt = el.type === "grid" ? (el.props.cells[cell]?.alt ?? "") : el.props.alt;
  const setAlt = (v: string) => {
    if (el.type === "grid") editor.commit(updateProps(editor.doc, pageId, [el.id], "grid", { cells: el.props.cells.map((c, i) => (i === cell ? { ...c, alt: v } : c)) }), "Alt text", { mergeKey: `alt:${el.id}` });
    else if (el.type === "image") editor.commit(updateProps(editor.doc, pageId, [el.id], "image", { alt: v }), "Alt text", { mergeKey: `alt:${el.id}` });
    else editor.commit(updateProps(editor.doc, pageId, [el.id], "frame", { alt: v }), "Alt text", { mergeKey: `alt:${el.id}` });
  };
  return (
    <>
      {el.type === "grid" && (
        <Select label="Cell" hideLabel className="w-28" value={String(cell)} onChange={(v) => setCell(Number(v ?? 0))} options={el.props.cells.map((_, i) => ({ value: String(i), label: `Cell ${i + 1}` }))} />
      )}
      <Popover
        label="Replace picture"
        trigger={(t) => (
          <TbButton {...t} disabled={locked} icon={<ImagePlus aria-hidden className="size-4" />}>
            {hasPicture ? "Replace" : "Add picture"}
          </TbButton>
        )}
      >
        {(close) => (
          <AssetPicker
            onPick={(a) => {
              editor.commit(fillFrame(editor.doc, pageId, el.id, a, el.type === "grid" ? cell : undefined), hasPicture ? "Replace picture" : "Add picture");
              close();
            }}
          />
        )}
      </Popover>
      <TbButton icon={<Crop aria-hidden className="size-4" />} active={cropping} disabled={locked || !hasPicture} onClick={() => editor.startCrop(cropping ? null : { pageId, elementId: el.id, cell: el.type === "grid" ? cell : undefined })}>
        {cropping ? "Done" : "Crop"}
      </TbButton>
      <Sep />
      {el.type === "image" && (
        <NumberField label="Corner radius" hideLabel className="w-24" value={el.props.radius ?? 0} unit="mm" min={0} onChange={(v) => v !== null && editor.commit(updateProps(editor.doc, pageId, [el.id], "image", { radius: Math.max(0, v) }), "Corner radius", { mergeKey: `radius:${el.id}` })} disabled={locked} />
      )}
      {el.type === "frame" && (
        <Select label="Shape" hideLabel className="w-28" value={el.props.mask} disabled={locked} onChange={(v) => v && editor.commit(updateProps(editor.doc, pageId, [el.id], "frame", { mask: v as FrameMask }), "Frame shape")} options={FRAME_MASKS.map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) }))} />
      )}
      {el.type === "grid" && (
        <>
          <NumberField label="Columns" hideLabel className="w-24" value={el.props.columns} min={1} max={6} onChange={(v) => v && editor.commit(updateProps(editor.doc, pageId, [el.id], "grid", { columns: Math.max(1, Math.min(6, Math.round(v))) }), "Grid columns", { mergeKey: `cols:${el.id}` })} disabled={locked} />
          <NumberField label="Gap" hideLabel className="w-24" value={el.props.gap} unit="mm" min={0} onChange={(v) => v !== null && editor.commit(updateProps(editor.doc, pageId, [el.id], "grid", { gap: Math.max(0, v) }), "Grid gap", { mergeKey: `gap:${el.id}` })} disabled={locked} />
        </>
      )}
      <Popover
        label="Alt text"
        trigger={(t) => (
          <TbButton {...t} disabled={locked} className={cn(!alt && hasPicture && "text-warn")}>
            Alt text{!alt && hasPicture ? " · missing" : ""}
          </TbButton>
        )}
      >
        {() => (
          <div className="w-72 p-1">
            <TextField label="Describe the picture for screen readers" value={alt} onChange={setAlt} />
          </div>
        )}
      </Popover>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shapes, lines, dividers, icons, QR codes
// ---------------------------------------------------------------------------

export function ShapeToolbar({ doc, pageId, elements, editor }: ToolbarProps) {
  const el = elements[0];
  if (!el) return null;
  const locked = !!el.locked || editor.readOnly;
  const sw = themeSwatches(doc);
  const ids = elements.filter((e) => e.type === el.type).map((e) => e.id);
  const set = <T extends Element["type"]>(type: T, patch: Record<string, unknown>, label: string, key?: string) => editor.commit(updateProps(editor.doc, pageId, ids, type, patch as never), label, key ? { mergeKey: `${key}:${ids.join(",")}` } : undefined);
  if (locked) return <span className="px-2 text-sm text-muted">Locked. Unlock it to change its style.</span>;
  switch (el.type) {
    case "shape":
      return (
        <>
          <ColourButton label="Fill" value={el.props.fill} swatches={sw} allowNone onChange={(c) => set("shape", { fill: c }, "Fill")} />
          <ColourButton label="Border" value={el.props.stroke} swatches={sw} allowNone onChange={(c) => set("shape", { stroke: c, strokeWidth: el.props.strokeWidth ?? 0.5 }, "Border")} />
          <NumberField label="Border width" hideLabel className="w-24" value={el.props.strokeWidth ?? 0} unit="mm" min={0} onChange={(v) => v !== null && set("shape", { strokeWidth: Math.max(0, v) }, "Border width", "sw")} />
          {el.props.shape === "rect" && <NumberField label="Corner radius" hideLabel className="w-24" value={el.props.radius ?? 0} unit="mm" min={0} onChange={(v) => v !== null && set("shape", { radius: Math.max(0, v) }, "Corner radius", "radius")} />}
        </>
      );
    case "line":
      return (
        <>
          <ColourButton label="Colour" value={el.props.stroke} swatches={sw} allowNone onChange={(c) => set("line", { stroke: c }, "Line colour")} />
          <NumberField label="Weight" hideLabel className="w-24" value={el.props.strokeWidth} unit="mm" min={0.1} onChange={(v) => v && set("line", { strokeWidth: Math.max(0.1, v) }, "Line weight", "lw")} />
          <Select label="Style" hideLabel className="w-28" value={el.props.dash} onChange={(v) => v && set("line", { dash: v }, "Line style")} options={["solid", "dashed", "dotted"].map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }))} />
          <TbButton active={!!el.props.endArrow} onClick={() => set("line", { endArrow: !el.props.endArrow }, "Arrow")}>
            Arrow
          </TbButton>
        </>
      );
    case "divider":
      return (
        <>
          <ColourButton label="Colour" value={el.props.color} swatches={sw} allowNone onChange={(c) => set("divider", { color: c }, "Divider colour")} />
          <Select label="Style" hideLabel className="w-28" value={el.props.style ?? "solid"} onChange={(v) => v && set("divider", { style: v }, "Divider style")} options={["solid", "dashed", "dotted"].map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }))} />
        </>
      );
    case "icon":
    case "qr":
    case "page_number":
      return <ColourButton label="Colour" value={el.props.color} swatches={sw} allowNone onChange={(c) => set(el.type, { color: c }, "Colour")} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Text and callouts (DS-7 replaces this with the full text toolbar)
// ---------------------------------------------------------------------------

const ALIGNS = [
  { v: "left", icon: AlignLeft, label: "Align left" },
  { v: "center", icon: AlignCenter, label: "Align centre" },
  { v: "right", icon: AlignRight, label: "Align right" },
  { v: "justify", icon: AlignJustify, label: "Justify" },
] as const;

export function TextToolbar({ doc, pageId, elements, editor }: ToolbarProps) {
  const el = elements[0];
  if (!el || (el.type !== "text" && el.type !== "callout")) return null;
  const locked = !!el.locked || editor.readOnly;
  const ids = elements.filter((e) => e.type === el.type).map((e) => e.id);
  return (
    <>
      {el.type === "text" &&
        ALIGNS.map((a) => (
          <TbButton key={a.v} aria-label={a.label} title={a.label} active={el.props.align === a.v} disabled={locked} onClick={() => editor.commit(updateProps(editor.doc, pageId, ids, "text", { align: a.v }), a.label)} icon={<a.icon aria-hidden className="size-4" />} />
        ))}
      <ColourButton label="Text colour" value={el.props.color} swatches={themeSwatches(doc)} allowNone onChange={(c) => editor.commit(updateProps(editor.doc, pageId, ids, el.type, { color: c } as never), "Text colour")} />
      <span className="px-2 text-xs text-muted">Double-click the text to edit it.</span>
    </>
  );
}

// ---------------------------------------------------------------------------
// Data elements (DS-8 replaces chart and table)
// ---------------------------------------------------------------------------

export function DataToolbar({ elements, editor }: ToolbarProps) {
  const el = elements[0];
  if (!el) return null;
  return (
    <TbButton icon={<Database aria-hidden className="size-4" />} onClick={() => editor.openDrawer("data")}>
      Edit data
    </TbButton>
  );
}

// ---------------------------------------------------------------------------
// Several types selected
// ---------------------------------------------------------------------------

export function MultiToolbar({ pageId, elements, editor }: ToolbarProps) {
  const ids = elements.map((e) => e.id);
  const grouped = elements.length > 1 && elements.every((e) => e.groupId && e.groupId === elements[0].groupId);
  return (
    <>
      <span className="px-2 text-sm text-muted">{elements.length} elements</span>
      {grouped ? (
        <TbButton icon={<Ungroup aria-hidden className="size-4" />} disabled={editor.readOnly} onClick={() => editor.commit(ungroupElements(editor.doc, pageId, ids), "Ungroup")}>
          Ungroup
        </TbButton>
      ) : (
        <TbButton
          icon={<Group aria-hidden className="size-4" />}
          disabled={editor.readOnly || elements.length < 2}
          onClick={() => {
            const r = groupElements(editor.doc, pageId, ids, { newId: editor.newId });
            editor.commit(r.doc, "Group");
          }}
        >
          Group
        </TbButton>
      )}
    </>
  );
}

