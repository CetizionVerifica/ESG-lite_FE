import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button, EmptyState, cn, formatNumber, panel } from "../../../ui";
import { useQueryClient } from "@tanstack/react-query";
import { linkBillEvidence, saveRow, updateRow, uploadRowEvidence, type SaveOutcome } from "../api";
import { editOf } from "../logic/existing";
import { billOf } from "../logic/bill";
import type { EmissionCalculator } from "../hooks/emissionCalc";
import type { EmissionPayload } from "../logic/entry";
import type { ModalRow } from "../types";
import { DuplicateDialog, type DuplicateChoice } from "../components/DuplicateDialog";

type Outcome = SaveOutcome | { kind: "skipped" } | { kind: "saving" };
type Evidence = "attached" | "failed";

type Props = {
  rows: ModalRow[];
  payloads: EmissionPayload[];
  calc: EmissionCalculator;
  /** Files picked on a typed row, uploaded once it's saved. */
  evidenceFiles: (rowId: number) => File[];
  periodLabel: string;
  onBack: () => void;
  /** Every row is sent or skipped. */
  onFinished: () => void;
  onAnother: () => void;
};

const label = (row: ModalRow) => (row._ecmKey as string) || row.emission_category || "—";

/** Step 3: what will be sent, then send it row by row. */
export function Review(p: Props) {
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
  const [sending, setSending] = useState(false);
  const [evidence, setEvidence] = useState<Record<number, Evidence>>({});
  const [askDuplicates, setAskDuplicates] = useState(false);
  const client = useQueryClient();
  const total = p.rows.reduce((sum, r) => sum + (p.calc.calculateEmission(r).value ?? 0), 0);

  const send = async (indexes: number[], replace: boolean) => {
    setSending(true);
    // Saved rows per bill, so each bill is attached once as their evidence (B8).
    const fromBills = new Map<number, { rowIds: number[]; emissionIds: number[] }>();
    let conflicts = 0;
    for (const i of indexes) {
      const row = p.rows[i];
      setOutcomes((o) => ({ ...o, [row.id]: { kind: "saving" } }));
      const editing = editOf(row);
      const outcome = editing !== null ? await updateRow(editing, p.payloads[i]) : await saveRow(p.payloads[i], replace);
      setOutcomes((o) => ({ ...o, [row.id]: outcome }));
      if (outcome.kind === "duplicate") conflicts++;
      const files = p.evidenceFiles(row.id);
      if (outcome.kind === "saved" && outcome.emissionId != null && files.length > 0 && !billOf(row)) {
        const ok = await uploadRowEvidence(outcome.emissionId, files);
        setEvidence((e) => ({ ...e, [row.id]: ok ? "attached" : "failed" }));
      }
      const invoiceId = billOf(row)?.invoiceId;
      if (outcome.kind === "saved" && invoiceId != null) {
        const g = fromBills.get(invoiceId) ?? { rowIds: [], emissionIds: [] };
        g.rowIds.push(row.id);
        if (outcome.emissionId != null) g.emissionIds.push(outcome.emissionId);
        fromBills.set(invoiceId, g);
      }
    }
    for (const [invoiceId, g] of fromBills) {
      const ok = g.emissionIds.length === g.rowIds.length && (await linkBillEvidence(invoiceId, g.emissionIds));
      setEvidence((e) => ({ ...e, ...Object.fromEntries(g.rowIds.map((id) => [id, ok ? "attached" : "failed"])) }));
    }
    setSending(false);
    void client.invalidateQueries({ queryKey: ["add-data", "existing"] });
    // All conflicts from this send are decided together.
    setAskDuplicates(conflicts > 0);
  };

  const applyDuplicates = async (choices: Record<string, DuplicateChoice>) => {
    const skip = duplicates.filter((i) => choices[String(p.rows[i].id)] !== "replace");
    setOutcomes((o) => ({ ...o, ...Object.fromEntries(skip.map((i) => [p.rows[i].id, { kind: "skipped" as const }])) }));
    await send(
      duplicates.filter((i) => choices[String(p.rows[i].id)] === "replace"),
      true,
    );
  };

  const pending = p.rows.map((_, i) => i).filter((i) => !outcomes[p.rows[i].id] || outcomes[p.rows[i].id].kind === "error");
  const duplicates = p.rows.map((_, i) => i).filter((i) => outcomes[p.rows[i].id]?.kind === "duplicate");
  const duplicateItems = useMemo(
    () =>
      duplicates.map((i) => {
        const o = outcomes[p.rows[i].id];
        return {
          id: p.rows[i].id,
          label: `Row ${i + 1} · ${label(p.rows[i])}`,
          tco2e: p.calc.calculateEmission(p.rows[i]).value,
          message: o?.kind === "duplicate" ? o.message : "",
          existing: o?.kind === "duplicate" ? o.existing : null,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed when the conflicts change
    [duplicates.join(","), p.rows],
  );
  const finished = p.rows.length > 0 && p.rows.every((r) => ["saved", "skipped"].includes(outcomes[r.id]?.kind ?? ""));
  const savedCount = p.rows.filter((r) => outcomes[r.id]?.kind === "saved").length;
  const unattached = p.rows.filter((r) => evidence[r.id] === "failed").length;
  const evidenceText = (row: ModalRow) => {
    const bill = billOf(row);
    const files = bill ? 0 : p.evidenceFiles(row.id).length;
    const what = bill ? "Bill" : files === 1 ? "File" : "Files";
    if (evidence[row.id] === "attached") return <span className="text-good">{what} attached</span>;
    if (evidence[row.id] === "failed") return <span className="text-warn">{what} not attached</span>;
    if (!bill) return <span className="text-muted">{files > 0 ? `${files} file${files === 1 ? "" : "s"}, attached on send` : "None"}</span>;
    return <span className="text-muted">{bill.invoiceId != null ? "Bill, attached on send" : "None"}</span>;
  };

  const done = finished && !sending;
  const { onFinished } = p;
  useEffect(() => {
    if (done) onFinished();
  }, [done, onFinished]);

  if (done) {
    return (
      <div className={cn(panel, "p-6")}>
        <EmptyState
          icon={CheckCircle2}
          title={savedCount > 0 ? `${savedCount} row${savedCount === 1 ? "" : "s"} sent for approval` : "Nothing was sent"}
          description={
            savedCount === 0
              ? "Every row was skipped."
              : unattached > 0
                ? `Your manager reviews ${p.periodLabel} next. Evidence couldn't be attached to ${unattached} row${unattached === 1 ? "" : "s"}; attach it from My entries.`
                : `Your manager reviews ${p.periodLabel} next.`
          }
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
              <th scope="col" className="px-3 py-2 font-medium">Evidence</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((row, i) => {
              const o = outcomes[row.id];
              return (
                <tr key={row.id} className="border-b border-line last:border-0 align-top">
                  <td className="px-3 py-2 text-muted">{i + 1}</td>
                  <td className="px-3 py-2 text-ink">
                    {label(row)}
                    {editOf(row) !== null && <span className="block text-xs text-muted">Changes a saved entry</span>}
                  </td>
                  <td className="px-3 py-2 text-muted">{row.activity_data_unit}</td>
                  <td className="px-3 py-2 text-right font-num text-ink">{formatNumber(p.calc.calculateEmission(row).value, 2)}</td>
                  <td className="px-3 py-2">{evidenceText(row)}</td>
                  <td className="px-3 py-2" aria-live="polite">
                    {!o && <span className="text-muted">Ready</span>}
                    {o?.kind === "saving" && <span className="text-muted">Sending…</span>}
                    {o?.kind === "saved" && <span className="text-good">Sent</span>}
                    {o?.kind === "skipped" && <span className="text-muted">Skipped</span>}
                    {o?.kind === "error" && <span className="text-bad">{o.message}</span>}
                    {o?.kind === "duplicate" && (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-warn">Already entered for this period</span>
                        <Button size="sm" variant="secondary" disabled={sending} onClick={() => setAskDuplicates(true)}>
                          Replace or skip
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

      <DuplicateDialog
        open={askDuplicates && duplicates.length > 0}
        periodLabel={p.periodLabel}
        items={duplicateItems}
        busy={sending}
        onApply={(choices) => void applyDuplicates(choices)}
        onClose={() => setAskDuplicates(false)}
      />

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
