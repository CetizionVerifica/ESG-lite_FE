import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { FRAMEWORK_CODES, KPI_SOURCES } from "../../../lib/kpi/contracts";
import { FREQUENCY_LABEL, FRAMEWORK_LABEL, LEVEL_LABEL, SOURCE_LABEL, TOPIC_LABEL } from "../../../lib/kpi/labels";
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
  useFilterParams,
} from "../../../ui";
import { FrameworkBadges } from "../components/FrameworkBadges";
import { kpiErrorMessage, useLibrary } from "./api";
import { DisclosuresView } from "./components/DisclosuresView";
import { KpiDrawer } from "./components/KpiDrawer";
import { type LibraryRow, countBySource, filterLibrary, libraryRows, topicsIn } from "./logic";

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

  const rows = useMemo(() => (library.data ? libraryRows(library.data) : []), [library.data]);
  const shown = useMemo(
    () => filterLibrary(rows, { q: filters.q, framework: filters.filters.framework ?? [], topic: filters.filters.topic ?? [], source: filters.filters.source ?? [] }),
    [rows, filters],
  );
  const counts = countBySource(rows);
  const knownCodes = useMemo(() => rows.map((r) => r.def.code), [rows]);
  const open = rows.find((r) => r.def.id === openId) ?? null;
  const error = library.error ? kpiErrorMessage(library.error, "Couldn't load the KPI library.") : null;

  const filterDefs = [
    { key: "framework", label: "Framework", options: FRAMEWORK_CODES.map((f) => ({ value: f, label: FRAMEWORK_LABEL[f] })) },
    { key: "topic", label: "Topic", options: topicsIn(rows).map((t) => ({ value: t, label: TOPIC_LABEL[t] })) },
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
                  <Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
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
