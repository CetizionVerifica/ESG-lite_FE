import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button, Callout, EmptyState, cn, formatEntryTonnes, formatTonnes, panel } from "../../../ui";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateEmissionQueries } from "../../../lib/emissionQueries";
import { linkBillEvidence, saveRow, updateRow, uploadRowEvidence, useAlreadyBacking, type SaveOutcome } from "../api";
import { submitEmissions } from "../../../services/reviewService";
import { type SubmitTally, draftIdsToSubmit, finishCopy, mergeSubmit } from "../logic/submit";
import { editOf } from "../logic/existing";
import { ROW_METHOD_COLUMN } from "../../../lib/emissions/emissionCalc";
import { billOf } from "../logic/bill";
import type { EmissionCalculator } from "../hooks/emissionCalc";
import type { EmissionPayload } from "../logic/entry";
import type { ModalRow } from "../types";
import { DuplicateDialog, type DuplicateChoice } from "../components/DuplicateDialog";
import { plainProblem } from "../../../lib/entryDetail";
import { mappingKeyLabel } from "../logic/form";

type Outcome = SaveOutcome | { kind: "skipped" } | { kind: "saving" };
type Evidence = "attached" | "failed";

type Props = {
  /** SE-1: false for a User: "Sent" only; the engine's notes go to reviewers; save problems in plain words. */
  detail: boolean;
  rows: ModalRow[];
  payloads: EmissionPayload[];
  calc: EmissionCalculator;
  /** Files picked on a typed row, uploaded once it's saved. */
  evidenceFiles: (rowId: number) => File[];
  periodLabel: string;
  onBack: () => void;
  /**
   * Back to the rows to pick another method for the rows the server refused
   * (S3-3 METHOD_NOT_ALLOWED). `sentIds`: rows already sent, which leave the form.
   */
  onFixMethod?: (refused: { rowId: number; method: string; message: string }[], sentIds: number[]) => void;
  /** Every row is sent or skipped. */
  onFinished: () => void;
  onAnother: () => void;
  /**
   * S3-15, with the company's review workflow on: the server saves a User's
   * rows as drafts, so the send button becomes "Save and submit" (drafts are
   * submitted right after the save) next to "Save as draft".
   */
  workflow?: boolean;
  /**
   * #255: the save's mode lock for this period (the server's words, as step 2's note says it), or
   * null when the period is free. New rows can't be sent while it's set; edits of saved entries can.
   */
  periodLock?: string | null;
};

const label = (row: ModalRow) => (row._ecmKey ? mappingKeyLabel(String(row._ecmKey)) : row.emission_category) || "—";

/** Step 3: what will be sent, then send it row by row. */
export function Review(p: Props) {
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
  const [sending, setSending] = useState(false);
  const [evidence, setEvidence] = useState<Record<number, Evidence>>({});
  const [askDuplicates, setAskDuplicates] = useState(false);
  // S3-15: whether this send also submits the saved drafts, and what the submits did.
  const [submitAfter, setSubmitAfter] = useState(true);
  const [tally, setTally] = useState<SubmitTally>({ submitted: [], refused: [], failed: false });
  const client = useQueryClient();
  const total = p.rows.reduce((sum, r) => sum + (p.calc.calculateEmission(r).value ?? 0), 0);
  // F-16: a bill or file that already backs another entry of the period; asked until the first send.
  const unsent = Object.keys(outcomes).length === 0 && !sending;
  const backing = useAlreadyBacking(p.rows, p.payloads, p.evidenceFiles, unsent);
  const backed = unsent ? p.rows.map((row, i) => ({ row, i, uses: backing.get(row.id) ?? [] })).filter((b) => b.uses.length > 0) : [];

  // `onDuplicate`: what a duplicate row does on this send (the dialog's Replace or Keep both), else nothing.
  const send = async (indexes: number[], onDuplicate: (i: number) => "replace" | "keep_both" | undefined, submit = submitAfter) => {
    setSending(true);
    setSubmitAfter(submit);
    const savedNow: SaveOutcome[] = [];
    // Saved rows per bill, so each bill is attached once as their evidence (B8).
    const fromBills = new Map<number, { rowIds: number[]; emissionIds: number[] }>();
    let conflicts = 0;
    for (const i of indexes) {
      const row = p.rows[i];
      setOutcomes((o) => ({ ...o, [row.id]: { kind: "saving" } }));
      const editing = editOf(row);
      const outcome = editing !== null ? await updateRow(editing, p.payloads[i]) : await saveRow(p.payloads[i], onDuplicate(i));
      setOutcomes((o) => ({ ...o, [row.id]: outcome }));
      savedNow.push(outcome);
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
    // S3-15: drafts saved by this send go for approval in one submit, after their evidence is attached.
    const ids = p.workflow && submit ? draftIdsToSubmit(savedNow) : [];
    if (ids.length > 0) {
      try {
        const result = await submitEmissions(ids);
        setTally((t) => mergeSubmit(t, result));
      } catch {
        setTally((t) => ({ ...t, failed: true }));
      }
    }
    setSending(false);
    void invalidateEmissionQueries(client);
    // All conflicts from this send are decided together.
    setAskDuplicates(conflicts > 0);
  };

  const applyDuplicates = async (choices: Record<string, DuplicateChoice>) => {
    const choice = (i: number) => choices[String(p.rows[i].id)] ?? "skip";
    const skip = duplicates.filter((i) => choice(i) === "skip");
    setOutcomes((o) => ({ ...o, ...Object.fromEntries(skip.map((i) => [p.rows[i].id, { kind: "skipped" as const }])) }));
    await send(
      duplicates.filter((i) => choice(i) !== "skip"),
      (i) => (choice(i) === "replace" ? "replace" : "keep_both"),
      submitAfter,
    );
  };

  // #255: a new row in a period filed the other way would only be refused, before and after a send.
  const locked = (row: ModalRow) => !!p.periodLock && editOf(row) === null;
  const refusedByLock = (row: ModalRow) => {
    const o = outcomes[row.id];
    return o?.kind === "error" && o.modeLock;
  };
  // What a send would send: rows not sent yet, and errors worth another try (not the lock's refusal).
  const pending = p.rows
    .map((_, i) => i)
    .filter((i) => {
      const row = p.rows[i];
      const o = outcomes[row.id];
      return (!o || o.kind === "error") && !locked(row) && !refusedByLock(row);
    });
  const blockedCount = p.rows.filter((r) => !outcomes[r.id] && locked(r)).length;
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
  // S3-3: rows the form refused for their method; they go back to the rows to pick another.
  const refused = p.rows.flatMap((r) => {
    const o = outcomes[r.id];
    return o?.kind === "error" && o.methodNotAllowed ? [{ rowId: r.id, method: String(r[ROW_METHOD_COLUMN] ?? ""), message: o.message }] : [];
  });
  const fixMethod = () =>
    p.onFixMethod?.(
      refused,
      p.rows.filter((r) => outcomes[r.id]?.kind === "saved" || outcomes[r.id]?.kind === "skipped").map((r) => r.id),
    );
  // The engine's notes on saved rows (S3-4): an older factor year, no FERA row. Never blocking.
  const notes = !p.detail ? [] : p.rows.flatMap((r) => {
    const o = outcomes[r.id];
    return o?.kind === "saved" ? (o.warnings ?? []).map((w) => ({ id: `${r.id}:${w}`, text: `${label(r)}: ${w}` })) : [];
  });
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
    const savedStatuses = p.rows.flatMap((r) => {
      const o = outcomes[r.id];
      return o?.kind === "saved" ? [o.status ?? null] : [];
    });
    const copy = p.workflow ? finishCopy(savedStatuses, tally, p.periodLabel) : null;
    return (
      <div className={cn(panel, "p-6")}>
        <EmptyState
          icon={CheckCircle2}
          title={copy ? copy.title : savedCount > 0 ? `${savedCount} row${savedCount === 1 ? "" : "s"} sent for approval` : "Nothing was sent"}
          description={
            savedCount === 0
              ? "Every row was skipped."
              : unattached > 0
                ? `${copy ? copy.description : `Your manager reviews ${p.periodLabel} next.`} Evidence couldn't be attached to ${unattached} row${unattached === 1 ? "" : "s"}; attach it from My entries.`
                : copy
                  ? copy.description
                  : `Your manager reviews ${p.periodLabel} next.`
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={p.onAnother}>Add another category</Button>
              <Link to="/my-month" className="inline-flex h-9 items-center px-3 text-sm font-medium text-brand-text underline">
                Back to Current Month
              </Link>
              <Link to="/data/mine" className="inline-flex h-9 items-center px-3 text-sm font-medium text-brand-text underline">
                View in My entries
              </Link>
            </div>
          }
        />
        {notes.length > 0 && (
          <Callout tone="warn" title="Sent, with notes" className="mx-auto mt-4 max-w-xl">
            <ul className="list-disc space-y-1 pl-4">
              {notes.map((n) => (
                <li key={n.id}>{n.text}</li>
              ))}
            </ul>
          </Callout>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {blockedCount > 0 && (
        <Callout tone="warn" title={blockedCount === p.rows.length ? "These rows can't be sent" : `${blockedCount} of ${p.rows.length} rows can't be sent`}>
          {p.periodLock}
        </Callout>
      )}
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
                  <td className="px-3 py-2 text-right font-num text-ink">{formatTonnes(p.calc.calculateEmission(row).value)}</td>
                  <td className="px-3 py-2">
                    {evidenceText(row)}
                    {unsent && backing.has(row.id) && <span className="block text-xs text-warn">Already the evidence of a saved entry</span>}
                  </td>
                  <td className="px-3 py-2" aria-live="polite">
                    {!o && !locked(row) && <span className="text-muted">Ready</span>}
                    {!o && locked(row) && <span className="text-warn">Can't be sent: this period is filed the other way</span>}
                    {o?.kind === "saving" && <span className="text-muted">Sending…</span>}
                    {o?.kind === "saved" && <span className="text-good">Sent</span>}
                    {o?.kind === "saved" &&
                      p.detail &&
                      o.warnings?.map((w) => (
                        <span key={w} className="block text-xs text-warn">
                          {w}
                        </span>
                      ))}
                    {o?.kind === "skipped" && <span className="text-muted">Skipped</span>}
                    {o?.kind === "error" && <span className="text-bad">{p.detail ? o.message : plainProblem(o.message)}</span>}
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

      {refused.length > 0 && !sending && p.onFixMethod && (
        <Callout
          tone="warn"
          title={refused.length === 1 ? "1 row uses a method this form doesn't offer" : `${refused.length} rows use a method this form doesn't offer`}
          action={<Button size="sm" onClick={fixMethod}>Change the method</Button>}
        >
          Pick one of the methods the form offers, then send again.{savedCount > 0 ? " Rows already sent stay sent." : ""}
        </Callout>
      )}

      {backed.length > 0 && (
        <Callout tone="warn" title={backed.length === 1 ? "This evidence already backs another entry" : "Some evidence already backs other entries"}>
          <ul className="space-y-1">
            {backed.flatMap(({ row, i, uses }) =>
              uses.map((u) => (
                <li key={`${row.id}-${u.fileName}`}>
                  Row {i + 1} · {label(row)}: {u.fileName || "this file"} is already the evidence of{" "}
                  {u.entries
                    .map((e) => `${e.emission_category ?? "an entry"} (${e.total_emission === null ? "—" : `${formatEntryTonnes(e.total_emission)} tCO₂e`}, ${e.status.charAt(0).toUpperCase()}${e.status.slice(1)})`)
                    .join(", ")}{" "}
                  for {p.periodLabel}.
                </li>
              )),
            )}
          </ul>
          <p className="mt-1">If it is the same purchase, it would be counted twice. You can still send.</p>
        </Callout>
      )}

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
          Total <span className="font-num text-base font-semibold text-ink">{formatTonnes(total)} tCO₂e</span> for {p.periodLabel}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={p.onBack} disabled={sending || savedCount > 0}>
            Back
          </Button>
          {/* #255: after a send, the send buttons stay only while something is left to send. */}
          {(pending.length > 0 || sending || Object.keys(outcomes).length === 0) && (
            <>
              {p.workflow && (
                <Button onClick={() => void send(pending, () => undefined, false)} loading={sending && !submitAfter} disabled={pending.length === 0 || sending}>
                  Save as draft
                </Button>
              )}
              <Button variant="primary" onClick={() => void send(pending, () => undefined, true)} loading={sending && (!p.workflow || submitAfter)} disabled={pending.length === 0 || sending}>
                {Object.keys(outcomes).length > 0 ? "Send the rest" : p.workflow ? "Save and submit" : "Submit for approval"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
