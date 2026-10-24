import { Database } from "lucide-react";
import { Link } from "react-router-dom";
import type { AutoSourceKey, KpiValue } from "../../../lib/kpi/contracts";
import { AUTO_SOURCE_LABEL } from "../../../lib/kpi/labels";
import { Tooltip, cn, focusRing, formatDate } from "../../../ui";

/**
 * KPI-5 · "From your data" (05-ux principle 5, D9): an auto value is read
 * from approved rows, never typed. The chip says where it came from and, when
 * the server sends a link, opens those rows.
 */
export function FromYourDataChip({ source, snapshot, className }: { source: AutoSourceKey | null | undefined; snapshot: KpiValue["auto_snapshot"] | null | undefined; className?: string }) {
  const what = source ? AUTO_SOURCE_LABEL[source] : "Approved rows in ESGLite";
  const when = snapshot?.read_at ? ` Read from ${snapshot.rows} ${snapshot.rows === 1 ? "row" : "rows"} on ${formatDate(snapshot.read_at)}.` : "";
  const chip = (
    <span className={cn("inline-flex items-center gap-1 rounded-chip bg-info-soft px-1.5 py-0.5 text-[11px] font-medium leading-none text-info", className)}>
      <Database aria-hidden className="size-3" />
      From your data
    </span>
  );
  const tip = (
    <span className="block max-w-xs">
      {what}.{when} Fix the source rows to change it.
    </span>
  );
  if (snapshot?.link)
    return (
      <Tooltip content={tip}>
        <Link to={snapshot.link} aria-label={`From your data: ${what}. Open the rows`} className={cn("rounded-chip", focusRing)}>
          {chip}
        </Link>
      </Tooltip>
    );
  return (
    <Tooltip content={tip}>
      <span tabIndex={0} aria-label={`From your data: ${what}`} className={cn("rounded-chip", focusRing)}>
        {chip}
      </span>
    </Tooltip>
  );
}
