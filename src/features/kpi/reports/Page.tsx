import { useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { canReviewKpis } from "../../../lib/kpi/switch";
import { FRAMEWORK_CODES, type FrameworkCode, type KpiReportRow } from "../../../lib/kpi/contracts";
import { KpiNotAvailable } from "../../../lib/kpi/KpiNotAvailable";
import { FRAMEWORK_LABEL } from "../../../lib/kpi/labels";
import { isKpiTrackingOff } from "../../../lib/kpi/switch";
import { Button, Callout, EmptyState, PageHeader, Select, SkeletonText, Tabs, cn, focusRing, panel, useToast } from "../../../ui";
import { useKpiLookup } from "../components/lookup";
import { kpiErrorMessage, useDownload, useReport } from "./api";
import { ReportTable } from "./components/ReportTable";
import { RowValuesDrawer } from "./components/RowValuesDrawer";
import { formatsFor, omissionText, omissionTitle, pendingText, tabLabel } from "./logic";

/**
 * KPI-11 `/reports/kpi/:framework` (05-ux S6): one tab per framework the
 * company reports, a preview of the year's approved values in that
 * framework's shape and units, what's left out and why, and the downloads
 * (XLSX for all three, the branded PDF for the GRI content index).
 */
export default function ReportsPage() {
  const { framework: param } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { toast } = useToast();
  const { lookup, isLoading, error: lookupError } = useKpiLookup();
  const thisYear = new Date().getFullYear();
  const year = Number(params.get("year")) || thisYear;
  const sites = (params.get("sites") ?? "").split(",").map(Number).filter((n) => n > 0);
  const code = param?.toUpperCase() as FrameworkCode | undefined;
  const valid = !!code && (FRAMEWORK_CODES as readonly string[]).includes(code);
  const enabled = lookup.frameworks;
  const framework = valid && (!enabled.length || enabled.includes(code)) ? code : null;
  const report = useReport(framework, year, sites);
  const download = useDownload();
  const [open, setOpen] = useState<KpiReportRow | null>(null);

  if ((report.error && isKpiTrackingOff(report.error)) || (lookupError && isKpiTrackingOff(lookupError))) return (
      <div className="space-y-6 py-6">
        <PageHeader title="Framework reports" />
        <KpiNotAvailable />
      </div>
    );
  if (!isLoading && !framework && enabled.length) return <Navigate to={`/reports/kpi/${enabled[0]}${params.toString() ? `?${params.toString()}` : ""}`} replace />;

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key); // data-loss-reviewed: URL param, not a record
        return next;
      },
      { replace: true },
    );
  const get = (format: "xlsx" | "pdf") =>
    framework &&
    download.mutate(
      { framework, year, sites, format },
      {
        onSuccess: (name) => toast({ title: `${format === "pdf" ? "PDF" : "Spreadsheet"} downloaded`, description: name, tone: "good" }),
        onError: (e) => toast({ title: "Couldn't download the report", description: kpiErrorMessage(e, "Try again in a moment."), tone: "bad" }),
      },
    );
  const formats = framework ? formatsFor(framework) : [];
  const siteText = sites.length ? sites.map((s) => lookup.siteName(s)).join(", ") : "all sites";
  const data = report.data;
  const pending = data ? pendingText(data) : null;

  return (
    <div className="space-y-6 py-6">
      <PageHeader
        title="Framework reports"
        description={`${year} · ${siteText} · approved values only`}
        primaryAction={
          framework
            ? formats.includes("pdf")
              ? { label: "Download PDF", icon: <FileText aria-hidden className="size-4" />, onClick: () => get("pdf"), loading: download.isPending && download.variables?.format === "pdf" }
              : { label: "Download XLSX", icon: <FileSpreadsheet aria-hidden className="size-4" />, onClick: () => get("xlsx"), loading: download.isPending && download.variables?.format === "xlsx" }
            : undefined
        }
        secondaryActions={
          formats.includes("pdf") ? [{ label: "Download XLSX", icon: <Download aria-hidden className="size-4" />, onClick: () => get("xlsx"), loading: download.isPending && download.variables?.format === "xlsx" }] : []
        }
        context={
          <div className="flex flex-wrap items-end gap-3">
            <Select<number>
              label="Year"
              value={year}
              onChange={(y) => setParam("year", y && y !== thisYear ? String(y) : null)}
              options={Array.from({ length: 4 }, (_, i) => thisYear - i).map((y) => ({ value: y, label: String(y) }))}
              className="w-28"
            />
            <Select<number>
              label="Site"
              value={sites.length === 1 ? sites[0] : null}
              onChange={(s) => setParam("sites", s ? String(s) : null)}
              options={lookup.sites.map((s) => ({ value: s.site_id, label: s.name }))}
              placeholder="All sites"
              className="w-44"
            />
          </div>
        }
      />

      {enabled.length > 0 && framework && (
        <Tabs<FrameworkCode>
          label="Frameworks"
          value={framework}
          onChange={(f) => navigate({ pathname: `/reports/kpi/${f}`, search: params.toString() })}
          items={enabled.map((f) => ({ value: f, label: tabLabel(f) }))}
        />
      )}

      {isLoading || (framework && report.isPending) ? (
        <section className={cn(panel, "p-5")} aria-busy>
          <SkeletonText lines={8} />
        </section>
      ) : !enabled.length ? (
        <section className={panel}>
          <EmptyState icon={FileSpreadsheet} title="No frameworks chosen yet." description="Your admin picks GRI, BRSR or ESRS in KPI setup; their reports show here." />
        </section>
      ) : report.error || !data ? (
        <section className={panel}>
          <EmptyState variant="error" title={kpiErrorMessage(report.error, "Couldn't load the report.")} action={<Button onClick={() => void report.refetch()}>Try again</Button>} />
        </section>
      ) : (
        <div className={cn("space-y-4", report.isPlaceholderData && "opacity-60 transition-opacity")} aria-busy={report.isFetching || undefined}>
          {pending && (
            <Callout
              tone="warn"
              title={pending}
              action={
                canReviewKpis(role) ? (
                  <Link to="/data/approvals?view=kpi" className={cn("text-sm font-medium text-brand-text underline", focusRing)}>
                    See them
                  </Link>
                ) : undefined
              }
            >
              Approve them to include them. Downloads hold the same approved values.
            </Callout>
          )}
          <p className="text-sm text-muted">
            {data.version || FRAMEWORK_LABEL[data.framework]} · values in {FRAMEWORK_LABEL[data.framework]}'s own units · select a value to see the records behind it.
          </p>

          {data.rows.length ? (
            <ReportTable framework={data.framework} rows={data.rows} year={data.year} yearType={lookup.yearType} onOpen={setOpen} />
          ) : (
            <section className={panel}>
              <EmptyState compact title={`No approved values for ${year} yet.`} description="Values show here once a manager approves them." />
            </section>
          )}

          {data.omissions.length > 0 && (
            <section aria-labelledby="kpi-report-omissions" className={cn(panel, "relative overflow-x-auto")}>
              <h2 id="kpi-report-omissions" className="px-4 pt-4 text-sm font-semibold text-ink">
                Left out, and why ({data.omissions.length})
              </h2>
              <table className="mt-2 w-full min-w-[560px] text-sm" aria-label="Left out of the report">
                <thead className="border-y border-line bg-tint text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">{data.framework === "ESRS" ? "Datapoint or topic" : "Disclosure"}</th>
                    <th scope="col" className="px-3 py-2 font-medium">What it covers</th>
                    <th scope="col" className="px-4 py-2 font-medium">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {data.omissions.map((o, i) => (
                    <tr key={`${o.code}-${i}`} className="border-b border-line last:border-0" data-testid="kpi-report-omission">
                      <th scope="row" className="px-4 py-2 text-left font-num text-xs font-medium text-ink">{o.code}</th>
                      <td className="px-3 py-2 text-ink">{omissionTitle(o)}</td>
                      <td className="px-4 py-2 text-muted">{omissionText(o)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}

      {open && <RowValuesDrawer row={open} year={year} lookup={lookup} onClose={() => setOpen(null)} />}
    </div>
  );
}
