// DS-7 · the data picker: `{{` in text, "Insert data value" in the Text
// drawer and toolbar. It lists the doc's kind only: GHG metrics (Scopes,
// Scope 3 categories, gases, intensity, base year and quality) for a GHG
// report, the company's selected KPIs for a sustainability report. Single
// values only (a breakdown is a chart, DS-8). Values are GET /studio/data's.
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { DataItem } from "../../../../lib/studio/contracts";
import { EmptyState, SkeletonText, TextField, cn, focusRing } from "../../../../ui";
import { useDataCatalog, studioErrorMessage } from "../../panels/data/api";
import { dataNote } from "../../panels/data/logic";
import type { ChipScope } from "./chipData";
import { pickerItems, type PickerItem } from "./picker";

export interface DataPickerProps {
  scope: ChipScope;
  /** Controlled query (the text after `{{`); without it the picker has its own search box. */
  query?: string;
  /** Keyboard highlight, controlled by the `{{` plugin's keys. */
  active?: number;
  onActive?: (i: number) => void;
  onPick: (item: DataItem) => void;
  /** Called with the current list so a keyboard handler can pick by index. */
  onItems?: (items: PickerItem[]) => void;
  className?: string;
}

export function DataPicker({ scope, query, active = 0, onActive, onPick, onItems, className }: DataPickerProps) {
  const [own, setOwn] = useState("");
  const q = query ?? own;
  // KPI search runs on the server (the list can be long); GHG metrics filter here.
  const catalog = useDataCatalog(scope, scope.kind === "sustainability" && q.trim() ? { q: q.trim() } : {});
  const items = useMemo(() => pickerItems(catalog.data?.groups ?? [], scope.kind === "sustainability" ? "" : q), [catalog.data, q, scope.kind]);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => onItems?.(items), [items, onItems]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)} data-testid="data-picker">
      {query === undefined && <TextField label={scope.kind === "ghg" ? "Search emissions data" : "Search KPIs"} hideLabel placeholder={scope.kind === "ghg" ? "Search emissions data" : "Search KPIs"} value={own} onChange={setOwn} autoFocus />}
      {catalog.isPending ? (
        <SkeletonText lines={4} />
      ) : catalog.isError ? (
        <EmptyState compact variant="error" title="The data couldn't be loaded." description={studioErrorMessage(catalog.error, "Try again in a moment.")} />
      ) : !items.length ? (
        <EmptyState compact icon={Search} title={q ? `Nothing matches “${q}”.` : scope.kind === "ghg" ? "No emissions data for this year yet." : "No KPIs are selected for this company."} />
      ) : (
        <ul ref={list} role="listbox" aria-label={scope.kind === "ghg" ? "Emissions data" : "KPIs"} className="max-h-72 min-h-0 overflow-y-auto">
          {items.map((p, i) => {
            const r = p.item.resolved;
            const off = !!r.unavailable && r.unavailable.reason !== "EXCLUDED";
            return (
              <li key={`${p.group}-${p.item.id}`} role="option" aria-selected={i === active} data-index={i}>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => onActive?.(i)}
                  onClick={() => onPick(p.item)}
                  className={cn("flex w-full items-start justify-between gap-3 rounded-control px-2 py-1.5 text-left", i === active ? "bg-tint" : "hover:bg-tint", focusRing)}
                  data-testid={`pick-${p.item.id}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{p.item.label}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {p.group} · {dataNote(r)}
                    </span>
                  </span>
                  <span className={cn("shrink-0 text-sm tabular-nums", off ? "text-muted" : "font-medium text-ink")}>{off ? "Not reported" : r.display}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
