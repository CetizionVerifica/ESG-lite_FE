import { Link } from "react-router-dom";
import { ChevronRight, Circle, CircleCheck, CircleDashed, CircleDot } from "lucide-react";
import { StatusPill, cn, focusRing, formatEmissions } from "../../../ui";
import type { MyMonthCategory, MyMonthSite } from "../../../services/myMonthService";
import { addDataLink, entriesLink, entriesSummary, groupByScope, rowMark, visibleCategories, yearlyLabel } from "../logic";
import { linkButton } from "./linkStyles";

const MARK = {
  full: { icon: CircleCheck, className: "text-good" },
  half: { icon: CircleDot, className: "text-warn" },
  empty: { icon: Circle, className: "text-muted" },
} as const;

/** "To do" is neutral (--t-muted), not a status colour. */
function TodoPill() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-tint px-2 py-0.5 text-xs font-medium text-muted">
      <CircleDashed aria-hidden className="size-3.5" />
      To do
    </span>
  );
}

function Row({ siteId, category, month }: { siteId: number; category: MyMonthCategory; month: string }) {
  const mark = MARK[rowMark(category)];
  const Mark = mark.icon;
  const yearly = yearlyLabel(category);
  const summary = entriesSummary(category);
  const todo = category.status === "todo";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap">
      <Mark aria-hidden className={cn("size-4 shrink-0", mark.className)} />
      <div className="min-w-0 flex-1 basis-48 sm:basis-auto">
        <p className="text-sm font-medium text-ink sm:truncate">{category.category_name}</p>
        {(yearly || summary) && (
          <p className="text-xs text-muted">{[yearly, summary].filter(Boolean).join(" · ")}</p>
        )}
      </div>
      <div className="ml-auto flex items-center gap-3">
        {category.status === "todo" ? (
          <TodoPill />
        ) : (
          category.status !== "covered" && <StatusPill status={category.status} />
        )}
        <span className="w-24 whitespace-nowrap text-right font-num text-sm tabular-nums text-ink">
          {category.status === "pending" || category.status === "approved" ? formatEmissions(category.total_emission) : ""}
        </span>
        {todo ? (
          <Link
            to={addDataLink(siteId, category, month)}
            className={cn(linkButton.secondarySm, "w-14")}
            aria-label={`Add ${category.category_name}`}
          >
            Add
          </Link>
        ) : (
          <Link
            to={entriesLink(siteId, category, month)}
            className={cn("flex h-8 w-14 items-center justify-center rounded-control text-muted hover:bg-tint hover:text-ink", focusRing)}
            aria-label={`View ${category.category_name} entries`}
          >
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        )}
      </div>
    </li>
  );
}

/** One site's checklist, grouped by scope. */
export function Checklist({ site, month, showSiteName }: { site: MyMonthSite; month: string; showSiteName: boolean }) {
  const groups = groupByScope(visibleCategories(site));
  const covered = site.categories.length - visibleCategories(site).length;
  const headingId = `checklist-${site.site_id}`;
  return (
    <section aria-labelledby={headingId} className="rounded-card border border-line bg-panel">
      <h2 id={headingId} className={cn("px-4 pt-4 text-sm font-semibold text-ink", !showSiteName && "sr-only")}>
        {showSiteName ? site.name : "Checklist"}
      </h2>
      {groups.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted">Nothing to file for this site this month.</p>
      ) : (
        <div className="divide-y divide-line">
          {groups.map((g) => (
            <div key={g.key} className="sm:grid sm:grid-cols-[88px_minmax(0,1fr)]">
              <h3 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-muted sm:py-4">{g.label}</h3>
              <ul className="divide-y divide-line" aria-label={g.label}>
                {g.categories.map((c) => (
                  <Row key={c.category_id} siteId={site.site_id} category={c} month={month} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {covered > 0 && (
        <p className="border-t border-line px-4 py-3 text-xs text-muted">
          {covered} {covered === 1 ? "category is" : "categories are"} covered by a yearly filing this month.
        </p>
      )}
    </section>
  );
}
