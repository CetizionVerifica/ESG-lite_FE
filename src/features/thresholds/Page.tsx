import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Gauge, SearchX } from "lucide-react";
import {
  Button,
  EMPTY_FILTERS,
  EmptyState,
  FilterBar,
  type FilterDef,
  SetupListPage,
  useFilterParams,
  useToast,
  withoutParams,
  writeFilterParams,
} from "../../ui";
import { errorMessage, useCompanies, useResetThreshold, useSaveThreshold, useThresholds } from "./api";
import { ThresholdDrawer } from "./components/ThresholdDrawer";
import { thresholdColumns } from "./components/columns";
import { DEFAULT_THRESHOLD, type ThresholdRow, buildRows, formatPct, matchesFilters, toKind } from "./logic";

const FILTER_KEYS = ["value"];
const OPEN = "open";

/** P26 `/factors/thresholds`: each client's change threshold that flags entries for review. */
export default function ThresholdsPage() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS);

  const thresholds = useThresholds();
  const companies = useCompanies();
  const save = useSaveThreshold();
  const reset = useResetThreshold();
  const [actionErr, setActionErr] = useState<string | null>(null);

  const ready = !!thresholds.data && !!companies.data;
  const all = useMemo(() => buildRows(companies.data ?? [], thresholds.data ?? []), [companies.data, thresholds.data]);
  const kind = toKind(filters.filters.value);
  const rows = useMemo(() => all.filter((r) => matchesFilters(r, { q: filters.q, kind })), [all, filters.q, kind]);
  const customCount = all.filter((r) => r.threshold).length;

  // The drawer lives in the URL (?open=<client id>) so a client's threshold can be linked to.
  const openParam = params.get(OPEN);
  const openRow = openParam ? (all.find((r) => String(r.company_id) === openParam) ?? null) : null;
  const setOpen = useCallback(
    (value: string | null) => {
      setActionErr(null);
      save.reset();
      reset.reset();
      setParams((p) => {
        const next = withoutParams(p, [OPEN]);
        if (value) next.set(OPEN, value);
        return next;
      }, { replace: true });
    },
    [setParams, save, reset],
  );

  const onSave = (value: number) => {
    if (!openRow) return;
    setActionErr(null);
    save.mutate(
      { row: openRow, value },
      {
        onSuccess: () => {
          setOpen(null);
          toast({ title: `${openRow.name}: threshold set to ${formatPct(value)}`, tone: "good" });
        },
        onError: (e) => setActionErr(errorMessage(e, "Nothing was saved. Try again.")),
      },
    );
  };

  const onReset = () => {
    if (!openRow?.threshold) return;
    setActionErr(null);
    reset.mutate(openRow.threshold.id, {
      onSuccess: () => {
        setOpen(null);
        toast({ title: `${openRow.name} now uses the default ${DEFAULT_THRESHOLD}%`, tone: "good" });
      },
      onError: (e) => setActionErr(errorMessage(e, "The threshold wasn't reset. Try again.")),
    });
  };

  const filterDefs: FilterDef[] = [
    {
      key: "value",
      label: "Value",
      multiple: false,
      options: [
        { value: "custom", label: "Custom" },
        { value: "default", label: `Default ${DEFAULT_THRESHOLD}%` },
      ],
    },
  ];
  const filtered = !!filters.q.trim() || kind !== null;
  const clearFilters = () => setParams((p) => writeFilterParams(p, EMPTY_FILTERS, FILTER_KEYS), { replace: true });
  const empty =
    all.length === 0 ? (
      <EmptyState icon={Gauge} title="No clients yet." description="Thresholds are set per client once a client is onboarded." />
    ) : (
      <EmptyState icon={SearchX} title="No clients match these filters." action={filtered ? <Button onClick={clearFilters}>Clear filters</Button> : undefined} />
    );

  const loadError = thresholds.error ?? companies.error;
  const missing = !!openParam && ready && !openRow;
  const summary = ready
    ? `${rows.length} ${rows.length === 1 ? "client" : "clients"}${filtered ? ` of ${all.length}` : ""} · ${customCount} custom, ${all.length - customCount} on the default ${DEFAULT_THRESHOLD}%`
    : " ";

  return (
    <SetupListPage<ThresholdRow>
      title="Thresholds"
      description={
        <>
          When a category's emissions change by more than this % versus the previous period, the entry is flagged for the manager (the warning
          icon in Approvals and the Overview attention list) and in the contributor's comparison chip.
        </>
      }
      summary={summary}
      table={{
        label: "Thresholds",
        rows,
        columns: thresholdColumns({ onOpen: (r) => setOpen(String(r.company_id)) }),
        getRowId: (r) => r.company_id,
        rowLabel: (r) => r.name,
        loading: !ready && !loadError,
        error: loadError ? errorMessage(loadError, thresholds.error ? "Couldn't load thresholds." : "Couldn't load clients.") : null,
        onRetry: () => {
          if (thresholds.error) void thresholds.refetch();
          if (companies.error) void companies.refetch();
        },
        empty,
        defaultSort: { id: "client", dir: "asc" },
        pagination: { mode: "client", pageSize: 50 },
        onRowClick: (r) => setOpen(String(r.company_id)),
        exportName: "thresholds",
        storageKey: "p26-thresholds",
        toolbar: <FilterBar filters={filterDefs} value={filters} onChange={setFilters} searchPlaceholder="Search clients" searchDelay={0} />,
      }}
    >
      <ThresholdDrawer
        // Remount per client, and once a linked client's data arrives, so the form starts from its saved value.
        key={`${openParam ?? "closed"}-${openRow ? "ready" : "wait"}`}
        row={openRow}
        loading={!!openParam && !ready && !loadError}
        saving={save.isPending}
        resetting={reset.isPending}
        error={actionErr}
        onClose={() => setOpen(null)}
        onSave={onSave}
        onReset={onReset}
      />
      {missing && (
        <p role="status" className="text-sm text-muted">
          That client no longer exists. <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Dismiss</Button>
        </p>
      )}
    </SetupListPage>
  );
}
