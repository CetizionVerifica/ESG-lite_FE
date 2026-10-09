import { CheckCircle2, CircleDashed, Flag, XCircle, type LucideIcon } from "lucide-react";
import { type Column, DataTable, TabPanel, Tabs, cn, formatNumber, formatPercent } from "../../../ui";
import { type ActualRow, type ActualStatus, type PathwayRow, type ScopeRow, type TabId, type TargetModel, statusWord } from "../logic";
import { ScopeChart } from "./ScopeChart";

const ID = "targets-tabs";

const t3 = (v: number | null) => formatNumber(v, 3);
const pct = (v: number | null) => formatPercent(v, 2);

const base = (r: { n: number; year: number }) => (
  <span className="inline-flex items-center gap-1.5">
    {r.year}
    {r.n === 0 && <span className="rounded-chip bg-tint px-1.5 py-0.5 text-[11px] font-medium text-brand-text">Base</span>}
  </span>
);

const pathwayColumns: Column<PathwayRow>[] = [
  { id: "year", header: "Year", value: (r) => r.year, cell: base, hideable: false },
  { id: "n", header: "N", value: (r) => r.n, numeric: true },
  { id: "target", header: "Target (tCO₂e)", value: (r) => r.target, numeric: true, decimals: 3 },
  { id: "reduced", header: "Reduction (tCO₂e)", value: (r) => r.reducedBy, cell: (r) => t3(r.reducedBy), numeric: true },
  { id: "yoy", header: "YoY %", value: (r) => r.reducedByPct, cell: (r) => pct(r.reducedByPct), numeric: true },
  { id: "total", header: "Total reduction %", value: (r) => r.totalReductionPct, cell: (r) => pct(r.totalReductionPct), numeric: true },
];

function scopeColumns(s3: boolean): Column<ScopeRow>[] {
  return [
    { id: "year", header: "Year", value: (r) => r.year, cell: base, hideable: false },
    { id: "n", header: "N", value: (r) => r.n, numeric: true },
    { id: "s1", header: "Scope 1 (tCO₂e)", value: (r) => r.s1, numeric: true, decimals: 3 },
    { id: "s2", header: "Scope 2 (tCO₂e)", value: (r) => r.s2, numeric: true, decimals: 3 },
    ...(s3 ? [{ id: "s3", header: "Scope 3 (tCO₂e)", value: (r: ScopeRow) => r.s3, cell: (r: ScopeRow) => t3(r.s3), numeric: true }] : []),
    { id: "target", header: "Target (tCO₂e)", value: (r) => r.target, numeric: true, decimals: 3 },
    { id: "reduced", header: "Reduction (tCO₂e)", value: (r) => r.reducedBy, cell: (r) => t3(r.reducedBy), numeric: true },
    { id: "yoy", header: "YoY %", value: (r) => r.reducedByPct, cell: (r) => pct(r.reducedByPct), numeric: true },
    { id: "total", header: "Total reduction %", value: (r) => r.totalReductionPct, cell: (r) => pct(r.totalReductionPct), numeric: true },
  ];
}

const STATUS: Record<ActualStatus, { icon: LucideIcon; className: string }> = {
  base: { icon: Flag, className: "bg-info-soft text-info" },
  reached: { icon: CheckCircle2, className: "bg-good-soft text-good" },
  "not-reached": { icon: XCircle, className: "bg-bad-soft text-bad" },
  "no-data": { icon: CircleDashed, className: "border border-dashed border-line text-muted" },
};

/** Reached / Not reached / No data, in fixed status colours with an icon. */
export function TargetStatus({ status }: { status: ActualStatus }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", s.className)}>
      <Icon aria-hidden className="size-3.5" />
      {statusWord(status)}
    </span>
  );
}

function signed(v: number | null, fmt: (v: number | null) => string) {
  if (v === null) return "—";
  return (
    <span className={v > 0 ? "text-bad" : v < 0 ? "text-good" : undefined}>
      {v > 0 ? "+" : ""}
      {fmt(v)}
    </span>
  );
}

function actualColumns(s3: boolean): Column<ActualRow>[] {
  return [
    { id: "year", header: "Year", value: (r) => r.year, hideable: false },
    { id: "s1", header: "Actual scope 1", value: (r) => r.s1, cell: (r) => t3(r.s1), numeric: true },
    { id: "s2", header: "Actual scope 2", value: (r) => r.s2, cell: (r) => t3(r.s2), numeric: true },
    ...(s3 ? [{ id: "s3", header: "Actual scope 3", value: (r: ActualRow) => r.s3, cell: (r: ActualRow) => t3(r.s3), numeric: true }] : []),
    { id: "actual", header: s3 ? "Actual total (S1+S2+S3)" : "Actual total (S1+S2)", value: (r) => r.actual, cell: (r) => t3(r.actual), numeric: true },
    { id: "target", header: "Target (tCO₂e)", value: (r) => r.target, numeric: true, decimals: 3 },
    { id: "variance", header: "Variance (tCO₂e)", value: (r) => r.variance, cell: (r) => signed(r.variance, t3), numeric: true },
    { id: "variancePct", header: "Variance %", value: (r) => r.variancePct, cell: (r) => signed(r.variancePct, pct), numeric: true },
    { id: "status", header: "Status", value: (r) => statusWord(r.status), cell: (r) => <TargetStatus status={r.status} /> },
  ];
}

/** Pathway table · Scope-wise · Actual vs target. */
export function TargetTabs({ model, tab, onTab }: { model: TargetModel; tab: TabId; onTab: (t: TabId) => void }) {
  const s3 = model.scope3Required;
  const name = `${model.kind === "near" ? "near-term" : "net-zero"}-${model.baseYear}-${model.targetYear}`;
  return (
    <section className="space-y-4">
      <Tabs<TabId>
        label="Target tables"
        idBase={ID}
        value={tab}
        onChange={onTab}
        items={[
          { value: "pathway", label: "Pathway table" },
          { value: "scopes", label: "Scope-wise" },
          { value: "actual", label: "Actual vs target" },
        ]}
      />
      <TabPanel idBase={ID} value="pathway" current={tab}>
        <DataTable label="Target pathway" rows={model.pathway} columns={pathwayColumns} getRowId={(r) => r.year} exportName={`targets-pathway-${name}`} />
      </TabPanel>
      <TabPanel idBase={ID} value="scopes" current={tab} className="space-y-4">
        <ScopeChart model={model} />
        <DataTable label="Scope-wise target pathway" rows={model.scopes} columns={scopeColumns(s3)} getRowId={(r) => r.year} exportName={`targets-scopes-${name}`} />
      </TabPanel>
      <TabPanel idBase={ID} value="actual" current={tab}>
        <p className="mb-2 text-xs text-muted">Comparing {s3 ? "Scope 1 + 2 + 3" : "Scope 1 + 2 only"} with the pathway. Approved entries only.</p>
        <DataTable
          label="Actual emissions against the target"
          rows={model.actual}
          columns={actualColumns(s3)}
          getRowId={(r) => r.year}
          exportName={`targets-actual-${name}`}
          empty={<p className="p-6 text-center text-sm text-muted">No years to compare yet.</p>}
        />
      </TabPanel>
    </section>
  );
}
