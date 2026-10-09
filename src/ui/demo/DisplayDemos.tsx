import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Callout,
  ChartFrame,
  FilterBar,
  KpiStrip,
  Menu,
  ScopeBar,
  SegmentedControl,
  TabPanel,
  Tabs,
  Tooltip,
  useFilterParams,
  useToast,
} from "..";
import { DemoSection, Variant } from "./DemoSection";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
const S1 = [410, 395, 420, 380, 402, 415, 398, 405, 371];
const S2 = [620, 600, 640, 655, 690, 720, 740, 731, 702];
const S3 = [210, 190, 230, 220, 215, 240, 260, 250, 244];

export function KpiDemo() {
  return (
    <DemoSection id="kpi-strip" title="KpiStrip and ScopeBar">
      <KpiStrip
        items={[
          { label: "Total emissions · Sep 2025", value: 1317.4, previous: 1386, format: "emissions", compareLabel: "vs Aug 2025", primary: true },
          { label: "Scope 1", value: 371, previous: 405, format: "emissions", compareLabel: "vs Aug" },
          { label: "Scope 2", value: 702, previous: 731, format: "emissions", compareLabel: "vs Aug" },
          { label: "Intensity", value: 0.84, previous: 0.8, unit: "tCO₂e/t", decimals: 2, compareLabel: "vs Aug" },
          { label: "Data completeness", value: 92, format: "percent", decimals: 0, hint: "11 of 12 sites" },
        ]}
      />
      <ScopeBar totals={{ scope1: 371, scope2: 702, scope3: 244 }} />
      <div className="grid gap-4 md:grid-cols-2">
        <Variant label="Loading">
          <KpiStrip items={[]} loading />
        </Variant>
        <Variant label="Error">
          <KpiStrip items={[]} error="Couldn't load figures." onRetry={() => {}} />
        </Variant>
        <Variant label="ScopeBar loading">
          <ScopeBar totals={null} loading />
        </Variant>
        <Variant label="ScopeBar empty">
          <ScopeBar totals={{ scope1: 0, scope2: 0, scope3: 0 }} />
        </Variant>
      </div>
    </DemoSection>
  );
}

export function ChartDemo() {
  const [stack, setStack] = useState<"stacked" | "grouped">("stacked");
  const series = (name: string, data: number[], color: string) => ({
    name,
    type: "bar" as const,
    data,
    stack: stack === "stacked" ? "s" : undefined,
    itemStyle: { color },
  });
  return (
    <DemoSection id="chart-frame" title="ChartFrame">
      <ChartFrame
        title="Emissions by month"
        unit="tCO₂e"
        subtitle="CY 2025 · all sites"
        exportName="emissions-by-month"
        actions={
          <SegmentedControl
            size="sm"
            label="Bar layout"
            value={stack}
            onChange={setStack}
            options={[
              { value: "stacked", label: "Stacked" },
              { value: "grouped", label: "Grouped" },
            ]}
          />
        }
        option={(t) => ({
          animation: false,
          grid: { left: 48, right: 16, top: 36, bottom: 28 },
          legend: { top: 0, left: 0 },
          tooltip: { trigger: "axis" },
          xAxis: { type: "category", data: MONTHS },
          yAxis: { type: "value" },
          series: [series("Scope 1", S1, t.scopes.s1), series("Scope 2", S2, t.scopes.s2), series("Scope 3", S3, t.scopes.s3)],
        })}
        table={{
          columns: [
            { id: "month", header: "Month" },
            { id: "s1", header: "Scope 1", numeric: true },
            { id: "s2", header: "Scope 2", numeric: true },
            { id: "s3", header: "Scope 3", numeric: true },
          ],
          rows: MONTHS.map((m, i) => ({ month: `${m} 2025`, s1: S1[i], s2: S2[i], s3: S3[i] })),
        }}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <ChartFrame title="Loading" option={{}} loading height={160} />
        <ChartFrame title="Empty" option={{}} empty height={160} />
        <ChartFrame title="Error" option={{}} error="Couldn't load the chart." onRetry={() => {}} height={160} />
      </div>
    </DemoSection>
  );
}

export function FeedbackDemo() {
  const { toast } = useToast();
  return (
    <DemoSection id="callout" title="Callout and Toast">
      <div className="grid gap-3 md:grid-cols-3">
        <Callout tone="info" title="Bills from BEWA arrive mid-month.">
          Enter September electricity once the bill is in.
        </Callout>
        <Callout tone="warn" title="3 sites haven't reported Sep 2025." action={<Button size="sm">Send reminder</Button>} onDismiss={() => {}} />
        <Callout tone="brand" title="Scope 2 fell 4% after the solar PPA.">
          Hidd smelter now draws 18% of its power from the PPA.
        </Callout>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => toast({ title: "Entry approved", tone: "good" })}>Toast</Button>
        <Button onClick={() => toast({ title: "Entry deleted", description: "Electricity · Sep 2025", action: { label: "Undo", onClick: () => {} } })}>
          Toast with undo
        </Button>
        <Button onClick={() => toast({ title: "Couldn't save the entry.", tone: "bad" })}>Error toast</Button>
      </div>
    </DemoSection>
  );
}

export function PrimitivesDemo() {
  const [tab, setTab] = useState<"details" | "history" | "files">("details");
  const [view, setView] = useState<"month" | "year">("month");
  return (
    <DemoSection id="primitives" title="Tabs, SegmentedControl, Tooltip, Menu, Avatar, Badge">
      <div>
        <Tabs
          label="Entry"
          idBase="demo-tabs"
          value={tab}
          onChange={setTab}
          items={[
            { value: "details", label: "Details" },
            { value: "history", label: "History", count: 4 },
            { value: "files", label: "Files", count: 2 },
          ]}
        />
        {(["details", "history", "files"] as const).map((t) => (
          <TabPanel key={t} idBase="demo-tabs" value={t} current={tab} className="pt-3 text-sm text-muted">
            {t === "details" ? "Quantity, unit and emission factor." : t === "history" ? "Four changes since submission." : "invoice-sep.pdf, meter.jpg"}
          </TabPanel>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <SegmentedControl
          label="Period view"
          value={view}
          onChange={setView}
          options={[
            { value: "month", label: "Monthly" },
            { value: "year", label: "Yearly" },
          ]}
        />
        <Tooltip content="Download all visible rows">
          <Button size="sm">Hover or focus me</Button>
        </Tooltip>
        <Menu
          trigger={(p) => (
            <Button size="sm" variant="ghost" aria-label="Row actions" {...p}>
              <MoreHorizontal aria-hidden className="size-4" />
            </Button>
          )}
          items={[
            { label: "Edit", onSelect: () => {}, icon: <Pencil aria-hidden className="size-4" /> },
            { label: "Duplicate", onSelect: () => {}, disabled: true },
            { label: "Delete", onSelect: () => {}, danger: true, icon: <Trash2 aria-hidden className="size-4" /> },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name="Fatima Al-Sayed" size="sm" />
        <Avatar name="Rahul Menon" />
        <Avatar name="ops@midal.com" size="lg" />
        <Badge>Draft</Badge>
        <Badge tone="brand">New</Badge>
        <Badge tone="info">AI</Badge>
        <Badge tone="good">12</Badge>
        <Badge tone="warn">3 overdue</Badge>
        <Badge tone="bad">2 rejected</Badge>
      </div>
    </DemoSection>
  );
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];
const SUBMITTER_OPTIONS = [
  { value: "12", label: "Aisha Rahman" },
  { value: "15", label: "Omar Haddad" },
  { value: "21", label: "Priya Nair" },
];
const SOURCE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "bill", label: "From a bill" },
  { value: "upload", label: "Bulk upload" },
];

export function FilterBarDemo() {
  const [value, setValue] = useFilterParams(["status", "submitter", "source"]);
  return (
    <DemoSection id="filter-bar" title="FilterBar">
      <FilterBar
        storageKey="ui-demo"
        searchPlaceholder="Search entries"
        value={value}
        onChange={setValue}
        filters={[
          { key: "status", label: "Status", options: STATUS_OPTIONS },
          { key: "submitter", label: "Submitted by", options: SUBMITTER_OPTIONS },
          { key: "source", label: "Source", options: SOURCE_OPTIONS, multiple: false },
        ]}
      />
      <Variant label="Loading options">
        <FilterBar value={value} onChange={() => {}} loading search={false} filters={[{ key: "submitter", label: "Submitted by", options: [] }]} />
      </Variant>
    </DemoSection>
  );
}
