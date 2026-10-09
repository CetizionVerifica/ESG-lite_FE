import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, FileText } from "lucide-react";
import {
  Badge,
  Button,
  DocumentViewer,
  Drawer,
  EntityAuditTimeline,
  SkeletonText,
  StatusPill,
  type ViewerFile,
  cn,
  emissionsParts,
  focusRing,
  formatBytes,
  formatDate,
  formatEmissions,
  formatNumber,
  fromEmissionDocument,
} from "../../../ui";
import type { EmissionStatus } from "../../../services/emissionService";
import { type LedgerDocument, useColumnConfig, useDocuments, useFactor } from "../api";
import { EditForm } from "./EditForm";
import { type FactorSnapshot, type LedgerRow, activityFields, quantityOf, rowPeriodLabel } from "../logic";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(8rem,40%)_1fr] gap-3 border-b border-line py-1.5 text-sm last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function RecordDrawer({
  row,
  fera,
  status,
  onClose,
  onApprove,
  onReject,
  onEdited,
}: {
  row: LedgerRow | null;
  fera: LedgerRow | undefined;
  /** Status to show (an approval in its undo window shows as approved). */
  status: EmissionStatus | undefined;
  onClose: () => void;
  onApprove: (row: LedgerRow) => void;
  onReject: (row: LedgerRow) => void;
  /** After a saved edit. */
  onEdited?: () => void;
}) {
  const open = row !== null;
  const shown = status ?? row?.status;
  const [editing, setEditing] = useState(false);
  const id = row?.pk_id;
  useEffect(() => setEditing(false), [id]);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      title={`${editing ? "Edit · " : ""}${row?.category?.category_name ?? "Entry"}`}
      subtitle={row ? `${row.site?.name ?? "—"} · ${rowPeriodLabel(row)}` : undefined}
      headerActions={shown ? <StatusPill status={shown} /> : undefined}
      footer={
        row && !editing ? (
          <>
            <Button onClick={() => setEditing(true)}>Edit</Button>
            {shown === "pending" && (
              <>
                <Button variant="danger" onClick={() => onReject(row)}>
                  Reject
                </Button>
                <Button variant="primary" onClick={() => onApprove(row)}>
                  Approve
                </Button>
              </>
            )}
          </>
        ) : undefined
      }
    >
      {row &&
        (editing ? (
          <EditForm
            row={row}
            onCancel={() => setEditing(false)}
            onDone={() => {
              setEditing(false);
              onEdited?.();
            }}
          />
        ) : (
          <Body row={row} fera={fera} />
        ))}
    </Drawer>
  );
}

function Body({ row, fera }: { row: LedgerRow; fera: LedgerRow | undefined }) {
  const config = useColumnConfig(row.site?.site_id, row.category?.category_id);
  const fields = activityFields(row, config.data ?? undefined);
  const total = emissionsParts(row.total_emission);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-num text-3xl font-semibold tabular-nums" data-testid="drawer-total">
          {total.value} <span className="text-base font-normal text-muted">{total.unit}</span>
        </p>
        <p className="mt-1 text-sm text-muted">
          Submitted by {row.created_by?.name ?? "—"} on {formatDate(row.created_at)}
          {row.reviewed_by && row.status !== "pending" && ` · reviewed by ${row.reviewed_by.name}`}
        </p>
        {row.status === "rejected" && row.review_comment && (
          <p className="mt-2 rounded-control bg-bad-soft px-3 py-2 text-sm text-bad">Rejected: {row.review_comment}</p>
        )}
      </div>

      <Section title="Activity">
        {config.isPending && !!row.site && !!row.category ? (
          <SkeletonText lines={3} />
        ) : (
          <dl>
            {fields.map((f) => (
              <Row key={f.key} label={f.label}>
                {f.numeric ? <span className="font-num tabular-nums">{f.value}</span> : f.value}
              </Row>
            ))}
            {row.activity_data_unit && <Row label="Unit">{row.activity_data_unit}</Row>}
            {fera && (
              <Row label="FERA (fuel- and energy-related)">
                <span className="font-num tabular-nums">+{formatEmissions(fera.total_emission)}</span>
              </Row>
            )}
            {fields.length === 0 && <p className="text-sm text-muted">No activity values were entered.</p>}
          </dl>
        )}
      </Section>

      <Section title="Calculation">
        <Calculation row={row} quantity={quantityOf(fields)} />
      </Section>

      <Section title="Evidence">
        <Evidence emissionId={row.pk_id} />
      </Section>

      <Section title="History">
        <EntityAuditTimeline entityType="emission" entityId={row.pk_id} />
      </Section>
    </div>
  );
}

function Calculation({ row, quantity }: { row: LedgerRow; quantity: number | null }) {
  const snapshot = row.emission_factor_snapshot ?? null;
  // Rows saved before snapshots existed: ask the server which factor matches.
  const fallback = useFactor(snapshot ? null : row.pk_id);
  const factor: FactorSnapshot | null = snapshot ?? fallback.data ?? null;
  if (!snapshot && fallback.isPending) return <SkeletonText lines={2} />;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-num text-sm tabular-nums" data-testid="calculation">
        <span>{quantity === null ? "—" : formatNumber(quantity, 2)} {row.activity_data_unit ?? ""}</span>
        <span aria-hidden className="text-muted">×</span>
        <span className="sr-only">times</span>
        <span>{factor ? `${formatNumber(factor.factor_value, 6)} per ${factor.denominator_unit}` : "factor unknown"}</span>
        <span aria-hidden className="text-muted">=</span>
        <span className="sr-only">equals</span>
        <span className="font-semibold">{formatEmissions(row.total_emission)}</span>
      </div>
      {factor ? (
        <p className="text-sm text-muted">
          Factor “{factor.emission_category_name}”, {factor.source || "source not recorded"}, {factor.year}
          {!snapshot && " (current match; this entry has no saved factor snapshot)"}
        </p>
      ) : (
        <p className="text-sm text-muted">{fallback.isError ? "Couldn't load the factor." : "No factor matched this entry."}</p>
      )}
    </div>
  );
}

function Evidence({ emissionId }: { emissionId: number }) {
  const docs = useDocuments(emissionId);
  const [viewing, setViewing] = useState<ViewerFile | null>(null);
  if (docs.isPending) return <SkeletonText lines={2} />;
  if (docs.isError)
    return (
      <p className="text-sm text-bad">
        Couldn't load documents.{" "}
        <button type="button" className={cn("underline", focusRing)} onClick={() => void docs.refetch()}>
          Try again
        </button>
      </p>
    );
  if (docs.data.length === 0) return <p className="text-sm text-muted">No documents attached.</p>;
  const files = docs.data.map((d) => ({ doc: d, file: fromEmissionDocument(d) }));
  return (
    <>
      <ul className="divide-y divide-line rounded-control border border-line">
        {files.map(({ doc, file }) => (
          <DocumentRow key={doc.document_id} doc={doc} onOpen={() => setViewing(file)} url={file.url} />
        ))}
      </ul>
      <DocumentViewer
        open={viewing !== null}
        onClose={() => setViewing(null)}
        file={viewing}
        files={files.map((f) => f.file)}
        onNavigate={setViewing}
      />
    </>
  );
}

function DocumentRow({ doc, url, onOpen }: { doc: LedgerDocument; url: string; onOpen: () => void }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <FileText aria-hidden className="size-4 shrink-0 text-muted" />
      <button type="button" onClick={onOpen} className={cn("min-w-0 flex-1 truncate text-left hover:underline", focusRing)}>
        {doc.original_name}
      </button>
      {doc.ai_invoice_id != null && (
        <Badge tone="info" className="shrink-0">
          AI
        </Badge>
      )}
      <span className="shrink-0 text-xs text-muted">{formatBytes(doc.file_size)}</span>
      {url && (
        <a href={url} target="_blank" rel="noreferrer" aria-label={`Open original ${doc.original_name}`} className={cn("shrink-0 text-muted hover:text-ink", focusRing)}>
          <ExternalLink aria-hidden className="size-4" />
        </a>
      )}
    </li>
  );
}
