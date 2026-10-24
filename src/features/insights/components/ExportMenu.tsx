import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import type { InsightsQuery } from "../../../lib/insights/contracts";
import { useInsightsCompanyId } from "../../../lib/insights/switch";
import { getInsightsSnapshot } from "../../../services/insightsService";
import { Button, Menu, useToast } from "../../../ui";
import { exportAllChartPngs, printViewPath, snapshotErrorCode, snapshotErrorText, snapshotFileName } from "./exportLogic";

/**
 * IN-8 · Export ▾ (05-ux §3): "PDF snapshot" (one A4 landscape page from the
 * server's printer), "Print view" (/insights/print in a new tab, for the
 * browser's own Print when the server has no printer) and "PNG of each chart"
 * (ChartFrame's existing export).
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
      toast({ title: snapshotErrorText(await snapshotErrorCode(e)), tone: "bad" });
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
        { label: "Print view", onSelect: () => window.open(printViewPath(query), "_blank", "noopener") },
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
