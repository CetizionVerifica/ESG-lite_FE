import { SegmentedControl, TextField, Textarea, YearPicker, panel } from "../../../ui";
import { type ScopeFields, type Study, type YearType, periodFor, periodText, periodYear } from "../logic";

type Props = {
  study: Study;
  scope: ScopeFields;
  onChange: (patch: Partial<ScopeFields>) => void;
};

function ReadOnly({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-ink">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{value}</dd>
      {help && <dd className="mt-0.5 text-xs text-muted">{help}</dd>}
    </div>
  );
}

/** Step 1: what is footprinted, where, for which twelve months. */
export function ScopeStep({ study, scope, onChange }: Props) {
  const p = study.product;
  const year = periodYear(scope);
  const thisYear = new Date().getFullYear();
  const setPeriod = (yearType: YearType, y: number) => onChange({ year_type: yearType, ...periodFor(yearType, y) });
  const declared = p?.declared_unit ? `${p.declared_unit_qty ?? 1} ${p.declared_unit}` : "Not set";
  const mass = p?.mass_per_unit_kg != null ? `${p.mass_per_unit_kg.toLocaleString("en-GB")} kg per declared unit` : "Not set";

  return (
    <section aria-labelledby="scope-title" className={`${panel} space-y-6 p-4 sm:p-6`}>
      <div>
        <h2 id="scope-title" className="text-base font-semibold text-ink">
          Scope
        </h2>
        <p className="mt-1 text-sm text-muted">One declared unit of this product, made at this site, over twelve months.</p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <ReadOnly label="Product" value={p?.name ?? "—"} />
        <ReadOnly label="Producing site" value={study.site?.name ?? "—"} help="Plant energy (A3) comes from this site's approved data." />
        <ReadOnly
          label="Declared unit"
          value={declared}
          help={p?.declared_unit ? undefined : "Ask your admin to set it in Products; the footprint can't be calculated without it."}
        />
        <ReadOnly label="Mass per declared unit" value={mass} help="Converts production in tonnes to declared units. Set in Products." />
      </dl>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <SegmentedControl<YearType>
            label="Reference year type"
            options={[
              { value: "CY", label: "Calendar year" },
              { value: "FY", label: "Financial year" },
            ]}
            value={scope.year_type}
            onChange={(t) => setPeriod(t, year)}
          />
          <YearPicker
            label="Reference period"
            value={year}
            onChange={(y) => y && setPeriod(scope.year_type, y)}
            yearType={scope.year_type}
            from={thisYear - 8}
            to={thisYear}
            help={periodText(scope.year_type, year)}
          />
        </div>
        <dl className="grid gap-4">
          <ReadOnly label="Boundary" value="Cradle to gate" help="Cradle to grave comes in a later phase." />
          <ReadOnly label="Standard" value={study.standard === "iso14067" ? "ISO 14067" : study.standard} />
        </dl>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="PCR tag"
          value={scope.pcr_tag ?? ""}
          onChange={(v) => onChange({ pcr_tag: v || null })}
          placeholder="e.g. EN 15804"
          help="Optional product category rules this footprint follows."
          maxLength={120}
        />
        <Textarea label="Notes" value={scope.notes ?? ""} onChange={(v) => onChange({ notes: v || null })} rows={2} />
      </div>

      {study.parent_version_id && (
        <p className="text-sm text-muted">
          Version {study.version} was copied from an earlier version. Its lines came across, so check them for this period.
        </p>
      )}
    </section>
  );
}
