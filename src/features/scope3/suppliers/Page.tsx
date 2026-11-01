import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useClientContext } from "../../../lib/clientContext";
import { categoryLabel, methodLabel } from "../../../lib/scope3/labels";
import type { SupplierListItem } from "../../../services/scope3SuppliersService";
import { Badge, Button, Callout, type Column, DataTable, EmptyState, KpiStrip, PageHeader, Select, TabPanel, Tabs, cn, panel, useToast } from "../../../ui";
import { errorMessage, useCoverage, useNameMatches, useSuppliers } from "./api";
import { NameMatches } from "./components/NameMatches";
import { SupplierDrawer } from "./components/SupplierDrawer";
import { SupplierFormDrawer } from "./components/SupplierFormDrawer";
import { figureState, lastRequestText } from "./logic";

type Tab = "list" | "matches";

const COLUMNS: Column<SupplierListItem>[] = [
  { id: "name", header: "Supplier", value: (s) => s.name, sortable: true, hideable: false, wrap: true },
  { id: "country", header: "Country", value: (s) => s.country ?? "", cell: (s) => s.country ?? <span className="text-muted">Not set</span>, width: "6rem" },
  { id: "rows", header: "Rows this year", value: (s) => s.rows_this_year, numeric: true, sortable: true, width: "8rem" },
  { id: "tco2e", header: "tCO₂e", value: (s) => s.tco2e, numeric: true, decimals: 3, sortable: true, width: "7rem" },
  {
    id: "figure",
    header: "Supplier figure",
    value: (s) => figureState(s),
    cell: (s) => {
      const state = figureState(s);
      return <Badge tone={state === "Missing" ? "warn" : "good"}>{state}</Badge>;
    },
    width: "9rem",
  },
  { id: "request", header: "Last request", value: (s) => lastRequestText(s), cell: (s) => <span className={s.last_request ? undefined : "text-muted"}>{lastRequestText(s)}</span>, wrap: true },
];

/**
 * S3-6 `/suppliers` (Manager and above): who the company buys from, which of
 * them have given their own figures, and how much of Categories 1 and 2 those
 * figures cover. Name matches from the backfill are judged here. Figures and
 * facility data feed the engine's supplier-specific and hybrid methods; the
 * page never calculates a total.
 */
export default function SuppliersPage() {
  const { role } = useAuth();
  const isStaff = role === "Superadmin";
  const { clientId } = useClientContext();
  const companyId = isStaff ? clientId : null;
  const ready = !isStaff || clientId !== null;
  const { toast } = useToast();
  const thisYear = new Date().getFullYear();

  // Year, tab and the open supplier live in the URL so a link opens the same view.
  const [params, setParams] = useSearchParams();
  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams([...p].filter(([k]) => k !== key));
        if (value !== null && value !== "") next.set(key, value);
        return next;
      },
      { replace: true },
    );
  const yearParam = Number(params.get("year"));
  const year = Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= thisYear + 1 ? yearParam : thisYear;
  const tab: Tab = params.get("tab") === "matches" ? "matches" : "list";
  const openId = Number(params.get("supplier")) || null;

  const list = useSuppliers(companyId, year, ready);
  const coverage = useCoverage(companyId, year, ready);
  const matches = useNameMatches(companyId, ready);
  const suppliers = useMemo(() => list.data?.suppliers ?? [], [list.data]);
  const editable = !!list.data?.can_edit;
  const [adding, setAdding] = useState(false);
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);

  const header = (
    <PageHeader
      title="Suppliers"
      description={`Who you buy from, and the figures they have given for ${categoryLabel(1)} and ${categoryLabel(2)}.`}
      primaryAction={editable ? { label: "Add supplier", icon: <Plus size={16} aria-hidden />, onClick: () => setAdding(true) } : undefined}
    />
  );

  if (!ready)
    return (
      <div className="space-y-6">
        {header}
        <Callout tone="warn" title="Pick a client first">
          Choose a client with the switcher at the top; suppliers are kept per client.
        </Callout>
      </div>
    );

  const c = coverage.data;
  const matchCount = matches.data?.matches.length ?? 0;

  return (
    <div className="space-y-6">
      {header}

      <section className={cn(panel, "flex flex-wrap items-end gap-4 p-4")} aria-label="Year">
        <Select<number>
          className="w-40"
          label="Year"
          value={year}
          options={years.map((y) => ({ value: y, label: String(y) }))}
          onChange={(v) => setParam("year", v ? String(v) : null)}
        />
        <p className="max-w-xl text-sm text-muted">
          Rows and tCO₂e count every entry of {year} that isn't rejected. Coverage is the share of Categories 1 and 2 calculated as "{methodLabel("supplier_specific")}" or "
          {methodLabel("hybrid")}".
        </p>
      </section>

      <KpiStrip
        loading={coverage.isLoading}
        error={coverage.isError ? errorMessage(coverage.error, "Couldn't load the coverage.") : null}
        onRetry={() => coverage.refetch()}
        items={[
          { label: "Categories 1 and 2", value: c?.cat12_tco2e ?? null, format: "emissions" },
          { label: "From supplier data", value: c?.coverage_pct ?? null, format: "percent", decimals: 1 },
          { label: methodLabel("supplier_specific"), value: c?.supplier_specific_tco2e ?? null, format: "emissions" },
          { label: methodLabel("hybrid"), value: c?.hybrid_tco2e ?? null, format: "emissions" },
        ]}
      />

      <Tabs<Tab>
        label="Suppliers"
        idBase="suppliers"
        value={tab}
        onChange={(t) => setParam("tab", t === "list" ? null : t)}
        items={[
          { value: "list", label: "Suppliers", count: suppliers.length },
          { value: "matches", label: "Name matches", count: matchCount },
        ]}
      />

      <TabPanel idBase="suppliers" value="list" current={tab}>
        {!editable && list.data && <Callout tone="info">You can read the list. A Manager, Admin or Superadmin changes it.</Callout>}
        <DataTable<SupplierListItem>
          label={`Suppliers, ${year}`}
          rows={suppliers}
          columns={COLUMNS}
          getRowId={(s) => s.supplier_id}
          loading={list.isLoading}
          error={list.isError ? errorMessage(list.error, "Couldn't load the suppliers.") : null}
          onRetry={() => list.refetch()}
          onRowClick={(s) => setParam("supplier", String(s.supplier_id))}
          rowLabel={(s) => s.name}
          defaultSort={{ id: "tco2e", dir: "desc" }}
          exportName={`suppliers-${year}`}
          empty={
            <EmptyState
              title="No suppliers yet."
              description="Suppliers appear here when entries name them, when a supplier request is accepted, or when you add one."
              action={editable ? <Button onClick={() => setAdding(true)}>Add supplier</Button> : undefined}
            />
          }
        />
      </TabPanel>

      <TabPanel idBase="suppliers" value="matches" current={tab}>
        <NameMatches companyId={companyId} query={matches} editable={editable} onDone={(text) => toast({ title: text, tone: "good" })} />
      </TabPanel>

      {openId !== null && <SupplierDrawer companyId={companyId} supplierId={openId} year={year} onClose={() => setParam("supplier", null)} />}

      {adding && (
        <SupplierFormDrawer
          companyId={companyId}
          supplier={null}
          onClose={() => setAdding(false)}
          onSaved={(s) => {
            toast({ title: `${s.name} added`, tone: "good" });
            setAdding(false);
            setParam("supplier", String(s.supplier_id));
          }}
        />
      )}
    </div>
  );
}
