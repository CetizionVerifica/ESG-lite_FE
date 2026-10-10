import { useState } from "react";
import { Download, Plus } from "lucide-react";
import {
  Button,
  ContextChips,
  DataTable,
  Drawer,
  PageHeader,
  StatusPill,
  emissionsParts,
  formatEmissions,
  formatMonth,
  useContextParams,
  periodLabel,
  type Column,
  type Status,
} from "..";
import { DemoSection, Variant } from "./DemoSection";

type Entry = { id: number; site: string; category: string; month: string; quantity: number; unit: string; tonnes: number; status: Status };

const SITES = ["Hidd smelter", "Sitra rod mill", "Askar office"];
const CATS = ["Electricity", "Natural gas", "Diesel", "Business travel"];
const STATUSES: Status[] = ["approved", "pending", "rejected", "approved", "missing", "draft"];

// Deterministic sample data so snapshots are stable.
const ENTRIES: Entry[] = Array.from({ length: 42 }, (_, i) => ({
  id: i + 1,
  site: SITES[i % 3],
  category: CATS[i % 4],
  month: `2025-${String((i % 9) + 1).padStart(2, "0")}`,
  quantity: ((i * 7919) % 90000) + 120,
  unit: i % 4 === 0 ? "kWh" : i % 4 === 1 ? "m³" : i % 4 === 2 ? "L" : "km",
  tonnes: (((i * 7919) % 90000) + 120) / (i % 4 === 0 ? 1500 : 900),
  status: STATUSES[i % 6],
}));

const columns: Column<Entry>[] = [
  { id: "site", header: "Site", value: (r) => r.site, sortable: true, hideable: false },
  { id: "category", header: "Category", value: (r) => r.category, sortable: true },
  { id: "month", header: "Month", value: (r) => r.month, cell: (r) => formatMonth(r.month), exportValue: (r) => formatMonth(r.month), sortable: true },
  { id: "quantity", header: "Quantity", value: (r) => r.quantity, numeric: true, sortable: true, cell: (r) => `${r.quantity.toLocaleString("en-US")} ${r.unit}` },
  {
    id: "tonnes",
    header: "Emissions",
    value: (r) => r.tonnes,
    numeric: true,
    sortable: true,
    cell: (r) => {
      const p = emissionsParts(r.tonnes);
      return (
        <>
          {p.value} <span className="text-xs text-muted">{p.unit}</span>
        </>
      );
    },
  },
  { id: "status", header: "Status", value: (r) => r.status, sortable: true, cell: (r) => <StatusPill status={r.status} size="sm" /> },
];

export function PageHeaderDemo() {
  const [ctx] = useContextParams();
  return (
    <DemoSection id="page-header" title="PageHeader and ContextChips">
      <PageHeader
        title="Approvals"
        description="Review what your team submitted."
        primaryAction={{ label: "Add data", onClick: () => {}, icon: <Plus aria-hidden className="size-4" /> }}
        secondaryActions={[{ label: "Export", onClick: () => {}, icon: <Download aria-hidden className="size-4" /> }]}
        context={
          <ContextChips
            chips={["period", "site", "category", "scope"]}
            sites={SITES.map((label, i) => ({ value: i + 1, label }))}
            categories={CATS.map((label, i) => ({ value: i + 1, label }))}
            defaults={{ period: { kind: "month", year: 2025, month: 9 } }}
          />
        }
      />
      <p className="font-num text-xs text-muted">
        URL context: {ctx.period ? periodLabel(ctx.period) : "default"} · sites [{ctx.siteIds.join(", ")}] · category {ctx.categoryId ?? "all"} · scope{" "}
        {ctx.scope ?? "all"}
      </p>
      <Variant label="Loading">
        <PageHeader title="" loading primaryAction={{ label: "Edit", onClick: () => {} }} />
      </Variant>
    </DemoSection>
  );
}

export function DataTableDemo() {
  const [open, setOpen] = useState<Entry | null>(null);
  return (
    <DemoSection id="data-table" title="DataTable">
      <DataTable
        label="Entries"
        rows={ENTRIES}
        columns={columns}
        getRowId={(r) => r.id}
        selectable
        defaultSort={{ id: "tonnes", dir: "desc" }}
        bulkActions={(sel, clear) => (
          <>
            <Button size="sm" onClick={clear}>
              Reject {sel.length}
            </Button>
            <Button size="sm" variant="primary" onClick={clear}>
              Approve {sel.length}
            </Button>
          </>
        )}
        onRowClick={setOpen}
        exportName="entries-demo"
        pagination={{ mode: "client", pageSize: 10 }}
        maxHeight="24rem"
      />
      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? `${open.category} · ${open.site}` : ""}
        subtitle={open ? formatMonth(open.month) : undefined}
      >
        {open && (
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Status</dt>
              <dd>
                <StatusPill status={open.status} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Emissions</dt>
              <dd className="font-num">{formatEmissions(open.tonnes)}</dd>
            </div>
          </dl>
        )}
      </Drawer>
      <div className="grid gap-4 lg:grid-cols-3">
        <Variant label="Loading">
          <DataTable label="Loading" rows={[]} columns={columns.slice(0, 3)} getRowId={(r) => r.id} loading pagination={{ mode: "client", pageSize: 4 }} />
        </Variant>
        <Variant label="Empty">
          <DataTable label="Empty" rows={[]} columns={columns.slice(0, 3)} getRowId={(r) => r.id} />
        </Variant>
        <Variant label="Error">
          <DataTable label="Error" rows={[]} columns={columns.slice(0, 3)} getRowId={(r) => r.id} error="Couldn't load entries." onRetry={() => {}} />
        </Variant>
      </div>
    </DemoSection>
  );
}
