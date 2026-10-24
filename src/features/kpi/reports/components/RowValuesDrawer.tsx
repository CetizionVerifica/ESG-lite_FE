import { useMemo, useState } from "react";
import type { KpiReportRow } from "../../../../lib/kpi/contracts";
import { Button, Drawer, StatusPill } from "../../../../ui";
import { KpiValueDrawer } from "../../components/KpiValueDrawer";
import type { KpiLookup } from "../../components/lookup";
import { valueItems } from "../../components/valueItems";
import { kpiErrorMessage, useRowValues } from "../api";
import { reportValue } from "../logic";

/**
 * KPI-11 · The records behind a report figure (every value traces back to
 * its evidence): one value opens its record drawer (read-only); several are
 * listed first, by site and period.
 */
export function RowValuesDrawer({ row, year, lookup, onClose }: { row: KpiReportRow; year: number; lookup: KpiLookup; onClose: () => void }) {
  const q = useRowValues(row.kpi_definition_ids ?? [], row.value_ids ?? [], year);
  const items = useMemo(() => valueItems(q.data ?? [], lookup), [q.data, lookup]);
  const [picked, setPicked] = useState<number | null>(null);
  const only = items.length === 1 ? items[0] : null;
  const open = only ?? items.find((i) => i.id === picked) ?? null;

  if (open) return <KpiValueDrawer item={open} onClose={only ? onClose : () => setPicked(null)} />;
  return (
    <Drawer
      open
      onClose={onClose}
      title={`${row.code} · ${row.title}`}
      subtitle={`${reportValue(row.value, row.unit)} in ${year}, from ${row.value_ids?.length ?? 0} approved ${row.value_ids?.length === 1 ? "value" : "values"}`}
      size="md"
      loading={q.isPending}
      error={q.isError ? kpiErrorMessage(q.error, "Couldn't load the values behind this figure.") : null}
      onRetry={() => void q.refetch()}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted">No values found for this figure.</p>
      ) : (
        <ul className="divide-y divide-line" aria-label="Values behind this figure">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 text-sm">
                <span className="block font-medium text-ink">{i.kpiName}</span>
                <span className="block text-xs text-muted">
                  {i.siteName} · {i.periodLabel}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-num text-sm text-ink">{i.valueText}</span>
                <StatusPill status={i.value.status} size="sm" />
                <Button size="sm" variant="ghost" onClick={() => setPicked(i.id)} aria-label={`Open ${i.kpiName}, ${i.siteName}, ${i.periodLabel}`}>
                  Open
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
