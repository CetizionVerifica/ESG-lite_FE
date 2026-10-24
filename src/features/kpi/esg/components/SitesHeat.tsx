import { KPI_PILLARS, type KpiEsgSite, type KpiPillar } from "../../../../lib/kpi/contracts";
import { PILLAR_LABEL } from "../../../../lib/kpi/labels";
import { EmptyState, cn, focusRing, formatNumber, panel } from "../../../../ui";
import { PillarBadge } from "../../components/PillarBadge";
import { HEAT_CLASS, HEAT_LEGEND, heatStep } from "../logic";

/**
 * Wave E · Sites × pillars: coverage % in a heat table, one blue hue from
 * light (low) to dark (high), the value printed in every cell. A cell is a
 * button that sets the site and pillar filters; "—" means nothing is expected
 * there.
 */
export function SitesHeat({ sites, site, pillar, onPick }: { sites: KpiEsgSite[]; site: number | null; pillar: KpiPillar | null; onPick: (site: number, pillar: KpiPillar) => void }) {
  return (
    <section aria-labelledby="esg-sites-title" className={cn(panel, "p-4")}>
      <div className="mb-3 space-y-0.5">
        <h2 id="esg-sites-title" className="text-sm font-semibold text-ink">
          Coverage by site
        </h2>
        <p className="text-xs text-muted">Share of each site's KPIs approved, per pillar. Choose a cell to see that site and pillar.</p>
      </div>
      {sites.length === 0 ? (
        <EmptyState compact title="No sites to compare." description="Sites appear here when they have KPIs to enter." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0.5 text-sm" data-testid="esg-heat">
              <caption className="sr-only">Coverage by site and pillar, in percent</caption>
              <thead>
                <tr>
                  <th scope="col" className="px-2 py-1 text-left text-xs font-medium text-muted">
                    Site
                  </th>
                  {KPI_PILLARS.map((p) => (
                    <th key={p} scope="col" className={cn("px-2 py-1 text-center text-xs font-medium text-muted", pillar && pillar !== p && "opacity-60")}>
                      <PillarBadge pillar={p} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.site_id}>
                    <th scope="row" className={cn("max-w-40 truncate px-2 py-1 text-left font-medium text-ink", site === s.site_id && "underline")}>
                      {s.name}
                    </th>
                    {KPI_PILLARS.map((p) => {
                      const v = s.pillars[p];
                      const step = heatStep(v);
                      const on = site === s.site_id && pillar === p;
                      if (step === null)
                        return (
                          <td key={p} className="h-10 min-w-14 rounded-chip bg-tint px-2 text-center text-xs text-muted" data-testid="esg-heat-cell" data-empty="true">
                            <span aria-hidden>—</span>
                            <span className="sr-only">Nothing expected at {s.name} for {PILLAR_LABEL[p]}</span>
                          </td>
                        );
                      return (
                        <td key={p} className="p-0">
                          <button
                            type="button"
                            onClick={() => onPick(s.site_id, p)}
                            aria-pressed={on}
                            aria-label={`${s.name}, ${PILLAR_LABEL[p]}: ${formatNumber(v)} percent covered. Show this site and pillar.`}
                            title={`${s.name} · ${PILLAR_LABEL[p]} · ${formatNumber(v)}% approved`}
                            data-testid="esg-heat-cell"
                            data-site={s.site_id}
                            data-pillar={p}
                            className={cn("h-10 w-full min-w-14 rounded-chip px-2 text-center font-num text-sm font-semibold tabular-nums", HEAT_CLASS[step], on && "ring-2 ring-ink ring-offset-1 ring-offset-panel", focusRing)}
                          >
                            {formatNumber(v)}%
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted" aria-label="Colour scale: lighter is less covered, darker is more">
            <span>Less covered</span>
            <span className="flex">
              {([1, 2, 3, 4, 5] as const).map((n, i) => (
                <span key={n} title={HEAT_LEGEND[i]} className={cn("block h-3 w-6 first:rounded-l-chip last:rounded-r-chip", HEAT_CLASS[n])} />
              ))}
            </span>
            <span>More covered</span>
            <span className="ml-2 inline-flex items-center gap-1">
              <span aria-hidden className="block h-3 w-6 rounded-chip bg-tint" />— nothing expected
            </span>
          </div>
        </>
      )}
    </section>
  );
}
