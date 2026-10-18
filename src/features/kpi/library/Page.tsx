import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { FRAMEWORK_CODES, KPI_PILLARS, KPI_SOURCES } from "../../../lib/kpi/contracts";
import { FREQUENCY_LABEL, FRAMEWORK_LABEL, LEVEL_LABEL, PILLAR_LABEL, SOURCE_LABEL, TOPIC_LABEL } from "../../../lib/kpi/labels";
import { pillarOf, pillarParam, pillarRank, topicsByPillar } from "../../../lib/kpi/pillars";
import {
  Badge,
  Button,
  type Column,
  DataTable,
  EMPTY_FILTERS,
  EmptyState,
  FilterBar,
  PageHeader,
  SkeletonText,
  TabPanel,
  Tabs,
  cn,
  focusRing,
  panel,
  useFilterParams,
} from "../../../ui";
import { PillarBadge } from "../components/PillarBadge";
import { FrameworkBadges } from "../components/FrameworkBadges";
import { kpiErrorMessage, useLibrary } from "./api";
import { DisclosuresView } from "./components/DisclosuresView";
import { KpiDrawer } from "./components/KpiDrawer";
import { type LibraryRow, countByPillar, countBySource, filterLibrary, libraryRows, topicsIn } from "./logic";

type Tab = "kpis" | "disclosures";
const FILTER_KEYS = ["framework", "topic", "source"];

const COLUMNS: Column<LibraryRow>[] = [
  {
    id: "name",
    header: "KPI",
    value: (r) => r.def.name,
    cell: (r) => (
      <span className="block min-w-0">
        <span className="block truncate text-ink">{r.def.name}</span>
        <span className="block truncate font-mono text-[11px] text-muted">{r.def.code}</span>
      </span>
    ),
    sortable: true,
    hideable: false,
    info: false,
  },
  {
    id: "pillar",
    header: "Pillar",
    // Sorts E, S, G; exports the full name.
    value: (r) => `${pillarRank(pillarOf(r.def))} ${PILLAR_LABEL[pillarOf(r.def)]}`,
    cell: (r) => <PillarBadge pillar={pillarOf(r.def)} />,
    sortable: true,
    width: "5rem",
    info: false,
  },
  { id: "topic", header: "Topic", value: (r) => TOPIC_LABEL[r.def.topic], sortable: true, width: "9rem", info: false },
  {
    id: "source",
    header: "How it's filled",
    value: (r) => SOURCE_LABEL[r.def.source],
    cell: (r) => <Badge tone={r.def.source === "manual" ? "neutral" : "info"}>{SOURCE_LABEL[r.def.source]}</Badge>,
    sortable: true,
    width: "8rem",
    info: false,
  },
  { id: "level", header: "Entered for", value: (r) => `${LEVEL_LABEL[r.def.level]} · ${FREQUENCY_LABEL[r.def.default_frequency].toLowerCase()}`, width: "10rem", info: false },
  { id: "unit", header: "Unit", value: (r) => r.def.canonical_unit ?? "", cell: (r) => r.def.canonical_unit ?? <span className="text-muted">—</span>, width: "7rem", info: false },
  {
    id: "frameworks",
    header: "Used in",
    value: (r) => r.usedIn.map((u) => `${u.framework} ${u.code}`).join(", "),
    cell: (r) => <FrameworkBadges items={r.usedIn} />,
    wrap: true,
    info: false,
  },
];

/**
 * KPI-2 `/setup/kpi-library` (Superadmin): every KPI defined once, the
 * disclosures it answers in GRI, BRSR and ESRS, and per framework version how
 * many disclosures a KPI answers. Global: not behind a client's switch.
 */
export default function LibraryPage() {
  const library = useLibrary();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS);

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams([...p].filter(([k]) => k !== key));
        if (value !== null && value !== "") next.set(key, value);
        return next;
      },
      { replace: true },
    );
  const tab: Tab = params.get("tab") === "disclosures" ? "disclosures" : "kpis";
  const openId = Number(params.get("kpi")) || null;
  const frameworkId = Number(params.get("fw")) || null;
  const pillar = pillarParam(params.get("pillar"));

  const rows = useMemo(() => (library.data ? libraryRows(library.data) : []), [library.data]);
  const shown = useMemo(
    () => filterLibrary(rows, { q: filters.q, framework: filters.filters.framework ?? [], topic: filters.filters.topic ?? [], source: filters.filters.source ?? [], pillar }),
    [rows, filters, pillar],
  );
  const counts = countBySource(rows);
  const pillarCounts = countByPillar(rows);
  const topicGroups = topicsByPillar(topicsIn(rows));
  const topicCount = (t: string) => rows.filter((r) => r.def.topic === t).length;
  const chip = (on: boolean) => cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium", on ? "border-brand bg-tint text-ink" : "border-line bg-panel text-muted hover:bg-tint hover:text-ink", focusRing);
  const knownCodes = useMemo(() => rows.map((r) => r.def.code), [rows]);
  const open = rows.find((r) => r.def.id === openId) ?? null;
  const error = library.error ? kpiErrorMessage(library.error, "Couldn't load the KPI library.") : null;

  const filterDefs = [
    { key: "framework", label: "Framework", options: FRAMEWORK_CODES.map((f) => ({ value: f, label: FRAMEWORK_LABEL[f] })) },
    { key: "topic", label: "Topic", options: topicGroups.flatMap((g) => g.items.map((t) => ({ value: t, label: `${TOPIC_LABEL[t]} (${PILLAR_LABEL[g.pillar]})` }))) },
    { key: "source", label: "How it's filled", options: KPI_SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] })) },
  ];

  return (
    <div className="space-y-6 py-6">
      <PageHeader title="KPI library" description="Every KPI is defined once here, with the GRI, BRSR and ESRS disclosures it answers. Clients pick from it in KPI setup." />

      <Tabs<Tab>
        label="KPI library"
        idBase="kpi-library"
        value={tab}
        onChange={(t) => setParam("tab", t === "kpis" ? null : t)}
        items={[
          { value: "kpis", label: "KPIs", count: library.data ? rows.length : undefined },
          { value: "disclosures", label: "Disclosures", count: library.data ? library.data.disclosures.length : undefined },
        ]}
      />

      <TabPanel idBase="kpi-library" value="kpis" current={tab}>
        <div className="space-y-3">
          {library.data && (
            <p className="text-sm text-muted">
              {rows.length} KPIs · {counts.auto} filled from data · {counts.formula} calculated · {counts.manual} entered
            </p>
          )}
          {library.data && (
            <>
              <div role="group" aria-label="Pillar" className="flex flex-wrap gap-1.5" data-testid="library-pillar-chips">
                <button type="button" aria-pressed={!pillar} className={chip(!pillar)} onClick={() => setParam("pillar", null)}>
                  All pillars
                </button>
                {KPI_PILLARS.map((p) => (
                  <button key={p} type="button" aria-pressed={pillar === p} className={chip(pillar === p)} onClick={() => setParam("pillar", pillar === p ? null : p)}>
                    <PillarBadge pillar={p} className="border-0 bg-transparent px-0" />
                    <span aria-hidden>{PILLAR_LABEL[p]}</span>
                    <span className="font-num text-xs text-muted">{pillarCounts[p]}</span>
                  </button>
                ))}
              </div>
              <section aria-label="Topics by pillar" className={cn(panel, "grid gap-4 p-4 md:grid-cols-3")} data-testid="library-topics-by-pillar">
                {topicGroups
                  .filter((g) => !pillar || g.pillar === pillar)
                  .map((g) => (
                    <div key={g.pillar} className="space-y-1.5">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                        <PillarBadge pillar={g.pillar} />
                        {g.label}
                      </h3>
                      <ul className="flex flex-wrap gap-1.5">
                        {g.items.map((t) => {
                          const on = (filters.filters.topic ?? []).length === 1 && filters.filters.topic?.[0] === t;
                          return (
                            <li key={t}>
                              <button
                                type="button"
                                aria-pressed={on}
                                onClick={() => setFilters({ ...filters, filters: { ...filters.filters, topic: on ? [] : [t] } })}
                                className={cn("rounded-chip border px-2 py-1 text-xs", on ? "border-brand bg-tint text-ink" : "border-line text-ink hover:bg-tint", focusRing)}
                              >
                                {TOPIC_LABEL[t]} <span className="font-num text-muted">{topicCount(t)}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
              </section>
            </>
          )}
          <DataTable<LibraryRow>
            label="KPI library"
            rows={shown}
            columns={COLUMNS}
            getRowId={(r) => r.def.id}
            rowLabel={(r) => r.def.name}
            loading={library.isLoading}
            error={error}
            onRetry={library.refetch}
            onRowClick={(r) => setParam("kpi", String(r.def.id))}
            highlightId={openId ?? undefined}
            pagination={{ mode: "client", pageSize: 50 }}
            exportName="kpi-library"
            storageKey="kpi-library"
            toolbar={<FilterBar filters={filterDefs} value={filters} onChange={setFilters} searchPlaceholder="Search name, code or disclosure" loading={library.isLoading} />}
            empty={
              <EmptyState
                title="No KPIs match these filters."
                description="Clear a filter or search for a disclosure code such as 303-3."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setFilters(EMPTY_FILTERS);
                      setParam("pillar", null);
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            }
          />
        </div>
      </TabPanel>

      <TabPanel idBase="kpi-library" value="disclosures" current={tab}>
        {error ? (
          <EmptyState variant="error" title={error} action={<Button onClick={library.refetch}>Try again</Button>} />
        ) : !library.data ? (
          <SkeletonText lines={8} />
        ) : (
          <DisclosuresView
            library={library.data}
            frameworkId={frameworkId}
            onFramework={(id) => setParam("fw", String(id))}
            onOpenKpi={(id) => setParam("kpi", String(id))}
          />
        )}
      </TabPanel>

      <KpiDrawer key={open?.def.id ?? "none"} row={open} knownCodes={knownCodes} onClose={() => setParam("kpi", null)} />
    </div>
  );
}
