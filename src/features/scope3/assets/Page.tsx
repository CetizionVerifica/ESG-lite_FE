import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useClientContext } from "../../../lib/clientContext";
import { INVESTMENT_TYPE_LABEL } from "../../../lib/scope3/assets";
import type { Investment } from "../../../services/scope3AssetsService";
import { Badge, Button, Callout, type Column, DataTable, EmptyState, NumberField, PageHeader, Select, cn, focusRing, formatNumber, panel, useToast } from "../../../ui";
import { errorMessage, useInvestments } from "./api";
import { InvestmentDrawer } from "./components/InvestmentDrawer";
import { PlanDrawer } from "./components/PlanDrawer";
import { belowThreshold, dataText, yearsOf } from "./logic";

const fmt = (n: number) => formatNumber(n, n % 1 ? 2 : 0);

const COLUMNS: Column<Investment>[] = [
  { id: "investee", header: "Investee", value: (i) => i.investee, sortable: true, hideable: false },
  { id: "type", header: "Type", value: (i) => INVESTMENT_TYPE_LABEL[i.type], cell: (i) => <Badge tone={i.type === "equity" ? "brand" : "neutral"}>{INVESTMENT_TYPE_LABEL[i.type]}</Badge> },
  { id: "share", header: "Share", value: (i) => i.share_pct, numeric: true, sortable: true, cell: (i) => `${fmt(i.share_pct)} %`, width: "6rem" },
  { id: "data", header: "Scope 1+2 or revenue", value: (i) => dataText(i, fmt), cell: (i) => <span className={dataText(i, fmt) === "Missing" ? "text-warn" : undefined}>{dataText(i, fmt)}</span> },
  { id: "year", header: "Year", value: (i) => i.year, sortable: true, width: "5rem" },
  { id: "source", header: "Source", value: (i) => i.source ?? "", cell: (i) => i.source ?? <span className="text-muted">None</span>, wrap: true },
];

/**
 * S3-11 `/settings/scope3/investments`: the Category 15 investments register.
 * Admin and Superadmin add and edit investments and make the yearly plan;
 * Managers read. The engine calculates every row; this page saves no totals.
 */
export default function InvestmentsPage() {
  const { role } = useAuth();
  const isStaff = role === "Superadmin";
  const { clientId } = useClientContext();
  const companyId = isStaff ? clientId : null;
  const ready = !isStaff || clientId !== null;
  const { toast } = useToast();
  const thisYear = new Date().getFullYear();

  // Year and threshold live in the URL so a link opens the same view.
  const [params, setParams] = useSearchParams();
  const yearParam = Number(params.get("year"));
  const thresholdParam = params.get("threshold");
  const threshold = thresholdParam !== null && thresholdParam !== "" && Number.isFinite(Number(thresholdParam)) ? Number(thresholdParam) : null;
  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        // Copy every other param; an empty value drops this one from the URL.
        const next = new URLSearchParams([...p].filter(([k]) => k !== key));
        if (value !== null && value !== "") next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const list = useInvestments(companyId, ready);
  const all = useMemo(() => list.data?.investments ?? [], [list.data]);
  const years = yearsOf(all, thisYear);
  const year = yearParam && years.includes(yearParam) ? yearParam : (all[0]?.year ?? thisYear);
  const rows = all.filter((i) => i.year === year);
  const small = belowThreshold(rows, threshold);
  const editable = !!list.data?.can_edit;

  // undefined = closed, null = new investment.
  const [editing, setEditing] = useState<Investment | null | undefined>(undefined);
  const [planning, setPlanning] = useState(false);

  const header = (
    <PageHeader
      title="Investments"
      description="Equity stakes and other investments for Category 15. Your share of each investee's Scope 1+2 is calculated when you import the plan."
      primaryAction={editable ? { label: "Add investment", icon: <Plus size={16} aria-hidden />, onClick: () => setEditing(null) } : undefined}
      secondaryActions={editable && rows.length ? [{ label: "Create Category 15 plan", onClick: () => setPlanning(true) }] : undefined}
    />
  );

  if (!ready)
    return (
      <div className="space-y-6">
        {header}
        <Callout tone="warn" title="Pick a client first">
          Choose a client with the switcher at the top; investments are kept per client.
        </Callout>
      </div>
    );

  const boundaryLink = (
    <Link to="/settings/scope3" className={cn(focusRing, "rounded-control text-sm font-medium text-brand underline-offset-2 hover:underline")}>
      Not relevant? Confirm it on Scope 3 boundary
    </Link>
  );

  return (
    <div className="space-y-6">
      {header}

      <section className={cn(panel, "flex flex-wrap items-end gap-4 p-4")} aria-label="Register settings">
        <Select<number>
          className="w-40"
          label="Year"
          value={year}
          options={years.map((y) => ({ value: y, label: String(y) }))}
          onChange={(v) => setParam("year", v ? String(v) : null)}
          loading={list.isLoading}
        />
        <NumberField
          className="w-44"
          label="Threshold"
          unit="%"
          value={threshold}
          onChange={(v) => setParam("threshold", v === null ? null : String(v))}
          min={0}
          max={100}
          step={0.1}
        />
        <p className="max-w-md text-sm text-muted" data-testid="threshold-note">
          {threshold
            ? `Stakes under ${fmt(threshold)} % are listed here but left out of the plan. Disclose the threshold in your report.`
            : "No threshold: every equity investment is planned. You may leave out small stakes if you disclose the threshold."}
        </p>
      </section>

      {!editable && list.data && <Callout tone="info">You can read the register. An Admin or Superadmin changes it.</Callout>}
      {small.length > 0 && (
        <Callout tone="info" title={`${small.length} ${small.length === 1 ? "investment is" : "investments are"} below your threshold`}>
          {small.map((i) => i.investee).join(", ")}
        </Callout>
      )}

      <DataTable<Investment>
        label={`Investments for ${year}`}
        rows={rows}
        columns={COLUMNS}
        getRowId={(i) => i.id}
        loading={list.isLoading}
        error={list.isError ? errorMessage(list.error, "Couldn't load the investments.") : null}
        onRetry={() => list.refetch()}
        onRowClick={(i) => setEditing(i)}
        defaultSort={{ id: "investee", dir: "asc" }}
        exportName={`investments-${year}`}
        empty={
          <EmptyState
            title={all.length ? `No investments for ${year}.` : "No investments yet."}
            description={boundaryLink}
            action={editable ? <Button onClick={() => setEditing(null)}>Add investment</Button> : undefined}
          />
        }
      />

      {editing !== undefined && (
        <InvestmentDrawer
          key={editing?.id ?? "new"}
          open
          investment={editing}
          companyId={companyId}
          defaultYear={year}
          editable={editable}
          onClose={() => setEditing(undefined)}
          onSaved={(name, created) => {
            toast({ title: created ? `${name} added` : `${name} saved`, tone: "good" });
            setEditing(undefined);
          }}
        />
      )}

      {planning && (
        <PlanDrawer
          open
          companyId={companyId}
          investments={rows}
          defaultYear={year}
          threshold={threshold}
          onClose={() => setPlanning(false)}
          onImported={(n) => {
            toast({ title: `${n} ${n === 1 ? "row" : "rows"} imported as Pending`, tone: "good" });
            setPlanning(false);
          }}
        />
      )}
    </div>
  );
}
