import { useState } from "react";
import { FileX, Plus } from "lucide-react";
import {
  Button,
  ColourField,
  Combobox,
  DateField,
  Drawer,
  EmptyState,
  Modal,
  MonthPicker,
  NumberField,
  STATUSES,
  Select,
  SkeletonChart,
  SkeletonKpi,
  SkeletonTableRows,
  SkeletonText,
  StatusPill,
  TextField,
  Textarea,
  Toggle,
  YearPicker,
  formatDelta,
  formatEmissions,
  formatIntensity,
  formatReportingYear,
  periodLabel,
} from "..";
import { DemoSection, Variant } from "./DemoSection";

const sites = [
  { value: 1, label: "Hidd smelter" },
  { value: 2, label: "Sitra rod mill" },
  { value: 3, label: "Askar office" },
];

export function ButtonsDemo() {
  return (
    <DemoSection id="button" title="Button">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<Plus aria-hidden className="size-4" />}>
          Add data
        </Button>
        <Button>Export</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="danger">Delete</Button>
        <Button variant="primary" loading>
          Saving
        </Button>
        <Button disabled>Disabled</Button>
      </div>
    </DemoSection>
  );
}

export function StatusPillDemo() {
  return (
    <DemoSection id="status-pill" title="StatusPill">
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <StatusPill key={s} status={s} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <StatusPill key={s} status={s} size="sm" />
        ))}
      </div>
    </DemoSection>
  );
}

export function FormatDemo() {
  const rows: Array<[string, string]> = [
    ["formatEmissions(12345.67)", formatEmissions(12345.67)],
    ["formatEmissions(12.46)", formatEmissions(12.46)],
    ["formatEmissions(0.42)", formatEmissions(0.42)],
    ["formatIntensity(1.234)", formatIntensity(1.234)],
    ["formatDelta(95.2, 100)", formatDelta(95.2, 100)?.text ?? ""],
    ["formatDelta(110, 100)", formatDelta(110, 100)?.text ?? ""],
    ["formatReportingYear(2025, 'FY')", formatReportingYear(2025, "FY")],
    ["periodLabel(2025-Q3)", periodLabel({ kind: "quarter", year: 2025, quarter: 3 })],
  ];
  return (
    <DemoSection id="format" title="format.ts">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-num text-muted">{k}</dt>
            <dd className="font-num text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </DemoSection>
  );
}

export function EmptyStateDemo() {
  return (
    <DemoSection id="empty-state" title="EmptyState">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-control border border-line">
          <EmptyState title="No entries for Sep 2025 yet." action={<Button variant="primary">Add data</Button>} />
        </div>
        <div className="rounded-control border border-line">
          <EmptyState
            variant="error"
            icon={FileX}
            title="Couldn't load entries."
            description="Check your connection and try again."
            action={<Button>Try again</Button>}
          />
        </div>
      </div>
    </DemoSection>
  );
}

export function SkeletonDemo() {
  return (
    <DemoSection id="skeleton" title="Skeleton">
      <div className="grid gap-6 md:grid-cols-2">
        <Variant label="Text">
          <SkeletonText />
        </Variant>
        <Variant label="KPI">
          <SkeletonKpi count={3} />
        </Variant>
        <Variant label="Table rows">
          <SkeletonTableRows rows={4} columns={4} />
        </Variant>
        <Variant label="Chart">
          <SkeletonChart className="h-32" />
        </Variant>
      </div>
    </DemoSection>
  );
}

export function OverlaysDemo() {
  const [modal, setModal] = useState<null | "confirm" | "destructive" | "error">(null);
  const [drawer, setDrawer] = useState<null | "content" | "loading" | "error">(null);
  const [name, setName] = useState("Q3 review");
  return (
    <DemoSection id="overlays" title="Modal and Drawer">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setModal("confirm")}>Short form modal</Button>
        <Button onClick={() => setModal("destructive")}>Destructive modal</Button>
        <Button onClick={() => setModal("error")}>Modal with error</Button>
        <Button onClick={() => setDrawer("content")}>Drawer</Button>
        <Button onClick={() => setDrawer("loading")}>Drawer loading</Button>
        <Button onClick={() => setDrawer("error")}>Drawer error</Button>
      </div>
      <Modal
        open={modal === "confirm" || modal === "error"}
        onClose={() => setModal(null)}
        title="Save view"
        description="Saved views appear in the filter bar."
        primaryAction={{ label: "Save", onClick: () => setModal(null) }}
        error={modal === "error" ? "Couldn't save the view. Try again." : undefined}
      >
        <TextField label="Name" value={name} onChange={setName} required />
      </Modal>
      <Modal
        open={modal === "destructive"}
        onClose={() => setModal(null)}
        tone="destructive"
        title="Delete this entry?"
        description="Electricity · Hidd smelter · Sep 2025. This can't be undone."
        primaryAction={{ label: "Delete entry", onClick: () => setModal(null) }}
      />
      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title="Electricity · Hidd smelter"
        subtitle="Sep 2025 · submitted by Fatima A."
        loading={drawer === "loading"}
        error={drawer === "error" ? "Couldn't load this entry." : null}
        onRetry={() => setDrawer("content")}
        footer={
          <>
            <Button>Reject</Button>
            <Button variant="primary">Approve</Button>
          </>
        }
      >
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Status</dt>
            <dd>
              <StatusPill status="pending" />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Quantity</dt>
            <dd className="font-num">48,200 kWh</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Emissions</dt>
            <dd className="font-num">{formatEmissions(31.4)}</dd>
          </div>
        </dl>
      </Drawer>
    </DemoSection>
  );
}

export function FieldsDemo() {
  const [text, setText] = useState("Bahrain Electricity & Water Authority");
  const [qty, setQty] = useState<number | null>(48200);
  const [site, setSite] = useState<number | null>(1);
  const [combo, setCombo] = useState<number | null>(2);
  const [date, setDate] = useState("2025-09-14");
  const [month, setMonth] = useState<string | null>("2025-09");
  const [year, setYear] = useState<number | null>(2025);
  const [notes, setNotes] = useState("");
  const [toggle, setToggle] = useState(true);
  const [colour, setColour] = useState("#1f2a44");
  return (
    <DemoSection id="fields" title="Field set">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <TextField label="Supplier" required help="As printed on the bill" value={text} onChange={setText} />
        <NumberField label="Quantity" unit="kWh" value={qty} onChange={setQty} step={100} required />
        <Select label="Site" value={site} onChange={setSite} options={sites} />
        <Combobox label="Category" value={combo} onChange={setCombo} options={sites} help="Type to search" />
        <DateField label="Bill date" value={date} onChange={setDate} />
        <MonthPicker label="Reporting month" value={month} onChange={setMonth} />
        <YearPicker label="Reporting year" value={year} onChange={setYear} yearType="FY" />
        <Toggle label="Notifications" checked={toggle} onChange={setToggle} inlineLabel={toggle ? "On" : "Off"} />
        <ColourField label="Primary colour" value={colour} onChange={setColour} />
        <Textarea label="Notes" value={notes} onChange={setNotes} placeholder="Optional" />
        <TextField label="Invoice number" value="" onChange={() => {}} error="Enter the invoice number" required />
        <Select label="Category" value={null} onChange={() => {}} options={[]} emptyText="Choose a site first" />
        <Select label="Unit" value={null} onChange={() => {}} options={sites} loading />
      </div>
    </DemoSection>
  );
}
