import { Link } from "react-router-dom";
import { Callout, NumberField, Select, Skeleton, cn, focusRing, panel } from "../../../ui";
import { ALLOCATION_KEYS, type AllocationKey, type AllocationPreview, fmtKg } from "../logic";

export type KeyValues = { key_value_product: number | null; key_value_site_total: number | null };

type Props = {
  allocationKey: AllocationKey;
  onKeyChange: (key: AllocationKey) => void;
  keyValues: KeyValues;
  onKeyValues: (kv: KeyValues) => void;
  preview: AllocationPreview | undefined;
  loading: boolean;
  error: string | null;
  /** Saving the key; the table reloads after. */
  saving: boolean;
  unitLabel: string;
  productionLink: string;
};

const fmtT = (v: number) => v.toLocaleString("en-GB", { maximumFractionDigits: 3 });
const fmtPct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("en-GB", { maximumFractionDigits: 2 })}%`);

/** Step 4: the site's approved Scope 1+2 for the period, allocated to the product. Read-only; edits happen in Approvals. */
export function EnergyStep({ allocationKey, onKeyChange, keyValues, onKeyValues, preview, loading, error, saving, unitLabel, productionLink }: Props) {
  const key = ALLOCATION_KEYS.find((k) => k.value === allocationKey) ?? ALLOCATION_KEYS[0];
  const manual = allocationKey === "manual";
  return (
    <section aria-labelledby="energy-title" className={`${panel} space-y-4 p-4 sm:p-6`}>
      <div>
        <h2 id="energy-title" className="text-base font-semibold text-ink">
          Plant energy (A3)
        </h2>
        <p className="mt-1 text-sm text-muted">
          From the site's approved Scope 1 and 2 data for the period, nothing typed twice. To change a figure, fix the entry in{" "}
          <Link to="/data/approvals" className={cn("text-accent underline", focusRing)}>
            Approvals
          </Link>
          .
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,240px)_1fr]">
        <Select<AllocationKey>
          label="Allocation key"
          value={allocationKey}
          options={ALLOCATION_KEYS.map((k) => ({ value: k.value, label: k.label }))}
          onChange={(v) => v && onKeyChange(v)}
          help={key.help}
          loading={saving}
        />
        {allocationKey !== "mass" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label={manual ? "Product share" : "This product"}
              unit={manual ? "%" : undefined}
              value={keyValues.key_value_product}
              min={0}
              max={manual ? 100 : undefined}
              onChange={(v) => onKeyValues({ key_value_product: v, key_value_site_total: manual ? 100 : keyValues.key_value_site_total })}
              help="For the reference period. Not stored yet: enter it again after reloading."
            />
            {!manual && (
              <NumberField label="Whole site" value={keyValues.key_value_site_total} min={0} onChange={(v) => onKeyValues({ ...keyValues, key_value_site_total: v })} />
            )}
          </div>
        )}
      </div>

      {error && <Callout tone="warn" title="Couldn't load the plant data.">{error}</Callout>}
      {preview?.blockers.map((b) => (
        <Callout key={b} tone="warn" title="Plant energy can't be allocated yet.">
          {b}
        </Callout>
      ))}
      {preview?.warnings.map((w) => (
        <Callout key={w} tone="info">
          {w}
        </Callout>
      ))}

      {loading && !preview ? (
        <Skeleton className="h-40" />
      ) : preview && preview.sources.length > 0 ? (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Approved plant emissions allocated to this product</caption>
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-2 py-2">Category</th>
                <th scope="col" className="px-2 py-2">Scope</th>
                <th scope="col" className="px-2 py-2 text-right">Plant total tCO₂e</th>
                <th scope="col" className="px-2 py-2 text-right">Product share</th>
                <th scope="col" className="px-2 py-2 text-right">kg per {unitLabel}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {preview.sources.map((s) => (
                <tr key={s.category_name} className="border-b border-line last:border-0">
                  <td className="px-2 py-2 text-ink">{s.category_name}</td>
                  <td className="px-2 py-2 text-muted">Scope {s.scope}</td>
                  <td className="px-2 py-2 text-right">{fmtT(s.period_total_tco2e)}</td>
                  <td className="px-2 py-2 text-right">{fmtPct(s.share_pct)}</td>
                  <td className="px-2 py-2 text-right">{s.allocated_kg_per_unit == null ? "—" : fmtKg(s.allocated_kg_per_unit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-line font-medium tabular-nums">
              <tr>
                <th scope="row" colSpan={2} className="px-2 py-2 text-left">
                  Total
                </th>
                <td className="px-2 py-2 text-right">{fmtT(preview.plant_s1_s2_tco2e)}</td>
                <td className="px-2 py-2 text-right">{fmtPct(preview.share_pct)}</td>
                <td className="px-2 py-2 text-right">{preview.a3_energy_kg_per_unit == null ? "—" : fmtKg(preview.a3_energy_kg_per_unit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}

      {preview && (
        <p className="text-sm text-muted">
          Production used:{" "}
          {preview.product_output_units == null
            ? "none approved for this product in the period"
            : `${fmtT(preview.product_output_units)} × ${unitLabel}${preview.product_production_t != null ? ` (${fmtT(preview.product_production_t)} t)` : ""}`}
          .{" "}
          <Link to={productionLink} className={cn("text-accent underline", focusRing)}>
            Review production data
          </Link>
        </p>
      )}
    </section>
  );
}
