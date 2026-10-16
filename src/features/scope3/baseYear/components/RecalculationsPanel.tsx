import { useState } from "react";
import {
  AuditTimeline,
  Badge,
  Button,
  Callout,
  EmptyState,
  Modal,
  Select,
  SkeletonText,
  Textarea,
  useToast,
} from "../../../../ui";
import {
  type CompanyBaseYear,
  type RecalcEvent,
  type RecalcReason,
  CHANGE_KIND_LABEL,
  RECALC_REASONS,
  RECALC_REASON_LABEL,
  noteError,
  proposalSentence,
  signedT,
  totalLabel,
} from "../../../../lib/scope3/baseYear";
import { errorMessage, useApproveRecalculation, useDismissRecalculation, useRecalculations } from "../api";
import { historyEntries } from "../logic";
import { TotalsTable } from "./TotalsTable";

const REASON_OPTIONS = RECALC_REASONS.map((r) => ({ value: r, label: RECALC_REASON_LABEL[r] }));

/** The open proposal (approve or dismiss), its before/after table and the decided history. */
export function RecalculationsPanel({ companyId, row, editable }: { companyId: number | null; row: CompanyBaseYear; editable: boolean }) {
  const { toast } = useToast();
  const events = useRecalculations(companyId);
  const approve = useApproveRecalculation(companyId);
  const dismiss = useDismissRecalculation(companyId);
  const [dialog, setDialog] = useState<"approve" | "dismiss" | null>(null);
  const [reason, setReason] = useState<RecalcReason | null>(null);
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const list = events.data?.events ?? [];
  const open: RecalcEvent | undefined = list.find((e) => e.status === "proposed");
  const history = historyEntries(list);

  const openDialog = (kind: "approve" | "dismiss") => {
    setDialog(kind);
    setReason(open?.reason ?? null);
    setNote("");
    setTried(false);
    setErr(null);
  };
  const close = () => setDialog(null);
  const nErr = noteError(note);

  const onApprove = () => {
    setTried(true);
    if (!reason || nErr) return;
    approve.mutate(
      { reason, note: note.trim() },
      {
        onSuccess: () => {
          toast({ title: "Base year recalculated", tone: "good" });
          close();
        },
        onError: (e) => setErr(errorMessage(e, "The recalculation wasn't saved. Try again.")),
      },
    );
  };
  const onDismiss = () => {
    setTried(true);
    if (!open || nErr) return;
    dismiss.mutate(
      { id: open.id, note: note.trim() },
      {
        onSuccess: () => {
          toast({ title: "Proposal dismissed; the base year stays as frozen", tone: "good" });
          close();
        },
        onError: (e) => setErr(errorMessage(e, "The proposal wasn't dismissed. Try again.")),
      },
    );
  };

  return (
    <div className="space-y-4" data-testid="recalculations">
      <h3 className="text-sm font-medium text-ink">Recalculations</h3>
      {events.isLoading ? (
        <SkeletonText lines={3} />
      ) : events.isError ? (
        <EmptyState
          compact
          variant="error"
          title="Couldn't load the recalculations."
          description={errorMessage(events.error, "Check your connection and try again.")}
          action={<Button size="sm" onClick={() => events.refetch()}>Try again</Button>}
        />
      ) : open ? (
        <Callout tone="warn" title={proposalSentence(open, row.significance_pct)}>
          <div className="space-y-3">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span>Suggested reason:</span>
              <Badge tone="warn">{RECALC_REASON_LABEL[open.reason]}</Badge>
              <span className="text-muted">{signedT(open.delta_tco2e)}</span>
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
              {open.changes.slice(0, 6).map((c, i) => (
                <li key={i}>
                  {CHANGE_KIND_LABEL[c.kind] ?? c.kind}
                  {c.n !== null ? ` · ${totalLabel(c.n)}` : ""}
                  {c.delta_tco2e ? ` · ${signedT(c.delta_tco2e)}` : ""}
                </li>
              ))}
            </ul>
            {open.before && open.after && (
              <TotalsTable caption="Frozen base year beside today's figures" totals={open.before.categories} after={open.after.categories} />
            )}
            {editable && (
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => openDialog("approve")}>Approve recalculation</Button>
                <Button variant="ghost" onClick={() => openDialog("dismiss")}>Dismiss</Button>
              </div>
            )}
          </div>
        </Callout>
      ) : (
        <p className="text-sm text-muted" data-testid="no-recalc">No changes since you froze {row.base_year}.</p>
      )}

      {!events.isLoading && !events.isError && history.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-medium text-muted">History</h4>
          <AuditTimeline entries={history} />
        </div>
      )}

      <Modal
        open={dialog === "approve"}
        onClose={close}
        title="Approve the recalculation?"
        description={`The base year is frozen again with today's figures (${open ? signedT(open.delta_tco2e) : ""}). Entries themselves don't change.`}
        primaryAction={{ label: "Approve recalculation", onClick: onApprove, loading: approve.isPending }}
        error={err}
      >
        <div className="space-y-3">
          <Select<RecalcReason>
            label="Reason"
            value={reason}
            options={REASON_OPTIONS}
            onChange={setReason}
            error={tried && !reason ? "Pick a reason." : undefined}
          />
          <Textarea label="Note" help="Shown in the GHG report beside this recalculation." value={note} onChange={setNote} error={tried ? nErr : undefined} />
        </div>
      </Modal>
      <Modal
        open={dialog === "dismiss"}
        onClose={close}
        title="Dismiss this proposal?"
        description="The base year stays as frozen. The same changes aren't proposed again."
        primaryAction={{ label: "Dismiss", onClick: onDismiss, loading: dismiss.isPending }}
        error={err}
      >
        <Textarea label="Note" value={note} onChange={setNote} error={tried ? nErr : undefined} />
      </Modal>
    </div>
  );
}
