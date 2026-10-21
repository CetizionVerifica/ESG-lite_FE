// IN-8 · Export helpers: the snapshot file name, the snapshot's error code, the print view link and "PNG of each chart".
import { isInErrorCode, type InErrorCode, type InsightsQuery } from "../../../lib/insights/contracts";
import { writeInsightsQuery } from "../../../lib/insights/query";

/** The file name of the snapshot: "insights-CY-2026-all-sites.pdf". */
export const snapshotFileName = (q: InsightsQuery) => `insights-${q.yearType}-${q.year}-${q.sites === "all" ? "all-sites" : `sites-${q.sites.join("-")}`}.pdf`;

/** A blob's text (FileReader: every browser, and jsdom, which has no Blob.text). */
const blobText = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

/**
 * The Insights error code of a failed snapshot request. The PDF is asked for as a
 * blob, so an error body arrives as a Blob too and is read as JSON here.
 */
export async function snapshotErrorCode(error: unknown): Promise<InErrorCode | null> {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  let body: unknown = data;
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    try {
      body = JSON.parse(await blobText(data));
    } catch {
      return null;
    }
  }
  const code = (body as { code?: unknown } | null)?.code;
  return isInErrorCode(code) ? code : null;
}

/** What the toast says when the snapshot fails. */
export function snapshotErrorText(code: InErrorCode | null): string {
  if (code === "IN_SNAPSHOT_TIMEOUT") return "The PDF snapshot took too long. Try again with fewer sites.";
  if (code === "IN_SNAPSHOT_UNAVAILABLE") return "PDF snapshots aren't set up on this server yet. Use Print view and your browser's Print instead.";
  return "Couldn't make the PDF snapshot. Try again.";
}

/** `/insights/print` with the page's filters: the browser-printable view. The year is always named, so the link keeps its period. */
export const printViewPath = (q: InsightsQuery) => {
  const params = writeInsightsQuery(new URLSearchParams(), q);
  params.set("year", String(q.year));
  params.sort();
  return `/insights/print?${params.toString()}`;
};

/** Clicks every chart's own PNG export on the page (ChartFrame's button), one file per chart. Returns how many. */
export function exportAllChartPngs(root: ParentNode = document): number {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-chart-export]"));
  buttons.forEach((b) => b.click());
  return buttons.length;
}
