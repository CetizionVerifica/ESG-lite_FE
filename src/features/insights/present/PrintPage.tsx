import { useInsightsQuery } from "../../../lib/insights/query";
import { Printer } from "lucide-react";
import { Button, ChartFrameDefaults, formatDate } from "../../../ui";
import { usePanel } from "../api";
import { PanelShell } from "../components/PanelShell";
import { InsightsSurfaceContext } from "../components/presentContext";
import { useInsights } from "../../../lib/insights/switch";
import { SLOTS, storySlotsFor } from "../logic";

/**
 * IN-8 · `/insights/print?…`: the page laid out for one A4 landscape sheet:
 * hero, the four story panels as static SVG charts (no animation), the top
 * three cards and a footer with the period, sites and "Generated {date} from
 * approved data". No app chrome. Export ▾ "Print view" opens it in a new tab
 * and its Print button calls the browser's Print. The server's PDF snapshot is
 * built from its own HTML (ESG-lite src/insights/panels/snapshotHtml.ts), so
 * this page is the fallback when the server has no printer.
 */
/**
 * The browser's Print: only this view (not the app shell under it), at its full
 * height rather than the screen-sized scroll box, and without buttons.
 */
const PRINT_CSS = `@media print {
  @page { size: A4 landscape; margin: 8mm; }
  body * { visibility: hidden; }
  [data-testid="insights-print"], [data-testid="insights-print"] * { visibility: visible; }
  [data-testid="insights-print"] { position: absolute; inset: 0 auto auto 0; overflow: visible; }
  [data-testid="insights-print"] button { display: none; }
}`;

export default function PrintPage() {
  const { query } = useInsightsQuery();
  const summary = usePanel("summary", query);
  const { kpi_tracking: kpiOn } = useInsights();
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-panel text-ink" data-testid="insights-print">
      <style>{PRINT_CSS}</style>
      <div className="mx-auto w-[1123px] space-y-3 p-6 text-xs">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Insights</h1>
          <Button className="print:hidden" icon={<Printer className="size-4" aria-hidden />} onClick={() => window.print()} data-testid="insights-print-button">
            Print
          </Button>
        </div>
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
