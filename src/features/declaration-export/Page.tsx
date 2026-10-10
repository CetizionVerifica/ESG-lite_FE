import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Braces, FileText, Sheet, type LucideIcon } from "lucide-react";
import { useTheme } from "../../theme";
import type { Declaration } from "../../services/pcfExportService";
import { Badge, Button, Callout, EmptyState, PageHeader, Skeleton, SkeletonText, cn, focusRing, panel, useToast } from "../../ui";
import { getExportFile, useDeclaration } from "./api";
import {
  STATUS_LABEL,
  boundaryLabel,
  canExportPact,
  draftName,
  errorMessage,
  errorStatus,
  fileNameFrom,
  formatKg,
  formatPct,
  periodLabel,
  saveBlob,
  stageRows,
  standardLabel,
} from "./logic";

type Format = "pdf" | "pact" | "csv";

const SERIES = ["bg-series-1", "bg-series-2", "bg-series-3", "bg-series-4", "bg-series-5"];

const STATUS_TONE = { draft: "neutral", in_review: "info", approved: "good", published: "good", superseded: "warn" } as const;

function FormatCard({
  icon: Icon,
  title,
  description,
  action,
  disabledReason,
  busy,
  onDownload,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action: string;
  disabledReason?: string;
  busy: boolean;
  onDownload: () => void;
}) {
  return (
    <section className={cn(panel, "flex flex-col gap-3 p-4")} aria-label={title}>
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-control bg-tint text-brand-text">
          <Icon aria-hidden className="size-4" />
        </span>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </div>
      <p className="flex-1 text-sm text-muted">{description}</p>
      {disabledReason && <p className="text-xs text-warn">{disabledReason}</p>}
      <Button variant="secondary" onClick={onDownload} loading={busy} disabled={!!disabledReason} className="self-start">
        {action}
      </Button>
    </section>
  );
}

function Summary({ d }: { d: Declaration }) {
  const rows = stageRows(d);
  const max = Math.max(0, ...rows.map((r) => r.value ?? 0));
  return (
    <section className={cn(panel, "grid gap-6 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]")} aria-label="Declaration summary">
      <div className="space-y-3">
        <div>
          <p className="text-xs text-muted">Product carbon footprint</p>
          <p className="font-num text-3xl font-semibold text-ink" data-testid="declaration-total">
            {formatKg(d.total_kg_per_unit)}
          </p>
          <p className="text-sm text-muted">kgCO₂e per {d.declared_unit.label}</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Period</dt>
          <dd className="text-ink">{periodLabel(d.reference_period)}</dd>
          <dt className="text-muted">Standard</dt>
          <dd className="text-ink">
            {standardLabel(d.method.standard)} · {boundaryLabel(d.method.boundary)}
          </dd>
          <dt className="text-muted">PCR</dt>
          <dd className="text-ink">{d.method.pcr || "None"}</dd>
          <dt className="text-muted">Primary data share</dt>
          <dd className="text-ink">{formatPct(d.primary_data_share_pct)}</dd>
          <dt className="text-muted">DQR</dt>
          <dd className="text-ink">{d.dqr ? d.dqr.overall.toFixed(2) : "—"}</dd>
        </dl>
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink">By stage</h2>
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.id} className="grid grid-cols-[8rem_minmax(0,1fr)_6rem] items-center gap-2 text-sm">
              <span className="text-ink">{r.label}</span>
              <span className="h-2 rounded-chip bg-tint">
                {r.value !== null && max > 0 && <span className={cn("block h-2 rounded-chip", SERIES[i])} style={{ width: `${Math.max(0, (r.value / max) * 100)}%` }} />}
              </span>
              <span className="text-right font-num text-ink">{r.withheld ? <Badge>Withheld</Badge> : formatKg(r.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** C05: download a footprint as a branded PDF declaration, a PACT v3 JSON file or a CSV. */
export default function Page() {
  const { studyId: raw } = useParams();
  const studyId = Number(raw) > 0 && Number.isInteger(Number(raw)) ? Number(raw) : null;
  const query = useDeclaration(studyId);
  const { pack } = useTheme();
  const { toast } = useToast();
  const [busy, setBusy] = useState<Format | null>(null);

  const d = query.data?.declaration;

  async function download(format: Format) {
    if (!d || !query.data || studyId === null) return;
    setBusy(format);
    try {
      if (format === "pdf") {
        const { downloadDeclarationPdf } = await import("./pdf/download");
        await downloadDeclarationPdf(d, pack, draftName(query.data.file_name, d.draft));
      } else {
        const { blob, disposition } = await getExportFile(studyId, format);
        const stem = query.data.file_name.replace(/\.pdf$/, "");
        saveBlob(blob, fileNameFrom(disposition, format === "pact" ? `${stem}.pact.json` : draftName(`${stem}.csv`, d.draft)));
      }
      toast({ tone: "good", title: format === "pdf" ? "PDF declaration downloaded." : format === "pact" ? "PACT file downloaded." : "CSV downloaded." });
    } catch (err) {
      const fallback = format === "pdf" ? "Try again; if it keeps failing, use the CSV." : "Try again in a moment.";
      toast({ tone: "bad", title: `Couldn't export the ${format === "pdf" ? "PDF" : format === "pact" ? "PACT file" : "CSV"}.`, description: await errorMessage(err, fallback) });
    } finally {
      setBusy(null);
    }
  }

  let body;
  if (studyId === null || errorStatus(query.error) === 404) {
    body = (
      <EmptyState
        title="Footprint not found"
        description="It may have been deleted, or it belongs to a site you can't see."
        action={
          <Link to="/products" className={cn("text-sm font-medium text-brand-text underline", focusRing)}>
            Back to product footprints
          </Link>
        }
      />
    );
  } else if (errorStatus(query.error) === 409) {
    body = (
      <EmptyState
        title="Calculate the footprint first"
        description="A declaration needs a calculated result."
        action={
          <Link to={`/products/${studyId}`} className={cn("text-sm font-medium text-brand-text underline", focusRing)}>
            Open the footprint
          </Link>
        }
      />
    );
  } else if (query.isError) {
    body = (
      <EmptyState
        variant="error"
        title="Couldn't load the footprint."
        action={
          <Button onClick={() => void query.refetch()} loading={query.isFetching}>
            Try again
          </Button>
        }
      />
    );
  } else if (!d) {
    body = (
      <div className="space-y-4" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-40 w-full" />
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn(panel, "p-4")}>
              <SkeletonText lines={3} />
            </div>
          ))}
        </div>
      </div>
    );
  } else {
    const pactBlocked = canExportPact(d.status) ? undefined : "Available once the footprint is approved.";
    body = (
      <div className="space-y-4">
        {d.draft && (
          <Callout tone="warn" title="This footprint isn't approved yet.">
            The PDF and CSV carry a DRAFT mark. Submit it for review before sharing it with a customer.
          </Callout>
        )}
        {d.licensed_values_withheld && (
          <Callout tone="info" title="Licensed values are withheld.">
            Lines priced with licensed (ecoinvent) factors, their stage totals and the data-quality figures that would reveal them are left out of every export. The product total includes them.
          </Callout>
        )}
        <Summary d={d} />
        <div className="grid gap-4 md:grid-cols-3">
          <FormatCard
            icon={FileText}
            title="PDF declaration"
            description="Branded declaration for customers: cover, summary by stage, inputs, data quality and method notes."
            action="Download PDF"
            busy={busy === "pdf"}
            onDownload={() => void download("pdf")}
          />
          <FormatCard
            icon={Braces}
            title="PACT JSON"
            description="PACT v3 ProductFootprint for your customer's system. Checked against the published schema before download."
            action="Download PACT JSON"
            disabledReason={pactBlocked}
            busy={busy === "pact"}
            onDownload={() => void download("pact")}
          />
          <FormatCard
            icon={Sheet}
            title="CSV"
            description="Results and input lines for the buyer's own checks."
            action="Download CSV"
            busy={busy === "csv"}
            onDownload={() => void download("csv")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Export declaration"
        loading={query.isLoading}
        description={
          d ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>
                {d.product.name} · v{d.version} · {d.site.name}
              </span>
              <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
            </span>
          ) : undefined
        }
      />
      {body}
    </div>
  );
}
