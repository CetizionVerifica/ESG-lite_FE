import { useState } from "react";
import { X } from "lucide-react";
import type { EmissionBreakdown } from "../../../services/emissionBreakdownService";
import { Button, EmptyState, SegmentedControl, SkeletonText, cn, formatEmissions, formatNumber, panel } from "../../../ui";
import { type BreakdownMetric, breakdownRows } from "../logic";

type Props = {
  categoryName: string | null;
  data: EmissionBreakdown | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onClose: () => void;
};

/** Consumption or emissions per emission category for the chosen category (old "Consumption by type"). */
export function BreakdownPanel(p: Props) {
  const [metric, setMetric] = useState<BreakdownMetric>("consumption");
  const rows = p.data ? breakdownRows(p.data.groups, metric) : [];

  return (
    <aside aria-label="Breakdown" className={cn(panel, "space-y-4 p-4")}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">Breakdown</h2>
          <p className="text-xs text-muted">{p.categoryName ? `${p.categoryName} by type, for the filters above` : "By type, for one category"}</p>
        </div>
        <Button variant="ghost" size="sm" icon={<X aria-hidden className="size-4" />} onClick={p.onClose} aria-label="Close breakdown" />
      </header>

      {!p.categoryName ? (
        <EmptyState compact title="Choose a category to see its breakdown." />
      ) : (
        <>
          <SegmentedControl<BreakdownMetric>
            label="Show"
            size="sm"
            value={metric}
            onChange={setMetric}
            options={[
              { value: "consumption", label: "Consumption" },
              { value: "emissions", label: "Emissions" },
            ]}
          />
          {p.loading ? (
            <SkeletonText lines={4} />
          ) : p.error ? (
            <EmptyState compact variant="error" title="Couldn't load the breakdown." action={<Button size="sm" onClick={p.onRetry}>Try again</Button>} />
          ) : rows.length === 0 ? (
            <EmptyState compact title="No entries for these filters." />
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">{metric === "consumption" ? "Consumption" : "Emissions"} by type</caption>
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="pb-2 font-medium">Type</th>
                  <th scope="col" className="pb-2 text-right font-medium">{metric === "consumption" ? "Quantity" : "tCO₂e"}</th>
                  <th scope="col" className="w-12 pb-2 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="py-2 pr-2 text-left font-normal text-ink">
                      {r.label}
                      <span className="block text-xs text-muted">
                        {r.entries} {r.entries === 1 ? "entry" : "entries"}
                      </span>
                    </th>
                    <td className="whitespace-nowrap py-2 text-right font-num tabular-nums text-ink">
                      {metric === "emissions" ? formatEmissions(r.value) : formatNumber(r.value, Number.isInteger(r.value) ? 0 : 2)}
                      {metric === "consumption" && r.unit && <span className="ml-1 text-xs text-muted">{r.unit}</span>}
                    </td>
                    <td className="py-2 text-right font-num tabular-nums text-muted">{r.share === null ? "—" : `${r.share}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {metric === "consumption" && rows.some((r) => r.unit === "mixed") && (
            <p className="text-xs text-muted">"mixed" means the entries of that type use different units, so its quantity adds them as entered.</p>
          )}
        </>
      )}
    </aside>
  );
}
