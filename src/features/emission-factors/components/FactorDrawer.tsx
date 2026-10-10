import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Callout, Combobox, Drawer, Modal, NumberField, Select, TextField } from "../../../ui";
import {
  type Category,
  type DraftErrors,
  type DraftField,
  type Factor,
  type FactorDraft,
  type Site,
  categoriesFor,
  draftFrom,
  emptyDraft,
  isDirty,
  validate,
  yearHint,
  yearOptions,
} from "../logic";

type Props = {
  /** The factor being edited; null with `creating` for a new one. */
  row: Factor | null;
  creating: boolean;
  /** Site, category and year for a new factor (from the filters). */
  defaults: { siteId: number | null; categoryId: number | null; year: number | null };
  sites: { data: Site[]; loading: boolean };
  categories: { data: Category[]; loading: boolean };
  saving: boolean;
  /** Server error from the last save. */
  error: string | null;
  onClose: () => void;
  onSave: (draft: FactorDraft) => void;
  /** Clears the server error once the form changes. */
  onEdit: () => void;
  onDelete: () => void;
};

/** Add / edit one factor. Mount with a `key` per factor so each open starts from its saved values. */
export function FactorDrawer(props: Props) {
  const { row, creating } = props;
  const open = creating || !!row;
  const [draft, setDraft] = useState<FactorDraft>(() => (row ? draftFrom(row) : emptyDraft(props.defaults)));
  const [shown, setShown] = useState<DraftErrors>({});
  const [confirmClose, setConfirmClose] = useState(false);
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
          <NumberField label="Factor" required value={draft.value} onChange={(v) => set("value", v)} min={0} step={0.0001} error={shown.value} help="Emissions per unit of activity, up to 4 decimals." />
          <TextField label="Unit" value={draft.unit} onChange={(v) => set("unit", v)} help="The activity unit, e.g. litre, kWh, tonne. Saved in lowercase; for &quot;kg CO2e/kWh&quot; only kwh is kept." autoComplete="off" />
          <TextField label="Source" value={draft.source} onChange={(v) => set("source", v)} help="e.g. DEFRA 2024, IPCC AR6, supplier." autoComplete="off" />
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
