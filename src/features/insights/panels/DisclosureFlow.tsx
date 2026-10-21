import { useLayoutEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FIT_LABEL } from "../../../lib/kpi/labels";
import { Button, ChartFrame, cn } from "../../../ui";
import { Legend, LegendItem } from "../components/kit";
import { usePanelView } from "../components/panelView";
import { useNarrow } from "../hooks/useNarrow";
import type { PanelProps } from "./index";
import { COUNT_LEGEND_TITLE, FITS, type Fit, flowAria, flowHeight, flowOption, flowTable, flowTarget, hasDisclosures } from "./flowLogic";

/**
 * IN-6 · Data-to-disclosure flow (05-ux §4 E, I9): sites → scopes → GHG KPIs
 * in tCO₂e, then KPIs → disclosures as counts. Without KPI tracking the server
 * sends sites → scopes → top categories and there is no count part. Hover
 * focuses a node's neighbours; a click opens the server's link (or a
 * disclosure's framework report). Below 640 px it opens as a table with a
 * "Show diagram" button.
 */
export function DisclosureFlow({ response }: PanelProps<"flow">) {
  const flow = response.data;
  const links = response.links;
  const navigate = useNavigate();
  const narrow = useNarrow();
  const { view, setView } = usePanelView();
  const kpiOn = hasDisclosures(flow);

  // Phones start on the table (05-ux §3); the button below brings the diagram back.
  useLayoutEffect(() => {
    if (narrow) setView("table");
    // Only when the viewport becomes narrow, not on every view change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrow]);

  const table = useMemo(() => flowTable(flow), [flow]);
  const onEvents = useMemo(
    () => ({
      click: (params: unknown) => {
        const to = flowTarget(params, links);
        if (to) navigate(to);
      },
    }),
    [links, navigate],
  );

  return (
    <div data-testid="disclosure-flow" className="min-w-0">
      <ChartFrame
        title="From entries to disclosures"
        unit="tCO₂e"
        subtitle={kpiOn ? "Width shows tCO₂e from sites to KPIs, then the count of disclosures each KPI feeds." : "Width shows tCO₂e from sites to scopes to the largest categories."}
        option={(t) => flowOption(flow, t)}
        height={flowHeight(flow)}
        table={table}
        exportName="insights-data-flow"
        ariaLabel={flowAria(flow)}
        view={view}
        onViewChange={setView}
        onEvents={onEvents}
        empty={flow.nodes.length === 0}
        emptyText="Approve emission entries for this period to see how they flow."
        actions={
          narrow && view === "table" ? (
            <Button size="sm" variant="secondary" onClick={() => setView("chart")} data-testid="flow-show-diagram">
              Show diagram
            </Button>
          ) : undefined
        }
        legend={<FlowLegend kpiOn={kpiOn} />}
      />
    </div>
  );
}

const FIT_SWATCH: Record<Fit, string> = { exact: "opacity-90", partial: "opacity-60", derived: "opacity-30" };

function Box({ className }: { className: string }) {
  return <span className={cn("inline-block size-2.5 rounded-sm", className)} />;
}

function Band({ className }: { className: string }) {
  return (
    <svg width="22" height="8" aria-hidden className={className}>
      <rect x="0" y="1" width="22" height="6" rx="1" fill="currentColor" />
    </svg>
  );
}

/** What the colours and widths mean, in words (colour never alone). The count part only with disclosures. */
export function FlowLegend({ kpiOn }: { kpiOn: boolean }) {
  return (
    <div className="space-y-1.5" data-testid="flow-legend">
      <Legend label="Columns">
        <LegendItem swatch={<Box className="bg-series-1" />}>Sites</LegendItem>
        <LegendItem
          swatch={
            <span className="inline-flex gap-0.5">
              <Box className="bg-s1" />
              <Box className="bg-s2" />
              <Box className="bg-s3" />
            </span>
          }
        >
          Scopes 1, 2 and 3
        </LegendItem>
        <LegendItem swatch={<Box className="bg-pillar-e" />}>{kpiOn ? "KPIs" : "Categories"}</LegendItem>
        {kpiOn && <LegendItem swatch={<Box className="bg-muted" />}>Disclosures</LegendItem>}
        <LegendItem swatch={<Band className="text-brand opacity-50" />}>tCO₂e (link width)</LegendItem>
      </Legend>
      {kpiOn && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" data-testid="flow-legend-count">
          <span className="font-medium text-ink">{COUNT_LEGEND_TITLE}</span>
          <Legend label={COUNT_LEGEND_TITLE}>
            {FITS.map((f) => (
              <LegendItem key={f} swatch={<Band className={cn("text-muted", FIT_SWATCH[f])} />}>
                {FIT_LABEL[f]} fit
              </LegendItem>
            ))}
          </Legend>
        </div>
      )}
    </div>
  );
}
