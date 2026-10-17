import type { KpiDefinition, KpiSetupPerson, KpiSetupSite } from "../../../../lib/kpi/contracts";
import { Badge, Button, Combobox, cn, panel } from "../../../../ui";
import { cellKey, eligibleOwners } from "../logic";

type Props = {
  defs: KpiDefinition[];
  sites: KpiSetupSite[];
  people: KpiSetupPerson[];
  owners: Map<string, number | null>;
  onOwner: (key: string, owner: number | null) => void;
  onApplyAll: (kpiId: number) => void;
  missing: string[] | null;
};

const personLabel = (p: KpiSetupPerson) => `${p.name} (${p.role})`;

/**
 * KPI-3 step 4 (05-ux S2): who enters what. Site KPIs are a matrix of KPIs ×
 * sites, defaulted to each site's data-entry user; company KPIs go to an
 * Admin. Reviewers are the site's managers. "Apply to all sites" copies a
 * row's first person to every site they work at.
 */
export function OwnersStep({ defs, sites, people, owners, onOwner, onApplyAll, missing }: Props) {
  const siteDefs = defs.filter((d) => d.level === "site");
  const companyDefs = defs.filter((d) => d.level === "company");
  const options = (siteId: number | null) => eligibleOwners(siteId, people).map((p) => ({ value: p.user_id, label: personLabel(p) }));
  const siteOptions = new Map(sites.map((s) => [s.site_id, options(s.site_id)]));
  const companyOptions = options(null);
  const flagged = new Set(missing ?? []);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">Each person sees only their own KPIs on My KPIs. Values go to the site's managers for review. Auto KPIs need no typing; their owner sees them filled in.</p>

      {siteDefs.length > 0 && (
        <section aria-labelledby="owners-site" className="space-y-2">
          <h3 id="owners-site" className="text-sm font-semibold text-ink">
            Per site
          </h3>
          <div className={cn(panel, "relative overflow-x-auto")}>
            <table className="w-full min-w-max border-collapse text-sm" aria-label="Who enters each site KPI">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th scope="col" className="sticky left-0 z-10 bg-panel px-3 py-2 font-medium">
                    KPI
                  </th>
                  {sites.map((s) => (
                    <th key={s.site_id} scope="col" className="min-w-52 px-3 py-2 font-medium">
                      {s.name}
                    </th>
                  ))}
                  {sites.length > 1 && <th scope="col" className="px-3 py-2" aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {siteDefs.map((d) => (
                  <tr key={d.id} className="border-b border-line last:border-0 [content-visibility:auto]" data-testid="owner-row">
                    <th scope="row" className="sticky left-0 z-10 max-w-56 bg-panel px-3 py-2 text-left font-medium text-ink">
                      <span className="block">{d.name}</span>
                      {d.source === "auto" && <Badge tone="info">Auto</Badge>}
                    </th>
                    {sites.map((s) => {
                      const key = cellKey(d.id, s.site_id);
                      return (
                        <td key={s.site_id} className={cn("px-3 py-1.5 align-top", flagged.has(key) && "bg-bad-soft/40")}>
                          <Combobox<number>
                            label={`${d.name} at ${s.name}`}
                            hideLabel
                            value={owners.get(key) ?? null}
                            onChange={(v) => onOwner(key, v)}
                            options={siteOptions.get(s.site_id) ?? []}
                            placeholder="Choose a person"
                            emptyText="Nobody works at this site yet"
                            error={flagged.has(key) ? "Choose who enters it." : undefined}
                          />
                        </td>
                      );
                    })}
                    {sites.length > 1 && (
                      <td className="px-3 py-1.5 align-top">
                        <Button size="sm" variant="ghost" onClick={() => onApplyAll(d.id)} aria-label={`Apply ${d.name}'s first person to all sites`}>
                          Apply to all sites
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {companyDefs.length > 0 && (
        <section aria-labelledby="owners-company" className="space-y-2">
          <h3 id="owners-company" className="text-sm font-semibold text-ink">
            For the whole company
          </h3>
          <ul className={cn(panel, "divide-y divide-line")}>
            {companyDefs.map((d) => {
              const key = cellKey(d.id, null);
              return (
                <li key={d.id} className={cn("grid items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_18rem]", flagged.has(key) && "bg-bad-soft/40")} data-testid="owner-row">
                  <span className="text-sm font-medium text-ink">
                    {d.name} {d.source === "auto" && <Badge tone="info">Auto</Badge>}
                  </span>
                  <Combobox<number>
                    label={`${d.name} for the company`}
                    hideLabel
                    value={owners.get(key) ?? null}
                    onChange={(v) => onOwner(key, v)}
                    options={companyOptions}
                    placeholder="Choose a person"
                    error={flagged.has(key) ? "Choose who enters it." : undefined}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
