import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { inErrorCode, type InsightsQuery } from "../../../lib/insights/contracts";
import { useInsightsCompanyId } from "../../../lib/insights/switch";
import { getInsightsSnapshot } from "../../../services/insightsService";
import { Button, Menu, useToast } from "../../../ui";

/** The file name of the snapshot: "insights-CY-2026-all-sites.pdf". */
export const snapshotFileName = (q: InsightsQuery) => `insights-${q.yearType}-${q.year}-${q.sites === "all" ? "all-sites" : `sites-${q.sites.join("-")}`}.pdf`;

/** Clicks every chart's own PNG export on the page (ChartFrame's button), one file per chart. Returns how many. */
export function exportAllChartPngs(root: ParentNode = document): number {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-chart-export]"));
  buttons.forEach((b) => b.click());
  return buttons.length;
}

/**
 * IN-8 · Export ▾ (05-ux §3): "PDF snapshot" (one A4 landscape page from the
 * server's printer) and "PNG of each chart" (ChartFrame's existing export).
 */
export function ExportMenu({ query }: { query: InsightsQuery }) {
  const companyId = useInsightsCompanyId();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const pdf = async () => {
    setBusy(true);
    try {
      const blob = await getInsightsSnapshot(query, companyId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = snapshotFileName(query);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "PDF snapshot downloaded.", tone: "good" });
    } catch (e) {
      const code = inErrorCode(e);
      toast({ title: code === "IN_SNAPSHOT_TIMEOUT" ? "The PDF snapshot took too long. Try again with fewer sites." : "Couldn't make the PDF snapshot. Try again.", tone: "bad" });
    } finally {
      setBusy(false);
    }
  };

  const pngs = () => {
    const n = exportAllChartPngs();
    toast({ title: n ? `Downloading ${n} chart ${n === 1 ? "image" : "images"}.` : "No charts on screen to export. Switch them back from the table view.", tone: n ? "good" : "neutral" });
  };

  return (
    <Menu
      label="Export"
      items={[
        { label: "PDF snapshot", onSelect: () => void pdf() },
        { label: "PNG of each chart", onSelect: pngs },
      ]}
      trigger={(props) => (
        <Button {...props} loading={busy} icon={<Download className="size-4" aria-hidden />} data-testid="insights-export">
          Export
          <ChevronDown aria-hidden className="size-3.5" />
        </Button>
      )}
    />
  );
}
