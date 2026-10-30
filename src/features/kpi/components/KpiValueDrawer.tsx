import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Eye, Pencil, ShieldCheck, X } from "lucide-react";
import type { KpiValue } from "../../../lib/kpi/contracts";
import { breakdownTitle, checkBreakdown, periodText } from "../../../lib/kpi/entry";
import { breakdownLabel } from "../../../lib/kpi/labels";
import { columnDecimals, conversionLine, formatWithUnit } from "../../../lib/kpi/units";
import { useKpiCompanyId } from "../../../lib/kpi/switch";
import { getKpiValues } from "../../../services/kpiService";
import {
  Badge,
  Button,
  Callout,
  ChartFrame,
  Drawer,
  DocumentViewer,
  EntityAuditTimeline,
  StatusPill,
  Textarea,
  type ViewerFile,
  cn,
  focusRing,
  formatDate,
} from "../../../ui";
import { FrameworkBadges } from "./FrameworkBadges";
import { FromYourDataChip } from "./FromYourDataChip";
import { type EntryDraft, KpiQuestionCard } from "./KpiQuestionCard";
import { RefreshFromDataButton } from "./RefreshFromDataButton";
import type { KpiValueItem } from "./valueItems";

export type ReviewHandlers = {
  onApprove: (item: KpiValueItem) => void;
  /** Approve this one and open the next waiting. */
  onApproveNext?: (item: KpiValueItem) => void;
  onReject: (item: KpiValueItem, reason?: string) => void;
  /** A reviewer's change to a pending value, with a reason; resolves with an error message or null. */
  onEdit: (input: { item: KpiValueItem; draft: EntryDraft; reason: string }) => Promise<string | null>;
  /** The draft the edit card starts from, and the item's `PUT` input (from review/logic). */
  draftOf: (item: KpiValueItem) => EntryDraft;
};

const MIME: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv" };
const mimeOf = (name: string) => MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

/**
 * KPI-8 · The record drawer (05-ux S4): the question, the value with its
 * conversion, the split, evidence, the last six periods and the history.
 * With `review` it approves, rejects with a reason and edits through
 * `KpiQuestionCard`; without it (framework reports, KPI-11) it's read-only.
 */
export function KpiValueDrawer({ item, onClose, review, canRefresh = false }: { item: KpiValueItem | null; onClose: () => void; review?: ReviewHandlers; canRefresh?: boolean }) {
  return item ? <DrawerBody key={item.id} item={item} onClose={onClose} review={review} canRefresh={canRefresh} /> : null;
}

function DrawerBody({ item, onClose, review, canRefresh }: { item: KpiValueItem; onClose: () => void; review?: ReviewHandlers; canRefresh: boolean }) {
  const v = item.value;
  const pending = v.status === "pending";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ViewerFile | null>(null);
  const canReview = !!review && pending && v.source === "manual";

  const startEdit = () => {
    if (!review) return;
    setDraft(review.draftOf(item));
    setReason("");
    setEditError(null);
    setEditing(true);
  };
  const saveEdit = async () => {
    if (!review || !draft) return;
    if (reason.trim().length < 5) {
      setEditError("Say why you changed it (at least 5 characters). It goes in the value's history.");
      return;
    }
    setSaving(true);
    const message = await review.onEdit({ item, draft, reason });
    setSaving(false);
    if (message) setEditError(message);
    else setEditing(false);
  };

  const files: ViewerFile[] = (v.evidence ?? []).map((e) => ({ name: e.document_name, url: e.document_url, type: mimeOf(e.document_name), meta: e.uploaded_at ? `Uploaded ${formatDate(e.uploaded_at)}` : undefined }));
  const def = item.def;
  const conversion = v.value_numeric !== null ? conversionLine(v.value_numeric, v.unit, def?.canonical_unit ?? v.canonical_unit ?? null) : null;
  const parts = def?.breakdowns?.values ?? Object.keys(v.breakdown ?? {});
  const split = v.breakdown && parts.length ? checkBreakdown(v.value_numeric, v.breakdown, v.unit) : null;
  const stale = item.checks.some((c) => c.id === "KPI_AUTO_STALE");

  const footer = editing ? (
    <>
      <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
        Cancel
      </Button>
      <Button variant="primary" loading={saving} onClick={() => void saveEdit()}>
        Save changes
      </Button>
    </>
  ) : canReview && review ? (
    <>
      <Button variant="ghost" icon={<Pencil aria-hidden className="size-4" />} onClick={startEdit} className="mr-auto">
        Edit
      </Button>
      <Button icon={<X aria-hidden className="size-4" />} onClick={() => review.onReject(item)}>
        Reject
      </Button>
      <Button variant={review.onApproveNext ? "secondary" : "primary"} icon={<Check aria-hidden className="size-4" />} onClick={() => review.onApprove(item)}>
        Approve
      </Button>
      {review.onApproveNext && (
        <Button variant="primary" onClick={() => review.onApproveNext?.(item)}>
          Approve and next
          <ArrowRight aria-hidden className="size-4" />
        </Button>
      )}
    </>
  ) : (
    <Button variant="secondary" onClick={onClose}>
      Close
    </Button>
  );

  return (
    <Drawer open onClose={onClose} title={item.kpiName} subtitle={`${item.siteName} · ${item.periodLabel}`} size="md" footer={footer}>
      <div className="space-y-5">
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <StatusPill status={v.status} />
          {item.enteredBy && <span>Entered by {item.enteredBy}</span>}
          {v.submitted_at && <span>· sent {formatDate(v.submitted_at)}</span>}
        </p>

        {pending && item.checks.length > 0 && (
          <Callout tone="warn" title={item.ready ? "For your information" : "Held for a look"}>
            <ul className="flex flex-wrap gap-1.5" aria-label="Checks">
              {item.checks.map((c) => (
                <li key={c.id}>
                  <Badge tone={c.info ? "info" : "warn"}>{c.label}</Badge>
                </li>
              ))}
            </ul>
          </Callout>
        )}
        {pending && item.checks.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-good">
            <ShieldCheck aria-hidden className="size-4" />
            Passed every check: in range, split adds up, units fine.
          </p>
        )}
        {v.status === "rejected" && v.review_comment && (
          <Callout tone="warn" title="Sent back">
            “{v.review_comment}”
          </Callout>
        )}

        {editing && draft && def ? (
          <div className="space-y-4">
            <KpiQuestionCard
              idBase={`kpi-review-${v.id}`}
              item={{
                question: item.question,
                help: def.help,
                valueType: def.value_type,
                canonicalUnit: def.canonical_unit,
                allowedUnits: def.allowed_units,
                decimals: def.decimals,
                breakdowns: def.breakdowns,
                needsEvidence: false,
                usedIn: item.usedIn,
                last: null,
              }}
              draft={draft}
              onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
              evidence={v.evidence ?? []}
            />
            <Textarea label="Why are you changing it?" required value={reason} onChange={setReason} rows={2} placeholder="For example: the meter reading was for two months" />
            {editError && (
              <p role="alert" className="text-sm text-bad">
                {editError}
              </p>
            )}
          </div>
        ) : (
          <>
            <section aria-label="Value" className="space-y-2">
              <h3 className="text-base font-semibold leading-snug text-ink">{item.question}</h3>
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-num text-2xl font-semibold text-ink" data-testid="kpi-review-value">
                  {item.valueText}
                </span>
                {item.change && (
                  <span className="text-sm text-muted">
                    {item.change} on {item.lastLabel.startsWith("Last ") ? `l${item.lastLabel.slice(1)}` : item.lastLabel}
                  </span>
                )}
              </p>
              {conversion && <p className="text-sm text-muted">{conversion}</p>}
              <div className="flex flex-wrap items-center gap-2">
                {v.source === "auto" && <FromYourDataChip source={def?.auto_source} snapshot={v.auto_snapshot} />}
                {v.source === "formula" && <Badge tone="info">Calculated from other KPIs</Badge>}
                {v.is_estimate && <Badge tone="warn">Estimate</Badge>}
                {v.source === "auto" && stale && canRefresh && <RefreshFromDataButton year={Number(v.period_start.slice(0, 4))} size="sm" />}
              </div>
              {item.usedIn.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">Used in</span>
                  <FrameworkBadges items={item.usedIn} tips />
                </div>
              )}
            </section>

            {v.comment && (
              <section aria-label="Contributor's comment" className="rounded-control border border-line bg-tint px-3 py-2 text-sm text-ink">
                <span className="block text-xs text-muted">{item.enteredBy ? `${item.enteredBy} wrote` : "Comment"}</span>“{v.comment}”
              </section>
            )}

            {v.breakdown && parts.length > 0 && (
              <section aria-label={breakdownTitle(def?.breakdowns?.by)} className="space-y-1">
                <h4 className="text-sm font-medium text-ink">{breakdownTitle(def?.breakdowns?.by)}</h4>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                  {parts.map((p) => (
                    <div key={p}>
                      <dt className="text-xs text-muted">{breakdownLabel(p)}</dt>
                      <dd className="font-num text-ink">{formatWithUnit(v.breakdown?.[p] ?? null, v.unit)}</dd>
                    </div>
                  ))}
                </dl>
                {split && split.state !== "empty" && <p className={cn("text-sm", split.state === "ok" ? "text-good" : "text-warn")}>{split.text}</p>}
              </section>
            )}

            <section aria-label="Evidence" className="space-y-1">
              <h4 className="text-sm font-medium text-ink">Evidence</h4>
              {files.length ? (
                <ul className="space-y-1">
                  {files.map((f) => (
                    <li key={f.url}>
                      <button type="button" onClick={() => setViewing(f)} className={cn("inline-flex items-center gap-1.5 rounded-control text-sm text-brand-text underline", focusRing)}>
                        <Eye aria-hidden className="size-4" />
                        {f.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No document attached.</p>
              )}
            </section>

            <LastPeriods value={v} unit={v.unit ?? def?.canonical_unit ?? null} />

            <section aria-label="History" className="space-y-2">
              <h4 className="text-sm font-medium text-ink">History</h4>
              <EntityAuditTimeline entityType="kpi_value" entityId={v.id} />
            </section>
          </>
        )}
      </div>
      <DocumentViewer open={!!viewing} onClose={() => setViewing(null)} file={viewing} files={files} onNavigate={setViewing} />
    </Drawer>
  );
}

/** The last six periods of this KPI at this site, the value under review included (a single series, one axis). */
function LastPeriods({ value, unit }: { value: KpiValue; unit: string | null }) {
  const companyId = useKpiCompanyId();
  const q = useQuery({
    queryKey: ["kpi", "values", "trail", companyId, value.kpi_definition_id, value.site_id, value.period_start],
    queryFn: () => getKpiValues({ kpi: value.kpi_definition_id, ...(value.site_id ? { site: value.site_id } : {}), to: value.period_start }, companyId),
    staleTime: 60_000,
  });
  const points = useMemo(() => {
    const rows = (q.data ?? []).filter((r) => r.frequency === value.frequency && r.site_id === value.site_id && (r.status === "approved" || r.id === value.id));
    const byStart = new Map(rows.map((r) => [r.period_start, r]));
    byStart.set(value.period_start, value);
    return [...byStart.values()]
      .sort((a, b) => a.period_start.localeCompare(b.period_start))
      .slice(-6)
      .map((r) => ({ label: periodText(r.period_start, r.frequency, r.year_type), value: r.value_canonical ?? r.value_numeric, mine: r.id === value.id }));
  }, [q.data, value]);
  const shownUnit = value.canonical_unit ?? unit;
  return (
    <ChartFrame
      title="Last periods"
      unit={shownUnit ?? undefined}
      subtitle="Approved values, and this one."
      height={160}
      loading={q.isPending}
      error={q.isError ? "Couldn't load the earlier periods." : null}
      onRetry={() => void q.refetch()}
      empty={points.length < 2}
      emptyText="No earlier approved values to compare with."
      table={{
        columns: [
          { id: "period", header: "Period" },
          { id: "value", header: shownUnit ?? "Value", numeric: true, decimals: columnDecimals(shownUnit, 2) },
        ],
        rows: points.map((p) => ({ period: p.mine ? `${p.label} (this value)` : p.label, value: p.value })),
      }}
      option={(t) => ({
        grid: { left: 8, right: 8, top: 12, bottom: 4, containLabel: true },
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (n) => (typeof n === "number" ? formatWithUnit(n, shownUnit) : "—") },
        xAxis: { type: "category", data: points.map((p) => (p.mine ? `${p.label} (this)` : p.label)) },
        yAxis: { type: "value" },
        series: [{ name: shownUnit ?? "Value", type: "bar", barMaxWidth: 24, data: points.map((p) => ({ value: p.value, itemStyle: { color: t.color[0], opacity: p.mine ? 1 : 0.55 } })) }],
      })}
    />
  );
}
