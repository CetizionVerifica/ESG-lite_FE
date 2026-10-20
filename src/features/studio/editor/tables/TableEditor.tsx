// DS-8 · the static table editor (a dialog): headings and cells, rows and
// columns, column widths, and merged cells. Click a cell, shift-click another
// to select a block, then Merge; Unmerge splits the block under the cursor.
// Bound tables are edited from the toolbar (columns, widths) and the Data
// drawer; typed data (custom) uses the custom-data grid.
import { useState } from "react";
import { Combine, Minus, Plus, SplitSquareHorizontal } from "lucide-react";
import { findElement } from "../../../../lib/studio/docOps";
import { Button, Modal, NumberField, cn, focusRing } from "../../../../ui";
import type { EditorApi } from "../EditorContext";
import {
  addColumn,
  addRow,
  colCount,
  mergeAt,
  mergeCells,
  normalizeWidths,
  patchTable,
  removeColumn,
  removeRow,
  setCell,
  setColumnWidth,
  unmergeAt,
  type TableProps,
} from "./tableOps";

export function TableEditorDialog({
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
  const [props, setProps] = useState<TableProps | null>(() =>
    el?.type === "table" ? el.props : null,
  );
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null);
  const [focus, setFocus] = useState<{ r: number; c: number } | null>(null);
  if (!props || !el) return null;
  const n = colCount(props);
  const rows = props.rows ?? [];
  const sel =
    anchor && focus
      ? { r0: anchor.r, c0: anchor.c, r1: focus.r, c1: focus.c }
      : null;
  const inSel = (r: number, c: number) =>
    !!sel &&
    r >= Math.min(sel.r0, sel.r1) &&
    r <= Math.max(sel.r0, sel.r1) &&
    c >= Math.min(sel.c0, sel.c1) &&
    c <= Math.max(sel.c0, sel.c1);
  const widths =
    props.colWidths?.length === n
      ? props.colWidths
      : normalizeWidths(Array.from({ length: n }, () => 1));
  const covered = (r: number, c: number) => {
    const m = mergeAt(props, r, c);
    return !!m && (m.r !== r || m.c !== c);
  };
  const apply = () => {
    editor.commit(patchTable(editor.doc, pageId, el.id, props), "Edit table");
    onClose();
  };
  const pick = (r: number, c: number, shift: boolean) => {
    if (shift && anchor) setFocus({ r, c });
    else {
      setAnchor({ r, c });
      setFocus({ r, c });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit table"
      description="Click a cell and shift-click another to select a block for merging."
      primaryAction={{
        label: "Apply",
        onClick: apply,
        disabled: editor.readOnly,
      }}
    >
      <div className="space-y-3" data-testid="table-editor">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus aria-hidden className="size-4" />}
            onClick={() =>
              setProps(addRow(props, focus ? focus.r + 1 : undefined))
            }
          >
            Row
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Minus aria-hidden className="size-4" />}
            disabled={!focus || rows.length <= 1}
            onClick={() =>
              focus &&
              (setProps(removeRow(props, focus.r)),
              setFocus(null),
              setAnchor(null))
            }
          >
            Row
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus aria-hidden className="size-4" />}
            disabled={n >= 20}
            onClick={() =>
              setProps(addColumn(props, focus ? focus.c + 1 : undefined))
            }
          >
            Column
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Minus aria-hidden className="size-4" />}
            disabled={!focus || n <= 1}
            onClick={() =>
              focus &&
              (setProps(removeColumn(props, focus.c)),
              setFocus(null),
              setAnchor(null))
            }
          >
            Column
          </Button>
          <span className="flex-1" />
          <Button
            size="sm"
            variant="secondary"
            icon={<Combine aria-hidden className="size-4" />}
            disabled={!sel || (sel.r0 === sel.r1 && sel.c0 === sel.c1)}
            onClick={() => sel && setProps(mergeCells(props, sel))}
          >
            Merge cells
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<SplitSquareHorizontal aria-hidden className="size-4" />}
            disabled={!focus || !mergeAt(props, focus.r, focus.c)}
            onClick={() =>
              focus && setProps(unmergeAt(props, focus.r, focus.c))
            }
          >
            Unmerge
          </Button>
        </div>
        <div className="max-h-[50vh] overflow-auto rounded-control border border-line">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                {Array.from({ length: n }, (_, c) => (
                  <th
                    key={c}
                    className="border-b border-line bg-tint p-1 font-normal"
                  >
                    <NumberField
                      label={`Column ${c + 1} width`}
                      hideLabel
                      className="w-24"
                      unit="%"
                      min={1}
                      max={100}
                      value={Math.round(widths[c] * 10) / 10}
                      onChange={(v) =>
                        v !== null && setProps(setColumnWidth(props, n, c, v))
                      }
                    />
                  </th>
                ))}
              </tr>
              <tr>
                {Array.from({ length: n }, (_, c) => (
                  <th key={c} className="border-b border-r border-line p-0">
                    <input
                      aria-label={`Column ${c + 1} heading`}
                      value={String(props.columns?.[c] ?? "")}
                      onChange={(e) =>
                        setProps(setCell(props, -1, c, e.target.value))
                      }
                      className={cn(
                        "h-8 w-full min-w-24 bg-panel px-2 font-semibold text-ink outline-none",
                        focusRing,
                      )}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {Array.from({ length: n }, (_, c) => (
                    <td
                      key={c}
                      className={cn(
                        "border-b border-r border-line p-0",
                        inSel(r, c) && "bg-brand-50",
                      )}
                    >
                      <input
                        aria-label={`Row ${r + 1}, column ${c + 1}`}
                        value={covered(r, c) ? "" : String(row[c] ?? "")}
                        disabled={covered(r, c)}
                        placeholder={covered(r, c) ? "merged" : undefined}
                        onMouseDown={(e) => pick(r, c, e.shiftKey)}
                        onFocus={() => !anchor && pick(r, c, false)}
                        onChange={(e) =>
                          setProps(setCell(props, r, c, e.target.value))
                        }
                        className={cn(
                          "h-8 w-full min-w-24 bg-transparent px-2 text-ink outline-none disabled:text-muted",
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
        {(props.merges?.length ?? 0) > 0 && (
          <p className="text-xs text-muted">
            {props.merges?.length} merged block
            {props.merges?.length === 1 ? "" : "s"}. The top-left cell's text
            shows across the block.
          </p>
        )}
      </div>
    </Modal>
  );
}
