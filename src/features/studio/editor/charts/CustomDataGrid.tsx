// DS-8 · the custom-data grid (typed data for a chart or table): the first
// row is the header, the first column the labels, the rest numbers. Up to 200
// rows × 20 columns. Paste from a spreadsheet lands at the focused cell (the
// `paste` event, TSV). Labels that read like a GHG or KPI figure ("Scope 1",
// "tCO₂e", a KPI name) are refused with a warning: typed data is never a
// reported figure, and the element stays marked "Unlinked data".
import { useMemo, useRef, useState, type ClipboardEvent } from "react";
import { Minus, Plus } from "lucide-react";
import type { Binding, CustomData } from "../../../../lib/studio/contracts";
import { findElement, updateProps } from "../../../../lib/studio/docOps";
import {
  CUSTOM_MAX_COLS,
  CUSTOM_MAX_ROWS,
} from "../../../../lib/studio/render";
import { Button, Callout, Modal, cn, focusRing } from "../../../../ui";
import type { EditorApi } from "../EditorContext";
import { useDataCatalog } from "../../panels/data/api";
import { scopeOf } from "../renderInputs";
import {
  customToGrid,
  gridToCustom,
  nonNumericCells,
  parseTsv,
  pasteInto,
  reservedLabels,
  type Grid,
} from "./chartOps";

export function CustomDataGridDialog({
  editor,
  pageId,
  elementId,
  onClose,
}: {
  editor: EditorApi;
  pageId: string;
  elementId: string;
  onClose: () => void;
}) {
  const el = findElement(editor.doc, pageId, elementId);
  const binding =
    el && (el.type === "chart" || el.type === "table")
      ? (el.props.binding as Binding | undefined)
      : undefined;
  const custom = binding?.source === "custom" ? binding : null;
  const [grid, setGrid] = useState<Grid>(() =>
    custom
      ? customToGrid(custom)
      : [
          ["Item", "Value"],
          ["", ""],
        ],
  );
  const [clipped, setClipped] = useState(false);
  const focus = useRef({ r: 0, c: 0 });
  const catalog = useDataCatalog(scopeOf(editor.doc));
  const kpiNames = useMemo(
    () =>
      (catalog.data?.groups ?? []).flatMap((g) =>
        g.items.filter((i) => i.binding.source === "kpi").map((i) => i.label),
      ),
    [catalog.data],
  );
  const reserved = useMemo(
    () => reservedLabels(grid, kpiNames),
    [grid, kpiNames],
  );
  const data = useMemo(() => gridToCustom(grid), [grid]);
  const gaps = nonNumericCells(data);
  const cols = grid[0]?.length ?? 0;
  const rows = grid.length - 1;

  const set = (r: number, c: number, v: string) =>
    setGrid((g) =>
      g.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)),
    );
  const onPaste = (e: ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text || (!text.includes("\t") && !text.includes("\n"))) return; // one value: the input takes it
    e.preventDefault();
    const r = pasteInto(grid, focus.current, parseTsv(text));
    setGrid(r.grid);
    setClipped(r.clipped);
  };
  const apply = () => {
    if (!el || reserved.length) return;
    const next: CustomData = data;
    editor.commit(
      updateProps(editor.doc, pageId, [el.id], el.type as "chart", {
        binding: next,
      }),
      "Edit typed data",
    );
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Typed data"
      description="Numbers typed here are not approved data. The element is marked “Unlinked data” in the editor and listed in checks. Paste from a spreadsheet to fill the grid."
      primaryAction={{
        label: "Apply",
        onClick: apply,
        disabled: !!reserved.length || !el || editor.readOnly,
      }}
    >
      <div className="space-y-3" data-testid="custom-grid">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>
            {rows} row{rows === 1 ? "" : "s"} × {cols} column
            {cols === 1 ? "" : "s"} (up to {CUSTOM_MAX_ROWS} × {CUSTOM_MAX_COLS}
            )
          </span>
          <span className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus aria-hidden className="size-4" />}
            disabled={rows >= CUSTOM_MAX_ROWS}
            onClick={() =>
              setGrid((g) => [...g, Array.from({ length: cols }, () => "")])
            }
          >
            Row
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Minus aria-hidden className="size-4" />}
            disabled={rows <= 1}
            onClick={() => setGrid((g) => g.slice(0, -1))}
          >
            Row
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus aria-hidden className="size-4" />}
            disabled={cols >= CUSTOM_MAX_COLS}
            onClick={() =>
              setGrid((g) =>
                g.map((r, i) => [...r, i === 0 ? `Column ${cols + 1}` : ""]),
              )
            }
          >
            Column
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Minus aria-hidden className="size-4" />}
            disabled={cols <= 2}
            onClick={() => setGrid((g) => g.map((r) => r.slice(0, -1)))}
          >
            Column
          </Button>
        </div>
        <div
          className="max-h-[50vh] overflow-auto rounded-control border border-line"
          onPaste={onPaste}
        >
          <table className="border-collapse text-sm">
            <tbody>
              {grid.map((row, r) => (
                <tr key={r}>
                  <th
                    scope="row"
                    className="sticky left-0 w-8 border-b border-r border-line bg-tint px-1 text-center text-[11px] font-normal text-muted"
                  >
                    {r === 0 ? "" : r}
                  </th>
                  {row.map((v, c) => (
                    <td key={c} className="border-b border-r border-line p-0">
                      <input
                        aria-label={
                          r === 0
                            ? `Column ${c + 1} heading`
                            : `Row ${r}, ${grid[0][c] || `column ${c + 1}`}`
                        }
                        value={v}
                        onFocus={() => (focus.current = { r, c })}
                        onChange={(e) => set(r, c, e.target.value)}
                        className={cn(
                          "h-8 w-28 bg-panel px-2 text-ink outline-none",
                          r === 0 && "font-semibold",
                          c > 0 && r > 0 && "text-right font-num",
                          reserved.includes(v.trim()) && "bg-warn-soft",
                          focusRing,
                        )}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {reserved.length > 0 && (
          <Callout tone="warn" title="These labels read like reported figures">
            <p className="text-xs">
              {reserved.map((l) => `“${l}”`).join(", ")}: typed data can't use
              GHG or KPI names. Rename them, or show the real figure from the
              Data panel instead.
            </p>
          </Callout>
        )}
        {clipped && (
          <p className="text-xs text-warn">
            The pasted table was larger than {CUSTOM_MAX_ROWS} rows ×{" "}
            {CUSTOM_MAX_COLS} columns; the rest was left out.
          </p>
        )}
        {gaps > 0 && (
          <p className="text-xs text-muted">
            {gaps} cell{gaps === 1 ? "" : "s"} in number columns aren't numbers;
            the chart leaves them out.
          </p>
        )}
      </div>
    </Modal>
  );
}
