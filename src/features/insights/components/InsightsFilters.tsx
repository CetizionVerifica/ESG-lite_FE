import { PILLARS, type Compare, type InsightsQuery, type Pillar, type YearType } from "../../../lib/insights/contracts";
import { PILLAR_COLOR, PILLAR_LABEL, PILLAR_LETTER } from "../../../lib/kpi/labels";
import type { InsightsPatch } from "../../../lib/insights/query";
import { SegmentedControl, Select, Skeleton, cn, focusRing } from "../../../ui";
import { yearOptions } from "../logic";

const chip = (on: boolean) =>
  cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
    on ? "border-brand bg-tint text-ink" : "border-line bg-panel text-muted hover:bg-tint hover:text-ink",
    focusRing,
  );

export interface InsightsFiltersProps {
  query: InsightsQuery;
  sites: { site_id: number; name: string }[] | undefined;
  /** Show the E/S/G chips (KPI tracking on). */
  pillars: boolean;
  onChange: (patch: InsightsPatch) => void;
  thisYear: number;
}

/**
 * IN-0 · The header filters (05-ux §3): site chips, E/S/G chips, CY | FY and
 * the year, compare with last year or the base year. Everything lives in the
 * URL; every panel refetches on change.
 */
export function InsightsFilters({ query, sites, pillars, onChange, thisYear }: InsightsFiltersProps) {
  const chosen = query.sites === "all" ? [] : query.sites;
  const toggleSite = (id: number) => {
    const next = chosen.includes(id) ? chosen.filter((s) => s !== id) : [...chosen, id];
    onChange({ sites: next.length === 0 || (sites && next.length === sites.length) ? "all" : next });
  };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="insights-filters">
      <div role="group" aria-label="Sites" className="flex flex-wrap items-center gap-1.5">
        {!sites ? (
          <Skeleton className="h-8 w-40" />
        ) : (
          <>
            <button type="button" className={chip(chosen.length === 0)} aria-pressed={chosen.length === 0} onClick={() => onChange({ sites: "all" })}>
              All sites
            </button>
            {sites.length > 1 &&
              sites.map((s) => (
                <button key={s.site_id} type="button" className={chip(chosen.includes(s.site_id))} aria-pressed={chosen.includes(s.site_id)} onClick={() => toggleSite(s.site_id)}>
                  {s.name}
                </button>
              ))}
          </>
        )}
      </div>
      {pillars && (
        <div role="group" aria-label="Pillar" className="flex items-center gap-1.5">
          {PILLARS.map((p: Pillar) => (
            <button key={p} type="button" className={chip(query.pillar === p)} aria-pressed={query.pillar === p} title={PILLAR_LABEL[p]} onClick={() => onChange({ pillar: query.pillar === p ? null : p })}>
              <span aria-hidden className={cn("size-2 rounded-full", PILLAR_COLOR[p].bg)} />
              <span aria-hidden>{PILLAR_LETTER[p]}</span>
              <span className="sr-only">{PILLAR_LABEL[p]}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <SegmentedControl<YearType>
          label="Year type"
          size="sm"
          value={query.yearType}
          onChange={(yearType) => onChange({ yearType })}
          options={[
            { value: "CY", label: "CY" },
            { value: "FY", label: "FY" },
          ]}
        />
        <Select<number>
          label="Year"
          hideLabel
          className="w-24"
          value={query.year}
          onChange={(year) => onChange({ year: year ?? thisYear })}
          options={yearOptions(thisYear).map((y) => ({ value: y, label: query.yearType === "FY" ? `FY ${y}` : String(y) }))}
        />
      </div>
      <SegmentedControl<Compare>
        label="Compare with"
        size="sm"
        value={query.compare}
        onChange={(compare) => onChange({ compare })}
        options={[
          { value: "prior", label: "Last year" },
          { value: "base", label: "Base year" },
        ]}
      />
    </div>
  );
}
