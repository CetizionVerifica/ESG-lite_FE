import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, ChartFrame, cn, formatEmissions } from "../../../ui";
import { changeText } from "../../../lib/insights/labels";
import { compareLabel } from "../components/heroLogic";
import { ChangeChip, Legend, LegendItem } from "../components/kit";
import { usePanelView } from "../components/panelView";
import type { PanelProps } from "./index";
import { pctText } from "./shared";
import { SITE_COLUMNS, intensityText, siteAria, siteCompareOption, siteTable } from "./siteCompareLogic";

const Box = ({ className }: { className: string }) => <span className={`inline-block size-2.5 rounded-sm ${className}`} />;

/**
 * IN-11 · Sites tab (05-ux §3 below the fold): one stacked bar per site (Scope
 * 1, 2, 3, largest net first) with its table view, and a compact list per
 * site: net with its change on last year, share, intensity, completeness and
 * entries waiting. A bar or a site name opens that site's Overview (the
 * server's link). Every figure is the server's.
 */
export function SiteCompare({ response, query }: PanelProps<"site_compare">) {
  const data = response.data;
  const navigate = useNavigate();
  const { view, setView } = usePanelView();
  // The Overview's comparison is the same period last year, whatever the page's Compare is set to.
  const vs = compareLabel({ year: query.year, yearType: query.yearType, compare: "prior" });
  const table = useMemo(
    () => ({
      columns: SITE_COLUMNS,
      rows: siteTable(data, vs).map(({ link, ...r }) => ({
        ...r,
        site: (
          <Link to={link} className="font-medium text-brand-text underline-offset-2 hover:underline" data-testid="site-compare-link">
            {r.site}
          </Link>
        ),
      })),
    }),
    [data, vs],
  );
  // Bars are drawn bottom-up (largest on top), so a bar's index counts from the end of the rows.
  const onEvents = {
    click: (p: unknown) => {
      const row = data.rows[data.rows.length - 1 - ((p as { dataIndex?: number }).dataIndex ?? -1)];
      if (row) navigate(row.link);
    },
  };
  return (
    <div data-testid="site-compare" className="space-y-4">
      <ChartFrame
        className="border-0! bg-transparent! p-0!"
        title="Emissions by site"
        unit="tCO₂e"
        subtitle={response.label}
        option={(t) => siteCompareOption(data, t)}
        height={Math.max(160, data.rows.length * 44 + 40)}
        table={table}
        exportName="insights-sites"
        ariaLabel={siteAria(data, vs)}
        view={view}
        onViewChange={setView}
        onEvents={onEvents}
        legend={
          <Legend label="Scopes">
            <LegendItem swatch={<Box className="bg-s1" />}>Scope 1</LegendItem>
            <LegendItem swatch={<Box className="bg-s2" />}>Scope 2</LegendItem>
            <LegendItem swatch={<Box className="bg-s3" />}>Scope 3</LegendItem>
          </Legend>
        }
      />
      <ul aria-label="Sites" className="grid gap-2">
        {data.rows.map((r) => {
          const change = changeText(r.change_pct, r.good, vs);
          const intensity = intensityText(r);
          const complete = r.completeness_pct;
          return (
            <li
              key={r.site_id}
              data-testid="site-compare-row"
              className="grid gap-2 rounded-control border border-line bg-panel p-3 text-sm sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Link to={r.link} className="font-medium text-brand-text underline-offset-2 hover:underline">
                  {r.site}
                </Link>
                {r.pending > 0 && (
                  <span data-testid="site-compare-pending">
                    <Badge tone="warn">{r.pending} pending</Badge>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-num text-ink">{formatEmissions(r.net)}</span>
                {change ? <ChangeChip change={change} /> : <span className="text-xs text-muted">no last year yet</span>}
              </div>
              <div className="text-xs text-muted">
                Share <span className="font-num text-ink">{pctText(r.share_pct)}</span>
              </div>
              <div className="text-xs text-muted">
                {intensity ? (
                  <>
                    Intensity <span className="font-num text-ink">{intensity}</span>
                  </>
                ) : (
                  <Link to="/production" className="text-brand-text underline-offset-2 hover:underline">
                    Add production data
                  </Link>
                )}
              </div>
              <div className="text-xs text-muted">
                <span>
                  Complete <span className="font-num text-ink">{pctText(complete)}</span>
                </span>
                <span aria-hidden className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-tint">
                  <span className={cn("block h-full rounded-full", complete !== null && complete >= 100 ? "bg-good" : "bg-brand")} style={{ width: `${Math.max(0, Math.min(100, complete ?? 0))}%` }} />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
