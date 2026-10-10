import { type ReactNode, useId, useMemo, useState } from "react";
import {
  Button,
  Callout,
  Combobox,
  Drawer,
  EmptyState,
  Modal,
  StatusPill,
  TabPanel,
  Tabs,
  TextField,
  Textarea,
  formatDate,
  formatMonth,
  formatNumber,
} from "../../../ui";
import { errorMessage, useProductProduction } from "../api";
import {
  type AdminUnit,
  type DraftField,
  type Product,
  type ProductDraft,
  type SiteRef,
  changesUnitWithRecords,
  day,
  draftFrom,
  emptyDraft,
  isDirty,
  movesSite,
  pickableSites,
  quantity,
  recordCount,
  recordStatus,
  siteLabel,
  unitSuggestions,
  validate,
  wholeMonth,
} from "../logic";

export type ProductTab = "details" | "production" | "footprint";

type Props = {
  /** The product being edited; null with `creating` for a new one. */
  row: Product | null;
  creating: boolean;
  /** A linked product (?open=id) whose data is still loading. */
  loading?: boolean;
  /** Site for a new product (from the Site filter). */
  defaultSiteId: number | null;
  sites: { data: SiteRef[]; loading: boolean };
  /** Every product and the units list, for the unit suggestions. */
  products: Product[];
  units: AdminUnit[];
  saving: boolean;
  /** Server error from the last save. */
  error: string | null;
  onClose: () => void;
  onSave: (draft: ProductDraft) => void;
  onDelete: () => void;
  /**
   * Slot for the PCF specs (docs/pcf/): a "Footprint (PCF)" tab rendered for
   * an existing product. The tab is hidden until something fills it.
   */
  footprint?: (product: Product) => ReactNode;
};

/**
 * Create / edit drawer for one product: Details · Production · [Footprint (PCF)].
 * Mount with `key` per product so each one starts from its saved values.
 */
export function ProductDrawer(props: Props) {
  const { row, creating } = props;
  const open = creating || !!row;
  const [draft, setDraft] = useState<ProductDraft>(() => (row ? draftFrom(row) : emptyDraft(props.defaultSiteId)));
  const [tab, setTab] = useState<ProductTab>("details");
  const [touched, setTouched] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const idBase = useId();

  if (props.loading) return <Drawer open loading onClose={props.onClose} title="Loading product…" />;
  if (!open) return <Drawer open={false} onClose={props.onClose} title="" />;

  const errors = validate(draft);
  const invalid = Object.keys(errors).length > 0;
  const dirty = isDirty(draft, row);
  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const fieldError = (k: DraftField) => (touched ? errors[k] : undefined);

  const close = () => (dirty && !props.saving ? setConfirmClose(true) : props.onClose());
  const save = () => {
    setTouched(true);
    if (invalid) {
      setTab("details");
      return;
    }
    props.onSave(draft);
  };

  const tabs = [
    { value: "details" as const, label: "Details" },
    { value: "production" as const, label: "Production", disabled: creating, count: row?.production_count ?? undefined },
    ...(props.footprint && row ? [{ value: "footprint" as const, label: "Footprint (PCF)" }] : []),
  ];

  return (
    <>
      <Drawer
        open
        size="md"
        onClose={close}
        title={creating ? "Add product" : row!.name}
        subtitle={
          creating ? "Name it, choose the site that makes it and the unit its production is recorded in." : row!.site ? siteLabel(row!.site) : undefined
        }
        footer={
          <div className="flex w-full flex-wrap items-center gap-2">
            {!creating && (
              <Button variant="danger" onClick={props.onDelete} disabled={props.saving}>
                Delete product
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button onClick={close} disabled={props.saving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save} loading={props.saving} disabled={props.saving || (!creating && !dirty)}>
                {creating ? "Add product" : "Save"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {props.error && (
            // Focus lands here so the message is read; the Save button is busy.
            <div key={props.error} ref={(el) => el?.focus()} tabIndex={-1} className="focus:outline-none">
              <Callout tone="warn" title="Couldn't save the product">
                {props.error}
              </Callout>
            </div>
          )}
          {touched && invalid && tab !== "details" && (
            <Callout
              tone="warn"
              action={
                <Button size="sm" variant="ghost" onClick={() => setTab("details")}>
                  Go to details
                </Button>
              }
            >
              Some required details are missing.
            </Callout>
          )}
          <Tabs label="Product sections" idBase={idBase} items={tabs} value={tab} onChange={setTab} />
          <TabPanel idBase={idBase} value="details" current={tab}>
            <DetailsTab draft={draft} row={row} set={set} error={fieldError} sites={props.sites} products={props.products} units={props.units} />
          </TabPanel>
          {row && (
            <TabPanel idBase={idBase} value="production" current={tab}>
              <ProductionTab product={row} active={tab === "production"} />
            </TabPanel>
          )}
          {row && props.footprint && (
            <TabPanel idBase={idBase} value="footprint" current={tab}>
              {props.footprint(row)}
            </TabPanel>
          )}
        </div>
      </Drawer>
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Discard your changes?"
        description="Your edits to this product haven't been saved."
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

function DetailsTab({
  draft,
  row,
  set,
  error,
  sites,
  products,
  units,
}: {
  draft: ProductDraft;
  row: Product | null;
  set: <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => void;
  error: (k: DraftField) => string | undefined;
  sites: Props["sites"];
  products: Product[];
  units: AdminUnit[];
}) {
  const listId = useId();
  const suggestions = useMemo(() => unitSuggestions(products, units, draft.site_id), [products, units, draft.site_id]);
  const siteOptions = useMemo(
    () =>
      pickableSites(sites.data, row)
        .sort((a, b) => siteLabel(a).localeCompare(siteLabel(b)))
        .map((s) => ({ value: s.site_id, label: siteLabel(s) })),
    [sites.data, row],
  );
  const target = sites.data.find((s) => s.site_id === draft.site_id);
  // null: the backend didn't send a count, so records may exist.
  const records = row?.production_count ?? null;

  return (
    <div className="grid gap-4">
      <TextField label="Product name" required value={draft.name} onChange={(v) => set("name", v)} error={error("name")} maxLength={120} />
      <Combobox<number>
        label="Site"
        required
        placeholder="Search sites…"
        value={draft.site_id}
        onChange={(v) => set("site_id", v)}
        options={siteOptions}
        loading={sites.loading}
        error={error("site_id")}
        help={
          row
            ? "The site whose output this is. A product can move only to another site of the same client."
            : "The site whose output this is. Its production counts toward that site's emission intensity."
        }
      />
      {movesSite(draft, row) && (
        <Callout tone="warn" title={`Moving this product to ${target?.name ?? "another site"}`}>
          {records === 0 ? (
            <>It has no production records yet, so nothing else changes.</>
          ) : (
            <>
              {records === null ? "Its production records" : `Its ${recordCount(records)}`} move with it. Emission intensity and reports change for both{" "}
              {row!.site?.name ?? "the old site"} and {target?.name ?? "the new site"}, and product footprints that used these records are marked out of date.
            </>
          )}
        </Callout>
      )}
      <TextField
        label="Default unit"
        required
        value={draft.unit}
        onChange={(v) => set("unit", v)}
        error={error("unit")}
        list={listId}
        maxLength={40}
        autoComplete="off"
        help="Pre-filled when someone records production for this product. Pick a suggestion or type a new unit."
      />
      <datalist id={listId}>
        {suggestions.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      {changesUnitWithRecords(draft, row) && (
        <Callout tone="info">Records already entered keep the unit they were recorded in; only new records start from the new unit.</Callout>
      )}
      <Textarea label="Description" value={draft.description} onChange={(v) => set("description", v)} rows={3} maxLength={500} />
    </div>
  );
}

function ProductionTab({ product, active }: { product: Product; active: boolean }) {
  const q = useProductProduction(product.product_id, active);
  if (q.isPending) return <p className="text-sm text-muted">Loading production records…</p>;
  if (q.error)
    return (
      <EmptyState
        compact
        variant="error"
        title="Couldn't load production records."
        description={errorMessage(q.error, "Try again in a moment.")}
        action={
          <Button size="sm" onClick={() => void q.refetch()}>
            Try again
          </Button>
        }
      />
    );
  const { total, records } = q.data;
  if (!records.length)
    return <EmptyState compact title="No production recorded yet." description="Site users record production for this product each period." />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {total > records.length ? `The latest ${records.length} of ${recordCount(total)}, newest period first.` : `${recordCount(total)}, newest period first.`}{" "}
        Records are entered and reviewed on the site's production pages.
      </p>
      <ul className="divide-y divide-line rounded-control border border-line">
        {records.map((r) => {
          const month = wholeMonth(r.start_date, r.end_date);
          const status = recordStatus(r.status);
          const qty = quantity(r);
          return (
            <li key={r.production_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">
                  {month ? formatMonth(month) : `${formatDate(day(r.start_date))} – ${formatDate(day(r.end_date))}`}
                </span>
                {r.site && r.site.site_id !== product.site?.site_id && <span className="block text-xs text-muted">{r.site.name}</span>}
              </span>
              <span className="font-num text-ink">
                {qty === null ? "—" : formatNumber(qty, qty % 1 ? 2 : 0)} <span className="text-muted">{r.unit}</span>
              </span>
              {status ? <StatusPill status={status} size="sm" /> : <span className="text-xs text-muted">{r.status}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
