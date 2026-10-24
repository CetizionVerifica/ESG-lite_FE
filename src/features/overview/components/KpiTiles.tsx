import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Gauge, ListChecks } from "lucide-react";
import { FRAMEWORK_LABEL } from "../../../lib/kpi/labels";
import { isKpiTrackingOff, useKpiCompanyId, useKpiTracking } from "../../../lib/kpi/switch";
import { getKpiOverview } from "../../../services/kpiService";
import { Button, Skeleton, cn, focusRing, panel } from "../../../ui";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (ym: string | null) => (ym && /^\d{4}-\d{2}$/.test(ym) ? `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}` : null);
const linkCls = cn("inline-flex items-center gap-1 text-sm font-medium text-brand-text underline-offset-2 hover:underline", focusRing);

/**
 * KPI-10 (wave D) · Two tiles on the Overview: "KPI readiness" (coverage per
 * enabled framework, from the server) and "KPIs due this month". Shown only
 * while the company's KPI switch is on; they link to the dashboard and My KPIs.
 */
export function KpiTiles() {
  const on = useKpiTracking();
  const companyId = useKpiCompanyId();
  const q = useQuery({ queryKey: ["kpi", "overview", companyId], queryFn: () => getKpiOverview(companyId), enabled: on, staleTime: 60_000, retry: false });
  if (!on || (q.error && isKpiTrackingOff(q.error))) return null;

  return (
    <section aria-label="KPIs" className="grid gap-4 md:grid-cols-2" data-testid="kpi-overview-tiles">
      <div className={cn(panel, "space-y-3 p-4")} data-testid="kpi-readiness-tile">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Gauge aria-hidden className="size-4 text-muted" />
          KPI readiness
        </h2>
        {q.isPending ? (
          <Skeleton className="h-14 w-full rounded-control" />
        ) : q.isError ? (
          <TileError onRetry={() => void q.refetch()} />
        ) : q.data.readiness.length === 0 ? (
          <p className="text-sm text-muted">No framework is chosen yet. Your admin picks them in KPI setup.</p>
        ) : (
          <ul className="space-y-2">
            {q.data.readiness.map((r) => (
              <li key={r.framework} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-2 text-sm">
                <span className="font-medium text-ink">{FRAMEWORK_LABEL[r.framework] ?? r.framework}</span>
                <span
                  role="progressbar"
                  aria-label={`${r.framework} readiness`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={r.percent ?? 0}
                  className="block h-2 overflow-hidden rounded-full bg-tint"
                >
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Math.max(0, r.percent ?? 0))}%` }} />
                </span>
                <span className="text-right font-num text-ink">{r.percent === null ? "—" : `${r.percent} %`}</span>
              </li>
            ))}
          </ul>
        )}
        <Link to="/kpi/dashboard" className={linkCls}>
          Open KPI dashboard <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>

      <div className={cn(panel, "space-y-3 p-4")} data-testid="kpi-due-tile">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <ListChecks aria-hidden className="size-4 text-muted" />
          KPIs due this month
        </h2>
        {q.isPending ? (
          <Skeleton className="h-14 w-full rounded-control" />
        ) : q.isError ? (
          <TileError onRetry={() => void q.refetch()} />
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-muted">{monthName(q.data.period) ?? "This month"}</p>
            <p className="text-ink">
              <b className="font-num text-2xl font-semibold">{q.data.due.due}</b> <span className="text-sm">due</span>
            </p>
            <p className="text-sm text-muted">
              {q.data.due.sent_back} sent back · {q.data.due.done} done
            </p>
          </div>
        )}
        <Link to={q.data?.period ? `/kpi?period=${q.data.period}` : "/kpi"} className={linkCls}>
          Open My KPIs <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </section>
  );
}

function TileError({ onRetry }: { onRetry: () => void }) {
  return (
    <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-bad">
      Couldn't load this tile.
      <Button size="sm" variant="ghost" onClick={onRetry}>
        Try again
      </Button>
    </p>
  );
}
