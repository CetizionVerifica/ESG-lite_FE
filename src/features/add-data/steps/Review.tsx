import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button, Callout, EmptyState, cn, formatNumber, panel } from "../../../ui";
import { saveRow, type SaveOutcome } from "../api";
import type { EmissionCalculator } from "../hooks/emissionCalc";
import type { EmissionPayload } from "../logic/entry";
import type { ModalRow } from "../types";

type Outcome = SaveOutcome | { kind: "skipped" } | { kind: "saving" };

type Props = {
  rows: ModalRow[];
  payloads: EmissionPayload[];
  calc: EmissionCalculator;
  periodLabel: string;
  onBack: () => void;
  onAnother: () => void;
};

const label = (row: ModalRow) => (row._ecmKey as string) || row.emission_category || "—";

/** Step 3: what will be sent, then send it row by row. */
export function Review(p: Props) {
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
  const [sending, setSending] = useState(false);
  const total = p.rows.reduce((sum, r) => sum + (p.calc.calculateEmission(r).value ?? 0), 0);

  const send = async (indexes: number[], replace: boolean) => {
    setSending(true);
    for (const i of indexes) {
      setOutcomes((o) => ({ ...o, [p.rows[i].id]: { kind: "saving" } }));
      const outcome = await saveRow(p.payloads[i], replace);
      setOutcomes((o) => ({ ...o, [p.rows[i].id]: outcome }));
    }
    setSending(false);
  };

  const pending = p.rows.map((_, i) => i).filter((i) => !outcomes[p.rows[i].id] || outcomes[p.rows[i].id].kind === "error");
  const duplicates = p.rows.map((_, i) => i).filter((i) => outcomes[p.rows[i].id]?.kind === "duplicate");
  const finished = p.rows.length > 0 && p.rows.every((r) => ["saved", "skipped"].includes(outcomes[r.id]?.kind ?? ""));
  const savedCount = p.rows.filter((r) => outcomes[r.id]?.kind === "saved").length;

  if (finished) {
    return (
      <div className={cn(panel, "p-6")}>
        <EmptyState
          icon={CheckCircle2}
          title={savedCount > 0 ? `${savedCount} row${savedCount === 1 ? "" : "s"} sent for approval` : "Nothing was sent"}
          description={savedCount > 0 ? `Your manager reviews ${p.periodLabel} next.` : "Every row was skipped."}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={p.onAnother}>Add another category</Button>
              <Link to="/my-month" className="inline-flex h-9 items-center px-3 text-sm font-medium text-brand-text underline">
                Back to My month
              </Link>
              <Link to="/data/mine" className="inline-flex h-9 items-center px-3 text-sm font-medium text-brand-text underline">
                View in My entries
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={cn(panel, "overflow-x-auto")}>
        <table className="w-full text-sm">
          <caption className="sr-only">Rows to send for {p.periodLabel}</caption>
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">#</th>
              <th scope="col" className="px-3 py-2 font-medium">Emission category</th>
              <th scope="col" className="px-3 py-2 font-medium">Unit</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">tCO₂e</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((row, i) => {
              const o = outcomes[row.id];
              return (
                <tr key={row.id} className="border-b border-line last:border-0 align-top">
                  <td className="px-3 py-2 text-muted">{i + 1}</td>
                  <td className="px-3 py-2 text-ink">{label(row)}</td>
                  <td className="px-3 py-2 text-muted">{row.activity_data_unit}</td>
                  <td className="px-3 py-2 text-right font-num text-ink">{formatNumber(p.calc.calculateEmission(row).value, 2)}</td>
                  <td className="px-3 py-2" aria-live="polite">
                    {!o && <span className="text-muted">Ready</span>}
                    {o?.kind === "saving" && <span className="text-muted">Sending…</span>}
                    {o?.kind === "saved" && <span className="text-good">Sent</span>}
                    {o?.kind === "skipped" && <span className="text-muted">Skipped</span>}
                    {o?.kind === "error" && <span className="text-bad">{o.message}</span>}
                    {o?.kind === "duplicate" && (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-warn">Already entered for this period</span>
                        <Button size="sm" variant="secondary" disabled={sending} onClick={() => void send([i], true)}>
                          Replace
                        </Button>
                        <Button size="sm" variant="ghost" disabled={sending} onClick={() => setOutcomes((s) => ({ ...s, [row.id]: { kind: "skipped" } }))}>
                          Skip
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {duplicates.length > 1 && (
        <Callout
          tone="warn"
          title={`${duplicates.length} rows already exist for ${p.periodLabel}`}
          action={
            <Button size="sm" variant="secondary" disabled={sending} onClick={() => void send(duplicates, true)}>
              Replace all
            </Button>
          }
        >
          Replace swaps the saved entry for this one; Skip keeps the saved entry.
        </Callout>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Total <span className="font-num text-base font-semibold text-ink">{formatNumber(total, 2)} tCO₂e</span> for {p.periodLabel}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={p.onBack} disabled={sending || savedCount > 0}>
            Back
          </Button>
          <Button variant="primary" onClick={() => void send(pending, false)} loading={sending} disabled={pending.length === 0}>
            {Object.keys(outcomes).length > 0 ? "Send the rest" : "Submit for approval"}
          </Button>
        </div>
      </div>
    </div>
  );
}
