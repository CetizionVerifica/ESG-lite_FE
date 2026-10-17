import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Download, FileText, Sparkles } from "lucide-react";
import { Badge, Button, Callout, DateField, Drawer, Modal, NumberField, Select, TextField, Textarea, Tooltip, cn, fileNameFrom, focusRing, panel, saveBlob, useToast } from "../../../ui";
import { type DeclarationResponse, getSupplierRequestFile, useAccept, useDeleteRequest, useReadDeclaration, useReject, useResend } from "../api";
import {
  type AcceptForm,
  AI_CHIP_FIELDS,
  BOUNDARIES,
  BOUNDARY_LABEL,
  LOW_CONFIDENCE,
  STATUS_LABEL,
  STATUS_TONE,
  type SupplierRequest,
  acceptProblem,
  boundaryLabel,
  chipText,
  errorMessage,
  formFromDeclaration,
  formFromReply,
  isBoundaryRefusal,
  scope3AcceptNote,
  scope3Boundary,
  studyLabel,
  unitLabel,
} from "../logic";

type Props = {
  request: SupplierRequest | null;
  /** The link, when this session just created or resent the request (it is shown once). */
  link: string | null;
  mailNote: string | null;
  aiAvailable: boolean;
  onClose: () => void;
  onLink: (link: string, note: string | null) => void;
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

/** One AI-read field: value, confidence and the reason on hover/focus. */
function AiChip({ label, text, confidence, reason }: { label: string; text: string; confidence: number; reason: string }) {
  const low = confidence < LOW_CONFIDENCE;
  return (
    <Tooltip content={reason}>
      <span
        tabIndex={0}
        className={cn("inline-flex max-w-full items-center gap-1 rounded-chip border px-2 py-1 text-xs", focusRing, low ? "border-warn bg-warn/10 text-ink" : "border-line bg-tint text-ink")}
        data-testid={`ai-chip-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <span className="text-muted">{label}</span>
        <span className="truncate font-medium">{text}</span>
        <span className={cn("font-num tabular-nums", low ? "text-warn" : "text-muted")}>{confidence}%</span>
      </span>
    </Tooltip>
  );
}

export function RequestDrawer({ request: r, link, mailNote, aiAvailable, onClose, onLink }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<AcceptForm>(() => (r ? formFromReply(r) : formFromReply({} as SupplierRequest)));
  const [confirmBoundary, setConfirmBoundary] = useState(false);
  // S3-6: set when an accept added no Scope 3 supplier figure (its boundary wasn't confirmed).
  const [scope3Note, setScope3Note] = useState<{ id: number; text: string } | null>(null);
  const [read, setRead] = useState<DeclarationResponse | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [resending, setResending] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (r) {
      setForm(formFromReply(r));
      setConfirmBoundary(false);
      setRead(null);
      setRejecting(false);
      setRejectComment("");
      setDeleting(false);
    }
  }, [r?.supplier_request_id, r?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = useAccept();
  const reject = useReject();
  const resend = useResend();
  const del = useDeleteRequest();
  const reader = useReadDeclaration();
  const set = (patch: Partial<AcceptForm>) => setForm((f) => ({ ...f, ...patch }));

  if (!r) return <Drawer open={false} onClose={onClose} title="" />;

  const mismatch = !!form.boundary && !!r.study && form.boundary !== r.study.boundary;
  const s3 = scope3Boundary(r, form);
  const problem = acceptProblem(r, form, confirmBoundary);
  const canDecide = r.status === "received";
  const canResend = r.status !== "accepted" && r.status !== "rejected";
  const canDelete = !r.received_at;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Link copied", tone: "good" });
    } catch {
      toast({ title: "Couldn't copy. Select the link and copy it.", tone: "bad" });
    }
  };

  const download = async () => {
    if (!r.reply?.file) return;
    setDownloading(true);
    try {
      const { blob, disposition } = await getSupplierRequestFile(r.supplier_request_id);
      saveBlob(blob, fileNameFrom(disposition, r.reply.file.name));
    } catch (e) {
      toast({ title: errorMessage(e, "The file couldn't be downloaded."), tone: "bad" });
    } finally {
      setDownloading(false);
    }
  };

  const readFile = () => {
    if (!r.reply?.file || !r.study) return;
    reader.mutate(
      { id: r.supplier_request_id, fileName: r.reply.file.name, boundary: r.study.boundary, unit: r.unit, studyId: r.study.pcf_study_id },
      {
        onSuccess: (d) => {
          setRead(d);
          setForm((f) => formFromDeclaration(f, d));
          setConfirmBoundary(false);
        },
        onError: (e) => toast({ title: errorMessage(e, "The file couldn't be read."), tone: "bad" }),
      },
    );
  };

  const doAccept = () => {
    if (problem) return;
    accept.mutate(
      {
        id: r.supplier_request_id,
        body: {
          value_kgco2e: form.value_kgco2e!,
          boundary: form.boundary,
          confirm_boundary: confirmBoundary,
          standard: form.standard.trim() || null,
          gwp_set: form.gwp_set,
          valid_from: form.valid_from || null,
          valid_to: form.valid_to || null,
          verifier: form.verifier.trim() || null,
          comment: form.comment.trim() || null,
        },
      },
      {
        onSuccess: (res) => {
          toast({ title: "Supplier figure accepted", description: res.applied_to_input ? "It now replaces the factor on the line." : (res.note ?? undefined), tone: "good" });
          const note = scope3AcceptNote(res);
          setScope3Note(note ? { id: r.supplier_request_id, text: note } : null);
          if (note) toast({ title: "Not added for Scope 3", description: note });
        },
      },
    );
  };

  const doReject = () => {
    if (!rejectComment.trim()) return;
    reject.mutate(
      { id: r.supplier_request_id, comment: rejectComment.trim() },
      {
        onSuccess: () => {
          setRejecting(false);
          toast({ title: "Supplier figure rejected" });
        },
      },
    );
  };

  const doResend = () =>
    resend.mutate(
      { id: r.supplier_request_id },
      {
        onSuccess: (res) => {
          setResending(false);
          onLink(res.link, res.mail.delivered ? null : res.mail.reason);
          toast({ title: res.mail.delivered ? "Request sent again" : "New link ready", description: res.mail.delivered ? undefined : "Copy it to the supplier.", tone: "good" });
        },
      },
    );

  const doDelete = () =>
    del.mutate(r.supplier_request_id, {
      onSuccess: () => {
        setDeleting(false);
        toast({ title: "Request deleted" });
        onClose();
      },
    });

  const footer = canDecide ? (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="secondary" onClick={() => setRejecting(true)}>
        Reject
      </Button>
      <Button onClick={doAccept} loading={accept.isPending} disabled={!!problem}>
        Accept figure
      </Button>
    </div>
  ) : (
    <div className="flex flex-wrap justify-end gap-2">
      {canDelete && (
        <Button variant="ghost" onClick={() => setDeleting(true)}>
          Delete
        </Button>
      )}
      {canResend && (
        <Button variant="secondary" onClick={() => setResending(true)}>
          Send again
        </Button>
      )}
    </div>
  );

  return (
    <>
      <Drawer open onClose={onClose} title={r.material} subtitle={`${r.supplier_name ?? r.supplier_email} · ${studyLabel(r)}`} size="md" footer={footer}>
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
            <span className="text-xs text-muted">
              {r.status === "expired" ? "The link ran out without an answer." : `Link valid until ${when(r.link_expires_at)}.`}
            </span>
          </div>

          {link && (
            <section className={cn(panel, "space-y-2 p-3")} aria-label="Supplier link">
              <p className="text-xs font-medium text-muted">Supplier link (shown once)</p>
              <p className="break-all font-mono text-xs text-ink" data-testid="supplier-link">
                {link}
              </p>
              {mailNote && <p className="text-xs text-warn">{mailNote}</p>}
              <Button size="sm" variant="secondary" icon={<Copy aria-hidden className="size-4" />} onClick={copy}>
                Copy link
              </Button>
            </section>
          )}

          <dl className="space-y-1.5">
            <Row label="Wanted">
              {boundaryLabel(r.study?.boundary)} figure per {unitLabel(r.unit)}
            </Row>
            <Row label="Supplier">
              {r.supplier_name ? `${r.supplier_name} · ` : ""}
              {r.supplier_email}
            </Row>
            <Row label="Due">{r.due_date ? new Date(`${r.due_date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—"}</Row>
            <Row label="Sent">
              {when(r.sent_at)}
              {r.requested_by ? ` by ${r.requested_by.name}` : ""}
            </Row>
            <Row label="Opened">{when(r.opened_at)}</Row>
            <Row label="Received">{when(r.received_at)}</Row>
            {r.decided_at && (
              <Row label={r.status === "accepted" ? "Accepted" : "Rejected"}>
                {when(r.decided_at)}
                {r.decided_by ? ` by ${r.decided_by.name}` : ""}
                {r.decision_comment ? ` · ${r.decision_comment}` : ""}
              </Row>
            )}
          </dl>

          {r.reply && (
            <section className="space-y-3" aria-label="Supplier's answer">
              <h3 className="text-sm font-semibold text-ink">What the supplier sent</h3>
              <dl className="space-y-1.5">
                {r.reply.product_name && <Row label="Product">{r.reply.product_name}</Row>}
                <Row label="Value">{r.reply.value_kgco2e != null ? `${r.reply.value_kgco2e.toLocaleString("en-GB", { maximumFractionDigits: 4 })} kgCO₂e per ${unitLabel(r.reply.unit ?? r.unit)}` : "Not typed"}</Row>
                <Row label="Boundary">
                  {boundaryLabel(r.reply.boundary)}
                  {r.reply.boundary_mismatch && (
                    <Badge tone="warn" className="ml-2">
                      Differs from the footprint
                    </Badge>
                  )}
                </Row>
                {r.reply.standard && <Row label="Standard">{r.reply.standard}</Row>}
                {(r.reply.reference_start || r.reply.reference_end) && (
                  <Row label="Period">
                    {r.reply.reference_start ?? "?"} to {r.reply.reference_end ?? "?"}
                  </Row>
                )}
                {r.reply.verifier && <Row label="Verifier">{r.reply.verifier}</Row>}
                {r.reply.note && <Row label="Note">{r.reply.note}</Row>}
                {r.reply.file && (
                  <Row label="File">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <FileText aria-hidden className="size-4 text-muted" />
                      {r.reply.file.name}
                      <Button size="sm" variant="ghost" icon={<Download aria-hidden className="size-4" />} onClick={download} loading={downloading}>
                        Download
                      </Button>
                      {canDecide && (
                        <Tooltip content={aiAvailable ? "Read the value, boundary, period and validity from the file." : "The AI service isn't reachable."}>
                          <Button size="sm" variant="secondary" icon={<Sparkles aria-hidden className="size-4" />} onClick={readFile} loading={reader.isPending} disabled={!aiAvailable}>
                            Read with AI
                          </Button>
                        </Tooltip>
                      )}
                    </span>
                  </Row>
                )}
              </dl>
              {read && (
                <div className="space-y-2" data-testid="ai-read">
                  <p className="text-xs text-muted">
                    Read from {read.file_name}
                    {read.kind === "pact" ? " (PACT file, no AI needed)" : " by the AI"}. Hover a chip for where it came from; amber chips are under {LOW_CONFIDENCE}% and need a look.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {AI_CHIP_FIELDS.filter(({ key }) => read.fields[key]?.value != null).map(({ key, label }) => (
                      <AiChip key={key} label={label} text={chipText(key, read.fields[key])} confidence={read.fields[key].confidence} reason={read.fields[key].reason} />
                    ))}
                  </div>
                  {[...read.problems, ...read.warnings].map((w) => (
                    <Callout key={w} tone="warn">
                      {w}
                    </Callout>
                  ))}
                </div>
              )}
            </section>
          )}

          {scope3Note?.id === r.supplier_request_id && (
            <Callout tone="warn" title="Not added for Scope 3">
              <p data-testid="scope3-accept-note">{scope3Note.text}</p>
              <Link to="/suppliers" className={cn("mt-2 inline-block text-sm font-medium text-accent underline", focusRing)}>
                Open Suppliers
              </Link>
            </Callout>
          )}

          {canDecide && (
            <section className="space-y-4" aria-label="Review and accept">
              <h3 className="text-sm font-semibold text-ink">Accept as a supplier factor</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField label={`kgCO₂e per ${unitLabel(r.unit)}`} value={form.value_kgco2e} onChange={(v) => set({ value_kgco2e: v })} min={0} step={0.0001} required />
                <Select<string>
                  label="Boundary"
                  value={form.boundary}
                  onChange={(v) => {
                    set({ boundary: (v as AcceptForm["boundary"]) ?? null });
                    setConfirmBoundary(false);
                  }}
                  options={BOUNDARIES.map((b) => ({ value: b, label: BOUNDARY_LABEL[b] }))}
                  placeholder="Not stated"
                />
              </div>
              {mismatch && (
                <Callout tone="warn" title="Different system boundary">
                  <p>
                    The figure is {boundaryLabel(form.boundary).toLowerCase()} but this footprint is {boundaryLabel(r.study?.boundary).toLowerCase()}. It covers different stages, so it isn't comparable as it is.
                  </p>
                  <label className="mt-2 flex items-start gap-2 text-sm text-ink">
                    <input type="checkbox" className="mt-0.5" checked={confirmBoundary} onChange={(e) => setConfirmBoundary(e.target.checked)} data-testid="confirm-boundary" />
                    Accept it anyway and record the boundary on the factor
                  </label>
                  {s3.needsConfirm && <p className="mt-2 text-sm">Confirming also adds it as the supplier's Scope 3 figure, with its boundary recorded.</p>}
                </Callout>
              )}
              {!mismatch && s3.needsConfirm && (
                <Callout tone="info" title="Scope 3 takes cradle-to-gate figures">
                  <p>
                    This figure is {boundaryLabel(s3.boundary).toLowerCase()}. The footprint takes it as it is, but it is only added as the supplier's Scope 3 figure (Category 1) if you confirm the boundary.
                  </p>
                  <label className="mt-2 flex items-start gap-2 text-sm text-ink">
                    <input type="checkbox" className="mt-0.5" checked={confirmBoundary} onChange={(e) => setConfirmBoundary(e.target.checked)} data-testid="confirm-scope3-boundary" />
                    Also add it as the supplier's Scope 3 figure and record the boundary
                  </label>
                </Callout>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Standard" value={form.standard} onChange={(v) => set({ standard: v })} placeholder="e.g. ISO 14067" />
                <Select<string> label="GWP set" value={form.gwp_set} onChange={(v) => set({ gwp_set: v === "AR5" ? "AR5" : "AR6" })} options={[{ value: "AR6", label: "AR6" }, { value: "AR5", label: "AR5" }]} />
                <DateField label="Valid from" value={form.valid_from} onChange={(v) => set({ valid_from: v })} />
                <DateField label="Valid to" value={form.valid_to} onChange={(v) => set({ valid_to: v })} />
              </div>
              <TextField label="Verifier" value={form.verifier} onChange={(v) => set({ verifier: v })} placeholder="Third-party verifier, if any" />
              <Textarea label="Comment" value={form.comment} onChange={(v) => set({ comment: v })} rows={2} placeholder="Optional, kept in the footprint's history" />
              {accept.isError && (
                <Callout tone="warn">{isBoundaryRefusal(accept.error) ? "Confirm the boundary above to accept this figure." : errorMessage(accept.error, "The figure couldn't be accepted.")}</Callout>
              )}
              {problem && <p className="text-xs text-muted">{problem}</p>}
            </section>
          )}

          <details className="text-sm">
            <summary className={cn("cursor-pointer text-muted", focusRing)}>Message sent to the supplier</summary>
            <p className="mt-2 font-medium text-ink">{r.subject}</p>
            <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-ink">{r.message}</pre>
          </details>
        </div>
      </Drawer>

      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject the supplier's figure"
        description="The supplier isn't told; send the request again with a note if you need a different figure."
        primaryAction={{ label: "Reject", onClick: doReject, loading: reject.isPending, disabled: !rejectComment.trim() }}
        tone="destructive"
        error={reject.isError ? errorMessage(reject.error, "The figure couldn't be rejected.") : undefined}
      >
        <Textarea label="Reason" value={rejectComment} onChange={setRejectComment} rows={3} required autoFocus />
      </Modal>

      <Modal
        open={resending}
        onClose={() => setResending(false)}
        title="Send the request again?"
        description={`A new link goes to ${r.supplier_email} with the same message; the old link stops working.`}
        primaryAction={{ label: "Send again", onClick: doResend, loading: resend.isPending }}
        error={resend.isError ? errorMessage(resend.error, "The request couldn't be resent.") : undefined}
      >
        <pre className="whitespace-pre-wrap font-sans text-sm text-ink" data-testid="resend-message">
          {r.message}
        </pre>
      </Modal>

      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this request?"
        description="The supplier's link stops working. Nothing was received, so nothing else is lost."
        primaryAction={{ label: "Delete", onClick: doDelete, loading: del.isPending }}
        tone="destructive"
        error={del.isError ? errorMessage(del.error, "The request couldn't be deleted.") : undefined}
      />
    </>
  );
}
