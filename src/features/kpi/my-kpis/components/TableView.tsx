import { type KeyboardEvent, useRef, useState } from "react";
import { Check, Loader2, PanelRightOpen } from "lucide-react";
import type { MyKpiItem } from "../../../../lib/kpi/contracts";
import { StatusPill, cn, focusRing, inputBase, panel } from "../../../../ui";
import { codeMessage, kpiErrorMessage, useSaveDraft } from "../api";
import { cellText, gridDraft, isGridNumeric, itemKey, parseCell, periodLabelOf, toValueInput, topicLabelOf } from "../logic";

type CellState = { text: string; unit: string; state: "idle" | "saving" | "saved" | "error"; error: string | null };

/**
 * KPI-7 part 3 · Table view (05-ux S3 "fast lane"): every to-do item as a
 * row, typed by keyboard. Tab moves across, Enter saves the row and goes to
 * the next one (Shift+Enter goes back). Each row saves as a draft with the
 * same checks as the card; "Open" shows the full card for the split,
 * evidence and comment.
 */
export function TableView({ items, listKey, showSite, onOpen }: { items: MyKpiItem[]; listKey: readonly unknown[]; showSite: boolean; onOpen: (key: string) => void }) {
  const save = useSaveDraft(listKey);
  const [cells, setCells] = useState<Record<string, CellState>>({});
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const cellOf = (i: MyKpiItem): CellState => cells[itemKey(i)] ?? { text: cellText(i), unit: i.value?.unit ?? i.canonical_unit ?? "", state: "idle", error: null };
  const patch = (key: string, base: CellState, next: Partial<CellState>) => setCells((c) => ({ ...c, [key]: { ...base, ...(c[key] ?? {}), ...next } }));

  const commit = async (i: MyKpiItem, override?: Partial<CellState>) => {
    const key = itemKey(i);
    const cell = { ...cellOf(i), ...override };
    const parsed = parseCell(cell.text, i);
    if (parsed.error) {
      patch(key, cell, { state: "error", error: parsed.error });
      return false;
    }
    const savedUnit = i.value?.unit ?? i.canonical_unit ?? "";
    if (parsed.value === (i.value?.value_numeric ?? null) && cell.unit === savedUnit) {
      patch(key, cell, { state: cell.state === "error" ? "idle" : cell.state, error: null });
      return true;
    }
    patch(key, cell, { state: "saving", error: null });
    try {
      const r = await save.mutateAsync({ input: toValueInput(i, gridDraft(i, parsed.value, cell.unit)), key });
      if (r.ok) patch(key, cell, { state: "saved", error: null });
      else patch(key, cell, { state: "error", error: codeMessage(r.code, r.message || "This value couldn't be saved.") });
      return r.ok;
    } catch (e) {
      patch(key, cell, { state: "error", error: kpiErrorMessage(e, "Couldn't save. What you typed is still here.") });
      return false;
    }
  };

  const focusRow = (from: number, step: 1 | -1) => {
    for (let n = from + step; n >= 0 && n < items.length; n += step) {
      const el = inputs.current[n];
      if (el) {
        el.focus();
        el.select();
        return;
      }
    }
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>, i: MyKpiItem, index: number) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void commit(i);
    focusRow(index, e.shiftKey ? -1 : 1);
  };

  if (!items.length) return null;
  return (
    <div className={cn(panel, "overflow-x-auto")}>
      <table className="w-full min-w-[40rem] border-collapse text-sm" aria-label="What's due, as a table">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th scope="col" className="px-3 py-2 font-medium">
              KPI
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Period
            </th>
            <th scope="col" className="w-36 px-3 py-2 font-medium">
              Value
            </th>
            <th scope="col" className="w-28 px-3 py-2 font-medium">
              Unit
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Status
            </th>
            <th scope="col" className="px-3 py-2" aria-label="Open the card" />
          </tr>
        </thead>
        <tbody>
          {items.map((i, index) => {
            const key = itemKey(i);
            const cell = cellOf(i);
            const where = showSite ? (i.site_name ?? "Company") : null;
            const label = `${i.name}${where ? ` at ${where}` : ""}, ${periodLabelOf(i)}`;
            const units = i.allowed_units.length ? i.allowed_units : i.canonical_unit ? [i.canonical_unit] : [];
            const errorId = `${key}-error`.replace(/[^a-z0-9-]/gi, "-");
            return (
              <tr key={key} className={cn("border-b border-line last:border-0", i.group === "sent_back" && "bg-warn-soft/40")} data-testid="kpi-table-row">
                <th scope="row" className="px-3 py-2 text-left font-medium text-ink">
                  <span className="block">{i.name}</span>
                  <span className="block text-xs font-normal text-muted">{[topicLabelOf(i), where].filter(Boolean).join(" · ")}</span>
                </th>
                <td className="px-3 py-2 text-muted">{periodLabelOf(i)}</td>
                <td className="px-3 py-1.5">
                  {isGridNumeric(i) ? (
                    <input
                      ref={(el) => {
                        inputs.current[index] = el;
                      }}
                      type="text"
                      inputMode="decimal"
                      aria-label={label}
                      aria-invalid={cell.state === "error" || undefined}
                      aria-describedby={cell.error ? errorId : undefined}
                      value={cell.text}
                      onChange={(e) => patch(key, cell, { text: e.target.value, state: "idle", error: null })}
                      onBlur={() => void commit(i)}
                      onKeyDown={(e) => onKey(e, i, index)}
                      className={cn(inputBase, "h-8 w-full text-right font-num", cell.state === "error" && "border-bad")}
                      placeholder="0"
                    />
                  ) : (
                    <span className="text-xs text-muted">Answer in the card</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  {isGridNumeric(i) && units.length > 1 ? (
                    <select
                      aria-label={`Unit for ${label}`}
                      value={cell.unit}
                      onChange={(e) => void commit(i, { unit: e.target.value })}
                      className={cn(inputBase, "h-8 w-full")}
                    >
                      {units.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-muted">{units[0] ?? ""}</span>
                  )}
                </td>
                <td className="px-3 py-2" aria-live="polite">
                  {cell.state === "saving" ? (
                    <span className="inline-flex items-center gap-1 text-muted">
                      <Loader2 aria-hidden className="size-3.5 animate-spin" />
                      Saving…
                    </span>
                  ) : cell.state === "error" ? (
                    <span id={errorId} role="alert" className="text-bad">
                      {cell.error}
                    </span>
                  ) : cell.state === "saved" ? (
                    <span className="inline-flex items-center gap-1 text-good">
                      <Check aria-hidden className="size-3.5" />
                      Draft saved
                    </span>
                  ) : i.group === "sent_back" ? (
                    <StatusPill status="rejected" label="Sent back" size="sm" />
                  ) : i.value?.status === "draft" ? (
                    <StatusPill status="draft" label="Draft saved" size="sm" />
                  ) : (
                    <span className="text-muted">To enter</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => onOpen(key)}
                    aria-label={`Open the card for ${label}`}
                    className={cn("inline-flex items-center gap-1 rounded-control px-2 py-1 text-xs font-medium text-brand-text hover:bg-tint", focusRing)}
                  >
                    <PanelRightOpen aria-hidden className="size-4" />
                    Open
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
