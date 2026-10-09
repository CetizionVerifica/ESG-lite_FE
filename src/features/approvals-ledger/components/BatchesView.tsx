import { useState } from "react";
import { Inbox } from "lucide-react";
import type { EmissionUploadBatch } from "../../../services/emissionService";
import { Button, type Column, DataTable, EmptyState, Modal, Textarea, formatDateTime, formatNumber, useToast } from "../../../ui";
import { errorMessage, useBatchMutations, useBatches } from "../api";
import { rejectReasonError } from "../logic";

/** Pending / approved / rejected split of one batch, with the numbers in text. */
function SplitBar({ batch }: { batch: EmissionUploadBatch }) {
  const parts = [
    { n: batch.pending_count, label: "pending", className: "bg-warn" },
    { n: batch.approved_count, label: "approved", className: "bg-good" },
    { n: batch.rejected_count, label: "rejected", className: "bg-bad" },
  ];
  const total = Math.max(1, batch.count);
  return (
    <div className="min-w-[10rem] space-y-1">
      <div aria-hidden className="flex h-1.5 overflow-hidden rounded-full bg-tint">
        {parts.map((p) => p.n > 0 && <span key={p.label} className={p.className} style={{ width: `${(p.n / total) * 100}%` }} />)}
      </div>
      <p className="text-xs text-muted">
        {parts
          .filter((p) => p.n > 0)
          .map((p) => `${formatNumber(p.n)} ${p.label}`)
          .join(" · ")}
      </p>
    </div>
  );
}

/** Upload batches tab: approve or reject a bulk upload's pending rows in one go. */
export function BatchesView({ siteIds, categoryId }: { siteIds: number[]; categoryId: number | null }) {
  const batches = useBatches(siteIds, categoryId);
  const m = useBatchMutations();
  const { toast } = useToast();
  const [approving, setApproving] = useState<EmissionUploadBatch | null>(null);
  const [rejecting, setRejecting] = useState<EmissionUploadBatch | null>(null);

  const columns: Column<EmissionUploadBatch>[] = [
    { id: "category", header: "Category", value: (b) => b.category_name, sortable: true },
    { id: "site", header: "Site", value: (b) => b.site_name, sortable: true },
    { id: "rows", header: "Rows", numeric: true, value: (b) => b.count, sortable: true },
    { id: "status", header: "Status", value: (b) => b.pending_count, cell: (b) => <SplitBar batch={b} />, exportValue: (b) => `${b.pending_count} pending, ${b.approved_count} approved, ${b.rejected_count} rejected` },
    { id: "by", header: "Uploaded by", value: (b) => b.uploaded_by ?? "—", sortable: true },
    { id: "at", header: "Uploaded", value: (b) => b.uploaded_at, sortable: true, cell: (b) => formatDateTime(b.uploaded_at) },
    {
      id: "actions",
      header: "Actions",
      hideable: false,
      value: () => null,
      exportValue: () => null,
      cell: (b) =>
        b.pending_count > 0 || b.approved_count > 0 ? (
          <span className="flex justify-end gap-1.5">
            {b.pending_count > 0 && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  m.approve.reset();
                  setApproving(b);
                }}
              >
                Approve pending
              </Button>
            )}
            <Button size="sm" onClick={() => setRejecting(b)}>
              Reject…
            </Button>
          </span>
        ) : null,
    },
  ];

  return (
    <>
      <DataTable<EmissionUploadBatch>
        label="Upload batches"
        rows={batches.data ?? []}
        columns={columns}
        getRowId={(b) => b.upload_batch_id}
        rowLabel={(b) => `${b.category_name} batch from ${formatDateTime(b.uploaded_at)}`}
        loading={batches.isPending}
        error={batches.isError ? errorMessage(batches.error, "Couldn't load upload batches.") : null}
        onRetry={() => void batches.refetch()}
        empty={<EmptyState icon={Inbox} title="No bulk uploads" description="Rows uploaded in bulk for these sites show up here as batches." />}
        defaultSort={{ id: "at", dir: "desc" }}
        storageKey="p07-batches"
        exportName="upload-batches"
      />
      <Modal
        open={approving !== null}
        onClose={() => setApproving(null)}
        title={`Approve ${approving ? formatNumber(approving.pending_count) : ""} pending rows?`}
        description={approving ? `${approving.category_name} · ${approving.site_name}, uploaded ${formatDateTime(approving.uploaded_at)}. Approved and rejected rows stay as they are.` : undefined}
        error={m.approve.isError ? errorMessage(m.approve.error, "Couldn't approve. Nothing was changed.") : null}
        primaryAction={{
          label: "Approve pending",
          loading: m.approve.isPending,
          onClick: () =>
            approving &&
            m.approve.mutate(approving.upload_batch_id, {
              onSuccess: () => {
                toast({ title: "Batch approved", description: `${formatNumber(approving.pending_count)} rows approved`, tone: "good" });
                setApproving(null);
              },
            }),
        }}
      />
      <BatchRejectModal
        batch={rejecting}
        busy={m.reject.isPending}
        error={m.reject.isError ? errorMessage(m.reject.error, "Couldn't reject. Nothing was changed.") : null}
        onClose={() => {
          m.reject.reset();
          setRejecting(null);
        }}
        onConfirm={(reason) =>
          rejecting &&
          m.reject.mutate(
            { batchId: rejecting.upload_batch_id, reason },
            {
              onSuccess: () => {
                toast({ title: "Batch rejected", description: "The uploader has been told why." });
                setRejecting(null);
              },
            },
          )
        }
      />
    </>
  );
}

/**
 * The server rejects a batch's pending AND approved rows together; it can't
 * leave the approved ones alone yet. So when a batch has approved rows the
 * manager must tick the box that says so; otherwise only pending rows exist
 * and nothing else is touched.
 */
function BatchRejectModal({
  batch,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  batch: EmissionUploadBatch | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [alsoApproved, setAlsoApproved] = useState(false);
  const [tried, setTried] = useState(false);
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (batch && shownFor !== batch.upload_batch_id) {
    setShownFor(batch.upload_batch_id);
    setReason("");
    setAlsoApproved(false);
    setTried(false);
  }
  const invalid = rejectReasonError(reason);
  const approved = batch?.approved_count ?? 0;
  const blocked = approved > 0 && !alsoApproved;
  const count = (batch?.pending_count ?? 0) + (alsoApproved ? approved : 0);

  return (
    <Modal
      open={batch !== null}
      onClose={onClose}
      tone="destructive"
      title={`Reject ${formatNumber(count)} rows?`}
      description={batch ? `${batch.category_name} · ${batch.site_name}, uploaded ${formatDateTime(batch.uploaded_at)}.` : undefined}
      error={error}
      primaryAction={{
        label: "Reject",
        loading: busy,
        disabled: blocked || count === 0,
        onClick: () => {
          setTried(true);
          if (!invalid && !blocked) onConfirm(reason.trim());
        },
      }}
    >
      <div className="space-y-3">
        <Textarea label="Reason" required value={reason} onChange={setReason} rows={2} error={tried ? invalid ?? undefined : undefined} placeholder="What needs fixing in this upload?" />
        {approved > 0 && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 accent-brand" checked={alsoApproved} onChange={(e) => setAlsoApproved(e.target.checked)} />
            <span>
              Reject the {formatNumber(approved)} approved rows too.
              <span className="block text-muted">This batch can't be rejected without them yet, so Reject stays off until you tick this.</span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}
