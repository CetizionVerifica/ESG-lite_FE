import { useMemo, useState, type ReactNode } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import { Button, ChartFrame, cn, focusRing, formatNumber } from "../../../ui";
import { EventsDrawer } from "../components/EventsDrawer";
import { Legend, LegendItem, LineSwatch } from "../components/kit";
import { usePanelView } from "../components/panelView";
import { useNarrow } from "../hooks/useNarrow";
import type { PanelProps } from "./index";
import { gapYears, pathwayAria, pathwayOption, pathwayTable, renewableLever } from "./pathwayLogic";
import type { Bridge } from "../../../lib/insights/contracts";
import { CalcDrawer } from "../components/CalcDrawer";
import { BRIDGE_COLUMNS, bridgeAriaLabel, bridgeOption, bridgeTableRows } from "./bridgeLogic";

export type PathwayProps = PanelProps<"pathway"> & {
  /** The rule sentence above the chart (IN-3 cards' `pathway_gap` / `pathway_on_track`), wired later. */
  sentence?: ReactNode;
  /** Extra header controls (IN-5's "Pathway | What moved" toggle). */
  actions?: ReactNode;
  /**
   * IN-5 · "What moved": draw the bridge in the same chart instead, so ECharts
   * morphs the bars between the two views (`universalTransition`, bars keep
   * their identity by year through shared group ids).
   */
  whatMoved?: Bridge | null;
};

const Box = ({ className }: { className: string }) => <span className={`inline-block size-2.5 rounded-sm ${className}`} />;

/**
 * IN-4 · C · Pathway (05-ux §4 C): stacked scope bars by year against the
 * dashed science-based pathway, the renewable share on a right 0–100 % axis,
 * shaded years above the pathway, the target-year pin and event lines.
 * "Events" opens the EventsDrawer.
 */
export function Pathway({ response, query, sentence, actions, whatMoved }: PathwayProps) {
  const data = response.data;
  const { view, setView } = usePanelView();
  const narrow = useNarrow();
  const [eventsOpen, setEventsOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const bridge = whatMoved ?? null;
  const yearType = response.period?.yearType ?? query.yearType;
  const table = useMemo(() => pathwayTable(data, yearType), [data, yearType]);
  const aria = useMemo(() => pathwayAria(data, yearType), [data, yearType]);
  const lever = renewableLever(data);
  const hasGap = gapYears(data).length > 0;
  const range = { from: `${data.base_year}-01-01`, to: `${data.target_year + 1}-12-31` };

  return (
    <div className="space-y-2" data-testid="pathway">
      {sentence && <div data-testid="pathway-sentence">{sentence}</div>}
      <ChartFrame
        className="border-0! bg-transparent! p-0!"
        title={bridge ? "What moved" : `Emissions against the ${data.target_year} pathway`}
        unit="tCO₂e"
        subtitle={bridge ? `${bridge.from.year} to ${bridge.to.year}` : `${response.label} · ${formatNumber(data.annual_rate_pct, 1)}% a year from ${data.base_year}`}
        option={(t) => (bridge ? bridgeOption(bridge, t) : pathwayOption(data, t, { yearType, compactMarks: narrow }))}
        height={300}
        table={bridge ? { columns: BRIDGE_COLUMNS, rows: bridgeTableRows(bridge) } : table}
        exportName={bridge ? `emissions-bridge-${bridge.from.year}-${bridge.to.year}` : `insights-pathway-${response.period?.year ?? query.year}`}
        ariaLabel={bridge ? bridgeAriaLabel(bridge) : aria}
        view={view}
        onViewChange={setView}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {bridge ? (
              <button type="button" onClick={() => setCalcOpen(true)} className={cn("rounded-control text-xs font-medium text-brand hover:underline", focusRing)} data-testid="bridge-how">
                How this is calculated
              </button>
            ) : (
              <Button size="sm" variant="secondary" icon={<CalendarDays aria-hidden className="size-4" />} onClick={() => setEventsOpen(true)} data-testid="pathway-events-button">
                Events
              </Button>
            )}
          </div>
        }
        legend={
          bridge ? (
            <Legend label="Bar colours">
              <LegendItem swatch={<Box className="bg-brand" />}>Total</LegendItem>
              <LegendItem swatch={<Box className="bg-bad" />}>Increase (+)</LegendItem>
              <LegendItem swatch={<Box className="bg-good" />}>Decrease (−)</LegendItem>
            </Legend>
          ) : (
            <Legend>
              <LegendItem swatch={<Box className="bg-s1" />}>Scope 1</LegendItem>
              <LegendItem swatch={<Box className="bg-s2" />}>Scope 2</LegendItem>
              <LegendItem swatch={<Box className="bg-s3" />}>Scope 3</LegendItem>
              <LegendItem swatch={<LineSwatch dash className="text-ink" />}>Pathway</LegendItem>
              {lever && <LegendItem swatch={<LineSwatch className="text-accent" />}>{lever.label} (right axis, %)</LegendItem>}
              {hasGap && <LegendItem swatch={<Box className="border border-bad bg-bad-soft" />}>Above pathway</LegendItem>}
              <LegendItem swatch={<MapPin className="size-3.5 text-brand" />}>Target {data.target_year}</LegendItem>
              {data.events.length > 0 && <LegendItem swatch={<LineSwatch dash className="text-muted" />}>Events</LegendItem>}
            </Legend>
          )
        }
      />
      {bridge && bridge.notes.length > 0 && (
        <ul className="space-y-1 text-xs text-muted" data-testid="bridge-notes">
          {bridge.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {bridge && <CalcDrawer open={calcOpen} onClose={() => setCalcOpen(false)} data={bridge} />}
      <EventsDrawer open={eventsOpen} onClose={() => setEventsOpen(false)} range={range} />
    </div>
  );
}
