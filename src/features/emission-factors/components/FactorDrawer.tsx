import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button, Callout, Combobox, Drawer, Modal, NumberField, Select, TextField } from "../../../ui";
import { FACTOR_TYPES, FACTOR_TYPE_LABEL, GLOBAL_GEOGRAPHY, GWP_SETS, GWP_SET_LABEL } from "../../../lib/scope3/factor";
import type { Country } from "../api";
import {
  type Category,
  type DraftErrors,
  type DraftField,
  type Factor,
  type FactorDraft,
  type GasParts,
  type Site,
  categoriesFor,
  draftFrom,
  emptyDraft,
  gasSumHint,
  globalNameHint,
  gridFactorHint,
  isDirty,
  validate,
  yearHint,
  yearOptions,
} from "../logic";

const GAS_FIELDS: { key: keyof GasParts; label: string; unit: string }[] = [
  { key: "co2", label: "CO₂", unit: "kg" },
  { key: "ch4", label: "CH₄", unit: "kg" },
  { key: "n2o", label: "N₂O", unit: "kg" },
  { key: "other", label: "Other gases", unit: "kgCO₂e" },
  { key: "biogenic", label: "Biogenic CO₂", unit: "kg" },
];

type Props = {
  /** The factor being edited; null with `creating` for a new one. */
  row: Factor | null;
  creating: boolean;
  /** Site, category and year for a new factor (from the filters). */
  defaults: { siteId: number | null; categoryId: number | null; year: number | null };
  sites: { data: Site[]; loading: boolean };
  categories: { data: Category[]; loading: boolean };
  countries: { data: Country[]; loading: boolean };
  saving: boolean;
  /** Server error from the last save. */
  error: string | null;
  onClose: () => void;
  onSave: (draft: FactorDraft) => void;
  /** Clears the server error once the form changes. */
  onEdit: () => void;
  onDelete: () => void;
  /** N4: recalculate the saved entries this factor applies to. */
  onRecalculate?: () => void;
};

/** Add / edit one factor. Mount with a `key` per factor so each open starts from its saved values. */
export function FactorDrawer(props: Props) {
  const { row, creating } = props;
  const open = creating || !!row;
  const [draft, setDraft] = useState<FactorDraft>(() => (row ? draftFrom(row) : emptyDraft(props.defaults)));
  const [shown, setShown] = useState<DraftErrors>({});
  const [confirmClose, setConfirmClose] = useState(false);
  // Opens when the factor already has gas parts; after that the user decides, so clearing the last part doesn't collapse it.
  const [gasesOpen, setGasesOpen] = useState(() => Object.values(draft.gases).some((v) => v !== null));
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (props.error) errorRef.current?.focus();
  }, [props.error]);

  const siteOptions = useMemo(
    () =>
      [...props.sites.data]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => ({ value: s.site_id, label: s.company?.name ? `${s.name} · ${s.company.name}` : s.name })),
    [props.sites.data],
  );
  const categoryOptions = useMemo(() => {
    const list = categoriesFor(draft.siteId, props.sites.data, props.categories.data);
    // Keep a saved category selectable even if the site no longer reports it.
    if (draft.categoryId && !list.some((c) => c.category_id === draft.categoryId) && row?.category) list.unshift(row.category);
    return list.map((c) => ({ value: c.category_id, label: c.category_name }));
  }, [draft.siteId, draft.categoryId, props.sites.data, props.categories.data, row]);
  const years = useMemo(() => {
    const list = yearOptions();
    if (draft.year && !list.includes(draft.year)) list.push(draft.year);
    return list.map((y) => ({ value: y, label: String(y) }));
  }, [draft.year]);

  const geographyOptions = useMemo(() => {
    const list = [
      { value: GLOBAL_GEOGRAPHY, label: "Global" },
      ...props.countries.data
        .filter((c) => c.code)
        .map((c) => ({ value: c.code!.trim().toUpperCase(), label: `${c.name} (${c.code!.trim().toUpperCase()})` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
    // A saved region code that isn't a country stays selectable.
    if (draft.geography && !list.some((o) => o.value === draft.geography)) list.push({ value: draft.geography, label: draft.geography });
    return list;
  }, [props.countries.data, draft.geography]);

  if (!open) return <Drawer open={false} onClose={props.onClose} title="" />;

  const dirty = isDirty(draft, row);
  const set = <K extends keyof FactorDraft>(key: K, value: FactorDraft[K]) => {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      // A new site may not report the chosen category.
      if (key === "siteId" && next.categoryId) {
        const site = props.sites.data.find((s) => s.site_id === value);
        if (site && !(site.categories ?? []).some((c) => c.category_id === next.categoryId)) next.categoryId = null;
      }
      return next;
    });
    if (key in shown) setShown((e) => ({ ...e, [key as DraftField]: undefined }));
    props.onEdit();
  };
  const setGas = (key: keyof GasParts, value: number | null) => {
    setDraft((d) => ({ ...d, gases: { ...d.gases, [key]: value } }));
    if (key in shown) setShown((e) => ({ ...e, [key]: undefined }));
    props.onEdit();
  };
  const gasHint = gasSumHint(draft);
  const categoryName = categoryOptions.find((c) => c.value === draft.categoryId)?.label ?? null;
  const gridHint = gridFactorHint(categoryName, draft.value, draft.unit);
  const close = () => (dirty && !props.saving ? setConfirmClose(true) : props.onClose());
  const submit = () => {
    const errors = validate(draft);
    setShown(errors);
    if (Object.keys(errors).length === 0) props.onSave(draft);
  };
  const site = props.sites.data.find((s) => s.site_id === draft.siteId);
  const siteHasNoCategories = !!site && (site.categories ?? []).length === 0;

  return (
    <>
      <Drawer
        open
        size="sm"
        onClose={close}
        title={creating ? "Add factor" : "Edit factor"}
        subtitle={creating ? "One factor for a site, category and year." : [row!.site?.name, row!.category?.category_name, row!.year].filter(Boolean).join(" · ")}
        footer={
          <div className="flex w-full flex-wrap items-center gap-2">
            {!creating && (
              <Button variant="danger" onClick={props.onDelete} disabled={props.saving}>
                Delete factor
              </Button>
            )}
            {!creating && props.onRecalculate && (
              <Button onClick={props.onRecalculate} disabled={props.saving || dirty}>
                Recalculate entries
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button onClick={close} disabled={props.saving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submit} loading={props.saving} disabled={props.saving || (!creating && !dirty)}>
                {creating ? "Add factor" : "Save"}
              </Button>
            </div>
          </div>
        }
      >
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {props.error && (
            <div ref={errorRef} tabIndex={-1} className="focus:outline-none">
              <Callout tone="warn" title={creating ? "Couldn't add the factor" : "Couldn't save"}>
                {props.error}
              </Callout>
            </div>
          )}
          <Combobox<number>
            label="Site"
            required
            placeholder="Choose a site"
            value={draft.siteId}
            onChange={(v) => set("siteId", v)}
            options={siteOptions}
            loading={props.sites.loading}
            error={shown.siteId}
          />
          <Select<number>
            label="Category"
            required
            placeholder={draft.siteId ? "Choose a category" : "Choose a site first"}
            value={draft.categoryId}
            onChange={(v) => set("categoryId", v)}
            options={categoryOptions}
            loading={props.categories.loading}
            disabled={!draft.siteId}
            emptyText="This site reports no categories"
            error={shown.categoryId}
            help={siteHasNoCategories ? "Add categories to this site on the Sites page first." : "Only the categories this site reports."}
          />
          <TextField
            label="Emission category name"
            value={draft.name}
            onChange={(v) => set("name", v)}
            help="The fuel, material or activity, e.g. Diesel or Grid electricity. Leave blank for one factor per category."
            autoComplete="off"
          />
          <TextField
            label="Global name"
            value={draft.globalName}
            onChange={(v) => set("globalName", v)}
            help={
              globalNameHint(draft) ??
              "Leave blank to use the name above. Entries also find a factor by this name: for a T&D-loss factor, the electricity or heat choice it adds to."
            }
            autoComplete="off"
          />
          <Select<number>
            label="Year"
            required
            placeholder="Choose a year"
            value={draft.year}
            onChange={(v) => set("year", v)}
            options={years}
            error={shown.year}
            help={yearHint(draft.year)}
          />
          <NumberField label="Factor" required value={draft.value} onChange={(v) => set("value", v)} min={0} step={0.0001} error={shown.value} help="kgCO₂e per unit of activity, up to 8 decimals." />
          <TextField label="Unit" required value={draft.unit} onChange={(v) => set("unit", v)} error={shown.unit} help="The activity unit, e.g. litre, kWh, tonne. Saved in lowercase; for &quot;kg CO2e/kWh&quot; only kwh is kept." autoComplete="off" />
          {gridHint && (
            <Callout tone="warn" title="This looks 1,000 times too small">
              {gridHint}
            </Callout>
          )}
          <Select<string>
            label="Type"
            placeholder="Not set"
            value={draft.factorType}
            onChange={(v) => set("factorType", v as FactorDraft["factorType"])}
            // Spend-based needs a price base year and currency, which arrive with S3-5; until then it's
            // offered only to keep a factor that already has it.
            options={FACTOR_TYPES.filter((t) => t !== "eeio_spend" || row?.factor_type === "eeio_spend").map((t) => ({ value: t, label: FACTOR_TYPE_LABEL[t] }))}
            help="What the factor covers, e.g. direct combustion, well-to-tank or life cycle."
          />
          <Select<string>
            label="GWP set"
            placeholder="Not set"
            value={draft.gwpSet}
            onChange={(v) => set("gwpSet", v as FactorDraft["gwpSet"])}
            options={GWP_SETS.map((g) => ({ value: g, label: GWP_SET_LABEL[g] }))}
            help="The global warming potentials the factor's CO₂e uses."
          />
          <Combobox<string>
            label="Geography"
            placeholder="Search countries…"
            value={draft.geography}
            onChange={(v) => set("geography", v)}
            options={geographyOptions}
            loading={props.countries.loading}
            help="Where the factor applies. Global when it isn't country-specific."
          />
          <TextField label="Source" value={draft.source} onChange={(v) => set("source", v)} help="e.g. DEFRA 2024, IPCC AR6, supplier." autoComplete="off" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Dataset" value={draft.dataset} onChange={(v) => set("dataset", v)} help="e.g. DEFRA, IEA, USEEIO, ecoinvent." autoComplete="off" />
            <TextField label="Dataset version" value={draft.datasetVersion} onChange={(v) => set("datasetVersion", v)} help="e.g. 2025 or v3.10." autoComplete="off" />
          </div>
          <details className="group" open={gasesOpen} onToggle={(e) => setGasesOpen(e.currentTarget.open)}>
            <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-brand-text">
              <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
              Gas breakdown (optional)
            </summary>
            <div className="space-y-4 pt-3">
              <p className="text-sm text-muted">Per unit of activity. CH₄ and N₂O in kg of the gas; biogenic CO₂ is reported apart from the total.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {GAS_FIELDS.map((g) => (
                  <NumberField key={g.key} label={g.label} unit={g.unit} value={draft.gases[g.key]} onChange={(v) => setGas(g.key, v)} min={0} error={shown[g.key]} />
                ))}
              </div>
              {gasHint && (
                <Callout tone="warn" title="Parts don't add up">
                  {gasHint}
                </Callout>
              )}
            </div>
          </details>
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      </Drawer>
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Discard changes?"
        description="Your changes to this factor haven't been saved."
        cancelLabel="Keep editing"
        primaryAction={{
          label: "Discard",
          onClick: () => {
            setConfirmClose(false);
            props.onClose();
          },
        }}
      />
    </>
  );
}
