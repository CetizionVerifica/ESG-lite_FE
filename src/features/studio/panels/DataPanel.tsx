// DS-2 · the Data drawer (05-ux "Data" panel, mockup Editor "Data"):
//   - GHG: Scopes, Scope 3 categories (top four, then "+ n more"), sites, months and
//     sources, gases, intensity, base year and quality;
//   - sustainability: KPI search by name and topic;
//   - every row shows its value (the server's `display`) and approval date, or why
//     it has none; click inserts the binding (DS-6 wires drag and drop);
//   - a second tab, "Report details · n", edits the report inputs (ReportDetailsForm).
// Values come from GET /studio/data, the same resolver as the page; nothing is
// formatted or added up here.
import { useMemo, useState } from "react";
import { ChevronRight, Link2, Search } from "lucide-react";
import type { DataGroup, DataItem, GhgBinding, KpiBinding } from "../../../lib/studio/contracts";
import type { StudioScope } from "../../../services/studioService";
import { Badge, EmptyState, SkeletonText, Tabs, TextField, cn, focusRing } from "../../../ui";
import { useDataCatalog, useDocInputs, useInputsPrefill, studioErrorMessage } from "./data/api";
import { dataNote, filterGroups, lastApproval, missingInputs } from "./data/logic";
import { DocReportDetails, ReportDetailsForm } from "./ReportDetailsForm";
import type { ReportInputs } from "../../../lib/studio/contracts";

const KPI_TOPICS = ["climate", "energy", "water", "waste", "pollution", "biodiversity", "materials", "workforce", "health_safety", "diversity", "training", "human_rights", "community", "customers", "governance", "ethics"] as const;
const topicLabel = (t: string) => t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Groups that start short in the drawer (05-ux: top four, then "+ n more"). */
const SHORT_GROUPS: Record<string, number> = { scope3_categories: 4 };

export interface DataPanelProps {
  scope: StudioScope;
  /** The doc being edited; its report inputs show on the second tab. Without it, `inputs` drive a controlled form. */
  docId?: number;
  /** Unsaved inputs (new-design flow) and their setter, used when there is no doc yet. */
  inputs?: ReportInputs;
  onInputsChange?: (inputs: ReportInputs) => void;
  /** Click on a row: insert its binding (as a big number, tile or chart: the editor asks). */
  onInsert?: (binding: GhgBinding | KpiBinding, item: DataItem) => void;
  /** Which tab opens first. */
  initialTab?: "data" | "details";
}

export function DataPanel({ scope, docId, inputs, onInputsChange, onInsert, initialTab = "data" }: DataPanelProps) {
  const [tab, setTab] = useState<"data" | "details">(initialTab);
  const docInputs = useDocInputs(docId ?? null);
  const prefill = useInputsPrefill(docId ? null : scope);
  const missing = useMemo(() => {
    if (docId) return docInputs.data ? missingInputs(scope.kind, docInputs.data.inputs, docInputs.data.prefill).length : 0;
    return prefill.data ? missingInputs(scope.kind, inputs ?? {}, prefill.data.prefill).length : 0;
  }, [docId, docInputs.data, prefill.data, inputs, scope.kind]);

  return (
    <section aria-label="Data" className="flex h-full min-h-0 flex-col gap-3" data-testid="studio-data-panel">
      <header>
        <h2 className="text-base font-semibold text-ink">Data</h2>
        <p className="text-xs text-muted">
          {scope.yearType} {scope.year} · {scope.sites === "all" ? "all sites" : `${scope.sites.length} site${scope.sites.length === 1 ? "" : "s"}`}
        </p>
      </header>
      <Tabs
        label="Data panel"
        idBase="studio-data"
        value={tab}
        onChange={setTab}
        items={[
          { value: "data", label: scope.kind === "ghg" ? "Emissions" : "KPIs" },
          { value: "details", label: "Report details", ...(missing ? { count: missing } : {}) },
        ]}
      />
      {tab === "data" ? (
        scope.kind === "ghg" ? (
          <GhgList scope={scope} onInsert={onInsert} />
        ) : (
          <KpiList scope={scope} onInsert={onInsert} />
        )
      ) : docId ? (
        <DocReportDetails docId={docId} kind={scope.kind} />
      ) : (
        <ReportDetailsForm kind={scope.kind} stored={inputs ?? {}} prefill={prefill.data?.prefill ?? {}} loading={prefill.isPending} onChange={(next) => onInputsChange?.(next)} />
      )}
    </section>
  );
}

function GhgList({ scope, onInsert }: { scope: StudioScope; onInsert?: DataPanelProps["onInsert"] }) {
  const [query, setQuery] = useState("");
  const catalog = useDataCatalog(scope);
  const groups = useMemo(() => filterGroups(catalog.data?.groups ?? [], query), [catalog.data, query]);
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <TextField label="Search data" hideLabel placeholder="Search data" value={query} onChange={setQuery} />
      <Body state={catalog} empty={query ? `Nothing matches “${query}”.` : "No data for this year yet."} groups={groups} onInsert={onInsert} search={query} />
      {catalog.data && (
        <p className="text-xs text-muted">
          tCO₂e · approved entries only{lastApproval(catalog.data.groups) ? ` · last approval ${lastApproval(catalog.data.groups)}` : ""}
        </p>
      )}
      <p className="text-xs text-muted">Click a figure to add it to the page as a big number, a tile or a chart.</p>
    </div>
  );
}

function KpiList({ scope, onInsert }: { scope: StudioScope; onInsert?: DataPanelProps["onInsert"] }) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<string>("");
  const catalog = useDataCatalog(scope, { q: query.trim() || undefined, topic: topic || undefined });
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <TextField label="Search KPIs" hideLabel placeholder="Search KPIs" value={query} onChange={setQuery} />
      <div className="flex flex-wrap gap-1" role="group" aria-label="Topic">
        {["", ...KPI_TOPICS].map((t) => (
          <button
            key={t || "all"}
            type="button"
            aria-pressed={topic === t}
            onClick={() => setTopic(t)}
            className={cn("rounded-chip border px-2 py-0.5 text-xs", topic === t ? "border-accent bg-tint text-ink" : "border-line text-muted hover:text-ink", focusRing)}
          >
            {t ? topicLabel(t) : "All topics"}
          </button>
        ))}
      </div>
      <Body state={catalog} empty={query || topic ? "No selected KPI matches." : "No KPIs are selected for this company."} groups={catalog.data?.groups ?? []} onInsert={onInsert} search={query} />
      <p className="text-xs text-muted">Approved KPI values only. Click a KPI to add it to the page.</p>
    </div>
  );
}

function Body({
  state,
  groups,
  empty,
  onInsert,
  search,
}: {
  state: { isPending: boolean; isError: boolean; error: unknown };
  groups: DataGroup[];
  empty: string;
  onInsert?: DataPanelProps["onInsert"];
  search: string;
}) {
  if (state.isPending) return <SkeletonText lines={8} />;
  if (state.isError) return <EmptyState title="The data couldn't be loaded." description={studioErrorMessage(state.error, "Try again in a moment.")} />;
  if (!groups.length) return <EmptyState icon={Search} title={empty} />;
  return (
    <div className="min-h-0 space-y-4 overflow-y-auto">
      {groups.map((g) => (
        <Group key={g.id} group={g} onInsert={onInsert} expanded={!!search} />
      ))}
    </div>
  );
}

function Group({ group, onInsert, expanded }: { group: DataGroup; onInsert?: DataPanelProps["onInsert"]; expanded: boolean }) {
  const short = SHORT_GROUPS[group.id];
  const [open, setOpen] = useState(false);
  // Scope 3 categories: the ones with figures first, then the rest (05-ux: "+ n more · n not addressed").
  const items = short ? [...group.items].sort((a, b) => (b.resolved.value ?? -1) - (a.resolved.value ?? -1)) : group.items;
  const shown = short && !open && !expanded ? items.slice(0, short) : items;
  const hidden = items.length - shown.length;
  const notAddressed = short ? group.items.filter((i) => i.resolved.value === null && !i.resolved.unavailable).length : 0;
  return (
    <section aria-labelledby={`data-group-${group.id}`}>
      <h3 id={`data-group-${group.id}`} className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {group.label}
      </h3>
      <ul className="divide-y divide-line rounded-control border border-line">
        {shown.map((item) => (
          <li key={item.id}>
            <Row item={item} onInsert={onInsert} />
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" onClick={() => setOpen(true)} className={cn("mt-1 text-xs text-brand-text hover:underline", focusRing)}>
          + {hidden} more{notAddressed ? ` · ${notAddressed} not addressed` : ""}
        </button>
      )}
    </section>
  );
}

function Row({ item, onInsert }: { item: DataItem; onInsert?: DataPanelProps["onInsert"] }) {
  const r = item.resolved;
  const note = dataNote(r);
  const multi = (r.series?.[0]?.values.length ?? 0) > 1 && item.binding.source === "ghg" && !!(item.binding as GhgBinding).breakdown;
  return (
    <button
      type="button"
      onClick={() => onInsert?.(item.binding, item)}
      disabled={!onInsert}
      className={cn("flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-tint disabled:cursor-default disabled:hover:bg-transparent", focusRing)}
      data-testid={`data-item-${item.id}`}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm text-ink">{item.label}</span>
        <span className="flex items-center gap-1 text-[11px] text-muted">
          {!r.unavailable && <Link2 aria-hidden className="size-3" />}
          {note}
          {r.complete === false && <Badge tone="warn">Incomplete</Badge>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-right">
        {multi ? (
          <span className="text-xs text-muted">{r.series?.[0]?.values.length} values</span>
        ) : (
          <span className={cn("text-sm tabular-nums", r.unavailable ? "text-muted" : "font-medium text-ink")}>{r.unavailable && r.unavailable.reason !== "EXCLUDED" ? "Not reported" : r.display}</span>
        )}
        {multi && <ChevronRight aria-hidden className="size-4 text-muted" />}
      </span>
    </button>
  );
}
