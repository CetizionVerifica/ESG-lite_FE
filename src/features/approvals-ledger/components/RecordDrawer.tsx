import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, FileText } from "lucide-react";
import { useTheme } from "../../../theme";
import { type CheckContext, checkLines, factorYearFor, readChecks } from "../../../lib/scope3/checks";
import {
  Badge,
  Button,
  CHECK_ICONS,
  ChartFrame,
  DocumentViewer,
  Drawer,
  EntityAuditTimeline,
  SkeletonText,
  SUGGESTED_REASONS,
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
import { type LedgerDocument, useColumnConfig, useDocuments, useEntryHistory, useFactor } from "../api";
import { EditForm } from "./EditForm";
import { deflatorLine, fxLine } from "../../../lib/scope3/spend";
import { type FactorSnapshot, type LedgerRow, activityFields, formatFactorValue, importProvenance, matchedByText, quantityOf, rowMonth, rowPeriodLabel } from "../logic";

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
  onApproveNext,
  onReject,
  onEdited,
  checkContext,
}: {
  row: LedgerRow | null;
  fera: LedgerRow | undefined;
  /** Status to show (an approval in its undo window shows as approved). */
  status: EmissionStatus | undefined;
  onClose: () => void;
  onApprove: (row: LedgerRow) => void;
  /** Approvals: approve and open the next entry waiting (single-entry review, S3-15). */
  onApproveNext?: (row: LedgerRow) => void;
  /** Reject, with a suggested reason already picked when one of the drawer's reason chips was used. */
  onReject: (row: LedgerRow, reason?: string) => void;
  /** Values the check copy names (the company's change limit). */
  checkContext?: CheckContext;
  /** After a saved edit, with the saved entry when the server sends it back. */
  onEdited?: (saved?: Partial<LedgerRow>) => void;
}) {
  const open = row !== null;
  const shown = status ?? row?.status;
  const [editing, setEditing] = useState(false);
  const id = row?.pk_id;
  useEffect(() => setEditing(false), [id]);
  return (
    <Drawer
      open={open}
      // Esc or the backdrop while editing leaves the form, not the entry, so edits aren't dropped silently.
      onClose={editing ? () => setEditing(false) : onClose}
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
                <div role="group" aria-label="Reject with a reason" className="mr-auto flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted">Reject reasons:</span>
                  {SUGGESTED_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => onReject(row, reason)}
                      className={cn("rounded-chip border border-line px-2 py-0.5 text-xs text-muted hover:text-ink", focusRing)}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                <Button variant="danger" onClick={() => onReject(row)}>
                  Reject
                </Button>
                {onApproveNext ? (
                  <Button variant="primary" onClick={() => onApproveNext(row)}>
                    Approve and next
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => onApprove(row)}>
                    Approve
                  </Button>
                )}
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
            onDone={(saved) => {
              setEditing(false);
              onEdited?.(saved);
            }}
          />
        ) : (
          <Body row={row} fera={fera} status={shown} checkContext={checkContext} />
        ))}
    </Drawer>
  );
}

function Body({ row, fera, status, checkContext }: { row: LedgerRow; fera: LedgerRow | undefined; status: EmissionStatus | undefined; checkContext?: CheckContext }) {
  const config = useColumnConfig(row.site?.site_id, row.category?.category_id);
  const fields = activityFields(row, config.data ?? undefined);
  const total = emissionsParts(Number(row.total_emission));

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
        <Provenance row={row} />
        {row.status === "rejected" && row.review_comment && (
          <p className="mt-2 rounded-control bg-bad-soft px-3 py-2 text-sm text-bad">Rejected: {row.review_comment}</p>
        )}
      </div>

      {status === "pending" && row.checks !== undefined && (
        <Section title="Why held">
          <WhyHeld row={row} context={checkContext} />
        </Section>
      )}

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
                <span className="font-num tabular-nums">+{formatEmissions(Number(fera.total_emission))}</span>
              </Row>
            )}
            {fields.length === 0 && <p className="text-sm text-muted">No activity values were entered.</p>}
          </dl>
        )}
      </Section>

      <Section title="Calculation">
        <Calculation row={row} quantity={quantityOf(fields)} />
      </Section>

      <MonthHistory row={row} />

      <Section title="Evidence">
        <Evidence emissionId={row.pk_id} />
      </Section>

      <Section title="History">
        <EntityAuditTimeline entityType="emission" entityId={row.pk_id} />
      </Section>
    </div>
  );
}

/** XI5: where an imported row came from in the sheet and how the smart import matched it. */
function Provenance({ row }: { row: LedgerRow }) {
  const p = importProvenance(row);
  if (!p) return null;
  return (
    <p className="mt-1 text-sm text-muted" data-testid="drawer-provenance">
      {p.row_ref && (
        <>
          Imported from <span className="font-num text-ink">{p.row_ref}</span>
        </>
      )}
      {p.row_ref && p.meta && " · "}
      {p.meta && <>Matched by: {matchedByText(p.meta)}</>}
    </p>
  );
}

function Calculation({ row, quantity }: { row: LedgerRow; quantity: number | null }) {
  const snapshot = row.emission_factor_snapshot ?? null;
  // Rows saved before snapshots existed: ask the server which factor matches.
  const fallback = useFactor(snapshot ? null : row.pk_id);
  const factor: FactorSnapshot | null = snapshot ?? fallback.data ?? null;
  if (!snapshot && fallback.isPending) return <SkeletonText lines={2} />;
  // S3-5: a spend row shows the amount spent and the stored rate (× deflator) before the factor.
  const fx = row.fx ?? null;
  const deflator = snapshot?.deflator ?? null;
  const spent = fx ? Number(String(row.activity_data?.spent_value ?? "").replace(/,/g, "")) : NaN;
  const amount = fx && Number.isFinite(spent) && spent > 0 ? spent : quantity;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-num text-sm tabular-nums" data-testid="calculation">
        <span>{amount === null ? "—" : formatNumber(amount, 2)} {fx ? fx.currency : (row.activity_data_unit ?? "")}</span>
        <span aria-hidden className="text-muted">×</span>
        <span className="sr-only">times</span>
        {fx && (
          <>
            <span>
              {formatFactorValue({ factor_value: fx.rate * (deflator ? deflator.base_index / deflator.spend_index : 1) })} {fx.to}/{fx.currency}
            </span>
            <span aria-hidden className="text-muted">×</span>
            <span className="sr-only">times</span>
          </>
        )}
        <span>{factor ? `${formatFactorValue(factor)} per ${factor.denominator_unit}` : "factor unknown"}</span>
        <span aria-hidden className="text-muted">=</span>
        <span className="sr-only">equals</span>
        <span className="font-semibold">{formatEmissions(Number(row.total_emission))}</span>
      </div>
      {factor ? (
        <p className="text-sm text-muted">
          Factor “{factor.emission_category_name}”, {factor.source || "source not recorded"}, {factor.year}
          {!snapshot && " (current match; this entry has no saved factor snapshot)"}
        </p>
      ) : (
        <p className="text-sm text-muted">{fallback.isError ? "Couldn't load the factor." : "No factor matched this entry."}</p>
      )}
      {fx && (
        <p className="text-sm text-muted" data-testid="drawer-fx">
          Exchange rate: {fxLine(fx)}
          {deflator && <span className="block">{deflatorLine(deflator)}</span>}
        </p>
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

/** S3-15: every review check with pass or fail, held ones first. */
function WhyHeld({ row, context }: { row: LedgerRow; context?: CheckContext }) {
  const checks = readChecks(row.checks);
  if (!checks) return <p className="text-sm text-muted">The checks haven't run on this entry yet, so it waits for your review.</p>;
  const lines = checkLines(checks, { ...context, year: factorYearFor(row.date_of_reporting) });
  const held = lines.filter((l) => !l.passed);
  const ordered = [...held, ...lines.filter((l) => l.passed)];
  return (
    <div className="space-y-2" data-testid="why-held">
      <p className="text-sm text-ink">
        {held.length === 0 ? "This entry passes every check." : held.length === 1 ? "Held back by 1 check." : `Held back by ${held.length} checks.`}
      </p>
      <ul className="divide-y divide-line rounded-control border border-line">
        {ordered.map((l) => {
          const Icon = CHECK_ICONS[l.icon];
          return (
            <li key={l.id} className="flex items-start gap-2 px-3 py-2 text-sm" data-check={l.id} data-passed={l.passed}>
              {l.passed ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-good" /> : <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <Icon aria-hidden className="size-3.5 shrink-0 text-muted" />
                  <span className={cn(!l.passed && "font-medium")}>{l.label}</span>
                  <span className="sr-only">{l.passed ? "(passed)" : "(held)"}</span>
                </span>
                {!l.passed && <span className="mt-0.5 block text-xs text-muted">{l.hint}</span>}
              </span>
              <span className={cn("shrink-0 text-xs font-medium", l.passed ? "text-good" : "text-warn")} aria-hidden>
                {l.passed ? "Pass" : "Held"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** S3-15: the same site, category and activity over the six months up to this entry's month. */
function MonthHistory({ row }: { row: LedgerRow }) {
  const { tokens } = useTheme();
  const history = useEntryHistory(row);
  if (!rowMonth(row)) return null;
  const months = history.data ?? [];
  const activity = typeof row.activity_data?.emission_category === "string" ? row.activity_data.emission_category : null;
  return (
    <ChartFrame
      title="Last 6 months"
      unit="tCO₂e"
      subtitle={activity ? `Same site, category and activity (${activity}); rejected entries left out.` : "Same site and category; rejected entries left out."}
      height={160}
      loading={history.isPending}
      error={history.isError ? "Couldn't load the earlier months." : null}
      onRetry={() => void history.refetch()}
      empty={months.every((m) => m.entries === 0)}
      emptyText="No entries in these months."
      table={{
        columns: [
          { id: "month", header: "Month" },
          { id: "total", header: "tCO₂e", numeric: true, decimals: 3 },
          { id: "entries", header: "Entries", numeric: true },
        ],
        rows: months.map((m) => ({ month: m.current ? `${m.label} (this entry's month)` : m.label, total: m.total, entries: m.entries })),
      }}
      option={{
        grid: { left: 8, right: 8, top: 12, bottom: 4, containLabel: true },
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => (typeof v === "number" ? formatEmissions(v) : "—") },
        xAxis: { type: "category", data: months.map((m) => m.label.split(" ")[0]) },
        yAxis: { type: "value" },
        series: [
          {
            name: "tCO₂e",
            type: "bar",
            barMaxWidth: 28,
            data: months.map((m) => ({ value: m.total, itemStyle: { color: m.current ? tokens.warn : tokens.brand } })),
          },
        ],
      }}
    />
  );
}
