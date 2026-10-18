import { useState } from "react";
import { Plus, X } from "lucide-react";
import { KPI_TOPICS, type KpiDefinition, type KpiSetupPerson, type KpiSetupSite, type KpiTopic } from "../../../../lib/kpi/contracts";
import { TOPIC_LABEL } from "../../../../lib/kpi/labels";
import { Badge, Button, Combobox, EmptyState, Select, TabPanel, Tabs, cn, focusRing, panel } from "../../../../ui";
import { type TopicGrid, cellKey, differsFromTopic, eligibleOwners, kpiCountText, parseCellKey, topicKey } from "../logic";

type View = "topics" | "exceptions";

type Props = {
  defs: KpiDefinition[];
  sites: KpiSetupSite[];
  people: KpiSetupPerson[];
  grid: TopicGrid;
  owners: Map<string, number | null>;
  onOwner: (key: string, owner: number | null) => void;
  onSameForEverySite: (topic: KpiTopic) => void;
  overrides: Map<string, number | null>;
  onOverrides: (next: Map<string, number | null>) => void;
  /** Topic slots left without an owner after "Finish" was pressed. */
  missing: string[] | null;
};

const personLabel = (p: KpiSetupPerson) => `${p.name} (${p.role})`;
const COMPANY = "c";

/**
 * KPI-3 step 4 (D17, 05-ux S2 as changed in wave D): who enters what, by
 * topic. A grid of topics × sites (plus the company level) with one person
 * per cell; every KPI of that topic at that site goes to them, including
 * KPIs ticked later. "Exceptions" sends one KPI to someone else.
 */
export function TopicOwnersStep({ defs, sites, people, grid, owners, onOwner, onSameForEverySite, overrides, onOverrides, missing }: Props) {
  const [view, setView] = useState<View>("topics");
  const options = (siteId: number | null) => eligibleOwners(siteId, people).map((p) => ({ value: p.user_id, label: personLabel(p) }));
  const siteOptions = new Map(sites.map((s) => [s.site_id, options(s.site_id)]));
  const companyOptions = options(null);
  const flagged = new Set(missing ?? []);
  const exceptionCount = overrides.size;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Pick one person per topic and site. They see every KPI of that topic on My KPIs, and KPIs you add later go to them too. Values go to the site's managers for review.
      </p>
      <Tabs<View>
        label="Who enters what"
        idBase="kpi-owners"
        value={view}
        onChange={setView}
        items={[
          { value: "topics", label: "By topic" },
          { value: "exceptions", label: "Exceptions", count: exceptionCount },
        ]}
      />
      <TabPanel idBase="kpi-owners" value="topics" current={view}>
        {grid.topics.length === 0 ? (
          <EmptyState title="No KPIs to hand out yet." description="Tick some KPIs in the KPIs step first. Calculated KPIs need no owner." compact />
        ) : (
          <div className={cn(panel, "relative overflow-x-auto")}>
            <table className="w-full min-w-max border-collapse text-sm" aria-label="Who enters each topic">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th scope="col" className="sticky left-0 z-10 bg-panel px-3 py-2 font-medium">
                    Topic
                  </th>
                  {sites.map((s) => (
                    <th key={s.site_id} scope="col" className="min-w-52 px-3 py-2 font-medium">
                      {s.name}
                    </th>
                  ))}
                  {grid.company && (
                    <th scope="col" className="min-w-52 px-3 py-2 font-medium">
                      Company
                    </th>
                  )}
                  {sites.length > 1 && <th scope="col" className="px-3 py-2" aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {grid.topics.map((topic) => {
                  const label = TOPIC_LABEL[topic];
                  const hasSiteKpis = sites.some((s) => grid.cells.has(topicKey(topic, s.site_id)));
                  const cell = (siteId: number | null, name: string, opts: { value: number; label: string }[]) => {
                    const key = topicKey(topic, siteId);
                    const ids = grid.cells.get(key);
                    if (!ids) {
                      return (
                        <td key={siteId ?? COMPANY} className="px-3 py-2 align-top text-xs text-muted">
                          No KPIs here
                        </td>
                      );
                    }
                    return (
                      <td key={siteId ?? COMPANY} className={cn("px-3 py-1.5 align-top", flagged.has(key) && "bg-bad-soft/40")} data-testid="topic-cell">
                        <Combobox<number>
                          label={siteId === null ? `${label} for the company` : `${label} at ${name}`}
                          hideLabel
                          value={owners.get(key) ?? null}
                          onChange={(v) => onOwner(key, v)}
                          options={opts}
                          placeholder="Choose a person"
                          emptyText={siteId === null ? "Nobody in the company yet" : "Nobody works at this site yet"}
                          error={flagged.has(key) ? "Choose who enters it." : undefined}
                        />
                        <p className="mt-1 text-xs text-muted">
                          {label} · {kpiCountText(ids.length)}
                        </p>
                      </td>
                    );
                  };
                  return (
                    <tr key={topic} className="border-b border-line last:border-0" data-testid="topic-row">
                      <th scope="row" className="sticky left-0 z-10 max-w-48 bg-panel px-3 py-2 text-left font-medium text-ink">
                        {label}
                      </th>
                      {sites.map((s) => cell(s.site_id, s.name, siteOptions.get(s.site_id) ?? []))}
                      {grid.company && cell(null, "Company", companyOptions)}
                      {sites.length > 1 && (
                        <td className="px-3 py-1.5 align-top">
                          {hasSiteKpis && (
                            <Button size="sm" variant="ghost" onClick={() => onSameForEverySite(topic)} aria-label={`Same person for every site: ${label}`}>
                              Same person for every site
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </TabPanel>
      <TabPanel idBase="kpi-owners" value="exceptions" current={view}>
        <Exceptions defs={defs} sites={sites} people={people} owners={owners} overrides={overrides} onOverrides={onOverrides} />
      </TabPanel>
    </div>
  );
}

function Exceptions({ defs, sites, people, owners, overrides, onOverrides }: Pick<Props, "defs" | "sites" | "people" | "owners" | "overrides" | "onOverrides">) {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const siteName = (id: number | null) => (id === null ? "Company" : (sites.find((s) => s.site_id === id)?.name ?? `Site ${id}`));
  const topicRank = (t: KpiTopic) => KPI_TOPICS.indexOf(t);
  const rows = [...overrides]
    .map(([key, owner]) => ({ key, owner, ...parseCellKey(key) }))
    .filter((r) => byId.has(r.kpiId))
    .sort((a, b) => {
      const da = byId.get(a.kpiId) as KpiDefinition;
      const db = byId.get(b.kpiId) as KpiDefinition;
      return topicRank(da.topic) - topicRank(db.topic) || da.name.localeCompare(db.name) || siteName(a.siteId).localeCompare(siteName(b.siteId));
    });

  const [kpi, setKpi] = useState<number | null>(null);
  const [where, setWhere] = useState<string | null>(null);
  const [person, setPerson] = useState<number | null>(null);
  const picked = kpi !== null ? byId.get(kpi) : undefined;
  const whereOptions = picked ? (picked.level === "company" ? [{ value: COMPANY, label: "Company" }] : sites.map((s) => ({ value: String(s.site_id), label: s.name }))) : [];
  const whereSite = where === null ? undefined : where === COMPANY ? null : Number(where);
  const personOptions = whereSite === undefined ? [] : eligibleOwners(whereSite, people).map((p) => ({ value: p.user_id, label: personLabel(p) }));

  const set = (key: string, owner: number | null) => onOverrides(new Map(overrides).set(key, owner));
  const remove = (key: string) => {
    const next = new Map(overrides);
    next.delete(key);
    onOverrides(next);
  };
  const add = () => {
    if (!picked || whereSite === undefined || person === null) return;
    set(cellKey(picked.id, whereSite), person);
    setKpi(null);
    setWhere(null);
    setPerson(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Most KPIs follow their topic's person. Add an exception when one KPI is entered by someone else, for example the safety officer for injuries.</p>
      {rows.length === 0 ? (
        <section className={panel}>
          <EmptyState title="No exceptions." description="Every KPI goes to its topic's person." compact />
        </section>
      ) : (
        <ul className={cn(panel, "divide-y divide-line")} aria-label="Exceptions">
          {rows.map((r) => {
            const def = byId.get(r.kpiId) as KpiDefinition;
            const name = siteName(r.siteId);
            const differs = differsFromTopic(def, r.siteId, r.owner, owners);
            return (
              <li key={r.key} className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_16rem_auto]" data-testid="exception-row">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {def.name} · {name}
                  </p>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    {TOPIC_LABEL[def.topic]}
                    {differs ? <Badge tone="info">Different from topic owner</Badge> : <span>Same as the topic's person</span>}
                  </p>
                </div>
                <Combobox<number>
                  label={r.siteId === null ? `${def.name} for the company` : `${def.name} at ${name}`}
                  hideLabel
                  value={r.owner}
                  onChange={(v) => set(r.key, v)}
                  options={eligibleOwners(r.siteId, people).map((p) => ({ value: p.user_id, label: personLabel(p) }))}
                  placeholder="Choose a person"
                />
                <button
                  type="button"
                  onClick={() => remove(r.key)}
                  aria-label={`Remove the exception for ${def.name} at ${name}`}
                  className={cn("justify-self-end rounded-chip p-1.5 text-muted hover:bg-tint hover:text-ink", focusRing)}
                >
                  <X aria-hidden className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <section aria-labelledby="add-exception" className={cn(panel, "space-y-3 p-3")}>
        <h3 id="add-exception" className="text-sm font-semibold text-ink">
          Add an exception
        </h3>
        <div className="grid gap-3 md:grid-cols-[1fr_12rem_1fr_auto] md:items-end">
          <Combobox<number>
            label="KPI"
            value={kpi}
            onChange={(v) => {
              setKpi(v);
              setWhere(v !== null && byId.get(v)?.level === "company" ? COMPANY : null);
              setPerson(null);
            }}
            options={[...defs].sort((a, b) => a.name.localeCompare(b.name)).map((d) => ({ value: d.id, label: d.name }))}
            placeholder="Choose a KPI"
          />
          <Select<string>
            label="Where"
            value={where}
            onChange={(v) => {
              setWhere(v);
              setPerson(null);
            }}
            options={whereOptions}
            placeholder={picked ? "Choose" : "Choose a KPI first"}
            disabled={!picked}
          />
          <Combobox<number> label="Person" value={person} onChange={setPerson} options={personOptions} placeholder="Choose a person" disabled={whereSite === undefined} emptyText="Nobody works there yet" />
          <Button variant="secondary" onClick={add} disabled={!picked || whereSite === undefined || person === null}>
            <Plus aria-hidden className="size-4" />
            Add exception
          </Button>
        </div>
      </section>
    </div>
  );
}
