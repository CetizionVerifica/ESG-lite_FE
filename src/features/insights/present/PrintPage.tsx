import { useInsightsQuery } from "../../../lib/insights/query";
import { ChartFrameDefaults, formatDate } from "../../../ui";
import { usePanel } from "../api";
import { PanelShell } from "../components/PanelShell";
import { InsightsSurfaceContext } from "../components/presentContext";
import { useInsights } from "../../../lib/insights/switch";
import { SLOTS, storySlotsFor } from "../logic";

/**
 * IN-8 · `/insights/print?…`: what the backend's Playwright printer turns into
 * the one-page PDF snapshot (A4 landscape): hero, the four story panels as
 * static SVG charts (no animation), the top three cards and a footer with the
 * period, sites and "Generated {date} from approved data". No app chrome.
 */
export default function PrintPage() {
  const { query } = useInsightsQuery();
  const summary = usePanel("summary", query);
  const { kpi_tracking: kpiOn } = useInsights();
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-panel text-ink" data-testid="insights-print">
      <div className="mx-auto w-[1123px] space-y-3 p-6 text-xs">
        <h1 className="text-lg font-semibold">Insights</h1>
        <InsightsSurfaceContext.Provider value="print">
          <ChartFrameDefaults.Provider value={{ renderer: "svg", static: true }}>
            <PanelShell slot={SLOTS.hero} query={query} />
            <div className="grid grid-cols-2 gap-3">
              {storySlotsFor(kpiOn).map((id) => (
                <PanelShell key={id} slot={SLOTS[id]} query={query} />
              ))}
            </div>
            <PanelShell slot={SLOTS.cards} query={query} />
          </ChartFrameDefaults.Provider>
        </InsightsSurfaceContext.Provider>
        <footer className="flex justify-between border-t border-line pt-2 text-muted" data-testid="print-footer">
          <span>{summary.data?.label ?? `${query.yearType} ${query.year}`}</span>
          <span>Generated {formatDate(new Date())} from approved data</span>
        </footer>
      </div>
    </div>
  );
}
