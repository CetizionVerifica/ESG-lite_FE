// IN-8 · Export helpers: the snapshot file name and "PNG of each chart".
import type { InsightsQuery } from "../../../lib/insights/contracts";

/** The file name of the snapshot: "insights-CY-2026-all-sites.pdf". */
export const snapshotFileName = (q: InsightsQuery) => `insights-${q.yearType}-${q.year}-${q.sites === "all" ? "all-sites" : `sites-${q.sites.join("-")}`}.pdf`;

/** Clicks every chart's own PNG export on the page (ChartFrame's button), one file per chart. Returns how many. */
export function exportAllChartPngs(root: ParentNode = document): number {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-chart-export]"));
  buttons.forEach((b) => b.click());
  return buttons.length;
}

