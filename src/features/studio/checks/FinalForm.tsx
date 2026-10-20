// DS-12 · making the final (RS S5, 05-ux S8): the reason while checks block
// it, else the warnings to acknowledge ("I've reviewed these"), the version
// number and the note, then Generate final PDF. The server gate decides
// (DS_CHECKS_BLOCKING); this form says the same thing first, in words.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Callout, Textarea, cn, focusRing } from "../../../ui";
import type { Check } from "../../../lib/studio/contracts";
import { finalBlock, warningIds } from "../../../lib/studio/checks";
import { finalRefusal, jobStatusText } from "../../../lib/studio/outputs";
import { dsError, useRenderJob, useVersions } from "../share/api";
import { useSafeToast } from "../share/useSafeToast";
import { useChecksOnce } from "./api";
import { refreshChecks, useChecksState } from "./store";
import { useApprovals } from "../review/api"; // DS-13
import { approvalBlock } from "../review/logic"; // DS-13

export interface FinalFormProps {
  docId: number;
  canFinal: boolean;
  /** Compact (inside the Download menu) or roomy (the dialog). */
  compact?: boolean;
  onStarted?: () => void;
}

export function FinalForm({ docId, canFinal, compact, onStarted }: FinalFormProps) {
  const { data, loading, error } = useChecksState(docId);
  const checks = data?.checks;
  const versions = useVersions(docId, true);
  const run = useRenderJob(docId);
  const toast = useSafeToast();
  const [note, setNote] = useState("");
  const [ack, setAck] = useState<Set<string>>(new Set());
  const hasFinal = (versions.data ?? []).some((v) => v.kind === "final");
  const nextN = (versions.data ?? []).reduce((m, v) => Math.max(m, v.n), 0) + 1;
  const checksBlocked = finalBlock(checks, { canFinal });
  // DS-13: with review required, a final also needs an approval for the current rev.
  const approvals = useApprovals(canFinal ? docId : 0);
  const reviewBlocked = approvalBlock(approvals.data);
  const blocked = checksBlocked ?? reviewBlocked;
  const warnings = useMemo(() => {
    const byId = new Map<string, Check[]>();
    for (const c of checks ?? []) if (c.severity === "warning") byId.set(c.id, [...(byId.get(c.id) ?? []), c]);
    return [...byId.entries()];
  }, [checks]);
  const allAcked = warningIds(checks).every((id) => ack.has(id));

  // Fresh checks when the form opens (and after a refused or failed final).
  useChecksOnce(docId, canFinal);

  const told = useRef<number | null>(null);
  useEffect(() => {
    const j = run.job;
    if (!j || (j.status !== "done" && j.status !== "failed") || told.current === j.id) return;
    told.current = j.id;
    toast({ title: jobStatusText(j), tone: j.status === "done" ? "good" : "bad" });
    if (j.status === "failed") refreshChecks(docId);
  }, [run.job, toast, docId]);

  const err = run.startError ? dsError(run.startError) : null;
  const refusal = err ? finalRefusal(err.code, err.details, err.message) : null;
  const start = () => {
    run.start.mutate(
      { kind: "final", acknowledgedWarnings: [...ack], ...(note.trim() ? { note: note.trim() } : {}) },
      {
        onSuccess: () => {
          toast({ title: "Building your PDF… about a minute", tone: "neutral" });
          onStarted?.();
        },
        onError: () => refreshChecks(docId),
      },
    );
  };

  if (!canFinal) return <p className="text-xs text-muted">Only a Manager can make the final.</p>;
  return (
    <div className={cn("flex flex-col gap-2.5", compact ? "text-xs" : "text-sm")} data-testid="final-form">
      <p className="text-xs text-muted">The final uses approved data only and can't be changed afterwards. Later edits go into a new version.</p>
      {loading && !checks ? <p className="text-xs text-muted">Running the checks…</p> : null}
      {error && !checks ? <Callout tone="warn" title="The checks couldn't run">{error}</Callout> : null}
      {blocked ? (
        <Callout tone="warn" title="The final is blocked">
          <span className="text-xs" data-testid="final-blocked">{blocked}</span>
          {checksBlocked && reviewBlocked && <span className="mt-1 block text-xs" data-testid="final-blocked-review">{reviewBlocked}</span>}
          {checks?.some((c) => c.id === "GHG_PENDING_ENTRIES") && (
            <Link to="/data/approvals" className={cn("ml-1 text-xs font-medium text-brand-text underline", focusRing)}>
              Open Review
            </Link>
          )}
        </Callout>
      ) : (
        <>
          {warnings.length > 0 && (
            <fieldset className="flex flex-col gap-1.5 rounded-control border border-line p-2.5" data-testid="final-warnings">
              <legend className="px-1 text-xs font-semibold text-ink">I've reviewed these</legend>
              {warnings.map(([id, list]) => (
                <label key={id} className="flex items-start gap-2 text-xs text-ink">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-brand"
                    checked={ack.has(id)}
                    onChange={(e) => setAck((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(id);
                      else next.delete(id);
                      return next;
                    })}
                  />
                  <span>
                    {list[0].message}
                    {list.length > 1 ? <span className="text-muted"> (and {list.length - 1} more like it)</span> : null}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <p className="text-xs text-muted" data-testid="final-version">
            This will be Final v{nextN}.
          </p>
          {hasFinal && <Textarea label="What changed since the last final?" value={note} onChange={setNote} rows={2} required />}
        </>
      )}
      <Button size="sm" variant="primary" loading={run.busy} disabled={!!blocked || !checks || !allAcked || (hasFinal && !note.trim())} onClick={start} data-testid="final-go">
        Generate final PDF
      </Button>
      {!blocked && checks && !allAcked && <p className="text-xs text-muted">Tick each warning once you've reviewed it.</p>}
      {refusal && (
        <Callout tone="warn" title="The final couldn't be started">
          <ul className="list-disc pl-4 text-xs">
            {refusal.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Callout>
      )}
      {run.job && !refusal && <p className={cn("text-xs", run.job.status === "failed" ? "text-bad" : "text-muted")} role="status" aria-live="polite">{jobStatusText(run.job)}</p>}
    </div>
  );
}
