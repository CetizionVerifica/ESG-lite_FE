// DS-8 · the table toolbar (05-ux "table: Edit, Rows/columns, Style, Total
// row"). Static tables open the table editor; typed data opens the
// custom-data grid; bound tables pick their columns from the breakdown, set
// widths, and offer "Move to a flow section" when they outgrow the frame.
import { Columns3, Database, FileText, Pencil, Table2 } from "lucide-react";
import type { Binding, Element } from "../../../../lib/studio/contracts";
import { Menu, NumberField, Popover, Select } from "../../../../ui";
import type { ToolbarProps } from "../registry";
import { Sep, TbButton } from "../toolbars";
import { setChartsUi } from "../charts/store";
import { boundShape, colCount, moveTableToFlow, overflows, patchTable, pickColumns, setColumnWidth, normalizeWidths, type TableProps } from "./tableOps";

const STYLES = [
  { value: "lined", label: "Lined" },
  { value: "zebra", label: "Zebra" },
  { value: "minimal", label: "Minimal" },
] as const;


export function TableToolbar({ pageId, elements, editor }: ToolbarProps) {
  const el = elements[0] as Extract<Element, { type: "table" }> | undefined;
  if (!el || el.type !== "table") return null;
  const locked = editor.readOnly || !!el.locked;
  const p = el.props;
  const b = p.binding as Binding | undefined;
  const set = (next: TableProps, label: string, mergeKey?: string) => editor.commit(patchTable(editor.doc, pageId, el.id, next), label, mergeKey ? { mergeKey: `${mergeKey}:${el.id}` } : undefined);
  const resolved = b && b.source !== "custom" ? editor.render.resolved.find((r) => JSON.stringify(r.binding) === JSON.stringify(b))?.value : undefined;
  const shape = b ? (b.source === "custom" ? { columns: b.columns, rows: b.rows.length } : boundShape(resolved)) : { columns: p.columns ?? [], rows: (p.rows ?? []).length };
  const shown = b && b.source !== "custom" && p.columns?.length ? shape.columns.filter((c, i) => i === 0 || p.columns?.includes(c)) : shape.columns;
  const n = b ? shown.length : colCount(p);
  const tooTall = !!b && b.source !== "custom" && overflows(el, shape.rows);
  if (locked) return <span className="px-2 text-sm text-muted">Locked. Unlock it to change the table.</span>;

  return (
    <>
      {!b && (
        <TbButton icon={<Pencil aria-hidden className="size-4" />} onClick={() => setChartsUi({ table: { pageId, elementId: el.id } })}>
          Edit
        </TbButton>
      )}
      {b?.source === "custom" && (
        <TbButton icon={<Table2 aria-hidden className="size-4" />} onClick={() => setChartsUi({ grid: { pageId, elementId: el.id } })}>
          Edit table
        </TbButton>
      )}
      {b && b.source !== "custom" && (
        <>
          <TbButton icon={<Database aria-hidden className="size-4" />} onClick={() => editor.openDrawer("data")}>
            Edit data
          </TbButton>
          <Menu
            label="Columns"
            trigger={(t) => (
              <TbButton {...t} icon={<Columns3 aria-hidden className="size-4" />}>
                Columns ▾
              </TbButton>
            )}
            items={
              shape.columns.length > 1
                ? [
                    { label: "All columns", checked: !p.columns?.length, onSelect: () => set(pickColumns(p, []), "Show all columns") },
                    ...shape.columns.slice(1).map((c) => {
                      const on = !p.columns?.length || p.columns.includes(c);
                      return {
                        label: c,
                        checked: on,
                        onSelect: () => {
                          const cur = p.columns?.length ? p.columns : shape.columns.slice(1);
                          const next = on ? cur.filter((x) => x !== c) : [...cur, c];
                          if (next.length) set(pickColumns(p, next.length === shape.columns.length - 1 ? [] : next), on ? `Hide ${c}` : `Show ${c}`);
                        },
                      };
                    }),
                  ]
                : [{ kind: "heading" as const, content: <span className="text-xs text-muted">The columns show once the data loads.</span> }]
            }
          />
        </>
      )}
      <Select label="Table style" hideLabel className="w-28" value={p.style} onChange={(v) => v && set({ ...p, style: v }, "Table style")} options={[...STYLES]} />
      <TbButton active={!!p.totalRow} onClick={() => set({ ...p, totalRow: !p.totalRow }, p.totalRow ? "No total row" : "Total row")}>
        Total row
      </TbButton>
      {n > 1 && (
        <Popover
          label="Column widths"
          trigger={(t) => (
            <TbButton {...t} title="Column widths">
              Widths
            </TbButton>
          )}
        >
          {() => {
            const widths = p.colWidths?.length === n ? p.colWidths : normalizeWidths(Array.from({ length: n }, () => 1));
            return (
              <div className="w-64 space-y-2 p-1">
                {Array.from({ length: n }, (_, c) => (
                  <NumberField key={c} label={(b ? shown[c] : p.columns?.[c]) || (c === 0 ? "Labels" : `Column ${c + 1}`)} unit="%" min={1} max={100} value={Math.round(widths[c] * 10) / 10} onChange={(v) => v !== null && set(setColumnWidth(p, n, c, v), "Column width", "colw")} />
                ))}
                <TbButton onClick={() => set({ ...p, colWidths: undefined }, "Even columns")}>Fit to content</TbButton>
              </div>
            );
          }}
        </Popover>
      )}
      {tooTall && (
        <>
          <Sep />
          <span className="text-xs text-warn">Taller than its frame</span>
          <TbButton
            icon={<FileText aria-hidden className="size-4" />}
            onClick={() => {
              const r = moveTableToFlow(editor.doc, pageId, el.id, editor.newId);
              if (r) editor.commit(r.doc, "Move table to a flow section", { pageId: r.pageId, select: [] });
            }}
          >
            Move to a flow section
          </TbButton>
        </>
      )}
    </>
  );
}
