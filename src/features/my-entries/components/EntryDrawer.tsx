import { useState } from "react";
import { Pencil } from "lucide-react";
import { FileText } from "lucide-react";
import {
  Button,
  Callout,
  DocumentViewer,
  Drawer,
  EmptyState,
  EntityAuditTimeline,
  SkeletonText,
  StatusPill,
  type ViewerFile,
  cn,
  formatBytes,
  formatDate,
  formatDateTime,
  formatEmissions,
  formatNumber,
  fromEmissionDocument,
  useToast,
} from "../../../ui";
import { useEntryDocuments, useLabelConfig, useUpdateEntry } from "../api";
import { type EntryUpdate, canEdit, saveErrorMessage } from "../edit";
import { EDIT_FORM_ID, EditEntryForm } from "./EditEntryForm";
import { type EntryRow, activityFields, keyActivity, periodText, quantityOf } from "../logic";

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
  const docs = useEntryDocuments(entry?.pk_id ?? null);
  const [viewing, setViewing] = useState<ViewerFile | null>(null);

  const files = (docs.data ?? []).map(fromEmissionDocument);
  const quantity = entry ? quantityOf(entry.activity_data) : null;
  const fields = entry ? activityFields(entry.activity_data, config.data ?? undefined) : [];

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
              <EditEntryForm entry={entry} saveError={saveError} onSubmit={save} />
            ) : (
              <>
                <Section title="Calculation">
                  <dl className="divide-y divide-line rounded-control border border-line px-3">
                    <Row label="Emission category">{keyActivity(entry) ?? "—"}</Row>
                    <Row label="Quantity">
                      <span className="font-num tabular-nums">
                        {quantity === null ? "—" : formatNumber(quantity, Number.isInteger(quantity) ? 0 : 2)} {entry.activity_data_unit ?? ""}
                      </span>
                    </Row>
                    <Row label="Emissions">
                      <span className="font-num font-semibold tabular-nums">{formatEmissions(Number(entry.total_emission))}</span>
                    </Row>
                    {entry.fera && (
                      <Row label="FERA (upstream fuel and energy)">
                        <span className="font-num tabular-nums">{formatEmissions(Number(entry.fera.total_emission))}</span>
                      </Row>
                    )}
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
                    </dl>
                  )}
                </Section>

                <Section title="Evidence">
                  {docs.isPending ? (
                    <SkeletonText lines={2} />
                  ) : docs.isError ? (
                    <EmptyState compact variant="error" title="Couldn't load the documents." action={<Button size="sm" onClick={() => void docs.refetch()}>Try again</Button>} />
                  ) : files.length === 0 ? (
                    <p className="text-sm text-muted">No documents attached.</p>
                  ) : (
                    <ul className="space-y-2">
                      {files.map((f, i) => (
                        <li key={`${f.url}-${i}`} className="flex items-center gap-3 rounded-control border border-line p-2.5">
                          <FileText aria-hidden className="size-4 shrink-0 text-muted" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-ink">{f.name}</p>
                            {f.size ? <p className="text-xs text-muted">{formatBytes(f.size)}</p> : null}
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => setViewing(f)} aria-label={`Open ${f.name}`}>
                            Open
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title="History">
                  <EntityAuditTimeline entityType="emission" entityId={entry.pk_id} />
                </Section>
              </>
            )}
          </div>
        )}
      </Drawer>
      <DocumentViewer open={viewing !== null} onClose={() => setViewing(null)} file={viewing} files={files} onNavigate={setViewing} />
    </>
  );
}
