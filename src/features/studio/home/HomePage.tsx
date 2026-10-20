import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Circle, Copy, FileText, Image, LayoutTemplate, Leaf, MoreHorizontal, Palette, Pencil, Plus, Presentation, ScrollText, Trash2 } from "lucide-react";
import type { GhgReadiness, ReadinessGap, ReportKind, StudioDocSummary, SustainabilityReadiness, YearType } from "../../../lib/studio/contracts";
import { useDesignStudio } from "../../../lib/studio/switch";
import { Badge, Button, Callout, EmptyState, Menu, Modal, PageHeader, SegmentedControl, Skeleton, SkeletonText, TextField, cn, focusRing, panel, useToast } from "../../../ui";
import { docErrorMessage, useDeleteDoc, useDocs, useDuplicateDoc, useReadiness, useRenameDoc } from "../docs/api";
import { periodLabel } from "../../../lib/studio/docData";
import { FORMAT_ASPECT, KIND_LABEL, START_OPTIONS, editedLine, formatLine, latestClosedYear, startLink, statusLabel, type StartOption } from "./logic";

const START_ICONS: Record<StartOption["id"], typeof FileText> = { ghg: FileText, sustainability: Leaf, deck: Presentation, summary: ScrollText, social: Image };

type KindFilter = "all" | ReportKind;

/**
 * DS-5 · `/studio` (05-ux S1, mockup "Home"): what will you design (the kinds
 * and formats, each opening the new-design flow preselected), readiness for
 * the latest closed period per kind with a link to fix each gap, and the
 * recent designs with Duplicate, Rename and Delete.
 */
export function StudioHomePage() {
  const { kinds } = useDesignStudio();
  const [params, setParams] = useSearchParams();
  const yearType: YearType = params.get("yt") === "CY" ? "CY" : "FY";
  const year = latestClosedYear(yearType);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const docs = useDocs();
  const shown = useMemo(() => (docs.data ?? []).filter((d) => kindFilter === "all" || d.kind === kindFilter), [docs.data, kindFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Design Studio"
        description="Design GHG and sustainability reports from your approved data. Every number stays linked."
        context={
          <Link to="/studio/brand-kit" className={cn("inline-flex items-center gap-1.5 text-sm text-brand-text hover:underline", focusRing)}>
            <Palette aria-hidden className="size-4" /> Brand kit
          </Link>
        }
      />
      <div className="flex justify-end -mt-14 max-sm:mt-0">
        <Link to="/studio/new?kind=ghg" className={cn("inline-flex h-9 items-center gap-2 rounded-control bg-brand px-3.5 text-sm font-medium text-on-brand hover:opacity-90", focusRing)} data-testid="studio-new-design">
          <Plus aria-hidden className="size-4" /> New design
        </Link>
      </div>

      <section aria-labelledby="studio-start" className="space-y-3">
        <h2 id="studio-start" className="text-base font-semibold text-ink">
          What will you design?
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {START_OPTIONS.map((o) => {
            const Icon = START_ICONS[o.id];
            const on = kinds[o.kind];
            const body = (
              <>
                <span className="flex size-9 items-center justify-center rounded-control bg-tint text-brand-text">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="mt-3 block font-medium text-ink">{o.title}</span>
                <span className="mt-0.5 block text-xs text-muted">{o.subtitle}</span>
                {!on && (
                  <span className="mt-2 block">
                    <Badge tone="neutral">Needs KPI tracking</Badge>
                  </span>
                )}
              </>
            );
            return (
              <li key={o.id} data-testid={`studio-start-${o.id}`}>
                {on ? (
                  <Link to={startLink(o)} className={cn(panel, "block h-full p-4 hover:border-brand", focusRing)}>
                    {body}
                  </Link>
                ) : (
                  <div aria-disabled="true" className={cn(panel, "block h-full p-4 opacity-60")}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="studio-readiness" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="studio-readiness" className="text-base font-semibold text-ink">
            Readiness · {periodLabel(yearType, year)}
          </h2>
          <SegmentedControl
            label="Year type"
            size="sm"
            value={yearType}
            onChange={(v) => {
              const next = new URLSearchParams(params);
              next.set("yt", v);
              setParams(next, { replace: true });
            }}
            options={[
              { value: "FY", label: "Financial year" },
              { value: "CY", label: "Calendar year" },
            ]}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <GhgReadinessCard year={year} yearType={yearType} />
          {kinds.sustainability ? (
            <SustainabilityReadinessCard year={year} yearType={yearType} />
          ) : (
            <div className={cn(panel, "p-4")} data-testid="readiness-sustainability-off">
              <p className="font-medium text-ink">Sustainability report</p>
              <p className="mt-1 text-sm text-muted">Needs KPI tracking, which isn't turned on for your company.</p>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="studio-recent" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="studio-recent" className="text-base font-semibold text-ink">
            Recent designs
          </h2>
          <SegmentedControl
            label="Kind"
            size="sm"
            value={kindFilter}
            onChange={setKindFilter}
            options={[
              { value: "all", label: "All kinds" },
              { value: "ghg", label: "GHG" },
              ...(kinds.sustainability ? [{ value: "sustainability" as const, label: "Sustainability" }] : []),
            ]}
          />
        </div>
        {docs.isError ? (
          <EmptyState variant="error" title="Your designs couldn't be loaded." description={docErrorMessage(docs.error, "Try again in a moment.")} action={<Button onClick={() => void docs.refetch()}>Try again</Button>} />
        ) : docs.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Loading designs">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-56 w-full" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <section className={panel} aria-label="No designs yet">
            <EmptyState
              icon={LayoutTemplate}
              title="Design your first GHG report."
              description="We'll lay it out from your approved emissions."
              action={
                <Link to="/studio/new?kind=ghg&format=a4&purpose=report" className={cn("inline-flex h-9 items-center gap-2 rounded-control bg-brand px-3.5 text-sm font-medium text-on-brand hover:opacity-90", focusRing)}>
                  <Plus aria-hidden className="size-4" /> New GHG report
                </Link>
              }
            />
          </section>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="studio-designs">
            {shown.map((d) => (
              <DesignCard key={d.id} doc={d} />
            ))}
          </ul>
        )}
        <Callout tone="brand" title="Start from your GHG report">
          Open Reports › GHG report and choose “Design this report”. Your filters come with you.{" "}
          <Link to="/reports/ghg" className={cn("font-medium text-brand-text underline", focusRing)}>
            Go to GHG report
          </Link>
        </Callout>
      </section>
    </div>
  );
}

function GapList({ gaps }: { gaps: ReadinessGap[] }) {
  if (!gaps.length) return null;
  return (
    <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
      {gaps.map((g, i) => (
        <li key={`${g.kind}-${i}`} className="flex items-start gap-2 text-sm">
          <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", g.severity === "error" ? "bg-bad" : g.severity === "warning" ? "bg-warn" : "bg-info")} />
          <span className="text-ink">
            {g.message}{" "}
            {g.link && g.linkLabel && (
              <Link to={g.link} className={cn("font-medium text-brand-text hover:underline", focusRing)}>
                {g.linkLabel}
              </Link>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

const STATE_BADGE: Record<GhgReadiness["state"], { label: string; tone: "good" | "warn" | "bad" }> = {
  ready: { label: "Ready", tone: "good" },
  almost: { label: "Almost ready", tone: "warn" },
  not_ready: { label: "Not ready", tone: "bad" },
};

function Stat({ value, label, ok }: { value: string; label: string; ok?: boolean }) {
  const Icon = ok === undefined ? Circle : ok ? CheckCircle2 : AlertTriangle;
  return (
    <li className="flex items-center gap-2 text-sm">
      <Icon aria-hidden className={cn("size-4 shrink-0", ok === undefined ? "text-muted" : ok ? "text-good" : "text-warn")} />
      <span className="font-mono tabular-nums text-ink">{value}</span>
      <span className="text-muted">{label}</span>
    </li>
  );
}

function ReadinessShell({ title, testId, badge, children }: { title: string; testId: string; badge?: { label: string; tone: "good" | "warn" | "bad" | "neutral" }; children: React.ReactNode }) {
  return (
    <div className={cn(panel, "p-4")} data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-ink">{title}</p>
        {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
      </div>
      {children}
    </div>
  );
}

function GhgReadinessCard({ year, yearType }: { year: number; yearType: YearType }) {
  const r = useReadiness({ kind: "ghg", year, yearType });
  if (r.isPending) return <ReadinessShell title="GHG report" testId="readiness-ghg"><SkeletonText lines={4} /></ReadinessShell>;
  if (r.isError || r.data.kind !== "ghg") return <ReadinessShell title="GHG report" testId="readiness-ghg"><p className="mt-2 text-sm text-bad">{docErrorMessage(r.error, "Readiness couldn't be loaded.")}</p></ReadinessShell>;
  const g = r.data;
  return (
    <ReadinessShell title="GHG report" testId="readiness-ghg" badge={STATE_BADGE[g.state]}>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        <Stat value={g.approvedRows.toLocaleString("en-US")} label="approved entries" ok={g.approvedRows > 0} />
        <Stat value={g.pendingRows.toLocaleString("en-US")} label="pending approval" ok={g.pendingRows === 0} />
        <Stat value={`${g.sitesCovered} / ${g.sitesTotal}`} label="sites with data" ok={g.sitesCovered === g.sitesTotal} />
        <Stat value={`${g.monthsCovered} / ${g.monthsExpected}`} label="months with data" ok={g.monthsMissing.length === 0} />
        <Stat value={g.scope3Addressed.replace("/", " / ")} label="Scope 3 categories addressed" ok={g.scope3.unaddressed.length === 0} />
      </ul>
      <GapList gaps={g.gaps} />
    </ReadinessShell>
  );
}

function SustainabilityReadinessCard({ year, yearType }: { year: number; yearType: YearType }) {
  const r = useReadiness({ kind: "sustainability", year, yearType });
  if (r.isPending) return <ReadinessShell title="Sustainability report" testId="readiness-sustainability"><SkeletonText lines={4} /></ReadinessShell>;
  if (r.isError || r.data.kind !== "sustainability")
    return <ReadinessShell title="Sustainability report" testId="readiness-sustainability"><p className="mt-2 text-sm text-bad">{docErrorMessage(r.error, "Readiness couldn't be loaded.")}</p></ReadinessShell>;
  const s: SustainabilityReadiness = r.data;
  const badge = s.locked ? { label: `Year locked${s.lockedAt ? ` ${new Date(s.lockedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}`, tone: "good" as const } : STATE_BADGE[s.state];
  return (
    <ReadinessShell title="Sustainability report" testId="readiness-sustainability" badge={badge}>
      {s.setupDone && (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {s.coverage.map((c) => (
            <Stat key={c.framework} value={`${Math.round(c.pct)}%`} label={`${c.framework} coverage`} ok={c.pct >= 100} />
          ))}
          <Stat value={String(s.pendingCount)} label="KPI values pending" ok={s.pendingCount === 0} />
        </ul>
      )}
      <GapList gaps={s.gaps} />
    </ReadinessShell>
  );
}

function Thumb({ doc }: { doc: StudioDocSummary }) {
  const aspect = FORMAT_ASPECT[doc.format];
  const Icon = doc.kind === "ghg" ? FileText : Leaf;
  return (
    <div className="flex h-36 items-center justify-center rounded-t-card bg-tint" aria-hidden>
      {doc.thumbnailUrl ? (
        <img src={doc.thumbnailUrl} alt="" className="max-h-32 max-w-[80%] rounded-chip border border-line object-contain" />
      ) : (
        <div className="flex flex-col items-start justify-between rounded-chip border border-line bg-panel p-2 shadow-sm" style={{ height: aspect >= 1 ? `${Math.round(96 / aspect)}px` : "112px", width: aspect >= 1 ? "96px" : `${Math.round(112 * aspect)}px` }}>
          <Icon className="size-3.5 text-brand-text" />
          <span className="line-clamp-3 text-[8px] leading-tight font-semibold text-ink">{doc.title}</span>
        </div>
      )}
    </div>
  );
}

function DesignCard({ doc }: { doc: StudioDocSummary }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const duplicate = useDuplicateDoc();
  const remove = useDeleteDoc();
  const rename = useRenameDoc();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(doc.title);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = statusLabel(doc);
  const href = `/studio/${doc.id}`;

  const onDuplicate = async () => {
    try {
      const r = await duplicate.mutateAsync({ id: doc.id });
      toast({ title: "Design duplicated", description: `${doc.title} (copy)`, tone: "good" });
      navigate(`/studio/${r.id}`);
    } catch (e) {
      toast({ title: "Not duplicated", description: docErrorMessage(e), tone: "bad" });
    }
  };

  return (
    <li className={cn(panel, "flex flex-col")} data-testid={`design-${doc.id}`}>
      <Link to={href} className={cn("block rounded-t-card", focusRing)} aria-label={`Open ${doc.title}`}>
        <Thumb doc={doc} />
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <Link to={href} className={cn("line-clamp-2 font-medium text-ink hover:underline", focusRing)}>
            {doc.title}
          </Link>
          <Menu
            label={`Actions for ${doc.title}`}
            trigger={(props) => (
              <button {...props} type="button" aria-label={`More actions for ${doc.title}`} className={cn("rounded-chip p-1 text-muted hover:bg-tint hover:text-ink", focusRing)}>
                <MoreHorizontal aria-hidden className="size-4" />
              </button>
            )}
            items={[
              { label: "Duplicate", icon: <Copy aria-hidden className="size-4" />, onSelect: () => void onDuplicate() },
              { label: "Rename", icon: <Pencil aria-hidden className="size-4" />, onSelect: () => (setTitle(doc.title), setError(null), setRenaming(true)), disabled: doc.status === "final" },
              { label: "Delete", icon: <Trash2 aria-hidden className="size-4" />, danger: true, onSelect: () => (setError(null), setDeleting(true)), disabled: doc.status === "final" || !!doc.finalVersion },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Badge tone="neutral">{KIND_LABEL[doc.kind]}</Badge>
          <span className="text-muted">{formatLine(doc.format, doc.pageCount)}</span>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="text-xs text-muted">{doc.sourceDocId ? `Made from design ${doc.sourceDocId} · ` : ""}{editedLine(doc)}</p>
      </div>
      <Modal
        open={renaming}
        onClose={() => setRenaming(false)}
        title="Rename design"
        error={error}
        primaryAction={{
          label: "Rename",
          loading: rename.isPending,
          disabled: !title.trim() || title.trim() === doc.title,
          onClick: async () => {
            try {
              await rename.mutateAsync({ id: doc.id, rev: doc.rev, title: title.trim() });
              setRenaming(false);
            } catch (e) {
              setError(docErrorMessage(e));
            }
          },
        }}
      >
        <TextField label="Name" value={title} onChange={setTitle} maxLength={200} autoFocus />
      </Modal>
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete “${doc.title}”?`}
        description="The design is removed from Design Studio. Your data and other designs are not affected."
        tone="destructive"
        error={error}
        primaryAction={{
          label: "Delete design",
          loading: remove.isPending,
          onClick: async () => {
            try {
              await remove.mutateAsync(doc.id);
              setDeleting(false);
              toast({ title: "Design deleted", tone: "good" });
            } catch (e) {
              setError(docErrorMessage(e));
            }
          },
        }}
      />
    </li>
  );
}
