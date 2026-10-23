import { useState } from "react";
import { Pencil } from "lucide-react";
import { FileText } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  DataQualityBadge,
  DocumentViewer,
  Drawer,
  EmptyState,
  EntityAuditTimeline,
  FileDrop,
  type FileDropItem,
  SkeletonText,
  StatusPill,
  type ViewerFile,
  cn,
  formatBytes,
  formatDate,
  formatDateTime,
  formatEntryEmissions,
  formatNumber,
  fromEmissionDocument,
  useToast,
} from "../../../ui";
import { useAddEvidence, useEntryDocuments, useLabelConfig, useRemoveEvidence, useUpdateEntry } from "../api";
import { useCalcDetailForSite } from "../../../lib/useCalcDetail";
import { type EntryUpdate, canEdit, saveErrorMessage } from "../edit";
import { EDIT_FORM_ID, EditEntryForm } from "./EditEntryForm";
import { type EntryRow, activityFields, entryQuantity, keyActivity, periodText, quantityDecimals } from "../logic";
import type { EmissionDocument } from "../../../services/documentService";
import { feraSubLabel } from "../../../lib/scope3/fera";
import { rowQuality } from "../../../lib/scope3/dq";

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2", className)}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{children}</dd>
    </div>
  );
}

const EVIDENCE_TYPES = ["application/pdf", "image/*", ".xlsx", ".xls", ".csv", ".doc", ".docx"];

/**
 * The entry's documents. While it can still change (pending, or sent back) the User adds
 * and removes files here; each change is saved at once, apart from the entry itself.
 */
function Evidence({ entry, onOpen }: { entry: EntryRow; onOpen: (file: ViewerFile, files: ViewerFile[]) => void }) {
  const docs = useEntryDocuments(entry.pk_id);
  const add = useAddEvidence(entry.pk_id);
  const remove = useRemoveEvidence(entry.pk_id);
  const { toast } = useToast();
  const [adding, setAdding] = useState<FileDropItem[]>([]);
  const [confirming, setConfirming] = useState<number | null>(null);
  const changeable = canEdit(entry);
  const list: EmissionDocument[] = docs.data ?? [];
  const files = list.map(fromEmissionDocument);

  const upload = (picked: File[]) => {
    const items = picked.map((file, i): FileDropItem => ({ id: `${Date.now()}-${i}`, file, status: "uploading" }));
    setAdding((cur) => [...cur, ...items]);
    add.mutate(picked, {
      onSuccess: () => {
        setAdding((cur) => cur.filter((x) => !items.includes(x)));
        toast({ title: picked.length === 1 ? "File attached" : `${picked.length} files attached`, tone: "good" });
      },
      onError: () =>
        setAdding((cur) => cur.map((x) => (items.includes(x) ? { ...x, status: "error", error: "Couldn't attach this file. Try again." } : x))),
    });
  };

  const removeFile = (doc: EmissionDocument) =>
    remove.mutate(doc.document_id, {
      onSuccess: () => {
        setConfirming(null);
        toast({ title: `Removed ${doc.original_name}`, tone: "good" });
      },
      onError: () => toast({ title: "Couldn't remove the file. Try again.", tone: "bad" }),
    });

  return (
    <Section title="Evidence">
      {docs.isPending ? (
        <SkeletonText lines={2} />
      ) : docs.isError ? (
        <EmptyState compact variant="error" title="Couldn't load the documents." action={<Button size="sm" onClick={() => void docs.refetch()}>Try again</Button>} />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">No documents attached.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((doc, i) => {
            const f = files[i];
            const asking = confirming === doc.document_id;
            return (
              <li key={doc.document_id} className="rounded-control border border-line p-2.5">
                <div className="flex items-center gap-3">
                  <FileText aria-hidden className="size-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{f.name}</p>
                    {f.size ? <p className="text-xs text-muted">{formatBytes(f.size)}</p> : null}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => onOpen(f, files)} aria-label={`Open ${f.name}`}>
                    Open
                  </Button>
                  {changeable && !asking && (
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(doc.document_id)} aria-label={`Remove ${f.name}`}>
                      Remove
                    </Button>
                  )}
                </div>
                {asking && (
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-2" role="group" aria-label={`Remove ${f.name}?`}>
                    <p className="mr-auto text-sm text-ink">Remove this file from the entry?</p>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)} disabled={remove.isPending}>
                      Keep
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => removeFile(doc)} loading={remove.isPending}>
                      Remove file
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {changeable && !docs.isError && (
        <FileDrop
          label="Add evidence"
          help={
            entry.status === "rejected"
              ? "PDF, image or spreadsheet, up to 10 MB each. Files are saved straight away; resubmit the entry when you're done."
              : "PDF, image or spreadsheet, up to 10 MB each. Files are saved straight away."
          }
          accept={EVIDENCE_TYPES}
          maxSize={10 * 1024 * 1024}
          multiple
          items={adding}
          onAdd={upload}
          onRemove={(id) => setAdding((cur) => cur.filter((x) => x.id !== id || x.status === "uploading"))}
          disabled={add.isPending}
        />
      )}
    </Section>
  );
}

/**
 * One entry: status, calculation, what was entered, evidence and history.
 * Pending and rejected entries can be edited here; saving sends them (back) for review.
 */
export function EntryDrawer({ entry: current, onClose }: { entry: EntryRow | null; onClose: () => void }) {
  // Keep showing the last entry while the drawer slides out.
  const [entry, setEntry] = useState(current);
  const [opened, setOpened] = useState(current);
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  if (current !== opened) {
    setOpened(current);
    if (current) {
      setEntry(current);
      setEditing(false);
      setSaveError(null);
    }
  }
  const update = useUpdateEntry();
  const { toast } = useToast();

  const save = (body: EntryUpdate) => {
    if (!entry) return;
    setSaveError(null);
    update.mutate(
      { id: entry.pk_id, update: body },
      {
        onSuccess: () => {
          toast({ title: entry.status === "rejected" ? "Resubmitted for review" : "Changes saved", tone: "good" });
          onClose();
        },
        onError: (e) => setSaveError(saveErrorMessage(e)),
      },
    );
  };

  const editable = entry !== null && canEdit(entry);
  const footer = !editable ? undefined : editing ? (
    <>
      <Button variant="ghost" onClick={() => setEditing(false)} disabled={update.isPending}>
        Cancel
      </Button>
      <Button variant="primary" type="submit" form={EDIT_FORM_ID} loading={update.isPending}>
        {entry.status === "rejected" ? "Resubmit" : "Save changes"}
      </Button>
    </>
  ) : (
    <Button variant="primary" icon={<Pencil aria-hidden className="size-4" />} onClick={() => setEditing(true)}>
      {entry.status === "rejected" ? "Fix and resubmit" : "Edit entry"}
    </Button>
  );

  const config = useLabelConfig(entry?.site?.site_id, entry?.category?.category_id);
  const [viewing, setViewing] = useState<ViewerFile | null>(null);
  const [viewerFiles, setViewerFiles] = useState<ViewerFile[]>([]);
  const openFile = (file: ViewerFile, files: ViewerFile[]) => {
    setViewerFiles(files);
    setViewing(file);
  };

  const quantity = entry ? entryQuantity(entry) : null;
  // SE-1: a User sees the entry and its total; the calculation (category match, method and data quality,
  // Category 3 rows) is for Managers and above (or a company set to full detail).
  const calcDetail = useCalcDetailForSite(entry?.site?.site_id ?? null);
  const fields = entry ? activityFields(entry.activity_data, config.data ?? undefined, { plain: !calcDetail }) : [];
  const quality = entry && calcDetail ? rowQuality(entry) : null;

  return (
    <>
      <Drawer
        open={current !== null}
        onClose={onClose}
        footer={footer}
        size="md"
        title={entry?.category?.category_name ?? "Entry"}
        subtitle={entry ? `${entry.site?.name ?? "Site"} · ${periodText(entry)} · #${entry.pk_id}` : undefined}
      >
        {entry && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={entry.status} />
              {entry.status !== "pending" && entry.reviewed_by?.name && entry.reviewed_at && (
                <span className="text-xs text-muted">
                  {entry.status === "approved" ? "Approved" : "Rejected"} by {entry.reviewed_by.name} ·{" "}
                  {formatDate(entry.reviewed_at)}
                </span>
              )}
            </div>

            {entry.status === "rejected" && (
              <Callout tone="warn" title="Sent back to you">
                {entry.review_comment ? <q>{entry.review_comment}</q> : "No reason was given."}
              </Callout>
            )}

            {editing ? (
              <>
                <EditEntryForm entry={entry} saveError={saveError} onSubmit={save} />
                <Evidence entry={entry} onOpen={openFile} />
              </>
            ) : (
              <>
                <Section title={calcDetail ? "Calculation" : "Entry"}>
                  <dl className="divide-y divide-line rounded-control border border-line px-3">
                    {calcDetail && <Row label="Emission category">{keyActivity(entry) ?? "—"}</Row>}
                    {calcDetail && (
                      <Row label="Quantity">
                        <span className="font-num tabular-nums">
                          {quantity === null ? "—" : formatNumber(quantity, quantityDecimals(quantity))} {entry.activity_data_unit ?? ""}
                        </span>
                      </Row>
                    )}
                    <Row label="Emissions">
                      <span className="font-num font-semibold tabular-nums">{formatEntryEmissions(Number(entry.total_emission))}</span>
                    </Row>
                    {quality?.show && (
                      <>
                        <Row label="How it was calculated">
                          <span data-testid="entry-method">{quality.method}</span>
                          {quality.estimate && (
                            <Badge tone="warn" className="ml-1.5">
                              Estimate
                            </Badge>
                          )}
                        </Row>
                        <Row label="Data quality">
                          <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            <DataQualityBadge dq={quality.dq} />
                            {quality.dataType && <span className="text-xs text-muted">{quality.dataType} data</span>}
                          </span>
                        </Row>
                      </>
                    )}
                    {calcDetail && entry.scope3_sub && <Row label="Part of">{feraSubLabel(entry.scope3_sub)}</Row>}
                    {entry.supplier && <Row label="Supplier">{entry.supplier.name}</Row>}
                    {calcDetail && entry.fera?.map((f) => (
                      <Row key={f.pk_id} label={feraSubLabel(f.scope3_sub)}>
                        <span className="font-num tabular-nums">{formatEntryEmissions(Number(f.total_emission))}</span>
                      </Row>
                    ))}
                    <Row label="Filed">{entry.reporting_period === "yearly" ? `Yearly · ${periodText(entry)}` : `Monthly · ${periodText(entry)}`}</Row>
                    <Row label="Submitted">
                      {formatDateTime(entry.created_at)}
                      {entry.created_by?.name ? ` · ${entry.created_by.name}` : ""}
                    </Row>
                  </dl>
                </Section>

                <Section title="What was entered">
                  {config.isPending && config.fetchStatus !== "idle" ? (
                    <SkeletonText lines={3} />
                  ) : fields.length === 0 ? (
                    <p className="text-sm text-muted">No activity details on this entry.</p>
                  ) : (
                    <dl className="divide-y divide-line rounded-control border border-line px-3">
                      {fields.map((f) => (
                        <Row key={f.key} label={f.key}>
                          {f.value}
                        </Row>
                      ))}
                      {/* The unit picked beside the quantity is stored apart from the form's fields. */}
                      {entry.activity_data_unit && <Row label="Unit">{entry.activity_data_unit}</Row>}
                    </dl>
                  )}
                </Section>

                <Evidence entry={entry} onOpen={openFile} />

                <Section title="History">
                  <EntityAuditTimeline entityType="emission" entityId={entry.pk_id} />
                </Section>
              </>
            )}
          </div>
        )}
      </Drawer>
      <DocumentViewer open={viewing !== null} onClose={() => setViewing(null)} file={viewing} files={viewerFiles} onNavigate={setViewing} />
    </>
  );
}
