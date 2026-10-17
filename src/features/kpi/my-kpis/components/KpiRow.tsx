import { Calculator } from "lucide-react";
import type { MyKpiItem } from "../../../../lib/kpi/contracts";
import { formatWithUnit } from "../../../../lib/kpi/units";
import { Badge, Button, StatusPill, cn } from "../../../../ui";
import { FormulaExplainer } from "../../components/FormulaExplainer";
import { FromYourDataChip } from "../../components/FromYourDataChip";
import { dueLine, hasAnswer, isReadOnlySource } from "../logic";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const lastShort = (i: MyKpiItem) => {
  if (!i.last_value) return null;
  const m = Number(i.last_value.period_start.slice(5, 7));
  const label = i.frequency === "monthly" ? `Last ${MONTH_SHORT[m - 1]}` : i.frequency === "quarterly" ? "Same quarter last year" : "Last year";
  return `${label} ${formatWithUnit(i.last_value.value, i.last_value.unit ?? i.canonical_unit)}`;
};

/**
 * One line of My KPIs (05-ux S3): the plain name, last year's figure and the
 * due date, with its status and one action. Auto and calculated items are
 * read-only: "From your data" or "Calculated", never a card.
 */
export function KpiRow({ item, today, showSite, onOpen }: { item: MyKpiItem; today: string; showSite: boolean; onOpen: () => void }) {
  const v = item.value;
  const site = showSite ? (item.site_name ?? "Company") : null;

  if (isReadOnlySource(item)) {
    const value = v?.value_numeric ?? v?.value_canonical ?? null;
    return (
      <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between" data-testid="kpi-row">
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-ink">{item.name}</p>
          {item.source === "formula" && item.formula ? (
            <FormulaExplainer name={item.name} formula={item.formula} inputs={item.inputs ?? []} unit={item.canonical_unit} decimals={item.decimals} serverValue={value} className="text-muted" />
          ) : (
            <p className="text-sm text-muted">{[site, "Filled in from approved data. Nothing to enter."].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {value !== null && <span className="font-num text-sm font-medium text-ink">{formatWithUnit(value, v?.unit ?? item.canonical_unit, item.decimals)}</span>}
          {item.source === "auto" ? (
            <FromYourDataChip source={item.auto_source} snapshot={v?.auto_snapshot} />
          ) : (
            <Badge tone="info">
              <Calculator aria-hidden className="mr-1 size-3" />
              Calculated
            </Badge>
          )}
        </div>
      </li>
    );
  }

  const status = v?.status ?? null;
  const sub = [site, lastShort(item), item.group === "done" ? null : dueLine(item, today)].filter(Boolean);
  const action = item.group === "sent_back" ? "Fix" : item.group === "done" ? "View" : v && hasAnswer(v) ? "Continue" : "Enter";
  return (
    <li className={cn("flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between", item.group === "sent_back" && "bg-warn-soft/40")} data-testid="kpi-row">
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-ink">{item.name}</p>
        {sub.length > 0 && <p className="flex flex-wrap gap-x-3 text-sm text-muted">{sub.map((s) => <span key={s as string}>{s}</span>)}</p>}
        {(item.group === "sent_back" || status === "draft") && v?.review_comment && (
          <p className="text-sm text-ink">
            {item.reviewer_name ?? "Your reviewer"}: “{v.review_comment}”
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {item.group === "done" && v && <span className="font-num text-sm text-ink">{v.value_numeric !== null ? formatWithUnit(v.value_numeric, v.unit, item.decimals) : v.value_text}</span>}
        {status === "draft" && hasAnswer(v) && <StatusPill status="draft" label="Draft saved" size="sm" />}
        {status === "rejected" && <StatusPill status="rejected" label="Sent back" size="sm" />}
        {status === "pending" && <StatusPill status="pending" size="sm" />}
        {status === "approved" && <StatusPill status="approved" size="sm" />}
        <Button size="sm" variant={item.group === "done" ? "ghost" : action === "Enter" ? "secondary" : "primary"} onClick={onOpen} aria-label={`${action}: ${item.name}${site ? `, ${site}` : ""}`}>
          {action}
        </Button>
      </div>
    </li>
  );
}
