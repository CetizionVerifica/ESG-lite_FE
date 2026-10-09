import { useMemo, useState } from "react";
import {
  AuditTimeline,
  Button,
  CommandPalette,
  DocumentViewer,
  FileDrop,
  PoweredBy,
  Stepper,
  UnitInput,
  filterPalette,
  type FileDropItem,
  type PaletteCommand,
  type UnitInputValue,
  type ViewerFile,
} from "..";
import type { AuditLogEntry } from "../../services/auditLogService";
import { DemoSection, Variant } from "./DemoSection";

const STEPS = [
  { id: "source", label: "Source", description: "Bill, sheet or by hand" },
  { id: "details", label: "Details", description: "Quantities and units" },
  { id: "review", label: "Review", description: "Check and submit" },
];

// Built-in sample so the gallery works offline: an SVG "bill" as a data URL.
const SAMPLE_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="white"/>' +
      '<text x="40" y="80" font-family="sans-serif" font-size="32">Electricity bill</text>' +
      '<text x="40" y="140" font-family="monospace" font-size="20">Sep 2025 · 48,200 kWh</text></svg>',
  );
const VIEWER_FILES: ViewerFile[] = [
  { name: "bewa-sep-2025.svg", url: SAMPLE_SVG, type: "image/svg+xml", size: 18_432, meta: "Uploaded by Fatima Al-Sayed" },
  { name: "meter-readings.csv", url: "data:text/csv,month,kwh", type: "text/csv", size: 1_024 },
];

const sampleFile = (name: string, type: string, size: number) => new File([new Uint8Array(size)], name, { type });

const AUDIT: AuditLogEntry[] = [
  {
    id: 2,
    entity_type: "emission",
    entity_id: 41,
    action: "approved",
    changed_fields: { status: { old: "pending", new: "approved" } },
    changed_by: { user_id: 3, name: "Rahul Menon", email: "rahul@example.com", role: "manager" },
    changed_at: "2025-10-02T11:20:00",
  },
  {
    id: 1,
    entity_type: "emission",
    entity_id: 41,
    action: "manager_edit",
    changed_fields: { activity_data: { old: { quantity: 46800, unit: "kWh" }, new: { quantity: 48200, unit: "kWh" } } },
    reason: "Meter re-read on 30 Sep.",
    changed_by: { user_id: 3, name: "Rahul Menon", email: "rahul@example.com", role: "manager" },
    changed_at: "2025-10-01T16:05:00",
  },
];

const COMMANDS: PaletteCommand[] = [
  { id: "r:/my-month", label: "My month", group: "Pages", keywords: "home" },
  { id: "r:/add-data", label: "Add data", group: "Pages", keywords: "entry bill" },
  { id: "r:/approvals", label: "Approvals", group: "Data", keywords: "review pending" },
  { id: "r:/reports/ghg", label: "GHG report", group: "Reports", keywords: "inventory" },
];
const SITES: PaletteCommand[] = [
  { id: "site:1", label: "Hidd smelter", group: "Sites", hint: "Site", keywords: "bahrain" },
  { id: "site:2", label: "Sitra rod mill", group: "Sites", hint: "Site" },
];

export function FlowsDemo() {
  const [step, setStep] = useState(1);
  const [unit, setUnit] = useState<UnitInputValue>({ value: 48.2, unit: "mwh" });
  const initialItems = useMemo<FileDropItem[]>(
    () => [
      { id: "a", file: sampleFile("bewa-sep-2025.pdf", "application/pdf", 482_000), status: "done" },
      { id: "b", file: sampleFile("meter.jpg", "image/jpeg", 1_200_000), status: "uploading", progress: 62 },
      { id: "c", file: sampleFile("old-bill.pdf", "application/pdf", 90_000), status: "error", error: "Upload failed. Try again." },
    ],
    [],
  );
  const [items, setItems] = useState(initialItems);
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState("");

  return (
    <DemoSection id="flows" title="Stepper, UnitInput, FileDrop, DocumentViewer, AuditTimeline, CommandPalette, PoweredBy">
      <Stepper steps={STEPS} current={step} completed={STEPS.slice(0, step).map((s) => s.id)} onStepChange={setStep} />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <UnitInput label="Electricity used" required value={unit} onChange={setUnit} units={["kwh", "mwh", "gj"]} expectedUnit="kwh" />
          <UnitInput label="Diesel" value={{ value: 120, unit: "kg" }} onChange={() => {}} units={["kg", "litre"]} expectedUnit="litre" />
          <FileDrop
            label="Upload the bill"
            help="PDF or photo, up to 10 MB"
            accept={["application/pdf", "image/*"]}
            maxSize={10 * 1024 * 1024}
            items={items}
            onAdd={(files) => setItems((xs) => [...xs, ...files.map((file, i) => ({ id: `${Date.now()}-${i}`, file, status: "done" as const }))])}
            onRemove={(id) => setItems((xs) => xs.filter((x) => x.id !== id))}
            onPreview={() => setViewer(VIEWER_FILES[0])}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setViewer(VIEWER_FILES[0])}>Open document viewer</Button>
            <Button onClick={() => setPalette(true)}>Open command palette</Button>
          </div>
        </div>
        <Variant label="AuditTimeline">
          <AuditTimeline entries={AUDIT} />
        </Variant>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex items-center justify-center rounded-card border border-line p-4">
          <PoweredBy />
        </div>
        <div className="flex items-center justify-center rounded-card bg-linear-to-r from-cover-from to-cover-to p-4">
          <PoweredBy onDark size="md" />
        </div>
      </div>
      <DocumentViewer open={!!viewer} file={viewer} files={VIEWER_FILES} onNavigate={setViewer} onClose={() => setViewer(null)} />
      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        commands={COMMANDS}
        recent={["r:/approvals"]}
        results={query ? filterPalette(SITES, query) : []}
        onQueryChange={setQuery}
        onRun={() => setPalette(false)}
      />
    </DemoSection>
  );
}
