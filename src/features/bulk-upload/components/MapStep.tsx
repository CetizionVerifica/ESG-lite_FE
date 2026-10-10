import { Badge, Button, Callout, Select } from "../../../ui";
import { type MapField, canSkip, matchChip, unmapped } from "../logic";

const KIND_HELP: Partial<Record<MapField["kind"], string>> = {
  category: "Picks the emission factor for each row.",
  value: "The number the factor multiplies.",
  unit: "Converted to the factor's unit when they differ.",
  date: "Optional. Each row is filed in its own month.",
};

function Chip({ field }: { field: MapField }) {
  const chip = matchChip(field);
  if (chip === "matched") return <Badge tone="good">Matched</Badge>;
  if (chip === "check") return <Badge tone="warn">Check</Badge>;
  if (chip === "skipped") return <Badge>Skipped</Badge>;
  return null;
}

export function MapStep(props: {
  fileName: string;
  headers: string[];
  fields: MapField[];
  onHeader: (key: string, header: string | null) => void;
  onSkip: (key: string) => void;
  categories: { list: string[] | null; totalRows: number | null; loading: boolean; error: string | null; retry: () => void };
  selected: Set<string>;
  onToggleCategory: (name: string) => void;
  onToggleAll: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { fields, headers, categories, selected } = props;
  const missing = unmapped(fields);
  const options = headers.map((h) => ({ value: h, label: h }));
  const list = categories.list ?? [];
  const allOn = list.length > 0 && list.every((c) => selected.has(c));
  const canNext = missing.length === 0 && !!categories.list && (list.length === 0 || selected.size > 0);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Columns in <span className="font-medium text-ink">{props.fileName}</span> matched by name are marked Matched. Pick the column for anything marked Check, or skip optional fields.
      </p>

      <div className="divide-y divide-line rounded-card border border-line">
        {fields.map((f) => (
          <div key={f.key} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-center">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                {f.label}
                {f.required ? <span className="text-xs font-normal text-muted">Required</span> : <span className="text-xs font-normal text-muted">Optional</span>}
                <Chip field={f} />
              </p>
              {KIND_HELP[f.kind] && <p className="text-xs text-muted">{KIND_HELP[f.kind]}</p>}
            </div>
            <Select<string>
              label={`Sheet column for ${f.label}`}
              hideLabel
              placeholder={f.skipped ? "Skipped" : "Choose a column"}
              value={f.header}
              options={options}
              disabled={f.skipped}
              onChange={(v) => props.onHeader(f.key, v)}
            />
            {canSkip(f) ? (
              <Button size="sm" variant="ghost" aria-pressed={f.skipped} onClick={() => props.onSkip(f.key)}>
                {f.skipped ? "Use" : "Skip"}
              </Button>
            ) : (
              <span className="hidden w-14 sm:block" aria-hidden />
            )}
          </div>
        ))}
      </div>

      <section aria-labelledby="bulk-categories" className="space-y-2">
        <h2 id="bulk-categories" className="text-sm font-semibold text-ink">
          Categories in the sheet
        </h2>
        {!fields.find((f) => f.kind === "category")?.header ? (
          <p className="text-sm text-muted">Map the category column to see which categories the sheet holds.</p>
        ) : categories.loading ? (
          <p role="status" className="text-sm text-muted">Reading the categories in the sheet…</p>
        ) : categories.error ? (
          <Callout tone="warn" title="Couldn't read the categories" action={<Button size="sm" variant="ghost" onClick={categories.retry}>Try again</Button>}>
            {categories.error}
          </Callout>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted">The category column is empty in every row.</p>
        ) : (
          <>
            <p className="text-sm text-muted">
              {categories.totalRows ?? 0} rows, {list.length} {list.length === 1 ? "category" : "categories"}. Untick any you don't want to import.
            </p>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-2 rounded-chip border border-line px-2 py-1 text-sm font-medium">
                <input type="checkbox" checked={allOn} onChange={props.onToggleAll} className="accent-brand" />
                All
              </label>
              {list.map((c) => (
                <label key={c} className="inline-flex items-center gap-2 rounded-chip border border-line px-2 py-1 text-sm">
                  <input type="checkbox" checked={selected.has(c)} onChange={() => props.onToggleCategory(c)} className="accent-brand" />
                  {c}
                </label>
              ))}
            </div>
          </>
        )}
      </section>

      {missing.length > 0 && (
        <p className="text-sm text-muted" role="status">
          Still to map: {missing.map((f) => f.label).join(", ")}.
        </p>
      )}

      <div className="flex justify-between gap-3">
        <Button variant="secondary" onClick={props.onBack}>
          Back
        </Button>
        <Button variant="primary" disabled={!canNext} onClick={props.onNext}>
          Preview rows
        </Button>
      </div>
    </div>
  );
}
