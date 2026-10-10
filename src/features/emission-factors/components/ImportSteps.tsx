import { FileSpreadsheet, RefreshCw, Sparkles } from "lucide-react";
import {
  Badge,
  type BadgeTone,
  Button,
  Callout,
  type Column,
  DataTable,
  EmptyState,
  FileDrop,
  Select,
  TextField,
  cn,
  focusRing,
  inputBase,
} from "../../../ui";
import {
  type CategoryMap,
  type Columns,
  type ImportRow,
  type JobResult,
  type ParseResult,
  SHEET_ACCEPT,
  SHEET_MAX,
  type UploadPlan,
  detectedColumns,
  groupsOf,
  needsValueColumn,
  parseFactor,
  rowProblem,
  suggestionFor,
  totals,
} from "../importLogic";
import { type Company, type Site, layoutLabel } from "../logic";

export type Mode = "simple" | "ai";
type Opt<V extends string | number> = { value: V; label: string };

// ---------------------------------------------------------------------------
// 1 · Upload
// ---------------------------------------------------------------------------

export function UploadStep(props: {
  mode: Mode;
  onMode: (m: Mode) => void;
  file: File | null;
  onFile: (f: File | null) => void;
  companies: Company[];
  clientId: number | null;
  onClient: (id: number | null) => void;
  clientSites: Site[];
  target: string | null;
  onTarget: (v: string | null) => void;
  targetError?: string;
  error: string | null;
}) {
  const clientName = props.companies.find((c) => c.company_id === props.clientId)?.name;
  const modeCard = (m: Mode, icon: React.ReactNode, title: string, text: string) => (
    <label className={cn("flex cursor-pointer gap-3 rounded-control border p-3", props.mode === m ? "border-accent bg-tint" : "border-line")}>
      <input type="radio" name="ef-mode" checked={props.mode === m} onChange={() => props.onMode(m)} className={cn("mt-0.5 size-4 accent-brand", focusRing)} />
      <span>
        <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
          {icon} {title}
        </span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
    </label>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select<number>
          label="Client"
          placeholder="Any client"
          value={props.clientId}
          onChange={props.onClient}
          options={[...props.companies].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.company_id, label: c.name }))}
        />
        <Select<string>
          label="Save to"
          required
          placeholder="Choose a site"
          value={props.target}
          onChange={props.onTarget}
          options={[
            ...(props.clientId ? [{ value: `client:${props.clientId}`, label: `All sites of ${clientName ?? "this client"}` }] : []),
            ...props.clientSites.map((s) => ({ value: String(s.site_id), label: props.clientId ? s.name : `${s.name} · ${s.company?.name ?? ""}` })),
          ]}
          error={props.targetError}
          help="All sites of a client only gets factors where the site reports the category."
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-ink">What kind of sheet is it?</legend>
        {modeCard(
          "simple",
          <FileSpreadsheet aria-hidden className="size-4" />,
          "Simple sheet",
          "One row per factor with columns year, factor_value, unit, source and emission_category_name. Read in your browser.",
        )}
        {modeCard(
          "ai",
          <Sparkles aria-hidden className="size-4" />,
          "Any other layout (AI read)",
          "DEFRA-style workbooks with sub-columns, groups or several sheets. AI finds the layout and suggests categories; you check both.",
        )}
      </fieldset>
      <FileDrop
        label="Sheet"
        help=".xlsx or .xls, up to 10 MB."
        accept={SHEET_ACCEPT}
        maxSize={SHEET_MAX}
        multiple={false}
        items={props.file ? [{ id: "sheet", file: props.file }] : []}
        onAdd={(f) => props.onFile(f[0] ?? null)}
        onRemove={() => props.onFile(null)}
      />
      {props.error && (
        <Callout tone="warn" title="Couldn't read the sheet">
          {props.error}
        </Callout>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2 · Check layout (AI)
// ---------------------------------------------------------------------------

function AiChip() {
  return (
    <Badge tone="brand">
      <Sparkles aria-hidden className="mr-1 inline size-3" />
      AI detected
    </Badge>
  );
}

export function LayoutStep(props: {
  parse: ParseResult;
  sheet: string | null;
  onSheet: (s: string) => void;
  columns: Columns;
  onColumns: (c: Columns) => void;
  busy: boolean;
  error: string | null;
  onReAnalyze: () => void;
}) {
  const { parse } = props;
  const detected = detectedColumns(parse.schema_detected);
  const options: Opt<number>[] = parse.available_columns.map((c) => ({
    value: c.column_index,
    label: c.sample_values[0] ? `${c.header_name} (e.g. ${c.sample_values[0]})` : c.header_name,
  }));
  const field = (key: keyof Columns, label: string, required: boolean, help?: string) => (
    <div className="flex items-end gap-2">
      <Select<number>
        label={label}
        required={required}
        placeholder={required ? "Choose a column" : "None"}
        value={props.columns[key]}
        onChange={(v) => props.onColumns({ ...props.columns, [key]: v })}
        options={options}
        help={help}
        className="min-w-0 flex-1"
      />
      {props.columns[key] !== null && props.columns[key] === detected[key] && (
        <span className="pb-2">
          <AiChip />
        </span>
      )}
    </div>
  );
  const perYear = !needsValueColumn(parse.schema_detected);
  return (
    <div className="space-y-4">
      {parse.sheet_names.length > 1 && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink">Sheet</legend>
          <div className="flex flex-wrap gap-2">
            {parse.sheet_names.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={name === props.sheet}
                disabled={props.busy}
                onClick={() => name !== props.sheet && props.onSheet(name)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm",
                  name === props.sheet ? "border-accent bg-tint font-medium text-ink" : "border-line text-muted hover:bg-tint",
                  focusRing,
                )}
              >
                {name}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <p className="text-sm text-ink" data-testid="ef-layout">
        Layout: <span className="font-medium">{layoutLabel(parse.schema_detected.layout_type)}</span>
        <span className="text-muted">
          {" "}
          · {parse.factors.length} {parse.factors.length === 1 ? "factor" : "factors"} · years {parse.available_years.join(", ") || "—"}
        </span>
      </p>
      {parse.warnings.length > 0 && (
        <Callout tone="warn" title={`${parse.warnings.length} ${parse.warnings.length === 1 ? "note" : "notes"} from the AI read`}>
          <ul className="max-h-32 list-disc overflow-y-auto pl-5">
            {parse.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Callout>
      )}
      <div className="space-y-3 rounded-control border border-line p-3">
        {field("name", "Category name", true)}
        {perYear ? (
          <p className="text-sm text-muted">Factor values: one column per year (found by AI).</p>
        ) : (
          field("value", "Factor value", true)
        )}
        {field("unit", "Unit", false)}
        {field("source", "Source", false)}
      </div>
      {props.error && (
        <Callout tone="warn" title="Couldn't re-read the sheet">
          {props.error}
        </Callout>
      )}
      <Button onClick={props.onReAnalyze} loading={props.busy} disabled={props.busy} icon={<RefreshCw aria-hidden className="size-4" />}>
        Re-analyze
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3 · Map to categories (AI)
// ---------------------------------------------------------------------------

const CONFIDENCE: Record<string, BadgeTone> = { high: "good", medium: "warn", low: "neutral" };

export function MapStep(props: { parse: ParseResult; rows: ImportRow[]; map: CategoryMap; onMap: (m: CategoryMap) => void; categories: Opt<number>[]; error?: string }) {
  const groups = groupsOf(props.parse);
  const count = (g: string) => props.rows.filter((r) => (r.group ?? "") === g).length;
  const unmapped = groups.filter((g) => !props.map[g]);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {groups.length > 1 ? "Each group in the sheet becomes factors of one category. Groups left empty are skipped." : "Choose the category these factors belong to."}
      </p>
      <ul className="divide-y divide-line rounded-control border border-line">
        {groups.map((g) => {
          const s = suggestionFor(props.parse, g);
          return (
            <li key={g || "all"} className="grid gap-2 p-3 sm:grid-cols-[1fr_16rem] sm:items-end">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{g || "All rows"}</p>
                <p className="text-xs text-muted">
                  {count(g)} {count(g) === 1 ? "factor" : "factors"}
                  {s?.suggested_category_name && (
                    <>
                      {" "}
                      · AI suggests {s.suggested_category_name} <Badge tone={CONFIDENCE[s.confidence] ?? "neutral"}>{s.confidence} confidence</Badge>
                    </>
                  )}
                </p>
              </div>
              <Select<number>
                label={g ? `Category for ${g}` : "Category"}
                hideLabel={!!g}
                required={!g}
                placeholder={g ? "Skip this group" : "Choose a category"}
                value={props.map[g] ?? null}
                onChange={(v) => props.onMap({ ...props.map, [g]: v })}
                options={props.categories}
                emptyText="No categories for this target"
                error={!g ? props.error : undefined}
              />
            </li>
          );
        })}
      </ul>
      {groups.length > 1 && unmapped.length > 0 && (
        <Callout tone="warn" title={`${unmapped.length} ${unmapped.length === 1 ? "group is" : "groups are"} skipped`}>
          {unmapped.join(", ")}
        </Callout>
      )}
      {groups.length > 1 && props.error && (
        <p role="alert" className="text-sm text-bad">
          {props.error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4 · Preview
// ---------------------------------------------------------------------------

export function PreviewStep(props: {
  rows: ImportRow[];
  shown: ImportRow[];
  update: (key: string, patch: Partial<ImportRow>) => void;
  /** Includes or excludes every row the filters show. */
  setExcluded: (keys: string[], excluded: boolean) => void;
  filter: { group: string | null; year: number | null; q: string };
  onFilter: (f: { group: string | null; year: number | null; q: string }) => void;
  groups: string[];
  years: number[];
  /** Simple path: the one category, chosen here. */
  category?: { value: number | null; onChange: (v: number | null) => void; options: Opt<number>[]; error?: string };
  parseErrors: string[];
  plan: UploadPlan | null;
  saveError: string | null;
}) {
  const { update } = props;
  const invalid = props.rows.filter((r) => !r.excluded && rowProblem(r));
  const shownKeys = props.shown.map((r) => r.key);
  const shownExcluded = props.shown.filter((r) => r.excluded).length;
  const numberCell = (r: ImportRow, field: "year" | "factor_value", label: string) => (
    <input
      type="text"
      inputMode="decimal"
      aria-label={`${label}, row ${r.key.slice(1)}`}
      defaultValue={Number.isFinite(r[field]) ? String(r[field]) : ""}
      disabled={r.excluded}
      onBlur={(e) => {
        const n = field === "year" ? parseInt(e.target.value, 10) : parseFactor(e.target.value);
        update(r.key, { [field]: Number.isFinite(n) ? n : NaN });
      }}
      className={cn(inputBase, "h-8 w-24 px-2 font-num", focusRing)}
    />
  );
  const textCell = (r: ImportRow, field: "emission_category_name" | "denominator_unit" | "source", label: string, width: string) => (
    <input
      type="text"
      aria-label={`${label}, row ${r.key.slice(1)}`}
      value={r[field]}
      disabled={r.excluded}
      onChange={(e) => update(r.key, { [field]: e.target.value })}
      className={cn(inputBase, "h-8 px-2", width, focusRing)}
    />
  );
  const columns: Column<ImportRow>[] = [
    {
      id: "include",
      header: "Include",
      hideable: false,
      width: "4.5rem",
      value: (r) => (r.excluded ? "No" : "Yes"),
      cell: (r) => (
        <input
          type="checkbox"
          aria-label={`Include row ${r.key.slice(1)}`}
          checked={!r.excluded}
          onChange={(e) => update(r.key, { excluded: !e.target.checked })}
          className={cn("size-4 accent-brand", focusRing)}
        />
      ),
    },
    ...(props.groups.length > 1 ? [{ id: "group", header: "Group", value: (r: ImportRow) => r.group ?? "" } satisfies Column<ImportRow>] : []),
    { id: "name", header: "Emission category name", hideable: false, value: (r) => r.emission_category_name, cell: (r) => textCell(r, "emission_category_name", "Name", "w-48") },
    { id: "year", header: "Year", hideable: false, value: (r) => r.year, cell: (r) => numberCell(r, "year", "Year") },
    { id: "factor", header: "Factor", hideable: false, value: (r) => r.factor_value, cell: (r) => numberCell(r, "factor_value", "Factor") },
    { id: "unit", header: "Unit", value: (r) => r.denominator_unit, cell: (r) => textCell(r, "denominator_unit", "Unit", "w-24") },
    { id: "source", header: "Source", value: (r) => r.source, cell: (r) => textCell(r, "source", "Source", "w-36") },
    {
      id: "problem",
      header: "",
      hideable: false,
      width: "8rem",
      value: (r) => (r.excluded ? null : rowProblem(r)),
      cell: (r) => {
        const p = r.excluded ? null : rowProblem(r);
        return p ? <span className="text-xs text-bad">{p}</span> : null;
      },
    },
  ];
  return (
    <div className="space-y-4">
      {props.category && (
        <Select<number>
          label="Category"
          required
          placeholder="Choose a category"
          value={props.category.value}
          onChange={props.category.onChange}
          options={props.category.options}
          emptyText="This site reports no categories"
          error={props.category.error}
          className="sm:max-w-xs"
        />
      )}
      {props.parseErrors.length > 0 && (
        <Callout tone="warn" title={`${props.parseErrors.length} ${props.parseErrors.length === 1 ? "row was" : "rows were"} left out`}>
          <ul className="list-disc pl-5">
            {props.parseErrors.slice(0, 5).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {props.parseErrors.length > 5 && <li>and {props.parseErrors.length - 5} more.</li>}
          </ul>
        </Callout>
      )}
      {props.plan && props.plan.notAssigned.length > 0 && (
        <Callout tone="info" title="Some sites don't report these categories">
          Skipped: {props.plan.notAssigned.map((n) => `${n.site} (${n.category})`).join(", ")}.
        </Callout>
      )}
      {props.saveError && (
        <Callout tone="warn" title="Nothing was saved">
          {props.saveError}
        </Callout>
      )}
      <div className="flex flex-wrap items-end gap-3">
        {props.groups.length > 1 && (
          <Select<string>
            label="Group"
            placeholder="All groups"
            value={props.filter.group}
            onChange={(v) => props.onFilter({ ...props.filter, group: v })}
            options={props.groups.map((g) => ({ value: g, label: g }))}
            className="w-48"
          />
        )}
        <Select<number>
          label="Year"
          placeholder="All years"
          value={props.filter.year}
          onChange={(v) => props.onFilter({ ...props.filter, year: v })}
          options={props.years.map((y) => ({ value: y, label: String(y) }))}
          className="w-36"
        />
        <TextField label="Search rows" value={props.filter.q} onChange={(v) => props.onFilter({ ...props.filter, q: v })} className="w-60" />
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={shownExcluded === shownKeys.length} onClick={() => props.setExcluded(shownKeys, true)}>
            Exclude all shown
          </Button>
          <Button size="sm" variant="secondary" disabled={shownExcluded === 0} onClick={() => props.setExcluded(shownKeys, false)}>
            Include all shown
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted">Every included row is saved, whatever the filters show. Factors that already exist for the same site, category, year and name are skipped.</p>
      <DataTable<ImportRow>
        label="Rows to import"
        rows={props.shown}
        columns={columns}
        getRowId={(r) => r.key}
        rowLabel={(r) => r.emission_category_name || `Row ${r.key.slice(1)}`}
        empty={<EmptyState icon={FileSpreadsheet} title="No rows match." />}
        pagination={{ mode: "client", pageSize: 50 }}
        maxHeight="50vh"
      />
      {invalid.length > 0 && (
        <p role="alert" className="text-sm text-bad">
          Fix or exclude {invalid.length} {invalid.length === 1 ? "row" : "rows"} before saving.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5 · Result
// ---------------------------------------------------------------------------

export function ResultStep({ results, plan }: { results: JobResult[]; plan: UploadPlan | null }) {
  const sum = totals(results);
  return (
    <div className="space-y-4">
      <Callout tone={sum.failed ? "warn" : "brand"} title={`${sum.created} ${sum.created === 1 ? "factor" : "factors"} added, ${sum.skipped} skipped`}>
        {sum.skipped > 0 && "The reasons for skipped factors are listed under each site. "}
        {sum.failed > 0 && `${sum.failed} ${sum.failed === 1 ? "site" : "sites"} failed; the others were saved.`}
      </Callout>
      <ul className="divide-y divide-line rounded-control border border-line" aria-label="Saved per site">
        {results.map((r, i) => (
          <li key={`${r.siteId}-${r.categoryId}-${i}`} className="px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{r.site}</span>
              <span className="text-muted">{r.category}</span>
              <span className="ml-auto flex items-center gap-2">
                {r.error ? (
                  <Badge tone="bad">{r.error}</Badge>
                ) : (
                  <>
                    <Badge tone="good">{r.created} added</Badge>
                    {r.skipped > 0 && <Badge tone="neutral">{r.skipped} skipped</Badge>}
                  </>
                )}
              </span>
            </div>
            {r.problems.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs text-muted" aria-label={`Skipped at ${r.site}, ${r.category}`}>
                {r.problems.slice(0, 5).map((p, j) => (
                  <li key={j}>{p}</li>
                ))}
                {r.problems.length > 5 && <li>and {r.problems.length - 5} more.</li>}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {plan && plan.notAssigned.length > 0 && (
        <Callout tone="info" title="Not saved to these sites">
          They don't report the category: {plan.notAssigned.map((n) => `${n.site} (${n.category})`).join(", ")}. Add it to them on the Sites page, then import again.
        </Callout>
      )}
      {plan && plan.unmappedGroups.length > 0 && (
        <Callout tone="info" title="Groups skipped">
          No category was chosen for: {plan.unmappedGroups.join(", ")}.
        </Callout>
      )}
    </div>
  );
}
