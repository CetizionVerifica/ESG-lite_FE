import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ListChecks } from "lucide-react";
import { useKpiTracking } from "../../../lib/kpi/switch";
import { getMyKpis } from "../../../services/kpiService";
import { panel } from "../../../ui";
import { linkButton } from "./linkStyles";

/**
 * KPI-7 · "KPIs due" beside the emission checklist (05-ux S3): what's due and
 * sent back on My KPIs for this month. Shown only while the company's KPI
 * switch is on, and only when the person owes KPIs.
 */
export function KpisDueCard({ month }: { month: string }) {
  const on = useKpiTracking();
  const my = useQuery({ queryKey: ["kpi", "my", null, month, null], queryFn: () => getMyKpis(month), enabled: on, staleTime: 30_000, retry: false });
  if (!on || !my.data) return null;
  const manual = my.data.items.filter((i) => i.source === "manual");
  if (!manual.length) return null;
  const due = manual.filter((i) => i.group === "due").length;
  const back = manual.filter((i) => i.group === "sent_back").length;
  return (
    <section aria-label="KPIs due" className={`${panel} space-y-3 p-4`} data-testid="kpis-due-card">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <ListChecks aria-hidden className="size-4 text-muted" />
        KPIs
      </h2>
      <p className="text-sm text-ink">
        {due || back ? (
          <>
            KPIs due: <b className="font-num">{due}</b> · Sent back: <b className="font-num">{back}</b>
          </>
        ) : (
          "All your KPIs are in for this month."
        )}
      </p>
      <Link to={`/kpi?period=${month}`} className={linkButton.secondarySm}>
        Open My KPIs
      </Link>
    </section>
  );
}
