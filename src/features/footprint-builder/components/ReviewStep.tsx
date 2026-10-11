import { Calculator, CircleAlert, Send } from "lucide-react";
import { Button, Callout, formatDateTime, panel } from "../../../ui";
import { type CalcResult, type Line, RESULT_STAGES, type ResultSummary, type RunningTotal, STAGE_LABEL, fmtKg, lineProblem, needsConfirm } from "../logic";

type Props = {
  total: RunningTotal;
  lines: Line[];
  unitLabel: string;
  plantBlockers: string[];
  /** Details of a calculation made in this visit (cut-off, DQR). */
  calc: CalcResult | undefined;
  /** The stored result, from the last calculation. */
  summary: ResultSummary | null | undefined;
  /** Nothing changed since that calculation. */
  current: boolean;
  canCalculate: boolean;
  waitReason: string | null;
  calculating: boolean;
  submitting: boolean;
  onCalculate: () => void;
  onSubmit: () => void;
};

const pct = (v: number | null | undefined) => (v == null ? "Hidden (licensed data)" : `${v.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`);

/** Step 6: what the footprint adds up to, what's still open, then Calculate and Submit for review. */
export function ReviewStep(p: Props) {
  const fresh = p.current && !!p.summary;
  const byStage = fresh && p.summary?.by_stage ? p.summary.by_stage : p.total.byStage;
  const total = fresh ? p.summary!.total_kg_per_unit : p.total.total;
  const hidden = new Set(fresh ? p.summary!.hidden_stages : []);
  const names = new Map(p.lines.map((l) => [`in-${l.pcf_input_id ?? ""}`, l.name]));
  const calcLines = p.calc?.result.lines ?? [];
  const cut = p.calc?.result.cut_off;

  const open = [
    ...p.lines.filter((l) => lineProblem(l)).map((l) => `${l.name || "Unnamed line"}: ${lineProblem(l)}`),
    ...p.lines.filter(needsConfirm).map((l) => `${l.name}: low AI confidence, confirm it in its step`),
    ...p.total.unpriced.filter((u) => !p.lines.find((l) => l.key === u.key && lineProblem(l))).map((u) => `${u.name}: ${u.reason}`),
    ...p.plantBlockers,
    ...(fresh ? (p.calc?.warnings ?? p.summary?.warnings ?? []) : []),
  ];

  return (
    <section aria-labelledby="review-title" className={`${panel} space-y-6 p-4 sm:p-6`}>
      <div>
        <h2 id="review-title" className="text-base font-semibold text-ink">
          Review
        </h2>
        <p className="mt-1 text-sm text-muted">
          {fresh
            ? `Calculated ${formatDateTime(p.summary!.calculated_at)}. Nothing has changed since.`
            : p.summary
              ? "Changed since the last calculation. Calculate again before sending it for review."
              : "Not calculated yet. Figures below are the running total."}
        </p>
      </div>

      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">Footprint by stage, kgCO₂e per {p.unitLabel}</caption>
        <thead className="border-b border-line text-left text-xs text-muted">
          <tr>
            <th scope="col" className="py-2">Stage</th>
            <th scope="col" className="py-2 text-right">kgCO₂e per {p.unitLabel}</th>
            <th scope="col" className="py-2 text-right">Share</th>
          </tr>
        </thead>
        <tbody>
          {RESULT_STAGES.map((s) => {
            const v = byStage[s] ?? 0;
            return (
              <tr key={s} className="border-b border-line">
                <th scope="row" className="py-2 text-left font-normal text-ink">{STAGE_LABEL[s]}</th>
                <td className="py-2 text-right">{hidden.has(s) ? "Hidden" : fmtKg(v)}</td>
                <td className="py-2 text-right text-muted">{hidden.has(s) || !(total > 0) ? "—" : `${Math.round((v / total) * 100)}%`}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="font-semibold">
          <tr>
            <th scope="row" className="py-2 text-left">Total</th>
            <td className="py-2 text-right">{fmtKg(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>

      {fresh && (
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted">Primary data share</dt>
            <dd className="mt-1 text-lg font-semibold text-ink">{pct(p.summary!.primary_data_share_pct)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Data quality (DQR)</dt>
            <dd className="mt-1 text-lg font-semibold text-ink">
              {p.summary!.dqr_overall == null ? "Hidden (licensed data)" : p.summary!.dqr_overall.toLocaleString("en-GB", { maximumFractionDigits: 2 })}
            </dd>
          </div>
          {cut && (
            <div>
              <dt className="text-sm text-muted">Cut-off candidates</dt>
              <dd className="mt-1 text-sm text-ink">
                {cut.below_threshold_ids === null
                  ? "Hidden (licensed data)"
                  : cut.below_threshold_ids.length === 0
                    ? "None under 1%"
                    : `${cut.below_threshold_ids.map((id) => calcLines.find((l) => l.id === id)?.name ?? names.get(id) ?? id).join(", ")} (${pct(cut.below_threshold_total_pct)} together)`}
                {!cut.within_limit && <span className="block text-warn">Together they reach 5% or more, so none may be left out.</span>}
              </dd>
            </div>
          )}
        </dl>
      )}

      {open.length > 0 ? (
        <Callout tone="warn" title={`${open.length} thing${open.length === 1 ? "" : "s"} to resolve`}>
          <ul className="mt-1 space-y-1">
            {open.map((o) => (
              <li key={o} className="flex gap-2">
                <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                {o}
              </li>
            ))}
          </ul>
        </Callout>
      ) : (
        <p className="text-sm text-muted">Nothing left to resolve.</p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button icon={<Calculator aria-hidden className="size-4" />} onClick={p.onCalculate} disabled={!p.canCalculate || !!p.waitReason} loading={p.calculating}>
          Calculate
        </Button>
        <Button variant="primary" icon={<Send aria-hidden className="size-4" />} onClick={p.onSubmit} disabled={!fresh || !!p.waitReason} loading={p.submitting}>
          Submit for review
        </Button>
      </div>
      {!fresh && <p className="text-right text-xs text-muted">Calculate first; the reviewer sees exactly what was calculated.</p>}
    </section>
  );
}
