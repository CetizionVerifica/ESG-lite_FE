import { useState } from "react";
import type { SoldProduct, UseType } from "../../../../services/scope3SoldProductsService";
import { Button, Callout, Drawer, NumberField, Select, cn, formatNumber } from "../../../../ui";
import { errorMessage, useSaveUseProfile } from "../api";
import {
  type ProductDraft,
  TREATMENTS,
  TREATMENT_LABEL,
  USE_OPTIONS,
  USE_OPTION_LABEL,
  USE_TYPE_LABEL,
  draftErrors,
  eolEmpty,
  eolTotal,
  productDraft,
  toBody,
} from "../logic";

const USE_TYPE_OPTIONS = (Object.keys(USE_TYPE_LABEL) as UseType[]).map((t) => ({ value: t, label: USE_TYPE_LABEL[t] }));

export type ProductDrawerProps = {
  product: SoldProduct;
  companyId: number | null;
  onClose: () => void;
  onSaved: (name: string) => void;
};

/**
 * One product's data for the plans: lifetime uses and how it is used
 * (Category 11), packaging and end-of-life mix (Category 12). The mix total is
 * shown as it is typed and must be 100 % (or left blank).
 */
export function ProductDrawer({ product, companyId, onClose, onSaved }: ProductDrawerProps) {
  const [draft, setDraft] = useState<ProductDraft>(() => productDraft(product));
  const [tried, setTried] = useState(false);
  const save = useSaveUseProfile(companyId);
  const errors = draftErrors(draft);
  const shown = tried ? errors : {};
  const set = (patch: Partial<ProductDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const total = eolTotal(draft.eol);
  const mixOk = eolEmpty(draft.eol) || Math.abs(total - 100) < 1e-6;
  const t = draft.use_type;

  const onSave = () => {
    setTried(true);
    if (Object.keys(errors).length) return;
    save.mutate({ productId: product.product_id, body: toBody(draft) }, { onSuccess: () => onSaved(product.name) });
  };

  return (
    <Drawer
      open
      onClose={onClose}
      size="sm"
      title={product.name}
      subtitle={`${product.site_name} · ${product.mass_per_unit_kg ? `${formatNumber(product.mass_per_unit_kg, 3)} kg per ${product.unit || "unit"}` : "No mass per unit"}`}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {save.isError && (
            <p role="alert" className="mr-auto text-sm text-bad">
              {errorMessage(save.error, "The product wasn't saved. Try again.")}
            </p>
          )}
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSave} loading={save.isPending}>
            Save product
          </Button>
        </div>
      }
    >
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        {!product.mass_per_unit_kg && (
          <Callout tone="info">This product has no mass per unit, so sales in units can't be turned into kg for Categories 10 and 12. A Superadmin adds it on Setup, Products.</Callout>
        )}

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-ink">End of life (Category 12)</legend>
          <NumberField
            label="Packaging per unit"
            help="Thrown away with each unit; added to the end-of-life mass."
            unit="kg"
            value={draft.packaging_kg_per_unit}
            onChange={(v) => set({ packaging_kg_per_unit: v })}
            min={0}
            step={0.001}
          />
          <div className="grid grid-cols-2 gap-3">
            {TREATMENTS.map((tr) => (
              <NumberField
                key={tr}
                label={TREATMENT_LABEL[tr]}
                unit="%"
                value={draft.eol[tr]}
                onChange={(v) => set({ eol: { ...draft.eol, [tr]: v } })}
                min={0}
                max={100}
                step={1}
              />
            ))}
          </div>
          <p className={cn("text-sm", mixOk ? "text-muted" : "text-bad")} aria-live="polite" data-testid="eol-total">
            {eolEmpty(draft.eol) ? "No mix: the plan uses the average disposal factor." : `Total ${formatNumber(total, total % 1 ? 1 : 0)} % of 100 %`}
          </p>
          {shown.eol && (
            <p role="alert" className="text-sm text-bad">
              {shown.eol}
            </p>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-ink">Use (Category 11)</legend>
          <NumberField
            label="Lifetime uses"
            help="Uses over the product's life, e.g. washes, km or hours."
            value={draft.lifetime_uses}
            onChange={(v) => set({ lifetime_uses: v })}
            min={0}
          />
          <Select<UseType> label="How it is used" value={t} options={USE_TYPE_OPTIONS} onChange={(v) => set({ use_type: v, use_option: null })} placeholder="Not set" />
          {t && t !== "intermediate" && (
            <Select<string>
              label={USE_OPTION_LABEL[t]}
              value={draft.use_option}
              options={USE_OPTIONS[t].map((o) => ({ value: o, label: o }))}
              onChange={(v) => set({ use_option: v })}
              placeholder="Choose one"
              error={shown.use_option}
            />
          )}
          {t === "energy" && (
            <NumberField label="Energy per use" unit="kWh" value={draft.energy_per_use_kwh} onChange={(v) => set({ energy_per_use_kwh: v })} min={0} />
          )}
          {t === "gas" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField label="Gas per product" unit="kg" value={draft.gas_per_product_kg} onChange={(v) => set({ gas_per_product_kg: v })} min={0} />
              <NumberField
                label="Released over its life"
                help="100 % when unknown."
                unit="%"
                value={draft.gas_released_pct}
                onChange={(v) => set({ gas_released_pct: v })}
                min={0}
                max={100}
              />
            </div>
          )}
          {t === "intermediate" && (
            <NumberField
              label="Share of the final product"
              help="By mass, e.g. a 20 kg part in a 500 kg machine is 4 %. Lifetime uses are the final product's."
              unit="%"
              value={draft.final_product_share_pct}
              onChange={(v) => set({ final_product_share_pct: v })}
              min={0}
              max={100}
            />
          )}
          {t === "fuel" && <p className="text-xs text-muted">Each unit sold is burned once: units × the fuel's combustion factor.</p>}
        </fieldset>
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>
    </Drawer>
  );
}
